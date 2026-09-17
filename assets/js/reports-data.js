/* Live data + chart rendering for reports.html */
(function(){
  "use strict";

  const month = MET.currentMonth();
  const prevMonth = MET.shiftMonth(month, -1);
  const CHART_DEFAULTS = { responsive: true, maintainAspectRatio: false };
  const rendered = {};
  let activeCatType = "expense";

  // Populated by each pane's renderer once its data is in — read by the
  // Export sheet so CSV/Excel/PDF always reflect whatever the currently
  // active tab is actually showing, not a re-fetch or a fixed shape.
  window.MET.reportExports = {};

  function fmt(n){ return MET.formatCurrency(n).replace(/\.00$/, ""); }
  function grid(){ return MET.chartGrid(); }
  function axis(){ return MET.chartAxisColor(); }
  function surface(){ return getComputedStyle(document.documentElement).getPropertyValue("--surface").trim(); }
  function destroy(canvas){ const c = Chart.getChart(canvas); if(c) c.destroy(); }

  /* ---------- Monthly pane ---------- */
  function renderMonthlyStats(summary){
    document.getElementById("monthlyIncome").textContent = fmt(summary.totalIncome);
    document.getElementById("monthlyExpense").textContent = fmt(summary.totalExpense);
    document.getElementById("monthlyNet").textContent = (summary.totalIncome - summary.totalExpense >= 0 ? "+" : "-") + fmt(Math.abs(summary.totalIncome - summary.totalExpense));
    document.getElementById("monthlyTxnCount").textContent = summary.incomeCount + summary.expenseCount;
    document.getElementById("monthlyTotalAmount").textContent = fmt(summary.totalIncome + summary.totalExpense);
  }

  /** "This month vs last month" comparison card + the summary block merged
   *  into the Monthly export (both CSV/Excel/PDF and the Transaction
   *  Details ledger's own export buttons) — kept as a shared, always-
   *  current cache so whichever of renderMonthlyPane / renderTxnList
   *  finishes fetching last doesn't clobber the other's contribution. */
  function renderMonthlyComparison(summary, prevSummary){
    const total = summary.totalIncome + summary.totalExpense;
    const prevTotal = prevSummary.totalIncome + prevSummary.totalExpense;
    document.getElementById("cmpTotalNow").textContent = fmt(total);
    document.getElementById("cmpTotalVsPrev").innerHTML = MET.deltaBadge(total, prevTotal, false);
    document.getElementById("cmpIncomeNow").textContent = fmt(summary.totalIncome);
    document.getElementById("cmpIncomeVsPrev").innerHTML = MET.deltaBadge(summary.totalIncome, prevSummary.totalIncome, false);
    document.getElementById("cmpExpenseNow").textContent = fmt(summary.totalExpense);
    document.getElementById("cmpExpenseVsPrev").innerHTML = MET.deltaBadge(summary.totalExpense, prevSummary.totalExpense, true);
    document.getElementById("cmpPrevLabel").textContent = "Compared to " + MET.monthLabel(prevMonth) + ".";

    window.MET.monthlyComparisonExport = {
      summary: [
        ["Total Amount (Income + Expense)", total],
        ["Total Income", summary.totalIncome],
        ["Total Expense", summary.totalExpense],
        ["Net Savings", summary.totalIncome - summary.totalExpense],
        [""],
        ["Previous Month (" + MET.monthLabel(prevMonth) + ") Total Amount", prevTotal],
        ["Previous Month Income", prevSummary.totalIncome],
        ["Previous Month Expense", prevSummary.totalExpense]
      ],
      note: "Total Amount = Total Income + Total Expense combined (total money movement, not what was kept — see Net Savings for that). Previous-month figures compare against " + MET.monthLabel(prevMonth) + "."
    };
    applyMonthlyComparisonToExport();
  }

  function applyMonthlyComparisonToExport(){
    const cmp = window.MET.monthlyComparisonExport;
    if(!cmp || !window.MET.reportExports.monthly) return;
    window.MET.reportExports.monthly.summary = cmp.summary;
    window.MET.reportExports.monthly.note = cmp.note;
  }

  function renderDailyBar(items){
    document.getElementById("dailyChartTitle").textContent = "Daily spending — " + MET.monthLabel(month);
    const canvas = document.getElementById("dailyBarChart");
    destroy(canvas);
    const blue = getComputedStyle(document.documentElement).getPropertyValue("--chart-1-blue").trim();
    new Chart(canvas, {
      type: "bar",
      data: {
        labels: items.map(function(d){ return new Date(d.day).getDate(); }),
        datasets: [{ label: "Spend", data: items.map(function(d){ return d.total; }), backgroundColor: blue, borderRadius: 4, maxBarThickness: 26 }]
      },
      options: Object.assign({}, CHART_DEFAULTS, {
        plugins: { legend:{display:false}, tooltip:{ callbacks:{ label:function(c){ return ' ' + fmt(c.parsed.y); } } } },
        scales: {
          x: { grid:{display:false}, ticks:{ color:axis(), font:{size:10} } },
          y: { grid:{color:grid()}, ticks:{ color:axis(), font:{size:10}, callback:function(v){ return '₹'+(v/1000)+'k'; } } }
        }
      })
    });
  }

  function renderWeekChart(items){
    const canvas = document.getElementById("weekChart");
    destroy(canvas);
    // Bucket the month's daily totals into calendar weeks (Week 1 = days 1-7, etc.)
    const weeks = [0,0,0,0,0];
    items.forEach(function(d){
      const day = new Date(d.day).getDate();
      const idx = Math.min(4, Math.floor((day - 1) / 7));
      weeks[idx] += d.total;
    });
    while(weeks.length && weeks[weeks.length-1] === 0 && weeks.length > 4) weeks.pop();
    const violet = getComputedStyle(document.documentElement).getPropertyValue("--chart-7-violet").trim();
    new Chart(canvas, {
      type: "bar",
      data: {
        labels: weeks.map(function(_, i){ return "Week " + (i+1); }),
        datasets: [{ label: "This month", data: weeks, backgroundColor: violet, borderRadius: 4 }]
      },
      options: Object.assign({}, CHART_DEFAULTS, {
        plugins: { legend:{ display:false } },
        scales: {
          x: { grid:{display:false}, ticks:{ color:axis(), font:{size:10} } },
          y: { grid:{color:grid()}, ticks:{ color:axis(), font:{size:10}, callback:function(v){ return '₹'+(v/1000)+'k'; } } }
        }
      })
    });
  }

  function renderMonthlyPane(){
    if(rendered.monthly) return;
    rendered.monthly = true;
    $.when(
      MET.api.get("/transactions/summary" + MET.qs({ month: month })),
      MET.api.get("/reports/daily-spending" + MET.qs({ month: month })),
      MET.api.get("/transactions/summary" + MET.qs({ month: prevMonth }))
    ).then(function(summary, dailyResp, prevSummary){
      renderMonthlyStats(summary);
      renderDailyBar(dailyResp.items);
      renderWeekChart(dailyResp.items);
      renderMonthlyComparison(summary, prevSummary);
      // reportExports.monthly's title/headers/rows are populated by
      // renderTxnList() below, from the same day-to-day ledger shown in the
      // Transaction Details widget — it already carries full date/
      // description/category/payment-method detail for whatever range the
      // user has picked (current month by default). renderMonthlyComparison()
      // above merges in the summary/note fields either way.
    }, function(err){ MET.toastError(err.message || "Couldn't load the monthly report."); });
  }

  /* ---------- Category pane ---------- */
  let catPieChart = null;
  function renderCategoryPane(type){
    activeCatType = type || activeCatType;
    MET.api.get("/reports/category" + MET.qs({ month: month, type: activeCatType.toUpperCase() })).then(function(resp){
      const data = resp.items;
      const canvas = document.getElementById("catPie");
      const colors = data.map(function(c){ return MET.categoryColor(c.name, activeCatType); });
      if(catPieChart) catPieChart.destroy();
      if(!data.length){
        document.getElementById("catLegendReport").innerHTML = '<p class="text-secondary" style="font-size:.85rem;">No ' + activeCatType + ' transactions yet this month.</p>';
        document.getElementById("catTableBody").innerHTML = '';
        window.MET.reportExports.category = { title: (activeCatType === "income" ? "Income" : "Expense") + " Breakdown — " + MET.monthLabel(month), headers: ["Category", "Transactions", "Total", "% Share"], rows: [] };
        return;
      }
      catPieChart = new Chart(canvas, {
        type: "pie",
        data: { labels: data.map(function(c){return c.name;}), datasets:[{ data: data.map(function(c){return c.total;}), backgroundColor: colors, borderColor: surface(), borderWidth: 3 }] },
        options: Object.assign({}, CHART_DEFAULTS, { plugins:{ legend:{display:false}, tooltip:{ callbacks:{ label:function(c){ return ' '+c.label+': '+fmt(c.parsed); } } } } })
      });
      document.getElementById("catLegendReport").innerHTML = data.map(function(c){
        return '<div class="d-flex align-items-center gap-2"><span class="legend-dot" style="background:'+MET.categoryColor(c.name, activeCatType)+';"></span><span class="flex-fill text-secondary" style="font-size:.8rem;">'+MET.esc(c.name)+'</span><span class="fw-700" style="font-size:.8rem;">'+Math.round(c.percentShare||0)+'%</span></div>';
      }).join("");
      document.getElementById("catTableBody").innerHTML = data.map(function(c){
        return '<tr><td><span class="legend-dot me-2" style="background:'+MET.categoryColor(c.name, activeCatType)+';"></span>'+MET.esc(c.name)+'</td><td>'+c.txnCount+'</td><td class="fw-700">'+fmt(c.total)+'</td><td>'+Math.round(c.percentShare||0)+'%</td></tr>';
      }).join("");
      document.getElementById("catChartTitle").textContent = (activeCatType === "income" ? "Income" : "Expense") + " breakdown";
      document.getElementById("catShareHeader").textContent = "% of " + (activeCatType === "income" ? "income" : "spend");
      window.MET.reportExports.category = {
        title: (activeCatType === "income" ? "Income" : "Expense") + " Breakdown — " + MET.monthLabel(month),
        headers: ["Category", "Transactions", "Total", "% Share"],
        rows: data.map(function(c){ return [c.name, c.txnCount, c.total, Math.round(c.percentShare || 0) + "%"]; })
      };
    }, function(err){ MET.toastError(err.message || "Couldn't load the category report."); });
  }

  /* ---------- Payment method pane ---------- */
  function renderPaymentPane(){
    if(rendered.payment) return;
    rendered.payment = true;
    MET.api.get("/reports/payment-methods" + MET.qs({ month: month })).then(function(resp){
      const items = resp.items;
      const canvas = document.getElementById("paymentDonut");
      const palette = MET.chartPalette();
      const icons = { CARD:"bi-credit-card-fill", UPI:"bi-phone-fill", NETBANKING:"bi-bank", CASH:"bi-cash", WALLET:"bi-wallet2", OTHER:"bi-three-dots" };
      const chipClasses = ["chip-blue","chip-teal","chip-amber","chip-coral","chip-violet",""];
      if(!items.length){
        document.getElementById("paymentBreakdown").innerHTML = '<p class="text-secondary" style="font-size:.85rem;">No expenses recorded yet this month.</p>';
        window.MET.reportExports.payment = { title: "Payment Method Report — " + MET.monthLabel(month), headers: ["Method", "Total", "% Share"], rows: [] };
        return;
      }
      destroy(canvas);
      new Chart(canvas, {
        type: "doughnut",
        data: { labels: items.map(function(p){return MET.paymentMethodLabel(p.paymentMethod);}), datasets:[{ data: items.map(function(p){return p.total;}), backgroundColor: items.map(function(_,i){return palette[i % palette.length];}), borderColor: surface(), borderWidth:3 }] },
        options: Object.assign({}, CHART_DEFAULTS, { cutout:"65%", plugins:{ legend:{ display:true, position:"bottom", labels:{ color:axis(), boxWidth:10, font:{size:11} } }, tooltip:{ callbacks:{ label:function(c){ return ' '+c.label+': '+fmt(c.parsed); } } } } })
      });
      document.getElementById("paymentBreakdown").innerHTML = items.map(function(p, i){
        return '<div class="d-flex align-items-center gap-3 py-3"><div class="icon-chip ' + (chipClasses[i % chipClasses.length]) + '"><i class="bi ' + (icons[p.paymentMethod]||"bi-three-dots") + '"></i></div><div class="flex-fill"><div class="fw-700" style="font-size:.88rem;">' + MET.paymentMethodLabel(p.paymentMethod) + '</div><div class="progress mt-1"><div class="progress-bar" style="width:' + Math.round(p.percentShare||0) + '%;background:' + palette[i % palette.length] + ';"></div></div></div><div class="fw-700">' + fmt(p.total) + '</div></div>';
      }).join("");
      window.MET.reportExports.payment = {
        title: "Payment Method Report — " + MET.monthLabel(month),
        headers: ["Method", "Total", "% Share"],
        rows: items.map(function(p){ return [MET.paymentMethodLabel(p.paymentMethod), p.total, Math.round(p.percentShare || 0) + "%"]; })
      };
    }, function(err){ MET.toastError(err.message || "Couldn't load the payment method report."); });
  }

  /* ---------- Trend pane ---------- */
  function renderTrendPane(){
    if(rendered.trend) return;
    rendered.trend = true;
    MET.api.get("/reports/trend" + MET.qs({ month: month })).then(function(resp){
      const items = resp.items;
      const canvas = document.getElementById("yearTrendChart");
      const incomeColor = getComputedStyle(document.documentElement).getPropertyValue("--income-color").trim();
      const expenseColor = getComputedStyle(document.documentElement).getPropertyValue("--expense-color").trim();
      destroy(canvas);
      new Chart(canvas, {
        type: "line",
        data: {
          labels: items.map(function(r){ return new Date(r.monthStart).toLocaleDateString("en-US", { month: "short" }); }),
          datasets: [
            { label:"Income", data: items.map(function(r){return r.incomeTotal||0;}), borderColor: incomeColor, backgroundColor:"transparent", tension:.35, pointRadius:3, borderWidth:2.5 },
            { label:"Expense", data: items.map(function(r){return r.expenseTotal||0;}), borderColor: expenseColor, backgroundColor:"transparent", tension:.35, pointRadius:3, borderWidth:2.5 }
          ]
        },
        options: Object.assign({}, CHART_DEFAULTS, {
          plugins:{ legend:{display:false}, tooltip:{ callbacks:{ label:function(c){ return ' '+c.dataset.label+': '+fmt(c.parsed.y); } } } },
          scales: { x:{ grid:{display:false}, ticks:{ color:axis(), font:{size:10} } }, y:{ grid:{color:grid()}, ticks:{ color:axis(), font:{size:10}, callback:function(v){ return '₹'+(v/1000)+'k'; } } } }
        })
      });

      const withData = items.filter(function(r){ return r.incomeTotal || r.expenseTotal; });
      const n = withData.length || 1;
      const avgIncome = withData.reduce(function(s,r){ return s + (r.incomeTotal||0); }, 0) / n;
      const avgExpense = withData.reduce(function(s,r){ return s + (r.expenseTotal||0); }, 0) / n;
      document.getElementById("trendAvgIncome").textContent = fmt(avgIncome);
      document.getElementById("trendAvgExpense").textContent = fmt(avgExpense);
      document.getElementById("trendAvgNet").textContent = (avgIncome - avgExpense >= 0 ? "+" : "-") + fmt(Math.abs(avgIncome - avgExpense));
      const highest = withData.slice().sort(function(a,b){ return (b.expenseTotal||0) - (a.expenseTotal||0); })[0];
      document.getElementById("trendHighest").textContent = highest ? fmt(highest.expenseTotal||0) : "—";
      window.MET.reportExports.trend = {
        title: "Income vs Expense Trend — Last 12 Months",
        headers: ["Month", "Income", "Expense"],
        rows: items.map(function(r){ return [new Date(r.monthStart).toLocaleDateString("en-US", { month: "short", year: "numeric" }), r.incomeTotal || 0, r.expenseTotal || 0]; })
      };
    }, function(err){ MET.toastError(err.message || "Couldn't load the trend report."); });
  }

  /* ---------- Yearly summary pane ---------- */
  function renderYearlyPane(){
    if(rendered.yearly) return;
    rendered.yearly = true;
    const year = new Date().getFullYear();
    document.getElementById("yearlyTitle").textContent = year + " yearly summary";
    MET.api.get("/reports/yearly-summary" + MET.qs({ year: year })).then(function(resp){
      const items = resp.items;
      const canvas = document.getElementById("yearlyBarChart");
      const incomeColor = getComputedStyle(document.documentElement).getPropertyValue("--income-color").trim();
      const expenseColor = getComputedStyle(document.documentElement).getPropertyValue("--expense-color").trim();
      const grey = getComputedStyle(document.documentElement).getPropertyValue("--border-color").trim();
      destroy(canvas);
      new Chart(canvas, {
        type: "bar",
        data: {
          labels: items.map(function(r){ return new Date(r.monthStart).toLocaleDateString("en-US", { month: "short" }); }),
          datasets: [
            { label:"Income", data: items.map(function(r){return r.income;}), backgroundColor: incomeColor, borderRadius:4, maxBarThickness: 24 },
            { label:"Spent", data: items.map(function(r){return r.expense;}), backgroundColor: expenseColor, borderRadius:4, maxBarThickness: 24 },
            { label:"Budget", data: items.map(function(r){return r.budget;}), backgroundColor: grey, borderRadius:4, maxBarThickness: 24 }
          ]
        },
        options: Object.assign({}, CHART_DEFAULTS, {
          plugins:{ legend:{ display:true, position:"bottom", labels:{ color:axis(), boxWidth:10, font:{size:11} } } },
          scales: { x:{ grid:{display:false}, ticks:{ color:axis(), font:{size:11} } }, y:{ grid:{color:grid()}, ticks:{ color:axis(), font:{size:11}, callback:function(v){ return '₹'+(v/1000)+'k'; } } } }
        })
      });
      document.getElementById("yearlyTableBody").innerHTML = items.map(function(r){
        const label = new Date(r.monthStart).toLocaleDateString("en-US", { month: "long" });
        const varianceColor = r.budgetVariance >= 0 ? "var(--accent-teal-dark)" : "var(--accent-coral)";
        const netColor = r.netSavings >= 0 ? "var(--income-color)" : "var(--accent-coral)";
        return '<tr><td>' + label + '</td><td style="color:var(--income-color);">' + fmt(r.income) + '</td><td>' + fmt(r.expense) + '</td><td>' + fmt(r.budget) + '</td><td style="color:' + varianceColor + ';">' + (r.budgetVariance >= 0 ? "-" : "+") + fmt(Math.abs(r.budgetVariance)) + '</td><td style="color:' + netColor + ';">' + (r.netSavings >= 0 ? "+" : "-") + fmt(Math.abs(r.netSavings)) + '</td></tr>';
      }).join("");
      window.MET.reportExports.yearly = {
        title: year + " Yearly Summary",
        headers: ["Month", "Income", "Expense", "Budget", "Budget Variance", "Net Savings"],
        rows: items.map(function(r){
          // Matches the on-screen sign convention exactly: "-" shown when
          // under budget (budgetVariance >= 0), "+" when over — i.e. the
          // displayed number is always -budgetVariance.
          return [new Date(r.monthStart).toLocaleDateString("en-US", { month: "long" }), r.income, r.expense, r.budget, -r.budgetVariance, r.netSavings];
        })
      };
    }, function(err){ MET.toastError(err.message || "Couldn't load the yearly summary."); });
  }

  /* ---------- Transaction Details (day-to-day ledger, any date range) ----------
     Independent of the tab-pane cache above: lives inside the Monthly pane
     but covers whatever range the user picks — a single month by default,
     or several months at once for a bulk export. */
  function pad2(n){ return String(n).padStart(2, "0"); }
  function toDateInputValue(d){ return d.getFullYear() + "-" + pad2(d.getMonth()+1) + "-" + pad2(d.getDate()); }
  function firstOfThisMonth(){ const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); }
  function lastOfThisMonth(){ const d = new Date(); return new Date(d.getFullYear(), d.getMonth()+1, 0); }
  function fromToLabel(from, to){
    const opts = { month: "short", day: "numeric", year: "numeric" };
    return new Date(from + "T00:00:00").toLocaleDateString("en-US", opts) + " – " + new Date(to + "T00:00:00").toLocaleDateString("en-US", opts);
  }

  /** Pages through /transactions for the given range (100 at a time, capped
   *  at 2000 rows total) since a multi-month export can legitimately span
   *  more than one page. */
  function fetchAllTransactions(from, to){
    const pageSize = 100;
    function fetchPage(page, acc){
      return MET.api.get("/transactions" + MET.qs({ from: from, to: to, pageSize: pageSize, page: page })).then(function(resp){
        const all = acc.concat(resp.items);
        if(all.length < resp.total && page < 20) return fetchPage(page + 1, all);
        return all;
      });
    }
    return fetchPage(1, []);
  }

  function renderTxnList(items, from, to){
    const wrap = document.getElementById("txnListBody");
    if(!items.length){
      wrap.innerHTML = '<tr><td colspan="6"><div class="empty-state py-4"><p>No transactions in this date range.</p></div></td></tr>';
    } else {
      wrap.innerHTML = items.map(function(t){
        const isIncome = t.type === "INCOME";
        const dateLabel = new Date(t.transactionDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
        return '' +
          '<tr>' +
            '<td class="text-nowrap">' + dateLabel + '</td>' +
            '<td>' + (t.description ? MET.esc(t.description) : '<span class="text-muted-c">—</span>') + '</td>' +
            '<td>' + MET.esc(t.category.name) + '</td>' +
            '<td><span class="badge-soft ' + (isIncome ? "b-teal" : "b-coral") + '">' + (isIncome ? "Income" : "Expense") + '</span></td>' +
            '<td>' + MET.paymentMethodLabel(t.paymentMethod) + '</td>' +
            '<td class="text-end fw-700" style="color:' + (isIncome ? "var(--income-color)" : "var(--expense-color)") + ';">' + (isIncome ? "+" : "-") + fmt(t.amount) + '</td>' +
          '</tr>';
      }).join("");
    }

    const income = items.filter(function(t){ return t.type === "INCOME"; }).reduce(function(s,t){ return s + Number(t.amount); }, 0);
    const expense = items.filter(function(t){ return t.type === "EXPENSE"; }).reduce(function(s,t){ return s + Number(t.amount); }, 0);
    document.getElementById("txnListSummary").innerHTML =
      items.length + (items.length === 1 ? " transaction" : " transactions") +
      ' • <span style="color:var(--income-color);">+' + fmt(income) + ' in</span> • <span style="color:var(--expense-color);">-' + fmt(expense) + ' out</span>' +
      ' • ' + fromToLabel(from, to);

    const ledgerExport = {
      title: "Transactions " + fromToLabel(from, to).replace(/–/g, "to"),
      headers: ["Date", "Description", "Category", "Type", "Payment Method", "Amount"],
      rows: items.map(function(t){
        return [
          new Date(t.transactionDate).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }),
          t.description || "",
          t.category.name,
          t.type === "INCOME" ? "Income" : "Expense",
          MET.paymentMethodLabel(t.paymentMethod),
          t.type === "INCOME" ? Number(t.amount) : -Number(t.amount)
        ];
      })
    };
    window.MET.reportExports.transactionList = ledgerExport;
    // The Monthly tab's own Export-sheet entry mirrors this same ledger —
    // same rows/detail, just labeled for the Monthly report specifically —
    // so exporting "Monthly" always matches whatever range is on screen.
    window.MET.reportExports.monthly = {
      title: "Monthly Report — " + fromToLabel(from, to).replace(/–/g, "to"),
      headers: ledgerExport.headers,
      rows: ledgerExport.rows
    };
    applyMonthlyComparisonToExport();
  }

  function loadTxnList(){
    const from = document.getElementById("txnFromDate").value;
    const to = document.getElementById("txnToDate").value;
    if(!from || !to) return;
    if(from > to){
      MET.toastError("The 'From' date must be on or before the 'To' date.");
      return;
    }
    document.getElementById("txnListBody").innerHTML = '<tr><td colspan="6"><div class="section-loading" style="min-height:100px;"></div></td></tr>';
    document.getElementById("txnListSummary").textContent = "Loading…";
    fetchAllTransactions(from, to).then(function(items){
      const sorted = items.slice().sort(function(a, b){ return new Date(a.transactionDate) - new Date(b.transactionDate); });
      renderTxnList(sorted, from, to);
    }, function(err){
      MET.toastError(err.message || "Couldn't load transactions for this range.");
      document.getElementById("txnListSummary").textContent = "Couldn't load this range.";
    });
  }

  function initTxnList(){
    document.getElementById("txnFromDate").value = toDateInputValue(firstOfThisMonth());
    document.getElementById("txnToDate").value = toDateInputValue(lastOfThisMonth());
    document.getElementById("txnFromDate").addEventListener("change", loadTxnList);
    document.getElementById("txnToDate").addEventListener("change", loadTxnList);
    loadTxnList();
  }

  const PANE_RENDERERS = {
    monthly: renderMonthlyPane,
    category: function(){ renderCategoryPane(activeCatType); },
    payment: renderPaymentPane,
    trend: renderTrendPane,
    yearly: renderYearlyPane
  };

  function activateTab(tab){
    window.MET.activeReportTab = tab;
    document.querySelectorAll("#reportTabs .nav-link").forEach(function(btn){
      btn.classList.toggle("active", btn.getAttribute("data-tab") === tab);
    });
    document.querySelectorAll(".report-pane").forEach(function(pane){
      pane.classList.toggle("d-none", pane.id !== "pane-" + tab);
    });
    if(PANE_RENDERERS[tab]) PANE_RENDERERS[tab]();
  }

  document.addEventListener("DOMContentLoaded", function(){
    document.querySelectorAll("#reportTabs .nav-link").forEach(function(btn){
      btn.addEventListener("click", function(){ activateTab(this.getAttribute("data-tab")); });
    });
    const catToggle = document.getElementById("catTypeToggle");
    if(catToggle){
      catToggle.querySelectorAll("button").forEach(function(btn){
        btn.addEventListener("click", function(){ renderCategoryPane(this.getAttribute("data-type")); });
      });
    }
    if(document.fonts && document.fonts.ready){
      document.fonts.ready.then(function(){ activateTab("monthly"); });
    } else {
      activateTab("monthly");
    }
    initTxnList();
  });
})();
