/* Live data for admin-categories.html — global category management + system settings. */
(function(){
  "use strict";

  function catRowHtml(c){
    return '' +
      '<tr data-id="' + c.id + '">' +
        '<td><div class="d-flex align-items-center gap-2"><div class="icon-chip" style="background:color-mix(in srgb, ' + MET.esc(c.color) + ' 16%, transparent);color:' + MET.esc(c.color) + ';"><i class="bi ' + MET.esc(c.icon) + '"></i></div>' + MET.esc(c.name) + '</div></td>' +
        '<td>' + (c.isActive ? '<span class="badge-soft b-teal">Active</span>' : '<span class="badge-soft b-gray">Inactive</span>') + '</td>' +
        '<td class="text-end">' +
          '<div class="d-inline-flex align-items-center gap-3">' +
            '<div class="form-check form-switch d-inline-block m-0"><input class="form-check-input cat-active-toggle" data-id="' + c.id + '" type="checkbox" ' + (c.isActive ? "checked" : "") + ' style="cursor:pointer;"></div>' +
            '<button type="button" class="icon-btn ripple-surface cat-delete-btn" data-id="' + c.id + '" data-name="' + MET.esc(c.name) + '" title="Delete permanently" style="width:32px;height:32px;"><i class="bi bi-trash3" style="color:var(--accent-coral);"></i></button>' +
          '</div>' +
        '</td>' +
      '</tr>';
  }

  function loadCategories(){
    $.when(
      MET.api.get("/categories" + MET.qs({ type: "EXPENSE", status: "all", scope: "global" })),
      MET.api.get("/categories" + MET.qs({ type: "INCOME", status: "all", scope: "global" }))
    ).then(function(expResp, incResp){
      document.querySelector("#adminExpenseCatTable tbody").innerHTML = expResp.categories.map(catRowHtml).join("");
      document.querySelector("#adminIncomeCatTable tbody").innerHTML = incResp.categories.map(catRowHtml).join("");
    }, function(err){
      MET.toastError(err.message || "Couldn't load categories.");
    });
  }

  $(document).on("change", ".cat-active-toggle", function(){
    const id = $(this).data("id");
    const isActive = this.checked;
    const $toggle = $(this);
    MET.api.patch("/categories/" + id, { isActive: isActive }).then(function(){
      MET.toastSuccess("Category " + (isActive ? "activated" : "deactivated") + ".");
      $toggle.closest("tr").find("td:nth-child(2)").html(isActive ? '<span class="badge-soft b-teal">Active</span>' : '<span class="badge-soft b-gray">Inactive</span>');
    }, function(err){
      $toggle.prop("checked", !isActive);
      MET.toastError(err.message);
    });
  });

  /* ---------- Permanent delete (global categories) ----------
   * The API blocks this with a 409 while any user's transaction or
   * recurring rule still references the category — expected and common
   * for a well-used default category; deactivating is the right tool for
   * those. This is really only clean-up for a global category that was
   * added by mistake or never ended up used. */
  let deleteTargetId = null;
  $(document).on("click", ".cat-delete-btn", function(){
    deleteTargetId = $(this).data("id");
    $("#adminDeleteCatName").text('"' + $(this).data("name") + '"');
    bootstrap.Modal.getOrCreateInstance(document.getElementById("adminDeleteCatModal")).show();
  });

  $("#adminConfirmDeleteCatBtn").on("click", function(){
    if(!deleteTargetId) return;
    const $btn = $(this);
    MET.showButtonLoading($btn, "Deleting…");
    MET.api.del("/categories/" + deleteTargetId).then(function(){
      MET.hideButtonLoading($btn);
      MET.toastSuccess("Category deleted permanently.");
      bootstrap.Modal.getInstance(document.getElementById("adminDeleteCatModal")).hide();
      $('tr[data-id="' + deleteTargetId + '"]').fadeOut(200, function(){ $(this).remove(); });
      deleteTargetId = null;
    }, function(err){
      MET.hideButtonLoading($btn);
      bootstrap.Modal.getInstance(document.getElementById("adminDeleteCatModal")).hide();
      MET.toastError(err.message);
    });
  });

  /* ---------- New global category modal ---------- */
  let newCatType = "expense";
  const previewEl = document.getElementById("newCatPreview");

  function selectIcon(icon){
    document.querySelectorAll("#newCatIconPicker .icon-pick").forEach(function(e){ e.classList.toggle("selected", e.getAttribute("data-icon") === icon); });
    previewEl.querySelector("i").className = "bi " + icon;
  }
  function selectColor(color){
    document.querySelectorAll("#newCatColorPicker .swatch").forEach(function(e){
      const match = e.getAttribute("data-color") === color;
      e.classList.toggle("selected", match);
      e.innerHTML = match ? '<i class="bi bi-check-lg"></i>' : "";
    });
    previewEl.style.color = color;
    previewEl.style.background = "color-mix(in srgb, " + color + " 16%, transparent)";
  }
  document.querySelectorAll("#newCatIconPicker .icon-pick").forEach(function(el){
    el.addEventListener("click", function(){ selectIcon(this.getAttribute("data-icon")); });
  });
  document.querySelectorAll("#newCatColorPicker .swatch").forEach(function(el){
    el.addEventListener("click", function(){ selectColor(this.getAttribute("data-color")); });
  });
  document.getElementById("newCatTypeToggle").querySelectorAll("button").forEach(function(btn){
    btn.addEventListener("click", function(){
      newCatType = this.getAttribute("data-modal-type");
      this.parentElement.querySelectorAll("button").forEach(function(b){ b.classList.remove("active"); });
      this.classList.add("active");
    });
  });

  $("#newCatForm").on("submit", function(e){
    e.preventDefault();
    const $form = $(this);
    if(!MET.validateForm($form)) return;
    const icon = document.querySelector("#newCatIconPicker .icon-pick.selected").getAttribute("data-icon");
    const color = document.querySelector("#newCatColorPicker .swatch.selected").getAttribute("data-color");

    const $btn = $("#newCatSaveBtn");
    MET.showButtonLoading($btn, "Adding…");
    MET.api.post("/categories/global", {
      name: $("#newCatName").val().trim(),
      icon: icon,
      color: color,
      transactionType: newCatType.toUpperCase(),
      isActive: true,
    }).then(function(){
      MET.hideButtonLoading($btn);
      MET.toastSuccess("Global category added.");
      bootstrap.Modal.getInstance(document.getElementById("newCatModal")).hide();
      $form[0].reset();
      loadCategories();
    }, function(err){
      MET.hideButtonLoading($btn);
      if(err.fieldErrors){ MET.applyServerFieldErrors($form, err.fieldErrors); }
      else { MET.showFormError($form, err.message); }
      if(err.status !== 422) MET.toastError(err.message);
    });
  });

  /* ---------- System settings ---------- */
  function loadSettings(){
    MET.api.get("/admin/settings").then(function(settings){
      $("#setDefaultCurrency").val(settings.default_currency);
      $("#setDefaultTimezone").val(settings.default_timezone);
      $("#setFiscalDay").val(settings.fiscal_month_start_day);
      $("#setKeepDeleted").prop("checked", !!settings["data_retention.keep_deleted_transactions"]);
      $("#setRetentionYears").val(String(settings["data_retention.years"]));
      $("#setSessionTimeout").val(String(settings["security.session_timeout_minutes"]));
      $("#setMinPasswordLength").val(String(settings["security.min_password_length"]));
      $("#setAnnouncements").prop("checked", !!settings["notifications.system_wide_announcements"]);
      $("#setEmailDigest").prop("checked", !!settings["notifications.email_digest_to_admins"]);
    }, function(err){
      MET.toastError(err.message || "Couldn't load system settings.");
    });
  }

  $("#saveConfigBtn").on("click", function(){
    const $btn = $(this);
    MET.showButtonLoading($btn, "Saving…");
    $.when(
      MET.api.patch("/admin/settings/default_currency", { value: $("#setDefaultCurrency").val() }),
      MET.api.patch("/admin/settings/default_timezone", { value: $("#setDefaultTimezone").val() }),
      MET.api.patch("/admin/settings/fiscal_month_start_day", { value: parseInt($("#setFiscalDay").val(), 10) }),
      MET.api.patch("/admin/settings/data_retention.keep_deleted_transactions", { value: $("#setKeepDeleted").is(":checked") }),
      MET.api.patch("/admin/settings/data_retention.years", { value: parseInt($("#setRetentionYears").val(), 10) }),
      MET.api.patch("/admin/settings/security.session_timeout_minutes", { value: parseInt($("#setSessionTimeout").val(), 10) }),
      MET.api.patch("/admin/settings/security.min_password_length", { value: parseInt($("#setMinPasswordLength").val(), 10) }),
      MET.api.patch("/admin/settings/notifications.system_wide_announcements", { value: $("#setAnnouncements").is(":checked") }),
      MET.api.patch("/admin/settings/notifications.email_digest_to_admins", { value: $("#setEmailDigest").is(":checked") })
    ).then(function(){
      MET.hideButtonLoading($btn);
      MET.toastSuccess("System configuration saved.");
    }, function(err){
      MET.hideButtonLoading($btn);
      MET.toastError(err.message || "Some settings failed to save.");
    });
  });

  $(document).ready(function(){
    loadCategories();
    loadSettings();
  });
})();
