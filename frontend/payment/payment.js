(function (global) {
  "use strict";

  var NS = (global.iDrive = global.iDrive || {});
  NS.pages = NS.pages || {};

  function showPaidReceipt(form, box, booking) {
    var v = NS.domain.getVehicle(booking.vehicleId);
    form.hidden = true;
    box.innerHTML =
      "<p class='eyebrow'>Payment complete</p>" +
      "<h1>Receipt ready</h1>" +
      "<p>" +
      NS.security.escapeHtml(booking.ref) +
      " · " +
      NS.security.escapeHtml(v ? v.name : "Vehicle") +
      "</p>" +
      "<p class='total'>" +
      NS.ui.peso(booking.total) +
      "</p>" +
      "<p class='notice'>Your payment was recorded. Save a copy of this receipt for your records.</p>" +
      '<div class="btn-row">' +
      '<button class="btn btn-gold" id="save-receipt-btn" type="button">Save receipt</button>' +
      '<a class="btn btn-ghost" href="' +
      NS.routes.href("bookingDetail", "?id=" + encodeURIComponent(booking.id)) +
      '">View booking</a>' +
      '<a class="btn btn-dark" href="' +
      NS.routes.href("myBookings") +
      '">My bookings</a>' +
      "</div>";

    var saveBtn = document.getElementById("save-receipt-btn");
    if (saveBtn) {
      saveBtn.addEventListener("click", function () {
        NS.ui.askYesNo("Save this receipt to your device?", { title: "Save edit" }).then(function (ok) {
          if (!ok) return;
          try {
            NS.ui.downloadReceipt(booking);
            NS.ui.toast("Receipt saved to your downloads.", "ok");
          } catch (err) {
            NS.ui.toast(err.message || "Could not save receipt.", "err");
          }
        });
      });
    }
  }

  NS.pages.payment = function payment() {
    var form = document.getElementById("pay-form");
    var box = document.getElementById("pay-box");
    if (!form) return;
    if (form.getAttribute("data-bound") === "1") return;
    form.setAttribute("data-bound", "1");

    NS.ui.bindCsrf(form);
    var booking = NS.domain.getBooking(NS.ui.qs("id"));
    if (!booking) {
      box.innerHTML = "<p class='notice'>Booking not found.</p>";
      form.hidden = true;
      return;
    }
    if (booking.paymentStatus === "paid") {
      showPaidReceipt(form, box, booking);
      return;
    }

    var v = NS.domain.getVehicle(booking.vehicleId);
    var me = NS.auth.current();
    if (me && form.walletAccount && !form.walletAccount.value) {
      form.walletAccount.value = me.phone || "";
    }

    box.innerHTML =
      "<h1>Pay " +
      NS.security.escapeHtml(booking.ref) +
      "</h1><p>" +
      NS.security.escapeHtml(v ? v.name : "") +
      " · " +
      booking.days +
      " day(s)</p><p class='total'>" +
      NS.ui.peso(booking.total) +
      "</p>";

    function payMethod() {
      var chosen = form.querySelector('input[name="payMethod"]:checked');
      return chosen ? chosen.value : "cash";
    }

    function syncMethod() {
      var method = payMethod();
      var cash = document.getElementById("cash-fields");
      var cashless = document.getElementById("cashless-fields");
      if (cash) cash.hidden = method !== "cash";
      if (cashless) cashless.hidden = method !== "cashless";

      if (form.cashConfirm) form.cashConfirm.required = method === "cash";
      ["wallet", "walletAccount"].forEach(function (name) {
        if (form[name]) form[name].required = method === "cashless";
      });

      var btn = form.querySelector('button[type="submit"]');
      if (btn) btn.textContent = method === "cash" ? "Confirm cash payment" : "Pay with wallet";
    }

    form.addEventListener("change", function (e) {
      if (e.target && e.target.name === "payMethod") syncMethod();
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var method = payMethod();
      var ask =
        method === "cashless"
          ? "Confirm this cashless payment?"
          : "Confirm cash payment at pickup/desk?";
      NS.ui.askYesNo(ask, { title: "Save edit" }).then(function (ok) {
        if (!ok) return;
        try {
          NS.ui.bindCsrf(form);
          var payload =
            method === "cashless"
              ? {
                  method: "cashless",
                  wallet: form.wallet.value,
                  account: form.walletAccount.value
                }
              : {
                  method: "cash",
                  confirmed: !!(form.cashConfirm && form.cashConfirm.checked)
                };
          var paid = NS.domain.payBooking(booking.id, payload, form.csrf ? form.csrf.value : "");
          showPaidReceipt(form, box, paid);
          try {
            NS.ui.downloadReceipt(paid);
            NS.ui.toast("Receipt saved to your downloads.", "ok");
          } catch (saveErr) {
            NS.ui.toast("Payment recorded. Use Save receipt if the download was blocked.", "ok");
          }
        } catch (err) {
          NS.ui.bindCsrf(form);
          NS.ui.toast(err.message, "err");
        }
      });
    });

    syncMethod();
  };
})(window);
