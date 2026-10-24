/**
 * Vehicles, bookings, payments, seed data. All in-browser.
 */
(function (global) {
  "use strict";

  var NS = (global.iDrive = global.iDrive || {});

  var OFFICE_PICKUP = "Montalvan Burgos, Cagayan de Oro";

  var LOCATIONS = [
    OFFICE_PICKUP,
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
    { id: "driver", name: "Professional driver", daily: 1500 }
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

  /* First in, first out: lowest queue number (then earliest created time) is checked first. */
  function fifoCompare(a, b) {
    var aq = Number(a.queueNo) || 0;
    var bq = Number(b.queueNo) || 0;
    if (aq && bq && aq !== bq) return aq - bq;
    var at = String(a.createdAt || a.dateReserve || "");
    var bt = String(b.createdAt || b.dateReserve || "");
    if (at !== bt) return at < bt ? -1 : 1;
    return String(a.id || "").localeCompare(String(b.id || ""));
  }

  function fifoOrder(list) {
    return (list || bookings()).slice().sort(fifoCompare);
  }

  function nextQueueNo(list) {
    var max = 0;
    (list || bookings()).forEach(function (b) {
      var n = Number(b.queueNo) || 0;
      if (n > max) max = n;
    });
    return max + 1;
  }

  function ensureQueueNumbers(list) {
    var missing = false;
    for (var i = 0; i < list.length; i++) {
      if (!Number(list[i].queueNo)) missing = true;
    }
    if (!missing) return list;
    var n = 0;
    list.forEach(function (b) {
      var q = Number(b.queueNo) || 0;
      if (q > n) n = q;
    });
    fifoOrder(list).forEach(function (b) {
      if (!Number(b.queueNo)) {
        n += 1;
        b.queueNo = n;
      }
    });
    return list;
  }

  function queuePosition(booking) {
    if (!booking) return 0;
    if (Number(booking.queueNo)) return Number(booking.queueNo);
    var ordered = fifoOrder();
    for (var i = 0; i < ordered.length; i++) {
      if (ordered[i].id === booking.id) return i + 1;
    }
    return 0;
  }

  /* Earliest booking still waiting for the desk. That is the one to check. */
  function firstBookingToCheck() {
    var ordered = fifoOrder();
    for (var i = 0; i < ordered.length; i++) {
      if (ordered[i].status === "pending") return ordered[i];
    }
    return null;
  }

  function bookingQueueText(booking) {
    if (!booking) return "";
    var total = bookings().length;
    var n = queuePosition(booking);
    var line = "Queue " + n + " of " + total;
    var first = firstBookingToCheck();
    if (first && first.id === booking.id) return line + " · Check this booking first";
    if (booking.status === "pending" && first) return line + " · Check after queue " + queuePosition(first);
    return line;
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

  function vehicleTelemetry() {
    return NS.store.get("vehicleTelemetry", {});
  }

  function maintenancePredictions() {
    return NS.store.get("maintenancePredictions", {});
  }

  function isCashless(method, brand) {
    return method === "cashless" || /gcash|instapay|maya|grabpay/i.test(String(brand || ""));
  }

  function cashlessReceipt(booking) {
    if (!booking) return "";
    var pay = booking.payment || {};
    var method = pay.method || booking.paymentMethod || "";
    var brand = pay.brand || "";
    var receipt = pay.receipt || "";
    if (!/^data:image\//i.test(receipt)) {
      var row = payments().filter(function (p) {
        return p.bookingId === booking.id && /^data:image\//i.test(p.receipt || "");
      })[0];
      if (row) {
        receipt = row.receipt;
        method = method || row.paymentMethod || "";
        brand = brand || row.brand || "";
      }
    }
    return isCashless(method, brand) && /^data:image\//i.test(receipt) ? receipt : "";
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

  var AVAILABILITY_LABELS = { available: "Available", reserved: "Reserved", maintenance: "Under maintenance" };

  /* Latest end date of active bookings overlapping the dates (today when none given); "" when free. */
  function reservedUntil(vehicleId, start, end) {
    if (!start || !end) {
      var now = new Date();
      start = localISODate(now);
      end = localISODate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
    }
    var latest = "";
    bookings().forEach(function (b) {
      if (b.vehicleId === vehicleId && ACTIVE_BOOKING[b.status] && overlaps(start, end, b.startDate, b.endDate)) {
        if (b.endDate > latest) latest = b.endDate;
      }
    });
    return latest;
  }

  /* "available", "reserved" (an active booking overlaps the dates) or "maintenance". */
  function vehicleAvailability(vehicleId, start, end) {
    var v = getVehicle(vehicleId);
    if (!v || v.status !== "available") return "maintenance";
    return reservedUntil(vehicleId, start, end) ? "reserved" : "available";
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
    if (!vehicle.dailyRate) throw new Error("This vehicle has no daily rate yet. Contact us to book it.");
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

  function ongoingBookingForUser(userId) {
    if (!userId) return null;
    var list = bookings();
    for (var i = 0; i < list.length; i++) {
      if (list[i].userId === userId && list[i].status === "ongoing") return list[i];
    }
    return null;
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
    if (me.status !== "active") throw new Error(NS.auth.DISABLED_MSG || "Your account has been disabled. Please contact the admin.");
    var bookingUserId = me.role === "staff" || me.role === "admin" ? payload.customerId || me.id : me.id;
    if (me.role === "staff" || me.role === "admin") {
      var targetCustomer = NS.auth.userById(bookingUserId);
      if (!targetCustomer || targetCustomer.role !== "customer") throw new Error("Select a customer for this booking.");
    }
    var ongoingTrip = ongoingBookingForUser(bookingUserId);
    if (ongoingTrip) {
      throw new Error(
        "This account already has a trip in progress (" +
          ongoingTrip.ref +
          "). Return that vehicle before booking another car."
      );
    }
    var driveMode = payload.driveMode === "chauffeur" ? "chauffeur" : "self";
    var pickup = NS.security.sanitizeText(payload.pickup, 120);
    var dropoff = NS.security.sanitizeText(payload.dropoff, 120);
    var handover = "";
    if (driveMode === "self") {
      pickup = OFFICE_PICKUP;
      handover = payload.handover === "deliver" ? "deliver" : "pickup";
      if (handover === "pickup") {
        dropoff = OFFICE_PICKUP;
      } else if (dropoff.length < 5) {
        throw new Error("Enter where to deliver the car.");
      }
    } else {
      if (pickup.length < 5) throw new Error("Enter a pickup location.");
      if (dropoff.length < 5) throw new Error("Enter a drop-off location.");
    }
    var addonIds = (payload.addons || []).slice();
    if (driveMode === "chauffeur" && addonIds.indexOf("driver") === -1) {
      addonIds.push("driver");
    }

    var q = quote(payload.vehicleId, payload.startDate, payload.endDate, addonIds);
    if (!q.vehicle.apiId) throw new Error("This vehicle is not in the booking system yet. Choose another car.");
    var notes = NS.security.sanitizeText(payload.notes, 400);

    var timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
    var pickupTime = String(payload.pickupTime || "");
    var returnTime = String(payload.returnTime || "");
    if (!timePattern.test(pickupTime) || !timePattern.test(returnTime)) {
      throw new Error("Choose a pickup and return time.");
    }

    var passengers = Math.max(1, parseInt(payload.numberOfPassengers, 10) || 1);
    if (q.vehicle.seats && passengers > q.vehicle.seats) {
      throw new Error("This vehicle seats " + q.vehicle.seats + " passengers.");
    }

    var driverInfo = normalizeDriverInfo(driveMode, payload.driverInfo || {}, {
      vehicle: q.vehicle,
      endDate: q.endDate,
      pickupTime: pickupTime,
      returnTime: returnTime
    });
    assertBothPartiesHaveId({
      vehicleId: q.vehicle.id,
      driverInfo: driverInfo,
      id: null
    });

    try {
      if (csrf) NS.security.assertCsrf(csrf);
      else NS.security.issueCsrf();
    } catch (csrfErr) {
      NS.security.issueCsrf();
    }

    var booking = {
      id: "bkg_" + NS.security.randomHex(8),
      ref: nextRef(),
      userId: bookingUserId,
      vehicleId: q.vehicle.id,
      startDate: q.startDate,
      endDate: q.endDate,
      pickupTime: pickupTime,
      returnTime: returnTime,
      numberOfPassengers: Math.max(1, parseInt(payload.numberOfPassengers, 10) || 1),
      days: q.days,
      pickup: pickup,
      dropoff: dropoff,
      handover: handover,
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
      pickupPin: driveMode === "self" && handover === "pickup"
        ? null
        : payload.pickupPin && payload.pickupPin.lat != null
          ? payload.pickupPin
          : null,
      dropoffPin: payload.dropoffPin && payload.dropoffPin.lat != null ? payload.dropoffPin : null,
      dateReserve: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    if (driveMode === "chauffeur") {
      var driverId = payload.driverDetailsId
        ? NS.security.sanitizeText(payload.driverDetailsId, 40)
        : "";
      var driver = driverId ? getDriver(driverId) : null;
      if (!driver) {
        var roster = activeDrivers().filter(function (d) { return d.apiId != null; });
        driver = roster[0] || null;
      }
      if (!driver || driver.status !== "active") {
        throw new Error("No chauffeur is available right now. Choose self-drive, or try again later.");
      }
      booking.driverDetailsId = driver.id;
    }
    if (booking.numberOfPassengers > (q.vehicle.seats || 5)) {
      throw new Error("Passengers exceed this vehicle's capacity (" + q.vehicle.seats + ").");
    }
    var all = bookings();
    booking.queueNo = nextQueueNo(all);
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
    return fifoOrder().filter(function (b) {
      return b.status === "pending";
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

  function localISODate(d) {
    return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
  }

  function apiErrorMessage(err) {
    var errors = err && err.data && err.data.errors;
    if (!errors) return (err && err.message) || "Could not save the booking to the server.";
    return Object.keys(errors)
      .map(function (k) {
        return errors[k].join(" ");
      })
      .join(" ");
  }

  /*
   * Login is still local, so customers are matched to a Laravel `users` row by email.
   * Resolves to that users.id and stores it as the local user's apiId.
   */
  function ensureCustomerOnApi(userId) {
    if (!NS.api) return Promise.reject(new Error("API client not loaded."));
    var user = NS.store.get("users", []).filter(function (u) {
      return u.id === userId;
    })[0];
    if (!user) return Promise.reject(new Error("Customer account not found."));
    if (user.role !== "customer") return Promise.reject(new Error("Bookings must belong to a customer account."));
    if (user.apiId != null) return Promise.resolve(user.apiId);
    /* Backend contract: POST /users/sync with first_name/last_name/phone/address/license_*. */
    var phone = NS.validation.canonicalPhone(user.phone || "");
    if (!phone) return Promise.reject(new Error("Add a mobile number before booking."));
    var body = {
      email: user.email,
      first_name: user.firstName || (user.email || "").split("@")[0] || "Guest",
      last_name: user.lastName || "-",
      phone: phone
    };
    if (user.address) body.address = user.address;
    if (user.licenseNo) body.license_no = user.licenseNo;
    if (user.licenseExpiry) body.license_expiry = user.licenseExpiry;
    if (user.birthdate) body.birthdate = user.birthdate;
    if (user.privacyAcceptedAt) body.privacy_accepted_at = user.privacyAcceptedAt;
    return NS.api.post("/users/sync", body).then(function (saved) {
      var list = NS.store.get("users", []);
      for (var i = 0; i < list.length; i++) if (list[i].id === userId) list[i].apiId = saved.user_id;
      NS.store.set("users", list);
      return saved.user_id;
    });
  }

  /*
   * Location + addon lookups. The app models locations as plain strings and addons by
   * string id ("driver"). The backend keys them by integer id, so we fetch
   * once and cache name/key -> id maps for the current page.
   */
  var _refCache = { locations: null, addons: null };

  function ensureRefMaps() {
    if (!NS.api) return Promise.reject(new Error("API client not loaded."));
    if (_refCache.locations && _refCache.addons) return Promise.resolve(_refCache);
    return Promise.all([NS.api.locations.all(), NS.api.addons.all()]).then(function (res) {
      var locMap = {};
      (res[0] || []).forEach(function (l) {
        locMap[String(l.name).trim().toLowerCase()] = l.location_id;
      });
      var addonMap = {};
      (res[1] || []).forEach(function (a) {
        /* match by code or name so local string ids line up with backend rows */
        if (a.code) addonMap[String(a.code).trim().toLowerCase()] = a.addon_id;
        if (a.name) addonMap[String(a.name).trim().toLowerCase()] = a.addon_id;
      });
      _refCache.locations = locMap;
      _refCache.addons = addonMap;
      return _refCache;
    });
  }

  function locationId(name) {
    if (!_refCache.locations) return null;
    return _refCache.locations[String(name || "").trim().toLowerCase()] || null;
  }

  function firstLocationId(names) {
    for (var i = 0; i < names.length; i++) {
      var id = locationId(names[i]);
      if (id) return id;
    }
    return null;
  }

  /* Local addon string ids mapped to likely backend names, as a fallback match. */
  var ADDON_NAME_BY_ID = {
    driver: "professional driver"
  };

  function addonId(localId) {
    if (!_refCache.addons) return null;
    var key = String(localId || "").trim().toLowerCase();
    return _refCache.addons[key] || _refCache.addons[ADDON_NAME_BY_ID[key] || ""] || null;
  }

  /* Builds the backend renter_document object from a local booking's driverInfo. */
  function renterDocumentBody(booking) {
    var info = booking.driverInfo || {};
    var body = {};
    if (info.idType) body.id_type = info.idType;
    if (info.idNumber) body.id_number = info.idNumber;
    if (info.idExpiry) body.id_expiry = info.idExpiry;
    if (info.idPhoto) body.id_photo = info.idPhoto;
    var codes = info.dl_codes || info.licenseClass || "";
    var licenseNo = info.license_no || info.licenseNo || "";
    var licenseExpiry = info.license_expiry || info.licenseExpiry || "";
    if (codes) body.dl_codes = codes;
    if (licenseNo) body.license_no = licenseNo;
    if (licenseExpiry) body.license_expiry = licenseExpiry;
    if (info.licensePhoto) body.license_photo = info.licensePhoto;
    if (info.birthdate) body.birthdate = info.birthdate;
    if (info.parentName) body.parent_name = info.parentName;
    if (info.parentPhone) body.parent_phone = NS.validation.normalizePhone(info.parentPhone || "") || info.parentPhone;
    if (info.parentIdPhoto) body.parent_id_photo = info.parentIdPhoto;
    if (info.parentConsentAt) body.parent_consent_at = info.parentConsentAt;
    if (info.privacyAcceptedAt) body.privacy_accepted_at = info.privacyAcceptedAt;
    if (!Object.keys(body).length) return null;
    return body;
  }

  /* Saves a local booking to Laravel; the local copy is discarded if the server rejects it. */
  function pushBookingToApi(bookingId) {
    var booking = getBooking(bookingId);
    if (!booking) return Promise.reject(new Error("Booking not found."));
    var vehicle = getVehicle(booking.vehicleId);
    var driver = booking.driverDetailsId ? getDriver(booking.driverDetailsId) : null;
    function discard(err) {
      saveBookings(
        bookings().filter(function (b) {
          return b.id !== bookingId;
        })
      );
      saveThreads(
        threads().filter(function (t) {
          return t.bookingId !== bookingId;
        })
      );
      throw new Error("Server did not save the booking: " + apiErrorMessage(err));
    }
    return Promise.all([ensureCustomerOnApi(booking.userId), ensureRefMaps()]).then(function (res) {
      var apiUserId = res[0];
      var addonIds = (booking.addons || [])
        .map(addonId)
        .filter(function (x) { return x != null; });
      var pickupLocId = firstLocationId([
        booking.pickup,
        OFFICE_PICKUP,
        "iDrive CDO Main Office"
      ]);
      var dropLocId = firstLocationId([booking.dropoff]) || pickupLocId;
      var notes = booking.notes || "";
      if (booking.driveMode !== "chauffeur") {
        var deliverLine =
          booking.handover === "deliver" && booking.dropoff
            ? "Deliver to: " + booking.dropoff
            : "Pick up at: " + OFFICE_PICKUP;
        if (notes.indexOf("Deliver to:") === -1 && notes.indexOf("Pick up at:") === -1) {
          notes = notes ? deliverLine + "\n" + notes : deliverLine;
        }
      } else if (booking.driveMode === "chauffeur") {
        var routeLine = "Pickup: " + (booking.pickup || "") + " · Drop-off: " + (booking.dropoff || "");
        if (notes.indexOf("Pickup:") === -1) notes = notes ? routeLine + "\n" + notes : routeLine;
      }
      if (notes.length > 1000) notes = notes.slice(0, 1000);
      var body = {
        vehicle_id: vehicle && vehicle.apiId,
        user_id: apiUserId,
        driver_id: driver && driver.apiId != null ? driver.apiId : null,
        drive_mode: booking.driveMode === "chauffeur" ? "chauffeur" : "self",
        start_date: booking.startDate,
        end_date: booking.endDate,
        pickup_time: booking.pickupTime,
        return_time: booking.returnTime,
        pickup_location_id: pickupLocId,
        dropoff_location_id: dropLocId,
        number_of_passengers: booking.numberOfPassengers,
        fuel_before_rent: booking.fuelBeforeRent || "Full",
        subtotal: booking.subtotal,
        payment_status: "unpaid",
        notes: notes || null,
        date_reserve: new Date().toISOString(),
        addon_ids: addonIds
      };
      var doc = renterDocumentBody(booking);
      if (doc) body.renter_document = doc;
      return NS.api.bookings.create(body);
    }).then(function (saved) {
      var all = bookings();
      for (var i = 0; i < all.length; i++) {
        if (all[i].id === bookingId) {
          all[i].apiId = saved.booking_id;
          all[i].updatedAt = new Date().toISOString();
        }
      }
      saveBookings(all);
      return saved;
    }, discard);
  }

  var GOVERNMENT_ID_TYPES = ["National ID", "Passport", "UMID", "Postal ID"];

  function assertPhoto(dataUrl, label, maxLen) {
    var photo = typeof dataUrl === "string" ? dataUrl.trim() : "";
    if (!photo) throw new Error("Upload " + label + ".");
    if (!/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(photo)) {
      throw new Error(label + " must be a JPG, PNG, or WebP image.");
    }
    if (photo.length > (maxLen || 750000)) {
      throw new Error(label + " is too large. Choose a clearer, smaller photo.");
    }
    return photo;
  }

  function assertIdentity(info) {
    var fullName = NS.security.sanitizeText(info.fullName, 80);
    var phone = NS.validation.normalizePhone(info.phone || "");
    var email = NS.security.sanitizeEmail(info.email || "");
    if (!fullName || fullName.length < 3) throw new Error("Enter your full name.");
    if (!NS.validation.phMobile(phone)) throw new Error("Enter a Philippine mobile number (09XXXXXXXXX).");
    if (!NS.validation.email(email)) throw new Error("Enter a valid email address.");
    var ocrNames = Array.isArray(info.ocrNames) ? info.ocrNames : [];
    var nameMismatch = ocrNames.some(function (ocrName) {
      return ocrName && !NS.validation.namesMatch(fullName, ocrName);
    });
    if (nameMismatch && !info.mismatchAck) {
      throw new Error("The ID does not match the name you typed. Correct the form, or confirm that you reviewed the mismatch.");
    }
    return {
      fullName: fullName,
      phone: phone,
      email: email,
      extracted: {
        names: ocrNames.filter(Boolean).slice(0, 4)
      }
    };
  }

  function assertGovernmentId(info, endDate) {
    var idType = NS.security.sanitizeText(info.idType, 40);
    var idNumber = NS.security.sanitizeText(info.idNumber, 30).toUpperCase().replace(/\s+/g, "");
    var idExpiry = NS.security.sanitizeText(info.idExpiry, 10);
    if (GOVERNMENT_ID_TYPES.indexOf(idType) === -1) throw new Error("Choose which ID you have.");
    if (!NS.validation.idNumberForType(idType, idNumber)) {
      throw new Error("Enter a " + idType + " number (" + NS.validation.idNumberHint(idType) + ").");
    }
    if (!NS.validation.futureDate(idExpiry) || (endDate && idExpiry < endDate)) {
      throw new Error("This government ID is expired or expires before the vehicle is returned.");
    }
    return {
      idType: idType,
      idNumber: idNumber,
      idExpiry: idExpiry,
      idIssue: NS.security.sanitizeText(info.idIssue || "", 10)
    };
  }

  function ageFromBirthdate(iso) {
    if (!iso) return null;
    var born = new Date(String(iso) + "T00:00:00");
    if (isNaN(born.getTime())) return null;
    var now = new Date();
    var age = now.getFullYear() - born.getFullYear();
    var md = now.getMonth() - born.getMonth();
    if (md < 0 || (md === 0 && now.getDate() < born.getDate())) age -= 1;
    return age;
  }

  function applyPrivacyAndParent(info, who) {
    if (!info.privacyConsent) {
      throw new Error("Accept the Data Privacy notice before we store your ID.");
    }
    who.privacyAcceptedAt = new Date().toISOString();
    var birthdate = NS.security.sanitizeText(info.birthdate || "", 10);
    if (!birthdate) throw new Error("Enter your birth date so we can check if parent consent is needed.");
    who.birthdate = birthdate;
    var age = ageFromBirthdate(birthdate);
    if (age != null && age <= 17) {
      var parentName = NS.security.sanitizeText(info.parentName || "", 80);
      var parentPhone = NS.validation.normalizePhone(info.parentPhone || "");
      if (!parentName) throw new Error("Enter the parent or guardian name.");
      if (!NS.validation.phMobile(parentPhone)) throw new Error("Enter the parent or guardian mobile number (09XXXXXXXXX).");
      if (!info.parentConsent) throw new Error("The parent or guardian must tick the consent box.");
      who.parentName = parentName;
      who.parentPhone = parentPhone;
      who.parentIdPhoto = assertPhoto(info.parentIdPhoto, "a valid ID of the parent or guardian", 750000);
      who.parentConsentAt = new Date().toISOString();
    }
    return who;
  }

  function hasValidIdInfo(info) {
    if (!info) return false;
    var photo = !!(info.idPhoto || info.licensePhoto);
    var number = !!(info.idNumber || info.license_no || info.licenseNo);
    return photo && number;
  }

  function bookedRanges(vehicleId, exceptId) {
    return bookings()
      .filter(function (b) {
        return b.vehicleId === vehicleId && ACTIVE_BOOKING[b.status] && b.id !== exceptId;
      })
      .map(function (b) {
        return { start: b.startDate, end: b.endDate, status: b.status, ref: b.ref };
      });
  }

  function assertBothPartiesHaveId(booking) {
    if (!booking || !booking.vehicleId) return;
    var current = bookings().filter(function (b) {
      return b.vehicleId === booking.vehicleId && b.status === "ongoing" && b.id !== booking.id;
    })[0];
    if (!current) return;
    if (!hasValidIdInfo(current.driverInfo)) {
      throw new Error(
        "This car is in use and the current renter has no valid ID on file. Staff must collect that ID before another booking is confirmed."
      );
    }
    if (!hasValidIdInfo(booking.driverInfo)) {
      throw new Error("This car is currently in use. Upload a valid ID for the new renter before the booking is confirmed.");
    }
  }

  function normalizeDriverInfo(driveMode, info, context) {
    context = context || {};
    info = info || {};
    if (!info.agreed) throw new Error("Agree to the rental terms to continue.");

    if (driveMode === "chauffeur") {
      var who = applyPrivacyAndParent(info, assertIdentity(info));
      var gov = assertGovernmentId(info, context.endDate);
      who.idType = gov.idType;
      who.idNumber = gov.idNumber;
      who.idExpiry = gov.idExpiry;
      who.idIssue = gov.idIssue;
      who.idPhoto = assertPhoto(info.idPhoto, "a photo of your government ID", 750000);
      who.itinerary = NS.security.sanitizeText(info.itinerary, 180);
      if (!who.itinerary) throw new Error("Enter the itinerary or destination.");
      who.agreed = true;
      return who;
    }

    var renter = applyPrivacyAndParent(info, assertIdentity(info));
    var address = NS.security.sanitizeText(info.address, 120);
    if (!address) throw new Error("Enter your address.");
    var codes = NS.security.sanitizeText(info.dl_codes || info.licenseClass || "", 40);
    var licenseNo = NS.validation.normalizeLicense(info.license_no || info.licenseNo || "");
    var licenseExpiry = NS.security.sanitizeText(info.license_expiry || info.licenseExpiry || "", 10);
    if (!codes) throw new Error("Enter the DL codes.");
    if (!licenseNo) throw new Error("Enter the license number.");
    if (!licenseExpiry) throw new Error("Enter the expiration date.");
    if (!NS.validation.idNumberForType("Driver's License", licenseNo)) {
      throw new Error("Enter a driver's license number (like N04-12-345678).");
    }
    if (!NS.validation.futureDate(licenseExpiry)) {
      throw new Error("The expiration date must be a valid date that has not already passed.");
    }
    if (context.endDate && licenseExpiry < context.endDate) {
      throw new Error("This license expires before the vehicle is returned.");
    }
    var fit = NS.validation.licenseFitsVehicle(codes, codes, context.vehicle);
    if (!fit.ok) throw new Error(fit.message);
    if (NS.validation.daylightBlocked(codes, context.pickupTime, context.returnTime)) {
      throw new Error("This license is limited to daylight driving. Choose pickup and return times between 05:00 and 18:00.");
    }

    var second = assertGovernmentId(info, context.endDate);
    renter.address = address;
    renter.dl_codes = codes;
    renter.license_no = licenseNo;
    renter.license_expiry = licenseExpiry;
    renter.licenseClass = codes;
    renter.licenseNo = licenseNo;
    renter.licenseExpiry = licenseExpiry;
    renter.licenseName = renter.fullName;
    renter.licenseAddress = address;
    renter.emergencyPhone = renter.phone;
    renter.licensePhoto = assertPhoto(info.licensePhoto, "a photo of your driver's license", 750000);
    renter.idType = second.idType;
    renter.idNumber = second.idNumber;
    renter.idExpiry = second.idExpiry;
    renter.idIssue = second.idIssue;
    renter.idPhoto = assertPhoto(info.idPhoto, "a photo of your second valid ID", 750000);
    renter.agreed = true;
    return renter;
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
      var receipt = assertPhoto(payload.receipt, "your Instapay payment receipt", 750000);
      payment = {
        method: "cashless",
        brand: "Instapay",
        last4: "QR",
        holder: ((me.firstName || "") + " " + (me.lastName || "")).trim(),
        receipt: receipt,
        authCode: "QR" + NS.security.randomHex(3).toUpperCase(),
        paidAt: new Date().toISOString()
      };
      audit("payment", me.id, booking.ref + " cashless Instapay QR");
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
      receipt: payment.receipt || "",
      createdAt: payment.paidAt
    };
    var pays = payments();
    pays.unshift(paymentRow);
    savePayments(pays);
    if (booking.apiId != null) {
      pushToApi("payments", "payments", paymentRow, {
        booking_id: booking.apiId,
        amount: booking.total,
        payment_method: method === "cashless" ? "cashless" : "cash",
        brand: method === "cashless" ? payment.brand : "Cash",
        account_last4: /^\d{4}$/.test(payment.last4 || "") ? payment.last4 : null,
        holder: payment.holder || null,
        reference_number: payment.authCode,
        payment_date: new Date().toISOString(),
        payment_status: "paid",
        receipt: method === "cashless" ? payment.receipt : null
      }, "payment_id");
      /* Mark the booking paid on the server too so staff can confirm it. */
      if (NS.api) {
        NS.api.bookings.update(booking.apiId, {
          payment_status: "paid",
          payment_method: method === "cashless" ? "cashless" : "cash"
        }).catch(function () {});
      }
    }

    var payer = NS.auth.userById(booking.userId) || me;
    var payNote =
      "Payment received for " +
      booking.ref +
      " via " +
      (method === "cashless" ? "Instapay QR" : "cash") +
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

  var CANCEL_REASONS = ["Change of plans", "Booked the wrong dates", "Found another car", "Other"];

  function serverUserId(localId) {
    var list = NS.store.get("users", []);
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === localId && list[i].apiId != null) return list[i].apiId;
    }
    return null;
  }

  function assertCustomerCanCancel(booking, me) {
    if (!me) throw new Error("Sign in to cancel this booking.");
    if (me.role !== "customer" || booking.userId !== me.id) {
      throw new Error("You can only cancel your own booking.");
    }
    if (booking.status === "cancelled") throw new Error("This booking is already cancelled.");
    if (booking.status === "confirmed") {
      throw new Error("This booking is already confirmed and can no longer be cancelled.");
    }
    if (booking.status !== "pending") throw new Error("This booking can no longer be cancelled.");
  }

  function cancelBooking(bookingId, reason, note, csrf) {
    return new Promise(function (resolve, reject) {
      try {
        if (csrf) NS.security.assertCsrf(csrf);
        else NS.security.issueCsrf();
      } catch (csrfErr) {
        NS.security.issueCsrf();
      }
      try {
        var booking = getBooking(bookingId);
        if (!booking) throw new Error("Booking not found.");
        var me = assertBookingAccess(booking);
        assertCustomerCanCancel(booking, me);
        reason = NS.security.sanitizeText(reason, 40);
        note = NS.security.sanitizeText(note || "", 240);
        if (CANCEL_REASONS.indexOf(reason) === -1) throw new Error("Choose a reason from the list.");
        if (reason === "Other" && !note) throw new Error("Type your reason when you choose Other.");
        if (booking.apiId == null || !NS.api) throw new Error("This booking is not on the server yet, so it cannot be cancelled.");
        var userId = serverUserId(me.id);
        if (userId == null) throw new Error("Sign in again so this cancellation can be saved.");
        NS.api.post("/bookings/" + encodeURIComponent(booking.apiId) + "/cancel", {
          user_id: userId,
          reason: reason,
          reason_note: reason === "Other" ? note : null
        }).then(function (saved) {
          booking.status = "cancelled";
          booking.cancelReason = (saved && saved.cancel_reason) || (reason === "Other" ? note : reason);
          booking.cancelledAt = (saved && saved.cancelled_at) || new Date().toISOString();
          booking.updatedAt = (saved && saved.updated_at) || booking.cancelledAt;
          var list = bookings();
          for (var i = 0; i < list.length; i++) if (list[i].id === booking.id) list[i] = booking;
          saveBookings(list);
          audit("booking-status", me.id, booking.ref + " cancelled · " + booking.cancelReason);
          resolve(booking);
        }, function (err) {
          reject(new Error(apiErrorMessage(err)));
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  function setBookingStatus(bookingId, status, csrf) {
    try {
      if (csrf) NS.security.assertCsrf(csrf);
      else NS.security.issueCsrf();
    } catch (csrfErr) {
      NS.security.issueCsrf();
    }
    var allowed = {
      pending: ["confirmed", "rejected"],
      confirmed: ["ongoing", "return_requested"],
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
    if (next === "cancelled") {
      assertCustomerCanCancel(booking, me);
      throw new Error("Tell us why you are cancelling.");
    }
    if ((allowed[booking.status] || []).indexOf(next) === -1) {
      throw new Error("That status change is not allowed.");
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
    if (next === "confirmed") {
      assertBothPartiesHaveId(booking);
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
    pushBookingStatusToApi(booking);
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
    return fifoOrder().filter(function (b) {
      return b.userId === me.id;
    });
  }

  function allBookings() {
    requireStaff();
    return fifoOrder();
  }

  function saveVehicle(payload, csrf) {
    NS.security.assertCsrf(csrf);
    requireStaff();
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
        if (list[i].apiId != null) item.apiId = list[i].apiId;
        list[i] = item;
        found = true;
      } else if (list[i].plate === item.plate) {
        throw new Error("That plate number is already in the fleet.");
      }
    }
    if (!found) list.push(item);
    saveVehicles(list);
    pushToApi("vehicles", "vehicles", item, {
      name: item.name,
      plate_number: item.plate,
      mileage: item.mileage,
      brand: item.brand,
      model: item.model,
      type: item.type,
      transmission: item.transmission,
      fuel: item.fuel,
      capacity: item.seats,
      luggage: item.luggage,
      daily_rate: item.dailyRate,
      year_model: item.year,
      year_purchased: item.yearPurchased,
      image: item.image || null,
      description: item.description || null,
      status: item.status,
      features: item.features || []
    }, "vehicle_id");
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
    var removed = getVehicle(id);
    if (removed) removeFromApi("vehicles", removed.apiId);
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
    var repair = fleetRepairStats();
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
      repairPercent: repair.percent,
      repairCount: repair.repair,
      revenue: revenue,
      byStatus: byStatus,
      byType: byType
    };
  }

  function fleetRepairStats() {
    var list = vehicles();
    var total = list.length;
    var repair = 0;
    var sample = null;
    for (var i = 0; i < list.length; i++) {
      if (list[i].status === "maintenance") {
        repair++;
        if (!sample) sample = list[i];
      }
    }
    if (!sample && list.length) {
      for (var j = 0; j < list.length; j++) {
        if (list[j].image) {
          sample = list[j];
          break;
        }
      }
      if (!sample) sample = list[0];
    }
    return {
      total: total,
      repair: repair,
      percent: total ? Math.round((repair / total) * 100) : 0,
      sample: sample
        ? {
            id: sample.id,
            name: sample.name,
            plate: sample.plate,
            image: sample.image || "",
            status: sample.status
          }
        : null
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
    requireStaff();
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
        if (list[i].apiId != null) item.apiId = list[i].apiId;
        list[i] = item;
        found = true;
      }
    }
    if (!found) {
      item.createdAt = new Date().toISOString();
      list.push(item);
    }
    saveDrivers(list);
    pushToApi("drivers", "drivers", item, {
      full_name: item.fullName,
      driver_license: item.driverLicense,
      type_driver_license: item.typeDriverLicense,
      license_expiry: item.licenseExpiry,
      phone: item.phone || null,
      status: item.status === "active" ? "active" : "inactive",
      duty_status: item.dutyStatus === "on_call" ? "on_call" : "regular"
    }, "driver_id");
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
    var removed = getDriver(id);
    if (removed) removeFromApi("driverDetails", removed.apiId);
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
    pushBookingStatusToApi(booking);
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
    if (booking.apiId != null && NS.api) {
      var fuelBody = booking.status === "confirmed"
        ? { fuel_before_rent: fuel }
        : { fuel_upon_return: fuel };
      NS.api.bookings.update(booking.apiId, fuelBody).catch(warnApiFailure);
    }
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
    requireStaff();
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
        if (list[i].apiId != null) item.apiId = list[i].apiId;
        list[i] = item;
        found = true;
      }
    }
    if (!found) list.push(item);
    saveVehicleRegs(list);
    if (vehicle.apiId != null) {
      /* Backend wants renewal_scheduled_day as a day-of-month integer (1-31). */
      var dayNum = parseInt(item.renewalScheduledDay, 10);
      if (!(dayNum >= 1 && dayNum <= 31)) {
        var m = /^\d{4}-\d{2}-(\d{2})$/.exec(item.renewalScheduledDay || "");
        dayNum = m ? parseInt(m[1], 10) : null;
      }
      pushToApi("vehicleRegistrations", "vehicleRegs", item, {
        vehicle_id: vehicle.apiId,
        plate_number: item.plateNumber,
        renewal_scheduled_day: dayNum || null,
        next_reg_renewal: item.nextRegRenewal
      }, "registration_id");
    }
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
    requireStaff();
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
        if (list[i].apiId != null) item.apiId = list[i].apiId;
        if (list[i].createdAt) item.createdAt = list[i].createdAt;
        list[i] = item;
        found = true;
      }
    }
    if (!found) {
      item.createdAt = new Date().toISOString();
      list.unshift(item);
    }
    saveMaintenances(list);
    if (vehicle.apiId != null) {
      pushToApi("maintenances", "maintenances", item, {
        vehicle_id: vehicle.apiId,
        maintenance_type: item.maintenanceType,
        scheduled_date: item.scheduledDate,
        performed_at: item.performedAt || null,
        finished: !!item.finished,
        notes: item.notes || null
      }, "maintenance_id");
    }
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
    requireStaff();
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
    if (vehicle.apiId != null) {
      pushToApi("fuelRecords", "fuelRecords", item, {
        vehicle_id: vehicle.apiId,
        fuel_type: item.fuelType,
        notes: item.notes || null,
        recorded_at: new Date().toISOString()
      }, "fuel_record_id");
    }
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

  var PAYMENT_STATUSES = ["paid", "pending", "failed", "refunded"];
  var PAYMENT_BRANDS = { cash: ["Cash"], cashless: ["Instapay", "GCash", "Maya", "GrabPay"], card: ["Visa", "Mastercard", "JCB", "AmEx"] };

  function writeBooking(booking) {
    var list = bookings();
    for (var i = 0; i < list.length; i++) if (list[i].id === booking.id) list[i] = booking;
    saveBookings(list);
  }

  /* Booking is "paid" while at least one of its payment records is paid. */
  function refreshBookingPaymentStatus(booking, allowDowngrade) {
    var paid = payments().some(function (p) {
      return p.bookingId === booking.id && p.paymentStatus === "paid";
    });
    var next = paid ? "paid" : "unpaid";
    if (booking.paymentStatus === next || (next === "unpaid" && !allowDowngrade)) return;
    booking.paymentStatus = next;
    booking.updatedAt = new Date().toISOString();
    writeBooking(booking);
    if (booking.apiId != null && NS.api) {
      NS.api.bookings.update(booking.apiId, { payment_status: next }).catch(warnApiFailure);
    }
  }

  /* Desk staff record a payment taken at the counter, by phone, or by card terminal. */
  function recordPayment(payload, csrf) {
    NS.security.assertCsrf(csrf);
    requireStaff();
    var me = NS.auth.current();
    var booking = getBooking(payload.bookingId);
    if (!booking) throw new Error("Choose a booking.");
    if (booking.status === "cancelled" || booking.status === "rejected") {
      throw new Error("Cancelled or rejected bookings cannot take payments.");
    }
    var method = PAYMENT_BRANDS[payload.method] ? payload.method : "";
    if (!method) throw new Error("Choose a payment method.");
    var brand = method === "cash" ? "Cash" : NS.security.sanitizeText(payload.brand, 20);
    if (PAYMENT_BRANDS[method].indexOf(brand) === -1) throw new Error("Choose the " + (method === "card" ? "card brand" : "wallet") + ".");
    var amount = Math.round(Number(payload.amount) * 100) / 100;
    if (!(amount > 0)) throw new Error("Enter an amount greater than zero.");
    if (amount > 99999999.99) throw new Error("Amount is too large.");
    var status = PAYMENT_STATUSES.indexOf(payload.status) !== -1 ? payload.status : "paid";
    var last4 = String(payload.last4 || "").replace(/\D/g, "");
    if (last4 && last4.length !== 4) throw new Error("Account or card digits must be exactly 4 numbers.");
    if (method !== "cash" && !last4) throw new Error("Enter the last 4 digits of the card or wallet number.");
    var reference = NS.security.sanitizeText(payload.referenceNumber, 40) ||
      "PAY-" + localISODate(new Date()).replace(/-/g, "") + "-" + NS.security.randomHex(4).toUpperCase();
    var duplicate = payments().some(function (p) {
      return String(p.referenceNumber).toUpperCase() === reference.toUpperCase();
    });
    if (duplicate) throw new Error("That reference number is already recorded.");
    var paidAt = payload.paymentDate ? new Date(payload.paymentDate + "T12:00:00").toISOString() : new Date().toISOString();

    var row = {
      id: "pay_" + NS.security.randomHex(6),
      bookingId: booking.id,
      bookingRef: booking.ref,
      amount: amount,
      paymentMethod: method,
      referenceNumber: reference,
      paymentDate: paidAt,
      paymentStatus: status,
      brand: brand,
      last4: last4,
      holder: NS.security.sanitizeText(payload.holder, 80),
      recordedBy: me.id,
      createdAt: new Date().toISOString()
    };
    var pays = payments();
    pays.unshift(row);
    savePayments(pays);

    if (status === "paid") {
      booking.payment = { method: method, brand: brand, last4: last4 || (method === "cash" ? "CASH" : ""), holder: row.holder, authCode: reference, paidAt: paidAt };
      booking.paymentMethod = method;
      writeBooking(booking);
    }
    refreshBookingPaymentStatus(booking);

    if (booking.apiId != null) {
      pushToApi("payments", "payments", row, {
        booking_id: booking.apiId,
        amount: amount,
        payment_method: method,
        brand: brand,
        account_last4: last4 || null,
        holder: row.holder || null,
        reference_number: reference,
        payment_date: paidAt,
        payment_status: status
      }, "payment_id");
      if (status === "paid" && NS.api) {
        NS.api.bookings.update(booking.apiId, { payment_method: method }).catch(function () {});
      }
    }
    audit("payment-record", me.id, booking.ref + " " + method + " " + brand + " ₱" + amount + " · " + status);
    return row;
  }

  function setPaymentStatus(paymentId, status, csrf) {
    NS.security.assertCsrf(csrf);
    requireStaff();
    if (PAYMENT_STATUSES.indexOf(status) === -1) throw new Error("Choose a valid payment status.");
    var pays = payments();
    var row = null;
    for (var i = 0; i < pays.length; i++) {
      if (pays[i].id === paymentId) {
        pays[i].paymentStatus = status;
        row = pays[i];
      }
    }
    if (!row) throw new Error("Payment not found.");
    savePayments(pays);
    if (row.apiId != null && NS.api) {
      NS.api.payments.update(row.apiId, { payment_status: status }).catch(warnApiFailure);
    }
    var booking = getBooking(row.bookingId);
    if (booking) refreshBookingPaymentStatus(booking, true);
    audit("payment-status", NS.auth.current().id, (row.bookingRef || row.bookingId) + " " + row.referenceNumber + " → " + status);
    return row;
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

  function telemetryForVehicle(vehicleId) {
    requireStaff();
    return vehicleTelemetry()[vehicleId] || null;
  }

  function predictionForVehicle(vehicleId) {
    requireStaff();
    return maintenancePredictions()[vehicleId] || null;
  }

  function saveMaintenancePrediction(vehicleId, telemetry, prediction, csrf) {
    NS.security.assertCsrf(csrf);
    requireStaff();
    var vehicle = getVehicle(vehicleId);
    if (!vehicle) throw new Error("Vehicle not found.");

    var cleanTelemetry = {};
    Object.keys(telemetry || {}).forEach(function (key) {
      var value = telemetry[key];
      cleanTelemetry[NS.security.sanitizeText(key, 50)] =
        typeof value === "number" ? value : NS.security.sanitizeText(value, 80);
    });

    var savedAt = new Date().toISOString();
    var telemetryMap = vehicleTelemetry();
    telemetryMap[vehicleId] = {
      vehicleId: vehicleId,
      attributes: cleanTelemetry,
      updatedAt: savedAt
    };
    NS.store.set("vehicleTelemetry", telemetryMap);

    var probability = Number(prediction && prediction.probability);
    var result = {
      vehicleId: vehicleId,
      target: "failure_imminent",
      prediction: prediction && Number(prediction.prediction) === 1 ? 1 : 0,
      needsMaintenance: !!(prediction && prediction.needs_maintenance),
      probability: Number.isFinite(probability) ? probability : null,
      predictedAt: savedAt,
      predictedBy: NS.auth.current().id
    };
    var predictionMap = maintenancePredictions();
    predictionMap[vehicleId] = result;
    NS.store.set("maintenancePredictions", predictionMap);
    audit(
      "ml-prediction",
      NS.auth.current().id,
      vehicle.plate + " · " + (result.probability === null ? "n/a" : Math.round(result.probability * 100) + "%")
    );
    return result;
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
    return [];
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
  }

  /* One-time wipe so the FIFO queue starts empty. Later bookings keep their queue numbers. */
  function clearStoredBookingsOnce() {
    var key = "bookingReset";
    if (NS.store.get(key) === "fifo-20261013") return;
    saveBookings([]);
    savePayments([]);
    saveRatings([]);
    saveThreads(threads().filter(function (t) {
      return !t.bookingId;
    }));
    NS.store.set(key, "fifo-20261013");
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
      NS.store.set("vehicleTelemetry", {});
      NS.store.set("maintenancePredictions", {});
      NS.store.set("seeded", true);
      saveVehicleRegs(seedVehicleRegs());
      saveFuelRecords(seedFuelRecords());
      audit("seed", "system", "Initial fleet and demo accounts loaded.");
    } else {
      patchVehicleImages();
    }
    migrateLegacyInbox();
    ensureErdSeed();
    clearStoredBookingsOnce();
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

  /* Laravel `vehicles` has no rate/image/specs columns; those stay local, matched by plate then type. */
  function catalogVehicle(row, seeded) {
    var plate = String(row.plate_number || "").toUpperCase();
    var byType = null;
    for (var i = 0; i < seeded.length; i++) {
      if (plate && String(seeded[i].plate || "").toUpperCase() === plate) return seeded[i];
      if (!byType && seeded[i].type === row.type) byType = seeded[i];
    }
    return byType;
  }

  function fromApiVehicle(row, local, seeded) {
    var catalog = catalogVehicle(row, seeded);
    var base = local || {
      id: "veh_api_" + row.vehicle_id,
      transmission: (catalog && catalog.transmission) || "—",
      fuel: (catalog && catalog.fuel) || "—",
      luggage: catalog && catalog.luggage != null ? catalog.luggage : 0,
      dailyRate: catalog ? catalog.dailyRate : null,
      image: (catalog || seeded[0]).image,
      description: (catalog && catalog.description) || "",
      features: (catalog && catalog.features) || [],
      status: "available"
    };
    var apiFeatures = Array.isArray(row.features)
      ? row.features.map(function (f) {
          return typeof f === "string" ? f : f && f.feature;
        }).filter(Boolean)
      : null;
    return Object.assign({}, base, {
      apiId: row.vehicle_id,
      name: row.name || (local && local.name) || row.brand + " " + row.model + " " + row.year_model,
      brand: row.brand,
      model: row.model,
      year: Number(row.year_model),
      yearPurchased: Number(row.year_purchased),
      type: row.type,
      transmission: row.transmission || base.transmission,
      fuel: row.fuel || base.fuel,
      seats: Number(row.capacity),
      luggage: row.luggage != null ? Number(row.luggage) : base.luggage,
      mileage: Number(row.mileage),
      plate: row.plate_number,
      image: row.image || base.image,
      description: row.description || base.description,
      features: (apiFeatures && apiFeatures.length) ? apiFeatures : base.features,
      status: row.status || base.status,
      dailyRate: row.daily_rate != null
        ? Number(row.daily_rate)
        : (base.dailyRate || (catalog && catalog.dailyRate) || null)
    });
  }

  function syncVehiclesFromApi() {
    if (!NS.api) return Promise.reject(new Error("API client not loaded."));
    return NS.api.vehicles.all().then(applyVehicleRows);
  }

  function applyVehicleRows(rows) {
    var byPlate = {};
    vehicles().forEach(function (v) {
      if (v.plate) byPlate[String(v.plate).toUpperCase()] = v;
    });
    var seeded = seedVehicles();
    var list = rows.map(function (row) {
      return fromApiVehicle(row, byPlate[String(row.plate_number).toUpperCase()], seeded);
    });
    saveVehicles(list);
    return list;
  }

  function apiDay(s) {
    return s ? String(s).slice(0, 10) : "";
  }

  function apiTime(s) {
    return s ? String(s).slice(0, 5) : "";
  }

  /* Backend uses lowercase snake statuses that already match the app (e.g. "return_requested"). */
  function toApiStatus(status) {
    return String(status || "pending").trim().toLowerCase().replace(/\s+/g, "_");
  }

  function fromApiStatus(status) {
    return String(status || "pending").trim().toLowerCase().replace(/\s+/g, "_");
  }

  function apiIdIndex(list) {
    var map = {};
    list.forEach(function (x) {
      if (x.apiId != null) map[x.apiId] = x.id;
    });
    return map;
  }

  /*
   * Server rows replace their local copy (matched by apiId) but keep local-only fields such as
   * booking refs, card details, or a disabled flag. Local records without an apiId survive only if keepLocal says so.
   */
  function mergeFromApi(local, rows, idKey, idPrefix, map, keepLocal) {
    var known = {};
    local.forEach(function (x) {
      if (x.apiId != null) known[x.apiId] = x;
    });
    var merged = rows.map(function (row) {
      var prev = known[row[idKey]];
      return Object.assign({}, prev, map(row, prev), {
        id: prev ? prev.id : idPrefix + row[idKey],
        apiId: row[idKey]
      });
    });
    return merged.concat(
      local.filter(function (x) {
        return x.apiId == null && keepLocal(x);
      })
    );
  }

  function apiUser(row, prev) {
    return {
      email: row.email || (prev && prev.email) || "",
      role: row.role || (prev && prev.role) || "customer",
      firstName: row.first_name || (prev && prev.firstName) || "",
      lastName: row.last_name || (prev && prev.lastName) || "",
      phone: row.phone || (prev && prev.phone) || "",
      address: row.address || (prev && prev.address) || "",
      department: row.department || (prev && prev.department) || "",
      licenseNo: row.license_no || (prev && prev.licenseNo) || "",
      licenseExpiry: apiDay(row.license_expiry) || (prev && prev.licenseExpiry) || "",
      avatar: (prev && prev.avatar) || "",
      status: row.status || (prev && prev.status) || "active",
      birthdate: apiDay(row.birthdate) || (prev && prev.birthdate) || "",
      privacyAcceptedAt: row.privacy_accepted_at || (prev && prev.privacyAcceptedAt) || "",
      isBadRenter: !!(row.is_bad_renter || (prev && prev.isBadRenter)),
      badRenterReason: row.bad_renter_reason || (prev && prev.badRenterReason) || "",
      badRenterLabeledBy: row.bad_renter_labeled_by || (prev && prev.badRenterLabeledBy) || "",
      badRenterLabeledAt: row.bad_renter_labeled_at || (prev && prev.badRenterLabeledAt) || "",
      createdAt: row.created_at
    };
  }

  /*
   * Links local records that have no apiId to the server row they describe (rowKey(row) === localKey(x)),
   * then drops older copies of that row, so the local record keeps its id and password.
   * Returns the surviving list and a map of dropped id -> surviving id.
   */
  function adoptServerRows(local, rows, idKey, rowKey, localKey) {
    var byKey = {};
    rows.forEach(function (r) {
      var k = rowKey(r);
      if (k) byKey[k] = r[idKey];
    });
    var owner = {};
    local.forEach(function (x) {
      var k = x.apiId == null ? localKey(x) : null;
      if (k && byKey[k] != null && !owner[byKey[k]]) {
        x.apiId = byKey[k];
        owner[x.apiId] = x.id;
      }
    });
    var renamed = {};
    var list = local.filter(function (x) {
      var keep = !owner[x.apiId] || owner[x.apiId] === x.id;
      if (!keep) renamed[x.id] = owner[x.apiId];
      return keep;
    });
    return { list: list, renamed: renamed };
  }

  function remapBookingRefs(field, renamed) {
    if (!Object.keys(renamed).length) return;
    var list = bookings();
    list.forEach(function (b) {
      if (renamed[b[field]]) b[field] = renamed[b[field]];
    });
    saveBookings(list);
  }

  /* Single /users endpoint carries role; we keep local-only accounts (no apiId) as-is. */
  function syncUsersFromApi(users) {
    var adopted = adoptServerRows(NS.store.get("users", []), users, "user_id", function (r) {
      return String(r.email || "").toLowerCase();
    }, function (u) {
      return u.passwordHash ? String(u.email || "").toLowerCase() : "";
    });
    NS.store.set(
      "users",
      mergeFromApi(adopted.list, users, "user_id", "usr_api_", function (r, prev) {
        return apiUser(r, prev);
      }, function () {
        return true;
      })
    );
    remapBookingRefs("userId", adopted.renamed);
  }

  function syncDriversFromApi(rows) {
    var userIds = apiIdIndex(NS.store.get("users", []));
    var adopted = adoptServerRows(drivers(), rows, "driver_id", function (r) {
      return r.user_id != null ? userIds[r.user_id] : "";
    }, function (d) {
      return d.userId || "";
    });
    saveDrivers(
      mergeFromApi(adopted.list, rows, "driver_id", "drv_api_", function (r, prev) {
        return {
          fullName: r.full_name,
          driverLicense: r.driver_license,
          typeDriverLicense: r.type_driver_license || "Professional",
          licenseExpiry: apiDay(r.license_expiry),
          status: String(r.status).toLowerCase() === "active" ? "active" : "inactive",
          dutyStatus: r.duty_status === "on_call" ? "on_call" : "regular",
          phone: r.phone || (prev && prev.phone) || "",
          userId: (prev && prev.userId) || (r.user_id != null && userIds[r.user_id]) || null,
          createdAt: r.created_at
        };
      }, function (d) {
        return !!d.userId;
      })
    );
    remapBookingRefs("driverDetailsId", adopted.renamed);
  }

  function syncBookingsFromApi(rows) {
    var vehicleIds = apiIdIndex(vehicles());
    var driverIds = apiIdIndex(drivers());
    var userIds = apiIdIndex(NS.store.get("users", []));
    function locName(rel) {
      return rel && rel.name ? rel.name : "";
    }
    var adopted = adoptServerRows(bookings(), rows, "booking_id", function (r) {
      return r.ref || "";
    }, function (b) {
      return b.ref || "";
    });
    if (Object.keys(adopted.renamed).length) {
      var pays = payments();
      pays.forEach(function (p) {
        if (adopted.renamed[p.bookingId]) p.bookingId = adopted.renamed[p.bookingId];
      });
      savePayments(pays);
    }
    var mergedBookings = mergeFromApi(adopted.list, rows, "booking_id", "bkg_api_", function (r, prev) {
        var start = apiDay(r.start_date);
        var end = apiDay(r.end_date) || start;
        var days = Number(r.days) || Math.max(1, Math.round((new Date(end) - new Date(start)) / 86400000) || 1);
        var chauffeur = String(r.drive_mode || "").toLowerCase() === "chauffeur";
        var mapped = {
          vehicleId: vehicleIds[r.vehicle_id] || "veh_api_" + r.vehicle_id,
          startDate: start,
          endDate: end,
          days: days,
          pickupTime: apiTime(r.pickup_time),
          returnTime: apiTime(r.return_time),
          numberOfPassengers: Number(r.number_of_passengers) || 1,
          driveMode: chauffeur ? "chauffeur" : "self",
          driverOption: chauffeur ? "Chauffeur" : "Self-drive",
          driverDetailsId: r.driver_id ? driverIds[r.driver_id] || null : null,
          fuelBeforeRent: r.fuel_before_rent || "",
          fuelUponReturn: r.fuel_upon_return || "",
          paymentMethod: r.payment_method || "",
          status: fromApiStatus(r.status),
          dateReserve: r.date_reserve,
          paymentStatus: String(r.payment_status).toLowerCase() === "paid" ? "paid" : "unpaid",
          cancelReason: r.cancel_reason || (prev && prev.cancelReason) || "",
          cancelledAt: r.cancelled_at || (prev && prev.cancelledAt) || "",
          subtotal: Number(r.subtotal) || 0,
          extras: Number(r.extras) || 0,
          total: Number(r.total) || (Number(r.subtotal) || 0) + (Number(r.extras) || 0)
        };
        if (prev && !/^bkg_api_/.test(prev.id)) return mapped;
        if (prev) return mapped;
        return Object.assign(
          {
            ref: r.ref || "IDR-" + r.booking_id,
            userId: userIds[r.user_id] || "usr_api_" + r.user_id,
            pickup: locName(r.pickup_location || r.pickupLocation),
            dropoff: locName(r.dropoff_location || r.dropoffLocation),
            addons: [],
            payment: null,
            notes: r.notes || "",
            returnNotes: r.return_notes || "",
            createdAt: r.created_at,
            updatedAt: r.updated_at
          },
          mapped
        );
      }, function (b) {
        return !!getVehicle(b.vehicleId);
      });
    ensureQueueNumbers(mergedBookings);
    saveBookings(mergedBookings);
  }

  function syncPaymentsFromApi(rows) {
    var bookingIds = apiIdIndex(bookings());
    var adopted = adoptServerRows(payments(), rows, "payment_id", function (p) {
      return String(p.reference_number || "").toUpperCase();
    }, function (p) {
      return String(p.referenceNumber || "").toUpperCase();
    });
    savePayments(
      mergeFromApi(adopted.list, rows, "payment_id", "pay_api_", function (p, prev) {
        var booking = getBooking(bookingIds[p.booking_id]);
        return {
          brand: p.brand || (prev && prev.brand) || "",
          last4: p.account_last4 || (prev && prev.last4) || "",
          holder: p.holder || (prev && prev.holder) || "",
          bookingId: booking ? booking.id : null,
          bookingRef: booking ? booking.ref : "BKG-" + p.booking_id,
          amount: Number(p.amount) || 0,
          paymentMethod: p.payment_method || "",
          referenceNumber: p.reference_number || "",
          paymentDate: apiDay(p.payment_date),
          paymentStatus: String(p.payment_status || "").toLowerCase(),
          receipt: p.receipt || (prev && prev.receipt) || "",
          createdAt: p.created_at
        };
      }, function (p) {
        return !!getBooking(p.bookingId);
      })
    );
  }

  function syncVehicleRecordsFromApi(fuelRows, maintenanceRows, regRows) {
    var vehicleIds = apiIdIndex(vehicles());
    function vehicleId(apiId) {
      return vehicleIds[apiId] || "veh_api_" + apiId;
    }
    function vehicleExists(x) {
      var seeded = x.id === "fuel_" + x.vehicleId || x.id === "reg_" + x.vehicleId || x.id === "mnt_001";
      return !seeded && !!getVehicle(x.vehicleId);
    }
    saveFuelRecords(
      mergeFromApi(fuelRecords(), fuelRows, "fuel_record_id", "fuel_api_", function (f) {
        return {
          vehicleId: vehicleId(f.vehicle_id),
          fuelType: f.fuel_type,
          recordedAt: apiDay(f.recorded_at) || apiDay(f.created_at),
          notes: f.notes || ""
        };
      }, vehicleExists)
    );
    saveMaintenances(
      mergeFromApi(maintenances(), maintenanceRows, "maintenance_id", "mnt_api_", function (m, prev) {
        return {
          vehicleId: vehicleId(m.vehicle_id),
          maintenanceType: m.maintenance_type,
          scheduledDate: apiDay(m.scheduled_date),
          performedAt: apiDay(m.performed_at),
          finished: m.finished === true || String(m.finished).toLowerCase() === "true",
          notes: m.notes || (prev && prev.notes) || "",
          createdAt: m.created_at
        };
      }, vehicleExists)
    );
    saveVehicleRegs(
      mergeFromApi(vehicleRegs(), regRows, "registration_id", "reg_api_", function (r) {
        return {
          vehicleId: vehicleId(r.vehicle_id),
          plateNumber: r.plate_number,
          renewalScheduledDay: r.renewal_scheduled_day != null ? String(r.renewal_scheduled_day) : "",
          nextRegRenewal: apiDay(r.next_reg_renewal),
          updatedAt: r.updated_at
        };
      }, vehicleExists)
    );
  }

  /* Loads every Laravel table into local storage so staff pages show database records. */
  var SYNCED_KEYS = ["vehicles", "users", "drivers", "bookings", "payments", "fuelRecords", "maintenances", "vehicleRegs"];

  function syncedWriteCounts() {
    return SYNCED_KEYS.map(function (k) {
      return NS.store.writeCount(k);
    }).join(",");
  }

  function fetchAllFromApiLegacy() {
    return Promise.all([
      NS.api.vehicles.all(),
      NS.api.users.all(),
      NS.api.drivers.all(),
      NS.api.bookings.all(),
      NS.api.payments.all(),
      NS.api.fuelRecords.all(),
      NS.api.maintenances.all(),
      NS.api.vehicleRegistrations.all()
    ]).then(function (res) {
      return {
        vehicles: res[0],
        users: res[1],
        drivers: res[2],
        bookings: res[3],
        payments: res[4],
        fuel_records: res[5],
        maintenances: res[6],
        vehicle_registrations: res[7]
      };
    });
  }

  /*
   * Resolves true when server data was applied, false when it was skipped because the user saved
   * something locally while the request was in flight (that change is newer than the snapshot).
   */
  function syncAllFromApi() {
    if (!NS.api) return Promise.reject(new Error("API client not loaded."));
    var before = syncedWriteCounts();
    return NS.api
      .sync()
      .catch(function (err) {
        if (err && err.status === 404) return fetchAllFromApiLegacy();
        throw err;
      })
      .then(function (data) {
        if (syncedWriteCounts() !== before) return false;
        applyVehicleRows(data.vehicles || []);
        syncUsersFromApi(data.users || []);
        syncDriversFromApi(data.drivers || []);
        syncBookingsFromApi(data.bookings || []);
        syncPaymentsFromApi(data.payments || []);
        syncVehicleRecordsFromApi(data.fuel_records || [], data.maintenances || [], data.vehicle_registrations || []);
        return true;
      });
  }

  function warnApiFailure(err) {
    console.warn("iDrive: change was not saved to the server.", err);
    if (NS.ui && NS.ui.toast) NS.ui.toast("Saved here, but the server rejected it: " + apiErrorMessage(err), "err");
  }

  /*
   * Mirrors a local save to Laravel: updates when the record already has an apiId, otherwise creates it
   * and stores the new id back on the local record so later edits update the same row.
   */
  function pushToApi(resource, storeKey, local, body, apiIdKey) {
    if (!NS.api || !local) return Promise.resolve(null);
    var request = local.apiId != null ? NS.api[resource].update(local.apiId, body) : NS.api[resource].create(body);
    return request.then(function (saved) {
      if (local.apiId == null && saved && saved[apiIdKey] != null) {
        var list = NS.store.get(storeKey, []);
        for (var i = 0; i < list.length; i++) if (list[i].id === local.id) list[i].apiId = saved[apiIdKey];
        NS.store.set(storeKey, list);
      }
      return saved;
    }, function (err) {
      warnApiFailure(err);
      return null;
    });
  }

  function removeFromApi(resource, apiId) {
    if (!NS.api || apiId == null) return;
    NS.api[resource].remove(apiId).catch(warnApiFailure);
  }

  function todayISO() {
    return localISODate(new Date());
  }

  function flagBadRenter(userId, reason, labeledBy) {
    reason = NS.security.sanitizeText(reason || "", 400);
    if (reason.length < 8) throw new Error("Write why this renter is being labeled (at least 8 characters).");
    var list = NS.store.get("users", []);
    var target = null;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === userId) target = list[i];
    }
    if (!target || target.role !== "customer") throw new Error("Only a renter account can be labeled.");
    target.isBadRenter = true;
    target.badRenterReason = reason;
    target.badRenterLabeledBy = labeledBy && labeledBy.id;
    target.badRenterLabeledAt = new Date().toISOString();
    NS.store.set("users", list);
    if (NS.api && target.apiId != null && labeledBy && labeledBy.apiId != null) {
      return NS.api.post("/users/" + encodeURIComponent(target.apiId) + "/flag", {
        reason: reason,
        labeled_by: labeledBy.apiId
      }).then(function () {
        return target;
      });
    }
    return Promise.resolve(target);
  }

  function pushUserProfileToApi(user) {
    if (!NS.api || !user || user.apiId == null) return;
    var body = {
      first_name: user.firstName || "",
      last_name: user.lastName || ""
    };
    var canonPhone = NS.validation.canonicalPhone(user.phone || "");
    if (canonPhone) body.phone = canonPhone;
    if (user.address) body.address = user.address;
    if (user.department) body.department = user.department;
    if (user.licenseNo) body.license_no = user.licenseNo;
    if (user.licenseExpiry) body.license_expiry = user.licenseExpiry;
    if (user.birthdate) body.birthdate = user.birthdate;
    if (user.privacyAcceptedAt) body.privacy_accepted_at = user.privacyAcceptedAt;
    NS.api.users.update(user.apiId, body).catch(warnApiFailure);
  }

  function pushBookingStatusToApi(booking) {
    if (!booking || booking.apiId == null || !NS.api) return;
    NS.api.bookings.update(booking.apiId, { status: toApiStatus(booking.status) }).catch(function (err) {
      console.warn("iDrive: booking status was not saved to the server.", err);
      if (NS.ui && NS.ui.toast) NS.ui.toast("Server did not save the status change: " + apiErrorMessage(err), "err");
    });
  }

  /* Display-only fields (name, photo, gear, fuel, features, status) that Laravel does not store. */
  function saveVehicleExtras(plate, extras) {
    var key = String(plate).toUpperCase();
    var list = vehicles();
    for (var i = 0; i < list.length; i++) {
      if (String(list[i].plate).toUpperCase() === key) {
        list[i] = Object.assign({}, list[i], extras);
        saveVehicles(list);
        return list[i];
      }
    }
    return null;
  }

  var RENTAL_TERMS = {
    self: {
      title: "Self-drive rental terms",
      intro: "These terms apply when you drive an iDrive CDO vehicle yourself. Read them before you tick the box on the application.",
      sections: [
        {
          heading: "Who can rent",
          items: [
            "You must be at least 21 years old and hold a valid driver’s license that covers the booked vehicle.",
            "You must present that license at pickup. The desk can refuse the keys if the license is expired, restricted, or does not match the renter."
          ]
        },
        {
          heading: "Pickup and return",
          items: [
            "You may pick up the car at Montalvan Burgos, Cagayan de Oro, or ask us to deliver it to an address you enter.",
            "Self-drive pickup is only at Montalvan Burgos. If we deliver, return the car at that delivery address unless the desk confirms a change.",
            "A security deposit is collected when you receive the vehicle and released after it is returned in the same condition."
          ]
        },
        {
          heading: "Fuel, damage, and fines",
          items: [
            "Bring the vehicle back with the same fuel level. A refuel charge applies if it is returned lower.",
            "You are liable for damage, loss, and traffic violations during the rental, including tolls and parking fines.",
            "Report accidents or breakdowns to iDrive CDO as soon as you can. Do not authorize repairs without the desk."
          ]
        },
        {
          heading: "Use of the vehicle",
          items: [
            "Only licensed drivers named on the booking may drive.",
            "Do not use the vehicle for racing, towing, off-road driving, or any illegal activity.",
            "Smoking in the vehicle and carrying prohibited goods are not allowed."
          ]
        }
      ]
    },
    chauffeur: {
      title: "Chauffeur rental terms",
      intro: "These terms apply when an iDrive CDO driver takes the trip. Read them before you tick the box on the application.",
      sections: [
        {
          heading: "Who can book",
          items: [
            "You must be at least 18 years old and present a valid government ID that matches the booking.",
            "You do not need a driver’s license. The assigned chauffeur drives the vehicle."
          ]
        },
        {
          heading: "Itinerary and route",
          items: [
            "Pickup and drop-off are the addresses and pins you enter on the application.",
            "The trip stays on the agreed itinerary and route unless the desk approves a change.",
            "Extra stops, a longer route, or a later return may add overtime or extra charges."
          ]
        },
        {
          heading: "Time, meals, and lodging",
          items: [
            "Overtime is charged when the trip runs past the booked return time.",
            "You cover the driver’s meals and lodging when the trip needs them (long hours, overnight, or out-of-town).",
            "Waiting time beyond a short courtesy wait may be billed as overtime."
          ]
        },
        {
          heading: "Conduct",
          items: [
            "Treat the chauffeur and the vehicle with care. Harassment or unsafe requests are grounds to end the trip.",
            "The chauffeur may refuse unsafe roads, illegal requests, or a number of passengers above the vehicle limit.",
            "Personal belongings left in the vehicle are your responsibility."
          ]
        }
      ]
    },
    account: {
      title: "iDrive CDO rental terms",
      intro: "By creating an account you agree to these terms when you book a self-drive or chauffeur rental from iDrive CDO, Capistrano Montalvan Streets, Cagayan de Oro.",
      sections: [
        {
          heading: "Bookings and payment",
          items: [
            "A booking is a request until the desk confirms it and payment is completed as required.",
            "Rates shown are per day unless noted. Chauffeur trips include the professional driver fee.",
            "Cancellations and date changes follow desk confirmation. Paid amounts may be held or refunded according to that confirmation."
          ]
        },
        {
          heading: "Self-drive",
          items: [
            "Renters must be 21 or older with a valid license. Pickup is only at Montalvan Burgos, or we can deliver to an address you enter. A security deposit is collected when you receive the car.",
            "Return the vehicle in the same condition and with the same fuel level, or charges apply. You are liable for damage, loss, and traffic violations."
          ]
        },
        {
          heading: "With chauffeur",
          items: [
            "Passengers must be 18 or older with a valid government ID.",
            "Overtime, extra stops, and the driver’s meals or lodging when needed are the customer’s responsibility. The trip stays on the agreed route unless the desk approves a change."
          ]
        },
        {
          heading: "Your information",
          items: [
            "We use the details and ID photos you submit to verify the booking and to contact you about the trip.",
            "Questions: 0926 986 4450 · Capistrano Montalvan Streets, Cagayan de Oro, Philippines, 9000."
          ]
        }
      ]
    }
  };

  function rentalTerms(kind) {
    return RENTAL_TERMS[kind] || RENTAL_TERMS.account;
  }

  function isSelfDeliver(booking) {
    if (!booking || booking.driveMode === "chauffeur") return false;
    if (booking.handover === "deliver") return true;
    if (booking.handover === "pickup") return false;
    return !!(booking.dropoff && booking.dropoff !== OFFICE_PICKUP);
  }

  NS.domain = {
    OFFICE_PICKUP: OFFICE_PICKUP,
    LOCATIONS: LOCATIONS,
    rentalTerms: rentalTerms,
    isSelfDeliver: isSelfDeliver,
    ADDONS: ADDONS,
    vehicles: vehicles,
    syncVehiclesFromApi: syncVehiclesFromApi,
    syncAllFromApi: syncAllFromApi,
    pushUserProfileToApi: pushUserProfileToApi,
    ensureCustomerOnApi: ensureCustomerOnApi,
    saveVehicleExtras: saveVehicleExtras,
    bookings: bookings,
    fifoOrder: fifoOrder,
    bookingQueueText: bookingQueueText,
    firstBookingToCheck: firstBookingToCheck,
    audit: audit,
    auditLog: auditLog,
    getVehicle: getVehicle,
    getBooking: getBooking,
    isAvailable: isAvailable,
    bookedRanges: bookedRanges,
    ageFromBirthdate: ageFromBirthdate,
    flagBadRenter: flagBadRenter,
    availableVehicles: availableVehicles,
    AVAILABILITY_LABELS: AVAILABILITY_LABELS,
    vehicleAvailability: vehicleAvailability,
    reservedUntil: reservedUntil,
    quote: quote,
    createBooking: createBooking,
    pushBookingToApi: pushBookingToApi,
    apiErrorMessage: apiErrorMessage,
    payBooking: payBooking,
    setBookingStatus: setBookingStatus,
    cancelBooking: cancelBooking,
    requestVehicleReturn: requestVehicleReturn,
    acceptVehicleReturn: acceptVehicleReturn,
    pendingReturns: pendingReturns,
    rateBooking: rateBooking,
    getRatingForBooking: getRatingForBooking,
    ratingsForVehicle: ratingsForVehicle,
    vehicleRatingSummary: vehicleRatingSummary,
    ongoingBookingForUser: ongoingBookingForUser,
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
    telemetryForVehicle: telemetryForVehicle,
    predictionForVehicle: predictionForVehicle,
    saveMaintenancePrediction: saveMaintenancePrediction,
    fuelRecords: fuelRecords,
    saveFuelRecord: saveFuelRecord,
    fuelForVehicle: fuelForVehicle,
    payments: payments,
    cashlessReceipt: cashlessReceipt,
    allPayments: allPayments,
    PAYMENT_STATUSES: PAYMENT_STATUSES,
    PAYMENT_BRANDS: PAYMENT_BRANDS,
    recordPayment: recordPayment,
    setPaymentStatus: setPaymentStatus,
    report: report,
    fleetRepairStats: fleetRepairStats,
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
