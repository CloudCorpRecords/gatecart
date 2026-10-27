'use strict';

// Local PayPal simulator — CLEARLY LABELED, not PayPal.
//
// Implements the exact same interface and response shape as
// src/paypal.js (Orders v2: create -> CREATED, buyer approve ->
// APPROVED, capture -> COMPLETED) entirely in memory, so the full
// GateCart flow can be demoed and tested end-to-end before a free
// PayPal Developer (sandbox) account exists. Order IDs carry a
// "SIM-" prefix and every payload is stamped `simulated: true`.
// No network, no money, no PayPal systems are touched in this mode.

const orders = new Map();
let seq = 0;

function stamp() {
  return new Date().toISOString();
}

async function createOrder(plan) {
  seq += 1;
  const id = `SIM-${Date.now().toString(36).toUpperCase()}-${seq}`;
  const order = {
    simulated: true,
    id,
    status: 'CREATED',
    intent: 'CAPTURE',
    create_time: stamp(),
    purchase_units: [
      {
        reference_id: plan.id,
        amount: { currency_code: plan.currency, value: plan.total.toFixed(2) },
        items: plan.lines.map((l) => ({
          name: l.name,
          quantity: String(l.qty),
          unit_amount: { currency_code: plan.currency, value: l.unitPrice.toFixed(2) },
        })),
      },
    ],
    links: [
      { href: `sim://paypal-simulator/orders/${id}/approve`, rel: 'approve', method: 'GET' },
      { href: `sim://paypal-simulator/orders/${id}`, rel: 'self', method: 'GET' },
    ],
  };
  orders.set(id, order);
  const approveLink = order.links.find((l) => l.rel === 'approve');
  return { provider: 'simulator', simulated: true, id, status: order.status, approveUrl: approveLink.href, raw: order };
}

// Stands in for the buyer logging into PayPal and approving the order.
async function simulateApproval(orderId) {
  const order = orders.get(orderId);
  if (!order) throw new Error(`Simulator order not found: ${orderId}`);
  if (order.status !== 'CREATED') throw new Error(`Simulator order ${orderId} is ${order.status}, expected CREATED`);
  order.status = 'APPROVED';
  order.payer = { name: { given_name: 'Simulated', surname: 'Buyer' }, email_address: 'buyer-simulated@example.com' };
  return { provider: 'simulator', simulated: true, id: order.id, status: order.status, raw: order };
}

async function captureOrder(orderId) {
  const order = orders.get(orderId);
  if (!order) throw new Error(`Simulator order not found: ${orderId}`);
  if (order.status !== 'APPROVED') {
    throw new Error(`Simulator order ${orderId} is ${order.status}; capture requires APPROVED (in real PayPal the buyer must approve first).`);
  }
  order.status = 'COMPLETED';
  order.purchase_units[0].payments = {
    captures: [
      {
        id: `SIMCAP-${order.id.slice(4)}`,
        status: 'COMPLETED',
        amount: order.purchase_units[0].amount,
        final_capture: true,
        create_time: stamp(),
      },
    ],
  };
  return { provider: 'simulator', simulated: true, id: order.id, status: order.status, raw: order };
}

async function getOrder(orderId) {
  const order = orders.get(orderId);
  if (!order) throw new Error(`Simulator order not found: ${orderId}`);
  return { provider: 'simulator', simulated: true, id: order.id, status: order.status, raw: order };
}

module.exports = { createOrder, captureOrder, getOrder, simulateApproval };
