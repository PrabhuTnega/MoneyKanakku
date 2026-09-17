/* =========================================================
   Monthly Expense Tracker — Form validation helper
   Field-level inline errors (native HTML5 constraints + custom rules
   like password-confirm matching) plus a form-level error banner for
   server-side rejections. Visual treatment (compact on mobile, a subtle
   shake + glow on desktop) lives in components.css.
   ========================================================= */
(function($){
  "use strict";
  window.MET = window.MET || {};

  /** Show/clear one field's inline error. Auto-creates the .invalid-feedback
   *  node right after the field's wrapper the first time it's needed. */
  window.MET.fieldError = function($el, message){
    const $wrap = $el.closest(".input-icon-group, .form-check, .field-wrap");
    const $anchor = $wrap.length ? $wrap : $el;
    let $fb = $anchor.nextAll(".invalid-feedback").first();
    if(!$fb.length){
      $fb = $('<div class="invalid-feedback"></div>').insertAfter($anchor);
    }
    if(message){
      $el.addClass("is-invalid");
      $fb.text(message).addClass("d-block");
      $el.addClass("field-shake");
      setTimeout(function(){ $el.removeClass("field-shake"); }, 400);
    } else {
      $el.removeClass("is-invalid");
      $fb.removeClass("d-block").text("");
    }
  };

  window.MET.clearFormErrors = function($form){
    $form.find(".is-invalid").each(function(){ window.MET.fieldError($(this), null); });
    window.MET.showFormError($form, null);
  };

  /** Client-side pass: native HTML5 constraints (required/type/minlength)
   *  plus any [data-match="#selector"] confirm-field rules. Returns true
   *  when the form is valid enough to submit to the API. */
  window.MET.validateForm = function($form){
    let valid = true;
    window.MET.clearFormErrors($form);

    $form.find("input, select, textarea").each(function(){
      const el = this, $el = $(this);
      if($el.is("[data-skip-validate]") || el.disabled) return;
      if(!el.checkValidity()){
        valid = false;
        let msg = $el.data("required-message") || el.validationMessage;
        if(el.validity.valueMissing) msg = $el.data("required-message") || "This field is required.";
        else if(el.validity.typeMismatch && el.type === "email") msg = "Enter a valid email address.";
        else if(el.validity.tooShort) msg = "Must be at least " + el.minLength + " characters.";
        else if(el.validity.patternMismatch) msg = $el.data("pattern-message") || msg;
        window.MET.fieldError($el, msg);
      }
    });

    $form.find("[data-match]").each(function(){
      const $el = $(this);
      const $other = $form.find($el.attr("data-match"));
      if($other.length && $el.val() && $el.val() !== $other.val()){
        valid = false;
        window.MET.fieldError($el, $el.data("match-message") || "Values don't match.");
      }
    });

    return valid;
  };

  /** Map a 422 VALIDATION_ERROR's Zod-flatten() fieldErrors onto matching
   *  [name] inputs in the form (first message per field). */
  window.MET.applyServerFieldErrors = function($form, fieldErrors){
    if(!fieldErrors) return;
    Object.keys(fieldErrors).forEach(function(field){
      const msgs = fieldErrors[field];
      if(!msgs || !msgs.length) return;
      const $el = $form.find('[name="' + field + '"]');
      if($el.length) window.MET.fieldError($el, msgs[0]);
    });
  };

  /** Clear a field's error state as soon as the user starts fixing it. */
  $(document).on("input change", ".form-control, .form-select", function(){
    if($(this).hasClass("is-invalid")) window.MET.fieldError($(this), null);
  });

})(jQuery);
