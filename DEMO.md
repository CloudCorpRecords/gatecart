# Demo Video Script — GateCart (< 3 minutes, public YouTube)

**Format:** screen recording of the real app running locally, plus the narrated CLI transcript (`npm run demo`) as the closing shot. Record in SIMULATOR mode (banner visible — narrate why) and, once the free PayPal Developer account exists, re-record the checkout half in SANDBOX mode with the real PayPal approve page. Show the project *functioning* — Devpost requires it.

**Before recording:** `node server.js` → open `http://localhost:3737`. Scenario: Community meetup, 60 attendees, budget **$320**, priorities "coffee".

---

**[0:00–0:20] The hook**
> "This is GateCart — an AI agent that buys things for you. There's one rule it can never break: it cannot spend money until a human approves its exact plan. Watch what that means."
*(Show the header and the simulator banner; say: "I'm in the labeled simulator mode — same flow, no real PayPal account needed to watch it work.")*

**[0:20–0:55] The plan**
*(Click "Ask agent to plan the purchase".)*
> "I gave it a job, not a shopping list: supplies for 60 people, 320 dollars, coffee matters. Its first pass cost $413.50 — over budget. So it value-engineered, in the open: day-old pastry boxes instead of fresh, drip brewers instead of the urn rental — every swap explained in this decision log. Final plan: $298.50, inside budget, $21.50 left unspent."

**[0:55–1:20] The gate refuses**
*(Scroll to the order card, try to create the order before approving — show the refusal. Then run the approval gate shot.)*
> "Now the important part. I try to skip ahead and order — refused. The server itself won't create a PayPal order for an unapproved plan. The gate isn't a UI trick; it's enforced in the API."

**[1:20–1:50] Approval → PayPal order → capture**
*(Click Approve, then Create PayPal order, Simulate buyer approval, Capture.)*
> "I approve this exact plan — these items, this total. Now GateCart creates the PayPal order. The buyer still approves on PayPal's side, like any checkout — that's a second, independent approval — and only then can I capture. Completed. The agent bought exactly what I approved. Nothing before, nothing more."
*(Show the receipt JSON.)*

**[1:50–2:30] The impossible budget**
*(New plan: Community meetup, 200 attendees, budget $60. Show the breached budget gate; click Approve and show the 422 refusal; check the override box and approve.)*
> "One more test: 200 people, sixty dollars — impossible. The agent cuts everything it safely can, still lands over, and instead of quietly overspending it breaches the budget gate. A normal approval click is refused. The only way through is this checkbox — an explicit override, on the record. Agents shouldn't get to decide a budget was 'close enough.'"

**[2:30–2:50] Close**
*(Show the CLI transcript finishing: `node scripts/demo.mjs` output, or the repo README architecture section.)*
> "GateCart: the agent proposes, the human disposes, PayPal executes. Zero dependencies, open source, and the whole flow — including every refusal — is covered by end-to-end tests. Links below."

---

**Shot checklist:** plan table + decision log visible · gate list visible (budget/concentration/approval) · pre-approval order refusal · approve → order id · buyer approval → COMPLETED receipt · breached-gate refusal + override. Total runtime target ≈ 2:50.
