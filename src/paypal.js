'use strict';

// Real PayPal sandbox integration, written against the live
// PayPal REST API shape (Checkout Orders v2):
//   POST /v1/oauth2/token                  (client-credentials grant)
//   POST /v2/checkout/orders               (create order, intent CAPTURE)
//   POST /v2/checkout/orders/:id/capture   (capture after buyer approval)
//   GET  /v2/checkout/orders/:id           (read order)
//
// Credentials come from the environment only:
//   PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET
//   PAYPAL_API_BASE (default: https://api-m.sandbox.paypal.com)
// Get free sandbox credentials from a free developer account at
// https://developer.paypal.com — see README "Going live on the sandbox".
//
// This module is used only when PAYPAL_MODE=sandbox (or auto mode with
// credentials present). No real-money endpoint is ever the default:
// the default base URL is the sandbox host.

const DEFAULT_BASE = 'https://api-m.sandbox.paypal.com';

function config() {
  return {
    clientId: process.env.PAYPAL_CLIENT_ID || '',
    clientSecret: process.env.PAYPAL_CLIENT_SECRET || '',
    base: (process.env.PAYPAL_API_BASE || DEFAULT_BASE).replace(/\/$/, ''),
  };
}

function hasCredentials() {
  const c = config();
  return Boolean(c.clientId && c.clientSecret);
}

let tokenCache = { value: null, expiresAt: 0 };

async function accessToken() {
  const c = config();
  if (!c.clientId || !c.clientSecret) {
    throw new Error('PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET are not set. Create a free developer account at developer.paypal.com and copy the sandbox credentials into .env (see README).');
  }
  if (tokenCache.value && Date.now() < tokenCache.expiresAt) return tokenCache.value;

  const basic = Buffer.from(`${c.clientId}:${c.clientSecret}`).toString('base64');
  const res = await fetch(`${c.base}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PayPal OAuth failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  tokenCache = { value: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 };
  return tokenCache.value;
}

async function api(path, options = {}) {
  const c = config();
  const token = await accessToken();
  const res = await fetch(`${c.base}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* keep raw */ }
  if (!res.ok) {
    throw new Error(`PayPal API ${options.method || 'GET'} ${path} failed (${res.status}): ${text.slice(0, 300)}`);
  }
  return data;
}

// plan: a GateCart plan object from src/agent.js
async function createOrder(plan, { returnUrl, cancelUrl } = {}) {
  const items = plan.lines.map((l) => ({
    name: l.name.slice(0, 127),
    quantity: String(l.qty),
    unit_amount: { currency_code: plan.currency, value: l.unitPrice.toFixed(2) },
  }));
  const body = {
    intent: 'CAPTURE',
    purchase_units: [
      {
        reference_id: plan.id,
        description: `GateCart plan ${plan.id} — ${plan.scenarioLabel} (human-approved)`.slice(0, 127),
        amount: {
          currency_code: plan.currency,
          value: plan.total.toFixed(2),
          breakdown: {
            item_total: { currency_code: plan.currency, value: plan.total.toFixed(2) },
          },
        },
        items,
      },
    ],
    application_context: {
      brand_name: 'GateCart',
      user_action: 'PAY_NOW',
      return_url: returnUrl || 'http://localhost:3737/return',
      cancel_url: cancelUrl || 'http://localhost:3737/cancel',
    },
  };
  const order = await api('/v2/checkout/orders', { method: 'POST', body: JSON.stringify(body) });
  const approveLink = (order.links || []).find((l) => l.rel === 'approve');
  return {
    provider: 'paypal-sandbox',
    id: order.id,
    status: order.status, // CREATED
    approveUrl: approveLink ? approveLink.href : null,
    raw: order,
  };
}

async function captureOrder(orderId) {
  const data = await api(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, { method: 'POST', body: '{}' });
  return { provider: 'paypal-sandbox', id: data.id, status: data.status, raw: data };
}

async function getOrder(orderId) {
  const data = await api(`/v2/checkout/orders/${encodeURIComponent(orderId)}`);
  return { provider: 'paypal-sandbox', id: data.id, status: data.status, raw: data };
}

module.exports = { createOrder, captureOrder, getOrder, hasCredentials, config, DEFAULT_BASE };
