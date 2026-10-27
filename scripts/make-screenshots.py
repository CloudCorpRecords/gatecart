#!/usr/bin/env python3
"""Render screenshot-style images from GateCart's LIVE API output.

The build environment has no headless browser, so these PNGs are drawn
with PIL directly from real JSON returned by the running server during
the smoke/demo run — every number on them came from the app itself.
They are labeled as API-output renders on the image. To take true
browser screenshots: `npm start`, open http://localhost:3737, and
capture the plan and receipt cards.
"""
import json, os, subprocess, sys, time, urllib.request

BASE = "http://localhost:3737"
ROOT = os.path.join(os.path.dirname(__file__), "..")
OUT = os.path.join(ROOT, "screenshots")
os.makedirs(OUT, exist_ok=True)

def api(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())

server = subprocess.Popen(["node", "server.js"], cwd=ROOT,
                          env={**os.environ, "PAYPAL_MODE": "simulator"},
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    for _ in range(50):
        try:
            api("GET", "/api/health"); break
        except Exception:
            time.sleep(0.1)

    plan = api("POST", "/api/plans", {"scenarioId": "community-meetup", "scale": 60,
                                      "budget": 320, "priorities": ["coffee"]})["plan"]
    approved = api("POST", f"/api/plans/{plan['id']}/approve",
                   {"override": False, "acknowledgeAttention": True})["plan"]
    order = api("POST", "/api/orders", {"planId": plan["id"]})["order"]
    api("POST", f"/api/orders/{order['id']}/simulate-approval")
    captured = api("POST", f"/api/orders/{order['id']}/capture")["order"]

    from PIL import Image, ImageDraw, ImageFont
    def font(sz, bold=False):
        p = "/usr/share/fonts/truetype/dejavu/DejaVuSans%s.ttf" % ("-Bold" if bold else "")
        return ImageFont.truetype(p, sz)
    BG, CARD, TXT, SUB, ACC = (15, 20, 32), (23, 30, 46), (232, 236, 244), (174, 185, 207), (47, 124, 246)

    def wrap(draw, text, f, width):
        words, lines, cur = text.split(), [], ""
        for w in words:
            t = (cur + " " + w).strip()
            if draw.textlength(t, font=f) <= width: cur = t
            else: lines.append(cur); cur = w
        if cur: lines.append(cur)
        return lines

    # --- Screenshot 1: plan + gates ---
    img = Image.new("RGB", (1180, 1060), BG); d = ImageDraw.Draw(img)
    d.rounded_rectangle([30, 30, 1150, 1030], 18, fill=CARD)
    y = 55
    d.text((60, y), "GateCart — agent plan (SIMULATOR mode)", font=font(30, True), fill=TXT); y += 48
    d.text((60, y), "Rendered from live API output of the running app. Orders are local simulations (SIM- ids).", font=font(17), fill=SUB); y += 40
    for line in wrap(d, plan["summary"], font(20), 1050):
        d.text((60, y), line, font=font(20), fill=TXT); y += 28
    y += 12
    for l in plan["lines"]:
        d.text((60, y), f"{l['qty']} × {l['name'][:58]}", font=font(19), fill=TXT)
        t = f"${l['lineTotal']:.2f}"
        d.text((1090 - d.textlength(t, font=font(19)), y), t, font=font(19), fill=TXT); y += 29
    y += 6
    d.text((60, y), f"TOTAL  ${plan['total']:.2f} of ${plan['budget']:.2f} budget", font=font(22, True), fill=ACC); y += 42
    d.text((60, y), "Approval gates:", font=font(21, True), fill=TXT); y += 32
    icons = {"pass": ("● PASS", (95, 214, 139)), "passed": ("● PASS", (95, 214, 139)),
             "awaiting": ("● AWAITING", SUB), "breached": ("● BREACHED", (255, 123, 114)),
             "attention": ("● ATTENTION", (255, 207, 110))}
    for g in approved["gates"]:
        label, col = icons.get(g["status"], (g["status"], SUB))
        d.text((60, y), f"{g['label']}: {label}", font=font(19, True), fill=col); y += 27
        for line in wrap(d, g["detail"], font(16), 1040)[:2]:
            d.text((78, y), line, font=font(16), fill=SUB); y += 22
        y += 8
    img.save(os.path.join(OUT, "01-plan-and-gates.png"))

    # --- Screenshot 2: receipt ---
    img = Image.new("RGB", (1180, 760), BG); d = ImageDraw.Draw(img)
    d.rounded_rectangle([30, 30, 1150, 730], 18, fill=CARD)
    y = 55
    d.text((60, y), f"GateCart — captured order {captured['id']}", font=font(27, True), fill=TXT); y += 44
    d.text((60, y), "Rendered from live API output (simulator receipt JSON, abridged).", font=font(17), fill=SUB); y += 38
    receipt = json.dumps(captured["raw"], indent=2).splitlines()
    for line in receipt[:26]:
        d.text((60, y), line[:110], font=font(17), fill=TXT); y += 24
    img.save(os.path.join(OUT, "02-capture-receipt.png"))
    print("screenshots written:", os.listdir(OUT))
finally:
    server.terminate()
