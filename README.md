# GateCart — Agentic Checkout with Approval Gates

**An AI agent that buys for you — but cannot spend a cent until a human approves its exact plan.**

Built for the [PayPal AI Hackathon](https://paypalaihackathon.devpost.com/) (Devpost, deadline Nov 12, 2026). GateCart's whole point: agentic commerce is only trustworthy if the agent's spending power has gates on it. GateCart's agent *proposes*; the human *disposes*; PayPal moves the money.

> Build Disclosure: AI-built. Built by AI agents (Tree / Muse fleet) directed by Rene Turcios during the hackathon period; Rene set the direction and reviewed; agents designed, coded, and tested.

---

## The problem

Every demo of "agentic commerce" ends the same way: the agent spends your money and you find out later. That's backwards. The moment an AI can transact, the important product questions stop being about the model and start being about **control**: Who set the budget? Who saw the cart before money moved? What happens when the plan is over budget — does the agent quietly overspend, or stop and explain itself?

Small operators feel this first: the cafe owner who needs a weekly restock, the community organizer buying meetup supplies. They don't have procurement departments. They need a buyer that is fast like an agent and accountable like an employee with a spending limit.

## What GateCart does

1. **The human gives a job, not a cart.** Pick a scenario (community meetup supplies, small-cafe weekly restock), a scale (attendees / weekly covers), a **hard budget**, and optional priorities.
2. **The agent plans — and shows its work.** It assembles a cart from a priced catalog, computes quantities from the scale, and if the first pass breaks the budget it *value-engineers*: substitutes cheaper equivalents, trims nice-to-haves, drops what the budget can't carry — writing a plain-English reason for every decision into a decision log. Named priorities are protected last.
3. **Three gates stand between the plan and your money:**
   - **Budget gate** — if the plan still exceeds the budget after all substitutions, the gate is *breached*: approval requires an explicit, recorded override. A plain click is refused (HTTP 422).
   - **Concentration gate** — any single line item above 40% of the budget is flagged and must be explicitly acknowledged.
   - **Human approval gate** — no PayPal order can exist before a human approves *this exact plan* (server-enforced: ordering an unapproved plan returns 409). Any new plan re-opens the gate.
4. **PayPal executes.** Only after approval does GateCart create a PayPal order (Checkout Orders v2, `intent: CAPTURE`) with the approved line items and total. The buyer approves on PayPal's side — as in real checkout — and only then can the payment be captured. The receipt is the PayPal order object itself.

## Why PayPal is essential (not decoration)

- The order GateCart creates is a real PayPal Checkout order shape — line items, item-total breakdown, reference id tied to the approved plan — against the **PayPal sandbox REST API** (`src/paypal.js`). PayPal's two-step create → buyer-approve → capture lifecycle is literally the second approval in the system: the human approves the *plan* in GateCart, the buyer approves the *payment* at PayPal.
- Remove PayPal and there is no transaction at all — GateCart is a budgeting toy. Remove the gates and there is no product — it's just an auto-buyer. The hackathon brief asks for projects that meaningfully use **both** PayPal and AI; here each one is load-bearing.

## Why AI is essential

The agent is the buyer: it interprets an underspecified job ("supplies for 60 people, $320, coffee matters"), turns it into quantities and line items, makes trade-off decisions under a constraint, and — critically — *explains* them in language a non-technical owner can audit. The planner (`src/agent.js`) is deterministic and fully inspectable on purpose: an agent that spends money must show its work, so every substitution, trim, and drop carries its reason, and the plan summary is written for the human standing at the gate.

## Architecture

```
public/            Static UI (no build step): ask -> plan -> gates -> PayPal order
server.js          Zero-dependency Node http server + API + gate enforcement
src/agent.js       The buying agent: cart assembly, value engineering, decision log, gates
src/catalog.js     Priced catalogs for the two scenarios, with cheaper substitutes
src/paypal.js      Real PayPal sandbox client (OAuth client-credentials, Orders v2
                   create / capture / get) — credentials from env only
src/simulator.js   Clearly-labeled local simulator with the SAME interface and
                   response shape (SIM- order ids, simulated:true stamps)
test/smoke.test.js node --test end-to-end suite (5 tests, simulator mode)
scripts/demo.mjs   Narrated CLI walkthrough of the full flow
```

Payment mode is chosen by `PAYPAL_MODE`:
- `simulator` — local simulation only. **No PayPal systems are contacted, no money moves.** This is the default when no credentials are present, and every order is visibly a simulation.
- `sandbox` — real PayPal **sandbox** orders via `src/paypal.js`.
- `auto` (default) — sandbox when credentials exist, simulator otherwise.

## Run it

Requires Node ≥ 18. No dependencies to install.

```bash
node server.js            # or: npm start
# open http://localhost:3737
```

Try the API directly:

```bash
curl -X POST localhost:3737/api/plans -H 'Content-Type: application/json' \
  -d '{"scenarioId":"community-meetup","scale":60,"budget":320,"priorities":["coffee"]}'
```

Tests and narrated demo:

```bash
npm test                  # 5 end-to-end tests (gate refusals included)
node server.js & npm run demo
```

## Going live on the PayPal sandbox (the one account step)

GateCart ships sandbox-ready; the only thing it cannot do for itself is be *you* at PayPal:

1. Create a **free** PayPal Developer account at <https://developer.paypal.com> (log in with a PayPal account or sign up free).
2. Dashboard → **Apps & Credentials** → **Sandbox** → create an app.
3. Copy the app's **Client ID** and **Secret**, then:

```bash
export PAYPAL_CLIENT_ID=...        # sandbox client id
export PAYPAL_CLIENT_SECRET=...    # sandbox secret
export PAYPAL_MODE=sandbox         # or rely on auto-detection
node server.js
```

`GET /api/config` will report `mode: "sandbox"`. From there, approved plans create real sandbox orders; the UI links the buyer to PayPal's sandbox approval page, and capture completes the sandbox payment. Sandbox buyer test accounts (also free, from the same dashboard) have fake balances — no real money exists anywhere in this flow. Live/production endpoints are never configured by default (`PAYPAL_API_BASE` defaults to `https://api-m.sandbox.paypal.com`).

## Honesty notes

- **Simulator mode is labeled everywhere**: banner in the UI, `SIM-` order ids, `simulated: true` in every payload, and a note from `GET /api/config`. It exists so judges can run the complete flow before the developer-account step, and so the test suite runs offline. It is a stand-in for PayPal's API *shape*, never presented as PayPal itself.
- Screenshots in `/screenshots`: `01`/`02` are renders drawn with PIL from the app's **live API output** during a real run (plan, gates, and captured-order JSON — every number on them came from the server; the render script is `scripts/make-screenshots.py`), labeled as API-output renders on the images themselves. `03-storefront.png`, `04-gate-refusal-422.png`, and `05-approval-and-capture.png` are true browser captures of the running app (Chrome Headless Shell + CDP), taken during the publish pass: the storefront in labeled simulator mode, the breached budget gate with its 422 approval refusal, and the approved plan captured to a COMPLETED order.
- The catalog prices are realistic sample data for two scenarios, not a live merchant feed — the agent, gates, and PayPal flow around them are the product.

## License

MIT — see [LICENSE](LICENSE).

> Build Disclosure: AI-built. Built by AI agents (Tree / Muse fleet) directed by Rene Turcios during the hackathon period; Rene set the direction and reviewed; agents designed, coded, and tested.
