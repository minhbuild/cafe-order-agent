/* ------------------------------------------------------------------
   Agent Runs panel: decorative simulation of scheduled runs firing in
   the background. Purely cosmetic, shares no state with the pages that
   load it, and no-ops when the panel is absent.
------------------------------------------------------------------ */
(function agentRuns() {
  const list = document.getElementById("runsList");
  const counter = document.getElementById("runsCount");
  if (!list || !counter) return;

  // Every agent reuses the #jbot sprite; the .bot variant class supplies the
  // palette, so the run rows stay in sync with the Agents panel.
  const AVATAR = '<svg viewBox="0 0 24 24"><use href="#jbot" /></svg>';

  const TASKS = [
    ["gtm", "LinkedIn lead finder"],
    ["gtm", "X lead finder"],
    ["gtm", "Web forum lead finder"],
    ["gtm", "Lead enrichment"],
    ["gtm", "Find more prospects after calls"],
    ["calls", "Call notes to Notion and HubSpot"],
    ["calls", "Post-call items to Notion doc"],
    ["calls", "Post-call items to Linear tickets"],
    ["chief", "Daily meeting prep"],
    ["chief", "Urgent email alerts"],
    ["chief", "Daily inbox triage"],
    ["chief", "Customer emails to tickets"],
    ["chief", "Daily standup digest"],
    ["revops", "Stalled deal alerts"],
    ["personal", "Weekly meal plan"]
  ];

  const DOTS = '<span class="run-dots"><i></i><i></i><i></i></span>';
  const QUEUED = '<span class="run-queued"></span>';
  const CHECK = '<svg class="run-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg>';

  const MAX_ROWS = 6;
  const MAX_RUNNING = 3;
  const LEAVE_MS = 200;

  const runs = [];
  let timer = 0;

  function relTime(ts) {
    const secs = Math.max(0, Math.round((Date.now() - ts) / 1000));
    if (secs < 45) return "just now";
    const mins = Math.round(secs / 60);
    if (mins < 60) return mins + "m ago";
    return Math.round(mins / 60) + "h ago";
  }

  function paint(run) {
    run.el.classList.toggle("is-running", run.status === "running");
    if (run.status === "running") {
      run.statusEl.innerHTML = DOTS;
    } else if (run.status === "queued") {
      run.statusEl.innerHTML = QUEUED;
    } else {
      run.statusEl.innerHTML = '<span class="run-time"></span>' + CHECK;
      run.statusEl.querySelector(".run-time").textContent = relTime(run.doneAt);
    }
  }

  function buildRow(run) {
    const el = document.createElement("div");
    el.className = "panel-item run-item";

    const bot = document.createElement("span");
    bot.className = "bot " + run.agent;
    bot.setAttribute("aria-hidden", "true");
    bot.innerHTML = AVATAR;

    const name = document.createElement("span");
    name.className = "name";
    name.textContent = run.name;
    name.title = run.name;

    const status = document.createElement("span");
    status.className = "run-status";

    el.append(bot, name, status);
    run.el = el;
    run.statusEl = status;
    paint(run);
    return el;
  }

  function pickTask() {
    const taken = new Set(runs.map((r) => r.name));
    const pool = TASKS.filter((t) => !taken.has(t[1]));
    const src = pool.length ? pool : TASKS;
    return src[Math.floor(Math.random() * src.length)];
  }

  function addRun(status) {
    const task = pickTask();
    const run = { agent: task[0], name: task[1], status: status, doneAt: 0 };
    runs.unshift(run);
    list.prepend(buildRow(run));
  }

  function trim() {
    while (runs.length > MAX_ROWS) {
      let idx = runs.length - 1;
      for (let i = runs.length - 1; i >= 0; i--) {
        if (runs[i].status === "done") { idx = i; break; }
      }
      const el = runs.splice(idx, 1)[0].el;
      el.classList.add("is-leaving");
      setTimeout(() => el.remove(), LEAVE_MS);
    }
  }

  function refresh() {
    let running = 0;
    for (const run of runs) {
      if (run.status === "running") {
        running++;
      } else if (run.status === "done") {
        const time = run.statusEl.querySelector(".run-time");
        if (time) time.textContent = relTime(run.doneAt);
      }
    }
    counter.textContent = running;
  }

  function tick() {
    const running = runs.filter((r) => r.status === "running");
    const queued = runs.filter((r) => r.status === "queued");

    // Resolve the task that has been running longest.
    if (running.length && (running.length >= MAX_RUNNING || Math.random() < 0.7)) {
      const finished = running[running.length - 1];
      finished.status = "done";
      finished.doneAt = Date.now();
      paint(finished);
      running.pop();
    }

    // Pull the next queued task into flight.
    if (queued.length && running.length < MAX_RUNNING) {
      const next = queued[queued.length - 1];
      next.status = "running";
      paint(next);
    }

    // Spin up something new at the top of the list.
    if (Math.random() < 0.75) addRun(Math.random() < 0.35 ? "running" : "queued");

    // Never let the panel go idle.
    if (!runs.some((r) => r.status === "running")) {
      const waiting = runs.filter((r) => r.status === "queued");
      if (waiting.length) {
        waiting[waiting.length - 1].status = "running";
        paint(waiting[waiting.length - 1]);
      } else {
        addRun("running");
      }
    }

    trim();
    refresh();
    schedule();
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (document.hidden) { schedule(); return; }
      tick();
    }, 3000 + Math.random() * 3000);
  }

  [
    ["gtm", "LinkedIn lead finder", "running", 0],
    ["chief", "Daily meeting prep", "running", 0],
    ["calls", "Call notes to Notion and HubSpot", "queued", 0],
    ["revops", "Stalled deal alerts", "done", 70],
    ["gtm", "Lead enrichment", "done", 260],
    ["personal", "Weekly meal plan", "done", 640]
  ].forEach((seed) => {
    const run = { agent: seed[0], name: seed[1], status: seed[2], doneAt: Date.now() - seed[3] * 1000 };
    runs.push(run);
    list.append(buildRow(run));
  });

  refresh();
  schedule();
})();
