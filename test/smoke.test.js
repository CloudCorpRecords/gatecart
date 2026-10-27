'use strict';

// End-to-end smoke test in SIMULATOR mode: boots the real server on an
// ephemeral port and walks the whole GateCart flow over HTTP:
//   plan -> gate checks -> approve -> order -> buyer approval -> capture
// Run: npm test

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('path');

const PORT = 3917;
const BASE = `http://localhost:${PORT}`;
let child;

async function api(method, p, body) {
  const res = await fetch(`${BASE}${p}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function waitForHealth() {
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('server did not come up');
}

before(async () => {
  child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT: String(PORT), PAYPAL_MODE: 'simulator' },
    stdio: 'pipe',
  });
  await waitForHealth();
});

after(() => { if (child) child.kill(); });

test('health + config report simulator mode honestly', async () => {
  const health = await api('GET', '/api/health');
  assert.equal(health.status, 200);
  assert.equal(health.data.mode, 'simulator');
  const cfg = await api('GET', '/api/config');
  assert.equal(cfg.data.mode, 'simulator');
  assert.match(cfg.data.paypal.note, /SIMULATOR MODE/);
});

test('agent plans within budget and explains itself', async () => {
  const { status, data } = await api('POST', '/api/plans', {
    scenarioId: 'community-meetup', scale: 60, budget: 320, priorities: ['coffee'],
  });
  assert.equal(status, 201);
  const plan = data.plan;
  assert.equal(plan.status, 'AWAITING_APPROVAL');
  assert.ok(plan.total <= 320, `total ${plan.total} should be within budget`);
  // Gross cart was $413.50, so the agent must have value-engineered it down.
  assert.ok(plan.decisions.some((d) => d.type === 'substitute'), 'expected at least one explained substitution');
  assert.ok(plan.lines.length >= 5);
  assert.ok(plan.decisions.length >= 1);
  assert.equal(plan.gates.find((g) => g.id === 'approval').status, 'awaiting');
});

test('approval gate: order before approval is refused (409)', async () => {
  const { data } = await api('POST', '/api/plans', { scenarioId: 'cafe-restock', scale: 300, budget: 500 });
  const planId = data.plan.id;
  const order = await api('POST', '/api/orders', { planId });
  assert.equal(order.status, 409);
  assert.match(order.data.error, /Approval gate is closed/);
});

test('full flow: approve -> order -> simulate buyer approval -> capture COMPLETED', async () => {
  const { data } = await api('POST', '/api/plans', { scenarioId: 'cafe-restock', scale: 300, budget: 500 });
  const plan = data.plan;

  const approveBody = { override: false, acknowledgeAttention: true };
  const approved = await api('POST', `/api/plans/${plan.id}/approve`, approveBody);
  assert.equal(approved.status, 200);
  assert.equal(approved.data.plan.status, 'APPROVED');

  const created = await api('POST', '/api/orders', { planId: plan.id });
  assert.equal(created.status, 201);
  const order = created.data.order;
  assert.equal(order.provider, 'simulator');
  assert.match(order.id, /^SIM-/);
  assert.equal(order.status, 'CREATED');

  // Capture before buyer approval must fail — same rule as real PayPal.
  const earlyCapture = await api('POST', `/api/orders/${order.id}/capture`);
  assert.equal(earlyCapture.status, 400);
  assert.match(earlyCapture.data.error, /capture requires APPROVED/);

  const sim = await api('POST', `/api/orders/${order.id}/simulate-approval`);
  assert.equal(sim.status, 200);
  assert.equal(sim.data.order.status, 'APPROVED');

  const captured = await api('POST', `/api/orders/${order.id}/capture`);
  assert.equal(captured.status, 200);
  assert.equal(captured.data.order.status, 'COMPLETED');
  assert.equal(captured.data.order.raw.simulated, true);
});

test('budget gate: an impossible budget breaches and needs explicit override', async () => {
  const { data } = await api('POST', '/api/plans', { scenarioId: 'community-meetup', scale: 200, budget: 60 });
  const plan = data.plan;
  const budgetGate = plan.gates.find((g) => g.id === 'budget');
  assert.equal(budgetGate.status, 'breached');
  assert.ok(plan.total > 60);

  const plain = await api('POST', `/api/plans/${plan.id}/approve`, { override: false, acknowledgeAttention: true });
  assert.equal(plain.status, 422);
  assert.match(plain.data.error, /explicitly override/);

  const overridden = await api('POST', `/api/plans/${plan.id}/approve`, { override: true, acknowledgeAttention: true });
  assert.equal(overridden.status, 200);
  assert.equal(overridden.data.plan.approval.override, true);
});
