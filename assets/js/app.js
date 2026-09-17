/* =========================================================
   Monthly Expense Tracker — Shared App Behaviour
   Theme, navigation state, micro-interactions, formatters.
   ========================================================= */
(function(){
  "use strict";

  /* ---------- HTML escaping ----------
     Every page in this app builds markup via string concatenation
     (innerHTML), and a lot of what gets interpolated into it — category
     names, transaction descriptions, user names, notification text — is
     user-controlled. Without escaping, a category named
     `<img src=x onerror=alert(1)>` (created directly via the API, not
     necessarily through the UI's picker) would execute as live script
     everywhere that name is displayed, including in the admin console.
     MET.esc() is the one place that risk gets closed off — wrap any
     interpolated value that ultimately came from user input, on every
     page, admin included. */
  window.MET = window.MET || {};
  window.MET.esc = function(value){
    if(value === null || value === undefined) return "";
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  };

  /* ---------- Theme (light/dark) ---------- */
  const THEME_KEY = "met_theme";
  function applyTheme(mode){
    if(mode === "light" || mode === "dark"){
      document.documentElement.setAttribute("data-theme", mode);
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
    document.querySelectorAll("[data-theme-icon]").forEach(function(el){
      const current = document.documentElement.getAttribute("data-theme") ||
        (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
      el.className = current === "dark" ? "bi bi-sun" : "bi bi-moon-stars";
    });
  }
  function initTheme(){
    const saved = localStorage.getItem(THEME_KEY);
    applyTheme(saved || "auto");
  }
  function toggleTheme(){
    const current = document.documentElement.getAttribute("data-theme") ||
      (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const next = current === "dark" ? "light" : "dark";
    localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
  }
  document.addEventListener("click", function(e){
    const btn = e.target.closest("[data-theme-toggle]");
    if(btn) toggleTheme();
  });
  initTheme();

  /* ---------- Sidebar collapse (desktop) ---------- */
  const SIDEBAR_KEY = "met_sidebar_collapsed";
  function initSidebar(){
    if(localStorage.getItem(SIDEBAR_KEY) === "1"){
      document.body.classList.add("sidebar-collapsed");
    }
  }
  document.addEventListener("click", function(e){
    const btn = e.target.closest("[data-sidebar-toggle]");
    if(btn){
      document.body.classList.toggle("sidebar-collapsed");
      localStorage.setItem(SIDEBAR_KEY, document.body.classList.contains("sidebar-collapsed") ? "1" : "0");
    }
  });
  initSidebar();

  /* ---------- Active nav highlighting ---------- */
  function currentPage(){
    const path = window.location.pathname.split("/").pop() || "dashboard.html";
    return path;
  }
  function initActiveNav(){
    const page = currentPage();
    document.querySelectorAll("[data-nav-page]").forEach(function(el){
      if(el.getAttribute("data-nav-page") === page){
        el.classList.add("active");
      } else {
        el.classList.remove("active");
      }
    });
  }
  initActiveNav();

  /* ---------- Ripple effect ---------- */
  document.addEventListener("pointerdown", function(e){
    const el = e.target.closest(".ripple-surface");
    if(!el) return;
    const rect = el.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 1.4;
    const span = document.createElement("span");
    span.className = "ripple";
    span.style.width = span.style.height = size + "px";
    span.style.left = (e.clientX - rect.left - size/2) + "px";
    span.style.top = (e.clientY - rect.top - size/2) + "px";
    el.appendChild(span);
    setTimeout(function(){ span.remove(); }, 560);
  });

  /* ---------- Toast / snackbar ---------- */
  function ensureToastStack(){
    let stack = document.querySelector(".toast-stack");
    if(!stack){
      stack = document.createElement("div");
      stack.className = "toast-stack";
      document.body.appendChild(stack);
    }
    return stack;
  }
  function showToast(message, opts){
    opts = opts || {};
    const stack = ensureToastStack();
    const pill = document.createElement("div");
    pill.className = "toast-pill";
    const icon = opts.icon || "bi-check-circle-fill";
    const color = opts.type === "error" ? "var(--accent-coral)" : (opts.type === "warn" ? "var(--accent-amber)" : "var(--accent-teal-dark)");
    pill.innerHTML = '<i class="bi ' + icon + '" style="color:' + color + '"></i><span>' + window.MET.esc(message) + "</span>";
    stack.appendChild(pill);
    setTimeout(function(){
      pill.style.transition = "opacity .3s, transform .3s";
      pill.style.opacity = "0";
      pill.style.transform = "translateY(-10px)";
      setTimeout(function(){ pill.remove(); }, 300);
    }, opts.duration || 2600);
  }
  window.MET = window.MET || {};
  window.MET.toast = showToast;

  /* ---------- Currency formatter ---------- */
  window.MET.formatCurrency = function(amount, currency){
    currency = currency || "INR";
    try{
      return new Intl.NumberFormat("en-IN", { style: "currency", currency: currency, maximumFractionDigits: 0 }).format(amount);
    }catch(e){
      return (currency === "INR" ? "₹" : "$") + Math.round(amount).toLocaleString();
    }
  };

  /* ---------- "vs last month" comparison badges ----------
     invert=true for expense-like metrics where a DECREASE is the good
     direction (so the up-arrow renders red, not green). */
  window.MET.deltaBadge = function(current, previous, invert, onDark){
    const fmt = function(n){ return window.MET.formatCurrency(n).replace(/\.00$/, ""); };
    const mutedStyle = onDark ? "color:rgba(255,255,255,.75);" : "color:var(--text-muted);";
    if(!previous){
      return '<span style="' + mutedStyle + '"><i class="bi bi-dash"></i> no data last month</span>';
    }
    const diff = current - previous;
    const pct = previous !== 0 ? Math.round(Math.abs(diff) / Math.abs(previous) * 100) : (diff === 0 ? 0 : 100);
    if(diff === 0){
      return '<span style="' + mutedStyle + '"><i class="bi bi-dash"></i> same as ' + fmt(previous) + ' last month</span>';
    }
    const isUp = diff > 0;
    const good = invert ? !isUp : isUp;
    const color = good ? "var(--income-color)" : "var(--accent-coral)";
    const icon = isUp ? "bi-arrow-up-short" : "bi-arrow-down-short";
    return '<span style="color:' + color + ';font-weight:700;"><i class="bi ' + icon + '"></i> ' + pct + '%</span><span style="' + mutedStyle + '"> vs ' + fmt(previous) + ' last month</span>';
  };

  /* ---------- Animated counters for stat numbers ---------- */
  function animateCounters(root){
    (root || document).querySelectorAll("[data-counter]").forEach(function(el){
      const target = parseFloat(el.getAttribute("data-counter"));
      const prefix = el.getAttribute("data-prefix") || "";
      const isCurrency = el.hasAttribute("data-currency");
      let start = null;
      const duration = 900;
      function step(ts){
        if(!start) start = ts;
        const progress = Math.min((ts - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const val = target * eased;
        el.textContent = prefix + (isCurrency ? window.MET.formatCurrency(val).replace(/\.00$/, "") : Math.round(val).toLocaleString());
        if(progress < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    });
  }
  window.MET.animateCounters = animateCounters;
  document.addEventListener("DOMContentLoaded", function(){ animateCounters(document); });

  /* ---------- Swipe to reveal actions (mobile transaction list) ---------- */
  function initSwipeItems(){
    document.querySelectorAll(".swipe-item").forEach(function(item){
      const content = item.querySelector(".swipe-content");
      const actions = item.querySelector(".swipe-actions");
      if(!content || !actions) return;
      const actionsWidth = actions.offsetWidth || 128;
      let startX = 0, currentX = 0, dragging = false;
      content.addEventListener("touchstart", function(e){
        startX = e.touches[0].clientX; dragging = true;
      }, {passive:true});
      content.addEventListener("touchmove", function(e){
        if(!dragging) return;
        currentX = e.touches[0].clientX - startX;
        if(currentX < 0 && currentX > -actionsWidth){
          content.style.transform = "translateX(" + currentX + "px)";
        }
      }, {passive:true});
      content.addEventListener("touchend", function(){
        dragging = false;
        if(currentX < -actionsWidth/2){
          content.style.transform = "translateX(-" + actionsWidth + "px)";
        } else {
          content.style.transform = "translateX(0)";
        }
        currentX = 0;
      });
    });
  }
  document.addEventListener("DOMContentLoaded", initSwipeItems);
  window.MET.initSwipeItems = initSwipeItems;

  /* ---------- Filter chip toggle ---------- */
  document.addEventListener("click", function(e){
    const chip = e.target.closest("[data-chip-group] .filter-chip");
    if(!chip) return;
    const group = chip.closest("[data-chip-group]");
    if(group.getAttribute("data-chip-multi") !== "true"){
      group.querySelectorAll(".filter-chip").forEach(function(c){ c.classList.remove("active"); });
    }
    chip.classList.toggle("active");
  });

  /* ---------- Segmented control ---------- */
  document.addEventListener("click", function(e){
    const seg = e.target.closest(".segmented button");
    if(!seg) return;
    seg.parentElement.querySelectorAll("button").forEach(function(b){ b.classList.remove("active"); });
    seg.classList.add("active");
  });

  /* ---------- Password visibility toggle ---------- */
  document.addEventListener("click", function(e){
    const btn = e.target.closest("[data-toggle-password]");
    if(!btn) return;
    const input = document.getElementById(btn.getAttribute("data-toggle-password"));
    if(!input) return;
    const showing = input.type === "text";
    input.type = showing ? "password" : "text";
    btn.querySelector("i").className = "bi " + (showing ? "bi-eye" : "bi-eye-slash");
  });

  /* ---------- OTP auto-advance ---------- */
  document.addEventListener("input", function(e){
    if(!e.target.classList.contains("otp-input")) return;
    const val = e.target.value.replace(/\D/g, "").slice(0,1);
    e.target.value = val;
    if(val){
      const next = e.target.nextElementSibling;
      if(next && next.classList.contains("otp-input")) next.focus();
    }
  });
  document.addEventListener("keydown", function(e){
    if(!e.target.classList.contains("otp-input")) return;
    if(e.key === "Backspace" && !e.target.value){
      const prev = e.target.previousElementSibling;
      if(prev && prev.classList.contains("otp-input")) prev.focus();
    }
  });

  /* ---------- Chart color palette (validated categorical set) ---------- */
  window.MET.chartPalette = function(){
    const cs = getComputedStyle(document.documentElement);
    const g = function(name){ return cs.getPropertyValue(name).trim(); };
    return [
      g("--chart-1-blue"), g("--chart-2-orange"), g("--chart-3-aqua"), g("--chart-4-yellow"),
      g("--chart-5-magenta"), g("--chart-6-green"), g("--chart-7-violet"), g("--chart-8-red")
    ];
  };
  window.MET.chartGrid = function(){
    return getComputedStyle(document.documentElement).getPropertyValue("--chart-grid").trim();
  };
  window.MET.chartAxisColor = function(){
    return getComputedStyle(document.documentElement).getPropertyValue("--chart-axis").trim();
  };

  /* ---------- Canonical category -> color mapping (fixed, never reassigned) ----------
     Expense and Income each get their own category set, but both draw from the
     same validated 8-hue categorical palette (+ "other") — they're never shown
     in the same chart together, so reusing the palette is safe and keeps every
     category chip/legend/donut in the app visually consistent. */
  window.MET.CATEGORY_MAP = {
    "Food":         { var:"--chart-1-blue",    icon:"bi-cup-hot-fill" },
    "Transport":    { var:"--chart-2-orange",  icon:"bi-car-front-fill" },
    "Shopping":     { var:"--chart-3-aqua",    icon:"bi-bag-fill" },
    "Bills":        { var:"--chart-4-yellow",  icon:"bi-lightning-charge-fill" },
    "Healthcare":   { var:"--chart-5-magenta", icon:"bi-heart-pulse-fill" },
    "Education":    { var:"--chart-6-green",   icon:"bi-mortarboard-fill" },
    "Entertainment":{ var:"--chart-7-violet",  icon:"bi-film" },
    "Rent":         { var:"--chart-8-red",     icon:"bi-house-door-fill" },
    "Other":        { var:"--chart-other",     icon:"bi-three-dots" }
  };
  window.MET.INCOME_CATEGORY_MAP = {
    "Salary":       { var:"--chart-1-blue",    icon:"bi-briefcase-fill" },
    "Business":     { var:"--chart-2-orange",  icon:"bi-graph-up-arrow" },
    "Freelance":    { var:"--chart-3-aqua",    icon:"bi-laptop-fill" },
    "Investments":  { var:"--chart-4-yellow",  icon:"bi-piggy-bank-fill" },
    "Rental Income":{ var:"--chart-5-magenta", icon:"bi-building" },
    "Gifts":        { var:"--chart-6-green",   icon:"bi-gift-fill" },
    "Refunds":      { var:"--chart-7-violet",  icon:"bi-arrow-counterclockwise" },
    "Other Income": { var:"--chart-other",     icon:"bi-three-dots" }
  };
  window.MET.categoryColor = function(name, type){
    const map = type === "income" ? window.MET.INCOME_CATEGORY_MAP : window.MET.CATEGORY_MAP;
    const fallback = map["Other"] || map["Other Income"];
    const entry = map[name] || fallback;
    return getComputedStyle(document.documentElement).getPropertyValue(entry.var).trim();
  };
  window.MET.categoryIcon = function(name, type){
    const map = type === "income" ? window.MET.INCOME_CATEGORY_MAP : window.MET.CATEGORY_MAP;
    const fallback = map["Other"] || map["Other Income"];
    const entry = map[name] || fallback;
    return entry.icon;
  };

  /* ---------- Back navigation helper ---------- */
  window.MET.goBack = function(fallback){
    if(document.referrer && document.referrer.indexOf(window.location.host) !== -1){
      history.back();
    } else {
      window.location.href = fallback || "dashboard.html";
    }
  };

})();
