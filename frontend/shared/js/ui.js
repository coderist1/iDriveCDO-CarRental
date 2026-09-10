(function (global) {
  "use strict";

  var NS = (global.iDrive = global.iDrive || {});

  function peso(n) {
    return "₱" + Number(n || 0).toLocaleString("en-PH");
  }

  function fmtDate(iso) {
    if (!iso) return "—";
    var d = new Date(iso.length === 10 ? iso + "T00:00:00" : iso);
    return d.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
  }

  function qs(name) {
    var params = new URLSearchParams(location.search);
    return params.get(name);
  }

  function toast(message, type) {
    var host = document.getElementById("toast-host");
    if (!host) return;
    var el = document.createElement("div");
    el.className = "toast-card toast-" + (type || "info");
    el.textContent = message;
    host.appendChild(el);
    setTimeout(function () {
      el.classList.add("out");
      setTimeout(function () {
        if (el.parentNode) el.parentNode.removeChild(el);
      }, 280);
    }, 3200);
  }

  function logoSvg() {
    return (
      '<svg class="brand-mark" viewBox="0 0 40 40" aria-hidden="true">' +
      '<rect width="40" height="40" rx="10" fill="#7842F5"/>' +
      '<text x="20" y="26" text-anchor="middle" fill="#fff" font-size="18" font-family="Plus Jakarta Sans, Segoe UI, sans-serif" font-weight="800">i</text>' +
      "</svg>"
    );
  }

  function navLink(href, label, page) {
    var current = document.body.getAttribute("data-page");
    var cls = current === page ? " active" : "";
    return '<a class="nav-link' + cls + '" href="' + href + '">' + label + "</a>";
  }

  function mountChrome() {
    var me = NS.auth.current();
    var nav = document.getElementById("app-nav");
    if (nav) {
      var account = me
        ? '<div class="nav-user">' +
          '<a class="nav-account" href="' +
          NS.routes.href("account") +
          '">' +
          avatarHtml(me, "sm") +
          "<span>" +
          NS.security.escapeHtml(me.firstName) +
          "</span></a>" +
          (NS.auth.hasRole("staff")
            ? '<a class="btn btn-dark" href="' + NS.routes.href("adminHome") + '">Desk</a>'
            : "") +
          '<button class="btn btn-gold" id="logout-btn" type="button">Sign out</button>' +
          "</div>"
        : '<div class="nav-user">' +
          '<a class="btn btn-ghost" href="' +
          NS.routes.href("login") +
          '">Login</a>' +
          '<a class="btn btn-gold" href="' +
          NS.routes.href("register") +
          '">Register</a>' +
          "</div>";

      nav.innerHTML =
        '<header class="site-header">' +
        '<a class="brand" href="' +
        NS.routes.href("home") +
        '">' +
        logoSvg() +
        "<span><strong>iDrive</strong> CDO<span class=\"brand-sub\">Car Rental</span></span></a>" +
        '<button class="nav-toggle" id="nav-toggle" type="button" aria-label="Menu">Menu</button>' +
        '<nav class="site-nav" id="site-nav">' +
        navLink(NS.routes.href("home"), "Home", "home") +
        navLink(NS.routes.href("fleet"), "Select Vehicle", "fleet") +
        navLink(NS.routes.href("book"), "Make Booking", "book") +
        navLink(NS.routes.href("myBookings"), "View Booking Status", "bookings") +
        account +
        "</nav></header>";

      var toggle = document.getElementById("nav-toggle");
      var siteNav = document.getElementById("site-nav");
      if (toggle && siteNav) {
        toggle.addEventListener("click", function () {
          siteNav.classList.toggle("open");
        });
      }
      var logoutBtn = document.getElementById("logout-btn");
      if (logoutBtn) {
        logoutBtn.addEventListener("click", function () {
          NS.auth.logout();
          location.href = NS.routes.href("home");
        });
      }
    }

    var footer = document.getElementById("app-footer");
    if (footer) {
      footer.innerHTML =
        '<footer class="site-footer">' +
        '<div class="footer-grid">' +
        '<div><div class="brand">' +
        logoSvg() +
        "<span><strong>iDrive</strong> CDO</span></div>" +
        "<p>Self-drive and chauffeur car hire in Cagayan de Oro. Airport, downtown, and city-wide delivery.</p></div>" +
        "<div><h4>Visit</h4><p>2F Limketkai Drive<br>Cagayan de Oro City 9000<br>Misamis Oriental</p></div>" +
        "<div><h4>Hours</h4><p>Desk: 7:00 AM – 9:00 PM daily<br>Airport night desk on request</p></div>" +
        "<div><h4>Contact</h4><p>088 856 2100<br>hello@idrivecdo.ph</p></div>" +
        "</div>" +
        '<p class="fineprint">Frontend-only demo. Payments are simulated and never sent to a server. Card numbers stay in this browser session.</p>' +
        "</footer>";
    }
  }

  function statusBadge(status) {
    return '<span class="badge badge-' + NS.security.escapeHtml(status) + '">' + NS.security.escapeHtml(status) + "</span>";
  }

  function vehicleCard(v) {
    var link = NS.routes.href("car", "?id=" + encodeURIComponent(v.id));
    return (
      '<article class="vehicle-card">' +
      '<a class="vehicle-photo" href="' +
      link +
      '">' +
      '<img src="' +
      NS.security.escapeHtml(v.image) +
      '" alt="' +
      NS.security.escapeHtml(v.name) +
      '">' +
      "</a>" +
      '<div class="vehicle-body">' +
      '<p class="eyebrow">' +
      NS.security.escapeHtml(v.type) +
      " · " +
      NS.security.escapeHtml(v.transmission) +
      "</p>" +
      "<h3>" +
      NS.security.escapeHtml(v.name) +
      "</h3>" +
      '<ul class="mini-specs"><li>' +
      v.seats +
      " seats</li><li>" +
      v.luggage +
      " bags</li><li>" +
      NS.security.escapeHtml(v.fuel) +
      "</li></ul>" +
      '<div class="vehicle-cta"><strong>' +
      peso(v.dailyRate) +
      "<span>/day</span></strong>" +
      '<a class="btn btn-gold" href="' +
      link +
      '">View</a></div></div></article>'
    );
  }

  function bindCsrf(form) {
    var input = form.querySelector('input[name="csrf"]');
    if (!input) {
      input = document.createElement("input");
      input.type = "hidden";
      input.name = "csrf";
      form.appendChild(input);
    }
    input.value = NS.security.getCsrf();
  }

  function fieldError(input, message) {
    var wrap = input.closest(".field") || input.parentNode;
    var err = wrap.querySelector(".field-error");
    if (!err) {
      err = document.createElement("p");
      err.className = "field-error";
      wrap.appendChild(err);
    }
    err.textContent = message || "";
    input.classList.toggle("is-invalid", !!message);
  }

  function clearErrors(form) {
    var errs = form.querySelectorAll(".field-error");
    for (var i = 0; i < errs.length; i++) errs[i].textContent = "";
    var bad = form.querySelectorAll(".is-invalid");
    for (var j = 0; j < bad.length; j++) bad[j].classList.remove("is-invalid");
  }

  function avatarInitials(user) {
    var a = ((user && user.firstName) || "").charAt(0);
    var b = ((user && user.lastName) || "").charAt(0);
    return (a + b).toUpperCase() || "?";
  }

  function avatarSrc(user) {
    var src = user && user.avatar ? String(user.avatar) : "";
    if (/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(src)) return src;
    if (/^https:\/\//i.test(src)) return src;
    return "";
  }

  function avatarHtml(user, size) {
    var cls = "avatar" + (size ? " avatar-" + size : "");
    var src = avatarSrc(user);
    if (src) {
      var safeSrc = String(src)
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;");
      return '<span class="' + cls + '"><img src="' + safeSrc + '" alt=""></span>';
    }
    return '<span class="' + cls + ' avatar-fallback">' + NS.security.escapeHtml(avatarInitials(user)) + "</span>";
  }

  function readImageAsAvatar(file, done) {
    if (!file) {
      done(new Error("Choose a photo first."), null);
      return;
    }
    if (!/^image\/(jpeg|jpg|png|webp)$/i.test(file.type)) {
      done(new Error("Use a JPG, PNG, or WebP photo."), null);
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      done(new Error("Photo must be under 5 MB."), null);
      return;
    }
    var reader = new FileReader();
    reader.onerror = function () {
      done(new Error("Could not read that photo."), null);
    };
    reader.onload = function () {
      var img = new Image();
      img.onerror = function () {
        done(new Error("That file is not a usable image."), null);
      };
      img.onload = function () {
        var max = 320;
        var scale = Math.min(1, max / Math.max(img.width, img.height));
        var w = Math.max(1, Math.round(img.width * scale));
        var h = Math.max(1, Math.round(img.height * scale));
        var canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        var ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        var dataUrl = canvas.toDataURL("image/jpeg", 0.82);
        if (dataUrl.length > 320000) {
          dataUrl = canvas.toDataURL("image/jpeg", 0.65);
        }
        if (dataUrl.length > 320000) {
          done(new Error("Profile image is still too large after compression."), null);
          return;
        }
        done(null, dataUrl);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  NS.ui = {
    peso: peso,
    fmtDate: fmtDate,
    qs: qs,
    toast: toast,
    mountChrome: mountChrome,
    statusBadge: statusBadge,
    vehicleCard: vehicleCard,
    bindCsrf: bindCsrf,
    fieldError: fieldError,
    clearErrors: clearErrors,
    avatarHtml: avatarHtml,
    readImageAsAvatar: readImageAsAvatar
  };
})(window);
