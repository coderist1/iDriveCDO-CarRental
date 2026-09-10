(function (global) {
  "use strict";

  var NS = (global.iDrive = global.iDrive || {});
  NS.pages = NS.pages || {};

  function localISO(d) {
    return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
  }

  NS.pages.home = function home() {
    var count = document.getElementById("avail-count");
    var available = NS.domain.vehicles().filter(function (v) {
      return v.status === "available";
    }).length;
    if (count) count.textContent = available + " vehicles available now";

    var host = document.getElementById("featured-grid");
    if (host) {
      host.innerHTML = NS.domain
        .vehicles()
        .slice(0, 6)
        .map(function (v) {
          return NS.ui.vehicleCard(v);
        })
        .join("");
    }

    var form = document.getElementById("home-search");
    if (!form) return;

    var pickup = form.pickup;
    pickup.innerHTML = NS.domain.LOCATIONS.map(function (loc) {
      return '<option value="' + NS.security.escapeHtml(loc) + '">' + NS.security.escapeHtml(loc) + "</option>";
    }).join("");

    var today = new Date();
    var start = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    var end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 4);
    form.startDate.value = localISO(start);
    form.endDate.value = localISO(end);
    form.startDate.min = localISO(today);
    form.endDate.min = localISO(start);

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var q =
        "?pickup=" +
        encodeURIComponent(form.pickup.value) +
        "&start=" +
        encodeURIComponent(form.startDate.value) +
        "&end=" +
        encodeURIComponent(form.endDate.value);
      location.href = NS.routes.href("fleet") + q;
    });
  };
})(window);
