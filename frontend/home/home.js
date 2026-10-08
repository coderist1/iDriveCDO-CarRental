(function (global) {
  "use strict";

  var NS = (global.iDrive = global.iDrive || {});
  NS.pages = NS.pages || {};

  function localISO(d) {
    return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
  }

  NS.pages.home = function home() {
    var available = NS.domain.availableVehicles
      ? NS.domain.availableVehicles()
      : NS.domain.vehicles().filter(function (v) {
          return v.status === "available";
        });

    var esc = NS.security.escapeHtml;
    var all = NS.domain.vehicles();

    var count = document.getElementById("avail-count");
    if (count) count.textContent = available.length + " vehicles available now";
    var promoCount = document.getElementById("hp-promo-count");
    if (promoCount) promoCount.textContent = String(available.length);

    var lineup = document.getElementById("hp-lineup");
    if (lineup) {
      var picks = (available.length >= 5 ? available : all).slice(0, 5);
      var order = [3, 1, 0, 2, 4];
      lineup.innerHTML = order
        .filter(function (i) {
          return picks[i];
        })
        .map(function (i, pos) {
          return (
            '<figure class="hp-lineup-car hp-pos-' +
            pos +
            '"><img src="' +
            esc(picks[i].image) +
            '" alt=""></figure>'
          );
        })
        .join("");
    }

    var host = document.getElementById("featured-grid");
    if (host) {
      host.innerHTML = available
        .slice(0, 3)
        .map(function (v) {
          var carLink = NS.routes.href("car", "?id=" + encodeURIComponent(v.id));
          return (
            '<article class="hp-car">' +
            '<a class="hp-car-photo" href="' +
            carLink +
            '"><img src="' +
            esc(v.image) +
            '" alt="' +
            esc(v.name) +
            '"></a>' +
            "<h3>" +
            esc(v.name) +
            "</h3>" +
            "<p>Type: <strong>" +
            esc(v.type) +
            " · " +
            esc(v.transmission) +
            "</strong></p>" +
            "<p>Rate: <strong>from " +
            NS.ui.peso(v.dailyRate) +
            " / day</strong></p>" +
            "</article>"
          );
        })
        .join("");
      if (!available.length) {
        host.innerHTML = "<p class='notice'>No cars are available right now. Please check back soon.</p>";
      }
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

    form.addEventListener("change", function () {
      form.endDate.min = form.startDate.value || localISO(today);
    });

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
