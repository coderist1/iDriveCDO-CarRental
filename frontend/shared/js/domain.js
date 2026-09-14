/**
 * Vehicles, bookings, payments, seed data. All in-browser.
 */
(function (global) {
  "use strict";

  var NS = (global.iDrive = global.iDrive || {});

  var LOCATIONS = [
    "Laguindingan Airport (CGY)",
    "Divisoria / Downtown CDO",
    "SM City CDO Downtown Premier",
    "Centrio Mall",
    "Limketkai Center",
    "Uptown Cagayan de Oro",
    "Pueblo de Oro",
    "Cogon Public Market"
  ];

  var ADDONS = [
    { id: "driver", name: "Professional driver", daily: 1500 },
    { id: "gps", name: "GPS navigation", daily: 200 },
    { id: "child", name: "Child seat", daily: 150 },
    { id: "insurance", name: "Full coverage insurance", daily: 450 }
  ];

  var ACTIVE_BOOKING = { pending: 1, confirmed: 1, ongoing: 1, return_requested: 1 };

  function vehicles() {
    return NS.store.get("vehicles", []);
  }

  function saveVehicles(list) {
    NS.store.set("vehicles", list);
  }

  function bookings() {
    return NS.store.get("bookings", []);
  }

  function saveBookings(list) {
    NS.store.set("bookings", list);
  }

  function drivers() {
    return NS.store.get("drivers", []);
  }

  function saveDrivers(list) {
    NS.store.set("drivers", list);
  }

  function vehicleRegs() {
    return NS.store.get("vehicleRegs", []);
  }

  function saveVehicleRegs(list) {
    NS.store.set("vehicleRegs", list);
  }

  function maintenances() {
    return NS.store.get("maintenances", []);
  }

  function saveMaintenances(list) {
    NS.store.set("maintenances", list);
  }

  function fuelRecords() {
    return NS.store.get("fuelRecords", []);
  }

  function saveFuelRecords(list) {
    NS.store.set("fuelRecords", list);
  }

  function payments() {
    return NS.store.get("payments", []);
  }

  function savePayments(list) {
    NS.store.set("payments", list);
  }

  function getDriver(id) {
    var list = drivers();
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function ratings() {
    return NS.store.get("ratings", []);
  }

  function saveRatings(list) {
    NS.store.set("ratings", list);
  }

  function auditLog() {
    return NS.store.get("audit", []);
  }

  function audit(action, userId, detail) {
    var list = auditLog();
    list.unshift({
      id: "aud_" + NS.security.randomHex(6),
      action: NS.security.sanitizeText(action, 40),
      userId: userId || null,
      detail: NS.security.sanitizeText(detail, 180),
      at: new Date().toISOString()
    });
    NS.store.set("audit", list.slice(0, 200));
  }

  function getVehicle(id) {
    var list = vehicles();
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function getBooking(id) {
    var list = bookings();
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function overlaps(aStart, aEnd, bStart, bEnd) {
    return aStart < bEnd && bStart < aEnd;
  }

  function isAvailable(vehicleId, start, end, exceptId) {
    var list = bookings();
    for (var i = 0; i < list.length; i++) {
      var b = list[i];
      if (b.vehicleId !== vehicleId) continue;
      if (exceptId && b.id === exceptId) continue;
      if (!ACTIVE_BOOKING[b.status]) continue;
      if (overlaps(start, end, b.startDate, b.endDate)) return false;
    }
    var v = getVehicle(vehicleId);
    return !!(v && v.status === "available");
  }

  function availableVehicles(start, end) {
    return vehicles().filter(function (v) {
      if (v.status !== "available") return false;
      if (start && end) return isAvailable(v.id, start, end);
      return true;
    });
  }

  function requireStaff() {
    if (!NS.auth.hasRole("staff")) throw new Error("Staff access required.");
  }

  function requireAdmin() {
    if (!NS.auth.hasRole("admin")) throw new Error("Admin access required.");
  }

  function quote(vehicleId, start, end, addonIds, options) {
    options = options || {};
    if (!NS.validation.dateRange(start, end)) {
      throw new Error("Choose 1 to 30 days starting today or later.");
    }
    var vehicle = getVehicle(vehicleId);
    if (!vehicle) throw new Error("Vehicle not found.");
    if (vehicle.status !== "available") throw new Error("This vehicle is not available for hire.");
    if (!options.ignoreAvailability && !isAvailable(vehicleId, start, end)) {
      throw new Error("Those dates overlap an existing booking for this car.");
    }
    var days = NS.validation.daysBetween(start, end);
    var selected = [];
    var extras = 0;
    var ids = addonIds || [];
    for (var i = 0; i < ADDONS.length; i++) {
      if (ids.indexOf(ADDONS[i].id) !== -1) {
        selected.push(ADDONS[i]);
        extras += ADDONS[i].daily * days;
      }
    }
    var subtotal = vehicle.dailyRate * days;
    return {
      vehicle: vehicle,
      startDate: start,
      endDate: end,
      days: days,
      addons: selected,
      subtotal: subtotal,
      extras: extras,
      total: subtotal + extras
    };
  }

  function nextRef() {
    var d = new Date();
    var stamp =
      d.getFullYear() +
      ("0" + (d.getMonth() + 1)).slice(-2) +
      ("0" + d.getDate()).slice(-2);
    return "IDR-" + stamp + "-" + NS.security.randomHex(3).toUpperCase();
  }

  function createBooking(payload, csrf) {
    var me = NS.auth.current();
    if (!me) throw new Error("Sign in to book a car.");
    var pickup = NS.security.sanitizeText(payload.pickup, 80);
    var dropoff = NS.security.sanitizeText(payload.dropoff, 80);
    if (LOCATIONS.indexOf(pickup) === -1 || LOCATIONS.indexOf(dropoff) === -1) {
      throw new Error("Choose a valid CDO pickup and return location.");
    }

    var driveMode = payload.driveMode === "chauffeur" ? "chauffeur" : "self";
    var addonIds = (payload.addons || []).slice();
    if (driveMode === "chauffeur" && addonIds.indexOf("driver") === -1) {
      addonIds.push("driver");
    }

    var driverInfo = normalizeDriverInfo(driveMode, payload.driverInfo || {});

    var q = quote(payload.vehicleId, payload.startDate, payload.endDate, addonIds);
    var notes = NS.security.sanitizeText(payload.notes, 240);

    try {
      if (csrf) NS.security.assertCsrf(csrf);
      else NS.security.issueCsrf();
    } catch (csrfErr) {
      NS.security.issueCsrf();
    }

    var booking = {
      id: "bkg_" + NS.security.randomHex(8),
      ref: nextRef(),
      userId: me.role === "staff" || me.role === "admin" ? payload.customerId || me.id : me.id,
      vehicleId: q.vehicle.id,
      startDate: q.startDate,
      endDate: q.endDate,
      pickupTime: NS.security.sanitizeText(payload.pickupTime || "09:00", 8),
      returnTime: NS.security.sanitizeText(payload.returnTime || "09:00", 8),
      numberOfPassengers: Math.max(1, parseInt(payload.numberOfPassengers, 10) || 1),
      days: q.days,
      pickup: pickup,
      dropoff: dropoff,
      driveMode: driveMode,
      driverOption: driveMode === "chauffeur" ? "Chauffeur" : "Self-drive",
      driverDetailsId: null,
      driverInfo: driverInfo,
      fuelBeforeRent: NS.security.sanitizeText(payload.fuelBeforeRent || "Full", 20),
      fuelUponReturn: "",
      addons: q.addons.map(function (a) {
        return a.id;
      }),
      subtotal: q.subtotal,
      extras: q.extras,
      total: q.total,
      status: "pending",
      paymentStatus: "unpaid",
      paymentMethod: "",
      payment: null,
      notes: notes,
      dateReserve: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    if (driveMode === "chauffeur") {
      var driverId = NS.security.sanitizeText(payload.driverDetailsId || "", 40);
      var driver = getDriver(driverId);
      if (!driver || driver.status !== "active") {
        throw new Error("Choose an available professional driver for chauffeur mode.");
      }
      booking.driverDetailsId = driver.id;
    }
    if (booking.numberOfPassengers > (q.vehicle.seats || 5)) {
      throw new Error("Passengers exceed this vehicle's capacity (" + q.vehicle.seats + ").");
    }
    if (me.role === "staff" || me.role === "admin") {
      var customer = NS.auth.userById(booking.userId);
      if (!customer || customer.role !== "customer") throw new Error("Select a customer for this booking.");
    }
    var all = bookings();
    all.push(booking);
    saveBookings(all);
    audit("booking-create", me.id, booking.ref + " · " + driveMode);
    notifyStaffOfBooking(booking, me);
    return booking;
  }

  function threads() {
    return NS.store.get("threads", []);
  }

  function saveThreads(list) {
    NS.store.set("threads", list);
  }

  function getThread(id) {
    var list = threads();
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function pushThreadMessage(thread, fromRole, fromUser, body) {
    thread.messages = thread.messages || [];
    thread.messages.push({
      id: "msg_" + NS.security.randomHex(6),
      fromRole: fromRole,
      fromUserId: fromUser && fromUser.id ? fromUser.id : null,
      fromName: fromUser
        ? NS.security.sanitizeText((fromUser.firstName || "") + " " + (fromUser.lastName || ""), 80)
        : fromRole === "staff"
          ? "iDrive desk"
          : "Guest",
      body: NS.security.sanitizeText(body, 500),
      at: new Date().toISOString()
    });
    thread.updatedAt = new Date().toISOString();
    if (fromRole === "staff" || fromRole === "admin") {
      thread.unreadCustomer = true;
      thread.unreadStaff = false;
    } else {
      thread.unreadStaff = true;
      thread.unreadCustomer = false;
    }
    return thread;
  }

  function saveThread(thread) {
    var list = threads();
    var found = false;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === thread.id) {
        list[i] = thread;
        found = true;
        break;
      }
    }
    if (!found) list.unshift(thread);
    saveThreads(list);
    return thread;
  }

  function notifyStaffOfBooking(booking, customer) {
    var existing = threads().filter(function (t) {
      return t.bookingId === booking.id;
    })[0];
    var body =
      "New booking " +
      booking.ref +
      " received. " +
      (booking.driveMode === "chauffeur" ? "Chauffeur" : "Self-drive") +
      ", pickup " +
      booking.pickup +
      " on " +
      booking.startDate +
      ". Payment: " +
      (booking.paymentStatus || "unpaid") +
      ".";
    if (booking.notes) body += " Notes: " + booking.notes;
    if (existing) {
      pushThreadMessage(existing, "customer", customer, body);
      return saveThread(existing);
    }
    var thread = {
      id: "thd_" + NS.security.randomHex(8),
      kind: "booking",
      topic: "Booking " + booking.ref,
      bookingId: booking.id,
      bookingRef: booking.ref,
      customerId: customer.id,
      customerName: NS.security.sanitizeText((customer.firstName || "") + " " + (customer.lastName || ""), 80),
      customerEmail: customer.email || "",
      customerPhone: customer.phone || "",
      status: "open",
      unreadStaff: true,
      unreadCustomer: false,
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    pushThreadMessage(thread, "customer", customer, body);
    audit("inbox", customer.id, "Desk received booking " + booking.ref);
    return saveThread(thread);
  }

  function sendContact(payload, csrf) {
    try {
      if (csrf) NS.security.assertCsrf(csrf);
      else NS.security.issueCsrf();
    } catch (e) {
      NS.security.issueCsrf();
    }
    var me = NS.auth.current();
    var name = NS.security.sanitizeText(payload.name, 60);
    var email = NS.security.sanitizeEmail(payload.email);
    var topic = NS.security.sanitizeText(payload.topic, 40) || "Message";
    var body = NS.security.sanitizeText(payload.message, 500);
    if (!name) throw new Error("Name is required.");
    if (!NS.validation.email(email)) throw new Error("Valid email is required.");
    if (body.length < 12) throw new Error("Please write a short message.");

    var thread = {
      id: "thd_" + NS.security.randomHex(8),
      kind: "contact",
      topic: topic,
      bookingId: null,
      bookingRef: "",
      customerId: me && me.role === "customer" ? me.id : null,
      customerName: name,
      customerEmail: email,
      customerPhone: me ? me.phone || "" : "",
      status: "open",
      unreadStaff: true,
      unreadCustomer: false,
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    pushThreadMessage(thread, "customer", me || { firstName: name, lastName: "", id: null }, body);
    audit("inbox", me ? me.id : "guest", "Contact: " + topic);
    return saveThread(thread);
  }

  function replyToThread(threadId, body, csrf) {
    try {
      if (csrf) NS.security.assertCsrf(csrf);
      else NS.security.issueCsrf();
    } catch (e) {
      NS.security.issueCsrf();
    }
    var me = NS.auth.current();
    if (!me) throw new Error("Sign in to send a message.");
    var text = NS.security.sanitizeText(body, 500);
    if (text.length < 2) throw new Error("Write a short reply.");
    var thread = getThread(threadId);
    if (!thread) throw new Error("Conversation not found.");
    var isStaff = NS.auth.hasRole("staff");
    if (!isStaff && thread.customerId && thread.customerId !== me.id) {
      throw new Error("You cannot reply to this conversation.");
    }
    if (!isStaff && me.role !== "customer") throw new Error("Sign in as a customer to reply.");
    pushThreadMessage(thread, isStaff ? "staff" : "customer", me, text);
    audit("inbox-reply", me.id, thread.topic);
    return saveThread(thread);
  }

  function markThreadRead(threadId) {
    var me = NS.auth.current();
    if (!me) return null;
    var thread = getThread(threadId);
    if (!thread) return null;
    if (NS.auth.hasRole("staff")) thread.unreadStaff = false;
    else if (thread.customerId === me.id) thread.unreadCustomer = false;
    return saveThread(thread);
  }

  function staffThreads() {
    if (!NS.auth.hasRole("staff")) throw new Error("Staff access required.");
    return threads().slice().sort(function (a, b) {
      return String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""));
    });
  }

  function myThreads() {
    var me = NS.auth.current();
    if (!me) return [];
    return threads()
      .filter(function (t) {
        return t.customerId === me.id || t.customerEmail === me.email;
      })
      .sort(function (a, b) {
        return String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""));
      });
  }

  function staffUnreadCount() {
    if (!NS.auth.hasRole("staff")) return 0;
    return threads().filter(function (t) {
      return t.unreadStaff;
    }).length;
  }

  function incomingBookings() {
    if (!NS.auth.hasRole("staff")) throw new Error("Staff access required.");
    return bookings()
      .filter(function (b) {
        return b.status === "pending";
      })
      .slice()
      .sort(function (a, b) {
        return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
      });
  }

  function ensureBookingThread(bookingId) {
    requireStaff();
    var booking = getBooking(bookingId);
    if (!booking) throw new Error("Booking not found.");
    var existing = threads().filter(function (t) {
      return t.bookingId === booking.id;
    })[0];
    if (existing) return existing;
    var customer = NS.auth.userById(booking.userId) || {
      id: booking.userId,
      firstName: "Customer",
      lastName: "",
      email: "",
      phone: ""
    };
    return notifyStaffOfBooking(booking, customer);
  }

  function normalizeDriverInfo(driveMode, info) {
    if (driveMode === "chauffeur") {
      var idType = NS.security.sanitizeText(info.idType, 40);
      var idNumber = NS.security.sanitizeText(info.idNumber, 30).toUpperCase().replace(/\s+/g, "");
      var allowedIds = ["National ID", "Passport", "UMID", "Postal ID", "Company ID", "Student ID"];
      if (allowedIds.indexOf(idType) === -1) throw new Error("Choose a valid ID type.");
      if (!NS.validation.validId(idNumber)) throw new Error("Enter a valid ID number.");
      return { idType: idType, idNumber: idNumber };
    }

    var licenseName = NS.security.sanitizeText(info.licenseName, 60);
    var licenseNo = NS.validation.normalizeLicense(info.licenseNo);
    var licenseExpiry = NS.security.sanitizeText(info.licenseExpiry, 10);
    var licenseAddress = NS.security.sanitizeText(info.licenseAddress, 120);
    var emergencyPhone = NS.validation.normalizePhone(info.emergencyPhone || "");

    if (!licenseName) throw new Error("Enter the full name on your driver's license.");
    if (!NS.validation.license(licenseNo)) throw new Error("Enter a valid driver's license number.");
    if (!NS.validation.futureDate(licenseExpiry)) throw new Error("License expiry must be today or later.");
    if (!licenseAddress) throw new Error("Enter the address on your license.");
    if (!NS.validation.phMobile(emergencyPhone)) {
      throw new Error("Enter a Philippine emergency contact number (09XXXXXXXXX).");
    }
    var licensePhoto = typeof info.licensePhoto === "string" ? info.licensePhoto.trim() : "";
    if (!licensePhoto) throw new Error("Upload a photo of your driver's license for self-drive.");
    if (!/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(licensePhoto)) {
      throw new Error("License photo must be a JPG, PNG, or WebP image.");
    }
    if (licensePhoto.length > 750000) {
      throw new Error("License photo is too large. Choose a clearer, smaller photo.");
    }

    return {
      licenseName: licenseName,
      licenseNo: licenseNo,
      licenseExpiry: licenseExpiry,
      licenseAddress: licenseAddress,
      emergencyPhone: emergencyPhone,
      licensePhoto: licensePhoto
    };
  }

  function assertBookingAccess(booking) {
    var me = NS.auth.current();
    if (!me) throw new Error("Sign in required.");
    if (me.role === "admin" || me.role === "staff") return me;
    if (booking.userId !== me.id) throw new Error("You cannot access this booking.");
    return me;
  }

  function payBooking(bookingId, payload, csrf) {
    try {
      if (csrf) NS.security.assertCsrf(csrf);
      else NS.security.issueCsrf();
    } catch (csrfErr) {
      NS.security.issueCsrf();
    }
    var booking = getBooking(bookingId);
    if (!booking) throw new Error("Booking not found.");
    var me = assertBookingAccess(booking);
    if (booking.paymentStatus === "paid") throw new Error("This booking is already paid.");
    if (booking.status === "cancelled" || booking.status === "rejected") {
      throw new Error("This booking cannot be paid.");
    }

    var method = payload && payload.method === "cashless" ? "cashless" : "cash";
    var payment;

    if (method === "cashless") {
      var wallet = NS.security.sanitizeText(payload.wallet, 20);
      var account = NS.validation.normalizePhone(payload.account || "");
      var allowedWallets = ["GCash", "Maya", "GrabPay"];
      if (allowedWallets.indexOf(wallet) === -1) throw new Error("Choose a cashless wallet.");
      if (!NS.validation.phMobile(account)) {
        throw new Error("Enter the mobile number linked to your wallet (09XXXXXXXXX).");
      }
      payment = {
        method: "cashless",
        brand: wallet,
        last4: account.slice(-4),
        holder: account,
        authCode: "CASHLESS" + NS.security.randomHex(2).toUpperCase(),
        paidAt: new Date().toISOString()
      };
      audit("payment", me.id, booking.ref + " cashless " + wallet + " ·••" + account.slice(-4));
    } else {
      if (!payload.confirmed) throw new Error("Confirm that you will pay in cash at pickup or the desk.");
      payment = {
        method: "cash",
        brand: "Cash",
        last4: "CASH",
        holder: me.firstName + " " + me.lastName,
        authCode: "CASH" + NS.security.randomHex(3).toUpperCase(),
        paidAt: new Date().toISOString()
      };
      audit("payment", me.id, booking.ref + " cash at desk");
    }

    booking.payment = payment;
    booking.paymentMethod = method;
    booking.paymentStatus = "paid";
    booking.updatedAt = new Date().toISOString();
    var list = bookings();
    for (var i = 0; i < list.length; i++) if (list[i].id === booking.id) list[i] = booking;
    saveBookings(list);

    var paymentRow = {
      id: "pay_" + NS.security.randomHex(6),
      bookingId: booking.id,
      bookingRef: booking.ref,
      amount: booking.total,
      paymentMethod: method,
      referenceNumber: payment.authCode,
      paymentDate: payment.paidAt,
      paymentStatus: "paid",
      brand: payment.brand,
      createdAt: payment.paidAt
    };
    var pays = payments();
    pays.unshift(paymentRow);
    savePayments(pays);

    var payer = NS.auth.userById(booking.userId) || me;
    var payNote =
      "Payment received for " +
      booking.ref +
      " via " +
      (method === "cashless" ? "cashless wallet" : "cash") +
      ".";
    var payThread = threads().filter(function (t) {
      return t.bookingId === booking.id;
    })[0];
    if (payThread) {
      pushThreadMessage(payThread, "customer", payer, payNote);
      saveThread(payThread);
    }
    audit("payment-desk", me.id, booking.ref + " paid · desk notified");
    return booking;
  }

  function setBookingStatus(bookingId, status, csrf) {
    try {
      if (csrf) NS.security.assertCsrf(csrf);
      else NS.security.issueCsrf();
    } catch (csrfErr) {
      NS.security.issueCsrf();
    }
    var allowed = {
      pending: ["confirmed", "rejected", "cancelled"],
      confirmed: ["ongoing", "cancelled", "return_requested"],
      ongoing: ["completed", "return_requested"],
      return_requested: ["completed", "ongoing"],
      rejected: [],
      cancelled: [],
      completed: []
    };
    var booking = getBooking(bookingId);
    if (!booking) throw new Error("Booking not found.");
    var me = assertBookingAccess(booking);
    var next = NS.security.sanitizeText(status, 20);
    if ((allowed[booking.status] || []).indexOf(next) === -1) {
      throw new Error("That status change is not allowed.");
    }
    if (next === "cancelled" && me.role === "customer") {
      if (booking.status === "ongoing" || booking.status === "completed" || booking.status === "return_requested") {
        throw new Error("Active or finished trips cannot be cancelled online.");
      }
    }
    if (next === "return_requested") {
      if (me.role !== "customer" && !NS.auth.hasRole("staff")) {
        throw new Error("Sign in as the renter to return this vehicle.");
      }
      if (me.role === "customer" && booking.userId !== me.id) {
        throw new Error("You can only return your own vehicle.");
      }
    }
    if (
      (next === "confirmed" || next === "rejected" || next === "ongoing" || next === "completed") &&
      !NS.auth.hasRole("staff")
    ) {
      throw new Error("Staff must process this status.");
    }
    if (next === "confirmed" && booking.paymentStatus !== "paid") {
      throw new Error("Confirm only after payment.");
    }
    booking.status = next;
    booking.updatedAt = new Date().toISOString();
    if (next === "return_requested") {
      booking.returnRequestedAt = new Date().toISOString();
      booking.returnRequestedBy = me.id;
    }
    if (next === "completed") {
      booking.returnedAt = new Date().toISOString();
      booking.returnedBy = me.id;
    }
    var list = bookings();
    for (var i = 0; i < list.length; i++) if (list[i].id === booking.id) list[i] = booking;
    saveBookings(list);
    audit("booking-status", me.id, booking.ref + " → " + next);

    var statusThread = threads().filter(function (t) {
      return t.bookingId === booking.id;
    })[0];
    if (!statusThread && (next === "return_requested" || next === "completed")) {
      var customer = NS.auth.userById(booking.userId) || me;
      statusThread = notifyStaffOfBooking(booking, customer);
    }
    if (statusThread) {
      var note;
      if (next === "return_requested") {
        note =
          "Customer requested vehicle return for " +
          booking.ref +
          " at " +
          (booking.dropoff || "the return location") +
          ". Please accept the return at the desk.";
      } else if (next === "completed") {
        note = "Desk accepted vehicle return for " + booking.ref + ". Trip completed.";
      } else if (NS.auth.hasRole("staff")) {
        note = "Desk updated booking " + booking.ref + " to " + next + ".";
      } else {
        note = "Customer updated booking " + booking.ref + " to " + next + ".";
      }
      pushThreadMessage(
        statusThread,
        NS.auth.hasRole("staff") && next !== "return_requested" ? "staff" : "customer",
        me,
        note
      );
      if (next === "return_requested") {
        statusThread.unreadStaff = true;
        statusThread.kind = "return";
        statusThread.topic = "Return · " + booking.ref;
      }
      saveThread(statusThread);
    }
    return booking;
  }

  function requestVehicleReturn(bookingId, notes, csrf) {
    var booking = getBooking(bookingId);
    if (!booking) throw new Error("Booking not found.");
    var me = assertBookingAccess(booking);
    if (me.role === "customer" && booking.userId !== me.id) {
      throw new Error("You can only return your own vehicle.");
    }
    if (booking.status !== "confirmed" && booking.status !== "ongoing") {
      throw new Error("Only confirmed or ongoing trips can be returned.");
    }
    var extra = NS.security.sanitizeText(notes || "", 240);
    if (extra) booking.returnNotes = extra;
    var list = bookings();
    for (var i = 0; i < list.length; i++) if (list[i].id === booking.id) list[i] = booking;
    saveBookings(list);
    return setBookingStatus(bookingId, "return_requested", csrf);
  }

  function acceptVehicleReturn(bookingId, csrf, extras) {
    requireStaff();
    extras = extras || {};
    var booking = getBooking(bookingId);
    if (!booking) throw new Error("Booking not found.");
    if (booking.status !== "return_requested") {
      throw new Error("This booking is not waiting for a return.");
    }
    var fuelBack = NS.security.sanitizeText(extras.fuelUponReturn || booking.fuelUponReturn || "Full", 20);
    booking.fuelUponReturn = fuelBack;
    var list = bookings();
    for (var i = 0; i < list.length; i++) if (list[i].id === booking.id) list[i] = booking;
    saveBookings(list);
    return setBookingStatus(bookingId, "completed", csrf);
  }

  function pendingReturns() {
    if (!NS.auth.hasRole("staff")) throw new Error("Staff access required.");
    return bookings()
      .filter(function (b) {
        return b.status === "return_requested";
      })
      .slice()
      .sort(function (a, b) {
        return String(b.returnRequestedAt || b.updatedAt || "").localeCompare(
          String(a.returnRequestedAt || a.updatedAt || "")
        );
      });
  }

  function getRatingForBooking(bookingId) {
    var list = ratings();
    for (var i = 0; i < list.length; i++) {
      if (list[i].bookingId === bookingId) return list[i];
    }
    return null;
  }

  function ratingsForVehicle(vehicleId) {
    return ratings()
      .filter(function (r) {
        return r.vehicleId === vehicleId;
      })
      .slice()
      .sort(function (a, b) {
        return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
      });
  }

  function vehicleRatingSummary(vehicleId) {
    var list = ratingsForVehicle(vehicleId);
    if (!list.length) return { average: 0, count: 0 };
    var sum = 0;
    for (var i = 0; i < list.length; i++) sum += list[i].stars;
    return {
      average: Math.round((sum / list.length) * 10) / 10,
      count: list.length
    };
  }

  function rateBooking(bookingId, stars, comment, csrf) {
    try {
      if (csrf) NS.security.assertCsrf(csrf);
      else NS.security.issueCsrf();
    } catch (csrfErr) {
      NS.security.issueCsrf();
    }
    var booking = getBooking(bookingId);
    if (!booking) throw new Error("Booking not found.");
    var me = assertBookingAccess(booking);
    if (me.role !== "customer" || booking.userId !== me.id) {
      throw new Error("Only the renter can rate this car.");
    }
    if (booking.status !== "completed") {
      throw new Error("Rate the car after the trip is completed.");
    }
    if (getRatingForBooking(booking.id)) {
      throw new Error("You already rated this trip.");
    }
    var score = parseInt(stars, 10);
    if (!(score >= 1 && score <= 5)) throw new Error("Choose a rating from 1 to 5 stars.");
    var note = NS.security.sanitizeText(comment || "", 280);
    var rating = {
      id: "rate_" + NS.security.randomHex(6),
      bookingId: booking.id,
      bookingRef: booking.ref,
      vehicleId: booking.vehicleId,
      userId: me.id,
      userName: NS.security.sanitizeText(
        ((me.firstName || "") + " " + (me.lastName || "")).trim() || "Customer",
        60
      ),
      stars: score,
      comment: note,
      createdAt: new Date().toISOString()
    };
    var list = ratings();
    list.unshift(rating);
    saveRatings(list);
    booking.rating = {
      stars: rating.stars,
      comment: rating.comment,
      at: rating.createdAt
    };
    booking.updatedAt = new Date().toISOString();
    var all = bookings();
    for (var i = 0; i < all.length; i++) if (all[i].id === booking.id) all[i] = booking;
    saveBookings(all);
    audit("vehicle-rating", me.id, booking.ref + " · " + score + " stars");
    return rating;
  }

  function myBookings() {
    var me = NS.auth.current();
    if (!me) return [];
    return bookings().filter(function (b) {
      return b.userId === me.id;
    });
  }

  function allBookings() {
    requireStaff();
    return bookings().slice().sort(function (a, b) {
      return a.createdAt < b.createdAt ? 1 : -1;
    });
  }

  function saveVehicle(payload, csrf) {
    NS.security.assertCsrf(csrf);
    requireAdmin();
    var me = NS.auth.current();
    var item = {
      id: payload.id || "veh_" + NS.security.randomHex(6),
      name: NS.security.sanitizeText(payload.name, 60),
      brand: NS.security.sanitizeText(payload.brand, 30),
      model: NS.security.sanitizeText(payload.model, 30),
      year: parseInt(payload.year, 10) || new Date().getFullYear(),
      type: NS.security.sanitizeText(payload.type, 20),
      transmission: NS.security.sanitizeText(payload.transmission, 12),
      fuel: NS.security.sanitizeText(payload.fuel, 12),
      seats: parseInt(payload.seats, 10) || 5,
      luggage: parseInt(payload.luggage, 10) || 2,
      mileage: Math.max(0, parseInt(payload.mileage, 10) || 0),
      yearPurchased: parseInt(payload.yearPurchased, 10) || parseInt(payload.year, 10) || new Date().getFullYear(),
      dailyRate: Math.max(0, parseInt(payload.dailyRate, 10) || 0),
      plate: NS.security.sanitizeText(payload.plate, 12).toUpperCase(),
      image: NS.security.sanitizeText(payload.image, 300),
      description: NS.security.sanitizeText(payload.description, 400),
      features: (payload.features || [])
        .map(function (f) {
          return NS.security.sanitizeText(f, 40);
        })
        .filter(Boolean),
      status: payload.status === "maintenance" ? "maintenance" : "available"
    };
    if (!item.name || !item.brand) throw new Error("Vehicle name and brand are required.");
    if (item.dailyRate < 500) throw new Error("Daily rate must be at least ₱500.");
    if (!NS.validation.plate(item.plate)) throw new Error("Enter a valid plate number.");
    var list = vehicles();
    var found = false;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === item.id) {
        list[i] = item;
        found = true;
      } else if (list[i].plate === item.plate) {
        throw new Error("That plate number is already in the fleet.");
      }
    }
    if (!found) list.push(item);
    saveVehicles(list);
    audit("vehicle-save", me.id, item.name);
    return item;
  }

  function removeVehicle(id, csrf) {
    NS.security.assertCsrf(csrf);
    requireAdmin();
    var busy = bookings().some(function (b) {
      return b.vehicleId === id && ACTIVE_BOOKING[b.status];
    });
    if (busy) throw new Error("Cannot remove a vehicle with active bookings.");
    saveVehicles(
      vehicles().filter(function (v) {
        return v.id !== id;
      })
    );
    audit("vehicle-remove", NS.auth.current().id, id);
  }

  function report() {
    requireStaff();
    var list = bookings();
    var paid = list.filter(function (b) {
      return b.paymentStatus === "paid" && b.status !== "rejected" && b.status !== "cancelled";
    });
    var revenue = 0;
    var byType = {};
    var byStatus = {};
    for (var i = 0; i < paid.length; i++) revenue += paid[i].total;
    for (var j = 0; j < list.length; j++) {
      byStatus[list[j].status] = (byStatus[list[j].status] || 0) + 1;
      var v = getVehicle(list[j].vehicleId);
      var t = v ? v.type : "Other";
      byType[t] = (byType[t] || 0) + (list[j].paymentStatus === "paid" ? list[j].total : 0);
    }
    return {
      bookings: list.length,
      vehicles: vehicles().length,
      customers: NS.auth.countRole("customer"),
      drivers: drivers().filter(function (d) {
        return d.status === "active";
      }).length,
      openMaintenance: maintenances().filter(function (m) {
        return !m.finished;
      }).length,
      revenue: revenue,
      byStatus: byStatus,
      byType: byType
    };
  }

  function activeDrivers() {
    return drivers()
      .filter(function (d) {
        return d.status === "active";
      })
      .slice()
      .sort(function (a, b) {
        return String(a.fullName).localeCompare(String(b.fullName));
      });
  }

  function saveDriver(payload, csrf) {
    try {
      if (csrf) NS.security.assertCsrf(csrf);
      else NS.security.issueCsrf();
    } catch (e) {
      NS.security.issueCsrf();
    }
    requireAdmin();
    var item = {
      id: payload.id || "drv_" + NS.security.randomHex(6),
      fullName: NS.security.sanitizeText(payload.fullName, 80),
      driverLicense: NS.security.sanitizeText(payload.driverLicense, 30).toUpperCase(),
      typeDriverLicense: NS.security.sanitizeText(payload.typeDriverLicense || "Professional", 30),
      licenseExpiry: NS.security.sanitizeText(payload.licenseExpiry, 10),
      status: payload.status === "inactive" ? "inactive" : "active",
      dutyStatus: payload.dutyStatus === "on_call" ? "on_call" : "regular",
      phone: NS.security.sanitizeText(payload.phone || "", 15),
      updatedAt: new Date().toISOString()
    };
    if (!item.fullName) throw new Error("Driver full name is required.");
    if (!item.driverLicense) throw new Error("Driver license is required.");
    if (!NS.validation.futureDate(item.licenseExpiry)) throw new Error("License expiry must be in the future.");
    var list = drivers();
    var found = false;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === item.id) {
        if (list[i].userId) item.userId = list[i].userId;
        if (list[i].createdAt) item.createdAt = list[i].createdAt;
        list[i] = item;
        found = true;
      }
    }
    if (!found) {
      item.createdAt = new Date().toISOString();
      list.push(item);
    }
    saveDrivers(list);
    audit("driver-save", NS.auth.current().id, item.fullName);
    return item;
  }

  function removeDriver(id, csrf) {
    NS.security.assertCsrf(csrf);
    requireAdmin();
    var busy = bookings().some(function (b) {
      return b.driverDetailsId === id && ACTIVE_BOOKING[b.status];
    });
    if (busy) throw new Error("Cannot remove a driver assigned to an active booking.");
    saveDrivers(
      drivers().filter(function (d) {
        return d.id !== id;
      })
    );
    audit("driver-remove", NS.auth.current().id, id);
  }

  /* -------- Driver self-service (view assigned trips, update trip/fuel) -------- */

  var DRIVER_FUEL_LEVELS = ["Full", "3/4", "1/2", "1/4", "Reserve", "Empty"];

  function currentDriver() {
    var me = NS.auth.current();
    if (!me || me.role !== "driver") return null;
    var list = drivers();
    for (var i = 0; i < list.length; i++) {
      if (list[i].userId === me.id || (me.driverId && list[i].id === me.driverId)) {
        return list[i];
      }
    }
    return null;
  }

  function requireDriver() {
    var d = currentDriver();
    if (!d) throw new Error("No driver profile is linked to this account.");
    return d;
  }

  function driverTrips() {
    var d = requireDriver();
    return bookings()
      .filter(function (b) {
        return b.driverDetailsId === d.id;
      })
      .slice()
      .sort(function (a, b) {
        var ra = { confirmed: 0, ongoing: 1, return_requested: 2, completed: 3 };
        var da = ra[a.status] == null ? 4 : ra[a.status];
        var db = ra[b.status] == null ? 4 : ra[b.status];
        if (da !== db) return da - db;
        return String(a.startDate || "").localeCompare(String(b.startDate || ""));
      });
  }

  function driverGetTrip(bookingId) {
    var d = requireDriver();
    var booking = getBooking(bookingId);
    if (!booking) throw new Error("Trip not found.");
    if (booking.driverDetailsId !== d.id) {
      throw new Error("This trip is not assigned to you.");
    }
    return booking;
  }

  function persistBooking(booking) {
    var list = bookings();
    for (var i = 0; i < list.length; i++) if (list[i].id === booking.id) list[i] = booking;
    saveBookings(list);
  }

  function driverSetTripStatus(bookingId, next, csrf) {
    try {
      if (csrf) NS.security.assertCsrf(csrf);
      else NS.security.issueCsrf();
    } catch (e) {
      NS.security.issueCsrf();
    }
    var me = NS.auth.current();
    var booking = driverGetTrip(bookingId);
    next = NS.security.sanitizeText(next, 20);
    var allowed = { confirmed: ["ongoing"], ongoing: ["completed"] };
    if ((allowed[booking.status] || []).indexOf(next) === -1) {
      throw new Error("That trip update is not allowed right now.");
    }
    if (next === "ongoing" && booking.paymentStatus !== "paid") {
      throw new Error("Trip can start once the booking is paid.");
    }
    booking.status = next;
    booking.updatedAt = new Date().toISOString();
    if (next === "ongoing") {
      booking.startedAt = new Date().toISOString();
      booking.startedBy = me.id;
    }
    if (next === "completed") {
      booking.returnedAt = new Date().toISOString();
      booking.returnedBy = me.id;
    }
    persistBooking(booking);
    audit("driver-trip", me.id, booking.ref + " → " + next);

    var thread = threads().filter(function (t) {
      return t.bookingId === booking.id;
    })[0];
    if (!thread) {
      var customer = NS.auth.userById(booking.userId) || me;
      thread = notifyStaffOfBooking(booking, customer);
    }
    if (thread) {
      var note =
        next === "ongoing"
          ? "Driver started trip " + booking.ref + "."
          : "Driver ended trip " + booking.ref + ". Vehicle returned.";
      pushThreadMessage(thread, "staff", me, note);
      thread.unreadStaff = true;
      saveThread(thread);
    }
    return booking;
  }

  function driverUpdateFuel(bookingId, level, csrf) {
    try {
      if (csrf) NS.security.assertCsrf(csrf);
      else NS.security.issueCsrf();
    } catch (e) {
      NS.security.issueCsrf();
    }
    var me = NS.auth.current();
    var booking = driverGetTrip(bookingId);
    if (booking.status !== "confirmed" && booking.status !== "ongoing") {
      throw new Error("Fuel can only be updated on active trips.");
    }
    var fuel = NS.security.sanitizeText(level || "", 20);
    if (!fuel) throw new Error("Choose a fuel level.");
    if (booking.status === "confirmed") booking.fuelBeforeRent = fuel;
    else booking.fuelUponReturn = fuel;
    booking.updatedAt = new Date().toISOString();
    persistBooking(booking);
    audit("driver-fuel", me.id, booking.ref + " fuel " + fuel);
    return booking;
  }

  function saveVehicleReg(payload, csrf) {
    try {
      if (csrf) NS.security.assertCsrf(csrf);
      else NS.security.issueCsrf();
    } catch (e) {
      NS.security.issueCsrf();
    }
    requireAdmin();
    var vehicle = getVehicle(payload.vehicleId);
    if (!vehicle) throw new Error("Vehicle not found.");
    var item = {
      id: payload.id || "reg_" + NS.security.randomHex(6),
      vehicleId: vehicle.id,
      plateNumber: vehicle.plate,
      renewalScheduledDay: NS.security.sanitizeText(payload.renewalScheduledDay || "", 10),
      nextRegRenewal: NS.security.sanitizeText(payload.nextRegRenewal || "", 10),
      updatedAt: new Date().toISOString()
    };
    if (!item.nextRegRenewal) throw new Error("Next registration renewal date is required.");
    var list = vehicleRegs();
    var found = false;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === item.id || list[i].vehicleId === item.vehicleId) {
        item.id = list[i].id;
        list[i] = item;
        found = true;
      }
    }
    if (!found) list.push(item);
    saveVehicleRegs(list);
    audit("vehicle-reg", NS.auth.current().id, vehicle.plate);
    return item;
  }

  function saveMaintenance(payload, csrf) {
    try {
      if (csrf) NS.security.assertCsrf(csrf);
      else NS.security.issueCsrf();
    } catch (e) {
      NS.security.issueCsrf();
    }
    requireAdmin();
    var vehicle = getVehicle(payload.vehicleId);
    if (!vehicle) throw new Error("Vehicle not found.");
    var item = {
      id: payload.id || "mnt_" + NS.security.randomHex(6),
      vehicleId: vehicle.id,
      maintenanceType: NS.security.sanitizeText(payload.maintenanceType, 60),
      scheduledDate: NS.security.sanitizeText(payload.scheduledDate, 10),
      performedAt: NS.security.sanitizeText(payload.performedAt || "", 10),
      finished: !!payload.finished,
      notes: NS.security.sanitizeText(payload.notes || "", 200),
      updatedAt: new Date().toISOString()
    };
    if (!item.maintenanceType) throw new Error("Maintenance type is required.");
    if (!item.scheduledDate) throw new Error("Scheduled date is required.");
    var list = maintenances();
    var found = false;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === item.id) {
        list[i] = item;
        found = true;
      }
    }
    if (!found) {
      item.createdAt = new Date().toISOString();
      list.unshift(item);
    }
    saveMaintenances(list);
    if (item.finished) {
      /* keep vehicle available unless still open jobs */
      var open = list.some(function (m) {
        return m.vehicleId === vehicle.id && !m.finished;
      });
      if (!open && vehicle.status === "maintenance") {
        vehicle.status = "available";
        var vs = vehicles();
        for (var v = 0; v < vs.length; v++) if (vs[v].id === vehicle.id) vs[v] = vehicle;
        saveVehicles(vs);
      }
    } else if (vehicle.status === "available") {
      vehicle.status = "maintenance";
      var vs2 = vehicles();
      for (var w = 0; w < vs2.length; w++) if (vs2[w].id === vehicle.id) vs2[w] = vehicle;
      saveVehicles(vs2);
    }
    audit("maintenance", NS.auth.current().id, vehicle.plate + " · " + item.maintenanceType);
    return item;
  }

  function saveFuelRecord(payload, csrf) {
    try {
      if (csrf) NS.security.assertCsrf(csrf);
      else NS.security.issueCsrf();
    } catch (e) {
      NS.security.issueCsrf();
    }
    requireAdmin();
    var vehicle = getVehicle(payload.vehicleId);
    if (!vehicle) throw new Error("Vehicle not found.");
    var item = {
      id: payload.id || "fuel_" + NS.security.randomHex(6),
      vehicleId: vehicle.id,
      fuelType: NS.security.sanitizeText(payload.fuelType || vehicle.fuel || "Gasoline", 20),
      recordedAt: new Date().toISOString(),
      notes: NS.security.sanitizeText(payload.notes || "", 120)
    };
    var list = fuelRecords();
    list.unshift(item);
    saveFuelRecords(list.slice(0, 200));
    vehicle.fuel = item.fuelType;
    var vs = vehicles();
    for (var i = 0; i < vs.length; i++) if (vs[i].id === vehicle.id) vs[i] = vehicle;
    saveVehicles(vs);
    audit("fuel-record", NS.auth.current().id, vehicle.plate + " · " + item.fuelType);
    return item;
  }

  function allPayments() {
    requireStaff();
    return payments()
      .slice()
      .sort(function (a, b) {
        return String(b.paymentDate || "").localeCompare(String(a.paymentDate || ""));
      });
  }

  function regsForVehicle(vehicleId) {
    return vehicleRegs().filter(function (r) {
      return r.vehicleId === vehicleId;
    });
  }

  function maintenanceForVehicle(vehicleId) {
    return maintenances().filter(function (m) {
      return m.vehicleId === vehicleId;
    });
  }

  function fuelForVehicle(vehicleId) {
    return fuelRecords().filter(function (f) {
      return f.vehicleId === vehicleId;
    });
  }

  function seedUsers() {
    function make(role, email, password, first, last, phone, extra) {
      var salt = NS.security.randomHex(16);
      var user = {
        id: "usr_" + role,
        email: email,
        passwordHash: NS.security.hashPassword(password, salt),
        salt: salt,
        role: role,
        firstName: first,
        lastName: last,
        phone: phone,
        address: (extra && extra.address) || "",
        department: (extra && extra.department) || "",
        licenseNo: role === "customer" ? "N04-12-345678" : "A01-11-100001",
        licenseExpiry: "2028-12-31",
        avatar: "",
        status: "active",
        createdAt: "2026-01-15T08:00:00.000Z"
      };
      return user;
    }
    var seeded = [
      make("admin", "admin@idrivecdo.ph", "Drive@Admin1", "Mara", "Villanueva", "09171234567", {
        address: "Limketkai Drive, CDO",
        department: "Administration"
      }),
      make("staff", "staff@idrivecdo.ph", "Drive@Staff1", "Ken", "Sable", "09181234567", {
        address: "Divisoria, CDO",
        department: "Rental-Incharge"
      }),
      make("customer", "guest@idrivecdo.ph", "Drive@Guest1", "Paolo", "Reyes", "09191234567", {
        address: "Uptown Cagayan de Oro"
      })
    ];
    seeded[2].avatar =
      "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=320&h=320&q=80";
    return seeded;
  }

  function seedVehicles() {
    return [
      {
        id: "veh_vios",
        name: "Toyota Vios 2024",
        brand: "Toyota",
        model: "Vios",
        year: 2024,
        type: "Sedan",
        transmission: "Automatic",
        fuel: "Gasoline",
        seats: 5,
        luggage: 2,
        dailyRate: 1800,
        plate: "CDO-1001",
        image: "https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&w=1400&q=80",
        description: "City-friendly sedan for downtown CDO, mall runs, and airport transfers.",
        features: ["Bluetooth", "Backup camera", "USB charging", "Fuel efficient"],
        status: "available"
      },
      {
        id: "veh_city",
        name: "Honda City 2023",
        brand: "Honda",
        model: "City",
        year: 2023,
        type: "Sedan",
        transmission: "Automatic",
        fuel: "Gasoline",
        seats: 5,
        luggage: 2,
        dailyRate: 1900,
        plate: "CDO-1002",
        image: "https://images.unsplash.com/photo-1590362891991-f776e747a588?auto=format&fit=crop&w=1400&q=80",
        description: "Quiet cabin and strong air-conditioning for long CDO heat.",
        features: ["Cruise control", "Apple CarPlay", "Keyless entry"],
        status: "available"
      },
      {
        id: "veh_mirage",
        name: "Mitsubishi Mirage G4",
        brand: "Mitsubishi",
        model: "Mirage G4",
        year: 2023,
        type: "Sedan",
        transmission: "Automatic",
        fuel: "Gasoline",
        seats: 5,
        luggage: 1,
        dailyRate: 1500,
        plate: "CDO-1003",
        image: "https://images.unsplash.com/photo-1552519507-da3b142c6e3d?auto=format&fit=crop&w=1400&q=80",
        description: "Light on fuel. Ideal for solo travelers and couples.",
        features: ["Compact park", "Touchscreen", "Eco mode"],
        status: "available"
      },
      {
        id: "veh_fortuner",
        name: "Toyota Fortuner",
        brand: "Toyota",
        model: "Fortuner",
        year: 2024,
        type: "SUV",
        transmission: "Automatic",
        fuel: "Diesel",
        seats: 7,
        luggage: 4,
        dailyRate: 4500,
        plate: "CDO-2001",
        image: "https://images.unsplash.com/photo-1519641471654-76ce0107ad1b?auto=format&fit=crop&w=1400&q=80",
        description: "Family SUV for Bukidnon roads, Camiguin trips, and group tours.",
        features: ["4x2", "Third row", "Hill assist", "Rear AC"],
        status: "available"
      },
      {
        id: "veh_montero",
        name: "Mitsubishi Montero Sport",
        brand: "Mitsubishi",
        model: "Montero Sport",
        year: 2023,
        type: "SUV",
        transmission: "Automatic",
        fuel: "Diesel",
        seats: 7,
        luggage: 4,
        dailyRate: 4300,
        plate: "CDO-2002",
        image: "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=1400&q=80",
        description: "High clearance for CDO rain days and mountain weekends.",
        features: ["Leather seats", "Paddle shift", "Camera 360"],
        status: "available"
      },
      {
        id: "veh_crv",
        name: "Honda CR-V",
        brand: "Honda",
        model: "CR-V",
        year: 2024,
        type: "SUV",
        transmission: "Automatic",
        fuel: "Gasoline",
        seats: 5,
        luggage: 3,
        dailyRate: 3800,
        plate: "CDO-2003",
        image: "https://images.unsplash.com/photo-1606664515524-ed2f786a0bd6?auto=format&fit=crop&w=1400&q=80",
        description: "Comfortable crossover for city hotels and uptown stays.",
        features: ["Honda Sensing", "Sunroof", "Power tailgate"],
        status: "available"
      },
      {
        id: "veh_everest",
        name: "Ford Everest",
        brand: "Ford",
        model: "Everest",
        year: 2023,
        type: "SUV",
        transmission: "Automatic",
        fuel: "Diesel",
        seats: 7,
        luggage: 4,
        dailyRate: 4200,
        plate: "CDO-2004",
        image: "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=1400&q=80",
        description: "Strong towing and highway presence for northbound trips.",
        features: ["Terrain modes", "SYNC infotainment", "LED lights"],
        status: "available"
      },
      {
        id: "veh_hiace",
        name: "Toyota Hiace Commuter",
        brand: "Toyota",
        model: "Hiace",
        year: 2023,
        type: "Van",
        transmission: "Manual",
        fuel: "Diesel",
        seats: 15,
        luggage: 8,
        dailyRate: 5000,
        plate: "CDO-3001",
        image: "https://images.unsplash.com/photo-1527786356703-4b100091cd2c?auto=format&fit=crop&w=1400&q=80",
        description: "Group van for company outings, church trips, and airport batches.",
        features: ["High roof", "Dual AC", "Wide sliding doors"],
        status: "available"
      },
      {
        id: "veh_alphard",
        name: "Toyota Alphard",
        brand: "Toyota",
        model: "Alphard",
        year: 2022,
        type: "Van",
        transmission: "Automatic",
        fuel: "Gasoline",
        seats: 7,
        luggage: 4,
        dailyRate: 8500,
        plate: "CDO-3002",
        image: "https://images.unsplash.com/photo-1619767886558-efdc259cde1a?auto=format&fit=crop&w=1400&q=80",
        description: "Executive van with captain seats for VIP airport arrivals.",
        features: ["Captain seats", "Power sliding doors", "Premium audio"],
        status: "available"
      },
      {
        id: "veh_hilux",
        name: "Toyota Hilux Conquest",
        brand: "Toyota",
        model: "Hilux",
        year: 2024,
        type: "Pickup",
        transmission: "Automatic",
        fuel: "Diesel",
        seats: 5,
        luggage: 5,
        dailyRate: 3600,
        plate: "CDO-4001",
        image: "https://images.unsplash.com/photo-1559416523-140ddc3d238c?auto=format&fit=crop&w=1400&q=80",
        description: "Workhorse pickup for cargo, site visits, and rough farm roads.",
        features: ["4x4", "Bed liner", "Tow hook"],
        status: "available"
      },
      {
        id: "veh_ranger",
        name: "Ford Ranger Wildtrak",
        brand: "Ford",
        model: "Ranger",
        year: 2024,
        type: "Pickup",
        transmission: "Automatic",
        fuel: "Diesel",
        seats: 5,
        luggage: 5,
        dailyRate: 3900,
        plate: "CDO-4002",
        image: "https://images.unsplash.com/photo-1609521263047-f8f205293f24?auto=format&fit=crop&w=1400&q=80",
        description: "Lifestyle pickup for beach gear and weekend camping.",
        features: ["Sports bar", "Leather-trimmed", "Off-road tires"],
        status: "available"
      },
      {
        id: "veh_landcruiser",
        name: "Toyota Land Cruiser Prado",
        brand: "Toyota",
        model: "Prado",
        year: 2022,
        type: "SUV",
        transmission: "Automatic",
        fuel: "Diesel",
        seats: 7,
        luggage: 4,
        dailyRate: 7800,
        plate: "CDO-2005",
        image: "https://images.unsplash.com/photo-1544636331-e26879cd4d9b?auto=format&fit=crop&w=1400&q=80",
        description: "Flagship SUV for long north Mindanao itineraries.",
        features: ["Crawl control", "Cool box", "Multi-terrain"],
        status: "available"
      }
    ];
  }

  function seedBookings() {
    return [
      {
        id: "bkg_demo1",
        ref: "IDR-20260901-A1B",
        userId: "usr_customer",
        vehicleId: "veh_vios",
        startDate: "2026-09-12",
        endDate: "2026-09-15",
        days: 3,
        pickup: "Laguindingan Airport (CGY)",
        dropoff: "Centrio Mall",
        addons: ["gps"],
        subtotal: 5400,
        extras: 600,
        total: 6000,
        status: "confirmed",
        paymentStatus: "paid",
        payment: {
          brand: "Visa",
          last4: "4242",
          holder: "Paolo Reyes",
          authCode: "AUTH9C2",
          paidAt: "2026-09-01T10:12:00.000Z"
        },
        notes: "Flight 3P 221, arriving 1:10 PM.",
        createdAt: "2026-09-01T10:00:00.000Z",
        updatedAt: "2026-09-01T10:12:00.000Z"
      }
    ];
  }

  function seedDrivers() {
    return [
      {
        id: "drv_001",
        fullName: "Rico Manalo",
        driverLicense: "N02-98-112233",
        typeDriverLicense: "Professional",
        licenseExpiry: "2028-06-30",
        status: "active",
        dutyStatus: "on_call",
        phone: "09170001111",
        createdAt: "2026-01-15T08:00:00.000Z"
      },
      {
        id: "drv_002",
        fullName: "Ana Belmonte",
        driverLicense: "N03-01-445566",
        typeDriverLicense: "Professional",
        licenseExpiry: "2029-01-15",
        status: "active",
        dutyStatus: "regular",
        phone: "09170002222",
        createdAt: "2026-01-15T08:00:00.000Z"
      }
    ];
  }

  function seedVehicleRegs() {
    return vehicles().map(function (v, idx) {
      return {
        id: "reg_" + v.id,
        vehicleId: v.id,
        plateNumber: v.plate,
        renewalScheduledDay: "15",
        nextRegRenewal: "2027-0" + ((idx % 9) + 1) + "-15",
        updatedAt: "2026-01-15T08:00:00.000Z"
      };
    });
  }

  function seedMaintenances() {
    return [
      {
        id: "mnt_001",
        vehicleId: "veh_vios",
        maintenanceType: "Oil change",
        scheduledDate: "2026-09-20",
        performedAt: "",
        finished: false,
        notes: "Routine service",
        createdAt: "2026-09-01T08:00:00.000Z"
      }
    ];
  }

  function seedFuelRecords() {
    return vehicles().map(function (v) {
      return {
        id: "fuel_" + v.id,
        vehicleId: v.id,
        fuelType: v.fuel || "Gasoline",
        recordedAt: "2026-01-15T08:00:00.000Z",
        notes: "Initial fuel type from registration"
      };
    });
  }

  function ensureErdSeed() {
    if (!drivers().length) saveDrivers(seedDrivers());
    var vs = vehicles();
    var changed = false;
    for (var i = 0; i < vs.length; i++) {
      if (typeof vs[i].mileage !== "number") {
        vs[i].mileage = 12000 + i * 1500;
        changed = true;
      }
      if (!vs[i].yearPurchased) {
        vs[i].yearPurchased = vs[i].year || 2024;
        changed = true;
      }
    }
    if (changed) saveVehicles(vs);
    if (!vehicleRegs().length && vs.length) saveVehicleRegs(seedVehicleRegs());
    if (!maintenances().length) saveMaintenances(seedMaintenances());
    if (!fuelRecords().length && vs.length) saveFuelRecords(seedFuelRecords());
    if (!payments().length) {
      var pays = [];
      bookings().forEach(function (b) {
        if (b.paymentStatus === "paid" && b.payment) {
          pays.push({
            id: "pay_" + NS.security.randomHex(6),
            bookingId: b.id,
            bookingRef: b.ref,
            amount: b.total,
            paymentMethod: b.payment.method || b.paymentMethod || "cash",
            referenceNumber: b.payment.authCode || "",
            paymentDate: b.payment.paidAt || b.updatedAt,
            paymentStatus: "paid",
            brand: b.payment.brand || "",
            createdAt: b.payment.paidAt || b.updatedAt
          });
        }
      });
      savePayments(pays);
    }
    var users = NS.store.get("users", []);
    var userChanged = false;
    for (var u = 0; u < users.length; u++) {
      if (users[u].address === undefined) {
        users[u].address = "";
        userChanged = true;
      }
      if (users[u].department === undefined) {
        users[u].department = users[u].role === "staff" ? "Rental-Incharge" : users[u].role === "admin" ? "Administration" : "";
        userChanged = true;
      }
    }
    if (userChanged) NS.store.set("users", users);

    // Driver login account for the self-service trip interface.
    var hasDriverUser = users.some(function (u) {
      return u.role === "driver";
    });
    if (!hasDriverUser) {
      var salt = NS.security.randomHex(16);
      users.push({
        id: "usr_driver",
        email: "driver@idrivecdo.ph",
        passwordHash: NS.security.hashPassword("Drive@Driver1", salt),
        salt: salt,
        role: "driver",
        firstName: "Rico",
        lastName: "Manalo",
        phone: "09170001111",
        address: "Carmen, Cagayan de Oro",
        department: "Chauffeur",
        licenseNo: "N02-98-112233",
        licenseExpiry: "2028-06-30",
        avatar: "",
        status: "active",
        driverId: "drv_001",
        createdAt: new Date().toISOString()
      });
      NS.store.set("users", users);
    }

    // Link the driver record back to its login account.
    var ds = drivers();
    var dsChanged = false;
    for (var di = 0; di < ds.length; di++) {
      if (ds[di].id === "drv_001" && !ds[di].userId) {
        ds[di].userId = "usr_driver";
        dsChanged = true;
      }
      if (!ds[di].dutyStatus) {
        ds[di].dutyStatus = di === 0 ? "on_call" : "regular";
        dsChanged = true;
      }
    }
    if (dsChanged) saveDrivers(ds);

    // Ensure at least one chauffeur trip is assigned so the driver has work to see.
    var hasAssigned = bookings().some(function (b) {
      return !!b.driverDetailsId;
    });
    if (!hasAssigned && getVehicle("veh_fortuner")) {
      var bl = bookings();
      bl.unshift({
        id: "bkg_driver1",
        ref: "IDR-20260918-C7D",
        userId: "usr_customer",
        vehicleId: "veh_fortuner",
        startDate: "2026-09-18",
        endDate: "2026-09-20",
        days: 2,
        pickup: "Laguindingan Airport (CGY)",
        dropoff: "Uptown Cagayan de Oro",
        pickupTime: "13:00",
        returnTime: "10:00",
        driveMode: "chauffeur",
        driverOption: "Chauffeur",
        driverDetailsId: "drv_001",
        numberOfPassengers: 4,
        fuelBeforeRent: "Full",
        fuelUponReturn: "",
        addons: ["driver"],
        subtotal: 9000,
        extras: 3000,
        total: 12000,
        status: "confirmed",
        paymentStatus: "paid",
        payment: {
          brand: "Visa",
          last4: "4242",
          holder: "Paolo Reyes",
          authCode: "AUTHC7D",
          method: "card",
          paidAt: "2026-09-10T09:00:00.000Z"
        },
        notes: "VIP airport pickup, 4 passengers.",
        createdAt: "2026-09-10T08:30:00.000Z",
        updatedAt: "2026-09-10T09:00:00.000Z"
      });
      saveBookings(bl);
    }
  }

  function seedIfNeeded() {
    if (!NS.store.get("seeded", false)) {
      NS.store.set("users", seedUsers());
      NS.store.set("vehicles", seedVehicles());
      NS.store.set("bookings", seedBookings());
      NS.store.set("audit", []);
      NS.store.set("threads", []);
      NS.store.set("drivers", seedDrivers());
      NS.store.set("vehicleRegs", []);
      NS.store.set("maintenances", seedMaintenances());
      NS.store.set("fuelRecords", []);
      NS.store.set("payments", []);
      NS.store.set("ratings", []);
      NS.store.set("seeded", true);
      saveVehicleRegs(seedVehicleRegs());
      saveFuelRecords(seedFuelRecords());
      audit("seed", "system", "Initial fleet and demo accounts loaded.");
    } else {
      patchVehicleImages();
    }
    migrateLegacyInbox();
    ensureErdSeed();
  }

  function migrateLegacyInbox() {
    var inbox = NS.store.get("inbox", []) || [];
    if (!inbox.length) return;
    var existing = threads();
    for (var i = 0; i < inbox.length; i++) {
      var m = inbox[i];
      var already = false;
      for (var t = 0; t < existing.length; t++) {
        if (existing[t].legacyId === m.id) already = true;
      }
      if (already) continue;
      existing.unshift({
        id: "thd_" + NS.security.randomHex(8),
        kind: "contact",
        topic: m.topic || "Contact",
        legacyId: m.id,
        bookingId: null,
        bookingRef: "",
        customerId: null,
        customerName: m.name || "Guest",
        customerEmail: m.email || "",
        customerPhone: "",
        status: "open",
        unreadStaff: true,
        unreadCustomer: false,
        messages: [
          {
            id: m.id || "msg_" + NS.security.randomHex(6),
            fromRole: "customer",
            fromUserId: null,
            fromName: m.name || "Guest",
            body: m.message || "",
            at: m.at || new Date().toISOString()
          }
        ],
        createdAt: m.at || new Date().toISOString(),
        updatedAt: m.at || new Date().toISOString()
      });
    }
    saveThreads(existing);
    NS.store.set("inbox", []);
  }

  function patchVehicleImages() {
    var seeded = seedVehicles();
    var byId = {};
    for (var s = 0; s < seeded.length; s++) byId[seeded[s].id] = seeded[s].image;
    var list = vehicles();
    var changed = false;
    for (var i = 0; i < list.length; i++) {
      if (!list[i].image && byId[list[i].id]) {
        list[i].image = byId[list[i].id];
        changed = true;
      }
    }
    if (changed) saveVehicles(list);
  }

  NS.domain = {
    LOCATIONS: LOCATIONS,
    ADDONS: ADDONS,
    vehicles: vehicles,
    bookings: bookings,
    audit: audit,
    auditLog: auditLog,
    getVehicle: getVehicle,
    getBooking: getBooking,
    isAvailable: isAvailable,
    availableVehicles: availableVehicles,
    quote: quote,
    createBooking: createBooking,
    payBooking: payBooking,
    setBookingStatus: setBookingStatus,
    requestVehicleReturn: requestVehicleReturn,
    acceptVehicleReturn: acceptVehicleReturn,
    pendingReturns: pendingReturns,
    rateBooking: rateBooking,
    getRatingForBooking: getRatingForBooking,
    ratingsForVehicle: ratingsForVehicle,
    vehicleRatingSummary: vehicleRatingSummary,
    myBookings: myBookings,
    allBookings: allBookings,
    saveVehicle: saveVehicle,
    removeVehicle: removeVehicle,
    getDriver: getDriver,
    drivers: drivers,
    activeDrivers: activeDrivers,
    saveDriver: saveDriver,
    removeDriver: removeDriver,
    DRIVER_FUEL_LEVELS: DRIVER_FUEL_LEVELS,
    currentDriver: currentDriver,
    driverTrips: driverTrips,
    driverGetTrip: driverGetTrip,
    driverSetTripStatus: driverSetTripStatus,
    driverUpdateFuel: driverUpdateFuel,
    vehicleRegs: vehicleRegs,
    saveVehicleReg: saveVehicleReg,
    regsForVehicle: regsForVehicle,
    maintenances: maintenances,
    saveMaintenance: saveMaintenance,
    maintenanceForVehicle: maintenanceForVehicle,
    fuelRecords: fuelRecords,
    saveFuelRecord: saveFuelRecord,
    fuelForVehicle: fuelForVehicle,
    payments: payments,
    allPayments: allPayments,
    report: report,
    seedIfNeeded: seedIfNeeded,
    sendContact: sendContact,
    replyToThread: replyToThread,
    markThreadRead: markThreadRead,
    getThread: getThread,
    staffThreads: staffThreads,
    myThreads: myThreads,
    staffUnreadCount: staffUnreadCount,
    incomingBookings: incomingBookings,
    ensureBookingThread: ensureBookingThread
  };
})(window);
