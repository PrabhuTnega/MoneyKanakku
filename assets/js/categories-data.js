/* Live data for categories.html */
(function(){
  "use strict";

  const month = MET.currentMonth();
  let status = "active";

  function fmt(n){ return MET.formatCurrency(n).replace(/\.00$/, ""); }

  function cardHtml(cat, type, amount){
    const inactiveBadge = !cat.isActive ? '<span class="badge-soft b-coral" style="position:absolute;top:8px;right:8px;font-size:.62rem;">Inactive</span>' : '';
    return '' +
      '<div class="col"><a href="category-form.html?id=' + cat.id + '&type=' + type + '" class="text-decoration-none">' +
        '<div class="category-card" style="position:relative;' + (!cat.isActive ? 'opacity:.6;' : '') + '">' + inactiveBadge +
          '<div class="cat-icon" style="background:color-mix(in srgb, ' + MET.esc(cat.color) + ' 16%, transparent);color:' + MET.esc(cat.color) + ';"><i class="bi ' + MET.esc(cat.icon) + '"></i></div>' +
          '<div class="cat-name" style="color:var(--text-primary);">' + MET.esc(cat.name) + '</div>' +
          '<div class="cat-amount">' + fmt(amount) + ' this month</div>' +
        '</div>' +
      '</a></div>';
  }

  function addNewCardHtml(type){
    return '' +
      '<div class="col">' +
        '<a href="category-form.html' + (type === "income" ? "?type=income" : "") + '" class="category-card text-decoration-none h-100 justify-content-center" style="border-style:dashed;">' +
          '<div class="cat-icon" style="background:var(--surface-soft);color:var(--brand-500);"><i class="bi bi-plus-lg"></i></div>' +
          '<div class="cat-name" style="color:var(--brand-500);">Add New</div>' +
        '</a>' +
      '</div>';
  }

  const EXAMPLES = {
    expense: "Food, Transport, Shopping, etc.",
    income: "Salary, Business, Investments, Rental Income, etc."
  };

  function renderPane(paneId, categories, type, amountMap){
    const pane = document.getElementById(paneId);
    if(!categories.length){
      pane.innerHTML = '<div class="col-12"><div class="empty-state py-5"><p>No ' + status + ' custom ' + type + ' categories yet — so create your own categories like (' + EXAMPLES[type] + ')</p></div></div>' + addNewCardHtml(type);
      return;
    }
    pane.innerHTML = categories.map(function(c){ return cardHtml(c, type, amountMap.get(c.id) || 0); }).join("") + addNewCardHtml(type);
  }

  function load(){
    $.when(
      MET.api.get("/categories" + MET.qs({ type: "EXPENSE", status: status })),
      MET.api.get("/categories" + MET.qs({ type: "INCOME", status: status })),
      MET.api.get("/reports/category" + MET.qs({ month: month, type: "EXPENSE" })),
      MET.api.get("/reports/category" + MET.qs({ month: month, type: "INCOME" }))
    ).then(function(expResp, incResp, expReportResp, incReportResp){
      const expAmounts = new Map(expReportResp.items.map(function(i){ return [i.id, i.total]; }));
      const incAmounts = new Map(incReportResp.items.map(function(i){ return [i.id, i.total]; }));
      // This page is for managing YOUR categories — default/shared ones
      // (userId === null) can't be edited or deleted by a regular user, so
      // listing them here was just a dead end. They're still available
      // everywhere a category picker is used (transaction forms, reports).
      const myExpense = expResp.categories.filter(function(c){ return c.userId !== null; });
      const myIncome = incResp.categories.filter(function(c){ return c.userId !== null; });
      renderPane("expenseCatPane", myExpense, "expense", expAmounts);
      renderPane("incomeCatPane", myIncome, "income", incAmounts);
    }, function(err){
      MET.toastError(err.message || "Couldn't load categories.");
    });
  }

  $(document).on("click", "#statusToggle button", function(){
    status = $(this).data("status");
    load();
  });

  $(document).ready(load);
})();
