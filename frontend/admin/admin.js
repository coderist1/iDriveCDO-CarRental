(function (global) {
  "use strict";

  var NS = (global.iDrive = global.iDrive || {});
  NS.pages = NS.pages || {};

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
      link("index.html", "Overview", "adminHome", icon('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>')) +
      link("inbox.html", "Inbox", "adminInbox", icon('<path d="M4 6h16v12H4z"/><path d="m4 7 8 6 8-6"/>'), unread) +
      link("bookings.html", "Bookings", "adminBookings", icon('<path d="M8 7V5h8v2"/><rect x="5" y="7" width="14" height="13" rx="2"/>'), returns) +
      link("payments.html", "Payments", "adminPayments", icon('<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10h18"/>'));
    var fleet =
      link("vehicles.html", "Vehicles", "adminVehicles", icon('<path d="M5 16h14l-1.5-7h-11z"/><circle cx="7.5" cy="17.5" r="1.5"/><circle cx="16.5" cy="17.5" r="1.5"/>')) +
      link("fleet-ops.html", "Registration & service", "adminFleetOps", icon('<path d="M12 3v4"/><circle cx="12" cy="14" r="7"/><path d="M12 11v3l2 2"/>')) +
      link("drivers.html", "Drivers", "adminDrivers", icon('<circle cx="12" cy="8" r="3"/><path d="M5 20c1.5-3.5 4-5 7-5s5.5 1.5 7 5"/>'));
    var people = isAdmin
      ? group(
          "People",
          link("customers.html", "Users", "adminCustomers", icon('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'))
        )
      : "";
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
      shortcuts.innerHTML =
        '<a class="desk-shortcut" href="inbox.html"><strong>Inbox</strong><span>Messages & returns</span></a>' +
        '<a class="desk-shortcut" href="bookings.html"><strong>Bookings</strong><span>Confirm and complete trips</span></a>' +
        '<a class="desk-shortcut" href="payments.html"><strong>Payments</strong><span>Cash and cashless records</span></a>' +
        '<a class="desk-shortcut" href="vehicles.html"><strong>Fleet</strong><span>Cars, plates, and rates</span></a>' +
        '<a class="desk-shortcut" href="drivers.html"><strong>Drivers</strong><span>Chauffeur roster</span></a>' +
        '<a class="desk-shortcut" href="reports.html"><strong>Reports</strong><span>Revenue and mix</span></a>';
    }
    var recentHost = document.getElementById("admin-recent");
    recentHost.innerHTML = incoming.length
      ? incoming
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
      : "<p class='notice'>No incoming bookings yet. New customer bookings appear here.</p>";
    var returnsHost = document.getElementById("admin-returns");
    if (returnsHost) {
      returnsHost.innerHTML = returns.length
        ? returns
            .map(function (b) {
              var v = NS.domain.getVehicle(b.vehicleId);
              var u = NS.auth.userById(b.userId);
              return (
                '<article class="booking-card"><div><p class="eyebrow">Return requested</p><h3>' +
                NS.security.escapeHtml(b.ref) +
                "</h3><p>" +
                NS.security.escapeHtml(u ? u.firstName + " " + u.lastName : "Customer") +
                " · " +
                NS.security.escapeHtml(v ? v.name : "") +
                "<br>" +
                NS.security.escapeHtml(b.dropoff || "") +
                (b.returnNotes ? "<br>Notes: " + NS.security.escapeHtml(b.returnNotes) : "") +
                "</p></div><div>" +
                NS.ui.statusBadge(b.status) +
                '<div class="btn-row"><button class="btn btn-gold btn-sm" data-accept-return="' +
                b.id +
                '">Accept return</button>' +
                '<a class="btn btn-ghost btn-sm" href="inbox.html">Open inbox</a></div></div></article>'
              );
            })
            .join("")
        : "<p class='notice'>No vehicle returns waiting.</p>";
      returnsHost.onclick = function (e) {
        var id = e.target.getAttribute("data-accept-return");
        if (!id) return;
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
              adminHome();
            } catch (err) {
              NS.ui.toast(err.message, "err");
            }
          });
      };
    }
  }

  function adminVehicles() {
    mountAdminNav();
    var desk = document.getElementById("vehicle-desk");
    if (!desk) return;
    var isAdmin = NS.auth.hasRole("admin");
    var form = document.getElementById("vehicle-form");
    var editor = document.getElementById("vehicle-editor");
    var formTitle = document.getElementById("vehicle-form-title");
    var grid = document.getElementById("vehicle-fleet-grid");
    var stats = document.getElementById("fleet-stats");
    var heroActions = document.getElementById("fleet-hero-actions");
    var filterStatus = document.getElementById("fleet-filter");
    var filterType = document.getElementById("fleet-type-filter");

    if (heroActions) {
      heroActions.innerHTML = isAdmin
        ? '<button class="btn btn-gold" type="button" id="fleet-add-btn">Add vehicle</button>' +
          '<a class="btn btn-ghost" href="fleet-ops.html">Fleet ops</a>'
        : '<a class="btn btn-ghost" href="fleet-ops.html">View fleet ops</a>';
    }

    function openEditor(v) {
      if (!isAdmin || !editor || !form) return;
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

    function renderStats(list) {
      if (!stats) return;
      var available = list.filter(function (v) {
        return v.status === "available";
      }).length;
      var maintenance = list.filter(function (v) {
        return v.status === "maintenance";
      }).length;
      stats.innerHTML =
        '<div class="stat"><span>' +
        list.length +
        "</span>vehicles</div>" +
        '<div class="stat"><span>' +
        available +
        "</span>available</div>" +
        '<div class="stat"><span>' +
        maintenance +
        "</span>maintenance</div>" +
        '<div class="stat"><span>' +
        list.filter(function (v) {
          return v.type === "SUV" || v.type === "Van";
        }).length +
        "</span>group cars</div>";
    }

    function render() {
      var all = NS.domain.vehicles();
      renderStats(all);
      var statusVal = filterStatus ? filterStatus.value : "";
      var typeVal = filterType ? filterType.value : "";
      var list = all.filter(function (v) {
        if (statusVal && v.status !== statusVal) return false;
        if (typeVal && v.type !== typeVal) return false;
        return true;
      });
      grid.innerHTML = list.length
        ? list
            .map(function (v) {
              return (
                '<article class="fleet-admin-card">' +
                '<div class="fleet-admin-photo">' +
                (v.image
                  ? '<img src="' + NS.security.escapeHtml(v.image) + '" alt="' + NS.security.escapeHtml(v.name) + '">'
                  : '<div class="fleet-admin-photo-empty">No photo</div>') +
                NS.ui.statusBadge(v.status) +
                "</div>" +
                '<div class="fleet-admin-body">' +
                '<p class="eyebrow">' +
                NS.security.escapeHtml(v.type) +
                " · " +
                NS.security.escapeHtml(v.transmission) +
                "</p>" +
                "<h3>" +
                NS.security.escapeHtml(v.name) +
                "</h3>" +
                '<p class="fleet-admin-meta">' +
                NS.security.escapeHtml(v.plate) +
                " · " +
                NS.security.escapeHtml(v.fuel || "") +
                " · " +
                (v.seats || 0) +
                " seats" +
                (v.mileage ? " · " + Number(v.mileage).toLocaleString() + " km" : "") +
                "</p>" +
                '<div class="fleet-admin-foot">' +
                "<strong>" +
                NS.ui.peso(v.dailyRate) +
                "<span>/day</span></strong>" +
                (isAdmin
                  ? '<div class="btn-row"><button class="btn btn-ghost btn-sm" type="button" data-edit="' +
                    v.id +
                    '">Edit</button><button class="btn btn-ghost btn-sm" type="button" data-del="' +
                    v.id +
                    '">Remove</button></div>'
                  : "") +
                "</div></div></article>"
              );
            })
            .join("")
        : "<p class='notice'>No vehicles match those filters.</p>";
    }

    if (!isAdmin && editor) editor.hidden = true;

    if (isAdmin && form) {
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
          if (b.status === "pending" && b.paymentStatus !== "paid") {
            actions += '<span class="fineprint">Awaiting customer payment</span>';
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
            '<article class="booking-card"><div><p class="eyebrow">' +
            NS.security.escapeHtml(b.ref) +
            "</p><h3>" +
            NS.security.escapeHtml(v ? v.name : "") +
            "</h3><p>" +
            NS.security.escapeHtml(u ? u.firstName + " " + u.lastName : "") +
            " · " +
            NS.security.escapeHtml(u ? u.phone || "" : "") +
            "<br>" +
            NS.security.escapeHtml(u ? u.email || "" : "") +
            "<br>" +
            NS.ui.fmtDate(b.startDate) +
            " → " +
            NS.ui.fmtDate(b.endDate) +
            (b.returnNotes ? "<br>Return notes: " + NS.security.escapeHtml(b.returnNotes) : "") +
            (b.notes ? "<br>Notes: " + NS.security.escapeHtml(b.notes) : "") +
            "</p></div><div>" +
            NS.ui.statusBadge(b.status) +
            " " +
            NS.ui.statusBadge(b.paymentStatus) +
            "<p>" +
            NS.ui.peso(b.total) +
            "</p>" +
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
    if (!NS.auth.hasRole("admin")) {
      location.replace("index.html");
      return;
    }
    var host = document.getElementById("customer-table");
    function render() {
      host.innerHTML = NS.auth
        .listUsers()
        .filter(function (u) {
          return u.role !== "admin";
        })
        .map(function (u) {
          return (
            "<tr><td class=\"customer-cell\">" +
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
            '</td><td><button class="btn btn-ghost btn-sm" data-id="' +
            u.id +
            '" data-status="' +
            (u.status === "active" ? "disabled" : "active") +
            '">' +
            (u.status === "active" ? "Disable" : "Enable") +
            "</button></td></tr>"
          );
        })
        .join("");
    }
    host.addEventListener("click", function (e) {
      var id = e.target.getAttribute("data-id");
      var status = e.target.getAttribute("data-status");
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
              (isAdmin
                ? '<div class="btn-row"><button class="btn btn-ghost btn-sm" data-edit="' +
                  d.id +
                  '">Edit</button><button class="btn btn-ghost btn-sm" data-del="' +
                  d.id +
                  '">Remove</button></div>'
                : "") +
              "</div></article>"
            );
          })
          .join("") || "<p class='notice'>No drivers yet.</p>";
    }

    if (isAdmin) {
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
      formWrap.innerHTML = "<p class='notice'>View only. Admin manages Driver_Details.</p>";
    }
    render();
  }

  function adminFleetOps() {
    mountAdminNav();
    var isAdmin = NS.auth.hasRole("admin");
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
            (isAdmin && !m.finished
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

    if (isAdmin) {
      forms.innerHTML =
        '<div class="form-card">' +
        "<h3>Save registration</h3>" +
        '<form id="reg-form" class="row g-2 align-items-end">' +
        '<div class="col-md-5"><label class="field">Vehicle <select class="form-select" name="vehicleId" required>' +
        vehicleOptionsHtml() +
        "</select></label></div>" +
        '<div class="col-md-2"><label class="field">Renewal day <input class="form-control" name="renewalScheduledDay" placeholder="15"></label></div>' +
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
      forms.innerHTML = "<p class='notice'>View only. Admin manages vehicle registration, maintenance, and fuel records.</p>";
    }
    renderLists();
  }

  function adminPayments() {
    mountAdminNav();
    var host = document.getElementById("payments-list");
    var list = NS.domain.allPayments();
    host.innerHTML = list.length
      ? '<table class="table"><thead><tr><th>Ref</th><th>Booking</th><th>Amount</th><th>Method</th><th>Status</th><th>Date</th></tr></thead><tbody>' +
        list
          .map(function (p) {
            return (
              "<tr><td>" +
              NS.security.escapeHtml(p.referenceNumber || p.id) +
              "</td><td>" +
              NS.security.escapeHtml(p.bookingRef || p.bookingId) +
              "</td><td>" +
              NS.ui.peso(p.amount) +
              "</td><td>" +
              NS.security.escapeHtml(p.paymentMethod || "") +
              "</td><td>" +
              NS.ui.statusBadge(p.paymentStatus || "paid") +
              "</td><td>" +
              NS.ui.fmtDate(p.paymentDate) +
              "</td></tr>"
            );
          })
          .join("") +
        "</tbody></table>"
      : "<p class='notice'>No payment records yet.</p>";
  }

  function threadMessagesHtml(thread) {
    return (thread.messages || [])
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

    function renderIncoming() {
      var incoming = NS.domain.incomingBookings();
      incomingHost.innerHTML = incoming.length
        ? incoming
            .map(function (b) {
              var v = NS.domain.getVehicle(b.vehicleId);
              var u = NS.auth.userById(b.userId);
              return (
                '<article class="booking-card"><div><p class="eyebrow">Incoming</p><h3>' +
                NS.security.escapeHtml(b.ref) +
                "</h3><p>" +
                NS.security.escapeHtml(u ? u.firstName + " " + u.lastName : "Customer") +
                " · " +
                NS.security.escapeHtml(u ? u.phone || "" : "") +
                "<br>" +
                NS.security.escapeHtml(u ? u.email || "" : "") +
                "<br>" +
                NS.security.escapeHtml(v ? v.name : "") +
                " · " +
                NS.ui.fmtDate(b.startDate) +
                " → " +
                NS.ui.fmtDate(b.endDate) +
                "</p></div><div>" +
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
      var returns = NS.domain.pendingReturns();
      returnsHost.innerHTML = returns.length
        ? returns
            .map(function (b) {
              var v = NS.domain.getVehicle(b.vehicleId);
              var u = NS.auth.userById(b.userId);
              return (
                '<article class="booking-card"><div><p class="eyebrow">Return vehicle</p><h3>' +
                NS.security.escapeHtml(b.ref) +
                "</h3><p>" +
                NS.security.escapeHtml(u ? u.firstName + " " + u.lastName : "Customer") +
                " · " +
                NS.security.escapeHtml(u ? u.phone || "" : "") +
                "<br>" +
                NS.security.escapeHtml(v ? v.name : "") +
                "<br>Drop-off: " +
                NS.security.escapeHtml(b.dropoff || "—") +
                (b.returnNotes ? "<br>Notes: " + NS.security.escapeHtml(b.returnNotes) : "") +
                "</p></div><div>" +
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
      var list = NS.domain.staffThreads();
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
        "</h3><p>" +
        NS.security.escapeHtml(thread.customerName || "") +
        " · " +
        NS.security.escapeHtml(thread.customerEmail || "") +
        " · " +
        NS.security.escapeHtml(thread.customerPhone || "") +
        "</p>" +
        acceptBlock +
        '<div class="chat-log">' +
        threadMessagesHtml(thread) +
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

    renderIncoming();
    renderReturns();
    renderList();
    renderThread();
  }

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
