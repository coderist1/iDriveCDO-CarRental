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
    box.style.borderColor = type === "ok" ? "rgba(196, 80, 75,0.35)" : "rgba(155,28,28,0.45)";
    box.style.color = type === "ok" ? "#a63f3b" : "#9b1c1c";
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

  function setHidden(id, value) {
    var el = document.getElementById(id);
    if (el) el.value = value || "";
  }

  /*
   * Optional ID upload on the register form. Reads the photo with Tesseract OCR,
   * stores the extracted fields in hidden inputs, and pre-fills the name only when
   * those fields are still empty. Everything stays optional and editable.
   */
  function bindIdUpload(form) {
    var pick = document.getElementById("reg-id-pick");
    var input = document.getElementById("reg-id-input");
    var preview = document.getElementById("reg-id-preview");
    var clear = document.getElementById("reg-id-clear");
    var status = document.getElementById("reg-id-status");
    if (!pick || !input) return;

    function setStatus(msg) {
      if (status) status.textContent = msg || "";
    }

    function showPreview(dataUrl) {
      if (!preview) return;
      if (dataUrl) {
        preview.classList.remove("is-empty");
        preview.innerHTML = '<img src="' + dataUrl.replace(/"/g, "") + '" alt="ID preview">';
      } else {
        preview.classList.add("is-empty");
        preview.textContent = "No ID yet";
      }
      if (clear) clear.hidden = !dataUrl;
      if (pick) pick.textContent = dataUrl ? "Replace ID" : "Upload ID";
    }

    pick.addEventListener("click", function () {
      input.click();
    });

    if (clear) {
      clear.addEventListener("click", function () {
        setHidden("reg-id-data", "");
        setHidden("reg-id-number", "");
        setHidden("reg-id-expiry", "");
        setHidden("reg-id-address", "");
        setHidden("reg-id-birthdate", "");
        showPreview("");
        setStatus("");
      });
    }

    input.addEventListener("change", function () {
      var file = input.files && input.files[0];
      input.value = "";
      if (!file) return;
      NS.ui.readLicensePhoto(file, function (err, dataUrl) {
        if (err) {
          setStatus(err.message || "Could not read that image.");
          return;
        }
        setHidden("reg-id-data", dataUrl);
        showPreview(dataUrl);
        if (!NS.ocr || !NS.ocr.scan) {
          setStatus("ID attached. Automatic reading is unavailable; please type your details.");
          return;
        }
        setStatus("Reading your ID… this can take a few seconds.");
        /* Read the original file: the stored copy is shrunk and recompressed, which blurs small digits. */
        NS.ocr
          .scan(file, function (p) {
            setStatus("Reading your ID… " + Math.round(p * 100) + "%");
          })
          .then(function (data) {
            setHidden("reg-id-number", data.idNumber);
            setHidden("reg-id-expiry", data.expiry);
            setHidden("reg-id-address", data.address);
            setHidden("reg-id-birthdate", data.birthdate);
            // Pre-fill name only if the user has not typed it yet.
            if (data.fullName) {
              var first = field(form, "firstName");
              var lastEl = field(form, "lastName");
              var given = data.nameParts ? data.nameParts.given : "";
              var surname = data.nameParts ? data.nameParts.last : "";
              if (!given || !surname) {
                var parts = data.fullName.split(/\s+/);
                given = parts[0] || "";
                surname = parts.length > 1 ? parts.slice(1).join(" ") : "";
              }
              if (first && !first.value) first.value = given;
              if (lastEl && !lastEl.value && surname) lastEl.value = surname;
            }
            var found = [];
            if (data.fullName) found.push("name");
            if (data.idNumber) found.push("ID number");
            if (data.expiry) found.push("expiry");
            if (data.address) found.push("address");
            if (data.birthdate) found.push("birthdate");
            setStatus(
              found.length
                ? "Read " + found.join(", ") + ". Please review and edit anything that looks off."
                : "ID attached, but we couldn't read the details. Please type them in."
            );
          })
          .catch(function (e) {
            setStatus(e.message || "Could not read the ID automatically. Please type your details.");
          });
      });
    });
  }

  var GSI_SRC = "https://accounts.google.com/gsi/client?hl=en";

  function loadGsi() {
    if (global.google && global.google.accounts && global.google.accounts.id) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = GSI_SRC;
      s.async = true;
      s.onload = function () {
        resolve();
      };
      s.onerror = function () {
        reject(new Error("Could not load Google sign-in. Check your connection."));
      };
      document.head.appendChild(s);
    });
  }

  function destinationFor(user) {
    if (user.role === "driver") return NS.routes.href("driverHome");
    if (user.role === "staff" || user.role === "admin") return NS.routes.href("adminHome");
    return NS.routes.href("home");
  }

  /* "Continue with Google": the credential goes to the backend, which verifies it with Google. */
  function mountGoogleButton(form) {
    var host = document.getElementById("google-signin");
    if (!host || !NS.api || !NS.api.googleConfig) return;
    function unavailable(msg) {
      host.innerHTML =
        '<button type="button" class="btn google-fallback" aria-disabled="true" title="' +
        NS.security.escapeHtml(msg) +
        '"><span class="google-g" aria-hidden="true">G</span> Google</button>';
      host.querySelector("button").addEventListener("click", function () {
        showAlert(form, msg, "err");
      });
    }
    NS.api
      .googleConfig()
      .then(function (cfg) {
        if (!cfg || !cfg.client_id) throw new Error("Google sign-in isn't set up yet. Use email and password for now.");
        return loadGsi().then(function () {
          return cfg.client_id;
        });
      })
      .then(function (clientId) {
        global.google.accounts.id.initialize({
          client_id: clientId,
          ux_mode: "popup",
          callback: function (resp) {
            showAlert(form, "Checking your Google account…", "ok");
            NS.api
              .googleSignIn(resp.credential)
              .then(function (data) {
                var user = NS.auth.googleSignIn(data.user);
                showAlert(form, "Welcome, " + user.firstName + ". Redirecting…", "ok");
                location.href = destinationFor(user);
              })
              .catch(function (err) {
                showAlert(form, (err && err.message) || "Google sign-in failed.", "err");
              });
          }
        });
        host.innerHTML = "";
        global.google.accounts.id.renderButton(host, {
          type: "standard",
          theme: "outline",
          size: "large",
          text: host.clientWidth < 260 ? "signin_with" : "continue_with",
          shape: "rectangular",
          logo_alignment: "left",
          locale: "en",
          width: Math.min(400, host.clientWidth || 200)
        });
      })
      .catch(function (err) {
        unavailable(
          err && err.name !== "ApiError" && err.message
            ? err.message
            : "Google sign-in is unavailable right now. Use email and password for now."
        );
      });
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
        var already = NS.auth.current();
        location.replace(
          already.role === "driver"
            ? NS.routes.href("driverHome")
            : already.role === "staff" || already.role === "admin"
            ? NS.routes.href("adminHome")
            : NS.routes.href("home")
        );
        return;
      }
    } catch (e) {
      console.warn("current() check failed", e);
    }

    mountGoogleButton(form);

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
        var dest =
          user.role === "driver"
            ? NS.routes.href("driverHome")
            : NS.routes.isSafeNext(next)
            ? NS.routes.base() + next
            : user.role === "staff" || user.role === "admin"
            ? NS.routes.href("adminHome")
            : NS.routes.href("home");
        setTimeout(function () {
          location.href = dest;
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

    bindIdUpload(form);

    try {
      if (NS.auth && NS.auth.current && NS.auth.current()) {
        var alreadyReg = NS.auth.current();
        location.replace(
          alreadyReg.role === "staff" || alreadyReg.role === "admin"
            ? NS.routes.href("adminHome")
            : NS.routes.href("home")
        );
        return;
      }
    } catch (e) {
      console.warn("current() check failed", e);
    }

    mountGoogleButton(form);

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
            terms: !!(terms && terms.checked),
            idImage: val(form, "idImage"),
            idNumber: val(form, "idNumber"),
            idExpiry: val(form, "idExpiry"),
            idAddress: val(form, "idAddress"),
            idBirthdate: val(form, "idBirthdate")
          },
          csrfInput ? csrfInput.value : ""
        );

        showAlert(form, "Welcome, " + user.firstName + ". Redirecting…", "ok");
        /* Navigating away cancels the request, so wait for it (briefly); the first booking retries if it fails. */
        function delay(ms) {
          return new Promise(function (resolve) {
            setTimeout(resolve, ms);
          });
        }
        var ready = NS.api && NS.domain.ensureCustomerOnApi
          ? Promise.race([
              NS.domain.ensureCustomerOnApi(user.id).catch(function (e) {
                console.warn("iDrive: customer was not saved to the server yet.", e);
              }),
              delay(4000)
            ])
          : delay(150);
        ready.then(function () {
          location.href = NS.routes.href("home");
        });
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
