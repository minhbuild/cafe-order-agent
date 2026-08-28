/* Café ticket board.
 *
 * Reads the order sheet on a timer and groups the rows into two columns by
 * Drink Status. Moving a ticket (button or drag) writes back to the sheet
 * straight away and updates the column optimistically, so the barista never
 * waits for a poll to see their own action.
 *
 * Reads go out as GET. That matters: an Apps Script deployment that predates
 * the board answers doGet with a plain "live" message and appends nothing, so
 * polling an out-of-date /exec URL can never spam the sheet with blank rows.
 * Writes stay disabled until a read proves the current script is deployed.
 */

const IN_PROGRESS = "in progress";
const READY = "ready";
const PICKED_UP = "picked up";

/* ?endpoint=... points the board at a staging deployment without touching config.js */
const params = new URLSearchParams(location.search);
const ENDPOINT = params.get("endpoint") || SHEET_ENDPOINT;
const DEMO = params.get("demo") === "1";

const demoTs = (minutesAgo) => new Date(Date.now() - minutesAgo * 60_000).toISOString();

const DEMO_ORDERS = [
  {
    row: 2,
    timestamp: demoTs(14),
    firstName: "Mia",
    lastName: "Chen",
    company: "Dedalus Labs",
    email: "mia.chen@dedaluslabs.com",
    drink: "Coconut Matcha Cloud",
    drinkStatus: IN_PROGRESS,
  },
  {
    row: 3,
    timestamp: demoTs(12),
    firstName: "Arjun",
    lastName: "Patel",
    company: "Northwind",
    email: "arjun.patel@northwind.io",
    drink: "Coconut Matcha Cloud",
    drinkStatus: IN_PROGRESS,
  },
  {
    row: 4,
    timestamp: demoTs(10),
    firstName: "Sofia",
    lastName: "Reyes",
    company: "Helix Bio",
    email: "sofia.reyes@helixbio.com",
    drink: "Yuzu Passionfruit Tonic",
    drinkStatus: IN_PROGRESS,
  },
  {
    row: 5,
    timestamp: demoTs(8),
    firstName: "Tom",
    lastName: "Okafor",
    company: "Janet AI",
    email: "tom.okafor@janet.ai",
    drink: "Yuzu Passionfruit Tonic",
    drinkStatus: READY,
  },
  {
    row: 6,
    timestamp: demoTs(6),
    firstName: "Lena",
    lastName: "Brandt",
    company: "Foldspace",
    email: "lena.brandt@foldspace.co",
    drink: "Coconut Matcha Cloud",
    drinkStatus: READY,
  },
  {
    row: 7,
    timestamp: demoTs(5),
    firstName: "Kai",
    lastName: "Nakamura",
    company: "Orbital",
    email: "kai.nakamura@orbital.dev",
    drink: "Yuzu Passionfruit Tonic",
    drinkStatus: IN_PROGRESS,
  },
  {
    row: 8,
    timestamp: demoTs(3),
    firstName: "Priya",
    lastName: "Sharma",
    company: "Lattice",
    email: "priya.sharma@lattice.com",
    drink: "Coconut Matcha Cloud",
    drinkStatus: READY,
  },
  {
    row: 9,
    timestamp: demoTs(1),
    firstName: "James",
    lastName: "Wu",
    company: "Copperfield",
    email: "james.wu@copperfield.co",
    drink: "Yuzu Passionfruit Tonic",
    drinkStatus: IN_PROGRESS,
  },
];

const lists = {
  [IN_PROGRESS]: document.getElementById("listProgress"),
  [READY]: document.getElementById("listReady"),
};

const counts = {
  [IN_PROGRESS]: document.getElementById("countProgress"),
  [READY]: document.getElementById("countReady"),
};

const EMPTY_COPY = {
  [IN_PROGRESS]: "No drinks in the queue.",
  [READY]: "Nothing waiting for pickup.",
};

const sync = document.getElementById("sync");
const syncText = document.getElementById("syncText");

/* Last state read from the sheet, plus the moves made locally but not yet seen
   in a poll. Overrides expire, so a failed write cannot strand a ticket. */
let orders = [];
const pending = new Map();
const PENDING_TTL_MS = 20000;

let canWrite = false;
let demoMode = false;
let dragRow = null;
let dropHandled = false;
let rendered = "";

/* ---------------- data ---------------- */
async function readBoard() {
  const url = ENDPOINT + (ENDPOINT.includes("?") ? "&" : "?") + "action=board&t=" + Date.now();
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.json();
}

async function writeStatus(order, status) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    // text/plain keeps this a "simple" request, so the browser skips the
    // CORS preflight that Apps Script web apps cannot answer.
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      action: "updateStatus",
      row: order.row,
      timestamp: order.timestamp,
      drinkStatus: status,
    }),
  });

  if (!res.ok) throw new Error("HTTP " + res.status);

  const data = await res.json();
  if (data.result === "error") throw new Error(data.message || "Sheet error");
  return data;
}

function loadDemoOrders() {
  demoMode = true;
  orders = DEMO_ORDERS.map((order) => Object.assign({}, order));
  canWrite = true;
  setSync("live", "Demo");
  render();
}

async function poll() {
  try {
    const data = await readBoard();

    if (!Array.isArray(data.orders)) {
      // doGet answered, but without a board payload: the /exec URL is still
      // serving a script from before this feature existed.
      canWrite = false;
      if (!orders.length) loadDemoOrders();
      else setSync("error", "Re-deploy the Apps Script");
      return;
    }

    demoMode = false;
    orders = data.orders;
    canWrite = true;
    setSync("live", "Live");
    render();
  } catch (err) {
    console.error("Could not read the board.", err);
    if (!orders.length) loadDemoOrders();
    else {
      canWrite = false;
      setSync("error", "Reconnecting");
    }
  }
}

function ticketEl(row) {
  return document.querySelector('.ticket[data-row="' + row + '"]');
}

async function setStatus(order, status) {
  if (!canWrite) {
    console.warn("Cannot update ticket: writes are disabled.");
    setSync("error", "Read-only");
    return;
  }

  pending.set(order.row, { status, at: Date.now() });
  rendered = "";
  render();

  const el = ticketEl(order.row);
  if (el) el.classList.add("is-saving");

  if (demoMode) {
    const known = orders.find((o) => o.row === order.row);
    if (known) known.drinkStatus = status;
    pending.delete(order.row);
    rendered = "";
    render();
    return;
  }

  try {
    await writeStatus(order, status);

    // Trust our own write until a poll confirms it.
    const known = orders.find((o) => o.row === order.row);
    if (known) known.drinkStatus = status;
    pending.delete(order.row);
  } catch (err) {
    console.error("Could not update that ticket.", err);
    pending.delete(order.row);
    setSync("error", "Update failed");
    if (el) el.classList.remove("is-saving");
  }

  rendered = "";
  render();
}

function setSync(state, label) {
  sync.classList.toggle("is-live", state === "live");
  sync.classList.toggle("is-error", state === "error");
  syncText.textContent = label;
}

/* ---------------- rendering ---------------- */
function visibleOrders() {
  const now = Date.now();

  return orders
    .map((order) => {
      const override = pending.get(order.row);
      if (!override) return order;

      // Drop the override once the sheet agrees, or once it has gone stale.
      if (order.drinkStatus === override.status || now - override.at > PENDING_TTL_MS) {
        pending.delete(order.row);
        return order;
      }

      return Object.assign({}, order, { drinkStatus: override.status });
    })
    .filter((order) => order.drinkStatus === IN_PROGRESS || order.drinkStatus === READY)
    .sort((a, b) => a.row - b.row);
}

function render() {
  const list = visibleOrders();
  const signature = JSON.stringify(
    list.map((o) => [o.row, o.firstName, o.lastName, o.company, o.drink, o.drinkStatus])
  );

  // Re-rendering mid-drag would yank the card out from under the pointer.
  if (signature === rendered || dragRow !== null) return;
  rendered = signature;

  for (const status of [IN_PROGRESS, READY]) {
    const column = list.filter((o) => o.drinkStatus === status);
    lists[status].innerHTML = "";
    counts[status].textContent = String(column.length);

    if (!column.length) {
      const empty = document.createElement("p");
      empty.className = "column-empty";
      empty.textContent = EMPTY_COPY[status];
      lists[status].appendChild(empty);
      continue;
    }

    column.forEach((order) => lists[status].appendChild(ticket(order)));
  }
}

const ICON_CHECK =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" ' +
  'stroke-linecap="round" stroke-linejoin="round"><path d="m5 13 4 4L19 7" /></svg>';

const ICON_BAG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
  'stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 4 6v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6l-2-4Z" />' +
  '<path d="M4 6h16M16 10a4 4 0 0 1-8 0" /></svg>';

function ticket(order) {
  const el = document.createElement("article");
  el.className = "receipt ticket";
  el.draggable = true;
  el.dataset.row = String(order.row);

  const isReady = order.drinkStatus === READY;
  const name = [order.firstName, order.lastName].filter(Boolean).join(" ") || "Guest";
  const menuItem = drinkByName(order.drink);

  el.innerHTML =
    '<div class="receipt-tear is-top" aria-hidden="true"></div>' +
    '<div class="receipt-body">' +
    '<div class="receipt-head">' +
    '<div class="receipt-art" aria-hidden="true">' +
    cupArt("t" + order.row, menuItem ? menuItem.art : "", menuItem ? menuItem.layers : null) +
    "</div>" +
    '<p class="receipt-brand">Tea Haus</p>' +
    '<h2 class="receipt-drink">' + escapeHtml(name) + "</h2>" +
    "</div>" +
    '<dl class="receipt-rows">' +
    "<div><dt>Drink</dt><dd>" + escapeHtml(order.drink || "\u2014") + "</dd></div>" +
    "<div><dt>Company</dt><dd>" + escapeHtml(order.company || "\u2014") + "</dd></div>" +
    "</dl>" +
    '<div class="ticket-actions">' +
    '<button class="ticket-btn' + (isReady ? " is-primary" : "") + '" type="button">' +
    (isReady ? ICON_BAG : ICON_CHECK) +
    (isReady ? "Picked up" : "Mark done") +
    "</button>" +
    "</div>" +
    "</div>" +
    '<div class="receipt-tear is-bottom" aria-hidden="true"></div>';

  el.querySelector(".ticket-btn").addEventListener("click", () => {
    setStatus(order, isReady ? PICKED_UP : READY);
  });

  el.addEventListener("dragstart", (e) => {
    dragRow = order.row;
    el.classList.add("is-dragging");
    e.dataTransfer.effectAllowed = "move";
    // Firefox refuses to start a drag without a payload.
    e.dataTransfer.setData("text/plain", String(order.row));
  });

  el.addEventListener("dragend", () => {
    el.classList.remove("is-dragging");
    document.querySelectorAll(".column.is-over").forEach((c) => c.classList.remove("is-over"));
    // drop fires before dragend, but defer clearing dragRow so drop always sees it.
    setTimeout(() => {
      if (!dropHandled) dragRow = null;
      dropHandled = false;
      rendered = "";
      render();
    }, 0);
  });

  return el;
}

function drinkByName(name) {
  const wanted = String(name || "").trim().toLowerCase();
  return DRINKS.find((d) => d.name.toLowerCase() === wanted) || null;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

/* ---------------- drag and drop ---------------- */
document.querySelectorAll(".column").forEach((column) => {
  const target = column.dataset.status;

  function onDragOver(e) {
    if (dragRow === null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    column.classList.add("is-over");
  }

  function onDragLeave(e) {
    if (!column.contains(e.relatedTarget)) column.classList.remove("is-over");
  }

  function onDrop(e) {
    if (dragRow === null) return;
    e.preventDefault();
    column.classList.remove("is-over");

    dropHandled = true;
    const row = dragRow;
    dragRow = null;

    const order = orders.find((o) => o.row === row);
    if (!order) return;

    const held = pending.get(row);
    const current = held ? held.status : order.drinkStatus;
    if (current !== target) setStatus(order, target);
  }

  column.addEventListener("dragover", onDragOver);
  column.addEventListener("dragleave", onDragLeave);
  column.addEventListener("drop", onDrop);

  const list = column.querySelector(".column-list");
  if (list) {
    list.addEventListener("dragover", onDragOver);
    list.addEventListener("dragleave", onDragLeave);
    list.addEventListener("drop", onDrop);
  }
});

/* ---------------- start ---------------- */
render();

if (DEMO || !ENDPOINT) {
  loadDemoOrders();
} else {
  poll();
  setInterval(poll, BOARD_POLL_MS);
  // A board left open all day should catch up the moment it is looked at again.
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) poll();
  });
}
