/* Live data for expenses.html — transaction list, filters, month nav,
   swipe-to-edit/delete, and the desktop summary sidebar. */
(function(){
  "use strict";

  let month = MET.currentMonth();
  let activeType = "all";
  let activeCategory = "all";
  let allItems = [];
  let visibleCount = 0;
  let expenseCategories = [];
  let incomeCategories = [];
  const PAGE_SIZE = 20;

  function fmt(n){ return MET.formatCurrency(n).replace(/\.00$/, ""); }
  function shiftMonth(base, delta){
    const d = new Date(base + "T00:00:00");
    d.setMonth(d.getMonth() + delta);
    return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-01";
  }

  /** Category chips list only the categories the USER has created — not
   *  the shared/default ones (Food, Salary, etc., userId === null). A
   *  category shows up here the moment it's created, not only once a
   *  transaction has been logged against it. The set narrows to match
   *  whichever of All/Income/Expense is currently selected. */
  function renderCategoryChips(){
    const wrap = document.getElementById("categoryChips");
    let cats;
    if(activeType === "income") cats = incomeCategories;
    else if(activeType === "expense") cats = expenseCategories;
    else cats = expenseCategories.concat(incomeCategories);
    // A user can name a custom category the same as a default one (e.g.
    // their own "Food" alongside the built-in "Food") — every filter here
    // already keys by name, not id, so collapse those into a single chip
    // rather than showing two identical-looking entries.
    const seen = new Set();
    const names = cats.map(function(c){ return c.name; }).filter(function(n){
      if(seen.has(n)) return false;
      seen.add(n);
      return true;
    });
    const chips = ['<button class="filter-chip' + (activeCategory === "all" ? " active" : "") + '" data-cat="all">All Categories</button>'].concat(
      names.map(function(n){ return '<button class="filter-chip' + (n === activeCategory ? " active" : "") + '" data-cat="' + MET.esc(n) + '">' + MET.esc(n) + '</button>'; })
    );
    wrap.innerHTML = chips.join("");
  }

  function loadCategories(){
    return $.when(
      MET.api.get("/categories" + MET.qs({ type: "EXPENSE", status: "active" })),
      MET.api.get("/categories" + MET.qs({ type: "INCOME", status: "active" }))
    ).then(function(expResp, incResp){
      expenseCategories = expResp.categories.filter(function(c){ return c.userId !== null; });
      incomeCategories = incResp.categories.filter(function(c){ return c.userId !== null; });
      renderCategoryChips();
    });
  }

  function dayKey(iso){
    const d = new Date(iso);
    return d.toDateString();
  }
  function dayLabel(iso){
    const d = new Date(iso);
    const now = new Date();
    if(d.toDateString() === now.toDateString()) return "Today";
    const yesterday = new Date(now); yesterday.setDate(now.getDate()-1);
    if(d.toDateString() === yesterday.toDateString()) return "Yesterday";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined });
  }

  function txnRowHtml(t){
    const type = t.type === "INCOME" ? "income" : "expense";
    const color = MET.categoryColor(t.category.name, type);
    const icon = MET.categoryIcon(t.category.name, type);
    const sign = type === "income" ? "+" : "-";
    const recurBadge = t.isRecurring ? ' <span class="badge-soft b-violet ms-1">Recurring</span>' : '';
    return '' +
      '<div class="swipe-item" data-txn-type="' + type + '" data-cat="' + MET.esc(t.category.name) + '" data-id="' + t.id + '">' +
        '<div class="swipe-actions"><button class="sw-edit" data-id="' + t.id + '"><i class="bi bi-pencil-fill"></i></button><button class="sw-delete" data-id="' + t.id + '"><i class="bi bi-trash-fill"></i></button></div>' +
        '<a href="expense-detail.html?id=' + t.id + '" class="d-flex txn-item text-decoration-none swipe-content">' +
          '<div class="icon-chip" style="background:color-mix(in srgb, ' + color + ' 16%, transparent); color:' + color + ';"><i class="bi ' + icon + '"></i></div>' +
          '<div class="txn-info"><div class="txn-title" style="color:var(--text-primary);">' + MET.esc(t.description || t.category.name) + '</div><div class="txn-meta">' + MET.esc(t.category.name) + ' • ' + MET.paymentMethodLabel(t.paymentMethod) + ' • ' + new Date(t.transactionDate).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"}) + recurBadge + '</div></div>' +
          '<div class="txn-amount ' + type + '">' + sign + fmt(t.amount) + '</div>' +
        '</a>' +
      '</div>';
  }

  function renderGroups(){
    const wrap = document.getElementById("txnGroups");
    const filtered = allItems.filter(function(t){
      const type = t.type === "INCOME" ? "income" : "expense";
      if(activeType !== "all" && type !== activeType) return false;
      if(activeCategory !== "all" && t.category.name !== activeCategory) return false;
      return true;
    });

    document.getElementById("showingCount").textContent = "Showing " + Math.min(visibleCount, filtered.length) + " of " + filtered.length;

    if(!filtered.length){
      wrap.innerHTML = '<div class="empty-state py-5"><div class="es-illustration"><i class="bi bi-receipt" style="font-size:3rem;color:var(--text-muted);"></i></div><h6>No transactions found</h6><p>Try a different filter, or add your first transaction for this period.</p></div>';
      document.getElementById("loadMoreWrap").classList.add("d-none");
      return;
    }

    const shown = filtered.slice(0, visibleCount);
    const groups = [];
    let currentKey = null;
    shown.forEach(function(t){
      const key = dayKey(t.transactionDate);
      if(key !== currentKey){ groups.push({ key: key, label: dayLabel(t.transactionDate), items: [] }); currentKey = key; }
      groups[groups.length-1].items.push(t);
    });

    wrap.innerHTML = groups.map(function(g){
      const net = g.items.reduce(function(s,t){ return s + (t.type === "INCOME" ? Number(t.amount) : -Number(t.amount)); }, 0);
      const netColor = net >= 0 ? "var(--income-color)" : "var(--expense-color)";
      const netLabel = (net >= 0 ? "+" : "-") + fmt(Math.abs(net)) + (g.items.length > 1 ? " net" : "");
      return '' +
        '<div class="section-title-row">' +
          '<h6 class="text-secondary" style="text-transform:uppercase;font-size:.72rem;letter-spacing:.05em;">' + g.label + '</h6>' +
          '<span class="fw-700" style="font-size:.82rem;color:' + netColor + ';">' + netLabel + '</span>' +
        '</div>' +
        '<div class="surface-card mb-4 p-2 p-lg-3">' +
          g.items.map(txnRowHtml).join('<hr class="divider list-divider">') +
        '</div>';
    }).join("");

    document.getElementById("loadMoreWrap").classList.toggle("d-none", visibleCount >= filtered.length);
    if(MET.initSwipeItems) MET.initSwipeItems();
  }

  function renderSidebar(summary, paymentMethods){
    document.getElementById("sideIncome").textContent = "+" + fmt(summary.totalIncome);
    document.getElementById("sideExpense").textContent = "-" + fmt(summary.totalExpense);
    const net = summary.totalIncome - summary.totalExpense;
    const $net = document.getElementById("sideNet");
    $net.textContent = (net >= 0 ? "+" : "-") + fmt(Math.abs(net));
    $net.style.color = net >= 0 ? "var(--income-color)" : "var(--expense-color)";
    document.getElementById("sideCount").textContent = summary.incomeCount + summary.expenseCount;

    document.getElementById("monthLabel").textContent = MET.monthLabel(month);
    document.getElementById("monthSummaryLine").innerHTML =
      (summary.incomeCount + summary.expenseCount) + ' transactions • <span style="color:var(--income-color);">+' + fmt(summary.totalIncome) + ' in</span> • <span style="color:var(--expense-color);">-' + fmt(summary.totalExpense) + ' out</span>';

    const icons = { CARD:"bi-credit-card-fill", UPI:"bi-phone-fill", NETBANKING:"bi-bank", CASH:"bi-cash", WALLET:"bi-wallet2", OTHER:"bi-three-dots" };
    const chips = { CARD:"chip-blue", UPI:"chip-teal", NETBANKING:"chip-amber", CASH:"chip-coral", WALLET:"chip-violet", OTHER:"" };
    const wrap = document.getElementById("sidePaymentMethods");
    if(!paymentMethods.length){
      wrap.innerHTML = '<p class="text-secondary" style="font-size:.82rem;">No expenses recorded yet this month.</p>';
    } else {
      wrap.innerHTML = paymentMethods.map(function(p){
        return '<div class="d-flex align-items-center gap-2 py-2"><i class="bi ' + (icons[p.paymentMethod]||"bi-three-dots") + ' ' + (chips[p.paymentMethod]||"") + ' icon-chip"></i><span class="flex-fill" style="font-size:.85rem;">' + MET.paymentMethodLabel(p.paymentMethod) + '</span><span class="fw-700">' + fmt(p.total) + '</span></div>';
      }).join("");
    }
  }

  function load(){
    document.getElementById("txnGroups").innerHTML = '<div class="section-loading" style="min-height:200px;"></div>';
    visibleCount = PAGE_SIZE;
    $.when(
      MET.api.get("/transactions" + MET.qs({ month: month, pageSize: 100 })),
      MET.api.get("/transactions/summary" + MET.qs({ month: month })),
      MET.api.get("/reports/payment-methods" + MET.qs({ month: month }))
    ).then(function(txnResp, summaryResp, pmResp){
      allItems = txnResp.items;
      renderSidebar(summaryResp, pmResp.items);
      renderGroups();
    }, function(err){
      MET.toastError(err.message || "Couldn't load transactions.");
      document.getElementById("txnGroups").innerHTML = '';
    });
  }

  function confirmDelete(id, $row){
    if(!window.confirm("Delete this transaction? This can be restored later from the admin audit log, but not from here.")) return;
    MET.api.del("/transactions/" + id).then(function(){
      MET.toastSuccess("Transaction deleted.");
      allItems = allItems.filter(function(t){ return t.id !== id; });
      renderGroups();
    }, function(err){ MET.toastError(err.message); });
  }

  $(document).on("click", "#monthPrev", function(){ month = shiftMonth(month, -1); load(); });
  $(document).on("click", "#monthNext", function(){ month = shiftMonth(month, 1); load(); });

  $(document).on("click", "#typeFilter button", function(){
    activeType = $(this).data("type") || "all";
    // The category chip set depends on which type is active (income
    // categories don't apply under "Expense" and vice versa), so whatever
    // was selected before may no longer exist — reset to "All Categories"
    // rather than leave a now-inapplicable filter silently in effect.
    activeCategory = "all";
    renderCategoryChips();
    renderGroups();
  });
  $(document).on("click", "#categoryChips .filter-chip", function(){
    activeCategory = $(this).data("cat");
    renderGroups();
  });
  $(document).on("click", "#loadMoreBtn", function(){
    visibleCount += PAGE_SIZE;
    renderGroups();
  });
  $(document).on("click", ".sw-edit", function(e){
    e.preventDefault();
    window.location.href = "expense-form.html?id=" + $(this).data("id");
  });
  $(document).on("click", ".sw-delete", function(e){
    e.preventDefault();
    confirmDelete($(this).data("id"));
  });

  $(document).ready(function(){
    loadCategories();
    load();
  });
})();
