(function (global) {
  "use strict";

  var NS = (global.iDrive = global.iDrive || {});
  NS.pages = NS.pages || {};

  NS.pages.fleet = function fleet() {
    var host = document.getElementById("fleet-grid");
    var empty = document.getElementById("fleet-empty");
    if (!host) return;
    var type = document.getElementById("filter-type");
    var trans = document.getElementById("filter-trans");
    var sort = document.getElementById("filter-sort");
    function render() {
      var list = NS.domain.vehicles().filter(function (v) {
        if (type.value && v.type !== type.value) return false;
        if (trans.value && v.transmission !== trans.value) return false;
        return v.status === "available";
      });
      list.sort(function (a, b) {
        if (sort.value === "high") return b.dailyRate - a.dailyRate;
        if (sort.value === "seats") return b.seats - a.seats;
        return a.dailyRate - b.dailyRate;
      });
      host.innerHTML = list
        .map(function (v) {
          return NS.ui.vehicleCard(v);
        })
        .join("");
      if (empty) empty.hidden = list.length > 0;
    }
    ["filter-type", "filter-trans", "filter-sort"].forEach(function (id) {
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
        "'>Browse cars</a>.</p>";
      return;
    }
    var features = (v.features || [])
      .map(function (f) {
        return "<li>" + NS.security.escapeHtml(f) + "</li>";
      })
      .join("");
    host.innerHTML =
      '<div class="car-hero"><img src="' +
      NS.security.escapeHtml(v.image) +
      '" alt="' +
      NS.security.escapeHtml(v.name) +
      '"></div>' +
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
      '<div class="rate-box"><strong>' +
      NS.ui.peso(v.dailyRate) +
      "</strong><span>per day, tax inclusive demo rate</span>" +
      (v.status === "available"
        ? '<a class="btn btn-gold btn-block" href="' +
          NS.routes.href("book", "?vehicle=" + encodeURIComponent(v.id)) +
          '">Check dates</a>'
        : '<p class="notice">Temporarily in maintenance.</p>') +
      "</div></div>";
  };
})(window);
