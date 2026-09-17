/* Live data for recurring.html */
(function(){
  "use strict";

  let allItems = [];
  let activeType = "all";

  function fmt(n){ return MET.formatCurrency(n).replace(/\.00$/, ""); }
  function freqLabel(f){ return f.charAt(0) + f.slice(1).toLowerCase(); }
  function dueDateLabel(iso){
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  function daysUntil(iso){
    const today = new Date(); today.setHours(0,0,0,0);
    const due = new Date(iso);
    return Math.round((due - today) / 86400000);
  }

  function renderStats(items){
    const active = items.filter(function(r){ return !r.isPaused; });
    document.getElementById("statActiveCount").textContent = active.length;
    const monthlyIncome = active.filter(function(r){ return r.type === "INCOME"; }).reduce(function(s,r){ return s + Number(r.amount); }, 0);
    const monthlyOutgo = active.filter(function(r){ return r.type === "EXPENSE"; }).reduce(function(s,r){ return s + Number(r.amount); }, 0);
    document.getElementById("statMonthlyIncome").textContent = fmt(monthlyIncome);
    document.getElementById("statMonthlyOutgo").textContent = fmt(monthlyOutgo);

    const next = active.slice().sort(function(a,b){ return new Date(a.nextDueDate) - new Date(b.nextDueDate); })[0];
    if(next){
      const days = daysUntil(next.nextDueDate);
      document.getElementById("statNextDue").textContent = days <= 0 ? "Today" : (days + (days === 1 ? " day" : " days"));
      document.getElementById("statNextDueLabel").textContent = "Next due — " + next.title;
    } else {
      document.getElementById("statNextDue").textContent = "—";
      document.getElementById("statNextDueLabel").textContent = "Next due";
    }
  }

  function togglePause(id, isPaused, $toggle){
    MET.api.patch("/recurring/" + id, { isPaused: isPaused }).then(function(){
      MET.toastSuccess(isPaused ? "Paused." : "Resumed.");
      const item = allItems.find(function(r){ return r.id === id; });
      if(item) item.isPaused = isPaused;
      renderAll();
    }, function(err){
      $toggle.prop("checked", !isPaused);
      MET.toastError(err.message);
    });
  }

  function renderUpcoming(items){
    const upcoming = items.filter(function(r){ return !r.isPaused; })
      .slice().sort(function(a,b){ return new Date(a.nextDueDate) - new Date(b.nextDueDate); })
      .slice(0, 6);
    const wrap = document.getElementById("upcomingList");
    if(!upcoming.length){
      wrap.innerHTML = '<p class="text-secondary text-center py-3" style="font-size:.85rem;">Nothing upcoming.</p>';
      return;
    }
    wrap.innerHTML = upcoming.map(function(r, i){
      const type = r.type === "INCOME" ? "income" : "expense";
      const sign = type === "income" ? "+" : "-";
      const color = r.category.color;
      const verb = type === "income" ? "Credits" : "Due";
      return '' +
        '<div class="d-flex align-items-center txn-item" data-txn-type="' + type + '">' +
          '<div class="icon-chip" style="background:color-mix(in srgb, ' + MET.esc(color) + ' 16%, transparent);color:' + MET.esc(color) + ';"><i class="bi ' + MET.esc(r.category.icon) + '"></i></div>' +
          '<div class="txn-info"><div class="txn-title" style="color:var(--text-primary);">' + MET.esc(r.title) + '</div><div class="txn-meta">' + freqLabel(r.frequency) + ' • ' + verb + ' ' + dueDateLabel(r.nextDueDate) + ' • ' + MET.paymentMethodLabel(r.paymentMethod) + '</div></div>' +
          '<div class="text-end">' +
            '<div class="txn-amount ' + type + '">' + sign + fmt(r.amount) + '</div>' +
            '<div class="form-check form-switch m-0 d-flex justify-content-end"><input class="form-check-input recur-pause-toggle" data-id="' + r.id + '" type="checkbox" checked style="cursor:pointer;"></div>' +
          '</div>' +
        '</div>' + (i < upcoming.length-1 ? '<hr class="divider list-divider">' : '');
    }).join("");
  }

  function renderAllList(items){
    const wrap = document.getElementById("allRecurringList");
    const filtered = items.filter(function(r){
      const type = r.type === "INCOME" ? "income" : "expense";
      return activeType === "all" || type === activeType;
    });
    if(!filtered.length){
      wrap.innerHTML = '<div class="empty-state py-4"><p>No recurring rules for this filter yet.</p></div>';
      return;
    }
    wrap.innerHTML = filtered.map(function(r, i){
      const type = r.type === "INCOME" ? "income" : "expense";
      const sign = type === "income" ? "+" : "-";
      const pausedBadge = r.isPaused ? ' <span class="badge-soft b-coral ms-1">Paused</span>' : "";
      return '' +
        '<a href="recurring-form.html?id=' + r.id + '" class="d-flex align-items-center txn-item text-decoration-none" data-txn-type="' + type + '" style="' + (r.isPaused ? "opacity:.55;" : "") + '">' +
          '<div class="icon-chip" style="background:color-mix(in srgb, ' + MET.esc(r.category.color) + ' 16%, transparent);color:' + MET.esc(r.category.color) + ';"><i class="bi ' + MET.esc(r.category.icon) + '"></i></div>' +
          '<div class="txn-info"><div class="txn-title" style="color:var(--text-primary);">' + MET.esc(r.title) + pausedBadge + '</div><div class="txn-meta">' + freqLabel(r.frequency) + (r.isPaused ? ' • Paused' : ' • Next ' + dueDateLabel(r.nextDueDate)) + '</div></div>' +
          '<div class="txn-amount ' + (r.isPaused ? '' : type) + '" style="' + (r.isPaused ? "color:var(--text-muted);" : "") + '">' + sign + fmt(r.amount) + '</div>' +
        '</a>' + (i < filtered.length-1 ? '<hr class="divider list-divider">' : '');
    }).join("");
  }

  function renderAll(){
    renderStats(allItems);
    renderUpcoming(allItems);
    renderAllList(allItems);
  }

  $(document).on("change", ".recur-pause-toggle", function(){
    togglePause($(this).data("id"), !this.checked, $(this));
  });

  $(document).on("click", "#recurTypeFilter button", function(){
    activeType = $(this).data("type") || "all";
    renderAllList(allItems);
  });

  function load(){
    MET.api.get("/recurring" + MET.qs({ type: "all" })).then(function(resp){
      allItems = resp.items;
      renderAll();
    }, function(err){
      MET.toastError(err.message || "Couldn't load recurring rules.");
    });
  }

  $(document).ready(load);
})();
