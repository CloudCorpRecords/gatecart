# Devpost Submission — GateCart (PayPal AI Hackathon)

*Paste-ready copy. Deadline: Nov 12, 2026, 12:00 PM PT. Attach: public repo (MIT license file visible), demo video <3 min public on YouTube, live demo URL or the repo's run instructions (both included below).*

---

## Project name

**GateCart — Agentic Checkout with Approval Gates**

## Tagline

An AI agent that assembles your purchase inside a hard budget, explains every choice — and cannot move a cent through PayPal until a human approves its exact plan.

## Inspiration

Agentic commerce demos all end the same way: the agent spends your money and you find out later. We think that's backwards. The moment AI can transact, the hard problem stops being the model and becomes **control**: who set the budget, who saw the cart before money moved, and what does the agent do when its plan is over budget — quietly overspend, or stop and explain itself? GateCart is our answer, built for the people who feel this first: small cafe owners restocking every week, community organizers buying event supplies — people with no procurement department, who need a buyer that is fast like an agent and accountable like an employee with a spending limit.

## What it does

You give GateCart a job, not a cart: a scenario (community meetup supplies, or a small cafe's weekly restock), a scale (attendees / weekly covers), a **hard budget**, and optional priorities.

The agent assembles a priced cart, computing quantities from your scale. If its first pass breaks the budget, it value-engineers in the open — substituting cheaper equivalents, trimming nice-to-haves, dropping what the budget can't carry — and writes a plain-English reason for **every** decision into a decision log you can audit line by line.

Then it hits three gates:

1. **Budget gate** — still over budget after every substitution? The gate is *breached*. Approval now requires an explicit, recorded override; a casual click is refused. The agent will not quietly overspend.
2. **Concentration gate** — any single line item over 40% of the budget must be explicitly acknowledged before approval.
3. **Human approval gate** — the server refuses to create any PayPal order for an unapproved plan (try it: you get a 409). Approval covers *this exact plan and total* — change the plan and the gate re-opens.

Only then does PayPal enter: GateCart creates a real PayPal Checkout order (Orders v2, CAPTURE intent) carrying the approved line items. The buyer approves on PayPal's side — PayPal's own second approval — and only then is the payment captured. The receipt is the PayPal order itself.

## How we built it

Zero-dependency Node.js (built-in `http` only — no framework, no build step) so anyone can run it with one command.

- **The agent** (`src/agent.js`) is a deterministic, explainable planner. We chose determinism on purpose: an agent that spends money must show its work, so every substitution, trim, and drop carries its reason, and the plan summary is written for the human standing at the gate.
- **PayPal** (`src/paypal.js`) is a real client for the PayPal sandbox REST API: OAuth client-credentials token flow, Orders v2 create with itemized purchase units and item-total breakdown, buyer approval via PayPal's approve link, then capture and order read-back. Credentials come from environment variables only.
- **The gates** are enforced server-side (`server.js`), not hidden in the UI — the API itself refuses out-of-order actions: no order before approval (409), no approval of a breached budget gate without an explicit override (422), no capture before buyer approval.
- **A clearly-labeled simulator** (`src/simulator.js`) implements the identical interface and PayPal response shape in memory — `SIM-` order ids, `simulated: true` stamps, a simulator banner in the UI — so the complete flow runs and is testable before the (free) PayPal Developer account step, and offline in CI. It is never presented as PayPal.
- **Tests** (`test/smoke.test.js`, `node --test`): five end-to-end tests over real HTTP, including the refusal paths — gate breaches, premature orders, premature captures.

## Challenges we ran into

- **Making "no" a feature.** The most important code in GateCart is the code that refuses: refusing an order, refusing a quiet approval, refusing a capture. Designing the gate states so a refusal is informative (which gate, why, what explicit action unlocks it) took more care than the happy path.
- **An agent you can audit.** A planner that just returns a total invites rubber-stamping. We restructured the agent so decisions are data — typed, ordered, and rendered verbatim in the UI — which also made the value-engineering behavior testable.
- **Honest simulation.** A demo mode that looks like the real thing is a liability in a payments product. We labeled the simulator at every layer (ids, payloads, UI banner, API config notes) so no judge, user, or screenshot can mistake it for PayPal.

## Accomplishments that we're proud of

- The full loop works end-to-end: job → explained plan → gates → human approval → PayPal order → buyer approval → captured payment — with the refusal paths tested, not just the happy path.
- The agent got a $413.50 first-pass cart down to $298.50 against a $320 budget using three substitutions it could each explain — and when we gave it an impossible $60 budget for 200 people, it stopped, breached the gate, and demanded a human override instead of overspending.
- Zero dependencies. `node server.js` is the whole install.

## What we learned

Approval is a user-interface problem *and* an API problem: if the server doesn't enforce the gate, the gate is decoration. We also learned that explainability isn't a bolt-on — the moment the agent's decisions became structured data, the UI, the tests, and the demo script all got simpler.

## What's next for GateCart

- Real merchant catalogs (supplier feeds / CSV import) beyond the two built-in scenarios.
- Standing approvals with limits ("restocks under $150 with no substitutions may auto-approve; everything else gates") — trust ladders earned by approval history.
- Multi-buyer scenarios: team budgets where the agent collects approvals from two humans before PayPal.
- Webhook reconciliation against PayPal order events so captured, refunded, and disputed states stay in sync.

## Demo

- **Repo:** https://github.com/CloudCorpRecords/gatecart (public, MIT)
- **Try it:** `node server.js` (Node ≥ 18, nothing to install), open `http://localhost:3737`. Default mode is the labeled simulator — the full flow works with zero setup. For the real PayPal sandbox: create a free developer account at developer.paypal.com, put the sandbox app's Client ID/Secret in `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET`, set `PAYPAL_MODE=sandbox`, restart.
- **Video:** <3 min walkthrough (see DEMO.md script): plan → refused order → approval → PayPal order → buyer approval → capture, plus the impossible-budget refusal.

## Built with

- Node.js (zero runtime dependencies)
- PayPal Checkout Orders v2 REST API (sandbox)
- Vanilla HTML/CSS/JS frontend
- node:test for the end-to-end suite

## Tools (required by the submission form — AI tools/models used, and how)

- **Muse (Anthropic) — via the Tree / Muse agent fleet:** the AI agents that designed, coded, tested, and documented GateCart during the hackathon period, working under the direction of Rene Turcios, who set the product direction (agentic checkout with approval gates), the constraints (zero-dependency, server-enforced gates, honestly-labeled simulator), and reviewed the result. This disclosure is also in the repo README, per the campaign's build-disclosure practice.
- **GateCart's built-in planning agent (in-project, deterministic — no external model at runtime):** the buying agent inside the product itself. It assembles carts, performs budget value-engineering (substitutions, trims, drops), and generates the plain-English decision log and plan summaries the human reviews at the approval gate. It runs locally with no API key.
- **PayPal sandbox (not an AI tool, listed for completeness):** the transaction layer — Orders v2 create/approve/capture — integrated via `src/paypal.js`. No PayPal AI tools were used; PayPal is the payment rail the agent is gated in front of.

## Build Disclosure

Build Disclosure: AI-built. Built by AI agents (Tree / Muse fleet) directed by Rene Turcios during the hackathon period; Rene set the direction and reviewed; agents designed, coded, and tested.
