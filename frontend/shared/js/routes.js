/**
 * Component route map. All pages use data-base="../" (path to frontend/).
 */
(function (global) {
  "use strict";

  var NS = (global.iDrive = global.iDrive || {});

  var MAP = {
    home: "home/index.html",
    fleet: "fleet/fleet.html",
    car: "fleet/car.html",
    about: "info/about.html",
    contact: "info/contact.html",
    login: "auth/login.html",
    register: "auth/register.html",
    account: "account/account.html",
    profile: "account/profile.html",
    book: "booking/book.html",
    myBookings: "booking/my-bookings.html",
    bookingDetail: "booking/booking-detail.html",
    payment: "payment/payment.html",
    adminHome: "admin/index.html",
    adminVehicles: "admin/vehicles.html",
    adminBookings: "admin/bookings.html",
    adminCustomers: "admin/customers.html",
    adminReports: "admin/reports.html",
    adminSecurityLog: "admin/security-log.html",
    adminDrivers: "admin/drivers.html",
    adminFleetOps: "admin/fleet-ops.html",
    adminPayments: "admin/payments.html",
    adminInbox: "admin/inbox.html",
    driverHome: "driver/index.html"
  };

  function base() {
    return document.body.getAttribute("data-base") || "../";
  }

  function href(key, query) {
    var path = MAP[key];
    if (!path) throw new Error("Unknown route: " + key);
    return base() + path + (query || "");
  }

  function isSafeNext(value) {
    return typeof value === "string" && /^[a-z]+\/[a-z0-9\-]+\.html$/i.test(value);
  }

  NS.routes = {
    MAP: MAP,
    base: base,
    href: href,
    isSafeNext: isSafeNext
  };
})(window);
