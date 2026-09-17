/* Live data for budget.html */
(function(){
  "use strict";

  const month = MET.currentMonth();
  function fmt(n){ return MET.formatCurrency(n).replace(/\.00$/, ""); }

  function statusBarClass(status){
    return status === "danger" ? "bar-danger" : (status === "warn" ? "bar-warn" : "bar-safe");
  }
  function statusMessage(b){
    const pct = b.percentUsed;
    if(b.status === "danger") return { text: "Over budget by " + fmt(b.spent - Number(b.amount)), color: "var(--accent-coral)" };
    if(b.status === "warn") return { text: pct + "% used — approaching limit", color: "var(--accent-amber-dark)" };
    return { text: pct + "% used — on track", color: "var(--accent-teal-dark)" };
  }

  function renderOverall(overall, month){
    document.getElementById("budgetHeroLabel").textContent = "MONTHLY BUDGET — " + MET.monthLabel(month).toUpperCase();
    if(!overall){
      document.getElementById("budgetHeroAmount").textContent = "Not set";
      document.getElementById("budgetHeroSpentLine").textContent = "No budget for this month";
      document.getElementById("budgetHeroLeft").textContent = "";
      document.getElementById("budgetHeroBar").style.width = "0%";
      document.getElementById("editOverallBudgetLink").href = "budget-form.html";
      return;
    }
    document.getElementById("editOverallBudgetLink").href = "budget-form.html?id=" + overall.id;
    const amount = Number(overall.amount);
    const spent = overall.spent;
    const pct = Math.min(100, overall.percentUsed);
    document.getElementById("budgetHeroAmount").textContent = fmt(amount);
    document.getElementById("budgetHeroSpentLine").textContent = fmt(spent) + " spent (" + overall.percentUsed + "%)";
    document.getElementById("budgetHeroLeft").textContent = fmt(Math.max(0, amount - spent)) + " left";
    document.getElementById("budgetHeroBar").style.width = pct + "%";

    const today = new Date();
    const daysInMonth = new Date(today.getFullYear(), today.getMonth()+1, 0).getDate();
    const daysLeft = daysInMonth - today.getDate();
    const remaining = amount - spent;
    const $status = document.getElementById("budgetHeroStatusLine");
    if(overall.status === "danger"){
      $status.innerHTML = '<i class="bi bi-exclamation-triangle-fill"></i> <span>Over budget by ' + fmt(spent - amount) + ' this month.</span>';
    } else if(daysLeft > 0 && remaining > 0){
      $status.innerHTML = '<i class="bi bi-info-circle"></i> <span>On track — ' + daysLeft + ' days left at ' + fmt(Math.round(remaining / daysLeft)) + '/day to stay within budget</span>';
    } else {
      $status.innerHTML = '<i class="bi bi-info-circle"></i> <span>' + overall.percentUsed + '% of this month\'s budget used.</span>';
    }
  }

  function renderCategories(categories){
    const wrap = document.getElementById("categoryBudgetsCard");
    if(!categories.length){
      wrap.innerHTML = '<div class="empty-state py-4"><p>No per-category budgets yet. <a href="budget-form.html">Add one</a> to track spending limits by category.</p></div>';
      return;
    }
    wrap.innerHTML = categories.map(function(b){
      const msg = statusMessage(b);
      const pct = Math.min(100, b.percentUsed);
      return '' +
        '<a href="budget-form.html?id=' + b.id + '" class="d-block text-decoration-none budget-row">' +
          '<div class="d-flex align-items-center gap-3 mb-2">' +
            '<div class="icon-chip" style="background:color-mix(in srgb, ' + MET.esc(b.category.color) + ' 16%, transparent);color:' + MET.esc(b.category.color) + ';"><i class="bi ' + MET.esc(b.category.icon) + '"></i></div>' +
            '<div class="flex-fill">' +
              '<div class="d-flex justify-content-between"><span class="fw-700" style="font-size:.88rem;color:var(--text-primary);">' + MET.esc(b.category.name) + '</span><span class="text-secondary" style="font-size:.82rem;">' + fmt(b.spent) + ' / ' + fmt(Number(b.amount)) + '</span></div>' +
            '</div>' +
          '</div>' +
          '<div class="progress"><div class="progress-bar ' + statusBarClass(b.status) + '" style="width:' + pct + '%;"></div></div>' +
          '<div class="text-end mt-1" style="font-size:.7rem;color:' + msg.color + ';font-weight:700;">' + msg.text + '</div>' +
        '</a>';
    }).join("");
  }

  function renderAlerts(overall, categories){
    const alerts = [];
    if(overall && overall.status !== "safe"){
      alerts.push({ name: "Overall budget " + (overall.status === "danger" ? "exceeded" : "nearing limit"), detail: overall.percentUsed + "% of " + fmt(Number(overall.amount)) + " used", danger: overall.status === "danger" });
    }
    categories.filter(function(b){ return b.status !== "safe"; }).forEach(function(b){
      alerts.push({
        name: b.category.name + (b.status === "danger" ? " over budget" : " nearing limit"),
        detail: b.status === "danger" ? "Exceeded by " + fmt(b.spent - Number(b.amount)) + " (" + b.percentUsed + "%)" : b.percentUsed + "% of " + fmt(Number(b.amount)) + " used",
        danger: b.status === "danger",
      });
    });
    const wrap = document.getElementById("budgetAlertsCard");
    if(!alerts.length){
      wrap.innerHTML = '<h6 class="mb-3"><i class="bi bi-check-circle-fill text-success me-1"></i>Budget alerts</h6><p class="text-secondary" style="font-size:.85rem;">No alerts — all budgets are on track.</p>';
      return;
    }
    wrap.innerHTML = '<h6 class="mb-3"><i class="bi bi-exclamation-triangle-fill text-warning me-1"></i>Budget alerts</h6>' +
      alerts.map(function(a, i){
        return (i > 0 ? '<hr class="divider my-2">' : '') +
          '<div class="d-flex gap-3 py-2">' +
            '<div class="icon-chip ' + (a.danger ? "chip-coral" : "chip-amber") + '"><i class="bi ' + (a.danger ? "bi-x-circle-fill" : "bi-exclamation-circle-fill") + '"></i></div>' +
            '<div><div class="fw-700" style="font-size:.85rem;">' + MET.esc(a.name) + '</div><div class="text-secondary" style="font-size:.74rem;">' + MET.esc(a.detail) + '</div></div>' +
          '</div>';
      }).join("");
  }

  function renderHistory(items){
    const now = new Date();
    const past = items.filter(function(r){ return new Date(r.monthStart) < new Date(now.getFullYear(), now.getMonth(), 1) && (r.expense > 0 || r.budget > 0); }).slice(-3).reverse();
    const wrap = document.getElementById("budgetHistory");
    if(!past.length){
      wrap.innerHTML = '<p class="text-secondary" style="font-size:.85rem;">No budget history yet.</p>';
      return;
    }
    wrap.innerHTML = past.map(function(r){
      const label = new Date(r.monthStart).toLocaleDateString("en-US", { month: "long", year: "numeric" });
      return '<div class="d-flex justify-content-between py-2" style="font-size:.85rem;"><span class="text-secondary">' + label + '</span><span class="fw-700">' + fmt(r.expense) + ' / ' + fmt(r.budget) + '</span></div>';
    }).join("");
  }

  function load(){
    $.when(
      MET.api.get("/budgets" + MET.qs({ month: month })),
      MET.api.get("/reports/yearly-summary" + MET.qs({ year: new Date().getFullYear() }))
    ).then(function(budgetsResp, yearlyResp){
      renderOverall(budgetsResp.overall, month);
      renderCategories(budgetsResp.categories);
      renderAlerts(budgetsResp.overall, budgetsResp.categories);
      renderHistory(yearlyResp.items);
    }, function(err){
      MET.toastError(err.message || "Couldn't load budgets.");
    });
  }

  $(document).ready(load);
})();
