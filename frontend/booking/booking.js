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
    box.style.borderColor = type === "ok" ? "rgba(196, 80, 75,0.35)" : "rgba(155,28,28,0.45)";
    box.style.color = type === "ok" ? "#a63f3b" : "#9b1c1c";
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
    if (!document.getElementById("rental-type")) return;
    bindRentalChoice();
    requirePhone(function () {
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
      '<input class="form-control" name="phone" type="tel" inputmode="numeric" autocomplete="tel" placeholder="09XXXXXXXXX" maxlength="13" required></label>' +
      '<button class="btn btn-gold" type="submit">Continue to booking</button>';
    flow.parentNode.insertBefore(gate, flow);
    gate.addEventListener("submit", function (e) {
      e.preventDefault();
      var notice = gate.querySelector(".notice");
      try {
        NS.auth.setPhone(gate.phone.value);
      } catch (err) {
        notice.hidden = false;
        notice.textContent = err.message;
        gate.phone.focus();
        return;
      }
      gate.remove();
      flow.hidden = false;
      next();
    });
  }

  var OCR_FILL = {
    "license-front": {
      fullName: "fullName",
      idNumber: "licenseNo",
      expiry: "licenseExpiry",
      issueDate: "licenseIssue",
      address: "address",
      birthdate: "birthdate",
      licenseClass: "licenseClass",
      restrictions: "restrictions"
    },
    "license-back": {
      licenseClass: "licenseClass",
      restrictions: "restrictions",
      address: "address"
    },
    "chauffeur-id": {
      fullName: "fullName",
      idNumber: "idNumber",
      expiry: "idExpiry",
      issueDate: "idIssue",
      birthdate: "birthdate",
      idType: "idType"
    }
  };

  var FIELD_LABEL = {
    fullName: "name",
    licenseNo: "license number",
    licenseExpiry: "license expiry",
    licenseIssue: "license issue date",
    address: "address",
    birthdate: "birthdate",
    licenseClass: "license class",
    restrictions: "restrictions",
    idNumber: "ID number",
    idExpiry: "ID expiry",
    idIssue: "ID issue date",
    idType: "ID type"
  };

  function slotLabel(slot) {
    if (slot === "chauffeur-id") return "ID";
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
    NS.pages.refreshBookFleet = refillFleet;

    var today = new Date();
    var startDefault = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    var endDefault = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 4);
    var qStart = NS.ui.qs("start");
    var qEnd = NS.ui.qs("end");
    var qPickup = NS.ui.qs("pickup");

    function vehicleOptions(selected) {
      return vehicles.map(function (v) {
        return (
          '<option value="' + v.id + '"' + (v.id === selected ? " selected" : "") + ">" +
          NS.security.escapeHtml(v.name) + " — " + NS.ui.peso(v.dailyRate) + "/day</option>"
        );
      }).join("");
    }

    function applyDefaults(form) {
      var selectedVehicle = form.vehicleId.value || vehicleId;
      form.vehicleId.innerHTML = vehicleOptions(selectedVehicle);
      form.startDate.min = localISO(today);
      form.startDate.value = form.startDate.value || qStart || localISO(startDefault);
      form.endDate.min = form.startDate.value;
      form.endDate.value = form.endDate.value || qEnd || localISO(endDefault);
      if (!form.pickup.value) form.pickup.innerHTML = locationOptions(qPickup || "Laguindingan Airport (CGY)");
      else if (!form.pickup.options.length) form.pickup.innerHTML = locationOptions(qPickup || "Laguindingan Airport (CGY)");
      if (!form.dropoff.options.length) form.dropoff.innerHTML = locationOptions("Centrio Mall");
      var me = NS.auth.current() || {};
      if (form.fullName && !form.fullName.value) {
        form.fullName.value = ((me.firstName || "") + " " + (me.lastName || "")).trim();
      }
      if (form.phone && !form.phone.value) form.phone.value = me.phone || "";
      if (form.email && !form.email.value) form.email.value = me.email || "";
      if (form.address && !form.address.value) form.address.value = me.address || "";
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
      if (NS.pickupMap) NS.pickupMap.mount(form);
      bindUploads(form);
      bindSubmit(form);
      form.addEventListener("input", function (e) {
        if (e.target && e.target.name) e.target.dataset.userEdited = "1";
        if (e.target && e.target.classList) {
          e.target.classList.remove("is-low-confidence");
          var chip = e.target.parentNode && e.target.parentNode.querySelector(".ocr-confidence");
          if (chip && (e.target.classList.contains("form-control") || e.target.classList.contains("form-select"))) {
            chip.hidden = true;
          }
        }
        renderFlags(form);
        refresh();
      });
      form.addEventListener("change", function (e) {
        if (form.startDate && form.endDate) form.endDate.min = form.startDate.value || localISO(today);
        if (form.id === "chauffeur-form") syncChauffeurIdChoice(form);
        renderFlags(form);
        if (e.target && (e.target.name === "startDate" || e.target.name === "endDate")) refillFleet();
        else refresh();
      });
      var back = form.querySelector("[data-change-type]");
      if (back) {
        back.addEventListener("click", function () {
          var go = function () {
            resetForm(form);
            selfForm.hidden = true;
            chauffeurForm.hidden = true;
            typeStep.hidden = false;
            refresh();
          };
          if (serialize(form) === form._snapshot) {
            go();
            return;
          }
          NS.ui.askYesNo("Changing the rental type resets what you already entered on this form.", {
            title: "Change rental type",
            yes: "Reset and go back",
            no: "Stay"
          }).then(function (ok) { if (ok) go(); });
        });
      }
    });

    typeStep.querySelectorAll("[data-rental]").forEach(function (card) {
      card.addEventListener("click", function () {
        var mode = card.getAttribute("data-rental");
        var form = mode === "chauffeur" ? chauffeurForm : selfForm;
        typeStep.hidden = true;
        selfForm.hidden = mode !== "self";
        chauffeurForm.hidden = mode !== "chauffeur";
        applyDefaults(form);
        snapshot(form);
        renderFlags(form);
        refresh();
        var heading = form.querySelector("h1");
        if (heading && heading.focus) heading.focus();
      });
    });

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

    function refresh() {
      var body = document.getElementById("book-summary-body");
      if (!body) return;
      var form = activeForm();
      if (!form) {
        renderPhoto(null);
        body.innerHTML = "<h3>Trip estimate</h3><p class='notice'>Choose self-drive or chauffeur to see the total.</p>";
        return;
      }
      var mode = form.id === "chauffeur-form" ? "chauffeur" : "self";
      var vehicle = selectedVehicle(form);
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
          /* Radio group (ID type): only choose for the renter if they haven't picked one. */
          if (!input.value && Array.prototype.some.call(input, function (r) { return r.value === value; })) {
            input.value = value;
            filled.push(FIELD_LABEL[inputName] || inputName);
            syncChauffeurIdChoice(form);
          }
          return;
        }
        if (input.tagName === "SELECT" && !Array.prototype.some.call(input.options, function (opt) { return opt.value === value; })) return;
        var score = data.confidence ? Number(data.confidence[ocrKey]) || 0 : 0;
        /* Prefilled profile values give way to the license; anything the renter typed stays. */
        if (input.dataset.userEdited !== "1" || !String(input.value || "").trim()) {
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

        function setStatus(msg) { if (status) status.textContent = msg || ""; }
        function setPhoto(dataUrl) {
          if (hidden) hidden.value = dataUrl || "";
          if (!preview) return;
          if (dataUrl) {
            preview.classList.remove("is-empty");
            preview.innerHTML = '<img src="' + String(dataUrl).replace(/"/g, "") + '" alt="">';
          } else {
            preview.classList.add("is-empty");
            preview.textContent = "No photo yet";
          }
          if (clearBtn) clearBtn.hidden = !dataUrl;
        }

        pick.addEventListener("click", function () { fileInput.click(); });
        if (clearBtn) {
          clearBtn.addEventListener("click", function () {
            setPhoto("");
            if (form._scans) delete form._scans[slot];
            setStatus("");
            renderFlags(form);
          });
        }
        fileInput.addEventListener("change", function () {
          var file = fileInput.files && fileInput.files[0];
          fileInput.value = "";
          if (!file) return;
          setStatus("Checking the photo…");
          var check = NS.ocr && NS.ocr.assessQuality
            ? NS.ocr.assessQuality(file, { profile: kind === "selfie" ? "selfie" : "document" })
            : Promise.resolve({ ok: true, issues: [] });
          check.then(function (result) {
            if (!result.ok) {
              setPhoto("");
              setStatus(result.issues.map(function (issue) { return issue.message; }).join(" "));
              return;
            }
            var read = slot === "license-front" ? NS.ui.readLicensePhoto : NS.ui.readIdPhoto;
            read(file, function (err, dataUrl) {
              if (err) {
                setStatus(err.message || "Could not read that image.");
                return;
              }
              setPhoto(dataUrl);
              if (kind === "selfie") {
                setStatus("Photo attached. It is kept with this booking and is not printed on the receipt.");
                return;
              }
              if (!NS.ocr || !NS.ocr.scan) {
                setStatus("Photo attached. Automatic reading is unavailable, so type the details below.");
                return;
              }
              setStatus("Reading the ID… this can take a few seconds.");
              pick.disabled = true;
              var picked = slot === "chauffeur-id" && form.idType ? form.idType.value : slot.indexOf("license") === 0 ? "Driver's License" : "";
              /* Read the original file: the stored copy is shrunk and recompressed, which blurs small digits. */
              NS.ocr.scan(file, function (progress, attempt) {
                setStatus((attempt ? "Photo looks turned, trying another angle… " : "Reading the ID… ") + Math.round((Number(progress) || 0) * 100) + "%");
              }, { idType: picked }).then(function (data) {
                pick.disabled = false;
                var filled = applyExtracted(form, slot, data);
                var unclear = unclearLabels(slot, data);
                var chosen = slot === "chauffeur-id" && form.idType ? form.idType.value : "";
                var typeNote = chosen && data.idType && data.idType !== chosen
                  ? " This looks like a " + data.idType + ", but you chose " + chosen + ". Please pick the right ID type."
                  : "";
                renderFlags(form);
                refresh();
                setStatus(
                  (filled.length
                    ? "Filled " + filled.join(", ") + " from the photo. Check each one against your " + (slot === "chauffeur-id" ? "ID" : "license") + "."
                    : "Photo attached, but the details could not be read. Type them in below.") +
                  (unclear.length ? " Couldn't read clearly: " + unclear.join(", ") + " (highlighted). Please type these." : "") +
                  typeNote
                );
              }).catch(function (error) {
                pick.disabled = false;
                setStatus((error && error.message) || "Could not read this photo. Type the details in below.");
              });
            });
          }).catch(function () {
            setStatus("Could not check that photo. You can type the details in below, or try another picture.");
          });
        });
      });
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
        if (data.birthdate && form.birthdate && form.birthdate.value && !NS.validation.datesMatch(form.birthdate.value, data.birthdate)) {
          mismatch = true;
          messages.push({ level: "warn", text: "Birthdate on the " + slotLabel(slot) + " reads as " + data.birthdate + ", which does not match what you typed." });
        }
      });

      function expired(value, label) {
        if (!value) return;
        if (!NS.validation.futureDate(value) || (form.endDate.value && value < form.endDate.value)) {
          messages.push({ level: "bad", text: label + " is expired or expires before the return date." });
        }
      }
      if (mode === "self") {
        expired(form.licenseExpiry.value, "The driver's license");
        if (form.birthdate.value) {
          var driveAge = NS.validation.ageOn(form.birthdate.value);
          if (driveAge >= 0 && driveAge < 21) messages.push({ level: "bad", text: "Self-drive renters must be at least 21." });
        }
        if (form.licenseNo.value && !NS.validation.idNumberForType("Driver's License", form.licenseNo.value)) {
          messages.push({ level: "bad", text: "License number should look like N04-12-345678." });
        }
        if (form.licenseClass.value) {
          var fit = NS.validation.licenseFitsVehicle(form.licenseClass.value, form.restrictions.value, selectedVehicle(form));
          if (!fit.ok) messages.push({ level: "bad", text: fit.message });
        }
        if (NS.validation.daylightBlocked(form.restrictions.value, form.pickupTime.value, form.returnTime.value)) {
          messages.push({ level: "bad", text: "This license is limited to daylight driving (05:00–18:00)." });
        }
      } else {
        expired(form.idExpiry.value, "The government ID");
        if (form.birthdate.value) {
          var age = NS.validation.ageOn(form.birthdate.value);
          if (age >= 0 && age < 18) messages.push({ level: "bad", text: "You must be at least 18 to book." });
        }
        if (!form.idType.value && form.idNumber.value) {
          messages.push({ level: "bad", text: "Choose which ID you have." });
        } else if (form.idNumber.value && !NS.validation.idNumberForType(form.idType.value, form.idNumber.value)) {
          messages.push({ level: "bad", text: "That ID number does not match the " + form.idType.value + " format (" + NS.validation.idNumberHint(form.idType.value) + ")." });
        }
      }

      if (ack) {
        ack.hidden = !mismatch;
        if (!mismatch && form.mismatchAck) form.mismatchAck.checked = false;
      }
      host.hidden = messages.length === 0;
      host.innerHTML = messages.map(function (item) {
        return '<p class="' + (item.level === "bad" ? "ocr-flag-bad" : "ocr-flag-warn") + '">' + NS.security.escapeHtml(item.text) + "</p>";
      }).join("");
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
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        if (busy) return;
        var mode = form.id === "chauffeur-form" ? "chauffeur" : "self";
        var gate = NS.auth.assertActive ? NS.auth.assertActive() : Promise.resolve();
        gate.then(function () {
          return NS.ui.askYesNo("Save this booking and continue to payment?", { title: "Save booking", yes: "Continue", no: "Not yet" });
        }).then(function (ok) {
          if (ok === undefined) return;
          if (!ok) return;
          busy = true;
          showAlert(form, "", "ok");
          var btn = form.querySelector('button[type="submit"]');
          if (btn) {
            btn.disabled = true;
            btn.textContent = "Creating booking…";
          }
          function fail(err) {
            busy = false;
            if (btn) {
              btn.disabled = false;
              btn.textContent = "Continue to payment";
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
              birthdate: form.birthdate.value,
              agreed: form.agreeTerms.checked,
              mismatchAck: !!(form.mismatchAck && form.mismatchAck.checked),
              ocrNames: ocrValues(form, "fullName"),
              ocrBirthdates: ocrValues(form, "birthdate")
            };
            var driverInfo = mode === "chauffeur"
              ? Object.assign(shared, {
                  idType: form.idType.value,
                  idNumber: form.idNumber.value,
                  idExpiry: form.idExpiry.value,
                  idIssue: form.idIssue.value,
                  idPhoto: form.idPhoto.value,
                  itinerary: form.itinerary.value
                })
              : Object.assign(shared, {
                  address: form.address.value,
                  licenseNo: form.licenseNo.value,
                  licenseExpiry: form.licenseExpiry.value,
                  licenseIssue: form.licenseIssue.value,
                  licenseClass: form.licenseClass.value,
                  restrictions: form.restrictions.value,
                  licensePhoto: form.licensePhoto.value,
                  licenseBack: form.licenseBack.value,
                  selfie: form.selfie.value
                });
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
              pickupPin: NS.pickupMap ? NS.pickupMap.read(form) : null,
              driveMode: mode,
              driverInfo: driverInfo,
              addons: mode === "chauffeur" ? ["driver"] : [],
              notes: notes
            }, csrfInput ? csrfInput.value : "");
          } catch (err) {
            fail(err);
            return;
          }
          if (btn) btn.textContent = "Saving to server…";
          NS.domain.pushBookingToApi(booking.id).then(function () {
            showAlert(form, "Booking " + booking.ref + " created. Redirecting…", "ok");
            location.href = NS.routes.href("payment", "?id=" + encodeURIComponent(booking.id));
          }, fail);
        }).catch(function (err) {
          showAlert(form, (err && err.message) || "Your account has been disabled. Please contact the admin.", "err");
        });
      });
    }

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
    if (shown._pickupMap) setTimeout(function () { shown._pickupMap.invalidateSize(); }, 80);
  }

  function bindRentalChoice() {
    var typeStep = document.getElementById("rental-type");
    if (!typeStep || typeStep.getAttribute("data-choice") === "1") return;
    typeStep.setAttribute("data-choice", "1");
    typeStep.querySelectorAll("[data-rental]").forEach(function (card) {
      card.disabled = false;
      card.addEventListener("click", function () {
        openRentalType(card.getAttribute("data-rental"));
      });
    });
  }

  bindRentalChoice();


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
      (booking.pickupPin && booking.pickupPin.lat != null
        ? "<div id=\"booking-pin-map\" class=\"pickup-map\"></div><p class=\"fineprint\">" +
          NS.security.escapeHtml(booking.pickupPin.label || "Saved pin") +
          "</p>"
        : "") +
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
      (info.licensePhoto
        ? '<div class="license-photo-view"><p class="eyebrow">Driver’s license, front</p><img src="' +
          String(info.licensePhoto).replace(/"/g, "") +
          '" alt="Driver license front"></div>'
        : booking.driveMode !== "chauffeur"
          ? "<p class='notice'>No license photo on file for this booking.</p>"
          : "") +
      (info.licenseBack
        ? '<div class="license-photo-view"><p class="eyebrow">Driver’s license, back</p><img src="' +
          String(info.licenseBack).replace(/"/g, "") +
          '" alt="Driver license back"></div>'
        : "") +
      (info.govIdPhoto
        ? '<div class="license-photo-view"><p class="eyebrow">Government ID</p><img src="' +
          String(info.govIdPhoto).replace(/"/g, "") +
          '" alt="Government ID"></div>'
        : "") +
      (info.idPhoto
        ? '<div class="license-photo-view"><p class="eyebrow">Government ID</p><img src="' +
          String(info.idPhoto).replace(/"/g, "") +
          '" alt="Government ID"></div>'
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

    if (booking.pickupPin && NS.pickupMap) NS.pickupMap.show("booking-pin-map", booking.pickupPin);
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
