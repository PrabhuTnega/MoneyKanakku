/* Live data for recurring-form.html — real categories, create/edit wiring. */
(function(){
  "use strict";

  const params = new URLSearchParams(window.location.search);
  const editId = params.get("id");
  const isEditMode = !!editId;
  window.recurType = "expense";

  const els = {
    toggle: document.getElementById("typeToggle"),
    amountCard: document.getElementById("amountCard"),
    amountLabel: document.getElementById("amountLabel"),
    currencySymbol: document.getElementById("currencySymbol"),
    amountInput: document.getElementById("amountInput"),
    categorySelect: document.getElementById("categorySelect"),
    methodLabel: document.getElementById("methodLabel"),
    autoGenLabel: document.getElementById("autoGenLabel"),
    saveBtn: document.getElementById("saveBtn"),
    formTitleMobile: document.getElementById("formTitleMobile"),
    formTitleDesktop: document.getElementById("formTitleDesktop"),
    titleInput: document.getElementById("titleInput"),
  };

  let expenseCategories = [];
  let incomeCategories = [];

  function populateCategorySelect(){
    const list = window.recurType === "income" ? incomeCategories : expenseCategories;
    els.categorySelect.innerHTML = list.map(function(c){ return '<option value="' + c.id + '">' + MET.esc(c.name) + '</option>'; }).join("");
  }

  function applyType(type){
    window.recurType = type;
    const isIncome = type === "income";
    const color = isIncome ? "var(--income-color)" : "var(--accent-coral)";
    const verb = isIncome ? "Income" : "Expense";
    const actionWord = isEditMode ? "Edit" : "New";

    els.toggle.querySelectorAll("button").forEach(function(b){ b.classList.toggle("active", b.getAttribute("data-type") === type); });
    els.amountCard.style.borderColor = color;
    els.amountLabel.textContent = verb.toUpperCase() + " AMOUNT";
    els.currencySymbol.style.color = color;
    els.amountInput.style.color = color;
    populateCategorySelect();
    els.methodLabel.textContent = isIncome ? "Received via" : "Payment method";
    els.autoGenLabel.textContent = "Auto-generate " + verb.toLowerCase();
    els.saveBtn.textContent = "Save Recurring " + verb;
    els.saveBtn.style.background = color;
    els.formTitleMobile.textContent = actionWord + " Recurring " + verb;
    els.formTitleDesktop.textContent = actionWord + " Recurring " + verb;
    document.title = actionWord + " Recurring " + verb + " — Expensio";
  }

  els.toggle.querySelectorAll("button").forEach(function(btn){
    btn.addEventListener("click", function(){ if(!isEditMode) applyType(this.getAttribute("data-type")); });
  });
  document.getElementById("freqToggle").querySelectorAll("button").forEach(function(btn){
    btn.addEventListener("click", function(){
      if(isEditMode) return;
      this.parentElement.querySelectorAll("button").forEach(function(b){ b.classList.remove("active"); });
      this.classList.add("active");
    });
  });

  function lockCreateOnlyFields(){
    els.toggle.querySelectorAll("button").forEach(function(b){ b.disabled = true; });
    els.categorySelect.disabled = true;
    document.getElementById("freqToggle").querySelectorAll("button").forEach(function(b){ b.disabled = true; });
    document.getElementById("startDateInput").disabled = true;
  }

  function loadForEdit(){
    MET.api.get("/recurring" + MET.qs({ type: "all" })).then(function(resp){
      const rule = resp.items.find(function(r){ return r.id === editId; });
      if(!rule){
        MET.toastError("Recurring rule not found.");
        setTimeout(function(){ window.location.href = "recurring.html"; }, 1000);
        return;
      }
      applyType(rule.type === "INCOME" ? "income" : "expense");
      $("#categorySelect").val(rule.categoryId);
      els.titleInput.value = rule.title;
      els.amountInput.value = Number(rule.amount);
      $("#methodSelect").val(rule.paymentMethod);
      document.getElementById("freqToggle").querySelectorAll("button").forEach(function(b){
        b.classList.toggle("active", b.getAttribute("data-freq") === rule.frequency);
      });
      document.getElementById("startDateInput").value = rule.startDate.slice(0, 10);
      document.getElementById("endDateInput").value = rule.endDate ? rule.endDate.slice(0, 10) : "";
      document.getElementById("autoGenToggle").checked = rule.autoGenerate;
      document.getElementById("remindToggle").checked = rule.remindersEnabled;
      lockCreateOnlyFields();
      $("#deleteBtn").removeClass("d-none");
    }, function(err){
      MET.toastError(err.message || "Couldn't load this recurring rule.");
    });
  }

  $("#recurForm").on("submit", function(e){
    e.preventDefault();
    const $form = $(this);
    if(!MET.validateForm($form)) return;

    const payload = {
      title: els.titleInput.value.trim(),
      amount: parseFloat(els.amountInput.value),
      paymentMethod: $("#methodSelect").val(),
      endDate: document.getElementById("endDateInput").value || null,
      autoGenerate: $("#autoGenToggle").is(":checked"),
      remindersEnabled: $("#remindToggle").is(":checked"),
      remindBeforeDays: $("#remindToggle").is(":checked") ? 1 : 0,
    };

    const $btn = $("#saveBtn");
    MET.showButtonLoading($btn, "Saving…");

    let request;
    if(isEditMode){
      request = MET.api.patch("/recurring/" + editId, payload);
    } else {
      payload.categoryId = $("#categorySelect").val();
      payload.type = window.recurType === "income" ? "INCOME" : "EXPENSE";
      payload.frequency = document.querySelector("#freqToggle button.active").getAttribute("data-freq");
      payload.startDate = document.getElementById("startDateInput").value;
      request = MET.api.post("/recurring", payload);
    }

    request.then(function(){
      MET.toastSuccess("Recurring " + window.recurType + (isEditMode ? " updated" : " saved") + " successfully");
      setTimeout(function(){ window.location.href = "recurring.html"; }, 600);
    }, function(err){
      MET.hideButtonLoading($btn);
      if(err.fieldErrors){ MET.applyServerFieldErrors($form, err.fieldErrors); }
      else { MET.showFormError($form, err.message); }
      if(err.status !== 422) MET.toastError(err.message);
    });
  });

  $("#deleteBtn").on("click", function(){
    if(!window.confirm("Delete this recurring rule? Past transactions it already generated will stay in your history.")) return;
    const $btn = $(this);
    MET.showButtonLoading($btn, "Deleting…");
    MET.api.del("/recurring/" + editId).then(function(){
      MET.toastSuccess("Recurring rule deleted.");
      setTimeout(function(){ window.location.href = "recurring.html"; }, 500);
    }, function(err){
      MET.hideButtonLoading($btn);
      MET.toastError(err.message);
    });
  });

  $(document).ready(function(){
    $.when(
      MET.api.get("/categories" + MET.qs({ type: "EXPENSE", status: "active" })),
      MET.api.get("/categories" + MET.qs({ type: "INCOME", status: "active" }))
    ).then(function(expResp, incResp){
      expenseCategories = expResp.categories;
      incomeCategories = incResp.categories;

      if(isEditMode){
        loadForEdit();
      } else {
        document.getElementById("startDateInput").valueAsDate = new Date();
        const initialType = params.get("type") === "income" ? "income" : "expense";
        applyType(initialType);
      }
    }, function(err){
      MET.toastError(err.message || "Couldn't load categories.");
    });
  });
})();
