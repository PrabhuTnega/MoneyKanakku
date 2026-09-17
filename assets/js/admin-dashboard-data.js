/* Live data for admin-dashboard.html */
(function(){
  "use strict";

  function fmt(n){ return MET.formatCurrency(n).replace(/\.00$/, ""); }

  function renderStats(o){
    document.getElementById("statTotalUsers").textContent = o.totalUsers;
    document.getElementById("statActiveUsers").textContent = o.activeUsers;
    document.getElementById("statGlobalCategories").textContent = o.globalCategories;
    document.getElementById("statIncomeTracked").textContent = fmt(o.incomeTracked);
    document.getElementById("statExpenseTracked").textContent = fmt(o.expenseTracked);
    document.getElementById("statNetTracked").textContent = (o.netTracked >= 0 ? "+" : "-") + fmt(Math.abs(o.netTracked));
  }

  function renderSignupsChart(signups){
    const canvas = document.getElementById("signupsChart");
    if(!canvas || typeof Chart === "undefined") return;
    const blue = getComputedStyle(document.documentElement).getPropertyValue("--chart-1-blue").trim();
    const existing = Chart.getChart(canvas);
    if(existing) existing.destroy();
    new Chart(canvas, {
      type: "bar",
      data: {
        labels: signups.map(function(s){ return new Date(s.month).toLocaleDateString("en-US", { month: "short" }); }),
        datasets: [{ label: "New signups", data: signups.map(function(s){ return s.count; }), backgroundColor: blue, borderRadius: 6, maxBarThickness: 40 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { color: MET.chartAxisColor(), font: { size: 11 } } },
          y: { grid: { color: MET.chartGrid() }, ticks: { color: MET.chartAxisColor(), font: { size: 11 }, precision: 0 } }
        }
      }
    });
  }

  function renderRecentUsers(items){
    document.getElementById("recentUsersBody").innerHTML = items.map(function(u){
      const joined = new Date(u.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      const statusBadge = u.isActive ? '<span class="badge-soft b-teal">Active</span>' : '<span class="badge-soft b-gray">Inactive</span>';
      return '<tr><td><div class="d-flex align-items-center gap-2"><div class="avatar avatar-sm" style="background:var(--brand-100);">' + MET.esc(MET.initials(u.name)) + '</div>' + MET.esc(u.name) + '</div></td><td>' + MET.esc(u.email) + '</td><td>' + joined + '</td><td>' + statusBadge + '</td></tr>';
    }).join("");
  }

  function renderHealth(ops){
    document.getElementById("healthLatency").textContent = ops.apiLatency.p95 !== null ? ops.apiLatency.p95 + "ms (p95)" : "No traffic yet";
    document.getElementById("healthCacheHit").textContent = ops.database.cacheHitRatioPct !== null ? ops.database.cacheHitRatioPct + "%" : "—";
    document.getElementById("healthDbSize").textContent = ops.database.databaseSize;
  }

  function load(){
    $.when(
      MET.api.get("/admin/overview"),
      MET.api.get("/admin/users" + MET.qs({ pageSize: 4 })),
      MET.api.get("/admin/live-ops")
    ).then(function(overview, usersResp, liveOps){
      renderStats(overview);
      renderSignupsChart(overview.signupsByMonth);
      renderRecentUsers(usersResp.items);
      renderHealth(liveOps);
    }, function(err){
      MET.toastError(err.message || "Couldn't load the admin overview.");
    });
  }

  $(document).ready(function(){
    if(document.fonts && document.fonts.ready){ document.fonts.ready.then(load); } else { load(); }
  });
})();
