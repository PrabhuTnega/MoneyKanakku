/* Live stats for profile.html — total transactions, months tracked,
   categories used, recurring items. */
(function(){
  "use strict";

  window.MET = window.MET || {};

  // The real avatar-lg on profile.html (the sidebar's own avatar is handled
  // by MET.applySessionToShell in api.js — this one isn't, so it's wired
  // here off the same met:user-ready event).
  $(document).on("met:user-ready", function(e, user){
    const $avatar = $("#profileAvatar");
    if($avatar.length) $avatar.text(MET.initials(user.name));
  });

  // "Months tracked" and "Categories used" need to be derived from the
  // user's FULL transaction history, not just one page of it — the API
  // caps pageSize at 100 (see transactions.validation.ts), so anyone with
  // more than 100 transactions would otherwise be undercounted. There's no
  // server-side endpoint that already returns all-time distinct-month /
  // distinct-category counts (reports/trend is a fixed 12-month window,
  // reports/category is scoped to one month), so this pages through the
  // full result set client-side instead. "Total transactions" still comes
  // straight from the API's own `total`, which is already exact.
  function fetchAllTransactions(page, itemsSoFar){
    return MET.api.get("/transactions" + MET.qs({ pageSize: 100, page: page })).then(function(resp){
      const items = itemsSoFar.concat(resp.items);
      if(items.length < resp.total && resp.items.length > 0){
        return fetchAllTransactions(page + 1, items);
      }
      return { items: items, total: resp.total };
    });
  }

  window.MET.loadProfileStats = function(){
    $.when(
      fetchAllTransactions(1, []),
      MET.api.get("/recurring" + MET.qs({ type: "all" }))
    ).then(function(txnResp, recurringResp){
      document.getElementById("statTotalTxns").textContent = txnResp.total;

      const months = new Set();
      const categories = new Set();
      txnResp.items.forEach(function(t){
        months.add(t.transactionDate.slice(0, 7));
        categories.add(t.categoryId);
      });
      document.getElementById("statMonthsTracked").textContent = months.size;
      document.getElementById("statCategoriesUsed").textContent = categories.size;
      document.getElementById("statRecurringItems").textContent = recurringResp.items.filter(function(r){ return !r.isPaused; }).length;
    }, function(err){
      MET.toastError(err.message || "Couldn't load profile stats.");
    });
  };
})();
