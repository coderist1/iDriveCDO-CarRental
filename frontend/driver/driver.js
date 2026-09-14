/**
 * Driver self-service: view assigned trips, update trip and fuel status.
 */
(function (global) {
  "use strict";

  var NS = (global.iDrive = global.iDrive || {});
  NS.pages = NS.pages || {};

  function esc(value) {
    return NS.security.escapeHtml(value == null ? "" : String(value));
  }

  function csrf() {
    try {
      return NS.security.getCsrf ? NS.security.getCsrf() : "";
    } catch (e) {
      return "";
    }
  }

  function isActive(status) {
    return status === "confirmed" || status === "ongoing" || status === "return_requested";
  }

  NS.pages.driverHome = function driverHome() {
    var activeHost = document.getElementById("driver-active");
    var historyHost = document.getElementById("driver-history");
    var statsHost = document.getElementById("driver-stats");
    var greeting = document.getElementById("driver-greeting");
    var identity = document.getElementById("driver-identity");
    var filterEl = document.getElementById("driver-filter");
    if (!activeHost || !historyHost) return;

    var me = NS.auth.current();
    var driver = NS.domain.currentDriver ? NS.domain.currentDriver() : null;
    var FUEL = NS.domain.DRIVER_FUEL_LEVELS || ["Full", "3/4", "1/2", "1/4", "Empty"];
    var dutyPills = document.getElementById("status-pills");

    if (greeting && me) {
      greeting.textContent =
        "Welcome, " + me.firstName + ". Start trips, log fuel, and close out assigned chauffeur bookings.";
    }

    if (!driver) {
      if (statsHost) statsHost.innerHTML = "";
      if (identity) identity.innerHTML = "";
      if (dutyPills) dutyPills.innerHTML = "";
      activeHost.innerHTML =
        "<p class='notice'>No driver profile is linked to this account yet. Ask the desk to link your driver record.</p>";
      historyHost.innerHTML = "";
      return;
    }

    function dutyOf(d) {
      return d && d.dutyStatus === "on_call" ? "on_call" : "regular";
    }

    function renderIdentity() {
      driver = NS.domain.currentDriver();
      if (!driver) return;
      var duty = dutyOf(driver);
      if (identity) {
        identity.innerHTML =
          '<div class="driver-id-card">' +
          "<strong>" +
          esc(driver.fullName) +
          "</strong>" +
          "<span>" +
          esc(driver.driverLicense) +
          " · " +
          esc(driver.typeDriverLicense || "Professional") +
          "</span>" +
          '<div class="driver-id-badges">' +
          (NS.ui.statusBadge ? NS.ui.statusBadge(duty) : "") +
          '<span class="role-pill">' +
          (driver.status === "active" ? "On roster" : "Inactive") +
          "</span>" +
          "</div></div>";
      }
      if (dutyPills) {
        dutyPills.innerHTML =
          '<span class="driver-duty-label">Duty status</span>' +
          '<span class="status-pill-view' +
          (duty === "regular" ? " is-active" : "") +
          '">' +
          (NS.ui.statusBadge ? NS.ui.statusBadge("regular") : "Regular") +
          "</span>" +
          '<span class="status-pill-view' +
          (duty === "on_call" ? " is-active" : "") +
          '">' +
          (NS.ui.statusBadge ? NS.ui.statusBadge("on_call") : "On call") +
          "</span>" +
          '<span class="driver-duty-hint">Assigned by admin</span>';
      }
    }

    renderIdentity();

    if (filterEl && filterEl.getAttribute("data-bound") !== "1") {
      filterEl.setAttribute("data-bound", "1");
      filterEl.addEventListener("change", render);
    }

    render();

    function currentFilter() {
      return filterEl && filterEl.value ? filterEl.value : "active";
    }

    function render() {
      var trips = NS.domain.driverTrips();
      var filter = currentFilter();
      var upcoming = 0;
      var ongoing = 0;
      var done = 0;

      trips.forEach(function (t) {
        if (t.status === "confirmed") upcoming++;
        if (t.status === "ongoing" || t.status === "return_requested") ongoing++;
        if (t.status === "completed") done++;
      });

      if (statsHost) {
        statsHost.innerHTML =
          stat("Assigned", trips.length) +
          stat("Upcoming", upcoming) +
          stat("Ongoing", ongoing) +
          stat("Completed", done);
      }

      var active = trips.filter(function (t) {
        return isActive(t.status);
      });
      var history = trips.filter(function (t) {
        return !isActive(t.status);
      });

      if (filter === "ongoing") {
        active = trips.filter(function (t) {
          return t.status === "ongoing" || t.status === "return_requested";
        });
        history = [];
      } else if (filter === "completed") {
        active = [];
        history = trips.filter(function (t) {
          return t.status === "completed";
        });
      } else if (filter === "all") {
        // keep both sections
      } else {
        // active & upcoming — hide completed
        history = [];
      }

      activeHost.innerHTML = section(
        filter === "ongoing" ? "Ongoing now" : "Active & upcoming",
        active,
        "No active trips in this view."
      );
      historyHost.innerHTML =
        filter === "active" || filter === "ongoing"
          ? ""
          : section(
              filter === "completed" ? "Completed trips" : "History",
              history,
              "No completed trips yet."
            );

      bind(activeHost);
      bind(historyHost);
    }

    function section(title, list, emptyMsg) {
      return (
        '<div class="driver-queue">' +
        "<h3>" +
        esc(title) +
        ' <span class="nav-count">' +
        list.length +
        "</span></h3>" +
        (list.length
          ? '<div class="driver-trips">' + list.map(card).join("") + "</div>"
          : "<p class='notice'>" + esc(emptyMsg) + "</p>") +
        "</div>"
      );
    }

    function stat(label, n) {
      return '<div class="stat"><span>' + n + "</span>" + esc(label) + "</div>";
    }

    function meta(label, value) {
      return (
        '<div class="driver-meta"><span>' + esc(label) + "</span><strong>" + value + "</strong></div>"
      );
    }

    function card(b) {
      var v = NS.domain.getVehicle(b.vehicleId);
      var cust = NS.auth.userById ? NS.auth.userById(b.userId) : null;
      var custName = cust ? cust.firstName + " " + cust.lastName : "Customer";
      var custPhone = cust ? cust.phone : "";
      var badge = NS.ui.statusBadge ? NS.ui.statusBadge(b.status) : esc(b.status);
      var canFuel = b.status === "confirmed" || b.status === "ongoing";
      var fuelLabel = b.status === "confirmed" ? "Fuel before trip" : "Fuel on return";
      var fuelNow = b.status === "confirmed" ? b.fuelBeforeRent || "" : b.fuelUponReturn || "";
      var photo =
        v && v.image
          ? '<img src="' + esc(v.image) + '" alt="">'
          : '<div class="driver-photo-empty">' + esc(v && v.type ? v.type : "Car") + "</div>";

      var actions = "";
      if (b.status === "confirmed") {
        actions =
          '<button class="btn btn-gold" type="button" data-start="' +
          b.id +
          '">Start trip</button>';
      } else if (b.status === "ongoing") {
        actions =
          '<button class="btn btn-gold" type="button" data-end="' +
          b.id +
          '">End trip</button>';
      }

      var fuelBlock = canFuel
        ? '<div class="driver-ops">' +
          '<div class="driver-ops-label">' +
          esc(fuelLabel) +
          "</div>" +
          '<div class="driver-fuel">' +
          '<label class="field"><span class="visually-hidden">' +
          esc(fuelLabel) +
          "</span>" +
          '<select class="form-select" data-fuel-select="' +
          b.id +
          '">' +
          FUEL.map(function (f) {
            return (
              '<option value="' +
              esc(f) +
              '"' +
              (f === fuelNow ? " selected" : "") +
              ">" +
              esc(f) +
              "</option>"
            );
          }).join("") +
          "</select></label>" +
          '<button class="btn btn-ghost" type="button" data-fuel-save="' +
          b.id +
          '">Save fuel</button>' +
          "</div></div>"
        : '<div class="driver-ops driver-ops-done">' +
          '<div class="driver-ops-label">Fuel record</div>' +
          "<p>" +
          esc(b.fuelBeforeRent || "—") +
          " out · " +
          esc(b.fuelUponReturn || "—") +
          " in</p></div>";

      return (
        '<article class="driver-trip' +
        (b.status === "ongoing" ? " is-ongoing" : "") +
        (b.status === "completed" ? " is-done" : "") +
        '">' +
        '<div class="driver-photo">' +
        photo +
        "</div>" +
        '<div class="driver-body">' +
        '<div class="driver-trip-head">' +
        "<div>" +
        "<h3>" +
        esc(v ? v.name : "Vehicle") +
        "</h3>" +
        '<p class="driver-ref">' +
        esc(b.ref) +
        (v && v.plate ? " · " + esc(v.plate) : "") +
        "</p>" +
        "</div>" +
        badge +
        "</div>" +
        '<div class="driver-route">' +
        '<div class="driver-stop"><span>Pickup</span><strong>' +
        esc(b.pickup || "—") +
        "</strong>" +
        (b.pickupTime ? "<em>" + esc(b.pickupTime) + "</em>" : "") +
        "</div>" +
        '<div class="driver-route-arrow" aria-hidden="true">→</div>' +
        '<div class="driver-stop"><span>Drop-off</span><strong>' +
        esc(b.dropoff || "—") +
        "</strong>" +
        (b.returnTime ? "<em>" + esc(b.returnTime) + "</em>" : "") +
        "</div>" +
        "</div>" +
        '<div class="driver-meta-row">' +
        meta("Dates", esc(b.startDate) + " → " + esc(b.endDate)) +
        meta("Days", esc(b.days || 1)) +
        meta("Passengers", esc(b.numberOfPassengers || 1)) +
        meta(
          "Customer",
          esc(custName) + (custPhone ? '<br><span class="driver-phone">' + esc(custPhone) + "</span>" : "")
        ) +
        "</div>" +
        (b.notes ? '<p class="driver-notes">' + esc(b.notes) + "</p>" : "") +
        '<div class="driver-footer">' +
        fuelBlock +
        (actions ? '<div class="driver-actions">' + actions + "</div>" : "") +
        "</div>" +
        "</div></article>"
      );
    }

    function bind(root) {
      if (!root) return;
      root.querySelectorAll("[data-start]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          run(function () {
            NS.domain.driverSetTripStatus(btn.getAttribute("data-start"), "ongoing", csrf());
          }, "Trip started.");
        });
      });
      root.querySelectorAll("[data-end]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          if (!global.confirm("End this trip and mark the vehicle returned?")) return;
          run(function () {
            NS.domain.driverSetTripStatus(btn.getAttribute("data-end"), "completed", csrf());
          }, "Trip completed.");
        });
      });
      root.querySelectorAll("[data-fuel-save]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var id = btn.getAttribute("data-fuel-save");
          var sel = root.querySelector('[data-fuel-select="' + id + '"]');
          var level = sel ? sel.value : "";
          run(function () {
            NS.domain.driverUpdateFuel(id, level, csrf());
          }, "Fuel status updated.");
        });
      });
    }

    function run(fn, okMsg) {
      try {
        fn();
        if (NS.ui && NS.ui.toast) NS.ui.toast(okMsg, "ok");
        render();
      } catch (e) {
        if (NS.ui && NS.ui.toast) NS.ui.toast(e.message || "Action failed.", "err");
      }
    }
  };
})(window);
