'use strict';

// GateCart's buying agent.
//
// A deterministic, explainable planner: given a scenario, a scale
// (attendees / weekly covers) and a hard budget, it assembles a cart,
// then value-engineers it if the budget gate is under pressure —
// swapping substitutes, trimming low-tier quantities — and writes a
// plain-English reason for every decision it makes. Nothing here is a
// black box on purpose: an agent that spends money has to show its work.
//
// The agent can only *propose*. Spending requires a human to approve
// the plan (see gates below), and payment happens through PayPal.

const { getScenario } = require('./catalog');

let planSeq = 0;

// Any single line item above this share of the budget trips the
// concentration gate and needs an explicit human acknowledgement.
const CONCENTRATION_THRESHOLD = 0.4;

function money(n) {
  return Math.round(n * 100) / 100;
}

function planPurchase({ scenarioId, scale, budget, priorities = [] }) {
  const scenario = getScenario(scenarioId);
  if (!scenario) throw new Error(`Unknown scenario: ${scenarioId}`);
  if (!(budget > 0)) throw new Error('Budget must be a positive number');
  if (!(scale > 0)) throw new Error('Scale must be a positive number');

  const decisions = [];
  const lines = scenario.items.map((item) => {
    const qty = Math.max(1, item.qty(scale));
    return {
      itemId: item.id,
      name: item.name,
      category: item.category,
      tier: item.tier,
      qty,
      unitPrice: item.unitPrice,
      lineTotal: money(qty * item.unitPrice),
      substitutedFrom: null,
      rationale: `${qty} × needed for ${scale} ${scenario.scaleLabel}; tier: ${item.tier}.`,
      _alt: item.alt || null,
    };
  });

  let total = money(lines.reduce((s, l) => s + l.lineTotal, 0));
  decisions.push({
    type: 'assemble',
    text: `Assembled a first-pass cart for "${scenario.label}" at ${scale} ${scenario.scaleLabel}: $${total.toFixed(2)} against a $${budget.toFixed(2)} budget.`,
  });

  // --- Value engineering: only runs when the budget gate is threatened ---
  if (total > budget) {
    // 1. Substitute cheaper alternatives, lowest-tier first.
    const byTier = { nice: 0, standard: 1, essential: 2 };
    const candidates = lines
      .filter((l) => l._alt)
      .sort((a, b) => byTier[a.tier] - byTier[b.tier]);
    for (const line of candidates) {
      if (total <= budget) break;
      const saving = money((line.unitPrice - line._alt.unitPrice) * line.qty);
      if (saving <= 0) continue;
      decisions.push({
        type: 'substitute',
        text: `Swapped "${line.name}" ($${line.unitPrice.toFixed(2)}) for "${line._alt.name}" ($${line._alt.unitPrice.toFixed(2)}), saving $${saving.toFixed(2)}. Same job, lower price — quality-sensitive essentials were left alone.`,
      });
      line.substitutedFrom = line.name;
      line.name = line._alt.name;
      line.unitPrice = line._alt.unitPrice;
      line.lineTotal = money(line.qty * line.unitPrice);
      line.rationale += ' Substituted by the agent to protect the budget gate.';
      total = money(lines.reduce((s, l) => s + l.lineTotal, 0));
    }
  }

  if (total > budget) {
    // 2. Trim quantities of nice-to-have items down to 1.
    for (const line of lines.filter((l) => l.tier === 'nice' && l.qty > 1)) {
      if (total <= budget) break;
      const saving = money((line.qty - 1) * line.unitPrice);
      decisions.push({
        type: 'trim',
        text: `Trimmed "${line.name}" from ${line.qty} to 1, saving $${saving.toFixed(2)}. Nice-to-have items absorb cuts before essentials do.`,
      });
      line.qty = 1;
      line.lineTotal = money(line.qty * line.unitPrice);
      total = money(lines.reduce((s, l) => s + l.lineTotal, 0));
    }
  }

  if (total > budget) {
    // 3. Drop nice-to-haves entirely, and say so loudly.
    for (const line of [...lines]) {
      if (total <= budget) break;
      if (line.tier !== 'nice') continue;
      decisions.push({
        type: 'drop',
        text: `Dropped "${line.name}" ($${line.lineTotal.toFixed(2)}) entirely. The budget cannot carry it; a human can add it back only by raising the budget or overriding the gate.`,
      });
      lines.splice(lines.indexOf(line), 1);
      total = money(lines.reduce((s, l) => s + l.lineTotal, 0));
    }
  }

  // Caller-named priorities get protected last: note them in the summary.
  const protectedNames = lines
    .filter((l) => priorities.some((p) => l.name.toLowerCase().includes(String(p).toLowerCase()) || l.category.toLowerCase() === String(p).toLowerCase()))
    .map((l) => l.name);
  if (protectedNames.length) {
    decisions.push({
      type: 'priority',
      text: `Protected your named priorities: ${protectedNames.join('; ')}. These were substituted/trimmed last.`,
    });
  }

  // --- Gates ---
  const overBudget = total > budget;
  const concentration = lines.filter((l) => l.lineTotal / budget > CONCENTRATION_THRESHOLD);
  const gates = [
    {
      id: 'budget',
      label: 'Budget gate',
      status: overBudget ? 'breached' : 'pass',
      detail: overBudget
        ? `Plan total $${total.toFixed(2)} still exceeds the $${budget.toFixed(2)} budget after substitutions, trims, and drops. A human must explicitly override to approve — the agent will not quietly overspend.`
        : `Plan total $${total.toFixed(2)} is within the $${budget.toFixed(2)} budget.`,
      requiresAck: overBudget,
    },
    {
      id: 'concentration',
      label: 'Concentration gate',
      status: concentration.length ? 'attention' : 'pass',
      detail: concentration.length
        ? `Single line item(s) above ${(CONCENTRATION_THRESHOLD * 100).toFixed(0)}% of budget: ${concentration.map((l) => `${l.name} ($${l.lineTotal.toFixed(2)})`).join('; ')}. Approving requires acknowledging this concentration.`
        : 'No single item dominates the budget.',
      requiresAck: concentration.length > 0,
    },
    {
      id: 'approval',
      label: 'Human approval gate',
      status: 'awaiting',
      detail: 'No PayPal order is created until a human approves this exact plan. Approval is for these line items and this total only — any change re-opens the gate.',
      requiresAck: true,
    },
  ];

  const summary = overBudget
    ? `I could not fit "${scenario.label}" inside $${budget.toFixed(2)} without cutting essentials, so I stopped at $${total.toFixed(2)} and flagged the budget gate instead of overspending silently. Raise the budget or override the gate to proceed.`
    : `Planned "${scenario.label}" for ${scale} ${scenario.scaleLabel} at $${total.toFixed(2)} of your $${budget.toFixed(2)} budget, leaving $${money(budget - total).toFixed(2)} unspent. ${decisions.filter((d) => d.type === 'substitute' || d.type === 'trim' || d.type === 'drop').length} value-engineering decision(s) were made and explained below. Nothing has been ordered — the plan is waiting at the approval gate.`;

  planSeq += 1;
  return {
    id: `plan_${Date.now().toString(36)}_${planSeq}`,
    scenarioId,
    scenarioLabel: scenario.label,
    scale,
    scaleLabel: scenario.scaleLabel,
    budget,
    total,
    currency: 'USD',
    status: 'AWAITING_APPROVAL',
    lines: lines.map(({ _alt, ...rest }) => rest),
    decisions,
    gates,
    summary,
    createdAt: new Date().toISOString(),
  };
}

module.exports = { planPurchase, CONCENTRATION_THRESHOLD };
