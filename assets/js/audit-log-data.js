/* Live data for admin-audit-logs.html */
(function(){
  "use strict";

  const ACTION_META = {
    CREATE:        { badge: "b-teal",  color: "var(--accent-teal-dark)", icon: "bi-plus-circle-fill" },
    UPDATE:        { badge: "b-amber", color: "var(--accent-amber-dark)", icon: "bi-pencil-fill" },
    DELETE:        { badge: "b-coral", color: "var(--accent-coral)", icon: "bi-trash-fill" },
    RESTORE:       { badge: "b-violet",color: "var(--brand-600)", icon: "bi-arrow-counterclockwise" },
    LOGIN:         { badge: "b-teal",  color: "var(--accent-teal-dark)", icon: "bi-box-arrow-in-right" },
    LOGOUT:        { badge: "b-gray",  color: "var(--text-secondary)", icon: "bi-box-arrow-right" },
    LOGIN_FAILED:  { badge: "b-coral", color: "var(--accent-coral)", icon: "bi-shield-exclamation" }
  };

  let action = "";
  let entityType = "";
  let date = "";
  let page = 1;
  const pageSize = 20;
  let currentItems = [];

  function actionLabel(a){
    return a.replace("_", " ").replace(/\w\S*/g, function(t){ return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase(); });
  }
  function fmtTime(iso){
    const d = new Date(iso);
    const now = new Date();
    const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    if(d.toDateString() === now.toDateString()) return "Today, " + time;
    const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
    if(d.toDateString() === yesterday.toDateString()) return "Yesterday, " + time;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + ", " + time;
  }

  function renderTable(items){
    const tbody = document.getElementById("auditTableBody");
    if(!items.length){
      tbody.innerHTML = '<tr><td colspan="6"><div class="empty-state py-4"><p>No events match this filter.</p></div></td></tr>';
      return;
    }
    tbody.innerHTML = items.map(function(e, i){
      const meta = ACTION_META[e.action] || ACTION_META.UPDATE;
      const label = actionLabel(e.action);
      const userLabel = e.user ? e.user.name : (e.action === "LOGIN_FAILED" ? "Unknown" : "System");
      const avatarInitials = e.user ? MET.initials(e.user.name) : (e.action === "LOGIN_FAILED" ? "?" : "⚙");
      return '' +
        '<tr>' +
          '<td class="text-secondary" style="font-size:.82rem;white-space:nowrap;">' + fmtTime(e.createdAt) + '</td>' +
          '<td><div class="d-flex align-items-center gap-2"><div class="avatar avatar-sm" style="background:var(--brand-100);font-size:.7rem;">' + MET.esc(avatarInitials) + '</div>' + MET.esc(userLabel) + '</div></td>' +
          '<td><span class="badge-soft ' + meta.badge + '"><i class="bi ' + meta.icon + ' me-1"></i>' + label + '</span></td>' +
          '<td>' + MET.esc(e.entityType) + ' <span class="text-muted-c" style="font-size:.74rem;">#' + MET.esc(String(e.entityId).slice(-8)) + '</span></td>' +
          '<td class="text-secondary" style="font-size:.82rem;">' + MET.esc(e.ipAddress || "—") + '</td>' +
          '<td class="text-end"><button class="btn btn-sm btn-outline-soft ripple-surface" data-event-index="' + i + '">View</button></td>' +
        '</tr>';
    }).join("");

    tbody.querySelectorAll("[data-event-index]").forEach(function(btn){
      btn.addEventListener("click", function(){ openDetail(currentItems[parseInt(this.getAttribute("data-event-index"), 10)]); });
    });
  }

  function openDetail(e){
    const meta = ACTION_META[e.action] || ACTION_META.UPDATE;
    const userLabel = e.user ? e.user.name + " (" + e.user.email + ")" : (e.action === "LOGIN_FAILED" ? "Unknown" : "System");
    const body = document.getElementById("eventDetailBody");
    body.innerHTML = '' +
      '<div class="d-flex align-items-center gap-3 mb-4">' +
        '<div class="icon-chip" style="background:color-mix(in srgb, ' + meta.color + ' 16%, transparent); color:' + meta.color + ';"><i class="bi ' + meta.icon + '"></i></div>' +
        '<div>' +
          '<div class="fw-700">' + actionLabel(e.action) + ' — ' + MET.esc(e.entityType) + '</div>' +
          '<div class="text-secondary" style="font-size:.8rem;">' + fmtTime(e.createdAt) + ' • by ' + MET.esc(userLabel) + ' • ' + MET.esc(e.ipAddress || "—") + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="row g-3">' +
        (e.oldValues ? '<div class="col-12 col-md-6"><div class="text-secondary fw-700 mb-2" style="font-size:.75rem;text-transform:uppercase;">Before</div><div class="diff-box">' + MET.esc(JSON.stringify(e.oldValues, null, 2)) + '</div></div>' : '') +
        (e.newValues ? '<div class="col-12 col-md-6"><div class="text-secondary fw-700 mb-2" style="font-size:.75rem;text-transform:uppercase;">After</div><div class="diff-box">' + MET.esc(JSON.stringify(e.newValues, null, 2)) + '</div></div>' : '') +
        (!e.oldValues && !e.newValues ? '<div class="col-12"><p class="text-secondary mb-0" style="font-size:.85rem;">No field-level changes recorded for this event type.</p></div>' : '') +
      '</div>';
    new bootstrap.Modal(document.getElementById("eventDetailModal")).show();
  }

  function nextDay(dateStr){
    const d = new Date(dateStr + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString();
  }

  function load(){
    document.getElementById("auditTableBody").innerHTML = '<tr><td colspan="6"><div class="section-loading" style="min-height:100px;"></div></td></tr>';
    MET.api.get("/admin/audit-logs" + MET.qs({
      action: action || undefined,
      entityType: entityType || undefined,
      from: date || undefined,
      to: date ? nextDay(date) : undefined,
      page: page,
      pageSize: pageSize
    })).then(function(resp){
      currentItems = resp.items;
      renderTable(resp.items);
      document.getElementById("statEventsToday").textContent = resp.stats.eventsToday;
      document.getElementById("statDeletionsToday").textContent = resp.stats.deletionsToday;
      document.getElementById("statFailedLoginsToday").textContent = resp.stats.failedLoginsToday;
      document.getElementById("statTotalEvents").textContent = resp.total;

      const start = resp.items.length ? (page - 1) * pageSize + 1 : 0;
      const end = (page - 1) * pageSize + resp.items.length;
      document.getElementById("auditShowingLine").textContent = "Showing " + start + "-" + end + " of " + resp.total + " events";
      document.getElementById("auditPrevPage").disabled = page <= 1;
      document.getElementById("auditNextPage").disabled = end >= resp.total;
    }, function(err){
      MET.toastError(err.message || "Couldn't load audit logs.");
    });
  }

  $("#actionFilterDesktop .filter-chip, #actionFilterMobile .filter-chip").on("click", function(){
    action = $(this).data("action") || "";
    page = 1;
    // keep both chip rows (desktop/mobile duplicates) visually in sync
    const val = $(this).data("action");
    $("#actionFilterDesktop .filter-chip, #actionFilterMobile .filter-chip").removeClass("active");
    $("#actionFilterDesktop .filter-chip[data-action='" + val + "'], #actionFilterMobile .filter-chip[data-action='" + val + "']").addClass("active");
    load();
  });

  $("#entityFilterDesktop").on("change", function(){
    entityType = this.value;
    $("#entityFilterMobile").val(this.value);
    page = 1;
    load();
  });
  $("#applyMobileFilters").on("click", function(){
    entityType = $("#entityFilterMobile").val();
    date = $("#dateFilterMobile").val();
    $("#entityFilterDesktop").val(entityType);
    $("#dateFilterDesktop").val(date);
    page = 1;
    load();
  });
  $("#dateFilterDesktop").on("change", function(){
    date = this.value;
    $("#dateFilterMobile").val(date);
    page = 1;
    load();
  });

  $("#auditPrevPage").on("click", function(){ if(page > 1){ page--; load(); } });
  $("#auditNextPage").on("click", function(){ page++; load(); });

  $(document).ready(load);
})();
