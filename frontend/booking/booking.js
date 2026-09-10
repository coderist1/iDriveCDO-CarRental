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
      form.insertBefore(box, form.querySelector("h1") ? form.querySelector("h1").nextSibling : form.firstChild);
    }
    if (!box) return;
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

  function locationOptions(selected) {
    return NS.domain.LOCATIONS.map(function (loc) {
      return (
        '<option value="' +
        NS.security.escapeHtml(loc) +
        '"' +
        (loc === selected ? " selected" : "") +
        ">" +
        NS.security.escapeHtml(loc) +
        "</option>"
      );
    }).join("");
  }

  function localISO(d) {
    return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
  }

  NS.pages.book = function book() {
    var form = document.getElementById("book-form");
    var summary = document.getElementById("book-summary");
    if (!form) return;
    if (form.getAttribute("data-bound") === "1") return;
    form.setAttribute("data-bound", "1");

    if (NS.ui && NS.ui.bindCsrf) NS.ui.bindCsrf(form);

    var vehicleId = NS.ui.qs("vehicle") || "";
    var vehicles = NS.domain.vehicles().filter(function (v) {
      return v.status === "available";
    });

    if (!vehicles.length) {
      showAlert(form, "No vehicles are available right now.", "err");
      return;
    }

    form.vehicleId.innerHTML = vehicles
      .map(function (v) {
        return (
          '<option value="' +
          v.id +
          '"' +
          (v.id === vehicleId ? " selected" : "") +
          ">" +
          NS.security.escapeHtml(v.name) +
          " — " +
          NS.ui.peso(v.dailyRate) +
          "/day</option>"
        );
      })
      .join("");

    var today = new Date();
    var start = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    var end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 4);
    var qStart = NS.ui.qs("start");
    var qEnd = NS.ui.qs("end");
    var qPickup = NS.ui.qs("pickup");

    form.startDate.value = qStart || localISO(start);
    form.endDate.value = qEnd || localISO(end);
    form.startDate.min = localISO(today);
    form.endDate.min = form.startDate.value;

    form.pickup.innerHTML = locationOptions(qPickup || "Laguindingan Airport (CGY)");
    form.dropoff.innerHTML = locationOptions("Centrio Mall");

    var me = NS.auth.current();
    if (me) {
      if (form.licenseName) form.licenseName.value = ((me.firstName || "") + " " + (me.lastName || "")).trim();
      if (form.licenseNo) form.licenseNo.value = me.licenseNo || "";
      if (form.licenseExpiry) form.licenseExpiry.value = me.licenseExpiry || "";
      if (form.emergencyPhone) form.emergencyPhone.value = me.phone || "";
    }

    var addonsHost = document.getElementById("addons");
    addonsHost.innerHTML = NS.domain.ADDONS.map(function (a) {
      return (
        '<label class="check-min addon-row" data-addon="' +
        a.id +
        '">' +
        '<input type="checkbox" name="addon" value="' +
        a.id +
        '">' +
        "<span><strong>" +
        NS.security.escapeHtml(a.name) +
        "</strong> · " +
        NS.ui.peso(a.daily) +
        "/day</span></label>"
      );
    }).join("");

    function driveMode() {
      var chosen = form.querySelector('input[name="driveMode"]:checked');
      return chosen ? chosen.value : "self";
    }

    function syncDriveMode() {
      var mode = driveMode();
      var selfFields = document.getElementById("self-drive-fields");
      var chauffeurFields = document.getElementById("chauffeur-fields");
      if (selfFields) selfFields.hidden = mode !== "self";
      if (chauffeurFields) chauffeurFields.hidden = mode !== "chauffeur";

      var driverRow = addonsHost.querySelector('[data-addon="driver"]');
      var driverInput = driverRow ? driverRow.querySelector('input[name="addon"]') : null;
      if (driverRow && driverInput) {
        if (mode === "chauffeur") {
          driverRow.hidden = true;
          driverInput.checked = true;
          driverInput.disabled = true;
          driverRow.classList.add("is-locked");
        } else {
          driverRow.hidden = true;
          driverInput.checked = false;
          driverInput.disabled = true;
          driverRow.classList.remove("is-locked");
        }
      }

      var selfInputs = ["licenseName", "licenseNo", "licenseExpiry", "licenseAddress", "emergencyPhone"];
      var chauffeurInputs = ["idType", "idNumber"];
      selfInputs.forEach(function (name) {
        if (form[name]) form[name].required = mode === "self";
      });
      chauffeurInputs.forEach(function (name) {
        if (form[name]) form[name].required = mode === "chauffeur";
      });
    }

    function selectedAddons() {
      var ids = Array.prototype.map.call(form.querySelectorAll('input[name="addon"]:checked'), function (el) {
        return el.value;
      });
      if (driveMode() === "chauffeur" && ids.indexOf("driver") === -1) ids.push("driver");
      return ids;
    }

    var FALLBACK_IMAGE =
      "https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=1200&q=80";

    function selectedVehicle() {
      var id = form.vehicleId.value;
      for (var i = 0; i < vehicles.length; i++) {
        if (vehicles[i].id === id) return vehicles[i];
      }
      return NS.domain.getVehicle(id);
    }

    function renderPhoto(vehicle) {
      var photoHost = document.getElementById("book-summary-photo");
      if (!photoHost) return;
      var src = (vehicle && vehicle.image) || FALLBACK_IMAGE;
      var name = (vehicle && vehicle.name) || "Vehicle";
      var safeSrc = String(src)
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;");
      photoHost.classList.remove("is-empty");
      photoHost.innerHTML =
        '<img src="' +
        safeSrc +
        '" alt="' +
        NS.security.escapeHtml(name) +
        '" loading="eager">';
    }

    function estimateHtml(q, warning) {
      var mode = driveMode();
      return (
        "<h3>Trip estimate</h3>" +
        (warning ? '<p class="notice">' + NS.security.escapeHtml(warning) + "</p>" : "") +
        "<p><strong>" +
        NS.security.escapeHtml(q.vehicle.name) +
        "</strong></p>" +
        "<p class='estimate-mode'>" +
        (mode === "chauffeur" ? "Chauffeur service" : "Self-drive") +
        "</p>" +
        "<ul class='estimate-list'><li>" +
        q.days +
        " day(s) × " +
        NS.ui.peso(q.vehicle.dailyRate) +
        "</li>" +
        q.addons
          .map(function (a) {
            return "<li>" + NS.security.escapeHtml(a.name) + " · " + NS.ui.peso(a.daily * q.days) + "</li>";
          })
          .join("") +
        "</ul><p class='total'>Total " +
        NS.ui.peso(q.total) +
        "</p>"
      );
    }

    function refresh() {
      var body = document.getElementById("book-summary-body");
      if (!body) return;
      var vehicle = selectedVehicle();
      renderPhoto(vehicle);
      try {
        form.endDate.min = form.startDate.value || localISO(today);
        var q = NS.domain.quote(form.vehicleId.value, form.startDate.value, form.endDate.value, selectedAddons());
        body.innerHTML = estimateHtml(q, "");
      } catch (err) {
        try {
          var soft = NS.domain.quote(
            form.vehicleId.value,
            form.startDate.value,
            form.endDate.value,
            selectedAddons(),
            { ignoreAvailability: true }
          );
          body.innerHTML = estimateHtml(soft, err.message);
        } catch (softErr) {
          body.innerHTML =
            "<h3>Trip estimate</h3><p class='notice'>" + NS.security.escapeHtml(err.message) + "</p>";
        }
      }
    }

    var busy = false;
    form.addEventListener("change", function () {
      syncDriveMode();
      refresh();
    });
    form.addEventListener("input", refresh);
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (busy) return;
      busy = true;
      showAlert(form, "", "ok");
      var btn = form.querySelector('button[type="submit"]');
      if (btn) {
        btn.disabled = true;
        btn.textContent = "Creating booking…";
      }
      try {
        if (NS.ui && NS.ui.bindCsrf) NS.ui.bindCsrf(form);
        var csrfInput = form.querySelector('input[name="csrf"]');
        var mode = driveMode();
        var driverInfo =
          mode === "chauffeur"
            ? {
                idType: form.idType.value,
                idNumber: form.idNumber.value
              }
            : {
                licenseName: form.licenseName.value,
                licenseNo: form.licenseNo.value,
                licenseExpiry: form.licenseExpiry.value,
                licenseAddress: form.licenseAddress.value,
                emergencyPhone: form.emergencyPhone.value
              };
        var booking = NS.domain.createBooking(
          {
            vehicleId: form.vehicleId.value,
            startDate: form.startDate.value,
            endDate: form.endDate.value,
            pickup: form.pickup.value,
            dropoff: form.dropoff.value,
            driveMode: mode,
            driverInfo: driverInfo,
            addons: selectedAddons(),
            notes: form.notes.value
          },
          csrfInput ? csrfInput.value : ""
        );
        showAlert(form, "Booking " + booking.ref + " created. Redirecting…", "ok");
        location.href = NS.routes.href("payment", "?id=" + encodeURIComponent(booking.id));
      } catch (err) {
        busy = false;
        if (btn) {
          btn.disabled = false;
          btn.textContent = "Continue to payment";
        }
        if (NS.ui && NS.ui.bindCsrf) NS.ui.bindCsrf(form);
        showAlert(form, err.message || "Could not create booking.", "err");
      }
    });
    syncDriveMode();
    refresh();
  };

  NS.pages.bookings = function myBookings() {
    var host = document.getElementById("bookings-list");
    if (!host) return;
    var list = NS.domain.myBookings().slice().reverse();
    host.innerHTML = list.length
      ? list
          .map(function (b) {
            var v = NS.domain.getVehicle(b.vehicleId);
            return (
              '<article class="booking-card"><div><p class="eyebrow">' +
              NS.security.escapeHtml(b.ref) +
              "</p><h3>" +
              NS.security.escapeHtml(v ? v.name : "Vehicle") +
              "</h3><p>" +
              NS.ui.fmtDate(b.startDate) +
              " → " +
              NS.ui.fmtDate(b.endDate) +
              "</p></div><div>" +
              NS.ui.statusBadge(b.status) +
              "<p>" +
              NS.ui.peso(b.total) +
              '</p><a class="btn btn-ghost" href="' +
              NS.routes.href("bookingDetail", "?id=" + encodeURIComponent(b.id)) +
              '">Open</a></div></article>'
            );
          })
          .join("")
      : "<p class='notice'>You have no bookings yet. <a href='" + NS.routes.href("book") + "'>Make a booking</a>.</p>";
  };

  NS.pages.detail = function bookingDetail() {
    var host = document.getElementById("booking-view");
    if (!host) return;
    var booking = NS.domain.getBooking(NS.ui.qs("id"));
    if (!booking) {
      host.innerHTML = "<p class='notice'>Booking not found.</p>";
      return;
    }
    try {
      var me = NS.auth.current();
      if (me.role === "customer" && booking.userId !== me.id) throw new Error("hidden");
    } catch (e) {
      host.innerHTML = "<p class='notice'>You cannot view this booking.</p>";
      return;
    }
    var v = NS.domain.getVehicle(booking.vehicleId);
    var pay =
      booking.paymentStatus === "unpaid" && booking.status === "pending"
        ? '<a class="btn btn-gold" href="' +
          NS.routes.href("payment", "?id=" + encodeURIComponent(booking.id)) +
          '">Pay now</a>'
        : "";
    var cancel =
      booking.status === "pending" || booking.status === "confirmed"
        ? '<button class="btn btn-ghost" id="cancel-booking" type="button">Cancel trip</button>'
        : "";
    var info = booking.driverInfo || {};
    var driveModeLabel = booking.driveMode === "chauffeur" ? "Chauffeur" : "Self-drive";
    var driverRows =
      booking.driveMode === "chauffeur"
        ? "<div><dt>Valid ID</dt><dd>" +
          NS.security.escapeHtml((info.idType || "ID") + " · " + (info.idNumber || "—")) +
          "</dd></div>"
        : "<div><dt>License</dt><dd>" +
          NS.security.escapeHtml((info.licenseName || "—") + " · " + (info.licenseNo || "—")) +
          "</dd></div>" +
          "<div><dt>License expiry</dt><dd>" +
          NS.security.escapeHtml(info.licenseExpiry || "—") +
          "</dd></div>" +
          "<div><dt>Emergency</dt><dd>" +
          NS.security.escapeHtml(info.emergencyPhone || "—") +
          "</dd></div>";

    host.innerHTML =
      '<div class="receipt">' +
      "<p class='eyebrow'>Booking " +
      NS.security.escapeHtml(booking.ref) +
      "</p>" +
      "<h1>" +
      NS.security.escapeHtml(v ? v.name : "Vehicle") +
      "</h1>" +
      NS.ui.statusBadge(booking.status) +
      " " +
      NS.ui.statusBadge(booking.paymentStatus) +
      "<dl class='spec-grid'>" +
      "<div><dt>Drive mode</dt><dd>" +
      driveModeLabel +
      "</dd></div>" +
      driverRows +
      "<div><dt>Pickup</dt><dd>" +
      NS.security.escapeHtml(booking.pickup) +
      "</dd></div>" +
      "<div><dt>Return</dt><dd>" +
      NS.security.escapeHtml(booking.dropoff) +
      "</dd></div>" +
      "<div><dt>Dates</dt><dd>" +
      NS.ui.fmtDate(booking.startDate) +
      " – " +
      NS.ui.fmtDate(booking.endDate) +
      "</dd></div>" +
      "<div><dt>Days</dt><dd>" +
      booking.days +
      "</dd></div>" +
      "<div><dt>Total</dt><dd>" +
      NS.ui.peso(booking.total) +
      "</dd></div>" +
      "<div><dt>Payment</dt><dd>" +
      (booking.payment
        ? NS.security.escapeHtml(booking.payment.brand + " " + booking.payment.last4 + " · " + booking.payment.authCode)
        : "Unpaid") +
      "</dd></div>" +
      "</dl>" +
      (info.licenseAddress
        ? "<p>License address: " + NS.security.escapeHtml(info.licenseAddress) + "</p>"
        : "") +
      (booking.notes ? "<p>Notes: " + NS.security.escapeHtml(booking.notes) + "</p>" : "") +
      '<div class="btn-row">' +
      pay +
      cancel +
      '<button class="btn btn-dark" type="button" onclick="window.print()">Print receipt</button></div></div>';

    var cancelBtn = document.getElementById("cancel-booking");
    if (cancelBtn) {
      cancelBtn.addEventListener("click", function () {
        try {
          NS.domain.setBookingStatus(booking.id, "cancelled", NS.security.getCsrf());
          NS.ui.toast("Booking cancelled.", "ok");
          location.reload();
        } catch (err) {
          NS.ui.toast(err.message, "err");
        }
      });
    }
  };
})(window);
