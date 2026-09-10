(function (global) {
  "use strict";

  var NS = (global.iDrive = global.iDrive || {});
  NS.pages = NS.pages || {};

  NS.pages.payment = function payment() {
    var form = document.getElementById("pay-form");
    var box = document.getElementById("pay-box");
    if (!form) return;
    NS.ui.bindCsrf(form);
    var booking = NS.domain.getBooking(NS.ui.qs("id"));
    if (!booking) {
      box.innerHTML = "<p class='notice'>Booking not found.</p>";
      form.hidden = true;
      return;
    }
    var v = NS.domain.getVehicle(booking.vehicleId);
    box.innerHTML =
      "<h1>Pay " +
      NS.security.escapeHtml(booking.ref) +
      "</h1><p>" +
      NS.security.escapeHtml(v ? v.name : "") +
      " · " +
      booking.days +
      " day(s)</p><p class='total'>" +
      NS.ui.peso(booking.total) +
      "</p><p class='fineprint'>Use test card 4242 4242 4242 4242. Nothing is charged.</p>";
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      try {
        NS.domain.payBooking(
          booking.id,
          {
            name: form.cardName.value,
            number: form.cardNumber.value,
            exp: form.cardExp.value,
            cvv: form.cardCvv.value
          },
          form.csrf.value
        );
        location.href = NS.routes.href("bookingDetail", "?id=" + encodeURIComponent(booking.id));
      } catch (err) {
        NS.ui.bindCsrf(form);
        NS.ui.toast(err.message, "err");
      }
    });
  };
})(window);
