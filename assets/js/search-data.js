/* Live data for search.html — real transaction search + recent-search chips. */
(function(){
  "use strict";

  const RECENT_KEY = "met_recent_searches";
  function fmt(n){ return MET.formatCurrency(n).replace(/\.00$/, ""); }

  function getRecent(){
    try { return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); } catch(e){ return []; }
  }
  function saveRecent(term){
    if(!term) return;
    try {
      let list = getRecent().filter(function(t){ return t.toLowerCase() !== term.toLowerCase(); });
      list.unshift(term);
      localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 6)));
    } catch(e){ /* localStorage unavailable — recent chips just won't persist */ }
  }
  function renderRecentChips(){
    const chips = getRecent();
    document.getElementById("recentChips").innerHTML = chips.length
      ? chips.map(function(t){ return '<button class="filter-chip">' + MET.esc(t) + '</button>'; }).join("")
      : '<span class="text-secondary" style="font-size:.82rem;">No recent searches yet.</span>';
  }

  function renderBrowseCategories(categories){
    document.getElementById("browseCategories").innerHTML = categories.slice(0, 8).map(function(c){
      return '<div class="col"><a href="expenses.html" class="d-flex flex-column align-items-center gap-2 text-decoration-none ripple-surface p-2 rounded-xl">' +
        '<div class="icon-chip-lg" style="background:color-mix(in srgb, ' + MET.esc(c.color) + ' 16%, transparent);color:' + MET.esc(c.color) + ';"><i class="bi ' + MET.esc(c.icon) + '"></i></div>' +
        '<span class="text-secondary fw-600" style="font-size:.7rem;">' + MET.esc(c.name) + '</span></a></div>';
    }).join("");
  }

  function renderResults(items){
    document.getElementById("resultsCount").textContent = items.length + (items.length === 1 ? " found" : " found");
    if(!items.length){
      document.getElementById("resultsSection").classList.add("d-none");
      document.getElementById("emptySection").classList.remove("d-none");
      return;
    }
    document.getElementById("resultsSection").classList.remove("d-none");
    document.getElementById("emptySection").classList.add("d-none");
    document.getElementById("resultsList").innerHTML = items.map(function(t, i){
      const type = t.type === "INCOME" ? "income" : "expense";
      const color = t.category.color;
      const sign = type === "income" ? "+" : "-";
      return '' +
        '<a href="expense-detail.html?id=' + t.id + '" class="d-flex txn-item text-decoration-none">' +
          '<div class="icon-chip" style="background:color-mix(in srgb, ' + MET.esc(color) + ' 16%, transparent);color:' + MET.esc(color) + ';"><i class="bi ' + MET.esc(t.category.icon) + '"></i></div>' +
          '<div class="txn-info"><div class="txn-title" style="color:var(--text-primary);">' + MET.esc(t.description || t.category.name) + '</div><div class="txn-meta">' + MET.esc(t.category.name) + ' • ' + MET.paymentMethodLabel(t.paymentMethod) + ' • ' + MET.formatTxnDate(t.transactionDate) + '</div></div>' +
          '<div class="txn-amount ' + type + '">' + sign + fmt(t.amount) + '</div>' +
        '</a>' + (i < items.length-1 ? '<hr class="divider list-divider">' : '');
    }).join("");
  }

  let searchTimer = null;
  function doSearch(val){
    document.getElementById("recentSection").classList.toggle("d-none", val.length > 0);
    if(val.length === 0){
      document.getElementById("resultsSection").classList.add("d-none");
      document.getElementById("emptySection").classList.add("d-none");
      return;
    }
    MET.api.get("/transactions" + MET.qs({ search: val, pageSize: 20 })).then(function(resp){
      renderResults(resp.items);
    }, function(err){
      MET.toastError(err.message || "Search failed.");
    });
  }

  function onInput(val){
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function(){
      doSearch(val.trim());
      if(val.trim().length >= 2) saveRecent(val.trim());
    }, 350);
  }

  const $mobile = $("#searchInput");
  const $desktop = $("#searchInputDesktop");
  $mobile.on("input", function(){ $desktop.val(this.value); onInput(this.value); });
  $desktop.on("input", function(){ $mobile.val(this.value); onInput(this.value); });

  $(document).on("click", "#recentChips .filter-chip", function(){
    const term = this.textContent;
    $mobile.val(term); $desktop.val(term);
    doSearch(term);
  });

  $("#clearRecentSearches").on("click", function(e){
    e.preventDefault();
    localStorage.removeItem(RECENT_KEY);
    renderRecentChips();
  });

  $(document).ready(function(){
    renderRecentChips();
    MET.api.get("/categories" + MET.qs({ type: "EXPENSE", status: "active" })).then(function(resp){
      renderBrowseCategories(resp.categories);
    });
  });
})();
