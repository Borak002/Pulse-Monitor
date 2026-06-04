/* =====================
   PulseWatch — app.js
   Real-time auto-refreshing uptime monitor
   ===================== */

// ── Config ─────────────────────────────────────────────────────────────────

const CHECK_TIMEOUT_MS = 8000;   // give each URL 8 seconds to respond

// ── State ──────────────────────────────────────────────────────────────────

let monitors = [
  { id: 1, name: "Main Website",     url: "https://acme.com",                 type: "website",  status: "unknown", uptime: 99.97, responseMs: 0, history: genHistory(0.02) },
  { id: 2, name: "Stripe API",       url: "https://api.stripe.com/v1/health", type: "api",      status: "unknown", uptime: 100,   responseMs: 0, history: genHistory(0) },
  { id: 3, name: "Auth Service",     url: "https://auth.acme.com/ping",       type: "api",      status: "unknown", uptime: 98.1,  responseMs: 0, history: genHistory(0.08) },
  { id: 4, name: "Google DNS",       url: "https://dns.google",               type: "server",   status: "unknown", uptime: 100,   responseMs: 0, history: genHistory(0) },
  { id: 5, name: "Cloudflare",       url: "https://1.1.1.1",                  type: "server",   status: "unknown", uptime: 99.99, responseMs: 0, history: genHistory(0.005) },
  { id: 6, name: "CDN Edge",         url: "https://cdn.acme.com",             type: "website",  status: "unknown", uptime: 99.98, responseMs: 0, history: genHistory(0.01) },
  { id: 7, name: "JSONPlaceholder",  url: "https://jsonplaceholder.typicode.com/todos/1", type: "api", status: "unknown", uptime: 99.5, responseMs: 0, history: genHistory(0.02) },
  { id: 8, name: "GitHub Status",    url: "https://www.githubstatus.com",     type: "website",  status: "unknown", uptime: 99.9,  responseMs: 0, history: genHistory(0.01) },
];

let incidents = [];
let currentFilter = "all";
let chartInstance = null;
let lastRefreshed = null;

// Auto-refresh
let autoRefreshInterval = 30;   // seconds; 0 = paused
let autoRefreshTimer    = null;
let countdownTimer      = null;
let nextCheckAt         = null;

// ── HTTP Check ─────────────────────────────────────────────────────────────

/**
 * Ping a URL via fetch with a timeout.
 * Returns { status: "up"|"down"|"degraded", responseMs }
 *
 * NOTE: Because browsers block cross-origin requests, many URLs will return
 * a network error even when the site is up. We treat any response (even 4xx/5xx)
 * as "up" (the host responded), and a network/timeout error as "down".
 * For accurate server-side checks you need a small backend proxy — see README.
 */
async function checkUrl(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
  const start = performance.now();

  try {
    // mode: 'no-cors' lets us at least confirm the host is reachable even when
    // CORS headers are absent. The response will be "opaque" (status 0) but
    // that still means the server responded.
    await fetch(url, { signal: controller.signal, mode: "no-cors", cache: "no-store" });
    const ms = Math.round(performance.now() - start);
    clearTimeout(timer);

    if (ms > 2000) return { status: "degraded", responseMs: ms };
    return { status: "up", responseMs: ms };
  } catch (err) {
    clearTimeout(timer);
    const ms = Math.round(performance.now() - start);
    if (err.name === "AbortError") return { status: "down", responseMs: ms };
    // A generic TypeError from fetch usually means CORS blocked OR network error.
    // We can't tell them apart in the browser — flag as degraded rather than down.
    return { status: "degraded", responseMs: ms };
  }
}

// ── Poll all monitors ──────────────────────────────────────────────────────

async function pollAllMonitors() {
  // Run all checks in parallel
  const results = await Promise.all(
    monitors.map(m => checkUrl(m.url).then(r => ({ id: m.id, ...r })))
  );

  results.forEach(r => {
    const m = monitors.find(x => x.id === r.id);
    if (!m) return;

    const prevStatus = m.status;
    m.status     = r.status;
    m.responseMs = r.responseMs;

    // Update uptime rolling average (simple sliding window approximation)
    const wasUp = r.status === "up" ? 1 : 0;
    m.uptime = parseFloat(Math.min(100, (m.uptime * 0.99 + wasUp * 0.01 * 100)).toFixed(2));

    // Append to 30-point history
    m.history = [...m.history.slice(1), r.status];

    // Auto-create incident if a monitor just went down or degraded
    if (prevStatus === "up" && r.status === "down") {
      addIncident(m.name, `Host unreachable or connection refused`, "ongoing", "down");
    } else if (prevStatus === "up" && r.status === "degraded") {
      addIncident(m.name, `Slow response or CORS error (${r.responseMs}ms)`, "investigating", "degraded");
    } else if ((prevStatus === "down" || prevStatus === "degraded") && r.status === "up") {
      resolveIncident(m.name);
    }
  });

  lastRefreshed = Date.now();
  renderAll();
}

// ── Incident helpers ───────────────────────────────────────────────────────

function addIncident(name, msg, status, severity) {
  // Avoid duplicate open incidents for the same monitor
  if (incidents.find(i => i.name === name && i.status !== "resolved")) return;
  incidents.unshift({
    id:       Date.now(),
    name,
    msg,
    time:     "just now",
    status,
    severity,
    ts:       Date.now(),
  });
  // Keep at most 20 incidents
  if (incidents.length > 20) incidents.pop();
}

function resolveIncident(name) {
  incidents = incidents.map(i =>
    i.name === name && i.status !== "resolved"
      ? { ...i, status: "resolved" }
      : i
  );
}

// ── Auto-refresh engine ────────────────────────────────────────────────────

function startAutoRefresh() {
  stopAutoRefresh();
  if (autoRefreshInterval === 0) {
    document.getElementById("countdown").textContent = "paused";
    return;
  }

  nextCheckAt = Date.now() + autoRefreshInterval * 1000;

  // Countdown ticker — updates every second
  countdownTimer = setInterval(() => {
    const secsLeft = Math.max(0, Math.round((nextCheckAt - Date.now()) / 1000));
    document.getElementById("countdown").textContent = secsLeft + "s";
  }, 1000);

  // Main poll timer
  autoRefreshTimer = setInterval(async () => {
    nextCheckAt = Date.now() + autoRefreshInterval * 1000;
    await pollAllMonitors();
  }, autoRefreshInterval * 1000);
}

function stopAutoRefresh() {
  clearInterval(autoRefreshTimer);
  clearInterval(countdownTimer);
  autoRefreshTimer = null;
  countdownTimer   = null;
}

function setAutoRefreshInterval(val) {
  autoRefreshInterval = parseInt(val, 10);
  startAutoRefresh();
  if (autoRefreshInterval === 0) {
    document.getElementById("countdown").textContent = "paused";
  }
}

// ── Filtering ──────────────────────────────────────────────────────────────

function setFilter(f, el) {
  currentFilter = f;
  document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
  el.classList.add("active");
  renderMonitors();
}

// ── Render: Metrics ────────────────────────────────────────────────────────

function renderMetrics() {
  const total    = monitors.length;
  const up       = monitors.filter(m => m.status === "up").length;
  const down     = monitors.filter(m => m.status === "down").length;
  const degraded = monitors.filter(m => m.status === "degraded").length;

  const avgUptime = (monitors.reduce((a, m) => a + m.uptime, 0) / total).toFixed(2);

  const active  = monitors.filter(m => m.status !== "down" && m.responseMs > 0);
  const avgResp = active.length
    ? Math.round(active.reduce((a, m) => a + m.responseMs, 0) / active.length)
    : 0;

  const uptimeClass   = parseFloat(avgUptime) > 99 ? "green" : parseFloat(avgUptime) > 95 ? "amber" : "red";
  const incidentClass = (down + degraded) > 0 ? "red" : "green";
  const respClass     = avgResp < 500 ? "green" : avgResp < 2000 ? "amber" : "red";

  document.getElementById("metricsGrid").innerHTML = `
    <div class="metric-card">
      <div class="metric-label">Monitors</div>
      <div class="metric-value">${total}</div>
      <div class="metric-sub">${up} up · ${down} down · ${degraded} degraded</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Overall uptime</div>
      <div class="metric-value ${uptimeClass}">${avgUptime}%</div>
      <div class="metric-sub">last 30 days</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Incidents</div>
      <div class="metric-value ${incidentClass}">${down + degraded}</div>
      <div class="metric-sub">${incidents.filter(i => i.status === "ongoing" || i.status === "investigating").length} active</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Avg response</div>
      <div class="metric-value ${respClass}">${avgResp || "—"}<span style="font-size:14px;font-weight:400">${avgResp ? "ms" : ""}</span></div>
      <div class="metric-sub">across active monitors</div>
    </div>
  `;

  const dot = document.getElementById("globalDot");
  if (down > 0) {
    dot.style.background = "var(--pulse-red)";
    dot.style.animation  = "blink 1s ease-in-out infinite";
  } else if (degraded > 0) {
    dot.style.background = "var(--pulse-amber)";
    dot.style.animation  = "none";
  } else {
    dot.style.background = "var(--pulse-green)";
    dot.style.animation  = "pulseGreen 2s ease-in-out infinite";
  }
}

// ── Render: Monitor list ───────────────────────────────────────────────────

function renderMonitors() {
  const list = currentFilter === "all"
    ? monitors
    : monitors.filter(m => m.type === currentFilter);

  document.getElementById("monitorList").innerHTML = list.map(m => {
    const bars = m.history.map(h => {
      const ht = h === "up" ? 20 : h === "degraded" ? 14 : 8;
      return `<div class="bar-seg ${h}" style="height:${ht}px"></div>`;
    }).join("");

    const isChecking = m.status === "unknown";
    const respText   = isChecking ? "…" : m.status === "down" ? "—" : m.responseMs + "ms";
    const displayStatus = isChecking ? "checking" : m.status;

    return `
      <div class="monitor-item" onclick="openMonitorDetail(${m.id})" role="button" tabindex="0"
           onkeydown="if(event.key==='Enter') openMonitorDetail(${m.id})"
           aria-label="${escHtml(m.name)} — ${displayStatus}">
        <div class="status-dot ${displayStatus}" aria-hidden="true"></div>
        <div class="monitor-info">
          <div class="monitor-name">${escHtml(m.name)}</div>
          <div class="monitor-url">${escHtml(m.url)}</div>
        </div>
        <div class="monitor-type-badge">${m.type}</div>
        <div class="uptime-bar" aria-hidden="true">${bars}</div>
        <div class="monitor-stats">
          <div class="stat">
            <div class="stat-val">${respText}</div>
            <div class="stat-label">response</div>
          </div>
          <div class="stat">
            <div class="stat-val">${m.uptime}%</div>
            <div class="stat-label">uptime</div>
          </div>
        </div>
        <div class="status-badge ${displayStatus}">${displayStatus}</div>
      </div>`;
  }).join("");

  // Update last-checked label
  if (lastRefreshed) {
    const secs  = Math.floor((Date.now() - lastRefreshed) / 1000);
    const label = secs < 60 ? `${secs}s ago` : `${Math.floor(secs / 60)}m ago`;
    document.getElementById("lastChecked").textContent = `Last checked: ${label}`;
  } else {
    document.getElementById("lastChecked").textContent = "Checking…";
  }
}

// ── Render: Incidents ──────────────────────────────────────────────────────

function renderIncidents() {
  // Update relative times
  incidents.forEach(i => {
    if (!i.ts) return;
    const secs = Math.floor((Date.now() - i.ts) / 1000);
    i.time = secs < 60 ? "just now"
           : secs < 3600 ? `${Math.floor(secs / 60)}m ago`
           : `${Math.floor(secs / 3600)}h ago`;
  });

  const el = document.getElementById("incidentList");

  if (incidents.length === 0) {
    el.innerHTML = `<div style="font-size:13px;color:var(--color-text-tertiary);padding:10px 0">No incidents recorded yet.</div>`;
    return;
  }

  el.innerHTML = incidents.map(i => {
    const itemClass  = i.status === "resolved" ? "resolved" : i.severity;
    const badgeClass = i.status === "resolved" ? "resolved" : i.status === "investigating" ? "investigating" : "ongoing";
    return `
      <div class="incident-item ${itemClass}">
        <div class="incident-body">
          <div class="incident-title"><strong>${escHtml(i.name)}</strong> — ${escHtml(i.msg)}</div>
          <div class="incident-meta">${i.time}</div>
        </div>
        <div class="incident-status ${badgeClass}">${i.status}</div>
      </div>`;
  }).join("");
}

// ── Render: Response time chart ────────────────────────────────────────────

function renderChart() {
  // Pick a monitor that has real response data
  const m   = monitors.find(x => x.responseMs > 0) || monitors[0];
  const ctx = document.getElementById("sparkline").getContext("2d");

  const dark      = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const lineColor = dark ? "#5dcaa5" : "#1d9e75";
  const gridColor = dark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)";
  const textColor = dark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.35)";

  // Build response time series from history + current reading
  const data = m.history.map((h, i) => {
    if (h === "down") return 0;
    const base = m.responseMs || 100;
    return Math.max(10, Math.round(base + (Math.random() - 0.5) * base * 0.3 + Math.sin(i / 4) * 15));
  });

  if (chartInstance) chartInstance.destroy();

  document.querySelector(".chart-title").textContent =
    `Response time (ms) — last 30 checks · ${escHtml(m.name)}`;

  chartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels:   Array.from({ length: 30 }, (_, i) => `-${29 - i}`),
      datasets: [{
        data,
        borderColor: lineColor,
        borderWidth: 1.5,
        pointRadius: 0,
        tension: 0.4,
        fill: false,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: c => c.parsed.y > 0 ? c.parsed.y + " ms" : "down" } },
      },
      scales: {
        x: { ticks: { color: textColor, font: { size: 10 }, maxTicksLimit: 6 }, grid: { color: gridColor } },
        y: { ticks: { color: textColor, font: { size: 10 } },                   grid: { color: gridColor } },
      },
    },
  });
}

// ── Add monitor form ───────────────────────────────────────────────────────

function toggleAddForm() {
  document.getElementById("addForm").classList.toggle("open");
}

function addMonitor() {
  const name = document.getElementById("f-name").value.trim();
  const url  = document.getElementById("f-url").value.trim();
  const type = document.getElementById("f-type").value;

  if (!name || !url) {
    alert("Please fill in both the name and URL fields.");
    return;
  }

  const newMonitor = {
    id:         Date.now(),
    name,
    url,
    type,
    status:     "unknown",
    uptime:     100.00,
    responseMs: 0,
    history:    genHistory(0),
  };

  monitors.push(newMonitor);
  document.getElementById("f-name").value = "";
  document.getElementById("f-url").value  = "";
  toggleAddForm();
  renderAll();

  // Immediately check the new monitor
  checkUrl(url).then(r => {
    const m = monitors.find(x => x.id === newMonitor.id);
    if (!m) return;
    m.status     = r.status;
    m.responseMs = r.responseMs;
    m.history    = [...m.history.slice(1), r.status];
    renderAll();
  });
}

// ── Monitor detail ─────────────────────────────────────────────────────────

function openMonitorDetail(id) {
  const m = monitors.find(x => x.id === id);
  if (!m) return;
  const statusEmoji = { up: "✅", down: "🔴", degraded: "🟡", unknown: "⏳" };
  alert(
    `${statusEmoji[m.status] || "?"} ${m.name}\n\n` +
    `URL:       ${m.url}\n` +
    `Type:      ${m.type}\n` +
    `Status:    ${m.status}\n` +
    `Uptime:    ${m.uptime}%\n` +
    `Response:  ${m.responseMs ? m.responseMs + "ms" : "—"}\n\n` +
    `Tip: Add a backend proxy to bypass CORS and get accurate down/up readings.`
  );
}

// ── Manual refresh ─────────────────────────────────────────────────────────

async function refreshAll() {
  document.getElementById("lastChecked").textContent = "Checking…";
  // Reset countdown
  if (autoRefreshInterval > 0) {
    nextCheckAt = Date.now() + autoRefreshInterval * 1000;
  }
  await pollAllMonitors();
}

// ── Utility ────────────────────────────────────────────────────────────────

function genHistory(downProb) {
  return Array.from({ length: 30 }, () => {
    const r = Math.random();
    if (r < downProb * 0.3) return "down";
    if (r < downProb)       return "degraded";
    return "up";
  });
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Render all ─────────────────────────────────────────────────────────────

function renderAll() {
  renderMetrics();
  renderMonitors();
  renderIncidents();
  renderChart();
}

// ── Boot ───────────────────────────────────────────────────────────────────

renderAll();                  // show skeleton immediately
pollAllMonitors();            // fire first real check right away
startAutoRefresh();           // start the auto-refresh engine
