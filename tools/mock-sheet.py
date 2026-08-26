"""Local stand-in for the Apps Script Web App.

Speaks the same JSON protocol against an in-memory list of orders, so the
ticket board can be developed and tested without touching the real sheet.

    python3 tools/mock-sheet.py            # listens on 8766

Then open the board pointed at it:

    http://localhost:8000/board.html?endpoint=http://localhost:8766/exec
"""

import json
import sys
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8766

DRINKS = ["Coconut Matcha Cloud", "Yuzu Passionfruit Tonic"]
SEED = [
    ("Mia", "Chen", "Dedalus Labs", 0, "in progress"),
    ("Arjun", "Patel", "Northwind", 0, "in progress"),
    ("Sofia", "Reyes", "Helix Bio", 1, "in progress"),
    ("Tom", "Okafor", "Janet AI", 1, "ready"),
    ("Lena", "Brandt", "Foldspace", 0, "ready"),
    ("Kai", "Nakamura", "Orbital", 1, "in progress"),
    ("Priya", "Sharma", "Lattice", 0, "ready"),
    ("James", "Wu", "Copperfield", 1, "in progress"),
]

now = datetime.now(timezone.utc)
ORDERS = [
    {
        "row": i + 2,
        "timestamp": (now - timedelta(minutes=len(SEED) - i)).isoformat(),
        "firstName": first,
        "lastName": last,
        "company": company,
        "drink": DRINKS[drink],
        "drinkStatus": status,
        "emailStatus": "pending",
    }
    for i, (first, last, company, drink, status) in enumerate(SEED)
]


class Handler(BaseHTTPRequestHandler):
    def _send(self, payload):
        body = json.dumps(payload).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        query = parse_qs(urlparse(self.path).query)
        if query.get("action", [""])[0] == "board":
            return self._send({"result": "success", "orders": ORDERS})
        return self._send({"result": "ok", "message": "Café orders endpoint is live."})

    def do_POST(self):
        length = int(self.headers.get("Content-Length") or 0)
        data = json.loads(self.rfile.read(length) or b"{}")
        action = data.get("action")

        if action == "board":
            return self._send({"result": "success", "orders": ORDERS})

        if action == "updateStatus":
            row = int(data.get("row", 0))
            status = str(data.get("drinkStatus", "")).lower()
            for order in ORDERS:
                if order["row"] == row:
                    order["drinkStatus"] = status
                    print(f"  row {row} -> {status}")
                    return self._send({"result": "success", "row": row, "drinkStatus": status})
            return self._send({"result": "error", "message": "Could not find that order."})

        row = len(ORDERS) + 2
        ORDERS.append(
            {
                "row": row,
                "timestamp": data.get("timestamp") or datetime.now(timezone.utc).isoformat(),
                "firstName": data.get("firstName", ""),
                "lastName": data.get("lastName", ""),
                "company": data.get("company", ""),
                "drink": data.get("drink", ""),
                "drinkStatus": data.get("drinkStatus", "in progress"),
                "emailStatus": data.get("emailStatus", "pending"),
            }
        )
        print(f"  appended row {row}: {data.get('firstName')} / {data.get('drink')}")
        return self._send({"result": "success", "row": row})

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    print(f"mock sheet on http://localhost:{PORT}/exec  ({len(ORDERS)} seed orders)")
    ThreadingHTTPServer(("localhost", PORT), Handler).serve_forever()
