/* Live data for admin-live-ops.html — polls the real /admin/live-ops
   endpoint and builds up real rolling sparkline history client-side
   (the endpoint itself only ever returns a snapshot, not history). */
(function(){
  "use strict";

  const POLL_MS = 6000;
  const MAX_POINTS = 20;
  const history = { onlineUsers: [], activeSessions: [], reqPerMin: [], inFlight: [], p50: [], p95: [], p99: [] };
  const sparkCharts = {};
  let latencyChart = null;
  let previousEndpoints = {}; // "METHOD path" -> p95Ms, for slowest-endpoints trend arrows

  function push(key, val){
    history[key].push(val);
    if(history[key].length > MAX_POINTS) history[key].shift();
  }

  function sparkline(canvasId, data, color){
    const canvas = document.getElementById(canvasId);
    if(!canvas) return;
    if(sparkCharts[canvasId]){
      sparkCharts[canvasId].data.labels = data.map(function(_, i){ return i; });
      sparkCharts[canvasId].data.datasets[0].data = data;
      sparkCharts[canvasId].update();
      return;
    }
    sparkCharts[canvasId] = new Chart(canvas, {
      type: "line",
      data: { labels: data.map(function(_, i){ return i; }), datasets: [{ data: data, borderColor: color, backgroundColor: "transparent", borderWidth: 2, pointRadius: 0, tension: 0.35 }] },
      options: {
        responsive: true, maintainAspectRatio: false, animation: { duration: 300 },
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: { x: { display: false }, y: { display: false } }
      }
    });
  }

  function renderLatencyChart(){
    const canvas = document.getElementById("latencyChart");
    if(!canvas) return;
    const labels = history.p50.map(function(_, i){ return i; });
    if(latencyChart){
      latencyChart.data.labels = labels;
      latencyChart.data.datasets[0].data = history.p50;
      latencyChart.data.datasets[1].data = history.p95;
      latencyChart.data.datasets[2].data = history.p99;
      latencyChart.update();
      return;
    }
    const teal = getComputedStyle(document.documentElement).getPropertyValue("--accent-teal").trim();
    const amber = getComputedStyle(document.documentElement).getPropertyValue("--accent-amber").trim();
    const coral = getComputedStyle(document.documentElement).getPropertyValue("--accent-coral").trim();
    latencyChart = new Chart(canvas, {
      type: "line",
      data: { labels: labels, datasets: [
        { label: "p50", data: history.p50, borderColor: teal, backgroundColor: "transparent", borderWidth: 2, pointRadius: 0, tension: 0.35 },
        { label: "p95", data: history.p95, borderColor: amber, backgroundColor: "transparent", borderWidth: 2, pointRadius: 0, tension: 0.35 },
        { label: "p99", data: history.p99, borderColor: coral, backgroundColor: "transparent", borderWidth: 2, pointRadius: 0, tension: 0.35 }
      ] },
      options: {
        responsive: true, maintainAspectRatio: false, animation: { duration: 300 },
        plugins: { legend: { display: false } },
        scales: { x: { display: false }, y: { display: true, ticks: { color: MET.chartAxisColor(), font: { size: 9 }, callback: function(v){ return v + "ms"; } }, grid: { color: MET.chartGrid() } } }
      }
    });
  }

  function fmtUptime(seconds){
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return (d > 0 ? d + "d " : "") + h + "h " + m + "m";
  }

  function methodBadge(method){
    const cls = method === "GET" ? "b-teal" : (method === "POST" ? "b-amber" : (method === "DELETE" ? "b-coral" : "b-violet"));
    return '<span class="badge-soft ' + cls + ' me-1">' + method + '</span>';
  }

  function renderHottest(items){
    const wrap = document.getElementById("hottestEndpointsBody");
    if(!items.length){
      wrap.innerHTML = '<tr><td colspan="4"><p class="text-secondary text-center py-3 mb-0" style="font-size:.85rem;">No requests in the last 5 minutes.</p></td></tr>';
      return;
    }
    wrap.innerHTML = items.map(function(e){
      return '<tr><td>' + methodBadge(e.method) + '<span style="font-family:ui-monospace,monospace;font-size:.8rem;">' + e.path + '</span></td><td class="fw-700">' + e.reqCount + '</td><td>' + e.avgLatencyMs + 'ms</td><td>' + e.pctOfTraffic + '%</td></tr>';
    }).join("");
  }

  function renderSlowest(items){
    const wrap = document.getElementById("slowestEndpointsBody");
    if(!items.length){
      wrap.innerHTML = '<tr><td colspan="4"><p class="text-secondary text-center py-3 mb-0" style="font-size:.85rem;">No requests in the last 15 minutes.</p></td></tr>';
      return;
    }
    const nextPrevious = {};
    wrap.innerHTML = items.map(function(e){
      const key = e.method + " " + e.path;
      const prev = previousEndpoints[key];
      nextPrevious[key] = e.p95Ms;
      let trendIcon = '<i class="bi bi-dash text-secondary"></i>';
      if(prev !== undefined){
        if(e.p95Ms > prev * 1.05) trendIcon = '<i class="bi bi-arrow-up text-danger"></i>';
        else if(e.p95Ms < prev * 0.95) trendIcon = '<i class="bi bi-arrow-down text-success"></i>';
      }
      const color = e.p95Ms >= 400 ? "var(--accent-coral)" : (e.p95Ms >= 150 ? "var(--accent-amber-dark)" : "var(--accent-teal-dark)");
      return '<tr><td>' + methodBadge(e.method) + '<span style="font-family:ui-monospace,monospace;font-size:.8rem;">' + e.path + '</span></td><td class="fw-700" style="color:' + color + ';">' + e.p95Ms + 'ms</td><td>' + e.reqCount + '</td><td>' + trendIcon + '</td></tr>';
    }).join("");
    previousEndpoints = nextPrevious;
  }

  function setHealthBadge(el, dotEl, status){
    const colors = { ok: ["var(--accent-teal-dark)", ""], warn: ["var(--accent-amber-dark)", "warn"], danger: ["var(--accent-coral)", "danger"] };
    const c = colors[status] || colors.ok;
    el.style.color = c[0];
    if(dotEl) dotEl.className = "pulse-dot" + (c[1] ? " " + c[1] : "");
  }

  function poll(){
    MET.api.get("/admin/live-ops").then(function(ops){
      document.getElementById("lastUpdated").textContent = "Updated just now";

      document.getElementById("mOnlineUsers").textContent = ops.goldenSignals.onlineUsers;
      document.getElementById("mActiveSessions").textContent = ops.goldenSignals.activeSessions;
      document.getElementById("mReqPerMin").textContent = ops.goldenSignals.reqPerMinute;
      document.getElementById("mInFlight").textContent = ops.goldenSignals.inFlightRequests;
      push("onlineUsers", ops.goldenSignals.onlineUsers);
      push("activeSessions", ops.goldenSignals.activeSessions);
      push("reqPerMin", ops.goldenSignals.reqPerMinute);
      push("inFlight", ops.goldenSignals.inFlightRequests);
      sparkline("sparkOnlineUsers", history.onlineUsers, getComputedStyle(document.documentElement).getPropertyValue("--accent-teal").trim());
      sparkline("sparkActiveSessions", history.activeSessions, getComputedStyle(document.documentElement).getPropertyValue("--chart-7-violet").trim());
      sparkline("sparkReqPerMin", history.reqPerMin, getComputedStyle(document.documentElement).getPropertyValue("--chart-1-blue").trim());
      sparkline("sparkInFlight", history.inFlight, getComputedStyle(document.documentElement).getPropertyValue("--accent-amber").trim());

      const conn = ops.database;
      document.getElementById("dbConnections").textContent = conn.connectionsUsed + " / " + conn.connectionsMax;
      const connPct = conn.connectionsMax ? Math.round((conn.connectionsUsed / conn.connectionsMax) * 100) : 0;
      const $bar = document.getElementById("dbConnBar");
      $bar.style.width = connPct + "%";
      $bar.className = "progress-bar " + (connPct >= 90 ? "bar-danger" : (connPct >= 70 ? "bar-warn" : "bar-safe"));
      document.getElementById("dbCacheHit").textContent = conn.cacheHitRatioPct !== null ? conn.cacheHitRatioPct + "%" : "—";
      document.getElementById("dbSize").textContent = conn.databaseSize;
      document.getElementById("dbSlowQueries").textContent = conn.slowQueries;
      setHealthBadge(
        document.getElementById("dbHealthBadge"),
        document.getElementById("dbHealthDot"),
        conn.slowQueries > 0 ? "warn" : "ok"
      );
      document.getElementById("dbHealthBadge").lastChild.textContent = conn.slowQueries > 0 ? "Degraded" : "Healthy";

      const lat = ops.apiLatency;
      document.getElementById("latP50").textContent = lat.p50 !== null ? lat.p50 + "ms" : "—";
      document.getElementById("latP95").textContent = lat.p95 !== null ? lat.p95 + "ms" : "—";
      document.getElementById("latP99").textContent = lat.p99 !== null ? lat.p99 + "ms" : "—";
      push("p50", lat.p50 || 0); push("p95", lat.p95 || 0); push("p99", lat.p99 || 0);
      renderLatencyChart();
      document.getElementById("statusSplitLine").innerHTML =
        '<span style="color:var(--accent-teal-dark);">' + (lat.pct2xx ?? 0) + '%</span> / <span style="color:var(--accent-amber-dark);">' + (lat.pct4xx ?? 0) + '%</span> / <span style="color:var(--accent-coral);">' + (lat.pct5xx ?? 0) + '%</span>';
      const latencyBadge = document.getElementById("latencyHealthBadge");
      const latStatus = lat.p95 !== null && lat.p95 > 500 ? "danger" : (lat.p95 !== null && lat.p95 > 200 ? "warn" : "ok");
      setHealthBadge(latencyBadge, latencyBadge.querySelector(".pulse-dot"), latStatus);
      latencyBadge.lastChild.textContent = latStatus === "ok" ? "Nominal" : (latStatus === "warn" ? "Elevated" : "Degraded");

      const proc = ops.process;
      document.getElementById("processUptime").textContent = fmtUptime(proc.uptimeSeconds);
      document.getElementById("processSince").textContent = new Date(proc.startedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
      document.getElementById("memRss").textContent = proc.memoryRssMb + " MB";
      document.getElementById("nodeVersion").textContent = proc.nodeVersion;
      document.getElementById("processPid").textContent = proc.pid;

      renderHottest(ops.hottestEndpoints);
      renderSlowest(ops.slowestEndpoints);
    }, function(err){
      document.getElementById("lastUpdated").textContent = "Update failed";
      MET.toastError(err.message || "Couldn't refresh Live Ops.");
    });
  }

  $(document).ready(function(){
    poll();
    setInterval(poll, POLL_MS);
  });
})();
