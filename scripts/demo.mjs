// GateCart CLI demo — runs the full flow against a booted server and
// prints a narrated transcript. Used for the smoke evidence and as the
// spine of the demo video (see DEMO.md).
//
//   node server.js &          (terminal 1)
//   node scripts/demo.mjs     (terminal 2)

const BASE = process.env.BASE || 'http://localhost:3737';

async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${data.error || 'error'}`);
  return data;
}

const say = (...a) => console.log(...a);

const cfg = await api('GET', '/api/config');
say(`\n=== GateCart demo (payments mode: ${cfg.mode}) ===`);
if (cfg.mode === 'simulator') say('Orders below are LOCAL SIMULATIONS (SIM- ids). No PayPal contact, no money moves.\n');

say('--- 1. A human gives the agent a job: meetup supplies for 60 people, $320 hard budget ---');
const { plan } = await api('POST', '/api/plans', { scenarioId: 'community-meetup', scale: 60, budget: 320, priorities: ['coffee'] });
say(plan.summary);
say('\nCart:');
for (const l of plan.lines) say(`  ${l.qty} x ${l.name} @ $${l.unitPrice.toFixed(2)} = $${l.lineTotal.toFixed(2)}  [${l.tier}]`);
say(`  TOTAL: $${plan.total.toFixed(2)} / $${plan.budget.toFixed(2)}`);
say('\nDecision log:');
for (const d of plan.decisions) say(`  - ${d.text}`);
say('\nGates:');
for (const g of plan.gates) say(`  [${g.status}] ${g.label}: ${g.detail}`);

say('\n--- 2. Try to order BEFORE approval (the gate must refuse) ---');
try {
  await api('POST', '/api/orders', { planId: plan.id });
  say('  !! UNEXPECTED: order created without approval');
} catch (e) { say(`  Refused, as designed: ${e.message}`); }

say('\n--- 3. The human approves this exact plan ---');
const { plan: approved } = await api('POST', `/api/plans/${plan.id}/approve`, { override: false, acknowledgeAttention: true });
say(`  Plan status: ${approved.status} at ${approved.approvedAt}`);

say('\n--- 4. Create the PayPal order ---');
const { order } = await api('POST', '/api/orders', { planId: plan.id });
say(`  Order ${order.id} via ${order.provider}, status ${order.status}`);

if (cfg.mode === 'simulator') {
  say('\n--- 5. Buyer approves (simulated buyer step) ---');
  const { order: o2 } = await api('POST', `/api/orders/${order.id}/simulate-approval`);
  say(`  Order status: ${o2.status}`);
} else {
  say(`\n--- 5. Buyer approves at PayPal: ${order.approveUrl} (sandbox buyer account) ---`);
}

say('\n--- 6. Capture ---');
const { order: captured } = await api('POST', `/api/orders/${order.id}/capture`);
say(`  Order ${captured.id} status: ${captured.status}`);
say('\n=== Done: the agent bought exactly what the human approved — nothing before, nothing more. ===');
