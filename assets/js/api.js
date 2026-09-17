/* =========================================================
   Monthly Expense Tracker — API integration layer
   jQuery-based AJAX wrapper: base URL, session cookie handling,
   loaders, toasts, and the auth guard every app page runs on load.
   ========================================================= */
(function($){
  "use strict";
  window.MET = window.MET || {};

  /* ---------- Base URL ----------
     The API's CORS_ORIGIN is locked to http://localhost:8080 (see
     api/.env), so during local dev the UI must be served from that exact
     origin (e.g. `python -m http.server 8080`), not opened as a file://.
     Once wrapped in the WebView APK / deployed behind the same host as
     the API, this resolves to a same-origin "/api" instead. */
  window.MET.API_BASE = (function(){
    if(window.location.protocol === "http:" || window.location.protocol === "https:"){
      if(window.location.port && window.location.port !== "4100"){
        return "http://" + window.location.hostname + ":4100/api";
      }
    }
    return "/api";
  })();

  /* ---------- Core request wrapper ---------- */
  function normalizeError(jqXHR){
    const body = jqXHR.responseJSON;
    if(body && body.error){
      const fieldErrors = (body.error.details && body.error.details.fieldErrors) || null;
      return { status: jqXHR.status, code: body.error.code, message: body.error.message, fieldErrors: fieldErrors };
    }
    if(jqXHR.status === 0){
      return { status: 0, code: "NETWORK_ERROR", message: "Can't reach the server — check your connection and try again.", fieldErrors: null };
    }
    return { status: jqXHR.status, code: "UNKNOWN", message: "Something went wrong. Please try again.", fieldErrors: null };
  }

  /* ---------- Silent refresh ----------
     The API pairs a short-lived (15 min), stateless access-token cookie
     with a long-lived (30 day), rotating refresh-token cookie — neither
     ever touched by this JS, both httpOnly. A 401 here just means the
     access token expired; it does NOT mean the user is actually logged
     out. So instead of surfacing that 401, transparently ask the server
     for a fresh access token (the browser sends the refresh cookie on
     its own) and retry the original call once. Only a 401 from the
     refresh call itself (refresh token expired/revoked/never existed)
     is a real "you're logged out." Concurrent 401s share one in-flight
     refresh instead of each firing their own. */
  let refreshInFlight = null;

  function callRefresh(){
    if(!refreshInFlight){
      refreshInFlight = $.ajax({
        url: window.MET.API_BASE + "/auth/refresh",
        method: "POST",
        dataType: "json",
        xhrFields: { withCredentials: true }
      }).always(function(){ refreshInFlight = null; });
    }
    return refreshInFlight;
  }

  function request(method, path, data){
    const opts = {
      url: window.MET.API_BASE + path,
      method: method,
      dataType: "json",
      xhrFields: { withCredentials: true }
    };
    if(data !== undefined){
      opts.contentType = "application/json";
      opts.data = JSON.stringify(data);
    }
    const isRefreshCall = path === "/auth/refresh";

    return $.ajax(opts).then(
      function(resp){ return resp; },
      function(jqXHR){
        if(!isRefreshCall && jqXHR.status === 401){
          return callRefresh().then(
            function(){ return $.ajax(opts); },
            function(refreshFailXHR){ return $.Deferred().reject(normalizeError(refreshFailXHR)).promise(); }
          ).then(
            function(resp){ return resp; },
            function(err){ return $.Deferred().reject(err.code ? err : normalizeError(err)).promise(); }
          );
        }
        return $.Deferred().reject(normalizeError(jqXHR)).promise();
      }
    );
  }

  window.MET.api = {
    get:   function(path){ return request("GET", path); },
    post:  function(path, data){ return request("POST", path, data); },
    patch: function(path, data){ return request("PATCH", path, data); },
    del:   function(path){ return request("DELETE", path); }
  };

  /* ---------- Shared query helpers ---------- */
  // First-of-month date string (YYYY-MM-01) — every month-scoped endpoint
  // (transactions/summary, budgets, reports/*) takes this exact shape.
  window.MET.currentMonth = function(){
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-01";
  };
  window.MET.qs = function(params){
    const parts = [];
    Object.keys(params).forEach(function(k){
      const v = params[k];
      if(v === undefined || v === null || v === "") return;
      parts.push(encodeURIComponent(k) + "=" + encodeURIComponent(v));
    });
    return parts.length ? "?" + parts.join("&") : "";
  };
  // "Sep 2026" style label for a YYYY-MM-01 month string.
  window.MET.monthLabel = function(monthStr){
    const d = new Date(monthStr + "T00:00:00");
    return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  };
  // Shifts a YYYY-MM-01 month string by `delta` whole months (negative goes
  // back) — used for "vs last month" comparisons on the dashboard + reports.
  window.MET.shiftMonth = function(monthStr, delta){
    const d = new Date(monthStr + "T00:00:00");
    d.setMonth(d.getMonth() + delta);
    return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-01";
  };
  // "Today, 1:20 PM" / "Yesterday" / "Sep 9" — matches the app's existing
  // transaction-list date style, now driven by real timestamps.
  window.MET.formatTxnDate = function(iso){
    const d = new Date(iso);
    const now = new Date();
    const isSameDay = d.toDateString() === now.toDateString();
    const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
    const isYesterday = d.toDateString() === yesterday.toDateString();
    const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    if(isSameDay) return "Today, " + time;
    if(isYesterday) return "Yesterday, " + time;
    if(d.getFullYear() === now.getFullYear()) return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };
  window.MET.paymentMethodLabel = function(pm){
    const map = { UPI: "UPI", CARD: "Card", CASH: "Cash", NETBANKING: "Netbanking", WALLET: "Wallet", OTHER: "Other" };
    return map[pm] || pm;
  };

  /* ---------- Button loading state ---------- */
  window.MET.showButtonLoading = function($btn, label){
    if($btn.data("met-loading")) return;
    $btn.data("met-loading", true);
    $btn.data("met-original-html", $btn.html());
    $btn.prop("disabled", true).addClass("is-loading");
    $btn.html('<span class="btn-spinner"></span><span>' + (label || "Please wait…") + "</span>");
  };
  window.MET.hideButtonLoading = function($btn){
    if(!$btn.data("met-loading")) return;
    $btn.prop("disabled", false).removeClass("is-loading");
    $btn.html($btn.data("met-original-html"));
    $btn.removeData("met-loading");
    $btn.removeData("met-original-html");
  };

  /* ---------- Full-page loader (first data fetch on a page) ---------- */
  window.MET.showPageLoader = function(){
    let $el = $("#metPageLoader");
    if(!$el.length){
      $el = $('<div id="metPageLoader" class="page-loader"><div class="page-loader-spinner"></div></div>').appendTo("body");
    }
    $el.addClass("show");
  };
  window.MET.hidePageLoader = function(){
    $("#metPageLoader").removeClass("show");
  };

  /* ---------- Form-level error banner (e.g. "incorrect password") ---------- */
  window.MET.showFormError = function($form, message){
    $form.find(".form-error-banner").remove();
    if(!message) return;
    $('<div class="form-error-banner"><i class="bi bi-exclamation-circle-fill"></i><span>' + window.MET.esc(message) + "</span></div>").prependTo($form);
  };

  /* ---------- Toast helpers around the existing MET.toast pill ---------- */
  window.MET.toastSuccess = function(message){ window.MET.toast(message, { type: "success", icon: "bi-check-circle-fill" }); };
  window.MET.toastError = function(message){ window.MET.toast(message, { type: "error", icon: "bi-x-circle-fill", duration: 3400 }); };

  /* ---------- Auth guard + session-aware shell ----------
     Every page calls MET.guardAuth(mode) on load:
       "public"    — auth pages (login/register/...): bounce to the
                     dashboard if a session already exists.
       "protected" — everything behind login: bounce to login.html if not.
       "admin"     — admin console pages: bounce non-admins to dashboard.
     GET /auth/me never itself rejects (attachUser never throws), so the
     only failure path here is a genuine network/server error. */
  window.MET.currentUser = null;

  /** Where a signed-in user lands — admins go to the admin console,
   * everyone else to the regular dashboard. Used both by guardAuth's
   * "public" mode (bouncing an already-logged-in visitor away from
   * login/register/etc.) and directly by login.html after a fresh login. */
  window.MET.homePageFor = function(user){
    return user && user.role === "ADMIN" ? "admin-dashboard.html" : "dashboard.html";
  };

  function initials(name){
    if(!name) return "?";
    const parts = name.trim().split(/\s+/);
    return ((parts[0][0] || "") + (parts.length > 1 ? parts[parts.length-1][0] : "")).toUpperCase();
  }
  window.MET.initials = initials;

  window.MET.applySessionToShell = function(user){
    if(!user) return;
    window.MET.currentUser = user;
    const $userBlock = $(".sidebar-user");
    $userBlock.find(".avatar").text(initials(user.name));
    $userBlock.find(".u-info .fw-700").text(user.name);
    $userBlock.find(".u-info .text-secondary").text(user.email);
    $(document).trigger("met:user-ready", [user]);
    window.MET.refreshNotificationBadge();
  };

  /* ---------- Sitewide unread-notification badge (sidebar nav + bell dot) ---------- */
  window.MET.refreshNotificationBadge = function(){
    window.MET.api.get("/notifications" + window.MET.qs({ status: "unread", pageSize: 1 })).then(function(resp){
      const count = resp.unreadCount || 0;
      $(".side-link[data-nav-page='notifications.html'] .badge-count").text(count).toggleClass("d-none", count === 0);
      $("a[href='notifications.html'] .dot-indicator, .mobile-topbar .dot-indicator, .desktop-topbar .dot-indicator").toggleClass("d-none", count === 0);
    }, function(){ /* not fatal — badge just stays at whatever the static markup showed */ });
  };

  window.MET.guardAuth = function(mode){
    const dfd = $.Deferred();
    window.MET.api.get("/auth/me").then(
      function(resp){
        const user = resp.user;
        if(mode === "public"){
          if(user){ window.location.replace(window.MET.homePageFor(user)); return; }
        } else if(mode === "admin"){
          if(!user){ window.location.replace("login.html"); return; }
          if(user.role !== "ADMIN"){ window.location.replace("dashboard.html"); return; }
          window.MET.applySessionToShell(user);
        } else {
          if(!user){ window.location.replace("login.html"); return; }
          window.MET.applySessionToShell(user);
        }
        dfd.resolve(user);
      },
      function(){
        if(mode !== "public"){ window.location.replace("login.html"); return; }
        dfd.resolve(null);
      }
    );
    return dfd.promise();
  };

  /* ---------- Logout (wired from the shared logout modal on every protected page) ---------- */
  window.MET.performLogout = function($btn){
    if($btn) window.MET.showButtonLoading($btn, "Logging out…");
    window.MET.api.post("/auth/logout").always(function(){
      window.location.href = "login.html";
    });
  };
  $(document).on("click", "[data-action='logout']", function(){
    window.MET.performLogout($(this));
  });

})(jQuery);
