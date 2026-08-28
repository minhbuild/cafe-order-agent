# Café popup order agent

A single-page order form dressed up as an AI agent chat. There is no model behind it —
"Janet" is a linear state machine that collects five fields, plays a short fake
integration sequence, and writes one row to a Google Sheet at the end.

## Files

| File | What it is |
| --- | --- |
| `index.html` | The whole app: markup, styles, and state machine. No build step. |
| `email/order-confirmation.html` | Email-safe HTML template in an editorial thank-you layout: headline, hero banner, order summary, people to meet, host blurbs. Placeholders are listed in the comment block at the top of the file — wire into Apps Script or send manually. Swap the two relative image `src` values for hosted URLs before sending. |
| `email/assets/hero-banner.png` | The hero banner for the email (1024x426). |
| `apps-script/Code.gs` | Google Apps Script Web App that appends the order row. |
| `assets/logo-source.png` | The original brand mark, kept for reference. |

## Look and feel

The chrome mirrors the real Janet frontend: the left nav, the Agents and Threads
panels on the right, and the greys are all matched to a screenshot of the product.
Both side rails are decorative — nothing in them is clickable — and they drop away on
narrower viewports (the right panel below 940px, the left rail below 760px).

The brand mark in the top-left is loaded directly from `assets/logo.png`.

## Run it

Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
```

Then visit http://localhost:8000.

Open `board.html?demo=1` to preview the ticket board with eight seeded demo tickets (no sheet required).

## Connect the Google Sheet

1. Open the destination Google Sheet, then **Extensions → Apps Script**.
2. Paste in `apps-script/Code.gs`.
3. **Deploy → New deployment → Web app**, with *Execute as: Me* and
   *Who has access: Anyone*.
4. Copy the `/exec` URL into `SHEET_ENDPOINT` at the top of the `<script>` block in
   `index.html`.

The browser POSTs JSON with `Content-Type: text/plain;charset=utf-8`. That keeps it a
"simple" CORS request, so the browser never sends a preflight `OPTIONS` — which Apps
Script web apps cannot respond to.

If `SHEET_ENDPOINT` is empty or the request fails, the order is logged to the console,
the status row reads **Saved locally** instead of **Order sent**, and the flow still
finishes normally.

## The flow

`firstName → lastName → email → company → theater → drink → submit → done`

The agent shows a typing indicator for 1.5s before every message and the input is
disabled while it "types". After the company answer, two fake tool rows run for 1.5s
each (connecting to Sheets, updating the sheet). The drink is picked from two buttons
rather than typed. **Start new order** resets state and clears the thread.

## Customising

Everything tunable sits at the top of the script block: `SHEET_ENDPOINT`, `TYPING_MS`,
`THEATER_MS`, and the `DRINKS` array.
