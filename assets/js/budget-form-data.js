/* Live data for budget-form.html — create/edit overall or per-category budgets. */
(function(){
  "use strict";

  const editId = new URLSearchParams(window.location.search).get("id");
  const isEditMode = !!editId;
  let scope = "overall";

  document.getElementById("scopeToggle").querySelectorAll("button").forEach(function(btn){
    btn.addEventListener("click", function(){
      scope = this.getAttribute("data-target") === "categoryFields" ? "category" : "overall";
      document.getElementById("categoryFields").classList.toggle("d-none", scope !== "category");
    });
  });

  function setMonthInput(monthYearStr){
    document.getElementById("monthInput").value = monthYearStr.slice(0, 7);
  }
  function defaultMonth(){
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2, "0");
  }

  function loadCategories(selectedId){
    return MET.api.get("/categories" + MET.qs({ type: "EXPENSE", status: "active" })).then(function(resp){
      const $select = $("#categorySelect");
      $select.html(resp.categories.map(function(c){
        return '<option value="' + c.id + '">' + MET.esc(c.name) + '</option>';
      }).join(""));
      if(selectedId) $select.val(selectedId);
    });
  }

  function loadForEdit(){
    // Budgets can only be updated (amount/threshold/repeat), never moved to
    // a different category or month — so find it among THIS month's list.
    MET.api.get("/budgets" + MET.qs({ month: MET.currentMonth() })).then(function(resp){
      const all = (resp.overall ? [resp.overall] : []).concat(resp.categories);
      const b = all.find(function(x){ return x.id === editId; });
      if(!b){
        MET.toastError("Budget not found.");
        setTimeout(function(){ window.location.href = "budget.html"; }, 1000);
        return;
      }
      scope = b.categoryId ? "category" : "overall";
      document.getElementById("scopeToggle").querySelectorAll("button").forEach(function(btn){
        btn.classList.toggle("active", (btn.getAttribute("data-target") === "categoryFields") === (scope === "category"));
      });
      document.getElementById("categoryFields").classList.toggle("d-none", scope !== "category");
      document.getElementById("scopeToggle").querySelectorAll("button").forEach(function(btn){ btn.disabled = true; });
      document.getElementById("amountInput").value = Number(b.amount);
      setMonthInput(b.monthYear.slice(0,7));
      document.getElementById("monthInput").disabled = true;
      document.getElementById("repeatToggle").checked = !!b.repeatMonthly;
      document.getElementById("alertToggle").checked = b.alertThresholdPercent <= 80;

      if(scope === "category"){
        loadCategories(b.categoryId).then(function(){ $("#categorySelect").prop("disabled", true); });
      }
    });
  }

  $("#budgetForm").on("submit", function(e){
    e.preventDefault();
    const $form = $(this);
    if(!MET.validateForm($form)) return;

    const monthVal = document.getElementById("monthInput").value; // YYYY-MM
    const payload = {
      amount: parseFloat($("#amountInput").val()),
      alertThresholdPercent: $("#alertToggle").is(":checked") ? 80 : 100,
      repeatMonthly: $("#repeatToggle").is(":checked"),
    };

    const $btn = $("#saveBtn");
    MET.showButtonLoading($btn, "Saving…");

    let request;
    if(isEditMode){
      request = MET.api.patch("/budgets/" + editId, payload);
    } else {
      payload.monthYear = monthVal + "-01";
      payload.categoryId = scope === "category" ? $("#categorySelect").val() : null;
      request = MET.api.post("/budgets", payload);
    }

    request.then(function(){
      MET.toastSuccess("Budget " + (isEditMode ? "updated" : "saved") + " successfully");
      setTimeout(function(){ window.location.href = "budget.html"; }, 600);
    }, function(err){
      MET.hideButtonLoading($btn);
      if(err.fieldErrors){ MET.applyServerFieldErrors($form, err.fieldErrors); }
      else { MET.showFormError($form, err.message); }
      if(err.status !== 422) MET.toastError(err.message);
    });
  });

  $(document).ready(function(){
    if(isEditMode){
      loadForEdit();
    } else {
      setMonthInput(defaultMonth() + "-01");
      loadCategories();
    }
  });
})();
