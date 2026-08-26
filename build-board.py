"""One-shot generator: lifts the shared chrome markup out of index.html into board.html.

Kept in the repo so the board can be regenerated if the rail or side panels change.
Run with: python3 build-board.py
"""

import re
from pathlib import Path

index = Path("index.html").read_text(encoding="utf-8")


def block(pattern: str) -> str:
    match = re.search(pattern, index, re.S)
    assert match, f"could not find {pattern}"
    return match.group(0).rstrip()


sprite = block(r"<!-- Illustrated agent avatar.*?</symbol></svg>")
rail = block(r'<aside class="rail">.*?</aside>')
side = block(r'<aside class="side">.*?</aside>')

# The board lives under Work, so move the nav highlight off Chat.
OPEN = '<div class="rail-item">'
rail = rail.replace('<div class="rail-item active">', OPEN, 1)

work = rail.index(">\n      Work\n")
start = rail.rindex(OPEN, 0, work)
rail = rail[:start] + '<div class="rail-item active">' + rail[start + len(OPEN):]
assert rail.count('rail-item active') == 1

# Threads panel: the board is its own thread.
side = side.replace(
    '<span class="name">Café order</span>',
    '<span class="name">Café ticket board</span>',
    1,
)

HEAD = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>Janet — Café Ticket Board</title>
<link rel="stylesheet" href="assets/chrome.css" />
<link rel="stylesheet" href="assets/drinks.css" />
<link rel="stylesheet" href="assets/board.css" />
</head>
<body>
"""

MAIN = """
<div class="app">
__RAIL__

  <main class="main">
    <header class="topbar">
      <span class="bot cafe" aria-hidden="true"><svg viewBox="0 0 24 24"><use href="#jbot" /></svg></span>
      <strong>Cafe Ordering Janet</strong>
      <span class="board-sync" id="sync" role="status" aria-live="polite">
        <i aria-hidden="true"></i><span id="syncText">Connecting</span>
      </span>
    </header>

    <div class="columns">
      <section class="column" data-status="in progress">
        <div class="column-head">
          <span class="column-name">In Progress</span>
          <span class="count" id="countProgress">0</span>
        </div>
        <div class="column-list" id="listProgress" data-status="in progress"></div>
      </section>

      <section class="column" data-status="ready">
        <div class="column-head">
          <span class="column-name">Ready for Pickup</span>
          <span class="count" id="countReady">0</span>
        </div>
        <div class="column-list" id="listReady" data-status="ready"></div>
      </section>
    </div>
  </main>

__SIDE__
</div>

<script src="assets/config.js"></script>
<script src="assets/drinks.js"></script>
<script src="assets/board.js"></script>
<script src="assets/runs.js"></script>
</body>
</html>
"""

out = HEAD + sprite + MAIN.replace("__RAIL__", rail).replace("__SIDE__", side)
Path("board.html").write_text(out, encoding="utf-8")
print(f"board.html written ({len(out.splitlines())} lines)")
