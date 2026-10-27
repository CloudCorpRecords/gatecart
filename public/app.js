'use strict';

const $ = (id) => document.getElementById(id);
let currentPlan = null;
let currentOrder = null;
let mode = 'simulator';

async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function fmt(n) { return `$${Number(n).toFixed(2)}`; }

async function init() {
  const cfg = await api('GET', '/api/config');
  mode = cfg.mode;
  const banner = $('mode-banner');
  if (mode === 'sandbox') {
    banner.textContent = '🟢 PayPal SANDBOX mode — real sandbox orders, no real money';
    banner.classList.add('sandbox');
  } else {
    banner.textContent = '🟡 SIMULATOR mode — local simulated orders (SIM- ids). No PayPal contact, no money moves.';
  }
  const { scenarios } = await api('GET', '/api/scenarios');
  const sel = $('scenario');
  for (const s of scenarios) {
    const opt = document.createElement('option');
    opt.value = s.id; opt.textContent = s.label;
    opt.dataset.scaleLabel = s.scaleLabel;
    sel.appendChild(opt);
  }
  sel.addEventListener('change', () => {
    const o = sel.selectedOptions[0];
    $('scale-label').textContent = `Scale (${o.dataset.scaleLabel})`;
  });
  sel.dispatchEvent(new Event('change'));
}

async function makePlan() {
  const priorities = $('priorities').value.split(',').map((s) => s.trim()).filter(Boolean);
  try {
    const { plan } = await api('POST', '/api/plans', {
      scenarioId: $('scenario').value,
      scale: Number($('scale').value),
      budget: Number($('budget').value),
      priorities,
    });
    currentPlan = plan;
    renderPlan(plan);
  } catch (e) { alert(e.message); }
}

function renderPlan(plan) {
  $('plan-card').classList.remove('hidden');
  $('order-card').classList.remove('hidden');
  $('plan-summary').textContent = plan.summary;
  const tbody = $('plan-table').querySelector('tbody');
  tbody.innerHTML = '';
  for (const l of plan.lines) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${l.name}${l.substitutedFrom ? `<div class="sub">substituted for ${l.substitutedFrom}</div>` : ''}<div class="sub">${l.rationale}</div></td><td>${l.tier}</td><td>${l.qty}</td><td>${fmt(l.unitPrice)}</td><td>${fmt(l.lineTotal)}</td>`;
    tbody.appendChild(tr);
  }
  $('plan-total').textContent = `${fmt(plan.total)} of ${fmt(plan.budget)} budget`;
  const dec = $('decisions');
  dec.innerHTML = '';
  for (const d of plan.decisions) {
    const li = document.createElement('li');
    li.textContent = d.text;
    dec.appendChild(li);
  }
  const gates = $('gates');
  gates.innerHTML = '';
  let needsOverride = false, needsAck = false;
  for (const g of plan.gates) {
    const li = document.createElement('li');
    li.innerHTML = `<span class="gate-${g.status}">●</span> <strong>${g.label} — ${g.status}.</strong> ${g.detail}`;
    gates.appendChild(li);
    if (g.status === 'breached') needsOverride = true;
    if (g.status === 'attention') needsAck = true;
  }
  $('override-wrap').classList.toggle('hidden', !needsOverride);
  $('ack-wrap').classList.toggle('hidden', !needsAck);
  $('approve-msg').textContent = '';
  $('order-status').textContent = 'No order yet. An order can only be created from an approved plan.';
  $('order-btn').disabled = true;
  $('capture-btn').disabled = true;
  $('sim-approve-btn').classList.add('hidden');
  $('approve-link').classList.add('hidden');
  $('receipt').classList.add('hidden');
  currentOrder = null;
}

async function approve() {
  try {
    const { plan } = await api('POST', `/api/plans/${currentPlan.id}/approve`, {
      override: $('override').checked,
      acknowledgeAttention: $('ack').checked,
    });
    currentPlan = plan;
    $('approve-msg').textContent = '✅ Plan approved by a human. The PayPal gate is open — you can create the order now.';
    $('order-btn').disabled = false;
    renderPlanGatesOnly(plan);
  } catch (e) { $('approve-msg').textContent = `⛔ ${e.message}`; }
}

function renderPlanGatesOnly(plan) {
  const gates = $('gates');
  gates.innerHTML = '';
  for (const g of plan.gates) {
    const li = document.createElement('li');
    li.innerHTML = `<span class="gate-${g.status === 'passed' ? 'pass' : g.status}">●</span> <strong>${g.label} — ${g.status}.</strong> ${g.detail}`;
    gates.appendChild(li);
  }
}

async function reject() {
  const { plan } = await api('POST', `/api/plans/${currentPlan.id}/reject`);
  currentPlan = plan;
  $('approve-msg').textContent = 'Plan rejected. Nothing was ordered — that is the gate working as designed.';
  $('order-btn').disabled = true;
}

async function createOrder() {
  try {
    const { order } = await api('POST', '/api/orders', { planId: currentPlan.id });
    currentOrder = order;
    $('order-status').textContent = `Order ${order.id} created via ${order.provider} — status ${order.status}. The buyer still has to approve it before capture, exactly like real PayPal checkout.`;
    if (mode === 'simulator') {
      $('sim-approve-btn').classList.remove('hidden');
    } else if (order.approveUrl) {
      const a = $('approve-link');
      a.href = order.approveUrl; a.classList.remove('hidden');
    }
    showReceipt(order);
  } catch (e) { $('order-status').textContent = `⛔ ${e.message}`; }
}

async function simulateApproval() {
  const { order } = await api('POST', `/api/orders/${currentOrder.id}/simulate-approval`);
  currentOrder = order;
  $('order-status').textContent = `Simulated buyer approved order ${order.id} — status ${order.status}. Ready to capture.`;
  $('capture-btn').disabled = false;
  showReceipt(order);
}

async function capture() {
  try {
    const { order } = await api('POST', `/api/orders/${currentOrder.id}/capture`);
    currentOrder = order;
    $('order-status').textContent = order.status === 'COMPLETED'
      ? `🎉 Payment captured — order ${order.id} is COMPLETED. The agent bought exactly what the human approved, nothing more.`
      : `Order ${order.id} status: ${order.status}`;
    showReceipt(order);
  } catch (e) { $('order-status').textContent = `⛔ ${e.message}`; }
}

function showReceipt(order) {
  const pre = $('receipt');
  pre.textContent = JSON.stringify(order.raw || order, null, 2);
  pre.classList.remove('hidden');
}

$('plan-btn').addEventListener('click', makePlan);
$('approve-btn').addEventListener('click', approve);
$('reject-btn').addEventListener('click', reject);
$('order-btn').addEventListener('click', createOrder);
$('sim-approve-btn').addEventListener('click', simulateApproval);
$('capture-btn').addEventListener('click', capture);
init();
