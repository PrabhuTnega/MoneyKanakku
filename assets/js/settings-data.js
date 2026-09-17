/* Live data for settings.html — Personal Information + Currency preference. */
(function(){
  "use strict";

  window.MET = window.MET || {};

  window.MET.initSettingsForm = function(user){
    $("#nameInput").val(user.name);
    $("#emailInput").val(user.email);
    $("#phoneInput").val(user.phone || "");
    $("#currencySelect").val(user.currency || "INR");

    $("#personalInfoForm").on("submit", function(e){
      e.preventDefault();
      const $form = $(this);
      if(!MET.validateForm($form)) return;
      const $btn = $("#savePersonalBtn");
      MET.showButtonLoading($btn, "Saving…");
      MET.api.patch("/auth/me", {
        name: $("#nameInput").val().trim(),
        phone: $("#phoneInput").val().trim() || null,
      }).then(function(resp){
        MET.hideButtonLoading($btn);
        MET.toastSuccess("Profile updated.");
        MET.applySessionToShell(resp.user);
      }, function(err){
        MET.hideButtonLoading($btn);
        if(err.fieldErrors){ MET.applyServerFieldErrors($form, err.fieldErrors); }
        else { MET.showFormError($form, err.message); }
        if(err.status !== 422) MET.toastError(err.message);
      });
    });

    $("#currencySelect").on("change", function(){
      const currency = $(this).val();
      MET.api.patch("/auth/me", { currency: currency }).then(function(){
        MET.toastSuccess("Currency updated to " + currency + ".");
      }, function(err){ MET.toastError(err.message); });
    });

    $("#clearDataModal").on("hidden.bs.modal", function(){
      $("#clearDataPassword").val("");
      $("#clearDataError").removeClass("d-block").text("");
    });

    $("#confirmClearDataBtn").on("click", function(){
      const $btn = $(this);
      const password = $("#clearDataPassword").val();
      const $err = $("#clearDataError");
      if(!password){
        $err.text("Enter your password to confirm.").addClass("d-block");
        return;
      }
      $err.removeClass("d-block").text("");
      MET.showButtonLoading($btn, "Deleting…");
      MET.api.post("/auth/clear-data", { password: password }).then(function(){
        MET.toastSuccess("All your data has been cleared.");
        setTimeout(function(){ window.location.href = "dashboard.html"; }, 700);
      }, function(err){
        MET.hideButtonLoading($btn);
        $err.text(err.message).addClass("d-block");
      });
    });
  };
})();
