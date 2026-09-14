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

  function askYesNo(message, options) {
    options = options || {};
    var title = options.title || "Confirm";
    var yesLabel = options.yes || "Yes";
    var noLabel = options.no || "No";

    return new Promise(function (resolve) {
      var existing = document.getElementById("confirm-overlay");
      if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

      var overlay = document.createElement("div");
      overlay.id = "confirm-overlay";
      overlay.className = "confirm-overlay";
      overlay.innerHTML =
        '<div class="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-title">' +
        '<p class="eyebrow" id="confirm-title">' +
        NS.security.escapeHtml(title) +
        "</p>" +
        "<h3>" +
        NS.security.escapeHtml(message) +
        "</h3>" +
        '<div class="confirm-actions">' +
        '<button type="button" class="btn btn-ghost" data-answer="no">' +
        NS.security.escapeHtml(noLabel) +
        "</button>" +
        '<button type="button" class="btn btn-gold" data-answer="yes">' +
        NS.security.escapeHtml(yesLabel) +
        "</button>" +
        "</div></div>";

      function close(answer) {
        document.removeEventListener("keydown", onKey);
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        resolve(!!answer);
      }

      function onKey(e) {
        if (e.key === "Escape") close(false);
        if (e.key === "Enter") close(true);
      }

      overlay.addEventListener("click", function (e) {
        if (e.target === overlay) close(false);
        var answer = e.target.getAttribute("data-answer");
        if (answer === "yes") close(true);
        if (answer === "no") close(false);
      });

      document.addEventListener("keydown", onKey);
      document.body.appendChild(overlay);
      var yesBtn = overlay.querySelector('[data-answer="yes"]');
      if (yesBtn) yesBtn.focus();
    });
  }

  function logoUrl() {
    return NS.routes.base() + "shared/img/logo.jpg";
  }

  function brandLogo(options) {
    options = options || {};
    var cls = "brand-logo" + (options.compact ? " brand-logo-compact" : "");
    return (
      '<img class="' +
      cls +
      '" src="' +
      logoUrl() +
      '" alt="idriveCDO Car Rental Services" width="160" height="72">'
    );
  }

  function logoSvg() {
    return brandLogo();
  }

  function navLink(href, label, page) {
    var current = document.body.getAttribute("data-page");
    var cls = current === page ? " active" : "";
    return '<a class="nav-link' + cls + '" href="' + href + '">' + label + "</a>";
  }

  function bindNavChrome() {
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

  function mountCustomerChrome(me) {
    document.body.classList.remove("desk-mode");
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
        '<a class="brand brand-with-logo" href="' +
        NS.routes.href("home") +
        '" aria-label="idriveCDO home">' +
        brandLogo() +
        "</a>" +
        '<button class="nav-toggle" id="nav-toggle" type="button" aria-label="Menu">Menu</button>' +
        '<nav class="site-nav" id="site-nav">' +
        navLink(NS.routes.href("home"), "Home", "home") +
        navLink(NS.routes.href("fleet"), "Available Cars", "fleet") +
        navLink(NS.routes.href("myBookings"), "View Booking Status", "bookings") +
        account +
        "</nav></header>";
      bindNavChrome();
    }

    var footer = document.getElementById("app-footer");
    if (footer) {
      footer.innerHTML =
        '<footer class="site-footer">' +
        '<div class="footer-grid">' +
        '<div><div class="brand brand-with-logo">' +
        brandLogo() +
        "</div>" +
        "<p>Self-drive and chauffeur car hire in Cagayan de Oro. Airport, downtown, and city-wide delivery.</p></div>" +
        "<div><h4>Visit</h4><p>2F Limketkai Drive<br>Cagayan de Oro City 9000<br>Misamis Oriental</p></div>" +
        "<div><h4>Hours</h4><p>Desk: 7:00 AM – 9:00 PM daily<br>Airport night desk on request</p></div>" +
        "<div><h4>Contact</h4><p>088 856 2100<br>hello@idrivecdo.ph</p></div>" +
        "</div>" +
        '<p class="fineprint">Frontend-only demo. Payments are simulated and never sent to a server.</p>' +
        "</footer>";
    }
  }

  function mountDeskChrome(me) {
    document.body.classList.add("desk-mode");
    var unread = 0;
    try {
      unread = NS.domain.staffUnreadCount ? NS.domain.staffUnreadCount() : 0;
    } catch (e) {
      unread = 0;
    }
    var roleLabel = me.role === "admin" ? "Admin" : "Rental-Incharge";
    var nav = document.getElementById("app-nav");
    if (nav) {
      nav.innerHTML =
        '<header class="desk-header">' +
        '<a class="brand desk-brand brand-with-logo" href="' +
        NS.routes.href("adminHome") +
        '" aria-label="idriveCDO Desk">' +
        brandLogo({ compact: true }) +
        "<span class=\"brand-workspace\">Desk<span class=\"brand-sub\">Workspace</span></span></a>" +
        '<button class="nav-toggle" id="nav-toggle" type="button" aria-label="Menu">Menu</button>' +
        '<nav class="desk-nav" id="site-nav">' +
        navLink(NS.routes.href("adminHome"), "Overview", "adminHome") +
        navLink(NS.routes.href("adminInbox"), unread ? "Inbox · " + unread : "Inbox", "adminInbox") +
        navLink(NS.routes.href("adminBookings"), "Bookings", "adminBookings") +
        '<div class="nav-user">' +
        '<span class="role-pill">' +
        roleLabel +
        "</span>" +
        '<a class="btn btn-ghost" href="' +
        NS.routes.href("home") +
        '">Guest site</a>' +
        '<button class="btn btn-gold" id="logout-btn" type="button">Sign out</button>' +
        "</div></nav></header>";
      bindNavChrome();
    }

    var footer = document.getElementById("app-footer");
    if (footer) {
      footer.innerHTML =
        '<footer class="desk-footer">' +
        "<p><strong>iDrive Desk</strong> · Admin / Rental-Incharge console for bookings, fleet, drivers, and payments.</p>" +
        "<p>Signed in as " +
        NS.security.escapeHtml(me.firstName + " " + me.lastName) +
        " · " +
        NS.security.escapeHtml(me.email) +
        "</p></footer>";
    }
  }

  function mountDriverChrome(me) {
    document.body.classList.add("desk-mode");
    var nav = document.getElementById("app-nav");
    if (nav) {
      nav.innerHTML =
        '<header class="desk-header">' +
        '<a class="brand desk-brand brand-with-logo" href="' +
        NS.routes.href("driverHome") +
        '" aria-label="idriveCDO Driver">' +
        brandLogo({ compact: true }) +
        "<span class=\"brand-workspace\">Driver<span class=\"brand-sub\">Workspace</span></span></a>" +
        '<button class="nav-toggle" id="nav-toggle" type="button" aria-label="Menu">Menu</button>' +
        '<nav class="desk-nav" id="site-nav">' +
        navLink(NS.routes.href("driverHome"), "My trips", "driverHome") +
        '<div class="nav-user">' +
        '<span class="role-pill">' +
        NS.security.escapeHtml(me.firstName || "Driver") +
        "</span>" +
        '<button class="btn btn-gold" id="logout-btn" type="button">Sign out</button>' +
        "</div></nav></header>";
      bindNavChrome();
    }

    var footer = document.getElementById("app-footer");
    if (footer) {
      footer.innerHTML =
        '<footer class="desk-footer">' +
        "<p><strong>iDrive Driver</strong> · Assigned trips, fuel logs, and trip status only.</p>" +
        "<p>Signed in as " +
        NS.security.escapeHtml(me.firstName + " " + me.lastName) +
        " · " +
        NS.security.escapeHtml(me.email) +
        "</p></footer>";
    }
  }

  function mountChrome() {
    var me = NS.auth.current();
    if (me && me.role === "driver") mountDriverChrome(me);
    else if (me && NS.auth.hasRole("staff")) mountDeskChrome(me);
    else mountCustomerChrome(me);
  }

  function statusBadge(status) {
    var labels = {
      return_requested: "return requested",
      on_call: "on call",
      regular: "regular"
    };
    var label = labels[status] || status;
    return (
      '<span class="badge badge-' +
      NS.security.escapeHtml(status) +
      '">' +
      NS.security.escapeHtml(label) +
      "</span>"
    );
  }

  function starsDisplay(average, count, options) {
    options = options || {};
    var avg = Number(average) || 0;
    var n = Number(count) || 0;
    if (!n && !options.force) return '<span class="rating-summary muted">No ratings yet</span>';
    var full = Math.round(avg);
    var glyphs = "";
    for (var i = 1; i <= 5; i++) {
      glyphs += '<span class="star' + (i <= full ? " on" : "") + '" aria-hidden="true">★</span>';
    }
    if (options.compact) {
      return '<span class="rating-summary" title="' + avg.toFixed(1) + ' of 5">' + glyphs + "</span>";
    }
    return (
      '<span class="rating-summary" title="' +
      avg.toFixed(1) +
      ' of 5">' +
      glyphs +
      " <strong>" +
      avg.toFixed(1) +
      "</strong> · " +
      n +
      (n === 1 ? " rating" : " ratings") +
      "</span>"
    );
  }

  function vehicleCard(v, options) {
    options = options || {};
    var query = options.query || "";
    var link = NS.routes.href("car", "?id=" + encodeURIComponent(v.id) + (query ? "&" + query.replace(/^\?/, "") : ""));
    var bookLink = NS.routes.href(
      "book",
      "?vehicle=" + encodeURIComponent(v.id) + (query ? "&" + query.replace(/^\?/, "") : "")
    );
    var free = options.dateAvailable !== false && v.status === "available";
    var rating = NS.domain.vehicleRatingSummary ? NS.domain.vehicleRatingSummary(v.id) : { average: 0, count: 0 };
    return (
      '<article class="vehicle-card' +
      (free ? " is-available" : " is-busy") +
      '">' +
      '<a class="vehicle-photo" href="' +
      link +
      '">' +
      '<img src="' +
      NS.security.escapeHtml(v.image) +
      '" alt="' +
      NS.security.escapeHtml(v.name) +
      '">' +
      (free
        ? '<span class="avail-chip">Available</span>'
        : '<span class="avail-chip avail-busy">Unavailable</span>') +
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
      (rating.count ? '<p class="card-rating">' + starsDisplay(rating.average, rating.count) + "</p>" : "") +
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
      (free
        ? '<a class="btn btn-gold" href="' + bookLink + '">Book</a>'
        : '<a class="btn btn-ghost" href="' + link + '">View</a>') +
      "</div></div></article>"
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
    readImageFile(file, done, { maxSide: 320, maxBytes: 320000, label: "Profile image" });
  }

  function readLicensePhoto(file, done) {
    readImageFile(file, done, { maxSide: 960, maxBytes: 700000, label: "License photo" });
  }

  function readImageFile(file, done, options) {
    options = options || {};
    var maxSide = options.maxSide || 320;
    var maxBytes = options.maxBytes || 320000;
    var label = options.label || "Photo";
    if (!file) {
      done(new Error("Choose a photo first."), null);
      return;
    }
    if (!/^image\/(jpeg|jpg|png|webp)$/i.test(file.type)) {
      done(new Error("Use a JPG, PNG, or WebP photo."), null);
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      done(new Error(label + " must be under 8 MB."), null);
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
        var scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        var w = Math.max(1, Math.round(img.width * scale));
        var h = Math.max(1, Math.round(img.height * scale));
        var canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        var ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        var dataUrl = canvas.toDataURL("image/jpeg", 0.84);
        if (dataUrl.length > maxBytes) {
          dataUrl = canvas.toDataURL("image/jpeg", 0.7);
        }
        if (dataUrl.length > maxBytes) {
          dataUrl = canvas.toDataURL("image/jpeg", 0.55);
        }
        if (dataUrl.length > maxBytes) {
          done(new Error(label + " is still too large after compression."), null);
          return;
        }
        done(null, dataUrl);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  function downloadReceipt(booking) {
    if (!booking) throw new Error("Booking not found.");
    var vehicle = NS.domain.getVehicle(booking.vehicleId);
    var me = NS.auth.current();
    var info = booking.driverInfo || {};
    var payment = booking.payment || null;
    var driveMode = booking.driveMode === "chauffeur" ? "Chauffeur" : "Self-drive";
    var paymentLine = "Unpaid";
    if (payment) {
      if (payment.method === "cashless") {
        paymentLine = "Cashless · " + payment.brand + " ·••" + payment.last4 + " · " + payment.authCode;
      } else if (payment.method === "cash") {
        paymentLine = "Cash · " + payment.authCode;
      } else {
        paymentLine = (payment.brand || "Paid") + " · " + (payment.authCode || "");
      }
    }
    var driverBlock =
      booking.driveMode === "chauffeur"
        ? "<tr><th>Valid ID</th><td>" +
          NS.security.escapeHtml((info.idType || "") + " · " + (info.idNumber || "")) +
          "</td></tr>"
        : "<tr><th>License</th><td>" +
          NS.security.escapeHtml((info.licenseName || "") + " · " + (info.licenseNo || "")) +
          "</td></tr>" +
          "<tr><th>License expiry</th><td>" +
          NS.security.escapeHtml(info.licenseExpiry || "") +
          "</td></tr>" +
          "<tr><th>License photo</th><td>" +
          (info.licensePhoto ? "Attached" : "Missing") +
          "</td></tr>" +
          "<tr><th>Emergency</th><td>" +
          NS.security.escapeHtml(info.emergencyPhone || "") +
          "</td></tr>";

    var html =
      "<!DOCTYPE html><html lang='en'><head><meta charset='UTF-8'>" +
      "<title>Receipt " +
      NS.security.escapeHtml(booking.ref) +
      "</title>" +
      "<style>" +
      "body{font-family:Segoe UI,Arial,sans-serif;max-width:720px;margin:32px auto;color:#111827;padding:0 16px}" +
      "h1{margin:0 0 4px;font-size:28px}h2{margin:24px 0 8px;font-size:18px}" +
      ".muted{color:#6b7280}.total{font-size:28px;font-weight:800;color:#6430e0;margin:12px 0}" +
      "table{width:100%;border-collapse:collapse;margin-top:12px}" +
      "th,td{text-align:left;padding:10px 8px;border-bottom:1px solid #e5e7eb;vertical-align:top}" +
      "th{width:34%;color:#6b7280;font-weight:600}.brand{font-weight:800;color:#7842f5}" +
      "@media print{body{margin:0}}" +
      "</style></head><body>" +
      "<p class='brand'>iDrive CDO</p>" +
      "<h1>Payment receipt</h1>" +
      "<p class='muted'>Generated " +
      NS.security.escapeHtml(new Date().toLocaleString()) +
      "</p>" +
      "<p class='total'>" +
      peso(booking.total) +
      "</p>" +
      "<table>" +
      "<tr><th>Booking ref</th><td>" +
      NS.security.escapeHtml(booking.ref) +
      "</td></tr>" +
      "<tr><th>Customer</th><td>" +
      NS.security.escapeHtml(me ? me.firstName + " " + me.lastName + " · " + me.email : "") +
      "</td></tr>" +
      "<tr><th>Vehicle</th><td>" +
      NS.security.escapeHtml(vehicle ? vehicle.name : "Vehicle") +
      "</td></tr>" +
      "<tr><th>Drive mode</th><td>" +
      driveMode +
      "</td></tr>" +
      driverBlock +
      "<tr><th>Pickup</th><td>" +
      NS.security.escapeHtml(booking.pickup) +
      "</td></tr>" +
      "<tr><th>Return</th><td>" +
      NS.security.escapeHtml(booking.dropoff) +
      "</td></tr>" +
      "<tr><th>Dates</th><td>" +
      fmtDate(booking.startDate) +
      " – " +
      fmtDate(booking.endDate) +
      " (" +
      booking.days +
      " day(s))</td></tr>" +
      "<tr><th>Payment</th><td>" +
      NS.security.escapeHtml(paymentLine) +
      "</td></tr>" +
      "<tr><th>Payment status</th><td>" +
      NS.security.escapeHtml(booking.paymentStatus || "") +
      "</td></tr>" +
      "<tr><th>Booking status</th><td>" +
      NS.security.escapeHtml(booking.status || "") +
      "</td></tr>" +
      (booking.notes
        ? "<tr><th>Notes</th><td>" + NS.security.escapeHtml(booking.notes) + "</td></tr>"
        : "") +
      "</table>" +
      "<p class='muted'>iDrive CDO · Limketkai Drive, Cagayan de Oro · Frontend demo receipt</p>" +
      "</body></html>";

    var blob = new Blob([html], { type: "text/html;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "iDrive-receipt-" + String(booking.ref || booking.id).replace(/[^\w-]+/g, "_") + ".html";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
    return true;
  }

  NS.ui = {
    peso: peso,
    fmtDate: fmtDate,
    qs: qs,
    toast: toast,
    askYesNo: askYesNo,
    mountChrome: mountChrome,
    statusBadge: statusBadge,
    starsDisplay: starsDisplay,
    vehicleCard: vehicleCard,
    bindCsrf: bindCsrf,
    fieldError: fieldError,
    clearErrors: clearErrors,
    avatarHtml: avatarHtml,
    readImageAsAvatar: readImageAsAvatar,
    readLicensePhoto: readLicensePhoto,
    downloadReceipt: downloadReceipt
  };
})(window);
