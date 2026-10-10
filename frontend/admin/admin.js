(function (global) {
  "use strict";

  var NS = (global.iDrive = global.iDrive || {});
  NS.pages = NS.pages || {};

  /*
   * Renders a booking's details as a clear bulleted list (one item per line)
   * for the Admin and Staff desk views. Only lines that have data are shown.
   */
  function bookingDetailList(b) {
    var esc = NS.security.escapeHtml;
    var v = NS.domain.getVehicle(b.vehicleId);
    var u = NS.auth.userById(b.userId);
    var customerName = u ? ((u.firstName || "") + " " + (u.lastName || "")).trim() : "Customer";
    var driveMode = b.driveMode === "chauffeur" ? "Chauffeur" : "Self-drive";
    var methodLabel = { cash: "Cash", cashless: "Cashless", card: "Card" };
    var paymentLine = b.paymentStatus === "paid"
      ? (b.payment
          ? "Paid · " + (methodLabel[b.payment.method] || "Cash") +
            (b.payment.method !== "cash" && b.payment.brand ? " · " + b.payment.brand : "")
          : "Paid")
      : "Unpaid";
    var rows = [
      ["Booking ID", esc(b.ref || b.id)],
      ["Customer", esc(customerName) + (u && u.phone ? " · " + esc(u.phone) : "") + (u && u.email ? " · " + esc(u.email) : "")],
      ["Vehicle", esc(v ? v.name + " · " + v.plate : "—")],
      ["Drive mode", esc(driveMode)],
      ["Pick-up Location", esc(b.pickup || "—") + (b.pickupTime ? " · " + esc(b.pickupTime) : "")],
      ["Drop-off Location", esc(b.dropoff || "—") + (b.returnTime ? " · " + esc(b.returnTime) : "")],
      ["Pick-up date", NS.ui.fmtDate(b.startDate)],
      ["Return date", NS.ui.fmtDate(b.endDate)],
      ["Passengers", esc(String(b.numberOfPassengers || 1))],
      ["Payment", esc(paymentLine)],
      ["Total amount", NS.ui.peso(b.total)],
      ["Status", esc(b.status || "—")]
    ];
    if (b.returnNotes) rows.push(["Return notes", esc(b.returnNotes)]);
    if (b.notes) rows.push(["Notes", esc(b.notes)]);
    return (
      '<ul class="booking-detail-list">' +
      rows
        .map(function (r) {
          return "<li><strong>" + r[0] + ":</strong> <span>" + r[1] + "</span></li>";
        })
        .join("") +
      "</ul>"
    );
  }

  /* Booking threads whose booking record is gone: rebuild what we can from the desk notice text. */
  function missingBookingDetailList(thread) {
    var esc = NS.security.escapeHtml;
    var first = (thread.messages || []).filter(function (m) {
      return /^New booking \S+ received\./.test(m.body || "");
    })[0];
    var m = first
      ? /^New booking (\S+) received\. (Chauffeur|Self-drive), pickup (.+?) on (\d{4}-\d{2}-\d{2})\. Payment: (\w+)\.(?: Notes: ([\s\S]*))?$/.exec(first.body)
      : null;
    var contact = [thread.customerName, thread.customerPhone, thread.customerEmail].filter(Boolean).map(esc).join(" · ");
    var rows = [
      ["Booking ID", esc(thread.bookingRef || (m && m[1]) || "—")],
      ["Customer", contact || "—"]
    ];
    if (m) {
      rows.push(
        ["Drive mode", esc(m[2])],
        ["Pick-up Location", esc(m[3])],
        ["Pick-up date", NS.ui.fmtDate(m[4])],
        ["Payment", esc(m[5].charAt(0).toUpperCase() + m[5].slice(1))]
      );
    }
    rows.push(["Status", "Not saved to the server — other details are unavailable"]);
    if (m && m[6]) rows.push(["Notes", esc(m[6])]);
    return (
      '<ul class="booking-detail-list">' +
      rows
        .map(function (r) {
          return "<li><strong>" + r[0] + ":</strong> <span>" + r[1] + "</span></li>";
        })
        .join("") +
      "</ul>"
    );
  }

  function mountAdminNav() {
    var host = document.getElementById("admin-side");
    if (!host) return;
    var page = document.body.getAttribute("data-page");
    var me = NS.auth.current();
    var unread = 0;
    var returns = 0;
    try {
      unread = NS.domain.staffUnreadCount ? NS.domain.staffUnreadCount() : 0;
      returns = NS.domain.pendingReturns ? NS.domain.pendingReturns().length : 0;
    } catch (e) {
      unread = 0;
    }
    var isAdmin = NS.auth.hasRole("admin");
    function icon(d) {
      return (
        '<svg class="side-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">' +
        d +
        "</svg>"
      );
    }
    function link(href, label, key, ico, count) {
      return (
        '<a class="side-link' +
        (page === key ? " active" : "") +
        '" href="' +
        href +
        '">' +
        ico +
        "<span>" +
        label +
        "</span>" +
        (count
          ? '<em class="nav-count">' + count + "</em>"
          : "") +
        "</a>"
      );
    }
    function group(title, html) {
      return '<div class="side-group"><p class="side-label">' + title + "</p>" + html + "</div>";
    }
    var desk =
      link("index.html", "Open Desk", "adminHome", icon('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>')) +
      link("inbox.html", "Inbox", "adminInbox", icon('<path d="M4 6h16v12H4z"/><path d="m4 7 8 6 8-6"/>'), unread) +
      link("bookings.html", "Bookings", "adminBookings", icon('<path d="M8 7V5h8v2"/><rect x="5" y="7" width="14" height="13" rx="2"/>'), returns) +
      link("payments.html", "Payments", "adminPayments", icon('<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10h18"/>'));
    var fleet =
      link("vehicles.html", "Vehicles", "adminVehicles", icon('<path d="M5 16h14l-1.5-7h-11z"/><circle cx="7.5" cy="17.5" r="1.5"/><circle cx="16.5" cy="17.5" r="1.5"/>')) +
      link("fleet-ops.html", "Registration & service", "adminFleetOps", icon('<path d="M12 3v4"/><circle cx="12" cy="14" r="7"/><path d="M12 11v3l2 2"/>')) +
      link("predictive-maintenance.html", "Predictive maintenance", "adminPredictiveMaintenance", icon('<path d="M4 18h16"/><path d="M6 15l3-4 3 2 5-7 2 2"/><circle cx="17" cy="6" r="1"/>')) +
      link("drivers.html", "Drivers", "adminDrivers", icon('<circle cx="12" cy="8" r="3"/><path d="M5 20c1.5-3.5 4-5 7-5s5.5 1.5 7 5"/>'));
    var people = group(
      "People",
      link("customers.html", "Manage customers", "adminCustomers", icon('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'))
    );
    var insights =
      link("reports.html", "Reports", "adminReports", icon('<path d="M4 19V5"/><path d="M4 19h16"/><path d="M8 16v-6"/><path d="M12 16V8"/><path d="M16 16v-3"/>')) +
      link("security-log.html", "Security log", "adminSecurityLog", icon('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'));
    host.innerHTML =
      '<aside class="admin-side">' +
      '<div class="side-head">' +
      '<p class="eyebrow">' +
      (isAdmin ? "Admin" : "Rental-Incharge") +
      "</p>" +
      "<strong>" +
      NS.security.escapeHtml(me ? me.firstName + " " + me.lastName : "Desk") +
      "</strong>" +
      "<span>" +
      NS.security.escapeHtml(me ? me.email : "") +
      "</span></div>" +
      group("Desk", desk) +
      group("Fleet", fleet) +
      people +
      group("Insights", insights) +
      '<div class="side-foot">' +
      link(NS.routes.href("profile"), "My profile", "profile", icon('<circle cx="12" cy="8" r="3"/><path d="M5 20c1.5-3.5 4-5 7-5s5.5 1.5 7 5"/>')) +
      "</div></aside>";
  }

  function adminHome() {
    mountAdminNav();
    var r = NS.domain.report();
    var incoming = NS.domain.incomingBookings();
    var returns = NS.domain.pendingReturns();
    var unread = NS.domain.staffUnreadCount();
    document.getElementById("kpi-row").innerHTML =
      '<div class="stat"><span>' +
      incoming.length +
      "</span>incoming</div>" +
      '<div class="stat"><span>' +
      returns.length +
      "</span>returns</div>" +
      '<div class="stat"><span>' +
      unread +
      "</span>unread</div>" +
      '<div class="stat"><span>' +
      NS.ui.peso(r.revenue) +
      "</span>paid revenue</div>";
    var shortcuts = document.getElementById("desk-shortcuts");
    if (shortcuts) {
      function jump(href, title, note) {
        return '<a class="desk-shortcut" href="' + href + '"><strong>' + title + "</strong><span>" + note + "</span></a>";
      }
      shortcuts.innerHTML =
        '<div class="shortcut-group"><p class="side-label">Desk</p><div class="shortcut-row">' +
        jump("index.html", "Open Desk", "This overview") +
        jump("bookings.html", "Bookings", "Confirm and complete trips") +
        jump("inbox.html", "Inbox", "Messages and returns") +
        jump("payments.html", "Payments", "Cash and cashless records") +
        "</div></div>" +
        '<div class="shortcut-group"><p class="side-label">People</p><div class="shortcut-row">' +
        jump("customers.html", "Manage customers", "Search, roles, and disable") +
        jump("drivers.html", "Drivers", "Chauffeur roster") +
        "</div></div>" +
        '<div class="shortcut-group"><p class="side-label">Fleet</p><div class="shortcut-row">' +
        jump("vehicles.html", "Fleet", "Cars, plates, and rates") +
        jump("predictive-maintenance.html", "Predictive maintenance", "Vehicle health checks") +
        jump("reports.html", "Reports", "Revenue and mix") +
        "</div></div>";
    }
    var recentHost = document.getElementById("admin-recent");
    var recentSorted = incoming.slice().sort(function (a, b) {
      return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
    });
    recentHost.innerHTML =
      '<p class="section-summary">' + recentSorted.length + " incoming · newest first</p>" +
      (recentSorted.length
      ? recentSorted
          .slice(0, 8)
          .map(function (b) {
            var v = NS.domain.getVehicle(b.vehicleId);
            var u = NS.auth.userById(b.userId);
            return (
              '<a class="row-link" href="inbox.html"><strong>' +
              NS.security.escapeHtml(b.ref) +
              "</strong><span>" +
              NS.security.escapeHtml(u ? u.firstName + " " + u.lastName : "Customer") +
              " · " +
              NS.security.escapeHtml(u ? u.phone || u.email : "") +
              " · " +
              NS.security.escapeHtml(v ? v.name : "") +
              "</span>" +
              NS.ui.statusBadge(b.paymentStatus) +
              NS.ui.statusBadge(b.status) +
              "</a>"
            );
          })
          .join("")
      : "<p class='notice'>No incoming bookings yet. New customer bookings appear here.</p>");
    var returnsHost = document.getElementById("admin-returns");
    if (returnsHost) {
      // Overview is a read-only glance; the Inbox owns the interactive return workflow.
      returnsHost.innerHTML =
        '<p class="section-summary">' + returns.length + " waiting for the desk</p>" +
        (returns.length
        ? returns
            .slice()
            .sort(function (a, b) { return String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")); })
            .slice(0, 8)
            .map(function (b) {
              var v = NS.domain.getVehicle(b.vehicleId);
              var u = NS.auth.userById(b.userId);
              return (
                '<a class="row-link" href="inbox.html"><strong>' +
                NS.security.escapeHtml(b.ref) +
                "</strong><span>" +
                NS.security.escapeHtml(u ? u.firstName + " " + u.lastName : "Customer") +
                " · " +
                NS.security.escapeHtml(v ? v.name : "") +
                " · " +
                NS.security.escapeHtml(b.dropoff || "") +
                "</span>" +
                NS.ui.statusBadge(b.status) +
                "</a>"
              );
            })
            .join("")
        : "<p class='notice'>No vehicle returns waiting.</p>");
    }
  }

  function adminVehicles() {
    mountAdminNav();
    var desk = document.getElementById("vehicle-desk");
    if (!desk) return;
    var isAdmin = NS.auth.hasRole("admin");
    var canManage = NS.auth.hasRole("staff");
    var form = document.getElementById("vehicle-form");
    var editor = document.getElementById("vehicle-editor");
    var formTitle = document.getElementById("vehicle-form-title");
    var grid = document.getElementById("vehicle-fleet-grid");
    var stats = document.getElementById("fleet-stats");
    var heroActions = document.getElementById("fleet-hero-actions");
    var filterStatus = document.getElementById("fleet-filter");
    var filterType = document.getElementById("fleet-type-filter");

    if (heroActions) {
      heroActions.innerHTML = canManage
        ? '<button class="btn btn-gold" type="button" id="fleet-add-btn">Add vehicle</button>' +
          '<a class="btn btn-ghost" href="fleet-ops.html">Fleet ops</a>'
        : '<a class="btn btn-ghost" href="fleet-ops.html">View fleet ops</a>';
    }

    function openEditor(v) {
      if (!canManage || !editor || !form) return;
      editor.hidden = false;
      NS.ui.bindCsrf(form);
      if (v) {
        formTitle.textContent = "Edit vehicle";
        form.vehicleId.value = v.id;
        form.name.value = v.name;
        form.brand.value = v.brand;
        form.model.value = v.model;
        form.year.value = v.year;
        form.yearPurchased.value = v.yearPurchased || v.year;
        form.mileage.value = v.mileage || 0;
        form.type.value = v.type;
        form.transmission.value = v.transmission;
        form.fuel.value = v.fuel;
        form.seats.value = v.seats;
        form.luggage.value = v.luggage;
        form.dailyRate.value = v.dailyRate;
        form.plate.value = v.plate;
        form.image.value = v.image || "";
        form.description.value = v.description || "";
        form.features.value = (v.features || []).join(", ");
        form.status.value = v.status;
      } else {
        formTitle.textContent = "Add vehicle";
        form.reset();
        form.vehicleId.value = "";
        form.status.value = "available";
        NS.ui.bindCsrf(form);
      }
      editor.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function closeEditor() {
      if (!editor || !form) return;
      editor.hidden = true;
      form.reset();
      form.vehicleId.value = "";
      NS.ui.bindCsrf(form);
    }

    function renderStats(list, stateOf) {
      if (!stats) return;
      function count(state) {
        return list.filter(function (v) {
          return stateOf[v.id] === state;
        }).length;
      }
      stats.innerHTML =
        '<div class="stat"><span>' +
        list.length +
        "</span>vehicles</div>" +
        '<div class="stat"><span>' +
        count("available") +
        "</span>available</div>" +
        '<div class="stat"><span>' +
        count("reserved") +
        "</span>reserved</div>" +
        '<div class="stat"><span>' +
        count("maintenance") +
        "</span>under maintenance</div>" +
        '<div class="stat"><span>' +
        list.filter(function (v) {
          return v.type === "SUV" || v.type === "Van";
        }).length +
        "</span>group cars</div>";
    }

    function render() {
      if (!grid) return;
      var all = NS.domain.vehicles();
      var stateOf = {};
      all.forEach(function (v) {
        stateOf[v.id] = NS.domain.vehicleAvailability(v.id);
      });
      renderStats(all, stateOf);
      var statusVal = filterStatus ? filterStatus.value : "";
      var typeVal = filterType ? filterType.value : "";
      var list = all.filter(function (v) {
        if (statusVal && stateOf[v.id] !== statusVal) return false;
        if (typeVal && v.type !== typeVal) return false;
        return true;
      });
      grid.innerHTML = list.length
        ? list
            .map(function (v) {
              var prediction = NS.domain.predictionForVehicle
                ? NS.domain.predictionForVehicle(v.id)
                : null;
              var pct = prediction && prediction.probability !== null
                ? Math.round(prediction.probability * 100)
                : null;
              var tone = pct === null ? "" : pct >= 50 ? "is-high" : pct >= 25 ? "is-mid" : "is-ok";
              return (
                '<article class="fleet-photo-card">' +
                '<div class="fleet-photo-media">' +
                (v.image
                  ? '<img src="' +
                    NS.security.escapeHtml(v.image) +
                    '" alt="' +
                    NS.security.escapeHtml(v.name) +
                    '">'
                  : '<div class="fleet-photo-empty">No photo</div>') +
                '<span class="fleet-photo-pct ' +
                tone +
                '"><strong>' +
                (pct === null ? "—" : pct + "%") +
                "</strong><em>Maintenance Risk</em></span>" +
                '<span class="badge badge-' + stateOf[v.id] + '">' +
                NS.domain.AVAILABILITY_LABELS[stateOf[v.id]] +
                "</span>" +
                "</div>" +
                '<div class="fleet-photo-body">' +
                "<h3>" +
                NS.security.escapeHtml(v.name) +
                "</h3>" +
                "<p>" +
                NS.security.escapeHtml(v.plate) +
                " · " +
                NS.security.escapeHtml(v.type) +
                " · " +
                NS.ui.peso(v.dailyRate) +
                "/day</p>" +
                (canManage
                  ? '<div class="btn-row"><button class="btn btn-ghost btn-sm" type="button" data-edit="' +
                    v.id +
                    '">Edit</button>' +
                    (isAdmin
                      ? '<button class="btn btn-ghost btn-sm" type="button" data-del="' + v.id + '">Remove</button>'
                      : "") +
                    "</div>"
                  : "") +
                "</div></article>"
              );
            })
            .join("")
        : "<p class='notice'>No vehicles match those filters.</p>";
    }

    if (!canManage && editor) editor.hidden = true;

    if (canManage && form) {
      NS.ui.bindCsrf(form);
      var addBtn = document.getElementById("fleet-add-btn");
      if (addBtn) addBtn.addEventListener("click", function () {
        openEditor(null);
      });
      var cancelBtn = document.getElementById("vehicle-form-cancel");
      if (cancelBtn) cancelBtn.addEventListener("click", closeEditor);
      var resetBtn = document.getElementById("vehicle-form-reset");
      if (resetBtn) {
        resetBtn.addEventListener("click", function () {
          form.reset();
          form.vehicleId.value = "";
          formTitle.textContent = "Add vehicle";
          NS.ui.bindCsrf(form);
        });
      }
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var isEdit = !!form.vehicleId.value;
        NS.ui
          .askYesNo(isEdit ? "Save these vehicle edits?" : "Save this new vehicle?", { title: "Save edit" })
          .then(function (ok) {
            if (!ok) return;
            try {
              NS.domain.saveVehicle(
                {
                  id: form.vehicleId.value || undefined,
                  name: form.name.value,
                  brand: form.brand.value,
                  model: form.model.value,
                  year: form.year.value,
                  yearPurchased: form.yearPurchased.value,
                  mileage: form.mileage.value,
                  type: form.type.value,
                  transmission: form.transmission.value,
                  fuel: form.fuel.value,
                  seats: form.seats.value,
                  luggage: form.luggage.value,
                  dailyRate: form.dailyRate.value,
                  plate: form.plate.value,
                  image: form.image.value,
                  description: form.description.value,
                  features: form.features.value.split(","),
                  status: form.status.value
                },
                form.csrf.value
              );
              closeEditor();
              render();
              NS.ui.toast("Fleet updated.", "ok");
            } catch (err) {
              NS.ui.bindCsrf(form);
              NS.ui.toast(err.message, "err");
            }
          });
      });
    }

    if (grid) {
      grid.addEventListener("click", function (e) {
        var edit = e.target.getAttribute("data-edit");
        var del = e.target.getAttribute("data-del");
        if (edit) {
          openEditor(NS.domain.getVehicle(edit));
        }
        if (del) {
          NS.ui.askYesNo("Remove this vehicle from the fleet?", { title: "Save edit" }).then(function (ok) {
            if (!ok) return;
            try {
              NS.domain.removeVehicle(del, NS.security.getCsrf());
              if (form && form.vehicleId.value === del) closeEditor();
              render();
              NS.ui.toast("Vehicle removed.", "ok");
            } catch (err) {
              NS.ui.toast(err.message, "err");
            }
          });
        }
      });
    }

    if (filterStatus) filterStatus.addEventListener("change", render);
    if (filterType) filterType.addEventListener("change", render);
    render();
  }

  function adminBookings() {
    mountAdminNav();
    var host = document.getElementById("admin-bookings");
    function render() {
      var filter = document.getElementById("status-filter").value;
      var list = NS.domain.allBookings().filter(function (b) {
        return !filter || b.status === filter;
      });
      host.innerHTML = list
        .map(function (b) {
          var v = NS.domain.getVehicle(b.vehicleId);
          var u = NS.auth.userById(b.userId);
          var actions = "";
          if (b.status === "pending" && b.paymentStatus === "paid") {
            actions += '<button class="btn btn-gold btn-sm" data-act="confirmed" data-id="' + b.id + '">Confirm</button>';
            actions += '<button class="btn btn-ghost btn-sm" data-act="rejected" data-id="' + b.id + '">Reject</button>';
          }
          if (b.paymentStatus !== "paid" && b.status !== "cancelled" && b.status !== "rejected") {
            actions +=
              '<a class="btn btn-gold btn-sm" href="payments.html?booking=' +
              encodeURIComponent(b.id) +
              '">Record payment</a>';
          }
          if (b.status === "confirmed") {
            actions += '<button class="btn btn-dark btn-sm" data-act="ongoing" data-id="' + b.id + '">Start trip</button>';
          }
          if (b.status === "ongoing") {
            actions += '<button class="btn btn-gold btn-sm" data-act="completed" data-id="' + b.id + '">Complete</button>';
          }
          if (b.status === "return_requested") {
            actions +=
              '<button class="btn btn-gold btn-sm" data-accept-return="' + b.id + '">Accept return</button>';
          }
          actions +=
            '<button class="btn btn-ghost btn-sm" data-msg="' +
            b.id +
            '">Message</button>';
          return (
            '<article class="booking-card"><div><p class="eyebrow">Booking ' +
            NS.security.escapeHtml(b.ref) +
            "</p><h3>" +
            NS.security.escapeHtml(v ? v.name : "") +
            "</h3>" +
            bookingDetailList(b) +
            "</div><div>" +
            NS.ui.statusBadge(b.status) +
            " " +
            NS.ui.statusBadge(b.paymentStatus) +
            actions +
            "</div></article>"
          );
        })
        .join("");
    }
    document.getElementById("status-filter").addEventListener("change", render);
    host.addEventListener("click", function (e) {
      var msgId = e.target.getAttribute("data-msg");
      if (msgId) {
        try {
          var thread = NS.domain.ensureBookingThread(msgId);
          location.href = "inbox.html?id=" + encodeURIComponent(thread.id);
        } catch (err) {
          NS.ui.toast(err.message, "err");
        }
        return;
      }
      var acceptId = e.target.getAttribute("data-accept-return");
      if (acceptId) {
        NS.ui
          .askYesNo("Accept this vehicle return and complete the trip?", {
            title: "Accept return",
            yes: "Yes",
            no: "No"
          })
          .then(function (ok) {
            if (!ok) return;
            try {
              NS.domain.acceptVehicleReturn(acceptId, NS.security.getCsrf());
              render();
              NS.ui.toast("Return accepted. Trip completed.", "ok");
            } catch (err) {
              NS.ui.toast(err.message, "err");
            }
          });
        return;
      }
      var act = e.target.getAttribute("data-act");
      var id = e.target.getAttribute("data-id");
      if (!act) return;
      var labels = {
        confirmed: "Confirm this booking?",
        rejected: "Reject this booking?",
        ongoing: "Start this trip?",
        completed: "Mark this trip complete?"
      };
      NS.ui.askYesNo(labels[act] || "Save this booking edit?", { title: "Save edit" }).then(function (ok) {
        if (!ok) return;
        try {
          NS.domain.setBookingStatus(id, act, NS.security.getCsrf());
          render();
          NS.ui.toast("Booking updated.", "ok");
        } catch (err) {
          NS.ui.toast(err.message, "err");
        }
      });
    });
    render();
  }

  function adminCustomers() {
    mountAdminNav();
    var isAdmin = NS.auth.hasRole("admin");
    var host = document.getElementById("user-panels");
    var tabs = document.getElementById("user-tabs");
    var search = document.getElementById("user-search");
    if (!host) return;
    var roles = isAdmin
      ? [
          { id: "admin", label: "Admin" },
          { id: "staff", label: "Staff" },
          { id: "customer", label: "Customer" },
          { id: "driver", label: "Driver" }
        ]
      : [{ id: "customer", label: "Customer" }];
    var activeRole = roles[0].id;

    function matches(u, query) {
      if (!query) return true;
      return (u.firstName + " " + u.lastName).toLowerCase().indexOf(query) !== -1;
    }

    function render() {
      var query = search ? search.value.trim().toLowerCase() : "";
      var people = NS.auth.listUsers();
      if (tabs) {
        tabs.innerHTML = roles
          .map(function (role) {
            var count = people.filter(function (u) {
              return u.role === role.id && matches(u, query);
            }).length;
            return (
              '<button type="button" class="role-tab' +
              (role.id === activeRole ? " active" : "") +
              '" data-role="' +
              role.id +
              '">' +
              role.label +
              " (" +
              count +
              ")</button>"
            );
          })
          .join("");
      }
      var rows = people.filter(function (u) {
        return u.role === activeRole && matches(u, query);
      });
      host.innerHTML =
        '<p class="section-summary">' +
        rows.length +
        " " +
        activeRole +
        (query ? " matching “" + NS.security.escapeHtml(search.value.trim()) + "”" : "") +
        ". Search checks every role tab.</p>" +
        '<table class="table"><thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Role</th><th>Status</th><th></th></tr></thead><tbody>' +
        (rows.length
          ? rows
              .map(function (u) {
                var action =
                  u.role === "admin"
                    ? ""
                    : '<button class="btn btn-ghost btn-sm" data-id="' +
                      u.id +
                      '" data-status="' +
                      (u.status === "active" ? "disabled" : "active") +
                      '">' +
                      (u.status === "active" ? "Disable" : "Enable") +
                      "</button>";
                return (
                  '<tr><td class="customer-cell">' +
                  NS.ui.avatarHtml(u, "sm") +
                  "<span>" +
                  NS.security.escapeHtml(u.firstName + " " + u.lastName) +
                  "</span></td><td>" +
                  NS.security.escapeHtml(u.email) +
                  "</td><td>" +
                  NS.security.escapeHtml(u.phone) +
                  "</td><td>" +
                  NS.security.escapeHtml(u.role) +
                  "</td><td>" +
                  NS.ui.statusBadge(u.status) +
                  "</td><td>" +
                  action +
                  "</td></tr>"
                );
              })
              .join("")
          : '<tr><td colspan="6">No users in this role.</td></tr>') +
        "</tbody></table>";
    }
    if (tabs) {
      tabs.addEventListener("click", function (e) {
        var btn = e.target.closest("[data-role]");
        if (!btn) return;
        activeRole = btn.getAttribute("data-role");
        render();
      });
    }
    if (search) search.addEventListener("input", render);
    host.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-id]");
      if (!btn) return;
      var id = btn.getAttribute("data-id");
      var status = btn.getAttribute("data-status");
      if (!id) return;
      var msg = status === "disabled" ? "Disable this customer account?" : "Enable this customer account?";
      NS.ui.askYesNo(msg, { title: "Save edit" }).then(function (ok) {
        if (!ok) return;
        try {
          NS.auth.setUserStatus(id, status, NS.security.getCsrf());
          render();
          NS.ui.toast("Account updated.", "ok");
        } catch (err) {
          NS.ui.toast(err.message, "err");
        }
      });
    });
    render();
  }

  function adminReports() {
    mountAdminNav();
    var r = NS.domain.report();
    var kpi = document.getElementById("kpi-row");
    if (kpi) {
      kpi.innerHTML =
        '<div class="stat"><span>' +
        r.bookings +
        "</span>bookings</div>" +
        '<div class="stat"><span>' +
        NS.ui.peso(r.revenue) +
        "</span>paid revenue</div>" +
        '<div class="stat"><span>' +
        (r.drivers || 0) +
        "</span>active drivers</div>" +
        '<div class="stat"><span>' +
        (r.openMaintenance || 0) +
        "</span>open maintenance</div>";
    }
    var bars = document.getElementById("revenue-bars");
    var max = 1;
    Object.keys(r.byType).forEach(function (k) {
      if (r.byType[k] > max) max = r.byType[k];
    });
    bars.innerHTML = Object.keys(r.byType)
      .map(function (k) {
        var pct = Math.round((r.byType[k] / max) * 100);
        return (
          '<div class="bar-row"><span>' +
          NS.security.escapeHtml(k) +
          "</span><div class='bar'><i style='width:" +
          pct +
          "%'></i></div><em>" +
          NS.ui.peso(r.byType[k]) +
          "</em></div>"
        );
      })
      .join("") || "<p class='notice'>No paid bookings yet.</p>";
    document.getElementById("status-pills").innerHTML = Object.keys(r.byStatus)
      .map(function (k) {
        return NS.ui.statusBadge(k) + " " + r.byStatus[k];
      })
      .join(" ") || "<span class='notice'>No bookings yet.</span>";
  }

  function adminSecurityLog() {
    mountAdminNav();
    var host = document.getElementById("audit-list");
    if (!host) return;
    var list = NS.domain.auditLog();
    host.innerHTML = list.length
      ? list
          .map(function (a) {
            return (
              '<li class="audit-item"><div><strong>' +
              NS.security.escapeHtml(a.action) +
              "</strong><span>" +
              NS.security.escapeHtml(a.detail) +
              "</span></div><em>" +
              NS.ui.fmtDate(a.at) +
              "</em></li>"
            );
          })
          .join("")
      : "<li class='notice'>No security events recorded yet.</li>";
  }

  function vehicleOptionsHtml(selected) {
    return NS.domain
      .vehicles()
      .map(function (v) {
        return (
          '<option value="' +
          v.id +
          '"' +
          (v.id === selected ? " selected" : "") +
          ">" +
          NS.security.escapeHtml(v.name + " · " + v.plate) +
          "</option>"
        );
      })
      .join("");
  }

  function adminDrivers() {
    mountAdminNav();
    var isAdmin = NS.auth.hasRole("admin");
    var canManage = NS.auth.hasRole("staff");
    var formWrap = document.getElementById("driver-form-wrap");
    var listHost = document.getElementById("drivers-list");
    var pillsHost = document.getElementById("status-pills");

    function dutyOf(d) {
      return d.dutyStatus === "on_call" ? "on_call" : "regular";
    }

    function render() {
      var list = NS.domain.drivers();
      var regular = 0;
      var onCall = 0;
      list.forEach(function (d) {
        if (dutyOf(d) === "on_call") onCall++;
        else regular++;
      });
      if (pillsHost) {
        pillsHost.innerHTML =
          NS.ui.statusBadge("regular") +
          " " +
          regular +
          "  " +
          NS.ui.statusBadge("on_call") +
          " " +
          onCall;
      }

      listHost.innerHTML =
        list
          .map(function (d) {
            return (
              '<article class="booking-card"><div><p class="eyebrow">' +
              NS.security.escapeHtml(d.typeDriverLicense || "Driver") +
              "</p><h3>" +
              NS.security.escapeHtml(d.fullName) +
              "</h3><p>" +
              NS.security.escapeHtml(d.driverLicense) +
              " · expires " +
              NS.security.escapeHtml(d.licenseExpiry) +
              (d.phone ? "<br>" + NS.security.escapeHtml(d.phone) : "") +
              "</p></div><div class=\"driver-card-badges\">" +
              NS.ui.statusBadge(dutyOf(d)) +
              NS.ui.statusBadge(d.status) +
              (canManage
                ? '<div class="btn-row"><button class="btn btn-ghost btn-sm" data-edit="' +
                  d.id +
                  '">Edit</button>' +
                  (isAdmin ? '<button class="btn btn-ghost btn-sm" data-del="' + d.id + '">Remove</button>' : "") +
                  "</div>"
                : "") +
              "</div></article>"
            );
          })
          .join("") || "<p class='notice'>No drivers yet.</p>";
    }

    if (canManage) {
      formWrap.innerHTML =
        '<form id="driver-form" class="form-card">' +
        '<input type="hidden" name="id">' +
        '<div class="row g-2">' +
        '<div class="col-md-6"><label class="field">Full name <input class="form-control" name="fullName" required></label></div>' +
        '<div class="col-md-6"><label class="field">Phone <input class="form-control" name="phone"></label></div>' +
        '<div class="col-md-4"><label class="field">License no. <input class="form-control" name="driverLicense" required></label></div>' +
        '<div class="col-md-4"><label class="field">License type <input class="form-control" name="typeDriverLicense" value="Professional"></label></div>' +
        '<div class="col-md-4"><label class="field">Expiry <input class="form-control" name="licenseExpiry" type="date" required></label></div>' +
        '<div class="col-md-4"><label class="field">Roster <select class="form-select" name="status"><option value="active">active</option><option value="inactive">inactive</option></select></label></div>' +
        '<div class="col-md-4"><label class="field">Duty status <select class="form-select" name="dutyStatus"><option value="regular">Regular</option><option value="on_call">On call</option></select></label></div>' +
        "</div>" +
        '<button class="btn btn-gold" type="submit">Save driver</button></form>';
      var form = document.getElementById("driver-form");
      NS.ui.bindCsrf(form);
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        NS.ui.askYesNo("Save this driver?", { title: "Save edit" }).then(function (ok) {
          if (!ok) return;
          try {
            NS.domain.saveDriver(
              {
                id: form.id.value || undefined,
                fullName: form.fullName.value,
                phone: form.phone.value,
                driverLicense: form.driverLicense.value,
                typeDriverLicense: form.typeDriverLicense.value,
                licenseExpiry: form.licenseExpiry.value,
                status: form.status.value,
                dutyStatus: form.dutyStatus.value
              },
              form.csrf.value
            );
            form.reset();
            form.id.value = "";
            NS.ui.bindCsrf(form);
            render();
            NS.ui.toast("Driver saved.", "ok");
          } catch (err) {
            NS.ui.bindCsrf(form);
            NS.ui.toast(err.message, "err");
          }
        });
      });
      listHost.addEventListener("click", function (e) {
        var edit = e.target.getAttribute("data-edit");
        var del = e.target.getAttribute("data-del");
        if (edit) {
          var d = NS.domain.getDriver(edit);
          if (!d) return;
          form.id.value = d.id;
          form.fullName.value = d.fullName;
          form.phone.value = d.phone || "";
          form.driverLicense.value = d.driverLicense;
          form.typeDriverLicense.value = d.typeDriverLicense;
          form.licenseExpiry.value = d.licenseExpiry;
          form.status.value = d.status;
          form.dutyStatus.value = dutyOf(d);
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
        if (del) {
          NS.ui.askYesNo("Remove this driver?", { title: "Save edit" }).then(function (ok) {
            if (!ok) return;
            try {
              NS.domain.removeDriver(del, NS.security.getCsrf());
              render();
              NS.ui.toast("Driver removed.", "ok");
            } catch (err) {
              NS.ui.toast(err.message, "err");
            }
          });
        }
      });
    } else {
      formWrap.innerHTML = "<p class='notice'>View only.</p>";
    }
    render();
  }

  function adminFleetOps() {
    mountAdminNav();
    var canManage = NS.auth.hasRole("staff");
    var forms = document.getElementById("fleet-ops-forms");
    var regsHost = document.getElementById("regs-list");
    var maintHost = document.getElementById("maint-list");
    var fuelHost = document.getElementById("fuel-list");

    function renderLists() {
      regsHost.innerHTML = NS.domain
        .vehicleRegs()
        .map(function (r) {
          var v = NS.domain.getVehicle(r.vehicleId);
          return (
            "<p><strong>" +
            NS.security.escapeHtml(v ? v.name : r.vehicleId) +
            "</strong> · " +
            NS.security.escapeHtml(r.plateNumber) +
            " · next renewal " +
            NS.security.escapeHtml(r.nextRegRenewal) +
            " (day " +
            NS.security.escapeHtml(r.renewalScheduledDay || "—") +
            ")</p>"
          );
        })
        .join("") || "<p class='notice'>No registration records.</p>";

      maintHost.innerHTML = NS.domain
        .maintenances()
        .map(function (m) {
          var v = NS.domain.getVehicle(m.vehicleId);
          return (
            '<article class="booking-card"><div><p class="eyebrow">' +
            NS.security.escapeHtml(m.scheduledDate) +
            "</p><h3>" +
            NS.security.escapeHtml(m.maintenanceType) +
            "</h3><p>" +
            NS.security.escapeHtml(v ? v.name : m.vehicleId) +
            (m.notes ? "<br>" + NS.security.escapeHtml(m.notes) : "") +
            "</p></div><div>" +
            NS.ui.statusBadge(m.finished ? "completed" : "pending") +
            (canManage && !m.finished
              ? '<button class="btn btn-gold btn-sm" data-finish="' + m.id + '">Mark finished</button>'
              : "") +
            "</div></article>"
          );
        })
        .join("") || "<p class='notice'>No maintenance jobs.</p>";

      fuelHost.innerHTML = NS.domain
        .fuelRecords()
        .slice(0, 20)
        .map(function (f) {
          var v = NS.domain.getVehicle(f.vehicleId);
          return (
            "<p><strong>" +
            NS.security.escapeHtml(v ? v.name : f.vehicleId) +
            "</strong> · " +
            NS.security.escapeHtml(f.fuelType) +
            " · " +
            NS.ui.fmtDate(f.recordedAt) +
            "</p>"
          );
        })
        .join("") || "<p class='notice'>No fuel records.</p>";
    }

    if (canManage) {
      forms.innerHTML =
        '<div class="form-card">' +
        "<h3>Save registration</h3>" +
        '<form id="reg-form" class="row g-2 align-items-end">' +
        '<div class="col-md-5"><label class="field">Vehicle <select class="form-select" name="vehicleId" required>' +
        vehicleOptionsHtml() +
        "</select></label></div>" +
        '<div class="col-md-2"><label class="field">Renewal date <input class="form-control" name="renewalScheduledDay" type="date"></label></div>' +
        '<div class="col-md-3"><label class="field">Next renewal <input class="form-control" name="nextRegRenewal" type="date" required></label></div>' +
        '<div class="col-md-2"><button class="btn btn-gold" type="submit">Save</button></div></form></div>' +
        '<div class="form-card">' +
        "<h3>Schedule maintenance</h3>" +
        '<form id="mnt-form" class="row g-2 align-items-end">' +
        '<div class="col-md-4"><label class="field">Vehicle <select class="form-select" name="vehicleId" required>' +
        vehicleOptionsHtml() +
        "</select></label></div>" +
        '<div class="col-md-3"><label class="field">Type <input class="form-control" name="maintenanceType" required></label></div>' +
        '<div class="col-md-3"><label class="field">Scheduled <input class="form-control" name="scheduledDate" type="date" required></label></div>' +
        '<div class="col-md-2"><button class="btn btn-gold" type="submit">Save</button></div></form></div>' +
        '<div class="form-card">' +
        "<h3>Log fuel type</h3>" +
        '<form id="fuel-form" class="row g-2 align-items-end">' +
        '<div class="col-md-5"><label class="field">Vehicle <select class="form-select" name="vehicleId" required>' +
        vehicleOptionsHtml() +
        "</select></label></div>" +
        '<div class="col-md-3"><label class="field">Fuel type <select class="form-select" name="fuelType"><option>Gasoline</option><option>Diesel</option></select></label></div>' +
        '<div class="col-md-2"><button class="btn btn-gold" type="submit">Save</button></div></form></div>';

      ["reg-form", "mnt-form", "fuel-form"].forEach(function (id) {
        var f = document.getElementById(id);
        if (f) NS.ui.bindCsrf(f);
      });

      document.getElementById("reg-form").addEventListener("submit", function (e) {
        e.preventDefault();
        var form = e.target;
        try {
          NS.domain.saveVehicleReg(
            {
              vehicleId: form.vehicleId.value,
              renewalScheduledDay: form.renewalScheduledDay.value,
              nextRegRenewal: form.nextRegRenewal.value
            },
            form.csrf.value
          );
          NS.ui.bindCsrf(form);
          renderLists();
          NS.ui.toast("Registration saved.", "ok");
        } catch (err) {
          NS.ui.bindCsrf(form);
          NS.ui.toast(err.message, "err");
        }
      });

      document.getElementById("mnt-form").addEventListener("submit", function (e) {
        e.preventDefault();
        var form = e.target;
        try {
          NS.domain.saveMaintenance(
            {
              vehicleId: form.vehicleId.value,
              maintenanceType: form.maintenanceType.value,
              scheduledDate: form.scheduledDate.value,
              finished: false
            },
            form.csrf.value
          );
          form.reset();
          NS.ui.bindCsrf(form);
          renderLists();
          NS.ui.toast("Maintenance scheduled.", "ok");
        } catch (err) {
          NS.ui.bindCsrf(form);
          NS.ui.toast(err.message, "err");
        }
      });

      document.getElementById("fuel-form").addEventListener("submit", function (e) {
        e.preventDefault();
        var form = e.target;
        try {
          NS.domain.saveFuelRecord(
            { vehicleId: form.vehicleId.value, fuelType: form.fuelType.value },
            form.csrf.value
          );
          NS.ui.bindCsrf(form);
          renderLists();
          NS.ui.toast("Fuel record saved.", "ok");
        } catch (err) {
          NS.ui.bindCsrf(form);
          NS.ui.toast(err.message, "err");
        }
      });

      maintHost.addEventListener("click", function (e) {
        var id = e.target.getAttribute("data-finish");
        if (!id) return;
        var job = NS.domain.maintenances().filter(function (m) {
          return m.id === id;
        })[0];
        if (!job) return;
        try {
          NS.domain.saveMaintenance(
            {
              id: job.id,
              vehicleId: job.vehicleId,
              maintenanceType: job.maintenanceType,
              scheduledDate: job.scheduledDate,
              performedAt: new Date().toISOString().slice(0, 10),
              finished: true,
              notes: job.notes
            },
            NS.security.getCsrf()
          );
          renderLists();
          NS.ui.toast("Maintenance marked finished.", "ok");
        } catch (err) {
          NS.ui.toast(err.message, "err");
        }
      });
    } else {
      forms.innerHTML = "<p class='notice'>View only.</p>";
    }
    renderLists();
  }

  function adminPayments() {
    mountAdminNav();
    var esc = NS.security.escapeHtml;
    var host = document.getElementById("payments-list");
    var form = document.getElementById("payment-form");
    var feeNote = document.getElementById("payment-fee");

    function payable() {
      return NS.domain.allBookings().filter(function (b) {
        return b.status !== "cancelled" && b.status !== "rejected";
      });
    }

    function paidSoFar(bookingId) {
      return NS.domain.payments().reduce(function (sum, p) {
        return p.bookingId === bookingId && p.paymentStatus === "paid" ? sum + (Number(p.amount) || 0) : sum;
      }, 0);
    }

    function fillBookings(selected) {
      var list = payable();
      form.bookingId.innerHTML = list.length
        ? list
            .map(function (b) {
              var u = NS.auth.userById(b.userId);
              return (
                '<option value="' + esc(b.id) + '"' + (b.id === selected ? " selected" : "") + ">" +
                esc((b.ref || b.id) + " · " + (u ? u.firstName + " " + u.lastName : "Customer") + " · " +
                  NS.ui.peso(b.total).replace(/<[^>]+>/g, "") + " · " + b.paymentStatus) +
                "</option>"
              );
            })
            .join("")
        : '<option value="">No open bookings</option>';
    }

    function fillBrands() {
      var brands = NS.domain.PAYMENT_BRANDS[form.method.value] || [];
      form.brand.innerHTML = brands
        .map(function (b) {
          return "<option>" + esc(b) + "</option>";
        })
        .join("");
      form.brand.disabled = form.method.value === "cash";
      form.last4.disabled = form.method.value === "cash";
      if (form.method.value === "cash") form.last4.value = "";
    }

    /* Prefill the amount with the balance still owed on the selected booking. */
    function fillAmount() {
      var b = NS.domain.getBooking(form.bookingId.value);
      if (!b) {
        feeNote.textContent = "";
        return;
      }
      var paid = paidSoFar(b.id);
      var balance = Math.max(0, (Number(b.total) || 0) - paid);
      form.amount.value = (balance || Number(b.total) || 0).toFixed(2);
      var u = NS.auth.userById(b.userId);
      if (u && !form.holder.value) form.holder.value = u.firstName + " " + u.lastName;
      feeNote.innerHTML =
        "Rental fee: " + NS.ui.peso(b.subtotal) + " (" + (b.days || 1) + " day" + (b.days === 1 ? "" : "s") + ")" +
        (Number(b.extras) ? " + driver " + NS.ui.peso(b.extras) : "") +
        " = <strong>" + NS.ui.peso(b.total) + "</strong> · recorded paid " + NS.ui.peso(paid) +
        " · balance " + NS.ui.peso(balance);
    }

    function render() {
      var list = NS.domain.allPayments();
      host.innerHTML = list.length
        ? '<table class="table"><thead><tr><th>Ref</th><th>Booking</th><th>Amount</th><th>Method</th><th>Payer</th><th>Date</th><th>Status</th></tr></thead><tbody>' +
          list
            .map(function (p) {
              return (
                "<tr><td>" +
                esc(p.referenceNumber || p.id) +
                "</td><td>" +
                esc(p.bookingRef || p.bookingId) +
                "</td><td>" +
                NS.ui.peso(p.amount) +
                "</td><td>" +
                esc((p.paymentMethod || "") + (p.brand && p.brand !== "Cash" ? " · " + p.brand : "") + (p.last4 && /^\d{4}$/.test(p.last4) ? " ··" + p.last4 : "")) +
                "</td><td>" +
                esc(p.holder || "") +
                "</td><td>" +
                NS.ui.fmtDate(p.paymentDate) +
                '</td><td><select class="form-select form-select-sm" data-pay-status="' + esc(p.id) + '" aria-label="Payment status">' +
                NS.domain.PAYMENT_STATUSES.map(function (s) {
                  return '<option value="' + s + '"' + ((p.paymentStatus || "paid") === s ? " selected" : "") + ">" + s + "</option>";
                }).join("") +
                "</select></td></tr>"
              );
            })
            .join("") +
          "</tbody></table>"
        : "<p class='notice'>No payment records yet.</p>";
    }

    if (form) {
      NS.ui.bindCsrf(form);
      fillBookings(NS.ui.qs("booking"));
      fillBrands();
      form.paymentDate.value = new Date().toISOString().slice(0, 10);
      fillAmount();
      form.method.addEventListener("change", fillBrands);
      form.bookingId.addEventListener("change", function () {
        form.holder.value = "";
        fillAmount();
      });
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        NS.ui.askYesNo("Save this payment record?", { title: "Record payment" }).then(function (ok) {
          if (!ok) return;
          try {
            var row = NS.domain.recordPayment(
              {
                bookingId: form.bookingId.value,
                amount: form.amount.value,
                paymentDate: form.paymentDate.value,
                method: form.method.value,
                brand: form.brand.value,
                last4: form.last4.value,
                status: form.status.value,
                holder: form.holder.value,
                referenceNumber: form.referenceNumber.value
              },
              form.csrf.value
            );
            var keep = form.bookingId.value;
            form.referenceNumber.value = "";
            form.last4.value = "";
            NS.ui.bindCsrf(form);
            fillBookings(keep);
            fillAmount();
            render();
            NS.ui.toast("Payment " + row.referenceNumber + " saved.", "ok");
          } catch (err) {
            NS.ui.bindCsrf(form);
            NS.ui.toast(err.message, "err");
          }
        });
      });
    }

    host.addEventListener("change", function (e) {
      var id = e.target.getAttribute("data-pay-status");
      if (!id) return;
      try {
        NS.domain.setPaymentStatus(id, e.target.value, NS.security.getCsrf());
        if (form) {
          fillBookings(form.bookingId.value);
          fillAmount();
        }
        NS.ui.toast("Payment status updated.", "ok");
      } catch (err) {
        NS.ui.toast(err.message, "err");
        render();
      }
    });

    render();
  }

  function threadMessagesHtml(thread, hideBookingNotice) {
    return (thread.messages || [])
      .filter(function (m) {
        return !(hideBookingNotice && /^New booking \S+ received\./.test(m.body || ""));
      })
      .map(function (m) {
        return (
          '<div class="chat-line chat-' +
          NS.security.escapeHtml(m.fromRole || "customer") +
          '"><strong>' +
          NS.security.escapeHtml(m.fromName || m.fromRole) +
          "</strong><span>" +
          NS.ui.fmtDate(m.at) +
          "</span><p>" +
          NS.security.escapeHtml(m.body) +
          "</p></div>"
        );
      })
      .join("");
  }

  function adminInbox() {
    mountAdminNav();
    var incomingHost = document.getElementById("incoming-bookings");
    var returnsHost = document.getElementById("pending-returns");
    var listHost = document.getElementById("thread-list");
    var viewHost = document.getElementById("thread-view");
    var selectedId = NS.ui.qs("id") || "";

    function bookingBucket(status) {
      if (status === "pending") return "pending";
      if (status === "completed" || status === "cancelled" || status === "rejected") return "completed";
      return "active";
    }

    function renderIncoming() {
      var filterEl = document.getElementById("incoming-filter");
      var summary = document.getElementById("incoming-summary");
      var filter = filterEl ? filterEl.value : "all";
      var incoming = NS.domain.incomingBookings().slice().sort(function (a, b) {
        return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
      });
      var counts = { pending: 0, active: 0, completed: 0 };
      incoming.forEach(function (b) { counts[bookingBucket(b.status)] += 1; });
      if (summary) {
        summary.textContent = incoming.length + " total · " + counts.pending + " pending · " + counts.active + " active · " + counts.completed + " done · newest first";
      }
      if (filter !== "all") {
        incoming = incoming.filter(function (b) { return bookingBucket(b.status) === filter; });
      }
      incomingHost.innerHTML = incoming.length
        ? incoming
            .map(function (b) {
              var v = NS.domain.getVehicle(b.vehicleId);
              var u = NS.auth.userById(b.userId);
              return (
                '<article class="booking-card"><div><p class="eyebrow">Incoming · Booking ' +
                NS.security.escapeHtml(b.ref) +
                "</p><h3>" +
                NS.security.escapeHtml(v ? v.name : "") +
                "</h3>" +
                bookingDetailList(b) +
                "</div><div>" +
                NS.ui.statusBadge(b.status) +
                " " +
                NS.ui.statusBadge(b.paymentStatus) +
                '<div class="btn-row"><a class="btn btn-ghost btn-sm" href="bookings.html">Open desk</a>' +
                '<button class="btn btn-gold btn-sm" data-open="' +
                b.id +
                '">Message customer</button></div></div></article>'
              );
            })
            .join("")
        : "<p class='notice'>No incoming bookings waiting. New customer bookings show here as soon as they are made.</p>";
    }

    function renderReturns() {
      if (!returnsHost) return;
      var summary = document.getElementById("returns-summary");
      var returns = NS.domain.pendingReturns().slice().sort(function (a, b) {
        return String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || ""));
      });
      if (summary) summary.textContent = returns.length + " waiting · newest first";
      returnsHost.innerHTML = returns.length
        ? returns
            .map(function (b) {
              var v = NS.domain.getVehicle(b.vehicleId);
              var u = NS.auth.userById(b.userId);
              return (
                '<article class="booking-card"><div><p class="eyebrow">Return vehicle · Booking ' +
                NS.security.escapeHtml(b.ref) +
                "</p><h3>" +
                NS.security.escapeHtml(v ? v.name : "") +
                "</h3>" +
                bookingDetailList(b) +
                "</div><div>" +
                NS.ui.statusBadge(b.status) +
                '<div class="btn-row"><button class="btn btn-gold btn-sm" data-accept-return="' +
                b.id +
                '">Accept return</button>' +
                '<button class="btn btn-ghost btn-sm" data-open="' +
                b.id +
                '">Message</button></div></div></article>'
              );
            })
            .join("")
        : "<p class='notice'>No return requests waiting.</p>";
    }

    function renderList() {
      var filterEl = document.getElementById("thread-filter");
      var summary = document.getElementById("thread-summary");
      var list = NS.domain.staffThreads().slice().sort(function (a, b) {
        var am = (a.messages && a.messages[a.messages.length - 1] && a.messages[a.messages.length - 1].at) || a.updatedAt || "";
        var bm = (b.messages && b.messages[b.messages.length - 1] && b.messages[b.messages.length - 1].at) || b.updatedAt || "";
        return String(bm).localeCompare(String(am));
      });
      var unread = list.filter(function (t) { return t.unreadStaff; }).length;
      if (summary) summary.textContent = list.length + " conversations · " + unread + " unread · newest first";
      if (filterEl && filterEl.value === "unread") list = list.filter(function (t) { return t.unreadStaff; });
      listHost.innerHTML = list.length
        ? list
            .map(function (t) {
              return (
                '<button type="button" class="thread-item' +
                (t.id === selectedId ? " active" : "") +
                (t.unreadStaff ? " unread" : "") +
                '" data-thread="' +
                t.id +
                '"><strong>' +
                NS.security.escapeHtml(t.topic) +
                "</strong><span>" +
                NS.security.escapeHtml(t.customerName || "Guest") +
                (t.kind === "return" ? " · return" : "") +
                (t.unreadStaff ? " · new" : "") +
                "</span></button>"
              );
            })
            .join("")
        : "<p class='notice'>No conversations yet.</p>";
    }

    function kindLabel(kind) {
      if (kind === "return") return "Vehicle return";
      if (kind === "booking") return "Booking received";
      return "Customer message";
    }

    function renderThread() {
      if (!selectedId) {
        viewHost.innerHTML = "<p class='notice'>Select a conversation to reply.</p>";
        return;
      }
      var thread = NS.domain.getThread(selectedId);
      if (!thread) {
        viewHost.innerHTML = "<p class='notice'>Conversation not found.</p>";
        return;
      }
      NS.domain.markThreadRead(thread.id);
      var booking = thread.bookingId ? NS.domain.getBooking(thread.bookingId) : null;
      var acceptBlock =
        booking && booking.status === "return_requested"
          ? '<div class="btn-row" style="margin-bottom:1rem"><button class="btn btn-gold" type="button" id="thread-accept-return" data-accept-return="' +
            booking.id +
            '">Accept return</button></div>'
          : "";
      viewHost.innerHTML =
        "<p class='eyebrow'>" +
        NS.security.escapeHtml(kindLabel(thread.kind)) +
        "</p><h3>" +
        NS.security.escapeHtml(thread.topic) +
        "</h3>" +
        (booking
          ? '<div class="thread-booking">' +
            NS.ui.statusBadge(booking.status) +
            " " +
            NS.ui.statusBadge(booking.paymentStatus) +
            bookingDetailList(booking) +
            "</div>"
          : thread.bookingId
          ? '<div class="thread-booking">' + missingBookingDetailList(thread) + "</div>"
          : "<p>" +
            NS.security.escapeHtml(thread.customerName || "") +
            " · " +
            NS.security.escapeHtml(thread.customerEmail || "") +
            " · " +
            NS.security.escapeHtml(thread.customerPhone || "") +
            "</p>") +
        acceptBlock +
        '<div class="chat-log">' +
        threadMessagesHtml(thread, !!booking || !!thread.bookingId) +
        "</div>" +
        '<form id="staff-reply" class="reply-form">' +
        '<label class="field">Reply to customer<textarea class="form-control" name="body" maxlength="500" required></textarea></label>' +
        '<button class="btn btn-gold" type="submit">Send reply</button></form>';
      var form = document.getElementById("staff-reply");
      NS.ui.bindCsrf(form);
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        NS.ui.askYesNo("Send this reply to the customer?", { title: "Save edit" }).then(function (ok) {
          if (!ok) return;
          try {
            NS.domain.replyToThread(thread.id, form.body.value, form.csrf ? form.csrf.value : "");
            NS.ui.toast("Reply sent to customer.", "ok");
            renderList();
            renderThread();
            mountAdminNav();
          } catch (err) {
            NS.ui.toast(err.message, "err");
          }
        });
      });
      var acceptBtn = document.getElementById("thread-accept-return");
      if (acceptBtn) {
        acceptBtn.addEventListener("click", function () {
          var id = acceptBtn.getAttribute("data-accept-return");
          NS.ui
            .askYesNo("Accept this vehicle return and complete the trip?", {
              title: "Accept return",
              yes: "Yes",
              no: "No"
            })
            .then(function (ok) {
              if (!ok) return;
              try {
                NS.domain.acceptVehicleReturn(id, NS.security.getCsrf());
                NS.ui.toast("Return accepted. Trip completed.", "ok");
                renderReturns();
                renderList();
                renderThread();
                mountAdminNav();
              } catch (err) {
                NS.ui.toast(err.message, "err");
              }
            });
        });
      }
    }

    function acceptReturn(id) {
      NS.ui
        .askYesNo("Accept this vehicle return and complete the trip?", {
          title: "Accept return",
          yes: "Yes",
          no: "No"
        })
        .then(function (ok) {
          if (!ok) return;
          try {
            NS.domain.acceptVehicleReturn(id, NS.security.getCsrf());
            NS.ui.toast("Return accepted. Trip completed.", "ok");
            renderReturns();
            renderList();
            renderThread();
            mountAdminNav();
          } catch (err) {
            NS.ui.toast(err.message, "err");
          }
        });
    }

    incomingHost.addEventListener("click", function (e) {
      var id = e.target.getAttribute("data-open");
      if (!id) return;
      try {
        var thread = NS.domain.ensureBookingThread(id);
        selectedId = thread.id;
        renderList();
        renderThread();
      } catch (err) {
        NS.ui.toast(err.message, "err");
      }
    });

    if (returnsHost) {
      returnsHost.addEventListener("click", function (e) {
        var acceptId = e.target.getAttribute("data-accept-return");
        if (acceptId) {
          acceptReturn(acceptId);
          return;
        }
        var id = e.target.getAttribute("data-open");
        if (!id) return;
        try {
          var thread = NS.domain.ensureBookingThread(id);
          selectedId = thread.id;
          renderList();
          renderThread();
        } catch (err) {
          NS.ui.toast(err.message, "err");
        }
      });
    }

    listHost.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-thread]");
      if (!btn) return;
      selectedId = btn.getAttribute("data-thread");
      renderList();
      renderThread();
    });

    var incomingFilter = document.getElementById("incoming-filter");
    var threadFilter = document.getElementById("thread-filter");
    if (incomingFilter) incomingFilter.addEventListener("change", renderIncoming);
    if (threadFilter) threadFilter.addEventListener("change", renderList);

    renderIncoming();
    renderReturns();
    renderList();
    renderThread();
  }

  NS.admin = NS.admin || {};
  NS.admin.mountNav = mountAdminNav;
  NS.pages.adminHome = adminHome;
  NS.pages.adminVehicles = adminVehicles;
  NS.pages.adminBookings = adminBookings;
  NS.pages.adminCustomers = adminCustomers;
  NS.pages.adminReports = adminReports;
  NS.pages.adminSecurityLog = adminSecurityLog;
  NS.pages.adminDrivers = adminDrivers;
  NS.pages.adminFleetOps = adminFleetOps;
  NS.pages.adminPayments = adminPayments;
  NS.pages.adminInbox = adminInbox;
})(window);
