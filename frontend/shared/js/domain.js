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

  var ACTIVE_BOOKING = { pending: 1, confirmed: 1, ongoing: 1 };

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
      days: q.days,
      pickup: pickup,
      dropoff: dropoff,
      driveMode: driveMode,
      driverInfo: driverInfo,
      addons: q.addons.map(function (a) {
        return a.id;
      }),
      subtotal: q.subtotal,
      extras: q.extras,
      total: q.total,
      status: "pending",
      paymentStatus: "unpaid",
      payment: null,
      notes: notes,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    if (me.role === "staff" || me.role === "admin") {
      var customer = NS.auth.userById(booking.userId);
      if (!customer || customer.role !== "customer") throw new Error("Select a customer for this booking.");
    }
    var all = bookings();
    all.push(booking);
    saveBookings(all);
    audit("booking-create", me.id, booking.ref + " · " + driveMode);
    return booking;
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

    return {
      licenseName: licenseName,
      licenseNo: licenseNo,
      licenseExpiry: licenseExpiry,
      licenseAddress: licenseAddress,
      emergencyPhone: emergencyPhone
    };
  }

  function assertBookingAccess(booking) {
    var me = NS.auth.current();
    if (!me) throw new Error("Sign in required.");
    if (me.role === "admin" || me.role === "staff") return me;
    if (booking.userId !== me.id) throw new Error("You cannot access this booking.");
    return me;
  }

  function payBooking(bookingId, card, csrf) {
    NS.security.assertCsrf(csrf);
    var booking = getBooking(bookingId);
    if (!booking) throw new Error("Booking not found.");
    var me = assertBookingAccess(booking);
    if (booking.paymentStatus === "paid") throw new Error("This booking is already paid.");
    if (booking.status === "cancelled" || booking.status === "rejected") {
      throw new Error("This booking cannot be paid.");
    }
    var name = NS.security.sanitizeText(card.name, 60);
    var number = String(card.number || "").replace(/\s+/g, "");
    var exp = NS.security.sanitizeText(card.exp, 5);
    var cvv = String(card.cvv || "");
    if (!name) throw new Error("Cardholder name is required.");
    if (!NS.security.luhnValid(number)) throw new Error("Enter a valid card number.");
    if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(exp)) throw new Error("Expiry must be MM/YY.");
    var parts = exp.split("/");
    var expDate = new Date(2000 + parseInt(parts[1], 10), parseInt(parts[0], 10), 0);
    if (expDate < new Date()) throw new Error("This card is expired.");
    if (!/^\d{3,4}$/.test(cvv)) throw new Error("Invalid security code.");

    booking.payment = {
      brand: number.charAt(0) === "4" ? "Visa" : number.charAt(0) === "5" ? "Mastercard" : "Card",
      last4: number.slice(-4),
      holder: name,
      authCode: "AUTH" + NS.security.randomHex(3).toUpperCase(),
      paidAt: new Date().toISOString()
    };
    booking.paymentStatus = "paid";
    booking.updatedAt = new Date().toISOString();
    var list = bookings();
    for (var i = 0; i < list.length; i++) if (list[i].id === booking.id) list[i] = booking;
    saveBookings(list);
    audit("payment", me.id, booking.ref + " " + NS.security.maskCard(number));
    return booking;
  }

  function setBookingStatus(bookingId, status, csrf) {
    NS.security.assertCsrf(csrf);
    var allowed = {
      pending: ["confirmed", "rejected", "cancelled"],
      confirmed: ["ongoing", "cancelled"],
      ongoing: ["completed"],
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
      if (booking.status === "ongoing" || booking.status === "completed") {
        throw new Error("Active or finished trips cannot be cancelled online.");
      }
    }
    if ((next === "confirmed" || next === "rejected" || next === "ongoing" || next === "completed") && !NS.auth.hasRole("staff")) {
      throw new Error("Staff must process this status.");
    }
    if (next === "confirmed" && booking.paymentStatus !== "paid") {
      throw new Error("Confirm only after payment.");
    }
    booking.status = next;
    booking.updatedAt = new Date().toISOString();
    var list = bookings();
    for (var i = 0; i < list.length; i++) if (list[i].id === booking.id) list[i] = booking;
    saveBookings(list);
    audit("booking-status", me.id, booking.ref + " → " + next);
    return booking;
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
      revenue: revenue,
      byStatus: byStatus,
      byType: byType
    };
  }

  function seedUsers() {
    function make(role, email, password, first, last, phone) {
      var salt = NS.security.randomHex(16);
      return {
        id: "usr_" + role,
        email: email,
        passwordHash: NS.security.hashPassword(password, salt),
        salt: salt,
        role: role,
        firstName: first,
        lastName: last,
        phone: phone,
        licenseNo: role === "customer" ? "N04-12-345678" : "A01-11-100001",
        licenseExpiry: "2028-12-31",
        avatar: "",
        status: "active",
        createdAt: "2026-01-15T08:00:00.000Z"
      };
    }
    var seeded = [
      make("admin", "admin@idrivecdo.ph", "Drive@Admin1", "Mara", "Villanueva", "09171234567"),
      make("staff", "staff@idrivecdo.ph", "Drive@Staff1", "Ken", "Sable", "09181234567"),
      make("customer", "guest@idrivecdo.ph", "Drive@Guest1", "Paolo", "Reyes", "09191234567")
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

  function seedIfNeeded() {
    if (!NS.store.get("seeded", false)) {
      NS.store.set("users", seedUsers());
      NS.store.set("vehicles", seedVehicles());
      NS.store.set("bookings", seedBookings());
      NS.store.set("audit", []);
      NS.store.set("seeded", true);
      audit("seed", "system", "Initial fleet and demo accounts loaded.");
    } else {
      patchVehicleImages();
    }
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
    quote: quote,
    createBooking: createBooking,
    payBooking: payBooking,
    setBookingStatus: setBookingStatus,
    myBookings: myBookings,
    allBookings: allBookings,
    saveVehicle: saveVehicle,
    removeVehicle: removeVehicle,
    report: report,
    seedIfNeeded: seedIfNeeded
  };
})(window);
