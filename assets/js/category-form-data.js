/* Live data for category-form.html — icon/color picker + create/edit. */
(function(){
  "use strict";

  const params = new URLSearchParams(window.location.search);
  const editId = params.get("id");
  const isEditMode = !!editId;
  const type = params.get("type") === "income" ? "income" : "expense";
  const previewIcon = document.getElementById("previewIcon");

  function selectIcon(icon){
    document.querySelectorAll("#iconPicker .icon-pick").forEach(function(e){ e.classList.toggle("selected", e.getAttribute("data-icon") === icon); });
    previewIcon.querySelector("i").className = "bi " + icon;
  }
  function selectColor(color){
    document.querySelectorAll("#colorPicker .swatch").forEach(function(e){
      const match = e.getAttribute("data-color") === color;
      e.classList.toggle("selected", match);
      e.innerHTML = match ? '<i class="bi bi-check-lg"></i>' : "";
    });
    previewIcon.style.color = color;
    previewIcon.style.background = "color-mix(in srgb, " + color + " 16%, transparent)";
  }

  document.querySelectorAll("#iconPicker .icon-pick").forEach(function(el){
    el.addEventListener("click", function(){ selectIcon(this.getAttribute("data-icon")); });
  });
  document.querySelectorAll("#colorPicker .swatch").forEach(function(el){
    el.addEventListener("click", function(){ selectColor(this.getAttribute("data-color")); });
  });

  function applyTypeCopy(){
    if(type === "income"){
      document.title = (isEditMode ? "Edit" : "New") + " Income Category — Expensio";
      document.getElementById("formTitleMobile").textContent = (isEditMode ? "Edit" : "New") + " Income Category";
      document.getElementById("formTitleDesktop").textContent = (isEditMode ? "Edit" : "New") + " Income Category";
      document.getElementById("activeHint").textContent = "Show this category when adding income";
    } else if(isEditMode){
      document.getElementById("formTitleMobile").textContent = "Edit Expense Category";
      document.getElementById("formTitleDesktop").textContent = "Edit Expense Category";
    }
  }

  function loadForEdit(){
    MET.api.get("/categories" + MET.qs({ type: type.toUpperCase(), status: "all" })).then(function(resp){
      const cat = resp.categories.find(function(c){ return c.id === editId; });
      if(!cat){
        MET.toastError("Category not found.");
        setTimeout(function(){ window.location.href = "categories.html"; }, 1000);
        return;
      }
      document.getElementById("nameInput").value = cat.name;
      selectIcon(cat.icon);
      selectColor(cat.color);
      document.getElementById("activeToggle").checked = cat.isActive;
      if(cat.userId === null){
        MET.showFormError($("#catForm"), "This is a shared system category — you can view it, but only an admin can edit it.");
        $("#catForm :input, #catForm .icon-pick, #catForm .swatch").prop("disabled", true).css("pointer-events", "none");
        $("#saveBtn").prop("disabled", true).addClass("disabled");
      } else {
        // Only the user's own custom categories can be deleted — shared
        // system categories (userId === null) are admin-managed, same
        // boundary as the edit restriction just above. Lives in the header
        // (mobile + desktop) rather than at the bottom of the form so it's
        // visible without scrolling past the icon/color pickers.
        document.querySelectorAll(".delete-cat-btn").forEach(function(btn){ btn.classList.remove("d-none"); });
      }
    }, function(err){
      MET.toastError(err.message || "Couldn't load this category.");
    });
  }

  $("#catForm").on("submit", function(e){
    e.preventDefault();
    const $form = $(this);
    if(!MET.validateForm($form)) return;

    const selectedIcon = document.querySelector("#iconPicker .icon-pick.selected");
    const selectedColor = document.querySelector("#colorPicker .swatch.selected");

    const payload = {
      name: $("#nameInput").val().trim(),
      icon: selectedIcon ? selectedIcon.getAttribute("data-icon") : "bi-tag-fill",
      color: selectedColor ? selectedColor.getAttribute("data-color") : "var(--chart-1-blue)",
      isActive: $("#activeToggle").is(":checked"),
    };
    if(!isEditMode) payload.transactionType = type.toUpperCase();

    const $btn = $("#saveBtn");
    MET.showButtonLoading($btn, "Saving…");
    const request = isEditMode
      ? MET.api.patch("/categories/" + editId, payload)
      : MET.api.post("/categories", payload);

    request.then(function(){
      MET.toastSuccess("Category " + (isEditMode ? "updated" : "created") + " successfully");
      setTimeout(function(){ window.location.href = "categories.html"; }, 600);
    }, function(err){
      MET.hideButtonLoading($btn);
      if(err.fieldErrors){ MET.applyServerFieldErrors($form, err.fieldErrors); }
      else { MET.showFormError($form, err.message); }
      if(err.status !== 422) MET.toastError(err.message);
    });
  });

  $("#confirmDeleteBtn").on("click", function(){
    const $btn = $(this);
    MET.showButtonLoading($btn, "Deleting…");
    MET.api.del("/categories/" + editId).then(function(){
      MET.toastSuccess("Category deleted.");
      setTimeout(function(){ window.location.href = "categories.html"; }, 500);
    }, function(err){
      MET.hideButtonLoading($btn);
      bootstrap.Modal.getInstance(document.getElementById("deleteModal")).hide();
      MET.toastError(err.message);
    });
  });

  applyTypeCopy();
  if(isEditMode){
    loadForEdit();
  } else if(type === "income"){
    selectIcon("bi-briefcase-fill");
  }
})();
