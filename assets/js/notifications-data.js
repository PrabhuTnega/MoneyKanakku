/* Live data for notifications.html */
(function(){
  "use strict";

  let allItems = [];
  let filter = "all";

  const TYPE_META = {
    BUDGET_ALERT: { icon: "bi-exclamation-triangle-fill", chip: "chip-coral" },
    RECURRING_REMINDER: { icon: "bi-arrow-repeat", chip: "chip-violet" },
    INCOME_RECEIVED: { icon: "bi-arrow-up-circle-fill", chip: "chip-teal" },
    REPORT_READY: { icon: "bi-check-circle-fill", chip: "chip-teal" },
    SECURITY: { icon: "bi-shield-check", chip: "" },
    SYSTEM: { icon: "bi-info-circle-fill", chip: "" },
  };

  function timeLabel(iso){
    const d = new Date(iso);
    const now = new Date();
    const diffMin = Math.round((now - d) / 60000);
    if(diffMin < 1) return "Just now";
    if(diffMin < 60) return diffMin + " minute" + (diffMin===1?"":"s") + " ago";
    if(d.toDateString() === now.toDateString()) return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    const diffHrs = Math.round(diffMin/60);
    if(diffHrs < 24) return diffHrs + " hour" + (diffHrs===1?"":"s") + " ago";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + ", " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }

  function rowHtml(n){
    const meta = TYPE_META[n.type] || TYPE_META.SYSTEM;
    const chipStyle = meta.chip ? "" : 'style="background:var(--surface-soft);color:var(--text-secondary);"';
    return '' +
      '<div class="d-flex gap-3 p-2 rounded-xl position-relative notif-row" data-id="' + n.id + '" data-read="' + n.isRead + '" style="' + (!n.isRead ? "background:var(--brand-50);cursor:pointer;" : "cursor:pointer;") + '">' +
        '<div class="icon-chip ' + meta.chip + '" ' + chipStyle + '><i class="bi ' + meta.icon + '"></i></div>' +
        '<div class="flex-fill">' +
          '<div class="fw-700" style="font-size:.88rem;">' + MET.esc(n.title) + '</div>' +
          '<div class="text-secondary" style="font-size:.8rem;">' + MET.esc(n.message) + '</div>' +
          '<div class="text-muted-c mt-1" style="font-size:.72rem;">' + timeLabel(n.createdAt) + '</div>' +
        '</div>' +
        (!n.isRead ? '<span class="dot-indicator" style="position:static;width:8px;height:8px;margin-top:4px;"></span>' : '') +
      '</div>';
  }

  function render(){
    const filtered = allItems.filter(function(n){
      if(filter === "unread") return !n.isRead;
      if(filter === "alerts") return n.type === "BUDGET_ALERT";
      return true;
    });
    const wrap = document.getElementById("notifList");
    if(!filtered.length){
      wrap.innerHTML = '<div class="empty-state py-5"><div class="es-illustration"><i class="bi bi-bell-slash" style="font-size:3rem;color:var(--text-muted);"></i></div><h6>No notifications</h6><p>You\'re all caught up.</p></div>';
      return;
    }

    const today = new Date();
    const todayItems = filtered.filter(function(n){ return new Date(n.createdAt).toDateString() === today.toDateString(); });
    const earlierItems = filtered.filter(function(n){ return new Date(n.createdAt).toDateString() !== today.toDateString(); });

    let html = "";
    if(todayItems.length){
      html += '<div class="section-title-row"><h6 class="text-secondary" style="text-transform:uppercase;font-size:.72rem;letter-spacing:.05em;">Today</h6></div>' +
        '<div class="surface-card mb-4 p-2 p-lg-3">' + todayItems.map(function(n,i){ return rowHtml(n) + (i<todayItems.length-1 ? '<hr class="divider list-divider">' : ''); }).join("") + '</div>';
    }
    if(earlierItems.length){
      html += '<div class="section-title-row"><h6 class="text-secondary" style="text-transform:uppercase;font-size:.72rem;letter-spacing:.05em;">Earlier</h6></div>' +
        '<div class="surface-card p-2 p-lg-3">' + earlierItems.map(function(n,i){ return rowHtml(n) + (i<earlierItems.length-1 ? '<hr class="divider list-divider">' : ''); }).join("") + '</div>';
    }
    wrap.innerHTML = html;
  }

  $(document).on("click", ".notif-row", function(){
    const id = $(this).data("id");
    const item = allItems.find(function(n){ return n.id === id; });
    if(!item || item.isRead) return;
    item.isRead = true;
    render();
    MET.api.post("/notifications/" + id + "/read").then(function(){
      MET.refreshNotificationBadge();
    }, function(){ /* non-fatal: local UI already reflects read state */ });
  });

  $(document).on("click", "#notifFilter button", function(){
    filter = $(this).data("filter") || "all";
    render();
  });

  function markAllRead(){
    MET.api.post("/notifications/read-all").then(function(){
      allItems.forEach(function(n){ n.isRead = true; });
      render();
      MET.refreshNotificationBadge();
      MET.toastSuccess("All notifications marked as read.");
    }, function(err){ MET.toastError(err.message); });
  }
  $("#markAllReadMobile, #markAllReadDesktop").on("click", markAllRead);

  function load(){
    MET.api.get("/notifications" + MET.qs({ status: "all", pageSize: 50 })).then(function(resp){
      allItems = resp.items;
      render();
    }, function(err){ MET.toastError(err.message || "Couldn't load notifications."); });
  }

  $(document).ready(load);
})();
