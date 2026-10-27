'use strict';

// GateCart — agentic checkout with approval gates.
// Zero-dependency Node server (built-in http only).
//
//   node server.js          -> http://localhost:3737
//   PORT=8080 node server.js
//
// Payment mode (PAYPAL_MODE):
//   simulator  (default when no credentials) — local, labeled, no network
//   sandbox    — real PayPal sandbox via src/paypal.js (needs
//                PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET in env)

const http = require('http');
const fs = require('fs');
const path = require('path');

const { planPurchase } = require('./src/agent');
const { listScenarios } = require('./src/catalog');
const paypal = require('./src/paypal');
const simulator = require('./src/simulator');

const PORT = Number(process.env.PORT || 3737);
const PUBLIC_DIR = path.join(__dirname, 'public');

function resolveMode() {
  const requested = (process.env.PAYPAL_MODE || 'auto').toLowerCase();
  if (requested === 'sandbox') return 'sandbox';
  if (requested === 'simulator') return 'simulator';
  return paypal.hasCredentials() ? 'sandbox' : 'simulator';
}
const MODE = resolveMode();
const payments = MODE === 'sandbox' ? paypal : simulator;

const plans = new Map();   // planId -> plan (with status lifecycle)
const orders = new Map();  // orderId -> { planId, provider, status, approveUrl }

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj, null, 2);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch (e) { reject(new Error('Invalid JSON body')); }
    });
    req.on('error', reject);
  });
}

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png' };

function serveStatic(req, res) {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.join(PUBLIC_DIR, urlPath);
  if (!filePath.startsWith(PUBLIC_DIR) || !fs.existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('Not found');
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
}

async function handleApi(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean); // ['api', ...]

  if (req.method === 'GET' && url.pathname === '/api/health') {
    return sendJson(res, 200, { ok: true, app: 'GateCart', mode: MODE, time: new Date().toISOString() });
  }

  if (req.method === 'GET' && url.pathname === '/api/config') {
    return sendJson(res, 200, {
      mode: MODE,
      paypal: {
        credentialsPresent: paypal.hasCredentials(),
        apiBase: paypal.config().base,
        note: MODE === 'simulator'
          ? 'SIMULATOR MODE: orders are local simulations with SIM- ids. No PayPal systems are contacted and no money moves. Set PAYPAL_CLIENT_ID/SECRET + PAYPAL_MODE=sandbox for the real sandbox.'
          : 'SANDBOX MODE: orders are created against the real PayPal sandbox API.',
      },
    });
  }

  if (req.method === 'GET' && url.pathname === '/api/scenarios') {
    return sendJson(res, 200, { scenarios: listScenarios() });
  }

  // POST /api/plans — the agent proposes; nothing is ordered.
  if (req.method === 'POST' && url.pathname === '/api/plans') {
    const body = await readBody(req);
    try {
      const plan = planPurchase({
        scenarioId: body.scenarioId,
        scale: Number(body.scale),
        budget: Number(body.budget),
        priorities: Array.isArray(body.priorities) ? body.priorities : [],
      });
      plans.set(plan.id, plan);
      return sendJson(res, 201, { plan });
    } catch (e) {
      return sendJson(res, 400, { error: e.message });
    }
  }

  // POST /api/plans/:id/approve — THE approval gate.
  if (req.method === 'POST' && parts[1] === 'plans' && parts[3] === 'approve') {
    const plan = plans.get(parts[2]);
    if (!plan) return sendJson(res, 404, { error: 'Plan not found' });
    if (plan.status !== 'AWAITING_APPROVAL') return sendJson(res, 409, { error: `Plan is ${plan.status}, not AWAITING_APPROVAL` });
    const body = await readBody(req);
    const breached = plan.gates.filter((g) => g.status === 'breached');
    if (breached.length && body.override !== true) {
      return sendJson(res, 422, {
        error: `Gate breached: ${breached.map((g) => g.label).join(', ')}. Re-send with {"override": true} to explicitly override — the agent will not approve an over-budget plan on a plain click.`,
        gates: plan.gates,
      });
    }
    const attention = plan.gates.filter((g) => g.status === 'attention');
    if (attention.length && body.acknowledgeAttention !== true) {
      return sendJson(res, 422, {
        error: `Gate needs acknowledgement: ${attention.map((g) => g.label).join(', ')}. Re-send with {"acknowledgeAttention": true}.`,
        gates: plan.gates,
      });
    }
    plan.status = 'APPROVED';
    plan.approvedAt = new Date().toISOString();
    plan.approval = { override: Boolean(breached.length), acknowledgedAttention: attention.map((g) => g.id) };
    plan.gates = plan.gates.map((g) => (g.id === 'approval' ? { ...g, status: 'passed', detail: `Approved by a human at ${plan.approvedAt}${breached.length ? ' (budget override recorded)' : ''}.` } : g));
    return sendJson(res, 200, { plan });
  }

  // POST /api/plans/:id/reject
  if (req.method === 'POST' && parts[1] === 'plans' && parts[3] === 'reject') {
    const plan = plans.get(parts[2]);
    if (!plan) return sendJson(res, 404, { error: 'Plan not found' });
    plan.status = 'REJECTED';
    return sendJson(res, 200, { plan });
  }

  // POST /api/orders — only for APPROVED plans. Creates a PayPal (sandbox)
  // order or a labeled simulator order. No capture yet: the buyer still
  // has to approve on PayPal's side, exactly like real checkout.
  if (req.method === 'POST' && url.pathname === '/api/orders') {
    const body = await readBody(req);
    const plan = plans.get(body.planId);
    if (!plan) return sendJson(res, 404, { error: 'Plan not found' });
    if (plan.status !== 'APPROVED') {
      return sendJson(res, 409, { error: `Approval gate is closed: plan is ${plan.status}. A human must approve the plan before any order exists.` });
    }
    try {
      const order = await payments.createOrder(plan);
      orders.set(order.id, { planId: plan.id, provider: order.provider, status: order.status, approveUrl: order.approveUrl });
      plan.status = 'ORDER_CREATED';
      plan.orderId = order.id;
      return sendJson(res, 201, { order, plan });
    } catch (e) {
      return sendJson(res, 502, { error: e.message });
    }
  }

  // POST /api/orders/:id/simulate-approval — simulator mode only.
  if (req.method === 'POST' && parts[1] === 'orders' && parts[3] === 'simulate-approval') {
    if (MODE !== 'simulator') return sendJson(res, 400, { error: 'simulate-approval exists only in simulator mode. In sandbox mode the buyer approves via the PayPal approve URL.' });
    try {
      const order = await simulator.simulateApproval(parts[2]);
      const rec = orders.get(order.id);
      if (rec) rec.status = order.status;
      return sendJson(res, 200, { order });
    } catch (e) {
      return sendJson(res, 400, { error: e.message });
    }
  }

  // POST /api/orders/:id/capture
  if (req.method === 'POST' && parts[1] === 'orders' && parts[3] === 'capture') {
    try {
      const order = await payments.captureOrder(parts[2]);
      const rec = orders.get(order.id);
      if (rec) {
        rec.status = order.status;
        const plan = plans.get(rec.planId);
        if (plan && order.status === 'COMPLETED') plan.status = 'PAID';
      }
      return sendJson(res, 200, { order });
    } catch (e) {
      return sendJson(res, 400, { error: e.message });
    }
  }

  // GET /api/orders/:id
  if (req.method === 'GET' && parts[1] === 'orders' && parts[2]) {
    try {
      const order = await payments.getOrder(parts[2]);
      return sendJson(res, 200, { order });
    } catch (e) {
      return sendJson(res, 404, { error: e.message });
    }
  }

  return sendJson(res, 404, { error: 'Unknown API route' });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    if (req.method === 'GET') return serveStatic(req, res);
    res.writeHead(405); res.end('Method not allowed');
  } catch (e) {
    sendJson(res, 500, { error: e.message });
  }
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`GateCart running at http://localhost:${PORT} (payments mode: ${MODE})`);
    if (MODE === 'simulator') {
      console.log('SIMULATOR MODE: local simulated orders only (SIM- ids). No PayPal contact, no money moves.');
      console.log('For the real PayPal sandbox: set PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET and PAYPAL_MODE=sandbox.');
    }
  });
}

module.exports = { server, MODE };
