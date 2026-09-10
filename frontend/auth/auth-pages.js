(function (global) {
  "use strict";

  var NS = (global.iDrive = global.iDrive || {});
  NS.pages = NS.pages || {};

  function showAlert(form, message, type) {
    var box = document.getElementById("form-alert");
    if (!box && form) {
      box = document.createElement("div");
      box.id = "form-alert";
      box.className = "notice";
      box.style.marginBottom = "1rem";
      var h1 = form.querySelector("h1");
      form.insertBefore(box, h1 && h1.nextSibling ? h1.nextSibling : form.firstChild);
    }
    if (!box) {
      if (message && NS.ui && NS.ui.toast) NS.ui.toast(message, type === "ok" ? "ok" : "err");
      return;
    }
    if (!message) {
      box.hidden = true;
      box.textContent = "";
      return;
    }
    box.hidden = false;
    box.textContent = message;
    box.style.borderColor = type === "ok" ? "rgba(120,66,245,0.35)" : "rgba(155,28,28,0.45)";
    box.style.color = type === "ok" ? "#6430e0" : "#9b1c1c";
    if (NS.ui && NS.ui.toast) NS.ui.toast(message, type === "ok" ? "ok" : "err");
  }

  function field(form, name) {
    if (!form) return null;
    return form.elements.namedItem(name) || form.querySelector('[name="' + name + '"]');
  }

  function val(form, name) {
    var el = field(form, name);
    return el && el.value != null ? el.value : "";
  }

  NS.pages.login = function login() {
    var form = document.getElementById("login-form");
    if (!form || form.getAttribute("data-bound") === "1") return;
    form.setAttribute("data-bound", "1");

    try {
      if (NS.ui && NS.ui.bindCsrf) NS.ui.bindCsrf(form);
    } catch (e) {
      console.warn("CSRF bind failed", e);
    }

    try {
      if (NS.auth && NS.auth.current && NS.auth.current()) {
        location.replace(NS.routes.href("account"));
        return;
      }
    } catch (e) {
      console.warn("current() check failed", e);
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (NS.ui && NS.ui.clearErrors) NS.ui.clearErrors(form);
      showAlert(form, "", "ok");

      var btn = form.querySelector('button[type="submit"]');
      if (btn) {
        btn.disabled = true;
        btn.textContent = "Signing in…";
      }

      try {
        try {
          if (NS.ui && NS.ui.bindCsrf) NS.ui.bindCsrf(form);
        } catch (ignore) {}
        var csrfEl = field(form, "csrf");
        var user = NS.auth.login(val(form, "email"), val(form, "password"), csrfEl ? csrfEl.value : "");
        showAlert(form, "Welcome back, " + user.firstName + ".", "ok");
        var next = NS.ui.qs("next");
        setTimeout(function () {
          location.href = NS.routes.isSafeNext(next) ? NS.routes.base() + next : NS.routes.href("account");
        }, 150);
      } catch (err) {
        if (btn) {
          btn.disabled = false;
          btn.textContent = "Sign in";
        }
        try {
          if (NS.ui && NS.ui.bindCsrf) NS.ui.bindCsrf(form);
        } catch (ignore) {}
        showAlert(form, err.message || "Sign in failed.", "err");
      }
    });
  };

  NS.pages.register = function register() {
    var form = document.getElementById("register-form");
    if (!form || form.getAttribute("data-bound") === "1") return;
    form.setAttribute("data-bound", "1");

    try {
      if (NS.ui && NS.ui.bindCsrf) NS.ui.bindCsrf(form);
    } catch (e) {
      console.warn("CSRF bind failed", e);
    }

    try {
      if (NS.auth && NS.auth.current && NS.auth.current()) {
        location.replace(NS.routes.href("account"));
        return;
      }
    } catch (e) {
      console.warn("current() check failed", e);
    }

    var busy = false;

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (busy) return;
      busy = true;

      if (NS.ui && NS.ui.clearErrors) NS.ui.clearErrors(form);
      showAlert(form, "", "ok");

      var ageConfirm = field(form, "ageConfirm");
      var terms = field(form, "terms");
      var btn = form.querySelector('button[type="submit"]');
      if (btn) {
        btn.disabled = true;
        btn.textContent = "Creating…";
      }

      try {
        if (!NS.auth || !NS.auth.register) {
          throw new Error("Auth module failed to load. Refresh the page.");
        }
        try {
          if (NS.ui && NS.ui.bindCsrf) NS.ui.bindCsrf(form);
        } catch (ignore) {}
        var csrfInput = field(form, "csrf");

        var user = NS.auth.register(
          {
            firstName: val(form, "firstName"),
            lastName: val(form, "lastName"),
            email: val(form, "email"),
            phone: val(form, "phone"),
            password: val(form, "password"),
            confirmPassword: val(form, "confirmPassword"),
            ageConfirm: !!(ageConfirm && ageConfirm.checked),
            terms: !!(terms && terms.checked)
          },
          csrfInput ? csrfInput.value : ""
        );

        showAlert(form, "Welcome, " + user.firstName + ". Redirecting…", "ok");
        setTimeout(function () {
          location.href = NS.routes.href("account");
        }, 150);
      } catch (err) {
        busy = false;
        if (btn) {
          btn.disabled = false;
          btn.textContent = "Create account";
        }
        try {
          if (NS.ui && NS.ui.bindCsrf) NS.ui.bindCsrf(form);
        } catch (ignore) {}
        var msg = err && err.message ? err.message : "Could not create account.";
        showAlert(form, msg, "err");
        try {
          if (/first name/i.test(msg)) NS.ui.fieldError(field(form, "firstName"), msg);
          else if (/last name/i.test(msg)) NS.ui.fieldError(field(form, "lastName"), msg);
          else if (/email/i.test(msg)) NS.ui.fieldError(field(form, "email"), msg);
          else if (/mobile|phone/i.test(msg)) NS.ui.fieldError(field(form, "phone"), msg);
          else if (/password/i.test(msg) && /match/i.test(msg)) NS.ui.fieldError(field(form, "confirmPassword"), msg);
          else if (/password/i.test(msg)) NS.ui.fieldError(field(form, "password"), msg);
        } catch (ignore) {}
      }
    });
  };
})(window);
