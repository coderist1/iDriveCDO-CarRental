(function (global) {
  "use strict";

  var NS = (global.iDrive = global.iDrive || {});
  NS.pages = NS.pages || {};

  function mountAdminNav() {
    var host = document.getElementById("admin-side");
    if (!host) return;
    var page = document.body.getAttribute("data-page");
    var links = [
      ["index.html", "Overview", "adminHome"],
      ["vehicles.html", "Fleet desk", "adminVehicles"],
      ["bookings.html", "Bookings", "adminBookings"],
      ["customers.html", "Customers", "adminCustomers"],
      ["reports.html", "Reports", "adminReports"]
    ];
    if (!NS.auth.hasRole("admin")) {
      links = links.filter(function (l) {
        return l[2] !== "adminCustomers";
      });
    }
    host.innerHTML =
      '<aside class="admin-side"><p class="eyebrow">Operations</p>' +
      links
        .map(function (l) {
          return (
            '<a class="' +
            (page === l[2] ? "active" : "") +
            '" href="' +
            l[0] +
            '">' +
            l[1] +
            "</a>"
          );
        })
        .join("") +
      '<a href="' +
      NS.routes.href("account") +
      '">My account</a></aside>';
  }

  function adminHome() {
    mountAdminNav();
    var r = NS.domain.report();
    document.getElementById("kpi-row").innerHTML =
      '<div class="stat"><span>' +
      r.bookings +
      "</span>bookings</div>" +
      '<div class="stat"><span>' +
      r.vehicles +
      "</span>vehicles</div>" +
      '<div class="stat"><span>' +
      r.customers +
      "</span>customers</div>" +
      '<div class="stat"><span>' +
      NS.ui.peso(r.revenue) +
      "</span>paid revenue</div>";
    var recent = NS.domain.allBookings().slice(0, 6);
    document.getElementById("admin-recent").innerHTML = recent
      .map(function (b) {
        var v = NS.domain.getVehicle(b.vehicleId);
        var u = NS.auth.userById(b.userId);
        return (
          '<a class="row-link" href="bookings.html"><strong>' +
          NS.security.escapeHtml(b.ref) +
          "</strong><span>" +
          NS.security.escapeHtml(u ? u.firstName + " " + u.lastName : "") +
          " · " +
          NS.security.escapeHtml(v ? v.name : "") +
          "</span>" +
          NS.ui.statusBadge(b.status) +
          "</a>"
        );
      })
      .join("");
  }

  function adminVehicles() {
    mountAdminNav();
    if (!NS.auth.hasRole("admin")) {
      document.getElementById("vehicle-desk").innerHTML = "<p class='notice'>Only admins can edit the fleet. Staff may view bookings instead.</p>";
      return;
    }
    var form = document.getElementById("vehicle-form");
    NS.ui.bindCsrf(form);
    function render() {
      document.getElementById("vehicle-table").innerHTML = NS.domain
        .vehicles()
        .map(function (v) {
          return (
            "<tr><td>" +
            NS.security.escapeHtml(v.name) +
            "</td><td>" +
            NS.security.escapeHtml(v.plate) +
            "</td><td>" +
            NS.ui.peso(v.dailyRate) +
            "</td><td>" +
            NS.ui.statusBadge(v.status) +
            '</td><td><button class="btn btn-ghost btn-sm" data-edit="' +
            v.id +
            '">Edit</button> <button class="btn btn-ghost btn-sm" data-del="' +
            v.id +
            '">Remove</button></td></tr>'
          );
        })
        .join("");
    }
    render();
    document.getElementById("vehicle-table").addEventListener("click", function (e) {
      var edit = e.target.getAttribute("data-edit");
      var del = e.target.getAttribute("data-del");
      if (edit) {
        var v = NS.domain.getVehicle(edit);
        form.vehicleId.value = v.id;
        form.name.value = v.name;
        form.brand.value = v.brand;
        form.model.value = v.model;
        form.year.value = v.year;
        form.type.value = v.type;
        form.transmission.value = v.transmission;
        form.fuel.value = v.fuel;
        form.seats.value = v.seats;
        form.luggage.value = v.luggage;
        form.dailyRate.value = v.dailyRate;
        form.plate.value = v.plate;
        form.image.value = v.image;
        form.description.value = v.description;
        form.features.value = (v.features || []).join(", ");
        form.status.value = v.status;
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
      if (del && confirm("Remove this vehicle from the fleet?")) {
        try {
          NS.domain.removeVehicle(del, NS.security.getCsrf());
          NS.ui.bindCsrf(form);
          render();
          NS.ui.toast("Vehicle removed.", "ok");
        } catch (err) {
          NS.ui.toast(err.message, "err");
        }
      }
    });
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      try {
        NS.domain.saveVehicle(
          {
            id: form.vehicleId.value || undefined,
            name: form.name.value,
            brand: form.brand.value,
            model: form.model.value,
            year: form.year.value,
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
        form.reset();
        form.vehicleId.value = "";
        NS.ui.bindCsrf(form);
        render();
        NS.ui.toast("Fleet updated.", "ok");
      } catch (err) {
        NS.ui.bindCsrf(form);
        NS.ui.toast(err.message, "err");
      }
    });
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
          if (b.status === "confirmed") {
            actions += '<button class="btn btn-dark btn-sm" data-act="ongoing" data-id="' + b.id + '">Start trip</button>';
          }
          if (b.status === "ongoing") {
            actions += '<button class="btn btn-gold btn-sm" data-act="completed" data-id="' + b.id + '">Complete</button>';
          }
          return (
            '<article class="booking-card"><div><p class="eyebrow">' +
            NS.security.escapeHtml(b.ref) +
            "</p><h3>" +
            NS.security.escapeHtml(v ? v.name : "") +
            "</h3><p>" +
            NS.security.escapeHtml(u ? u.firstName + " " + u.lastName : "") +
            " · " +
            NS.ui.fmtDate(b.startDate) +
            " → " +
            NS.ui.fmtDate(b.endDate) +
            "</p></div><div>" +
            NS.ui.statusBadge(b.status) +
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
      var act = e.target.getAttribute("data-act");
      var id = e.target.getAttribute("data-id");
      if (!act) return;
      try {
        NS.domain.setBookingStatus(id, act, NS.security.getCsrf());
        render();
        NS.ui.toast("Booking updated.", "ok");
      } catch (err) {
        NS.ui.toast(err.message, "err");
      }
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
      try {
        NS.auth.setUserStatus(id, status, NS.security.getCsrf());
        render();
        NS.ui.toast("Account updated.", "ok");
      } catch (err) {
        NS.ui.toast(err.message, "err");
      }
    });
    render();
  }

  function adminReports() {
    mountAdminNav();
    var r = NS.domain.report();
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
      .join(" ");
    document.getElementById("audit-list").innerHTML = NS.domain
      .auditLog()
      .slice(0, 20)
      .map(function (a) {
        return (
          "<li><strong>" +
          NS.security.escapeHtml(a.action) +
          "</strong> — " +
          NS.security.escapeHtml(a.detail) +
          " <em>" +
          NS.ui.fmtDate(a.at) +
          "</em></li>"
        );
      })
      .join("");
    document.getElementById("inbox-list").innerHTML = (NS.store.get("inbox", []) || [])
      .map(function (m) {
        return (
          "<li><strong>" +
          NS.security.escapeHtml(m.name) +
          "</strong> (" +
          NS.security.escapeHtml(m.email) +
          ")<br>" +
          NS.security.escapeHtml(m.message) +
          "</li>"
        );
      })
      .join("") || "<li>No messages.</li>";
  }

  NS.pages.adminHome = adminHome;
  NS.pages.adminVehicles = adminVehicles;
  NS.pages.adminBookings = adminBookings;
  NS.pages.adminCustomers = adminCustomers;
  NS.pages.adminReports = adminReports;
})(window);
