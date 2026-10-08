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

  function vehicleTelemetry() {
    return NS.store.get("vehicleTelemetry", {});
  }

  function maintenancePredictions() {
    return NS.store.get("maintenancePredictions", {});
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
    if (!q.vehicle.apiId) throw new Error("This vehicle is not in the booking system yet. Choose another car.");
    var notes = NS.security.sanitizeText(payload.notes, 240);

    var timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
    var pickupTime = String(payload.pickupTime || "");
    var returnTime = String(payload.returnTime || "");
    if (!timePattern.test(pickupTime) || !timePattern.test(returnTime)) {
      throw new Error("Choose a pickup and return time.");
    }

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
      pickupTime: pickupTime,
      returnTime: returnTime,
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
    var body = {
      email: user.email,
      first_name: user.firstName || (user.email || "").split("@")[0] || "Guest",
      last_name: user.lastName || "-",
      phone: NS.validation.normalizePhone(user.phone || "") || "09000000000"
    };
    if (user.address) body.address = user.address;
    if (user.licenseNo) body.license_no = user.licenseNo;
    if (user.licenseExpiry) body.license_expiry = user.licenseExpiry;
    return NS.api.post("/users/sync", body).then(function (saved) {
      var list = NS.store.get("users", []);
      for (var i = 0; i < list.length; i++) if (list[i].id === userId) list[i].apiId = saved.user_id;
      NS.store.set("users", list);
      return saved.user_id;
    });
  }

  /*
   * Location + addon lookups. The app models locations as plain strings and addons by
   * string id ("driver", "gps", ...). The backend keys them by integer id, so we fetch
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

  /* Local addon string ids mapped to likely backend names, as a fallback match. */
  var ADDON_NAME_BY_ID = {
    driver: "professional driver",
    gps: "gps navigation",
    child: "child seat",
    insurance: "full coverage insurance"
  };

  function addonId(localId) {
    if (!_refCache.addons) return null;
    var key = String(localId || "").trim().toLowerCase();
    return _refCache.addons[key] || _refCache.addons[ADDON_NAME_BY_ID[key] || ""] || null;
  }

  /* Builds the backend renter_document object from a local booking's driverInfo. */
  function renterDocumentBody(booking) {
    var info = booking.driverInfo || {};
    if (booking.driveMode === "chauffeur") {
      if (!info.idType || !info.idNumber) return null;
      return { id_type: info.idType, id_number: info.idNumber };
    }
    /* self-drive: all license fields are required together by the backend */
    var hasAll = info.licenseName && info.licenseNo && info.licenseExpiry &&
      info.licenseAddress && info.emergencyPhone && info.licensePhoto;
    if (!hasAll) return null;
    return {
      license_name: info.licenseName,
      license_no: info.licenseNo,
      license_expiry: info.licenseExpiry,
      license_address: info.licenseAddress,
      emergency_phone: NS.validation.normalizePhone(info.emergencyPhone),
      license_photo: info.licensePhoto
    };
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
      var body = {
        vehicle_id: vehicle && vehicle.apiId,
        user_id: apiUserId,
        driver_id: driver && driver.apiId != null ? driver.apiId : null,
        drive_mode: booking.driveMode === "chauffeur" ? "chauffeur" : "self",
        start_date: booking.startDate,
        end_date: booking.endDate,
        pickup_time: booking.pickupTime,
        return_time: booking.returnTime,
        pickup_location_id: locationId(booking.pickup),
        dropoff_location_id: locationId(booking.dropoff),
        number_of_passengers: booking.numberOfPassengers,
        fuel_before_rent: booking.fuelBeforeRent || "Full",
        subtotal: booking.subtotal,
        payment_status: "unpaid",
        notes: booking.notes || null,
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
        payment_status: "paid"
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

  /* Laravel `vehicles` has no rate/image/specs columns; those stay local, matched by plate number. */
  function fromApiVehicle(row, local, seeded) {
    var fallback = null;
    for (var i = 0; i < seeded.length; i++) {
      if (seeded[i].type === row.type) {
        fallback = seeded[i];
        break;
      }
    }
    var base = local || {
      id: "veh_api_" + row.vehicle_id,
      transmission: "—",
      fuel: "—",
      luggage: 0,
      dailyRate: null,
      image: (fallback || seeded[0]).image,
      description: "",
      features: [],
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
      dailyRate: row.daily_rate != null ? Number(row.daily_rate) : base.dailyRate
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
      createdAt: row.created_at
    };
  }

  /* Single /users endpoint carries role; we keep local-only accounts (no apiId) as-is. */
  function syncUsersFromApi(users) {
    NS.store.set(
      "users",
      mergeFromApi(NS.store.get("users", []), users, "user_id", "usr_api_", function (r, prev) {
        return apiUser(r, prev);
      }, function () {
        return true;
      })
    );
  }

  function syncDriversFromApi(rows) {
    saveDrivers(
      mergeFromApi(drivers(), rows, "driver_id", "drv_api_", function (r, prev) {
        return {
          fullName: r.full_name,
          driverLicense: r.driver_license,
          typeDriverLicense: r.type_driver_license || "Professional",
          licenseExpiry: apiDay(r.license_expiry),
          status: String(r.status).toLowerCase() === "active" ? "active" : "inactive",
          dutyStatus: r.duty_status === "on_call" ? "on_call" : "regular",
          phone: r.phone || (prev && prev.phone) || "",
          userId: (prev && prev.userId) || null,
          createdAt: r.created_at
        };
      }, function (d) {
        return !!d.userId;
      })
    );
  }

  function syncBookingsFromApi(rows) {
    var vehicleIds = apiIdIndex(vehicles());
    var driverIds = apiIdIndex(drivers());
    var userIds = apiIdIndex(NS.store.get("users", []));
    function locName(rel) {
      return rel && rel.name ? rel.name : "";
    }
    saveBookings(
      mergeFromApi(bookings(), rows, "booking_id", "bkg_api_", function (r, prev) {
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
      })
    );
  }

  function syncPaymentsFromApi(rows) {
    var bookingIds = apiIdIndex(bookings());
    savePayments(
      mergeFromApi(payments(), rows, "payment_id", "pay_api_", function (p) {
        var booking = getBooking(bookingIds[p.booking_id]);
        return {
          bookingId: booking ? booking.id : null,
          bookingRef: booking ? booking.ref : "BKG-" + p.booking_id,
          amount: Number(p.amount) || 0,
          paymentMethod: p.payment_method || "",
          referenceNumber: p.reference_number || "",
          paymentDate: apiDay(p.payment_date),
          paymentStatus: String(p.payment_status || "").toLowerCase(),
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

  function pushUserProfileToApi(user) {
    if (!NS.api || !user || user.apiId == null) return;
    var body = {
      first_name: user.firstName || "",
      last_name: user.lastName || ""
    };
    if (user.phone) body.phone = NS.validation.normalizePhone(user.phone);
    if (user.address) body.address = user.address;
    if (user.department) body.department = user.department;
    if (user.licenseNo) body.license_no = user.licenseNo;
    if (user.licenseExpiry) body.license_expiry = user.licenseExpiry;
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

  NS.domain = {
    LOCATIONS: LOCATIONS,
    ADDONS: ADDONS,
    vehicles: vehicles,
    syncVehiclesFromApi: syncVehiclesFromApi,
    syncAllFromApi: syncAllFromApi,
    pushUserProfileToApi: pushUserProfileToApi,
    ensureCustomerOnApi: ensureCustomerOnApi,
    saveVehicleExtras: saveVehicleExtras,
    bookings: bookings,
    audit: audit,
    auditLog: auditLog,
    getVehicle: getVehicle,
    getBooking: getBooking,
    isAvailable: isAvailable,
    availableVehicles: availableVehicles,
    quote: quote,
    createBooking: createBooking,
    pushBookingToApi: pushBookingToApi,
    apiErrorMessage: apiErrorMessage,
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
    telemetryForVehicle: telemetryForVehicle,
    predictionForVehicle: predictionForVehicle,
    saveMaintenancePrediction: saveMaintenancePrediction,
    fuelRecords: fuelRecords,
    saveFuelRecord: saveFuelRecord,
    fuelForVehicle: fuelForVehicle,
    payments: payments,
    allPayments: allPayments,
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
