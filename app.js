/* =====================
   PulseWatch — app.js
   ===================== */

// ── State ──────────────────────────────────────────────────────────────────

let monitors = [
  { id: 1, name: "Yurwallet",        url: "http://10.10.115.27:6005/",           type: "website",  status: "up",       uptime: 99.97, responseMs: 142, history: genHistory(0.02) },
  { id: 2, name: "Readycash API",   url: "https://api.readycash.com.ng/api/cac-amount",    type: "api",      status: "up",       uptime: 100,   responseMs: 89,  history: genHistory(0) },
  { id: 3, name: "Auth Service",     url: "https://auth.acme.com/ping",          type: "api",      status: "degraded", uptime: 98.1,  responseMs: 540, history: genHistory(0.08) },
  { id: 4, name: "DB Primary",       url: "db-prod-01.acme.internal:5432",       type: "database", status: "up",       uptime: 99.99, responseMs: 3,   history: genHistory(0.005) },
  { id: 5, name: "Prod Server",      url: "10.0.1.10",                           type: "server",   status: "down",     uptime: 95.4,  responseMs: 0,   history: genHistory(0.3) },
  { id: 6, name: "CDN Edge",         url: "https://cdn.acme.com",                type: "website",  status: "up",       uptime: 99.98, responseMs: 24,  history: genHistory(0.01) },
  { id: 7, name: "Payments DB",      url: "db-payments.acme.internal:5432",      type: "database", status: "up",       uptime: 100,   responseMs: 5,   history: genHistory(0) },
  { id: 8, name: "Notification API", url: "https://notify.acme.com/health",      type: "api",      status: "up",       uptime: 99.5,  responseMs: 201, history: genHistory(0.03) },
];

let incidents = [
  { id: 1, name: "Prod Server",   msg: "Connection timeout — host unreachable",   time: "2 min ago",  status: "ongoing",       severity: "down" },
  { id: 2, name: "Auth Service",  msg: "Elevated response times (>500ms)",         time: "18 min ago", status: "investigating",  severity: "degraded" },
  { id: 3, name: "Yurwallet",  msg: "HTTP 503 on /checkout endpoint",           time: "4h ago",     status: "resolved",      severity: "down" },
];

let currentFilter = "all";
let chartInstance = null;
let lastRefreshed = Date.now();

// ── Helpers ────────────────────────────────────────────────────────────────

function genHistory(downProb) {
  return Array.from({ length: 30 }, () => {
    const r = Math.random();
    if (r < downProb * 0.3) return "down";
    if (r < downProb)       return "degraded";
    return "up";
  });
}

function genResponseTrend(baseMs) {
  return Array.from({ length: 30 }, (_, i) =>
    Math.max(10, Math.round(baseMs + (Math.random() - 0.5) * baseMs * 0.4 + Math.sin(i / 4) * 20))
  );
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

  const activeMonitors = monitors.filter(m => m.status !== "down");
  const avgResp = activeMonitors.length
    ? Math.round(activeMonitors.reduce((a, m) => a + m.responseMs, 0) / activeMonitors.length)
    : 0;

  const uptimeClass = parseFloat(avgUptime) > 99 ? "green" : parseFloat(avgUptime) > 95 ? "amber" : "red";
  const incidentClass = (down + degraded) > 0 ? "red" : "green";
  const respClass = avgResp < 200 ? "green" : avgResp < 500 ? "amber" : "red";

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
      <div class="metric-sub">${incidents.filter(i => i.status === "ongoing").length} ongoing</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Avg response</div>
      <div class="metric-value ${respClass}">${avgResp}<span style="font-size:14px;font-weight:400">ms</span></div>
      <div class="metric-sub">across active monitors</div>
    </div>
  `;

  // Global status dot
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

    const respText = m.status === "down" ? "—" : m.responseMs + "ms";

    return `
      <div class="monitor-item" onclick="openMonitorDetail(${m.id})" role="button" tabindex="0"
           onkeydown="if(event.key==='Enter') openMonitorDetail(${m.id})"
           aria-label="${m.name} — ${m.status}">
        <div class="status-dot ${m.status}" aria-hidden="true"></div>
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
        <div class="status-badge ${m.status}">${m.status}</div>
      </div>`;
  }).join("");
}

// ── Render: Incidents ──────────────────────────────────────────────────────

function renderIncidents() {
  document.getElementById("incidentList").innerHTML = incidents.map(i => {
    const itemClass   = i.status === "resolved" ? "resolved" : i.severity;
    const badgeClass  = i.status === "resolved" ? "resolved" : i.status === "investigating" ? "investigating" : "ongoing";
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
  const m    = monitors.find(x => x.name === "Readycash API") || monitors[0];
  const data = genResponseTrend(m.responseMs);
  const ctx  = document.getElementById("sparkline").getContext("2d");

  const dark     = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const lineColor = dark ? "#5dcaa5" : "#1d9e75";
  const gridColor = dark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)";
  const textColor = dark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.35)";

  if (chartInstance) chartInstance.destroy();

  chartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels:   Array.from({ length: 30 }, (_, i) => `-${29 - i}m`),
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
        tooltip: { callbacks: { label: c => c.parsed.y + " ms" } },
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

  monitors.push({
    id:         Date.now(),
    name,
    url,
    type,
    status:     "up",
    uptime:     100.00,
    responseMs: Math.floor(Math.random() * 200 + 50),
    history:    genHistory(0),
  });

  document.getElementById("f-name").value = "";
  document.getElementById("f-url").value  = "";
  toggleAddForm();
  renderAll();
}

// ── Monitor detail ─────────────────────────────────────────────────────────

function openMonitorDetail(id) {
  const m = monitors.find(x => x.id === id);
  if (!m) return;
  alert(
    `Monitor: ${m.name}\n` +
    `URL: ${m.url}\n` +
    `Type: ${m.type}\n` +
    `Status: ${m.status}\n` +
    `Uptime: ${m.uptime}%\n` +
    `Avg response: ${m.responseMs}ms\n\n` +
    `(In a full build this would open a detailed view with incident history, alert config, and drill-down charts.)`
  );
}

// ── Refresh ────────────────────────────────────────────────────────────────

function refreshAll() {
  monitors = monitors.map(m => {
    const rand = Math.random();
    let newStatus = m.status;

    if      (m.status === "up"       && rand < 0.05) newStatus = "degraded";
    else if (m.status === "degraded" && rand < 0.40) newStatus = "up";
    else if (m.status === "down"     && rand < 0.30) newStatus = "degraded";

    const newResp    = newStatus === "down" ? 0 : Math.max(10, Math.round(m.responseMs + (Math.random() - 0.5) * 40));
    const newHistory = [...m.history.slice(1), newStatus];

    return { ...m, status: newStatus, responseMs: newResp, history: newHistory };
  });

  lastRefreshed = Date.now();
  document.getElementById("lastChecked").textContent = "Last checked: just now";
  renderAll();
}

// ── Elapsed time ticker ────────────────────────────────────────────────────

setInterval(() => {
  const secs = Math.floor((Date.now() - lastRefreshed) / 1000);
  const label = secs < 60 ? `${secs}s ago` : `${Math.floor(secs / 60)}m ago`;
  document.getElementById("lastChecked").textContent = `Last checked: ${label}`;
}, 5000);

// ── Utility ────────────────────────────────────────────────────────────────

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Initialise ─────────────────────────────────────────────────────────────

function renderAll() {
  renderMetrics();
  renderMonitors();
  renderIncidents();
  renderChart();
}

renderAll();
