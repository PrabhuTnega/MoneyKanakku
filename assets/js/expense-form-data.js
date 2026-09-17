/* Live data for expense-form.html — real categories, create/edit wiring. */
(function(){
  "use strict";

  const params = new URLSearchParams(window.location.search);
  const editId = params.get("id");
  const isEditMode = !!editId;

  window.txnType = "expense";
  let expenseCategories = [];
  let incomeCategories = [];
  let selectedCategoryId = null;

  const els = {
    toggle: document.getElementById("typeToggle"),
    amountCard: document.getElementById("amountCard"),
    amountLabel: document.getElementById("amountLabel"),
    currencySymbol: document.getElementById("currencySymbol"),
    amountInput: document.getElementById("amountInput"),
    expenseGrid: document.getElementById("expenseCategoryGrid"),
    incomeGrid: document.getElementById("incomeCategoryGrid"),
    expenseCatEmpty: document.getElementById("expenseCatEmpty"),
    incomeCatEmpty: document.getElementById("incomeCatEmpty"),
    methodLabel: document.getElementById("methodLabel"),
    recurCard: document.getElementById("recurCard"),
    recurHint: document.getElementById("recurHint"),
    saveBtn: document.getElementById("saveBtn"),
    formTitleMobile: document.getElementById("formTitleMobile"),
    formTitleDesktop: document.getElementById("formTitleDesktop"),
  };

  function categoryCardHtml(cat, type){
    return '' +
      '<div class="col"><label class="d-flex flex-column align-items-center gap-1 ripple-surface p-2 rounded-xl" data-cat-id="' + cat.id + '" style="cursor:pointer;">' +
        '<input type="radio" name="cat-' + type + '" class="d-none" value="' + cat.id + '">' +
        '<div class="icon-chip-lg cat-swatch" style="background:color-mix(in srgb, ' + MET.esc(cat.color) + ' 16%, transparent);color:' + MET.esc(cat.color) + ';"><i class="bi ' + MET.esc(cat.icon) + '"></i></div>' +
        '<span style="font-size:.68rem;font-weight:600;">' + MET.esc(cat.name) + '</span>' +
      '</label></div>';
  }

  function renderGrid(grid, categories, type){
    grid.innerHTML = categories.map(function(c){ return categoryCardHtml(c, type); }).join("") +
      '<div class="col"><a href="categories.html" class="d-flex flex-column align-items-center gap-1 ripple-surface p-2 rounded-xl text-decoration-none">' +
        '<div class="icon-chip-lg" style="background:var(--surface-soft);color:var(--text-secondary);"><i class="bi bi-three-dots"></i></div>' +
        '<span style="font-size:.68rem;font-weight:600;color:var(--text-secondary);">More</span>' +
      '</a></div>';
  }

  /** Shows either the category grid or a "create one first" helper for
   *  whichever type is active, and — only when adding a brand-new
   *  transaction, never while editing an existing one that may already
   *  reference a category outside today's picker — blocks amount entry
   *  and saving until at least one matching category exists. Editing an
   *  existing transaction must never be blocked by this: it already has
   *  a valid category, and disabling the form would make it impossible
   *  to edit transactions created before this restriction (or ones still
   *  tagged with a shared/default category from back then). */
  function layoutCategoryPane(){
    const isIncome = window.txnType === "income";
    // In edit mode, always show the grid (never the empty-state prompt) —
    // the transaction already has a valid category, even if it's since
    // stopped appearing in this (now custom-only) picker.
    const expenseHasCats = isEditMode || expenseCategories.length > 0;
    const incomeHasCats = isEditMode || incomeCategories.length > 0;

    els.expenseGrid.classList.toggle("d-none", isIncome || !expenseHasCats);
    els.expenseCatEmpty.classList.toggle("d-none", isIncome || expenseHasCats);
    els.incomeGrid.classList.toggle("d-none", !isIncome || !incomeHasCats);
    els.incomeCatEmpty.classList.toggle("d-none", !isIncome || incomeHasCats);

    const blocked = !isEditMode && (isIncome ? !incomeHasCats : !expenseHasCats);
    els.amountInput.disabled = blocked;
    els.saveBtn.disabled = blocked;
    els.saveBtn.classList.toggle("disabled", blocked);
  }

  function selectCategory(id){
    selectedCategoryId = id;
    document.querySelectorAll('.cat-swatch').forEach(function(el){ el.style.outline = "none"; });
    const label = document.querySelector('[data-cat-id="' + id + '"] .cat-swatch');
    if(label) label.style.outline = "2px solid var(--brand-500)";
    setCatError(null);
  }

  function setCatError(message){
    const errId = window.txnType === "income" ? "#incomeCatError" : "#expenseCatError";
    const $err = $(errId);
    if(message){ $err.text(message).addClass("d-block"); }
    else { $err.removeClass("d-block").text(""); }
  }

  $(document).on("click", "#expenseCategoryGrid [data-cat-id], #incomeCategoryGrid [data-cat-id]", function(){
    selectCategory($(this).data("cat-id"));
  });

  function applyType(type){
    window.txnType = type;
    const isIncome = type === "income";
    const color = isIncome ? "var(--income-color)" : "var(--accent-coral)";
    const verb = isIncome ? "Income" : "Expense";
    const actionWord = isEditMode ? "Edit" : "Add";

    els.toggle.querySelectorAll("button").forEach(function(b){ b.classList.toggle("active", b.getAttribute("data-type") === type); });
    els.amountCard.style.borderColor = color;
    els.amountLabel.textContent = verb.toUpperCase() + " AMOUNT";
    els.currencySymbol.style.color = color;
    els.amountInput.style.color = color;
    layoutCategoryPane();
    document.getElementById("expenseCatError").classList.toggle("d-none", isIncome);
    document.getElementById("incomeCatError").classList.toggle("d-none", !isIncome);
    els.methodLabel.textContent = isIncome ? "Received via" : "Payment method";
    els.recurHint.textContent = "Auto-generate this " + verb.toLowerCase() + " monthly";
    els.saveBtn.textContent = actionWord + " " + verb;
    els.saveBtn.style.background = color;
    els.formTitleMobile.textContent = actionWord + " " + verb;
    els.formTitleDesktop.textContent = actionWord + " " + verb;
    document.title = actionWord + " " + verb + " — Expensio";
    selectedCategoryId = null;
    document.querySelectorAll('.cat-swatch').forEach(function(el){ el.style.outline = "none"; });
  }

  els.toggle.querySelectorAll("button").forEach(function(btn){
    btn.addEventListener("click", function(){ applyType(this.getAttribute("data-type")); });
  });

  document.getElementById("recurToggle").addEventListener("change", function(){
    document.getElementById("recurOptions").classList.toggle("d-none", !this.checked);
  });

  function loadCategoriesThenInit(){
    $.when(
      MET.api.get("/categories" + MET.qs({ type: "EXPENSE", status: "active" })),
      MET.api.get("/categories" + MET.qs({ type: "INCOME", status: "active" }))
    ).then(function(expResp, incResp){
      // Only categories the user created themselves — the shared/default
      // ones are managed on categories.html, not picked from here (matches
      // expenses.html's filter chips — see [[expensio-expenses-category-chips]]).
      expenseCategories = expResp.categories.filter(function(c){ return c.userId !== null; });
      incomeCategories = incResp.categories.filter(function(c){ return c.userId !== null; });
      renderGrid(els.expenseGrid, expenseCategories, "expense");
      renderGrid(els.incomeGrid, incomeCategories, "income");

      if(isEditMode){
        loadForEdit();
      } else {
        document.getElementById("dateInput").valueAsDate = new Date();
        const initialType = params.get("type") === "income" ? "income" : "expense";
        applyType(initialType);
      }
    }, function(err){
      MET.toastError(err.message || "Couldn't load categories.");
    });
  }

  function loadForEdit(){
    MET.api.get("/transactions/" + editId).then(function(resp){
      const t = resp.transaction;
      const type = t.type === "INCOME" ? "income" : "expense";
      applyType(type);
      document.getElementById("amountInput").value = t.amount;
      document.getElementById("dateInput").value = t.transactionDate.slice(0, 10);
      document.getElementById("methodSelect").value = t.paymentMethod;
      document.getElementById("descInput").value = t.description || "";
      selectCategory(t.categoryId);
      // recurringFrequency only applies at creation time (see
      // transactions.validation.ts) — editing an existing transaction
      // can't retroactively attach a recurring rule to it.
      els.recurCard.classList.add("d-none");
    }, function(err){
      MET.toastError(err.message || "Couldn't load this transaction.");
      setTimeout(function(){ window.location.href = "expenses.html"; }, 1200);
    });
  }

  $("#txnForm").on("submit", function(e){
    e.preventDefault();
    const $form = $(this);
    let valid = MET.validateForm($form);
    if(!selectedCategoryId){
      valid = false;
      setCatError("Pick a category.");
    }
    if(!valid) return;

    const payload = {
      categoryId: selectedCategoryId,
      amount: parseFloat($("#amountInput").val()),
      paymentMethod: $("#methodSelect").val(),
      transactionDate: $("#dateInput").val(),
      description: $("#descInput").val().trim() || undefined,
    };

    const $btn = $("#saveBtn");
    MET.showButtonLoading($btn, "Saving…");

    let request;
    if(isEditMode){
      request = MET.api.patch("/transactions/" + editId, payload);
    } else {
      payload.type = window.txnType === "income" ? "INCOME" : "EXPENSE";
      if(document.getElementById("recurToggle").checked){
        payload.recurringFrequency = document.getElementById("recurFrequency").value;
      }
      request = MET.api.post("/transactions", payload);
    }

    request.then(function(){
      MET.toastSuccess((window.txnType === "income" ? "Income" : "Expense") + (isEditMode ? " updated" : " saved") + " successfully");
      setTimeout(function(){ window.location.href = "expenses.html"; }, 600);
    }, function(err){
      MET.hideButtonLoading($btn);
      if(err.fieldErrors){ MET.applyServerFieldErrors($form, err.fieldErrors); }
      else { MET.showFormError($form, err.message); }
      if(err.status !== 422) MET.toastError(err.message);
    });
  });

  $(document).ready(loadCategoriesThenInit);
})();
