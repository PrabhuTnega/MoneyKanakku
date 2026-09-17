/* Live data for expense-detail.html */
(function(){
  "use strict";

  const id = new URLSearchParams(window.location.search).get("id");
  function fmt(n){ return MET.formatCurrency(n).replace(/\.00$/, ""); }
  function fmtDateTime(iso){
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) + " — " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }

  function render(t){
    const type = t.type === "INCOME" ? "income" : "expense";
    const isIncome = type === "income";
    const color = t.category.color;
    const amountColor = isIncome ? "var(--income-color)" : "var(--expense-color)";

    document.getElementById("detailIcon").style.background = "color-mix(in srgb, " + color + " 16%, transparent)";
    document.getElementById("detailIcon").style.color = color;
    document.getElementById("detailIcon").querySelector("i").className = "bi " + t.category.icon;
    document.getElementById("detailTitle").textContent = t.description || t.category.name;
    const amountEl = document.getElementById("detailAmount");
    amountEl.textContent = (isIncome ? "+" : "-") + fmt(t.amount);
    amountEl.style.color = amountColor;
    document.getElementById("detailCategoryBadge").textContent = t.category.name;
    document.getElementById("detailCategoryBadge").className = "badge-soft " + (isIncome ? "b-teal" : "b-violet") + " mt-2";
    document.getElementById("detailDate").textContent = fmtDateTime(t.transactionDate);
    document.getElementById("detailMethod").textContent = MET.paymentMethodLabel(t.paymentMethod);
    document.getElementById("detailCategory").textContent = t.category.name;
    document.getElementById("detailRecurring").textContent = t.isRecurring && t.recurringTransaction
      ? "Yes — " + t.recurringTransaction.frequency.charAt(0) + t.recurringTransaction.frequency.slice(1).toLowerCase()
      : "No";
    document.getElementById("detailNotes").textContent = t.description || "No description added.";
    document.title = (isIncome ? "Income" : "Expense") + " Details — Expensio";
    document.getElementById("deleteModalTitle").textContent = "Delete this " + (isIncome ? "income entry" : "expense") + "?";

    // Created/Last updated card — the two rows are static text, just fill the two value spans.
    const metaCard = document.querySelector('main .surface-card[style*="text-muted"]');
    if(metaCard){
      const spans = metaCard.querySelectorAll(".d-flex.justify-content-between span:last-child");
      if(spans[0]) spans[0].textContent = fmtDateTime(t.createdAt);
      if(spans[1]) spans[1].textContent = fmtDateTime(t.updatedAt);
    }

    document.getElementById("editLinkMobile").href = "expense-form.html?id=" + t.id;
    document.getElementById("editLinkDesktop").href = "expense-form.html?id=" + t.id;
  }

  function load(){
    if(!id){
      MET.toastError("No transaction specified.");
      setTimeout(function(){ window.location.href = "expenses.html"; }, 800);
      return;
    }
    MET.showPageLoader();
    MET.api.get("/transactions/" + id).then(function(resp){
      render(resp.transaction);
    }, function(err){
      MET.toastError(err.message || "Couldn't load this transaction.");
      setTimeout(function(){ window.location.href = "expenses.html"; }, 1000);
    }).always(function(){ MET.hidePageLoader(); });
  }

  $("#confirmDeleteBtn").on("click", function(){
    const $btn = $(this);
    MET.showButtonLoading($btn, "Deleting…");
    MET.api.del("/transactions/" + id).then(function(){
      MET.toastSuccess("Transaction deleted.");
      setTimeout(function(){ window.location.href = "expenses.html"; }, 500);
    }, function(err){
      MET.hideButtonLoading($btn);
      MET.toastError(err.message);
    });
  });

  $(document).ready(load);
})();
