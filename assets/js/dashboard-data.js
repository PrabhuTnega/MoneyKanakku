/* Live data + chart rendering for dashboard.html — replaces the earlier
   hardcoded demo arrays with real MET.api calls. */
(function(){
  "use strict";

  const month = MET.currentMonth();
  const prevMonth = MET.shiftMonth(month, -1);
  let categoryDonutInstances = [];

  function fmt(n){ return MET.formatCurrency(n).replace(/\.00$/, ""); }

  function animateHeroAmount(value){
    const el = document.getElementById("heroAmount");
    el.setAttribute("data-counter", value);
    el.setAttribute("data-currency", "");
    MET.animateCounters(el.parentElement);
  }

  function renderHero(summary, budgetOverall, prevSummary){
    document.getElementById("heroLabel").textContent = "TOTAL SPENT — " + MET.monthLabel(month).toUpperCase();
    document.getElementById("heroMonthBadge").innerHTML = '<i class="bi bi-calendar3 me-1"></i>' + MET.monthLabel(month);
    animateHeroAmount(summary.totalExpense);
    document.getElementById("heroVsPrev").innerHTML = MET.deltaBadge(summary.totalExpense, prevSummary.totalExpense, true, true);

    if(budgetOverall){
      const amount = Number(budgetOverall.amount);
      const spent = Number(budgetOverall.spent);
      const pct = Math.min(100, budgetOverall.percentUsed);
      document.getElementById("heroBudgetLine").textContent = fmt(spent) + " / " + fmt(amount);
      document.getElementById("heroBudgetBar").style.width = pct + "%";
      document.getElementById("heroRemaining").textContent = fmt(Math.max(0, amount - spent));
      const today = new Date();
      const daysElapsed = today.getDate();
      const daysInMonth = new Date(today.getFullYear(), today.getMonth()+1, 0).getDate();
      document.getElementById("heroDailyAvg").textContent = fmt(Math.round(spent / daysElapsed));
      document.getElementById("heroDaysLeft").textContent = (daysInMonth - daysElapsed) + " days";
      document.getElementById("statDailyAvg").textContent = fmt(Math.round(spent / daysElapsed));
    } else {
      document.getElementById("heroBudgetLine").textContent = "No budget set for this month";
      document.getElementById("statDailyAvg").textContent = fmt(Math.round(summary.totalExpense / new Date().getDate()));
    }
  }

  function renderIncomeExpense(summary, prevSummary){
    document.getElementById("ieIncome").textContent = fmt(summary.totalIncome);
    document.getElementById("ieExpense").textContent = fmt(summary.totalExpense);
    document.getElementById("statTxnCount").textContent = (summary.incomeCount + summary.expenseCount);
    document.getElementById("ieIncomeVsPrev").innerHTML = MET.deltaBadge(summary.totalIncome, prevSummary.totalIncome, false);
    document.getElementById("ieExpenseVsPrev").innerHTML = MET.deltaBadge(summary.totalExpense, prevSummary.totalExpense, true);

    const total = summary.totalIncome + summary.totalExpense;
    const prevTotal = prevSummary.totalIncome + prevSummary.totalExpense;
    document.getElementById("ieTotalAmount").textContent = fmt(total);
    document.getElementById("ieTotalVsPrev").innerHTML = MET.deltaBadge(total, prevTotal, false);
    const incomePct = total > 0 ? (summary.totalIncome / total * 100) : 50;
    document.getElementById("ieIncomeBar").style.width = incomePct + "%";
    document.getElementById("ieExpenseBar").style.width = (100 - incomePct) + "%";

    const saved = summary.totalIncome - summary.totalExpense;
    const savedPct = summary.totalIncome > 0 ? Math.round(saved / summary.totalIncome * 100) : 0;
    const $line = document.getElementById("ieSavedLine");
    if(summary.totalIncome === 0 && summary.totalExpense === 0){
      $line.innerHTML = '<i class="bi bi-info-circle-fill" style="color:var(--text-muted);"></i><span>No income or expenses recorded yet this month.</span>';
    } else if(saved >= 0){
      $line.innerHTML = '<i class="bi bi-piggy-bank-fill" style="color:var(--income-color);"></i><span>You saved <strong style="color:var(--income-color);">' + fmt(saved) + '</strong> this month — ' + savedPct + '% of your income</span>';
    } else {
      $line.innerHTML = '<i class="bi bi-exclamation-triangle-fill" style="color:var(--accent-coral);"></i><span>You spent <strong style="color:var(--accent-coral);">' + fmt(-saved) + '</strong> more than you earned this month</span>';
    }
  }

  function renderRecentTxns(items){
    const wrap = document.getElementById("recentTxns");
    if(!wrap) return;
    if(!items.length){
      wrap.innerHTML = '<div class="empty-state py-4"><p>No transactions yet — add your first one.</p></div>';
      return;
    }
    wrap.innerHTML = items.map(function(t, i){
      const type = t.type === "INCOME" ? "income" : "expense";
      const color = MET.categoryColor(t.category.name, type);
      const icon = MET.categoryIcon(t.category.name, type);
      const sign = type === "income" ? "+" : "-";
      const detailHref = "expense-detail.html?id=" + t.id;
      return '' +
        '<a href="' + detailHref + '" class="d-flex txn-item text-decoration-none">' +
          '<div class="icon-chip" style="background:color-mix(in srgb, ' + color + ' 16%, transparent); color:' + color + ';"><i class="bi ' + icon + '"></i></div>' +
          '<div class="txn-info">' +
            '<div class="txn-title" style="color:var(--text-primary);">' + MET.esc(t.description || t.category.name) + '</div>' +
            '<div class="txn-meta">' + MET.esc(t.category.name) + ' • ' + MET.paymentMethodLabel(t.paymentMethod) + ' • ' + MET.formatTxnDate(t.transactionDate) + '</div>' +
          '</div>' +
          '<div class="txn-amount ' + type + '">' + sign + fmt(t.amount) + '</div>' +
        '</a>' + (i < items.length-1 ? '<hr class="divider list-divider">' : '');
    }).join("");
  }

  function renderCategoryLegend(targetId, items){
    const el = document.getElementById(targetId);
    if(!el) return;
    if(!items.length){ el.innerHTML = ''; return; }
    el.innerHTML = items.slice(0, 6).map(function(c){
      const color = MET.categoryColor(c.name, "expense");
      return '' +
        '<div class="d-flex align-items-center gap-2">' +
          '<span class="legend-dot" style="background:' + color + ';"></span>' +
          '<span class="flex-fill text-secondary" style="font-size:.8rem;">' + MET.esc(c.name) + '</span>' +
          '<span class="fw-700" style="font-size:.8rem;">' + Math.round(c.percentShare || 0) + '%</span>' +
        '</div>';
    }).join("");
  }

  function renderDonut(canvasId, items){
    const canvas = document.getElementById(canvasId);
    if(!canvas || typeof Chart === "undefined") return;
    const existing = Chart.getChart(canvas);
    if(existing) existing.destroy();
    if(!items.length) return;
    const colors = items.map(function(c){ return MET.categoryColor(c.name, "expense"); });
    new Chart(canvas, {
      type: "doughnut",
      data: {
        labels: items.map(function(c){ return c.name; }),
        datasets: [{
          data: items.map(function(c){ return c.total; }),
          backgroundColor: colors,
          borderColor: getComputedStyle(document.documentElement).getPropertyValue("--surface").trim() || "#fff",
          borderWidth: 3,
          hoverOffset: 6
        }]
      },
      options: {
        cutout: "68%",
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: function(ctx){ return ' ' + ctx.label + ': ' + fmt(ctx.parsed); } } }
        }
      }
    });
  }

  function renderTrend(items){
    const canvas = document.getElementById("trendChart");
    if(!canvas || typeof Chart === "undefined") return;
    const existing = Chart.getChart(canvas);
    if(existing) existing.destroy();
    const last6 = items.slice(-6);
    const months = last6.map(function(r){ return new Date(r.monthStart).toLocaleDateString("en-US", { month: "short" }); });
    const values = last6.map(function(r){ return r.expenseTotal || 0; });
    const blue = getComputedStyle(document.documentElement).getPropertyValue("--chart-1-blue").trim();
    const grid = MET.chartGrid();
    const axis = MET.chartAxisColor();
    const ctx = canvas.getContext("2d");
    const gradient = ctx.createLinearGradient(0,0,0,220);
    gradient.addColorStop(0, colorWithAlpha(blue, .28));
    gradient.addColorStop(1, colorWithAlpha(blue, 0));

    new Chart(canvas, {
      type: "line",
      data: {
        labels: months,
        datasets: [{
          label: "Monthly spend",
          data: values,
          borderColor: blue,
          backgroundColor: gradient,
          fill: true,
          tension: .4,
          pointRadius: 4,
          pointBackgroundColor: blue,
          pointBorderColor: getComputedStyle(document.documentElement).getPropertyValue("--surface").trim(),
          pointBorderWidth: 2,
          borderWidth: 2.5
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display:false }, tooltip: { callbacks: { label: function(c){ return ' ' + fmt(c.parsed.y); } } } },
        scales: {
          x: { grid: { display:false }, ticks: { color: axis, font:{ size:11 } } },
          y: { grid: { color: grid }, ticks: { color: axis, font:{ size:11 }, callback: function(v){ return '₹' + (v/1000) + 'k'; } } }
        }
      }
    });
  }

  function renderBudgetMini(categories){
    const wrap = document.getElementById("budgetMini");
    if(!wrap) return;
    if(!categories.length){
      wrap.innerHTML = '<p class="text-secondary" style="font-size:.82rem;">No per-category budgets set yet.</p>';
      return;
    }
    wrap.innerHTML = categories.slice(0, 3).map(function(b){
      const pct = Math.min(100, b.percentUsed);
      const state = b.status === "danger" ? "bar-danger" : (b.status === "warn" ? "bar-warn" : "bar-safe");
      return '' +
        '<div class="budget-row">' +
          '<div class="d-flex justify-content-between mb-2" style="font-size:.82rem;">' +
            '<span class="fw-700">' + MET.esc(b.category.name) + '</span>' +
            '<span class="text-secondary">' + fmt(b.spent) + ' / ' + fmt(Number(b.amount)) + '</span>' +
          '</div>' +
          '<div class="progress"><div class="progress-bar ' + state + '" style="width:' + pct + '%;"></div></div>' +
        '</div>';
    }).join("");
  }

  function renderRecurringDueSoon(items){
    const wrap = document.getElementById("recurringDueSoon");
    if(!wrap) return;
    // Capped at 2 (matches the original static design's footprint) — the
    // fixed-position desktop FAB sits at the bottom-right of the viewport,
    // and a 3rd row here pushes into it at the default scroll position.
    const upcoming = items.filter(function(r){ return !r.isPaused; }).slice(0, 2);
    if(!upcoming.length){
      wrap.innerHTML = '<p class="text-secondary" style="font-size:.82rem;">Nothing recurring is due soon.</p>';
      return;
    }
    const today = new Date(); today.setHours(0,0,0,0);
    wrap.innerHTML = upcoming.map(function(r){
      const due = new Date(r.nextDueDate);
      const days = Math.round((due - today) / 86400000);
      const dueLabel = days < 0 ? "Overdue" : (days === 0 ? "Due today" : (days === 1 ? "Due tomorrow" : "Due in " + days + " days"));
      const type = r.type === "INCOME" ? "income" : "expense";
      const color = MET.categoryColor(r.category.name, type);
      const icon = MET.categoryIcon(r.category.name, type);
      return '' +
        '<div class="d-flex align-items-center gap-3 py-2">' +
          '<div class="icon-chip" style="background:color-mix(in srgb, ' + color + ' 16%, transparent); color:' + color + ';"><i class="bi ' + icon + '"></i></div>' +
          '<div class="flex-fill"><div class="fw-700" style="font-size:.85rem;">' + MET.esc(r.title) + '</div><div class="text-secondary" style="font-size:.72rem;">' + dueLabel + '</div></div>' +
          '<div class="fw-700" style="font-size:.85rem;">' + fmt(Number(r.amount)) + '</div>' +
        '</div>';
    }).join("");
  }

  /* ---------- Safe to Spend Today ----------
   * PocketGuard-style: (overall budget - spent so far - upcoming recurring
   * bills still due this month) / days left. Deliberately doesn't fabricate
   * a number when there's no overall budget to measure against — an honest
   * prompt to set one beats a misleading guess. */
  function renderSafeToSpend(data){
    const el = document.getElementById("safeToSpendBody");
    if(!data.hasOverallBudget){
      el.innerHTML =
        '<p class="text-secondary mb-2" style="font-size:.85rem;">Set a monthly budget to see how much you can safely spend today.</p>' +
        '<a href="budget.html" class="btn btn-outline-soft btn-sm ripple-surface"><i class="bi bi-plus-lg me-1"></i>Set a Budget</a>';
      return;
    }
    if(data.isOverBudget){
      el.innerHTML =
        '<div class="d-flex align-items-center gap-3">' +
          '<div class="icon-chip-lg chip-coral" style="flex:0 0 auto;"><i class="bi bi-exclamation-triangle-fill"></i></div>' +
          '<div><div class="fw-800 font-display" style="font-size:1.3rem;color:var(--accent-coral);">' + fmt(0) + ' / day</div>' +
          '<div class="text-secondary" style="font-size:.78rem;">You\'re over budget this month once upcoming bills are counted — nothing extra to spend safely until next month.</div></div>' +
        '</div>';
      return;
    }
    const billsNote = data.upcomingRecurringTotal > 0
      ? ' after setting aside ' + fmt(data.upcomingRecurringTotal) + ' for ' + data.upcomingBills.length + ' upcoming bill' + (data.upcomingBills.length === 1 ? '' : 's')
      : '';
    el.innerHTML =
      '<div class="d-flex align-items-end gap-2 mb-1">' +
        '<div class="fw-800 font-display" style="font-size:2rem;color:var(--income-color);">' + fmt(data.safeToSpendPerDay) + '</div>' +
        '<div class="text-secondary mb-1" style="font-size:.8rem;">/ day for the next ' + data.daysLeft + ' day' + (data.daysLeft === 1 ? '' : 's') + '</div>' +
      '</div>' +
      '<div class="text-secondary" style="font-size:.78rem;">' + fmt(data.safeToSpendTotal) + ' left to spend freely this month' + billsNote + '.</div>';
  }

  /* ---------- Smart Insights ----------
   * The API returns raw numbers/names, never pre-formatted currency text —
   * amounts are rendered here via fmt() so they respect the user's actual
   * currency preference, same as every other number on this page. */
  const INSIGHT_CHIP = { bad: "chip-coral", warn: "chip-amber", good: "chip-teal", info: "chip-blue" };

  function insightText(ins){
    const d = ins.data;
    switch(ins.type){
      case "category_increase":
        return MET.esc(d.name) + " spending is up " + Math.round(d.pctChange) + "% vs last month — " + fmt(d.diff) + " more.";
      case "category_decrease":
        return "Nice — " + MET.esc(d.name) + " spending is down " + Math.round(Math.abs(d.pctChange)) + "% vs last month, saving you " + fmt(d.diff) + ".";
      case "budget_exceeded":
        return "You've gone over your " + MET.esc(d.name) + " budget — " + d.percentUsed + "% used.";
      case "budget_near_limit":
        return "You've used " + d.percentUsed + "% of your " + MET.esc(d.name) + " budget already.";
      case "budget_pace_warning":
        return MET.esc(d.name) + ": " + d.percentUsed + "% of the budget used, but only " + d.elapsedPercent + "% of the month has passed.";
      case "spending_exceeds_income":
        return "You've spent " + fmt(d.overspend) + " more than you've earned this month.";
      case "savings_improved":
        return "Your savings rate improved to " + d.savingsRate + "%, up from " + d.prevSavingsRate + "% last month.";
      case "bill_due_soon":
        var when = d.daysUntil === 0 ? "today" : d.daysUntil === 1 ? "tomorrow" : "in " + d.daysUntil + " days";
        return MET.esc(d.title) + " (" + fmt(d.amount) + ") " + (d.isIncome ? "is expected" : "is due") + " " + when + ".";
      default:
        return "";
    }
  }

  function renderSmartInsights(insights){
    const el = document.getElementById("smartInsightsBody");
    if(!insights.length){
      el.innerHTML = '<p class="text-secondary mb-0" style="font-size:.85rem;">Nothing notable to flag right now — keep it up!</p>';
      return;
    }
    el.innerHTML = insights.map(function(ins){
      return '' +
        '<div class="d-flex align-items-start gap-3 py-2">' +
          '<div class="icon-chip ' + INSIGHT_CHIP[ins.tone] + '" style="flex:0 0 auto;"><i class="bi ' + ins.icon + '"></i></div>' +
          '<div class="flex-fill" style="font-size:.85rem;padding-top:3px;">' + insightText(ins) + '</div>' +
        '</div>';
    }).join('<hr class="divider list-divider">');
  }

  function loadInsights(){
    $.when(
      MET.api.get("/insights/safe-to-spend" + MET.qs({ month: month })),
      MET.api.get("/insights/smart" + MET.qs({ month: month }))
    ).then(function(safeResp, smartResp){
      renderSafeToSpend(safeResp);
      renderSmartInsights(smartResp.insights);
    }, function(err){
      var msg = '<p class="text-secondary mb-0" style="font-size:.85rem;">Couldn\'t load this right now.</p>';
      document.getElementById("safeToSpendBody").innerHTML = msg;
      document.getElementById("smartInsightsBody").innerHTML = msg;
    });
  }

  function colorWithAlpha(hex, alpha){
    const c = hex.replace('#','');
    const r = parseInt(c.substring(0,2),16), g = parseInt(c.substring(2,4),16), b = parseInt(c.substring(4,6),16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  }

  function loadDashboard(){
    MET.showPageLoader();
    $.when(
      MET.api.get("/transactions/summary" + MET.qs({ month: month })),
      MET.api.get("/transactions/summary" + MET.qs({ month: prevMonth })),
      MET.api.get("/budgets" + MET.qs({ month: month })),
      MET.api.get("/reports/category" + MET.qs({ month: month, type: "EXPENSE" })),
      MET.api.get("/reports/trend" + MET.qs({ month: month })),
      MET.api.get("/transactions" + MET.qs({ pageSize: 6 })),
      MET.api.get("/recurring" + MET.qs({ type: "all" }))
    ).then(function(summaryResp, prevSummaryResp, budgetsResp, categoryResp, trendResp, txnsResp, recurringResp){
      const summary = summaryResp;
      const prevSummary = prevSummaryResp;
      const budgets = budgetsResp;
      const categoryItems = categoryResp.items;
      const trendItems = trendResp.items;
      const recentTxns = txnsResp.items;
      const recurringItems = recurringResp.items;

      renderHero(summary, budgets.overall, prevSummary);
      renderIncomeExpense(summary, prevSummary);
      renderRecentTxns(recentTxns);
      renderCategoryLegend("categoryLegend", categoryItems);
      renderCategoryLegend("categoryLegendMobile", categoryItems);
      renderBudgetMini(budgets.categories);
      renderRecurringDueSoon(recurringItems);

      document.getElementById("statTopCategory").textContent = categoryItems.length ? categoryItems[0].name : "—";

      function renderCharts(){
        renderDonut("categoryDonut", categoryItems);
        renderDonut("categoryDonutMobile", categoryItems);
        renderTrend(trendItems);
      }
      if(document.fonts && document.fonts.ready){
        document.fonts.ready.then(renderCharts);
      } else {
        renderCharts();
      }
    }, function(err){
      MET.toastError(err.message || "Couldn't load dashboard data.");
    }).always(function(){
      MET.hidePageLoader();
    });
  }

  $(document).on("met:user-ready", function(e, user){
    const greeting = document.querySelector(".mobile-topbar .topbar-title");
    if(greeting) greeting.innerHTML = greetingText() + '<small>' + MET.esc(user.name) + '</small>';
    const initials = user.name.trim().split(/\s+/).map(function(w){ return w[0]; }).join("").slice(0,2).toUpperCase();
    document.querySelectorAll(".mobile-topbar .avatar").forEach(function(el){ el.textContent = initials; });
  });
  function greetingText(){
    const h = new Date().getHours();
    return h < 12 ? "Good morning 👋" : (h < 17 ? "Good afternoon 👋" : "Good evening 👋");
  }

  $(document).ready(function(){
    loadDashboard();
    loadInsights();
    window.addEventListener("resize", debounce(function(){
      document.querySelectorAll(".chart-box canvas").forEach(function(c){
        const chart = Chart.getChart(c);
        if(chart) chart.resize();
      });
    }, 200));
  });

  function debounce(fn, wait){
    let t;
    return function(){ clearTimeout(t); t = setTimeout(fn, wait); };
  }
})();
