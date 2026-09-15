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

    function payQrPayload() {
      return (
        "iDrive CDO payment\nRef: " +
        booking.ref +
        "\nAmount: PHP " +
        booking.total +
        "\nMerchant: 09178562100"
      );
    }

    function renderPayQrImg(host, text) {
      var img = document.createElement("img");
      img.alt = "Payment QR code";
      img.width = 220;
      img.height = 220;
      img.src =
        "https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data=" +
        encodeURIComponent(text);
      host.appendChild(img);
    }

    function renderPayQr() {
      var host = document.getElementById("pay-qr-host");
      var amountEl = document.getElementById("pay-qr-amount");
      var refEl = document.getElementById("pay-qr-ref");
      if (amountEl) amountEl.textContent = NS.ui.peso(booking.total);
      if (refEl) refEl.textContent = booking.ref + " · 0917 856 2100";
      if (!host) return;
      host.innerHTML = "";
      var text = payQrPayload();
      if (global.QRCode && typeof global.QRCode.toCanvas === "function") {
        var canvas = document.createElement("canvas");
        canvas.setAttribute("role", "img");
        canvas.setAttribute("aria-label", "Payment QR code");
        host.appendChild(canvas);
        global.QRCode.toCanvas(
          canvas,
          text,
          { width: 220, margin: 1, errorCorrectionLevel: "M" },
          function (err) {
            if (err) {
              host.innerHTML = "";
              renderPayQrImg(host, text);
            }
          }
        );
        return;
      }
      renderPayQrImg(host, text);
    }

    function syncMethod() {
      var method = payMethod();
      var cash = document.getElementById("cash-fields");
      var cashless = document.getElementById("cashless-fields");
      if (cash) cash.hidden = method !== "cash";
      if (cashless) cashless.hidden = method !== "cashless";

      if (form.cashConfirm) form.cashConfirm.required = method === "cash";

      var btn = form.querySelector('button[type="submit"]');
      if (btn) btn.textContent = method === "cash" ? "Confirm cash payment" : "Confirm QR payment";
      if (method === "cashless") renderPayQr();
    }

    var receiptData = document.getElementById("payment-receipt-data");
    var receiptInput = document.getElementById("payment-receipt-input");
    var receiptPreview = document.getElementById("payment-receipt-preview");
    var receiptPick = document.getElementById("payment-receipt-pick");
    var receiptClear = document.getElementById("payment-receipt-clear");

    function setReceiptPhoto(dataUrl) {
      if (receiptData) receiptData.value = dataUrl || "";
      if (receiptPreview) {
        if (dataUrl) {
          receiptPreview.classList.remove("is-empty");
          receiptPreview.innerHTML = '<img src="' + dataUrl.replace(/"/g, "") + '" alt="Payment receipt preview">';
        } else {
          receiptPreview.classList.add("is-empty");
          receiptPreview.textContent = "No receipt yet";
        }
      }
      if (receiptClear) receiptClear.hidden = !dataUrl;
      if (receiptPick) receiptPick.textContent = dataUrl ? "Replace receipt" : "Upload receipt";
    }

    if (receiptPick && receiptInput) {
      receiptPick.addEventListener("click", function () {
        receiptInput.click();
      });
      receiptInput.addEventListener("change", function () {
        var file = receiptInput.files && receiptInput.files[0];
        if (!file) return;
        var readerFn = NS.ui.readReceiptPhoto || NS.ui.readLicensePhoto;
        readerFn(file, function (err, dataUrl) {
          receiptInput.value = "";
          if (err) {
            NS.ui.toast(err.message || "Could not read receipt.", "err");
            return;
          }
          setReceiptPhoto(dataUrl);
          NS.ui.toast("Payment receipt attached.", "ok");
        });
      });
    }
    if (receiptClear) {
      receiptClear.addEventListener("click", function () {
        setReceiptPhoto("");
      });
    }

    form.addEventListener("change", function (e) {
      if (e.target && e.target.name === "payMethod") syncMethod();
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var method = payMethod();
      if (method === "cashless" && !(receiptData && receiptData.value)) {
        NS.ui.toast("Upload a photo of your payment receipt.", "err");
        return;
      }
      var ask =
        method === "cashless"
          ? "Confirm this QR payment after uploading your receipt?"
          : "Confirm cash payment at pickup/desk?";
      NS.ui.askYesNo(ask, { title: "Save edit" }).then(function (ok) {
        if (!ok) return;
        try {
          NS.ui.bindCsrf(form);
          var payload =
            method === "cashless"
              ? {
                  method: "cashless",
                  receiptPhoto: receiptData ? receiptData.value : ""
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
