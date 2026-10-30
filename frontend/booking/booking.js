(function (global) {
  "use strict";

  var NS = (global.iDrive = global.iDrive || {});
  NS.pages = NS.pages || {};

  function showAlert(form, message, type) {
    var box = form ? form.querySelector(".form-alert") : document.querySelector(".form-alert");
    if (!box && form) {
      box = document.createElement("div");
      box.className = "notice form-alert";
      var heading = form.querySelector("h1");
      form.insertBefore(box, heading ? heading.nextSibling : form.firstChild);
    }
    if (!box) return;
    if (!message) {
      box.hidden = true;
      box.textContent = "";
      return;
    }
    box.hidden = false;
    box.textContent = message;
    box.style.borderColor = "";
    box.style.color = "";
    box.classList.toggle("ok", type === "ok");
    box.classList.toggle("err", type !== "ok");
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

  function blockOngoingBooking() {
    var me = NS.auth.current();
    if (!me || me.role === "staff" || me.role === "admin") return false;
    var trip = NS.domain.activeBookingForUser ? NS.domain.activeBookingForUser(me.id) : null;
    if (!trip) return false;
    var flow = document.getElementById("booking-flow");
    var typeStep = document.getElementById("rental-type");
    if (flow) flow.hidden = true;
    if (typeStep) typeStep.hidden = true;
    var host = (flow && flow.parentNode) || document.querySelector("section.layout");
    if (!host || document.getElementById("ongoing-trip-block")) return true;
    var box = document.createElement("div");
    box.id = "ongoing-trip-block";
    box.className = "form-card";
    box.innerHTML =
      '<p class="eyebrow">Active trip</p>' +
      "<h1>One car at a time</h1>" +
      "<p>You already have an active booking (<strong>" +
      NS.security.escapeHtml(trip.ref) +
      "</strong>). One car at a time — finish, pay, or cancel it before starting a new one.</p>" +
      '<div class="btn-row">' +
      '<a class="btn btn-gold" href="' +
      NS.routes.href("bookingDetail", "?id=" + encodeURIComponent(trip.id)) +
      '">View active trip</a>' +
      '<a class="btn btn-ghost" href="' +
      NS.routes.href("myBookings") +
      '">All bookings</a>' +
      "</div>";
    host.insertBefore(box, flow || host.firstChild);
    return true;
  }

  NS.pages.book = function book() {
    if (!document.getElementById("rental-type")) return;
    bindRentalChoice();
    requirePhone(function () {
      if (blockOngoingBooking()) return;
      initBook();
      NS.domain.syncVehiclesFromApi().then(function () {
        if (NS.pages.refreshBookFleet) NS.pages.refreshBookFleet();
      }, function (e) {
        console.warn("iDrive: could not load vehicles from API, showing local data.", e);
      });
    });
  };

  /* Accounts created with Google have no mobile number yet; collect it before the first booking. */
  function requirePhone(next) {
    var me = NS.auth.current();
    var flow = document.getElementById("booking-flow");
    if (!me || me.phone || !flow) return next();
    flow.hidden = true;
    var gate = document.createElement("form");
    gate.className = "form-card phone-gate";
    gate.noValidate = true;
    gate.innerHTML =
      '<p class="eyebrow">One more step</p>' +
      "<h1>Add your mobile number</h1>" +
      '<p class="fineprint">We need a Philippine mobile number to confirm your booking and reach you on pick-up day.</p>' +
      '<div class="notice" role="alert" hidden></div>' +
      '<label class="field">Mobile number ' +
      '<input class="form-control" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="09XXXXXXXXX" maxlength="24" required></label>' +
      '<button class="btn btn-gold" type="submit">Continue to booking</button>';
    flow.parentNode.insertBefore(gate, flow);
    var gateButton = gate.querySelector('button[type="submit"]');
    NS.ui.bindAccountPhone(gate.phone, {
      button: gateButton,
      userId: me.id,
      ownPhone: function () { return ""; }
    });
    gate.addEventListener("submit", function (e) {
      e.preventDefault();
      var notice = gate.querySelector(".notice");
      if (gate.phone.getAttribute("data-phone-blocked") === "1") return;
      gateButton.disabled = true;
      NS.auth.ensurePhoneFree(gate.phone.value, me.id).then(function () {
        NS.auth.setPhone(gate.phone.value);
        gate.remove();
        flow.hidden = false;
        next();
      }).catch(function (err) {
        gateButton.disabled = gate.phone.getAttribute("data-phone-blocked") === "1";
        notice.hidden = false;
        notice.textContent = err.message;
        gate.phone.focus();
      });
    });
  }

  var OCR_FILL = {
    "license-front": {
      fullName: "fullName",
      idNumber: "license_no",
      expiry: "license_expiry",
      address: "address",
      birthdate: "birthdate",
      licenseClass: "dl_codes"
    },
    "chauffeur-id": {
      fullName: "fullName",
      idNumber: "idNumber",
      expiry: "idExpiry",
      birthdate: "birthdate",
      issueDate: "idIssue",
      idType: "idType"
    },
    "self-id": {
      fullName: "fullName",
      idNumber: "idNumber",
      expiry: "idExpiry",
      birthdate: "birthdate",
      issueDate: "idIssue",
      idType: "idType"
    }
  };

  var FIELD_LABEL = {
    fullName: "name",
    license_no: "license number",
    license_expiry: "expiration date",
    address: "address",
    birthdate: "birth date",
    dl_codes: "DL codes",
    idNumber: "ID number",
    idExpiry: "ID expiry",
    idIssue: "ID issue date",
    idType: "ID type"
  };

  function slotLabel(slot) {
    if (slot === "parent-id") return "parent ID";
    if (slot === "chauffeur-id" || slot === "self-id") return "ID";
    return "license";
  }

  function initBook() {
    var flow = document.getElementById("booking-flow");
    var typeStep = document.getElementById("rental-type");
    var selfForm = document.getElementById("self-form");
    var chauffeurForm = document.getElementById("chauffeur-form");
    if (!flow || !typeStep || !selfForm || !chauffeurForm) return;
    if (flow.getAttribute("data-bound") === "1") return;
    flow.setAttribute("data-bound", "1");

    if (NS.ui && NS.ui.bindCsrf) {
      NS.ui.bindCsrf(selfForm);
      NS.ui.bindCsrf(chauffeurForm);
    }

    var vehicleId = NS.ui.qs("vehicle") || "";
    var vehicles = bookableVehicles();

    function refillFleet() {
      var dateForm = !selfForm.hidden ? selfForm : !chauffeurForm.hidden ? chauffeurForm : selfForm;
      var start = dateForm.startDate && dateForm.startDate.value;
      var end = dateForm.endDate && dateForm.endDate.value;
      vehicles = bookableVehicles(start, end);
      [selfForm, chauffeurForm].forEach(function (form) {
        if (!form.vehicleId) return;
        var selected = form.vehicleId.value || vehicleId;
        form.vehicleId.innerHTML = vehicleOptions(selected);
        if (selected && vehicles.every(function (v) { return v.id !== selected; })) {
          form.vehicleId.value = vehicles[0] ? vehicles[0].id : "";
        }
      });
      if (!vehicles.length && !typeStep.hidden) {
        showAlert(typeStep, "No vehicles are available right now.", "err");
      } else if (vehicles.length) {
        showAlert(typeStep, "", "ok");
      }
      refresh();
    }
    NS.pages.refreshBookFleet = function () {
      refillFleet();
      if (NS.pages.bookWizard && NS.pages.bookWizard.refreshCars) NS.pages.bookWizard.refreshCars();
    };

    var today = new Date();
    var startDefault = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    var endDefault = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 4);
    var qStart = NS.ui.qs("start");
    var qEnd = NS.ui.qs("end");
    var qPickup = NS.ui.qs("pickup");

    function vehicleOptions(selected) {
      var opts = vehicles.map(function (v) {
      return (
          '<option value="' + v.id + '"' + (v.id === selected ? " selected" : "") + ">" +
          NS.security.escapeHtml(v.name) + " — " + NS.ui.peso(v.dailyRate) + "/day</option>"
      );
    }).join("");
      if (!selected) {
        return '<option value="" selected disabled>Choose a car</option>' + opts;
      }
      return opts;
    }

    function selfHandover(form) {
      if (!form || !form.handover) return "pickup";
      return form.handover.value === "deliver" ? "deliver" : "pickup";
    }

    function syncSelfHandover(form) {
      if (!form || form.id !== "self-form") return;
      var office = NS.domain.OFFICE_PICKUP || "Montalvan Burgos, Cagayan de Oro";
      var mode = selfHandover(form);
      form.querySelectorAll("[data-handover-panel]").forEach(function (panel) {
        panel.hidden = panel.getAttribute("data-handover-panel") !== mode;
      });
      if (form.pickup) form.pickup.value = office;
      if (form.dropoff) {
        if (mode === "pickup") {
          form.dropoff.value = office;
          form.dropoff.required = false;
        } else {
          if (form.dropoff.value === office) form.dropoff.value = "";
          form.dropoff.required = true;
          var maps = form._pickupMaps || (form._pickupMap ? [form._pickupMap] : []);
          setTimeout(function () {
            maps.forEach(function (map) {
              if (map && map.invalidateSize) map.invalidateSize();
            });
          }, 80);
        }
      }
    }

    function applyDefaults(form) {
      var selectedVehicle = form.vehicleId.value || vehicleId;
      form.vehicleId.innerHTML = vehicleOptions(selectedVehicle);
      form.startDate.min = localISO(today);
      form.startDate.value = form.startDate.value || qStart || localISO(startDefault);
      form.endDate.min = form.startDate.value;
      form.endDate.value = form.endDate.value || qEnd || localISO(endDefault);
      if (form.pickup && form.pickup.tagName === "SELECT") {
        if (!form.pickup.value) form.pickup.innerHTML = locationOptions(qPickup || "Laguindingan Airport (CGY)");
        else if (!form.pickup.options.length) form.pickup.innerHTML = locationOptions(qPickup || "Laguindingan Airport (CGY)");
      } else if (form.pickup && form.id === "self-form") {
        form.pickup.value = NS.domain.OFFICE_PICKUP || "Montalvan Burgos, Cagayan de Oro";
        syncSelfHandover(form);
      } else if (form.pickup && qPickup && !form.pickup.value) {
        form.pickup.value = qPickup;
      }
      if (form.dropoff && form.dropoff.tagName === "SELECT") {
        if (!form.dropoff.options.length) form.dropoff.innerHTML = locationOptions("Centrio Mall");
      }
      var me = NS.auth.current() || {};
      if (form.fullName && !form.fullName.value) {
        form.fullName.value = ((me.firstName || "") + " " + (me.lastName || "")).trim();
      }
      if (form.phone && !form.phone.value) form.phone.value = me.phone || "";
      if (form.email && !form.email.value) form.email.value = me.email || "";
      if (form.address && !form.address.value) form.address.value = me.address || "";
      if (form.birthdate && !form.birthdate.value) form.birthdate.value = me.birthdate || "";
      syncParentConsent(form);
    }

    function ageYears(iso) {
      if (!iso) return null;
      var born = new Date(String(iso) + "T00:00:00");
      if (isNaN(born.getTime())) return null;
      var now = new Date();
      var age = now.getFullYear() - born.getFullYear();
      var md = now.getMonth() - born.getMonth();
      if (md < 0 || (md === 0 && now.getDate() < born.getDate())) age -= 1;
      return age;
    }

    function syncParentConsent(form) {
      var age = ageYears(form.birthdate && form.birthdate.value);
      var minor = age != null && age <= 17;
      ["parentName", "parentPhone", "parentConsent"].forEach(function (name) {
        if (form[name]) form[name].required = minor;
      });
    }

    function clearScanState(form) {
      form._scans = {};
      form.querySelectorAll("input, select, textarea").forEach(function (el) {
        delete el.dataset.userEdited;
        el.classList.remove("is-low-confidence");
      });
      form.querySelectorAll(".ocr-confidence").forEach(function (chip) {
        chip.hidden = true;
        chip.textContent = "";
      });
      form.querySelectorAll("[data-preview]").forEach(function (preview) {
        preview.classList.add("is-empty");
        preview.textContent = "No photo yet";
      });
      form.querySelectorAll("[data-clear]").forEach(function (btn) { btn.hidden = true; });
      form.querySelectorAll("[data-status]").forEach(function (el) { el.textContent = ""; });
      var flags = form.querySelector(".ocr-flags");
      if (flags) {
        flags.hidden = true;
        flags.innerHTML = "";
      }
      var ack = form.querySelector(".mismatch-ack");
      if (ack) ack.hidden = true;
    }

    function serialize(form) {
      return Array.prototype.map.call(form.querySelectorAll("input, textarea, select"), function (el) {
        if (el.type === "file") return "";
        if (el.type === "checkbox" || el.type === "radio") return el.name + "=" + (el.checked ? "1" : "0");
        return el.name + "=" + el.value;
      }).join("\n");
    }

    function snapshot(form) {
      form._snapshot = serialize(form);
    }

    function resetForm(form) {
      form.reset();
      clearScanState(form);
      applyDefaults(form);
      snapshot(form);
      showAlert(form, "", "ok");
    }

    [selfForm, chauffeurForm].forEach(function (form) {
      applyDefaults(form);
      snapshot(form);
      bindUploads(form);
      try {
        if (NS.pickupMap) NS.pickupMap.mount(form);
      } catch (mapErr) {
        console.warn("iDrive: map could not start; ID upload still works.", mapErr);
      }
      bindSubmit(form);
      renderFlags(form);
      syncSubmitGate(form);
      form.addEventListener("input", function (e) {
        if (e.target && e.target.name) e.target.dataset.userEdited = "1";
        if (e.target && e.target.classList) {
          e.target.classList.remove("is-low-confidence");
          var chip = e.target.parentNode && e.target.parentNode.querySelector(".ocr-confidence");
          if (chip && (e.target.classList.contains("form-control") || e.target.classList.contains("form-select"))) {
            chip.hidden = true;
          }
        }
        if (e.target && e.target.name === "birthdate") syncParentConsent(form);
        renderFlags(form);
        refresh();
      });
      form.addEventListener("change", function (e) {
        if (form.startDate && form.endDate) form.endDate.min = form.startDate.value || localISO(today);
        if (form.id === "chauffeur-form") syncChauffeurIdChoice(form);
        if (form.id === "self-form" && e.target && e.target.name === "handover") syncSelfHandover(form);
        if (e.target && e.target.name === "birthdate") syncParentConsent(form);
        if (form.id === "self-form") syncChauffeurIdChoice(form);
        renderFlags(form);
        if (e.target && (e.target.name === "startDate" || e.target.name === "endDate")) refillFleet();
        else refresh();
      });
      /* Change drive type is handled by the wizard so earlier steps stay filled. */
    });

    /* Drive-type cards are handled by the 5-step wizard so each screen stays short. */

    function activeForm() {
      if (!selfForm.hidden) return selfForm;
      if (!chauffeurForm.hidden) return chauffeurForm;
      return null;
    }

    function selectedVehicle(form) {
      if (!form) return null;
      var id = form.vehicleId.value;
      for (var i = 0; i < vehicles.length; i++) if (vehicles[i].id === id) return vehicles[i];
      return NS.domain.getVehicle(id);
    }

    var FALLBACK_IMAGE = "https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=1200&q=80";

    function renderPhoto(vehicle) {
      var photoHost = document.getElementById("book-summary-photo");
      if (!photoHost) return;
      if (!vehicle) {
        photoHost.classList.add("is-empty");
        photoHost.innerHTML = "";
        return;
      }
      var src = vehicle.image || FALLBACK_IMAGE;
      var safeSrc = String(src).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
      photoHost.classList.remove("is-empty");
      photoHost.innerHTML = '<img src="' + safeSrc + '" alt="' + NS.security.escapeHtml(vehicle.name || "Vehicle") + '" loading="eager">';
    }

    function emptyEstimate(message) {
      renderPhoto(null);
      var body = document.getElementById("book-summary-body");
      if (!body) return;
      body.innerHTML =
        "<h3>Trip estimate</h3><p class='notice'>" +
        NS.security.escapeHtml(message || "Pick dates and a car to see the total.") +
        "</p>";
    }

    function refresh() {
      var body = document.getElementById("book-summary-body");
      if (!body) return;
      var form = activeForm();
      var wiz = NS.pages.bookWizard;
      var stepNow = wiz && typeof wiz.currentStep === "function" ? wiz.currentStep() : 0;
      var pickedCar = wiz && typeof wiz.chosenVehicle === "function" ? wiz.chosenVehicle() : "";
      /* Dates step: never show a car total — the renter has not confirmed a vehicle yet. */
      if (!form || stepNow <= 1) {
        emptyEstimate(stepNow <= 1 ? "Set your dates, then choose a car to see the total." : "Pick dates and a car to see the total.");
        return;
      }
      if (!form) {
        var preview = pickedCar ? NS.domain.getVehicle(pickedCar) : null;
        if (!preview) {
          emptyEstimate("Tap a car to see the trip total.");
          return;
        }
        var startIso = (document.getElementById("wiz-start") || {}).value || "";
        var endIso = (document.getElementById("wiz-end") || {}).value || "";
        renderPhoto(preview);
        if (startIso && endIso) {
          try {
            var softQuote = NS.domain.quote(preview.id, startIso, endIso, [], { ignoreAvailability: true });
            body.innerHTML = estimateHtml(softQuote, "self", "");
            return;
          } catch (previewErr) {
            /* Fall through to the empty state. */
          }
        }
        emptyEstimate("Tap a car to see the trip total.");
        return;
      }
      var mode = form.id === "chauffeur-form" ? "chauffeur" : "self";
      var vehicle = selectedVehicle(form);
      if (!vehicle) {
        emptyEstimate("Choose a car to see the trip total.");
        return;
      }
      renderPhoto(vehicle);
      var addons = mode === "chauffeur" ? ["driver"] : [];
      try {
        var quote = NS.domain.quote(form.vehicleId.value, form.startDate.value, form.endDate.value, addons);
        body.innerHTML = estimateHtml(quote, mode, "");
      } catch (err) {
        try {
          var soft = NS.domain.quote(form.vehicleId.value, form.startDate.value, form.endDate.value, addons, { ignoreAvailability: true });
          body.innerHTML = estimateHtml(soft, mode, err.message);
        } catch (softErr) {
          body.innerHTML = "<h3>Trip estimate</h3><p class='notice'>" + NS.security.escapeHtml(err.message) + "</p>";
        }
      }
      var bookedHost = form.querySelector("[data-booked-dates]");
      if (bookedHost && NS.domain.bookedRanges) {
        var ranges = NS.domain.bookedRanges(form.vehicleId.value) || [];
        var occupant = NS.domain.ongoingBookingForVehicle
          ? NS.domain.ongoingBookingForVehicle(form.vehicleId.value)
          : null;
        var bits = [];
        if (occupant) {
          bits.push(
            "This car is currently on a trip (" +
              occupant.ref +
              "). Both renters must have a valid ID on file before staff can approve the new booking."
          );
        }
        if (ranges.length) {
          bits.push(
            "Already reserved: " +
              ranges
                .map(function (r) {
                  return NS.ui.fmtDate(r.start) + "–" + NS.ui.fmtDate(r.end) + " (" + r.status + ")";
                })
                .join("; ") +
              ". Choose dates that do not overlap."
          );
        }
        bookedHost.textContent = bits.length ? bits.join(" ") : "No overlapping reservations on this car for other dates.";
      }
    }

    function estimateHtml(q, mode, warning) {
      return (
        "<h3>Trip estimate</h3>" +
        (warning ? '<p class="notice">' + NS.security.escapeHtml(warning) + "</p>" : "") +
        "<p><strong>" + NS.security.escapeHtml(q.vehicle.name) + "</strong></p>" +
        "<p class='estimate-mode'>" + (mode === "chauffeur" ? "With chauffeur" : "Self-drive") + "</p>" +
        "<ul class='estimate-list'><li>" + q.days + " day(s) × " + NS.ui.peso(q.vehicle.dailyRate) + "</li>" +
        q.addons.map(function (a) {
          return "<li>" + NS.security.escapeHtml(a.name) + " · " + NS.ui.peso(a.daily * q.days) + "</li>";
        }).join("") +
        "</ul><p class='total'>Total " + NS.ui.peso(q.total) + "</p>"
      );
    }

    function valuesAgree(name, current, extracted) {
      if (/birth|expiry|issue/i.test(name)) return String(current) === String(extracted);
      if (/name/i.test(name)) return NS.validation.namesMatch(current, extracted);
      return String(current).replace(/\s+/g, "").toUpperCase() === String(extracted).replace(/\s+/g, "").toUpperCase();
    }

    function syncChauffeurIdChoice(form) {
      if (!form.idNumber || !form.idType) return;
      var chosen = form.idType.value || "";
      form.idNumber.placeholder = chosen ? NS.validation.idNumberHint(chosen) : "Choose an ID above first";
      var pick = form.querySelector('[data-upload="chauffeur-id"] [data-pick]');
      if (pick && !pick.disabled) pick.textContent = chosen ? "Upload " + chosen : "Upload ID";
    }

    function paintConfidence(input, score) {
      if (!input || !input.closest) return;
      var label = input.closest(".field");
      var chip = label && label.querySelector(".ocr-confidence");
      if (!chip) return;
      if (!score) {
        chip.hidden = true;
        input.classList.remove("is-low-confidence");
        return;
      }
      var low = score < ((NS.ocr && NS.ocr.LOW_CONFIDENCE) || 0.62);
      chip.hidden = false;
      chip.className = "ocr-confidence" + (low ? " is-low" : "");
      chip.textContent = low
        ? "Low confidence (" + Math.round(score * 100) + "%) — please review"
        : Math.round(score * 100) + "% confidence";
      input.classList.toggle("is-low-confidence", low);
    }

    /* Drop OCR-filled values for one upload slot so a bad read cannot stick after Remove / re-upload. */
    function clearSlotOcrFields(form, slot) {
      var map = OCR_FILL[slot] || {};
      var prev = (form._scans && form._scans[slot]) || {};
      Object.keys(map).forEach(function (ocrKey) {
        var inputName = map[ocrKey];
        /* Keep the renter's chosen ID type; only photo-derived fields are wiped. */
        if (!inputName || inputName === "idType") return;
        var input = form.elements[inputName];
        if (!input || !input.tagName) return;
        var prevVal = prev[ocrKey];
        var edited = input.dataset.userEdited === "1";
        var fromScan =
          prevVal != null &&
          String(prevVal) !== "" &&
          valuesAgree(inputName, input.value, prevVal);
        if (!edited || fromScan || !String(input.value || "").trim()) {
          input.value = "";
          delete input.dataset.userEdited;
          paintConfidence(input, 0);
        }
      });
    }

    function applyExtracted(form, slot, data) {
      form._scans = form._scans || {};
      form._scans[slot] = data || {};
      var map = OCR_FILL[slot] || {};
      var filled = [];
      Object.keys(map).forEach(function (ocrKey) {
        var inputName = map[ocrKey];
        var value = data && data[ocrKey];
        if (!inputName || !value) return;
        var input = form.elements[inputName];
        if (!input) return;
        if (!input.tagName && input.length) {
          /* Radio group (ID type): keep a choice the renter already made. */
          var pickedAlready = !!input.value;
          if (Array.prototype.some.call(input, function (r) { return r.value === value; }) && !pickedAlready) {
            input.value = value;
            filled.push(FIELD_LABEL[inputName] || inputName);
            syncChauffeurIdChoice(form);
          }
          return;
        }
        if (input.tagName === "SELECT" && !Array.prototype.some.call(input.options, function (opt) { return opt.value === value; })) return;
        var score = data.confidence ? Number(data.confidence[ocrKey]) || 0 : 0;
        /* A fresh scan overwrites empty or OCR-filled fields; typed corrections stay. */
        if (input.dataset.userEdited !== "1") {
          input.value = value;
          filled.push(FIELD_LABEL[inputName] || inputName);
          paintConfidence(input, score);
        } else if (valuesAgree(inputName, input.value, value)) {
          paintConfidence(input, score);
        }
      });
      (data && data.unclear ? data.unclear : []).forEach(function (ocrKey) {
        var input = map[ocrKey] && form.elements[map[ocrKey]];
        if (!input || !input.tagName || input.dataset.userEdited === "1") return;
        markUnclear(input);
      });
      return filled;
    }

    function markUnclear(input) {
      var label = input.closest && input.closest(".field");
      var chip = label && label.querySelector(".ocr-confidence");
      input.classList.add("is-low-confidence");
      if (!chip) return;
      chip.hidden = false;
      chip.className = "ocr-confidence is-low";
      chip.textContent = "Couldn't read this clearly on the photo. Please type it.";
    }

    function unclearLabels(slot, data) {
      var map = OCR_FILL[slot] || {};
      return (data && data.unclear ? data.unclear : [])
        .map(function (key) { return map[key] && (FIELD_LABEL[map[key]] || map[key]); })
        .filter(Boolean);
    }

    function bindUploads(form) {
      form.querySelectorAll("[data-upload]").forEach(function (block) {
        var slot = block.getAttribute("data-upload");
        var kind = block.getAttribute("data-kind") || "document";
        var fileInput = block.querySelector(".upload-file");
        var hidden = block.querySelector('input[type="hidden"]');
        var preview = block.querySelector("[data-preview]");
        var pick = block.querySelector("[data-pick]");
        var clearBtn = block.querySelector("[data-clear]");
        var status = block.querySelector("[data-status]");
        if (!fileInput || !pick) return;

        function setStatus(msg) {
          var text = msg || "";
          if (status) status.textContent = text;
          if (!block) return;
          block.classList.remove("is-reading", "is-ok", "is-err");
          if (!text) return;
          if (/Reading|Checking|Trying/i.test(text)) block.classList.add("is-reading");
          else if (/Could not|unavailable|Try again|too large|not a/i.test(text)) block.classList.add("is-err");
          else block.classList.add("is-ok");
        }
        function setPhoto(dataUrl) {
          if (hidden) hidden.value = dataUrl || "";
          if (!preview) return;
          if (dataUrl) {
            preview.classList.remove("is-empty");
            preview.innerHTML = '<img src="' + String(dataUrl).replace(/"/g, "") + '" alt="">';
          } else {
            preview.classList.add("is-empty");
            preview.textContent = "Drop a photo here or use Upload";
          }
          if (clearBtn) clearBtn.hidden = !dataUrl;
        }

        function openPicker(e) {
          if (e) {
            e.preventDefault();
            e.stopPropagation();
          }
          fileInput.click();
        }
        pick.addEventListener("click", openPicker);
        if (preview) preview.addEventListener("click", openPicker);
        [block, preview].forEach(function (zone) {
          if (!zone) return;
          zone.addEventListener("dragover", function (e) {
            e.preventDefault();
            block.classList.add("is-drop");
          });
          zone.addEventListener("dragleave", function () {
            block.classList.remove("is-drop");
          });
          zone.addEventListener("drop", function (e) {
            e.preventDefault();
            block.classList.remove("is-drop");
            var dropped = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
            if (!dropped) return;
            readChosenFile(dropped);
          });
        });
        if (clearBtn) {
          clearBtn.addEventListener("click", function () {
            setPhoto("");
            clearSlotOcrFields(form, slot);
            if (form._scans) delete form._scans[slot];
            setStatus("");
            renderFlags(form);
            syncParentConsent(form);
            syncSubmitGate(form);
          });
        }
        function readChosenFile(file) {
          if (!file) return;
          setStatus("Checking the photo…");
          var check = NS.ocr && NS.ocr.assessQuality
            ? NS.ocr.assessQuality(file, { profile: kind === "selfie" ? "selfie" : "document" })
            : Promise.resolve({ ok: true, issues: [] });
          check.then(function (result) {
            var qualityNote = "";
            if (!result.ok) {
              qualityNote = result.issues.map(function (issue) { return issue.message; }).join(" ");
              setStatus(qualityNote + " Trying to read it anyway…");
            }
            var read = slot === "license-front" ? NS.ui.readLicensePhoto : NS.ui.readIdPhoto;
            function afterAttached(dataUrl) {
              setPhoto(dataUrl);
              if (kind === "selfie" || slot === "parent-id") {
                setStatus(
                  (qualityNote ? qualityNote + " " : "") +
                  (slot === "parent-id"
                    ? "Parent ID attached. Check that the name and photo are clear."
                    : "Photo attached. It is kept with this booking and is not printed on the receipt.")
                );
                return;
              }
              if (!NS.ocr || !NS.ocr.scan) {
                setStatus("Photo attached. Automatic reading is unavailable, so type the details below.");
                return;
              }
              setStatus("Reading the ID… this can take a few seconds.");
              pick.disabled = true;
              /* Wipe the previous OCR fill for this slot before the new read, so a bad ID number cannot linger. */
              clearSlotOcrFields(form, slot);
              if (form._scans) delete form._scans[slot];
              renderFlags(form);
              var picked = form.idType && form.idType.value
                ? form.idType.value
                : slot.indexOf("license") === 0
                  ? "Driver's License"
                  : "";
              /* Read the original file: the stored copy is shrunk and recompressed, which blurs small digits. */
              NS.ocr.scan(file, function (progress, attempt) {
                setStatus((attempt ? "Photo looks turned, trying another angle… " : "Reading the ID… ") + Math.round((Number(progress) || 0) * 100) + "%");
              }, { idType: picked }).then(function (data) {
                pick.disabled = false;
                var filled = applyExtracted(form, slot, data);
                var unclear = unclearLabels(slot, data);
                var chosen = form.idType ? form.idType.value : "";
                var typeNote = chosen && data.idType && data.idType !== chosen
                  ? " This looks like a " + data.idType + ", but you chose " + chosen + ". Please pick the right ID type."
                  : "";
                renderFlags(form);
                syncParentConsent(form);
      refresh();
                setStatus(
                  (qualityNote ? qualityNote + " " : "") +
                  (filled.length
                    ? "Filled " + filled.join(", ") + " from the photo. Check each one against your " + (slot.indexOf("license") === 0 ? "license" : "ID") + "."
                    : "Photo attached, but the details could not be read. Type them in below.") +
                  (unclear.length ? " Couldn't read clearly: " + unclear.join(", ") + " (highlighted). Please type these." : "") +
                  typeNote
                );
              }).catch(function (error) {
                pick.disabled = false;
                setStatus((error && error.message) || "Could not read this photo. Type the details in below.");
              });
            }
            read(file, function (err, dataUrl) {
              if (dataUrl) {
                afterAttached(dataUrl);
                return;
              }
              var fallback = new FileReader();
              fallback.onload = function () {
                afterAttached(String(fallback.result || ""));
              };
              fallback.onerror = function () {
                setStatus((err && err.message) || "Could not read that image.");
              };
              fallback.readAsDataURL(file);
            });
          }).catch(function () {
            setStatus("Could not check that photo. You can type the details in below, or try another picture.");
          });
        }

        fileInput.addEventListener("change", function () {
          var file = fileInput.files && fileInput.files[0];
          fileInput.value = "";
          readChosenFile(file);
        });
      });
    }

    function idsConflict(form) {
      var scans = form._scans || {};
      var licenseName = scans["license-front"] && scans["license-front"].fullName;
      var secondName = scans["self-id"] && scans["self-id"].fullName;
      if (form.id !== "self-form" || !licenseName || !secondName) return false;
      return !NS.validation.namesMatch(licenseName, secondName);
    }

    function nameMismatchOpen(form) {
      var scans = form._scans || {};
      var typed = form.fullName && form.fullName.value;
      if (!typed) return false;
      return Object.keys(scans).some(function (slot) {
        var name = scans[slot] && scans[slot].fullName;
        return name && !NS.validation.namesMatch(typed, name);
      });
    }

    function bookingGateErrors(form) {
      var errors = [];
      if (!form.agreeTerms || !form.agreeTerms.checked) {
        errors.push("Agree to the rental terms before continuing to payment.");
      }
      if (!form.privacyConsent || !form.privacyConsent.checked) {
        errors.push("Accept the Data Privacy notice before continuing to payment.");
      }
      if (idsConflict(form)) {
        errors.push(
          "The name on the driver’s license and the second ID do not match. Upload matching IDs or correct the details before continuing."
        );
      } else if (nameMismatchOpen(form) && !(form.mismatchAck && form.mismatchAck.checked)) {
        errors.push(
          "The ID name does not match what you typed. Correct the form, or tick that you reviewed the mismatch."
        );
      }
      return errors;
    }

    function syncSubmitGate(form) {
      var btn = form.querySelector('button[type="submit"]');
      if (!btn || btn.getAttribute("data-busy") === "1") return;
      var blocked = bookingGateErrors(form).length > 0;
      if (form.phone && form.phone.getAttribute("data-phone-blocked") === "1") blocked = true;
      btn.disabled = blocked;
    }

    function renderFlags(form) {
      var host = form.querySelector(".ocr-flags");
      var ack = form.querySelector(".mismatch-ack");
      if (!host) return;
      var messages = [];
      var mismatch = false;
      var scans = form._scans || {};
      var mode = form.id === "chauffeur-form" ? "chauffeur" : "self";
      Object.keys(scans).forEach(function (slot) {
        var data = scans[slot] || {};
        if (data.fullName && form.fullName && form.fullName.value && !NS.validation.namesMatch(form.fullName.value, data.fullName)) {
          mismatch = true;
          messages.push({ level: "warn", text: "Name on the " + slotLabel(slot) + " reads as “" + data.fullName + "”, which does not match what you typed." });
        }
      });
      if (idsConflict(form)) {
        mismatch = true;
        messages.push({
          level: "bad",
          text:
            "The driver’s license and the second ID show different names (“" +
            (scans["license-front"].fullName || "") +
            "” vs “" +
            (scans["self-id"].fullName || "") +
            "”). Fix this before continuing to payment."
        });
      }

      function expired(value, label) {
        if (!value) return;
        if (!NS.validation.futureDate(value) || (form.endDate.value && value < form.endDate.value)) {
          messages.push({ level: "bad", text: label + " is expired or expires before the return date." });
        }
      }
      if (mode === "self") {
        if (selfHandover(form) === "deliver" && form.dropoff && form.dropoff.value.trim().length < 5) {
          messages.push({ level: "bad", text: "Enter where to deliver the car." });
        }
        expired(form.license_expiry && form.license_expiry.value, "The driver's license");
        if (!form.dl_codes || !form.dl_codes.value.trim()) {
          messages.push({ level: "bad", text: "Enter the DL codes." });
        }
        if (!form.license_no || !form.license_no.value.trim()) {
          messages.push({ level: "bad", text: "Enter the license number." });
        }
        if (!form.license_expiry || !form.license_expiry.value) {
          messages.push({ level: "bad", text: "Enter the expiration date." });
        }
        if (form.license_no && form.license_no.value && !NS.validation.idNumberForType("Driver's License", form.license_no.value)) {
          messages.push({ level: "bad", text: "License number should look like N04-12-345678." });
        }
        if (form.dl_codes && form.dl_codes.value) {
          var fit = NS.validation.licenseFitsVehicle(form.dl_codes.value, form.dl_codes.value, selectedVehicle(form));
          if (!fit.ok) messages.push({ level: "bad", text: fit.message });
        }
        if (form.dl_codes && NS.validation.daylightBlocked(form.dl_codes.value, form.pickupTime.value, form.returnTime.value)) {
          messages.push({ level: "bad", text: "This license is limited to daylight driving (05:00–18:00)." });
        }
      } else {
        if (form.pickup && form.pickup.tagName !== "SELECT" && form.pickup.value.trim().length < 5) {
          messages.push({ level: "bad", text: "Enter a pickup location." });
        }
        if (form.dropoff && form.dropoff.tagName !== "SELECT" && form.dropoff.value.trim().length < 5) {
          messages.push({ level: "bad", text: "Enter a drop-off location." });
        }
        expired(form.idExpiry.value, "The government ID");
        if (!form.idType.value && form.idNumber.value) {
          messages.push({ level: "bad", text: "Choose which ID you have." });
        } else if (form.idNumber.value && !NS.validation.idNumberForType(form.idType.value, form.idNumber.value)) {
          messages.push({ level: "bad", text: "That ID number does not match the " + form.idType.value + " format (" + NS.validation.idNumberHint(form.idType.value) + ")." });
        }
      }

      if (ack) {
        /* Two conflicting IDs cannot be waved through with the mismatch checkbox. */
        var showAck = mismatch && !idsConflict(form);
        ack.hidden = !showAck;
        if (!showAck && form.mismatchAck) form.mismatchAck.checked = false;
      }
      host.hidden = messages.length === 0;
      host.innerHTML = messages.map(function (item) {
        return '<p class="' + (item.level === "bad" ? "ocr-flag-bad" : "ocr-flag-warn") + '">' + NS.security.escapeHtml(item.text) + "</p>";
      }).join("");
      syncSubmitGate(form);
    }

    function ocrValues(form, key) {
      var scans = form._scans || {};
      var values = [];
      Object.keys(scans).forEach(function (slot) {
        if (scans[slot] && scans[slot][key]) values.push(scans[slot][key]);
      });
      return values;
    }

    function bindSubmit(form) {
      var busy = false;
      if (form.phone && NS.ui.bindAccountPhone) {
        NS.ui.bindAccountPhone(form.phone, {
          button: form.querySelector('button[type="submit"]'),
          userId: NS.auth.current() && NS.auth.current().id,
          ownPhone: function () {
            var current = NS.auth.current();
            return current ? current.phone : "";
          }
        });
      }
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (busy) return;
        var mode = form.id === "chauffeur-form" ? "chauffeur" : "self";
        renderFlags(form);
        var gateErrors = bookingGateErrors(form);
        if (gateErrors.length) {
          showAlert(form, gateErrors[0], "err");
          syncSubmitGate(form);
          return;
        }
        var gate = NS.auth.assertActive ? NS.auth.assertActive() : Promise.resolve();
        gate.then(function () {
          return NS.ui.askYesNo("Save this booking and continue to payment?", { title: "Save booking", yes: "Continue", no: "Not yet" });
        }).then(function (ok) {
          if (ok === undefined) return;
        if (!ok) return;
          gateErrors = bookingGateErrors(form);
          if (gateErrors.length) {
            showAlert(form, gateErrors[0], "err");
            syncSubmitGate(form);
            return;
          }
          if (form.phone && form.phone.getAttribute("data-phone-blocked") === "1") {
            showAlert(form, "This mobile number is already registered.", "err");
            return;
          }
          var meNow = NS.auth.current();
          return NS.auth.ensurePhoneFree(form.phone.value, meNow && meNow.id).then(function () {
        busy = true;
        showAlert(form, "", "ok");
        var btn = form.querySelector('button[type="submit"]');
        if (btn) {
            btn.setAttribute("data-busy", "1");
          btn.disabled = true;
            btn.textContent = "Saving…";
        }
        function fail(err) {
          busy = false;
          if (btn) {
              btn.removeAttribute("data-busy");
              btn.textContent = btn.getAttribute("data-pay-ready") || "Continue to payment";
              syncSubmitGate(form);
          }
          if (NS.ui && NS.ui.bindCsrf) NS.ui.bindCsrf(form);
          showAlert(form, err.message || "Could not create booking.", "err");
        }
        try {
          if (NS.ui && NS.ui.bindCsrf) NS.ui.bindCsrf(form);
          var csrfInput = form.querySelector('input[name="csrf"]');
            var notes = "";
            if (mode === "chauffeur") {
              var itinerary = form.itinerary.value.trim();
              var requests = form.specialRequests.value.trim();
              notes = (itinerary ? "Itinerary: " + itinerary : "") + (requests ? (itinerary ? "\n" : "") + "Requests: " + requests : "");
            }
            var shared = {
              fullName: form.fullName.value,
              phone: form.phone.value,
              email: form.email.value,
              agreed: form.agreeTerms.checked,
              mismatchAck: !!(form.mismatchAck && form.mismatchAck.checked),
              ocrNames: ocrValues(form, "fullName")
            };
            var extras = {
              birthdate: form.birthdate ? form.birthdate.value : "",
              privacyConsent: !!(form.privacyConsent && form.privacyConsent.checked),
              parentName: form.parentName ? form.parentName.value : "",
              parentPhone: form.parentPhone ? form.parentPhone.value : "",
              parentIdPhoto: form.parentIdPhoto ? form.parentIdPhoto.value : "",
              parentConsent: !!(form.parentConsent && form.parentConsent.checked)
            };
            var driverInfo = mode === "chauffeur"
              ? Object.assign(shared, extras, {
                  idType: form.idType.value,
                  idNumber: form.idNumber.value,
                  idExpiry: form.idExpiry.value,
                  idIssue: form.idIssue.value,
                  idPhoto: form.idPhoto.value,
                  itinerary: form.itinerary.value
                })
              : Object.assign(shared, extras, {
                  address: form.address.value,
                  dl_codes: form.dl_codes.value,
                  license_no: form.license_no.value,
                  license_expiry: form.license_expiry.value,
                  licensePhoto: form.licensePhoto.value,
                  idType: form.idType ? form.idType.value : "",
                  idNumber: form.idNumber ? form.idNumber.value : "",
                  idExpiry: form.idExpiry ? form.idExpiry.value : "",
                  idIssue: form.idIssue ? form.idIssue.value : "",
                  idPhoto: form.idPhoto ? form.idPhoto.value : ""
                });
            var handover = mode === "self" ? selfHandover(form) : "";
            var booking = NS.domain.createBooking({
              vehicleId: form.vehicleId.value,
              startDate: form.startDate.value,
              endDate: form.endDate.value,
              pickupTime: form.pickupTime.value,
              returnTime: form.returnTime.value,
              numberOfPassengers: form.numberOfPassengers ? form.numberOfPassengers.value : 1,
              fuelBeforeRent: "Full",
              pickup: form.pickup.value,
              dropoff: form.dropoff.value,
              handover: handover,
              pickupPin: mode === "self" && handover === "pickup" ? null : NS.pickupMap ? NS.pickupMap.read(form) : null,
              dropoffPin: NS.pickupMap && NS.pickupMap.readDropoff ? NS.pickupMap.readDropoff(form) : null,
              driveMode: mode,
              driverInfo: driverInfo,
              addons: mode === "chauffeur" ? ["driver"] : [],
              notes: notes
            }, csrfInput ? csrfInput.value : "");
        } catch (err) {
          fail(err);
          return;
        }
          if (btn) btn.textContent = btn.getAttribute("data-pay-ready") || "Continue to payment";
        NS.domain.pushBookingToApi(booking.id).then(function () {
          showAlert(form, "Booking " + booking.ref + " created. Redirecting…", "ok");
          location.href = NS.routes.href("payment", "?id=" + encodeURIComponent(booking.id));
        }, fail);
      });
        }).catch(function (err) {
          showAlert(form, (err && err.message) || "Your account has been disabled. Please contact the admin.", "err");
        });
      });
    }

    function bindBookingWizard() {
      var search = document.getElementById("book-search");
      var cars = document.getElementById("book-cars");
      if (!search || !cars) return;
      var wizStart = document.getElementById("wiz-start");
      var wizEnd = document.getElementById("wiz-end");
      var wizPickupTime = document.getElementById("wiz-pickup-time");
      var wizReturnTime = document.getElementById("wiz-return-time");
      var carGrid = document.getElementById("book-car-grid");
      var carEmpty = document.getElementById("book-car-empty");
      var stepStatus = document.querySelector("[data-step-status]");
      var labelFor = {
        dates: "Dates",
        car: "Car",
        mode: "Drive type",
        id: "ID",
        consent: "Parent consent",
        review: "Review",
        payment: "Payment"
      };

      function stepperSteps() {
        return stepNames().concat(["payment"]);
      }
      var stepName = "dates";
      var mode = "";
      var chosenVehicle = vehicleId || "";

      function needsConsent() {
        var form = mode === "chauffeur" ? chauffeurForm : mode === "self" ? selfForm : null;
        if (!form || !form.birthdate || !form.birthdate.value) return false;
        var age = ageYears(form.birthdate.value);
        return age != null && age <= 17;
      }

      function stepNames() {
        return needsConsent()
          ? ["dates", "car", "mode", "id", "consent", "review"]
          : ["dates", "car", "mode", "id", "review"];
      }

      function occupantForChosen() {
        if (!chosenVehicle || !NS.domain.ongoingBookingForVehicle) return null;
        return NS.domain.ongoingBookingForVehicle(chosenVehicle);
      }

      function daysAhead(iso) {
        if (!iso) return 0;
        var start = new Date(iso + "T00:00:00");
        var now = new Date();
        now.setHours(0, 0, 0, 0);
        return Math.round((start - now) / 86400000);
      }

      function isReservation() {
        return daysAhead(wizStart && wizStart.value) >= 3;
      }

      function syncMirrors() {
        [selfForm, chauffeurForm].forEach(function (form) {
          if (wizStart && form.startDate) form.startDate.value = wizStart.value;
          if (wizEnd && form.endDate) {
            form.endDate.min = wizStart.value || localISO(today);
            form.endDate.value = wizEnd.value;
          }
          if (wizPickupTime && form.pickupTime) form.pickupTime.value = wizPickupTime.value;
          if (wizReturnTime && form.returnTime) form.returnTime.value = wizReturnTime.value;
          if (form.vehicleId && chosenVehicle) form.vehicleId.value = chosenVehicle;
        });
      }

      function paintReserveHint() {
        var hint = search.querySelector("[data-reserve-hint]");
        if (!hint) return;
        if (isReservation()) {
          hint.textContent = "Pickup is 3 or more days away. This will be a reservation. A downpayment is needed before staff can approve it.";
        } else {
          hint.textContent = "Pickup is soon. After review you continue to payment.";
        }
      }

      function paintPayLabels() {
        var reserve = isReservation();
        document.querySelectorAll("[data-pay-label]").forEach(function (btn) {
          var label = reserve ? "Pay downpayment" : "Continue to payment";
          btn.textContent = label;
          btn.setAttribute("data-pay-ready", label);
        });
        [selfForm, chauffeurForm].forEach(function (form) {
          var note = form.querySelector("[data-reserve-note]");
          if (!note) return;
          if (reserve) {
            note.hidden = false;
            note.textContent = "This is a reservation. Pay the downpayment next. Staff approve the booking only after that payment is recorded. You will also get a reservation confirmation email.";
          } else {
            note.hidden = true;
            note.textContent = "";
          }
        });
      }

      function paintInUseNote(form) {
        var note = form.querySelector("[data-in-use-note]");
        if (!note) return;
        var occupant = occupantForChosen();
        if (!occupant) {
          note.hidden = true;
          note.textContent = "";
          return;
        }
        note.hidden = false;
        note.textContent =
          "This car is currently on trip " +
          occupant.ref +
          ". Both you and the current renter must have a valid ID on file before staff can approve this booking.";
      }

      function paintReview(form) {
        var host = form.querySelector("[data-review]");
        if (!host) return;
        var v = selectedVehicle(form);
        var rows = [
          ["Car", v ? v.name : "Not chosen"],
          ["Drive type", form.id === "chauffeur-form" ? "With chauffeur" : "Self-drive"],
          ["Pickup", NS.ui.fmtDate(form.startDate.value) + " · " + (form.pickupTime.value || "")],
          ["Return", NS.ui.fmtDate(form.endDate.value) + " · " + (form.returnTime.value || "")],
          ["Pickup location", form.pickup ? form.pickup.value : ""],
          ["Drop-off / delivery", form.dropoff ? form.dropoff.value : ""],
          ["Name", form.fullName ? form.fullName.value : ""],
          ["ID", ((form.idType && form.idType.value) || "") + (form.idNumber && form.idNumber.value ? " · " + form.idNumber.value : "")]
        ];
        if (form.license_no && form.license_no.value) rows.push(["License", form.license_no.value]);
        if (needsConsent() && form.parentName && form.parentName.value) {
          rows.push(["Parent / guardian", form.parentName.value]);
        }
        host.innerHTML = "<ul class='booking-detail-list'>" + rows.filter(function (r) {
          return r[1];
        }).map(function (r) {
          return "<li><strong>" + NS.security.escapeHtml(r[0]) + ":</strong> <span>" + NS.security.escapeHtml(r[1]) + "</span></li>";
        }).join("") + "</ul>";
        paintInUseNote(form);
      }

      function paintCars() {
        syncMirrors();
        refillFleet();
        if (!carGrid) return;
        var list = vehicles.slice();
        carEmpty.hidden = list.length > 0;
        carGrid.innerHTML = list.map(function (v) {
          var selected = v.id === chosenVehicle;
          var occupant = NS.domain.ongoingBookingForVehicle ? NS.domain.ongoingBookingForVehicle(v.id) : null;
          var inUse = occupant
            ? "<p class='book-car-inuse'>In use now · both renters need a valid ID</p>"
            : "";
          return (
            '<button class="book-car-card' + (selected ? " is-selected" : "") + '" type="button" role="option" aria-selected="' +
            (selected ? "true" : "false") + '" data-pick-car="' + v.id + '">' +
            '<img src="' + NS.security.escapeHtml(v.image || FALLBACK_IMAGE) + '" alt="">' +
            "<div><p class='eyebrow'>" + NS.security.escapeHtml(v.type || "") + "</p>" +
            "<strong>" + NS.security.escapeHtml(v.name) + "</strong>" +
            "<p>" + NS.ui.peso(v.dailyRate) + "<span>/day</span></p>" +
            inUse +
            "</div></button>"
          );
        }).join("");
      }

      function showStep(next) {
        var names = stepNames();
        var idx;
        if (typeof next === "number") {
          idx = Math.max(0, Math.min(names.length - 1, next - 1));
        } else {
          idx = names.indexOf(next);
          if (idx < 0) idx = 0;
        }
        stepName = names[idx];
        var steps = stepperSteps();
        var step = steps.indexOf(stepName) + 1;
        var total = steps.length;
        if (stepStatus) stepStatus.textContent = "Step " + step + " of " + total + " · " + (labelFor[stepName] || "");
        var stepperOl = document.querySelector(".book-stepper ol");
        if (stepperOl) stepperOl.classList.toggle("is-with-consent", needsConsent());
        document.querySelectorAll("[data-step-name]").forEach(function (el) {
          var name = el.getAttribute("data-step-name");
          if (name === "consent") el.hidden = !needsConsent();
          if (name === "payment") el.hidden = false;
          var order = steps.indexOf(name);
          var span = el.querySelector("span");
          if (span && order >= 0) span.textContent = String(order + 1);
          el.classList.toggle("is-current", name === stepName);
          el.classList.toggle("is-done", order >= 0 && order < step - 1);
          el.classList.toggle("is-next", name === "payment" && stepName === "review");
        });
        search.hidden = stepName !== "dates";
        cars.hidden = stepName !== "car";
        typeStep.hidden = stepName !== "mode";
        var onForm = ["mode", "id", "consent", "review"].indexOf(stepName) !== -1;
        selfForm.hidden = !(mode === "self" && onForm);
        chauffeurForm.hidden = !(mode === "chauffeur" && onForm);
        if (stepName === "mode" && mode) typeStep.hidden = true;
        [selfForm, chauffeurForm].forEach(function (form) {
          if (form.hidden) return;
          form.querySelectorAll("[data-pane]").forEach(function (pane) {
            var name = pane.getAttribute("data-pane");
            pane.hidden = !(
              (stepName === "mode" && name === "trip") ||
              (stepName === "id" && name === "id") ||
              (stepName === "consent" && name === "consent") ||
              (stepName === "review" && name === "review")
            );
          });
          form.querySelectorAll("[data-id-next]").forEach(function (btn) {
            btn.textContent = needsConsent() ? "Continue to parent consent" : "Review booking";
          });
          if (stepName === "review") paintReview(form);
          if (stepName === "consent") syncParentConsent(form);
        });
        if (stepName === "car") paintCars();
        paintReserveHint();
        paintPayLabels();
        syncMirrors();
        refresh();
        var shown = !selfForm.hidden ? selfForm : !chauffeurForm.hidden ? chauffeurForm : stepName === "car" ? cars : search;
        var heading = shown && shown.querySelector("h1");
        if (heading && heading.focus) heading.focus();
        var maps = (shown && (shown._pickupMaps || (shown._pickupMap ? [shown._pickupMap] : []))) || [];
        if (maps.length) {
          setTimeout(function () {
            maps.forEach(function (map) {
              if (map && map.invalidateSize) map.invalidateSize();
            });
          }, 80);
        }
      }

      function canLeave(from) {
        if (from === "dates") {
          if (!wizStart.value || !wizEnd.value) {
            showAlert(search, "Choose a pickup and return date.", "err");
            return false;
          }
          if (wizEnd.value <= wizStart.value) {
            showAlert(search, "Return date must be after the pickup date.", "err");
            return false;
          }
          showAlert(search, "", "ok");
          return true;
        }
        if (from === "car") {
          if (!chosenVehicle) {
            if (carEmpty) carEmpty.hidden = false;
            NS.ui.toast("Choose a car to continue.", "err");
            return false;
          }
          return true;
        }
        if (from === "mode") {
          if (!mode) {
            showAlert(typeStep, "Choose self-drive or chauffeur.", "err");
            return false;
          }
          var tripForm = mode === "chauffeur" ? chauffeurForm : selfForm;
          if (mode === "chauffeur") {
            if (!tripForm.pickup.value || tripForm.pickup.value.length < 5) {
              showAlert(tripForm, "Enter a pickup location.", "err");
              return false;
            }
            if (!tripForm.dropoff.value || tripForm.dropoff.value.length < 5) {
              showAlert(tripForm, "Enter a drop-off location.", "err");
              return false;
            }
            if (!tripForm.itinerary.value.trim()) {
              showAlert(tripForm, "Enter the itinerary or destination.", "err");
              return false;
            }
          } else if (selfHandover(tripForm) === "deliver" && (!tripForm.dropoff.value || tripForm.dropoff.value.length < 5)) {
            showAlert(tripForm, "Enter the delivery address.", "err");
            return false;
          }
          showAlert(tripForm, "", "ok");
          return true;
        }
        if (from === "id") {
          var idForm = mode === "chauffeur" ? chauffeurForm : selfForm;
          if (!idForm.birthdate || !idForm.birthdate.value) {
            showAlert(idForm, "Enter your birth date so we can check if parent consent is needed.", "err");
            return false;
          }
          if (mode === "self") {
            if (!idForm.licensePhoto || !idForm.licensePhoto.value) {
              showAlert(idForm, "Upload a photo of your driver’s license.", "err");
              return false;
            }
            if (!idForm.license_no.value || !idForm.license_expiry.value || !idForm.dl_codes.value) {
              showAlert(idForm, "Fill in the license number, expiry, and DL codes.", "err");
              return false;
            }
          }
          if (!idForm.idType || !idForm.idType.value) {
            showAlert(idForm, "Choose which ID you are uploading.", "err");
            return false;
          }
          if (!idForm.idPhoto || !idForm.idPhoto.value) {
            showAlert(idForm, "Upload a photo of that ID.", "err");
            return false;
          }
          if (!idForm.idNumber || !idForm.idNumber.value) {
            showAlert(idForm, "Enter the ID number, or wait for the scan to fill it.", "err");
            return false;
          }
          var gate = bookingGateErrors(idForm);
          var idOnly = gate.filter(function (msg) {
            return !/terms|privacy|Agree/i.test(msg);
          });
          if (idOnly.length) {
            showAlert(idForm, idOnly[0], "err");
            return false;
          }
          showAlert(idForm, "", "ok");
          return true;
        }
        if (from === "consent") {
          var consentForm = mode === "chauffeur" ? chauffeurForm : selfForm;
          if (!consentForm.parentName || !consentForm.parentName.value.trim()) {
            showAlert(consentForm, "Enter the parent or guardian name.", "err");
            return false;
          }
          if (!consentForm.parentPhone || !NS.validation.phMobile(consentForm.parentPhone.value)) {
            showAlert(consentForm, "Enter the parent or guardian mobile number (09XXXXXXXXX).", "err");
            return false;
          }
          if (!consentForm.parentIdPhoto || !consentForm.parentIdPhoto.value) {
            showAlert(consentForm, "Upload a valid ID of the parent or guardian.", "err");
            return false;
          }
          if (!consentForm.parentConsent || !consentForm.parentConsent.checked) {
            showAlert(consentForm, "The parent or guardian must tick the consent box.", "err");
            return false;
          }
          showAlert(consentForm, "", "ok");
          return true;
        }
        return true;
      }

      if (wizStart) {
        wizStart.min = localISO(today);
        wizStart.value = qStart || localISO(startDefault);
        wizEnd.min = wizStart.value;
        wizEnd.value = qEnd || localISO(endDefault);
      }
      [wizStart, wizEnd, wizPickupTime, wizReturnTime].forEach(function (el) {
        if (!el) return;
        el.addEventListener("change", function () {
          if (el === wizStart && wizEnd) wizEnd.min = wizStart.value;
          syncMirrors();
          paintReserveHint();
          paintPayLabels();
          if (stepName === "car") paintCars();
          else refresh();
        });
      });
      if (carGrid) {
        carGrid.addEventListener("click", function (e) {
          var btn = e.target.closest("[data-pick-car]");
          if (!btn) return;
          chosenVehicle = btn.getAttribute("data-pick-car");
          vehicleId = chosenVehicle;
          syncMirrors();
          paintCars();
          refresh();
        });
      }
      flow.addEventListener("click", function (e) {
        if (e.target.closest("[data-wizard-next]")) {
          if (!canLeave(stepName)) return;
          var names = stepNames();
          var i = names.indexOf(stepName);
          showStep(names[Math.min(names.length - 1, i + 1)]);
        } else if (e.target.closest("[data-wizard-back]")) {
          if (stepName === "mode" && mode) {
            mode = "";
            showStep("mode");
            return;
          }
          var backNames = stepNames();
          var backI = backNames.indexOf(stepName);
          showStep(backNames[Math.max(0, backI - 1)]);
        }
      });
      typeStep.querySelectorAll("[data-rental]").forEach(function (card) {
        card.addEventListener("click", function () {
          mode = card.getAttribute("data-rental") || "";
          var form = mode === "chauffeur" ? chauffeurForm : selfForm;
          syncMirrors();
          applyDefaults(form);
          snapshot(form);
          showStep("mode");
        });
      });
      [selfForm, chauffeurForm].forEach(function (form) {
        var back = form.querySelector("[data-change-type]");
        if (!back) return;
        back.onclick = function (e) {
          e.preventDefault();
          e.stopPropagation();
          mode = "";
          showStep("mode");
        };
      });

      /* Always open on Dates. A pre-picked car from Fleet is kept for step 2,
         but Drive type is never the first screen — the renter must set dates first. */
      if (vehicleId) chosenVehicle = vehicleId;
      syncMirrors();
      showStep("dates");
      NS.pages.bookWizard = {
        go: showStep,
        sync: syncMirrors,
        refreshCars: paintCars,
        currentStep: function () {
          var names = stepNames();
          var i = names.indexOf(stepName);
          return i < 0 ? 1 : i + 1;
        },
        chosenVehicle: function () { return chosenVehicle || ""; }
      };
    }

    bindBookingWizard();
    refillFleet();
  }

  function bookableVehicles(start, end) {
    return NS.domain.vehicles().filter(function (v) {
      if (String(v.status || "").toLowerCase() !== "available" || !(Number(v.dailyRate) > 0)) return false;
      if (start && end && NS.domain.isAvailable) return NS.domain.isAvailable(v.id, start, end);
      return true;
    });
  }

  function openRentalType(mode) {
    var typeStep = document.getElementById("rental-type");
    var selfForm = document.getElementById("self-form");
    var chauffeurForm = document.getElementById("chauffeur-form");
    if (!typeStep || !selfForm || !chauffeurForm) return;
    typeStep.querySelectorAll("[data-rental]").forEach(function (card) { card.disabled = false; });
    typeStep.hidden = true;
    selfForm.hidden = mode !== "self";
    chauffeurForm.hidden = mode !== "chauffeur";
    var shown = mode === "chauffeur" ? chauffeurForm : selfForm;
    var maps = shown._pickupMaps || (shown._pickupMap ? [shown._pickupMap] : []);
    if (maps.length) {
      setTimeout(function () {
        maps.forEach(function (map) {
          if (map && map.invalidateSize) map.invalidateSize();
        });
      }, 80);
    }
  }

  function bindRentalChoice() {
    /* The 5-step wizard owns drive-type clicks so this page does not jump past Dates and Car. */
  }


  NS.pages.bookings = function myBookings() {
    var host = document.getElementById("bookings-list");
    if (!host) return;
    var me = NS.auth.current();
    function render() {
      var list = NS.domain.myBookings();
      host.innerHTML = list.length
        ? list
            .map(function (b) {
              var v = NS.domain.getVehicle(b.vehicleId);
              var canReturn =
                me &&
                me.role === "customer" &&
                (b.status === "confirmed" || b.status === "ongoing");
              var detailHref = NS.routes.href("bookingDetail", "?id=" + encodeURIComponent(b.id));
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
              var ratedNote =
                b.rating || NS.domain.getRatingForBooking(b.id)
                  ? "<p class='fineprint'>You rated this car</p>"
                  : "";
              var actions = "";
              if (canRate) {
                actions +=
                  '<a class="btn btn-ghost btn-sm" href="' + detailHref + '">Rate car</a>';
              }
              if (canReturn) {
                actions +=
                  '<a class="btn btn-ghost btn-sm" href="' + detailHref + '">Open</a>' +
                  '<button class="btn btn-pay btn-sm" type="button" data-return="' +
                  b.id +
                  '">Return vehicle</button>';
              } else {
                actions +=
                  '<a class="btn btn-pay btn-sm" href="' + detailHref + '">Open</a>';
              }
              return (
                '<article class="booking-card my-booking-card"><div><p class="eyebrow">' +
                NS.security.escapeHtml(b.ref) +
                "</p><h3>" +
                NS.security.escapeHtml(v ? v.name : "Vehicle") +
                "</h3><p class='fineprint booking-meta'>" +
                NS.security.escapeHtml(NS.domain.bookingQueueText(b)) +
                "</p><p class='booking-dates'>" +
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
                actions +
                "</div></div></article>"
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
            var updated = NS.domain.requestVehicleReturn(id, "", NS.security.getCsrf());
            var push = updated && updated._statusPush;
            Promise.resolve(push).then(function (saved) {
              if (updated.apiId == null) {
                NS.ui.toast("Return saved here, but this booking is not on the server. Staff may not see it.", "err");
              } else if (saved === null) {
                NS.ui.toast("Return saved here, but the server did not get it. Ask staff to refresh after the desk syncs.", "err");
              } else {
                NS.ui.toast("Return request sent. Staff will see it in Inbox and Bookings.", "ok");
              }
            render();
            });
          } catch (err) {
            NS.ui.toast(err.message, "err");
          }
        });
    });
    render();
  };

  function askCancelReason() {
    return new Promise(function (resolve) {
      var old = document.getElementById("cancel-reason-modal");
      if (old) old.remove();
      var modal = document.createElement("div");
      modal.id = "cancel-reason-modal";
      modal.className = "password-modal";
      modal.innerHTML =
        '<article class="password-dialog" role="dialog" aria-modal="true" aria-labelledby="cancel-reason-title">' +
        '<div class="password-dialog-head"><h2 id="cancel-reason-title">Cancel this booking</h2></div>' +
        "<p>This booking is still pending. Choose why you are cancelling it.</p>" +
        '<label class="field">Reason<select class="form-select" name="reason">' +
        '<option value="">Choose a reason</option>' +
        "<option>Change of plans</option>" +
        "<option>Booked the wrong dates</option>" +
        "<option>Found another car</option>" +
        "<option>Other</option>" +
        "</select></label>" +
        '<label class="field" data-other hidden>Your reason<textarea class="form-control" name="note" maxlength="240"></textarea></label>' +
        '<p class="field-error" data-error hidden></p>' +
        '<div class="card-actions"><button class="btn btn-ghost" type="button" data-close>Keep booking</button>' +
        '<button class="btn btn-gold" type="button" data-confirm>Cancel booking</button></div></article>';
      document.body.appendChild(modal);
      var reason = modal.querySelector('[name="reason"]');
      var note = modal.querySelector('[name="note"]');
      var other = modal.querySelector("[data-other]");
      var error = modal.querySelector("[data-error]");
      function close(value) {
        modal.remove();
        resolve(value);
      }
      reason.addEventListener("change", function () {
        other.hidden = reason.value !== "Other";
        error.hidden = true;
      });
      modal.querySelector("[data-close]").addEventListener("click", function () { close(null); });
      modal.addEventListener("click", function (e) { if (e.target === modal) close(null); });
      modal.querySelector("[data-confirm]").addEventListener("click", function () {
        if (!reason.value) {
          error.hidden = false;
          error.textContent = "Choose a reason.";
          return;
        }
        if (reason.value === "Other" && !note.value.trim()) {
          error.hidden = false;
          error.textContent = "Type your reason when you choose Other.";
          return;
        }
        close({ reason: reason.value, note: note.value.trim() });
      });
    });
  }

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
      me &&
      me.role === "customer" &&
      booking.userId === me.id &&
      booking.status === "pending"
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
    var canSeeIds = !!(me && (me.role === "admin" || me.role === "staff"));
    var driveModeLabel = booking.driveMode === "chauffeur" ? "Chauffeur" : "Self-drive";
    var driverRows =
      booking.driveMode === "chauffeur"
        ? "<div><dt>Valid ID</dt><dd>" +
          NS.security.escapeHtml((info.idType || "ID") + " · " + (info.idNumber || "—")) +
          "</dd></div>"
        : "<div><dt>DL codes</dt><dd>" +
          NS.security.escapeHtml(info.dl_codes || info.licenseClass || "—") +
          "</dd></div>" +
          "<div><dt>License No.</dt><dd>" +
          NS.security.escapeHtml(info.license_no || info.licenseNo || "—") +
          "</dd></div>" +
          "<div><dt>Expiration Date</dt><dd>" +
          NS.security.escapeHtml(info.license_expiry || info.licenseExpiry || "—") +
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
      "<p class='fineprint'>" +
      NS.security.escapeHtml(NS.domain.bookingQueueText(booking)) +
      "</p>" +
      NS.ui.statusBadge(booking.status) +
      " " +
      NS.ui.statusBadge(booking.paymentStatus) +
      (booking.status === "cancelled" && booking.cancelReason
        ? "<p class='fineprint'>Cancelled" +
          (booking.cancelledAt ? " " + NS.security.escapeHtml(String(booking.cancelledAt).replace("T", " ").slice(0, 16)) : "") +
          ": " +
          NS.security.escapeHtml(booking.cancelReason) +
          "</p>"
        : "") +
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
      "<div><dt>" +
      (booking.driveMode === "chauffeur"
        ? "Drop-off"
        : NS.domain.isSelfDeliver && NS.domain.isSelfDeliver(booking)
          ? "Deliver to"
          : "Return") +
      "</dt><dd>" +
      NS.security.escapeHtml(booking.dropoff) +
      (booking.returnTime ? " · " + NS.security.escapeHtml(booking.returnTime) : "") +
      ((booking.pickupPin && booking.pickupPin.lat != null) || (booking.dropoffPin && booking.dropoffPin.lat != null)
        ? "<div id=\"booking-trip-map\" class=\"pickup-map\"></div><p class=\"fineprint\">Blue pin is pick-up. Red pin is drop-off.</p>"
        : "") +
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
              (booking.payment.authCode ? " · " + booking.payment.authCode : "")
          ) +
          (function () {
            var shot = NS.domain.cashlessReceipt ? NS.domain.cashlessReceipt(booking) : "";
            return shot
              ? '<div class="license-photo-view"><p class="eyebrow">GCash / cashless receipt</p><img src="' +
                String(shot).replace(/"/g, "") +
                '" alt="GCash or cashless receipt"></div>'
              : "";
          })()
        : "Unpaid") +
      "</dd></div>" +
      "</dl>" +
      (info.licenseAddress
        ? "<p>License address: " + NS.security.escapeHtml(info.licenseAddress) + "</p>"
        : "") +
      (canSeeIds && info.licensePhoto
        ? '<div class="license-photo-view"><p class="eyebrow">Driver’s license, front</p><img src="' +
          String(info.licensePhoto).replace(/"/g, "") +
          '" alt="Driver license front"></div>'
        : canSeeIds && booking.driveMode !== "chauffeur"
          ? "<p class='notice'>No license photo on file for this booking.</p>"
          : "") +
      (canSeeIds && info.licenseBack
        ? '<div class="license-photo-view"><p class="eyebrow">Driver’s license, back</p><img src="' +
          String(info.licenseBack).replace(/"/g, "") +
          '" alt="Driver license back"></div>'
        : "") +
      (canSeeIds && info.govIdPhoto
        ? '<div class="license-photo-view"><p class="eyebrow">Government ID</p><img src="' +
          String(info.govIdPhoto).replace(/"/g, "") +
          '" alt="Government ID"></div>'
        : "") +
      (canSeeIds && info.idPhoto
        ? '<div class="license-photo-view"><p class="eyebrow">Government ID</p><img src="' +
          String(info.idPhoto).replace(/"/g, "") +
          '" alt="Government ID"></div>'
        : "") +
      (canSeeIds && info.parentIdPhoto
        ? '<div class="license-photo-view"><p class="eyebrow">Parent or guardian ID</p><img src="' +
          String(info.parentIdPhoto).replace(/"/g, "") +
          '" alt="Parent ID"></div>'
        : "") +
      (info.selfie
        ? '<div class="license-photo-view"><p class="eyebrow">Live photo</p><img src="' +
          String(info.selfie).replace(/"/g, "") +
          '" alt="Renter photo"></div>'
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
      '<button class="btn btn-ghost" type="button" onclick="window.print()">Print receipt</button></div></div>';

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

    var returnVehicleBtn = document.getElementById("return-vehicle-btn");
    if (returnVehicleBtn) {
      returnVehicleBtn.addEventListener("click", function () {
        NS.ui
          .askYesNo("Return this vehicle to the desk now?", { title: "Return vehicle", yes: "Yes", no: "No" })
          .then(function (ok) {
            if (!ok) return;
            try {
              var updated = NS.domain.requestVehicleReturn(booking.id, "", NS.security.getCsrf());
              var push = updated && updated._statusPush;
              Promise.resolve(push).then(function (saved) {
                if (updated.apiId == null) {
                  NS.ui.toast("Return saved here, but this booking is not on the server. Staff may not see it.", "err");
                } else if (saved === null) {
                  NS.ui.toast("Return saved here, but the server did not get it. Try again or ask the desk.", "err");
                } else {
                  NS.ui.toast("Return request sent. Staff will see it in Inbox and Bookings.", "ok");
                }
              location.reload();
              });
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

    if (NS.pickupMap && NS.pickupMap.showTrip) {
      NS.pickupMap.showTrip("booking-trip-map", booking.pickupPin, booking.dropoffPin);
    } else if (booking.pickupPin && NS.pickupMap) {
      NS.pickupMap.show("booking-trip-map", booking.pickupPin);
    }
    var cancelBtn = document.getElementById("cancel-booking");
    if (cancelBtn) {
      cancelBtn.addEventListener("click", function () {
        askCancelReason().then(function (choice) {
          if (!choice) return;
          NS.domain.cancelBooking(booking.id, choice.reason, choice.note, NS.security.getCsrf()).then(function () {
            NS.ui.toast("Booking cancelled.", "ok");
            NS.pages.detail();
          }, function (err) {
            NS.ui.toast(err.message, "err");
          });
        });
      });
    }
  };
})(window);
