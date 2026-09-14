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
      var driverWrap = document.getElementById("driver-select-wrap");
      if (selfFields) selfFields.hidden = mode !== "self";
      if (chauffeurFields) chauffeurFields.hidden = mode !== "chauffeur";
      if (driverWrap) {
        driverWrap.hidden = mode !== "chauffeur";
        if (form.driverDetailsId) form.driverDetailsId.required = mode === "chauffeur";
      }

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

    if (form.driverDetailsId) {
      form.driverDetailsId.innerHTML =
        '<option value="">Select driver</option>' +
        (NS.domain.activeDrivers ? NS.domain.activeDrivers() : [])
          .map(function (d) {
            var duty = d.dutyStatus === "on_call" ? "On call" : "Regular";
            return (
              '<option value="' +
              d.id +
              '">' +
              NS.security.escapeHtml(d.fullName + " · " + duty + " · " + d.driverLicense) +
              "</option>"
            );
          })
          .join("");
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
      NS.ui.askYesNo("Save this booking and continue to payment?", { title: "Save edit" }).then(function (ok) {
        if (!ok) return;
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
              pickupTime: form.pickupTime ? form.pickupTime.value : "09:00",
              returnTime: form.returnTime ? form.returnTime.value : "09:00",
              numberOfPassengers: form.numberOfPassengers ? form.numberOfPassengers.value : 1,
              fuelBeforeRent: form.fuelBeforeRent ? form.fuelBeforeRent.value : "Full",
              pickup: form.pickup.value,
              dropoff: form.dropoff.value,
              driveMode: mode,
              driverDetailsId: form.driverDetailsId ? form.driverDetailsId.value : "",
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
    });
    syncDriveMode();
    refresh();
  };

  NS.pages.bookings = function myBookings() {
    var host = document.getElementById("bookings-list");
    if (!host) return;
    var me = NS.auth.current();
    function render() {
      var list = NS.domain.myBookings().slice().reverse();
      host.innerHTML = list.length
        ? list
            .map(function (b) {
              var v = NS.domain.getVehicle(b.vehicleId);
              var canReturn =
                me &&
                me.role === "customer" &&
                (b.status === "confirmed" || b.status === "ongoing");
              var returnBtn = canReturn
                ? '<button class="btn btn-gold btn-sm" type="button" data-return="' +
                  b.id +
                  '">Return vehicle</button> '
                : "";
              var waiting =
                b.status === "return_requested"
                  ? "<p class='fineprint'>Waiting for desk to accept return</p>"
                  : "";
              var canRate =
                me &&
                me.role === "customer" &&
                b.status === "completed" &&
                !b.rating &&
                !NS.domain.getRatingForBooking(b.id);
              var rateBtn = canRate
                ? '<a class="btn btn-gold btn-sm" href="' +
                  NS.routes.href("bookingDetail", "?id=" + encodeURIComponent(b.id)) +
                  '">Rate car</a> '
                : "";
              var ratedNote =
                b.rating || NS.domain.getRatingForBooking(b.id)
                  ? "<p class='fineprint'>You rated this car</p>"
                  : "";
              return (
                '<article class="booking-card"><div><p class="eyebrow">' +
                NS.security.escapeHtml(b.ref) +
                "</p><h3>" +
                NS.security.escapeHtml(v ? v.name : "Vehicle") +
                "</h3><p>" +
                NS.ui.fmtDate(b.startDate) +
                " → " +
                NS.ui.fmtDate(b.endDate) +
                "</p>" +
                waiting +
                ratedNote +
                "</div><div>" +
                NS.ui.statusBadge(b.status) +
                "<p>" +
                NS.ui.peso(b.total) +
                '</p><div class="btn-row">' +
                returnBtn +
                rateBtn +
                '<a class="btn btn-ghost btn-sm" href="' +
                NS.routes.href("bookingDetail", "?id=" + encodeURIComponent(b.id)) +
                '">Open</a></div></div></article>'
              );
            })
            .join("")
        : "<p class='notice'>You have no bookings yet. <a href='" + NS.routes.href("book") + "'>Make a booking</a>.</p>";
    }
    host.addEventListener("click", function (e) {
      var id = e.target.getAttribute("data-return");
      if (!id) return;
      NS.ui
        .askYesNo("Return this vehicle to the desk now?", { title: "Return vehicle", yes: "Yes", no: "No" })
        .then(function (ok) {
          if (!ok) return;
          try {
            NS.domain.requestVehicleReturn(id, "", NS.security.getCsrf());
            NS.ui.toast("Return request sent. Staff will accept it at the desk.", "ok");
            render();
          } catch (err) {
            NS.ui.toast(err.message, "err");
          }
        });
    });
    render();
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
    var canReturn =
      me &&
      me.role === "customer" &&
      booking.userId === me.id &&
      (booking.status === "confirmed" || booking.status === "ongoing");
    var returnBtn = canReturn
      ? '<button class="btn btn-gold" id="return-vehicle-btn" type="button">Return vehicle</button>'
      : "";
    var staffAccept =
      me &&
      NS.auth.hasRole("staff") &&
      booking.status === "return_requested"
        ? '<button class="btn btn-gold" id="accept-return-btn" type="button">Accept return</button>'
        : "";
    var returnPending =
      booking.status === "return_requested"
        ? me && me.role === "customer"
          ? "<p class='notice'>Return requested. Waiting for the desk to accept the vehicle.</p>"
          : "<p class='notice'>Customer requested vehicle return. Accept it when the car is back at the desk.</p>"
        : "";
    var existingRating = NS.domain.getRatingForBooking(booking.id) || booking.rating || null;
    var canRate =
      me &&
      me.role === "customer" &&
      booking.userId === me.id &&
      booking.status === "completed" &&
      !existingRating;
    var ratingBlock = "";
    if (canRate) {
      ratingBlock =
        '<div class="rating-panel" id="rating-panel">' +
        "<h2>Rate this car</h2>" +
        "<p>How was your trip with " +
        NS.security.escapeHtml(v ? v.name : "this vehicle") +
        "?</p>" +
        '<form id="rating-form">' +
        '<div class="star-picker" role="radiogroup" aria-label="Star rating">' +
        [5, 4, 3, 2, 1]
          .map(function (n) {
            return (
              '<input type="radio" name="stars" id="star-' +
              n +
              '" value="' +
              n +
              '" required>' +
              '<label for="star-' +
              n +
              '" title="' +
              n +
              ' stars">★</label>'
            );
          })
          .join("") +
        "</div>" +
        '<label class="field">Comment (optional)<textarea class="form-control" name="comment" maxlength="280" rows="3" placeholder="Cleanliness, comfort, pickup experience…"></textarea></label>' +
        '<div class="btn-row">' +
        '<button class="btn btn-gold" type="submit">Submit rating</button>' +
        '<a class="btn btn-ghost" href="' +
        NS.routes.href("myBookings") +
        '">Back</a></div></form></div>';
    } else if (existingRating && booking.status === "completed") {
      ratingBlock =
        '<div class="rating-panel">' +
        "<h2>Your rating</h2>" +
        NS.ui.starsDisplay(existingRating.stars, 1, { compact: true }) +
        (existingRating.comment
          ? "<p>" + NS.security.escapeHtml(existingRating.comment) + "</p>"
          : "") +
        '<div class="btn-row"><a class="btn btn-ghost" href="' +
        NS.routes.href("myBookings") +
        '">Back</a></div></div>';
    }
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
      returnPending +
      "<dl class='spec-grid'>" +
      "<div><dt>Drive mode</dt><dd>" +
      driveModeLabel +
      "</dd></div>" +
      (booking.driverDetailsId
        ? "<div><dt>Assigned driver</dt><dd>" +
          (function () {
            var d = NS.domain.getDriver(booking.driverDetailsId);
            if (!d) return NS.security.escapeHtml(booking.driverDetailsId);
            var duty = d.dutyStatus === "on_call" ? "on_call" : "regular";
            return (
              NS.security.escapeHtml(d.fullName + " · " + d.driverLicense) +
              " " +
              NS.ui.statusBadge(duty)
            );
          })() +
          "</dd></div>"
        : "") +
      driverRows +
      "<div><dt>Passengers</dt><dd>" +
      NS.security.escapeHtml(String(booking.numberOfPassengers || 1)) +
      "</dd></div>" +
      "<div><dt>Pickup</dt><dd>" +
      NS.security.escapeHtml(booking.pickup) +
      (booking.pickupTime ? " · " + NS.security.escapeHtml(booking.pickupTime) : "") +
      "</dd></div>" +
      "<div><dt>Return</dt><dd>" +
      NS.security.escapeHtml(booking.dropoff) +
      (booking.returnTime ? " · " + NS.security.escapeHtml(booking.returnTime) : "") +
      "</dd></div>" +
      "<div><dt>Fuel before</dt><dd>" +
      NS.security.escapeHtml(booking.fuelBeforeRent || "—") +
      "</dd></div>" +
      "<div><dt>Fuel upon return</dt><dd>" +
      NS.security.escapeHtml(booking.fuelUponReturn || "—") +
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
        ? NS.security.escapeHtml(
            (booking.payment.method === "cashless" ? "Cashless · " : "Cash · ") +
              booking.payment.brand +
              (booking.payment.method === "cash"
                ? " · " + booking.payment.authCode
                : " ·••" + booking.payment.last4 + " · " + booking.payment.authCode)
          )
        : "Unpaid") +
      "</dd></div>" +
      "</dl>" +
      (info.licenseAddress
        ? "<p>License address: " + NS.security.escapeHtml(info.licenseAddress) + "</p>"
        : "") +
      (booking.returnNotes
        ? "<p>Return notes: " + NS.security.escapeHtml(booking.returnNotes) + "</p>"
        : "") +
      (booking.notes ? "<p>Notes: " + NS.security.escapeHtml(booking.notes) + "</p>" : "") +
      ratingBlock +
      '<div class="btn-row">' +
      pay +
      returnBtn +
      staffAccept +
      cancel +
      (booking.paymentStatus === "paid"
        ? '<button class="btn btn-gold" id="save-receipt-btn" type="button">Save receipt</button>'
        : "") +
      '<button class="btn btn-dark" type="button" onclick="window.print()">Print receipt</button></div></div>';

    var ratingForm = document.getElementById("rating-form");
    if (ratingForm) {
      NS.ui.bindCsrf(ratingForm);
      ratingForm.addEventListener("submit", function (e) {
        e.preventDefault();
        var starsEl = ratingForm.querySelector('input[name="stars"]:checked');
        var stars = starsEl ? starsEl.value : "";
        NS.ui
          .askYesNo("Submit your " + stars + "-star rating for this car?", {
            title: "Rate car",
            yes: "Yes",
            no: "No"
          })
          .then(function (ok) {
            if (!ok) return;
            try {
              NS.domain.rateBooking(
                booking.id,
                stars,
                ratingForm.comment.value,
                ratingForm.csrf ? ratingForm.csrf.value : NS.security.getCsrf()
              );
              NS.ui.toast("Thanks — your rating was saved.", "ok");
              location.reload();
            } catch (err) {
              NS.ui.bindCsrf(ratingForm);
              NS.ui.toast(err.message, "err");
            }
          });
      });
    }

    var saveBtn = document.getElementById("save-receipt-btn");
    if (saveBtn) {
      saveBtn.addEventListener("click", function () {
        NS.ui.askYesNo("Save this receipt to your device?", { title: "Save edit" }).then(function (ok) {
          if (!ok) return;
          try {
            NS.ui.downloadReceipt(booking);
            NS.ui.toast("Receipt saved to your downloads.", "ok");
          } catch (err) {
            NS.ui.toast(err.message || "Could not save receipt.", "err");
          }
        });
      });
    }

    var returnVehicleBtn = document.getElementById("return-vehicle-btn");
    if (returnVehicleBtn) {
      returnVehicleBtn.addEventListener("click", function () {
        NS.ui
          .askYesNo("Return this vehicle to the desk now?", { title: "Return vehicle", yes: "Yes", no: "No" })
          .then(function (ok) {
            if (!ok) return;
            try {
              NS.domain.requestVehicleReturn(booking.id, "", NS.security.getCsrf());
              NS.ui.toast("Return request sent. Staff will accept it at the desk.", "ok");
              location.reload();
            } catch (err) {
              NS.ui.toast(err.message, "err");
            }
          });
      });
    }

    var acceptReturnBtn = document.getElementById("accept-return-btn");
    if (acceptReturnBtn) {
      acceptReturnBtn.addEventListener("click", function () {
        NS.ui
          .askYesNo("Accept this vehicle return and complete the trip?", {
            title: "Accept return",
            yes: "Yes",
            no: "No"
          })
          .then(function (ok) {
            if (!ok) return;
            try {
              NS.domain.acceptVehicleReturn(booking.id, NS.security.getCsrf());
              NS.ui.toast("Return accepted. Trip completed.", "ok");
              location.reload();
            } catch (err) {
              NS.ui.toast(err.message, "err");
            }
          });
      });
    }

    var cancelBtn = document.getElementById("cancel-booking");
    if (cancelBtn) {
      cancelBtn.addEventListener("click", function () {
        NS.ui.askYesNo("Cancel this booking?", { title: "Save edit" }).then(function (ok) {
          if (!ok) return;
          try {
            NS.domain.setBookingStatus(booking.id, "cancelled", NS.security.getCsrf());
            NS.ui.toast("Booking cancelled.", "ok");
            location.reload();
          } catch (err) {
            NS.ui.toast(err.message, "err");
          }
        });
      });
    }
  };
})(window);
