(function (global) {
  "use strict";

  var NS = (global.iDrive = global.iDrive || {});
  NS.pages = NS.pages || {};

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
  };
})(window);
