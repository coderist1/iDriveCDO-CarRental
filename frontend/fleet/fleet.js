(function (global) {
  "use strict";

  var NS = (global.iDrive = global.iDrive || {});
  NS.pages = NS.pages || {};

  NS.pages.fleet = function fleet() {
    var host = document.getElementById("fleet-grid");
    var empty = document.getElementById("fleet-empty");
    var summary = document.getElementById("fleet-summary");
    if (!host) return;

    var type = document.getElementById("filter-type");
    var trans = document.getElementById("filter-trans");
    var sort = document.getElementById("filter-sort");
    var startInput = document.getElementById("filter-start");
    var endInput = document.getElementById("filter-end");

    var qStart = NS.ui.qs("start");
    var qEnd = NS.ui.qs("end");
    var qPickup = NS.ui.qs("pickup");

    if (startInput && qStart) startInput.value = qStart;
    if (endInput && qEnd) endInput.value = qEnd;

    var today = new Date();
    function localISO(d) {
      return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
    }
    if (startInput) {
      startInput.min = localISO(today);
      if (!startInput.value) {
        var s = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
        startInput.value = localISO(s);
      }
    }
    if (endInput) {
      if (!endInput.value) {
        var e = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 4);
        endInput.value = localISO(e);
      }
      endInput.min = startInput ? startInput.value : localISO(today);
    }

    function dateQuery() {
      var parts = [];
      if (startInput && startInput.value) parts.push("start=" + encodeURIComponent(startInput.value));
      if (endInput && endInput.value) parts.push("end=" + encodeURIComponent(endInput.value));
      if (qPickup) parts.push("pickup=" + encodeURIComponent(qPickup));
      return parts.join("&");
    }

    function render() {
      if (startInput && endInput) {
        endInput.min = startInput.value || localISO(today);
        if (endInput.value && startInput.value && endInput.value <= startInput.value) {
          var next = new Date(startInput.value + "T00:00:00");
          next.setDate(next.getDate() + 1);
          endInput.value = localISO(next);
        }
      }

      var start = startInput ? startInput.value : "";
      var end = endInput ? endInput.value : "";
      var matching = NS.domain.vehicles().filter(function (v) {
        if (type && type.value && v.type !== type.value) return false;
        if (trans && trans.value && v.transmission !== trans.value) return false;
        return true;
      });
      var stateOf = {};
      var counts = { all: matching.length, available: 0, reserved: 0, maintenance: 0 };
      matching.forEach(function (v) {
        stateOf[v.id] = NS.domain.vehicleAvailability(v.id, start, end);
        counts[stateOf[v.id]]++;
      });
      var list = matching.filter(function (v) {
        return availFilter === "all" || stateOf[v.id] === availFilter;
      });

      var rank = { available: 0, reserved: 1, maintenance: 2 };
      list.sort(function (a, b) {
        var byState = rank[stateOf[a.id]] - rank[stateOf[b.id]];
        if (byState) return byState;
        if (sort && sort.value === "high") return (b.dailyRate || 0) - (a.dailyRate || 0);
        if (sort && sort.value === "seats") return b.seats - a.seats;
        return (a.dailyRate || 0) - (b.dailyRate || 0);
      });

      var period = start && end ? " for " + NS.ui.fmtDate(start) + " → " + NS.ui.fmtDate(end) : " today";
      if (summary) {
        summary.textContent =
          counts.available + " of " + counts.all + " car" + (counts.all === 1 ? "" : "s") + " available" + period +
          " · " + counts.reserved + " reserved · " + counts.maintenance + " under maintenance";
      }
      if (legend) {
        legend.innerHTML = [
          ["all", "All"],
          ["available", "Available"],
          ["reserved", "Reserved"],
          ["maintenance", "Under maintenance"]
        ]
          .map(function (o) {
            return (
              '<button type="button" class="avail-pill avail-pill-' + o[0] + (availFilter === o[0] ? " active" : "") +
              '" data-avail="' + o[0] + '" aria-pressed="' + (availFilter === o[0]) + '">' +
              o[1] + " <span>" + counts[o[0]] + "</span></button>"
            );
          })
          .join("");
      }

      var q = dateQuery();
      host.innerHTML = list
        .map(function (v) {
          var state = stateOf[v.id];
          return NS.ui.vehicleCard(v, {
            query: q,
            availability: state,
            reservedUntil: state === "reserved" ? NS.domain.reservedUntil(v.id, start, end) : ""
          });
        })
        .join("");
      if (empty) {
        empty.hidden = list.length > 0;
        empty.textContent =
          availFilter === "all"
            ? "No cars match those filters. Try clearing filters."
            : "No " + (NS.domain.AVAILABILITY_LABELS[availFilter] || "").toLowerCase() + " cars for those dates or filters.";
      }
    }

    var legend = document.getElementById("fleet-legend");
    var availFilter = ["available", "reserved", "maintenance"].indexOf(NS.ui.qs("availability")) !== -1 ? NS.ui.qs("availability") : "all";
    if (legend) {
      legend.addEventListener("click", function (e) {
        var btn = e.target.closest("[data-avail]");
        if (!btn) return;
        availFilter = btn.getAttribute("data-avail");
        render();
      });
    }

    ["filter-type", "filter-trans", "filter-sort", "filter-start", "filter-end"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener("change", render);
    });
    render();
    NS.domain.syncVehiclesFromApi().then(render, function (e) {
      console.warn("iDrive: could not load vehicles from API, showing local data.", e);
    });
  };

  NS.pages.car = function car() {
    var host = document.getElementById("car-view");
    if (!host) return;
    renderCar(host);
    NS.domain.syncVehiclesFromApi().then(function () {
      renderCar(host);
    }, function (e) {
      console.warn("iDrive: could not load vehicles from API, showing local data.", e);
    });
  };

  function renderCar(host) {
    var id = NS.ui.qs("id");
    var v = NS.domain.getVehicle(id);
    if (!v) {
      host.innerHTML =
        "<p class='notice'>This vehicle is no longer in the fleet. <a href='" +
        NS.routes.href("fleet") +
        "'>Browse available cars</a>.</p>";
      return;
    }

    var start = NS.ui.qs("start") || "";
    var end = NS.ui.qs("end") || "";
    var pickup = NS.ui.qs("pickup") || "";
    var state = NS.domain.vehicleAvailability(v.id, start, end);
    var until = state === "reserved" ? NS.domain.reservedUntil(v.id, start, end) : "";
    /* Without trip dates a car reserved today can still be booked for later days. */
    var free = state === "available" || (state === "reserved" && !(start && end));

    var bookQuery =
      "?vehicle=" +
      encodeURIComponent(v.id) +
      (start ? "&start=" + encodeURIComponent(start) : "") +
      (end ? "&end=" + encodeURIComponent(end) : "") +
      (pickup ? "&pickup=" + encodeURIComponent(pickup) : "");

    var features = (v.features || [])
      .map(function (f) {
        return "<li>" + NS.security.escapeHtml(f) + "</li>";
      })
      .join("");

    var summary = NS.domain.vehicleRatingSummary(v.id);
    var reviews = NS.domain.ratingsForVehicle(v.id).slice(0, 6);
    var reviewsHtml = reviews.length
      ? '<div class="review-list">' +
        reviews
          .map(function (r) {
            return (
              '<article class="review-item"><div class="review-head">' +
              NS.ui.starsDisplay(r.stars, 1, { compact: true }) +
              " <span>" +
              NS.security.escapeHtml(r.userName || "Customer") +
              "</span></div>" +
              (r.comment ? "<p>" + NS.security.escapeHtml(r.comment) + "</p>" : "<p class='muted'>No written comment.</p>") +
              "</article>"
            );
          })
          .join("") +
        "</div>"
      : "<p class='notice'>No customer ratings yet for this car.</p>";

    host.innerHTML =
      '<div class="car-hero"><img src="' +
      NS.security.escapeHtml(v.image) +
      '" alt="' +
      NS.security.escapeHtml(v.name) +
      '">' +
      '<span class="avail-chip' + (state === "available" ? "" : " avail-busy avail-" + state) + '">' +
      NS.domain.AVAILABILITY_LABELS[state] +
      (until ? " until " + NS.ui.fmtDate(until) : "") +
      "</span>" +
      "</div>" +
      '<div class="car-panel">' +
      '<p class="eyebrow">' +
      NS.security.escapeHtml(v.brand) +
      " · " +
      v.year +
      "</p>" +
      "<h1>" +
      NS.security.escapeHtml(v.name) +
      "</h1>" +
      "<p>" +
      NS.ui.starsDisplay(summary.average, summary.count) +
      "</p>" +
      "<p>" +
      NS.security.escapeHtml(v.description) +
      "</p>" +
      '<dl class="spec-grid">' +
      "<div><dt>Type</dt><dd>" +
      NS.security.escapeHtml(v.type) +
      "</dd></div>" +
      "<div><dt>Transmission</dt><dd>" +
      NS.security.escapeHtml(v.transmission) +
      "</dd></div>" +
      "<div><dt>Fuel</dt><dd>" +
      NS.security.escapeHtml(v.fuel) +
      "</dd></div>" +
      "<div><dt>Seats</dt><dd>" +
      v.seats +
      "</dd></div>" +
      "<div><dt>Luggage</dt><dd>" +
      v.luggage +
      "</dd></div>" +
      "<div><dt>Plate</dt><dd>" +
      NS.security.escapeHtml(v.plate) +
      "</dd></div>" +
      "</dl>" +
      "<h3>Included</h3><ul class='feature-list'>" +
      features +
      "</ul>" +
      "<h3>Customer ratings</h3>" +
      reviewsHtml +
      '<div class="rate-box"><strong>' +
      (v.dailyRate ? NS.ui.peso(v.dailyRate) : "Rate on request") +
      "</strong><span>" +
      (v.dailyRate ? "per day, tax inclusive demo rate" : "contact us for pricing") +
      "</span>" +
      (!v.dailyRate
        ? '<a class="btn btn-gold btn-block" href="' + NS.routes.href("contact") + '">Contact us</a>'
        : free
        ? '<a class="btn btn-gold btn-block" href="' +
          NS.routes.href("book", bookQuery) +
          '">Book this car</a>'
        : '<p class="notice">' +
          (state === "maintenance"
            ? "This car is under maintenance and cannot be booked right now."
            : "Reserved" + (until ? " until " + NS.ui.fmtDate(until) : "") + " for the selected dates.") +
          ' <a href="' +
          NS.routes.href("fleet", "?availability=available") +
          '">See available cars</a>.</p>') +
      "</div></div>";
  }
})(window);
