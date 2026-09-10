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
      var list = (NS.domain.availableVehicles
        ? NS.domain.availableVehicles(start, end)
        : NS.domain.vehicles().filter(function (v) {
            return v.status === "available";
          })
      ).filter(function (v) {
        if (type && type.value && v.type !== type.value) return false;
        if (trans && trans.value && v.transmission !== trans.value) return false;
        return true;
      });

      list.sort(function (a, b) {
        if (sort && sort.value === "high") return b.dailyRate - a.dailyRate;
        if (sort && sort.value === "seats") return b.seats - a.seats;
        return a.dailyRate - b.dailyRate;
      });

      if (summary) {
        summary.textContent =
          list.length +
          " car" +
          (list.length === 1 ? "" : "s") +
          " available" +
          (start && end ? " for " + NS.ui.fmtDate(start) + " → " + NS.ui.fmtDate(end) : " now");
      }

      var q = dateQuery();
      host.innerHTML = list
        .map(function (v) {
          return NS.ui.vehicleCard(v, { query: q, dateAvailable: true });
        })
        .join("");
      if (empty) {
        empty.hidden = list.length > 0;
        empty.textContent =
          "No cars available for those dates or filters. Try different dates or clear filters.";
      }
    }

    ["filter-type", "filter-trans", "filter-sort", "filter-start", "filter-end"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener("change", render);
    });
    render();
  };

  NS.pages.car = function car() {
    var id = NS.ui.qs("id");
    var v = NS.domain.getVehicle(id);
    var host = document.getElementById("car-view");
    if (!host) return;
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
    var free =
      v.status === "available" &&
      (!start || !end || NS.domain.isAvailable(v.id, start, end));

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
      (free
        ? '<span class="avail-chip">Available</span>'
        : '<span class="avail-chip avail-busy">Unavailable</span>') +
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
      NS.ui.peso(v.dailyRate) +
      "</strong><span>per day, tax inclusive demo rate</span>" +
      (free
        ? '<a class="btn btn-gold btn-block" href="' +
          NS.routes.href("book", bookQuery) +
          '">Book this car</a>'
        : '<p class="notice">Not available for the selected dates. <a href="' +
          NS.routes.href("fleet") +
          '">See other available cars</a>.</p>') +
      "</div></div>";
  };
})(window);
