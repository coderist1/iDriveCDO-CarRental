(function (global) {
  "use strict";

  var NS = (global.iDrive = global.iDrive || {});

  function email(value) {
    return /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(String(value || ""));
  }

  function phMobile(value) {
    var digits = String(value || "").replace(/\D+/g, "");
    if (digits.length === 12 && digits.indexOf("63") === 0) digits = "0" + digits.slice(2);
    if (digits.length === 10 && digits.charAt(0) === "9") digits = "0" + digits;
    return /^09\d{9}$/.test(digits);
  }

  function normalizePhone(value) {
    var digits = String(value || "").replace(/\D+/g, "");
    if (digits.length === 12 && digits.indexOf("63") === 0) digits = "0" + digits.slice(2);
    if (digits.length === 10 && digits.charAt(0) === "9") digits = "0" + digits;
    return digits;
  }

  function license(value) {
    var cleaned = String(value || "")
      .toUpperCase()
      .replace(/\s+/g, "");
    return /^[A-Z0-9][A-Z0-9-]{5,19}$/.test(cleaned);
  }

  function normalizeLicense(value) {
    return String(value || "")
      .toUpperCase()
      .replace(/\s+/g, "");
  }

  function futureDate(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ""))) return false;
    var d = new Date(iso + "T00:00:00");
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    return d instanceof Date && !isNaN(d.getTime()) && d >= today;
  }

  function dateRange(start, end) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return false;
    var a = new Date(start + "T00:00:00");
    var b = new Date(end + "T00:00:00");
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    if (a < today) return false;
    var days = Math.round((b - a) / 86400000);
    return days >= 1 && days <= 30;
  }

  function daysBetween(start, end) {
    var a = new Date(start + "T00:00:00");
    var b = new Date(end + "T00:00:00");
    return Math.round((b - a) / 86400000);
  }

  function plate(value) {
    return /^[A-Z0-9]{2,4}-?\d{3,4}$/i.test(String(value || "").trim());
  }

  function required(value) {
    return String(value || "").trim().length > 0;
  }

  function validId(value) {
    var cleaned = String(value || "").replace(/\s+/g, "").toUpperCase();
    return /^[A-Z0-9-]{5,30}$/.test(cleaned);
  }

  function compactId(value) {
    return String(value || "").toUpperCase().replace(/[\s-]+/g, "");
  }

  /* Formats used on Philippine IDs the desk accepts. */
  function idNumberForType(type, value) {
    var raw = String(value || "").toUpperCase().replace(/\s+/g, "");
    var digits = compactId(value);
    switch (type) {
      case "Driver's License":
        return /^[A-Z]\d{2}-?\d{2}-?\d{6}$/.test(raw);
      case "National ID":
        return /^\d{16}$/.test(digits);
      case "Passport":
        return /^[A-Z]{1,2}\d{6,8}[A-Z]?$/.test(digits);
      case "UMID":
        return /^\d{12}$/.test(digits);
      case "Postal ID":
        return /^[A-Z0-9-]{6,16}$/.test(raw);
      default:
        return false;
    }
  }

  function idNumberHint(type) {
    switch (type) {
      case "Driver's License":
        return "like N04-12-345678";
      case "National ID":
        return "16 digits";
      case "Passport":
        return "like P1234567A";
      case "UMID":
        return "12 digits";
      case "Postal ID":
        return "the number printed on the card";
      default:
        return "the number printed on the ID";
    }
  }

  function ageOn(iso, onDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ""))) return -1;
    var dob = new Date(iso + "T00:00:00");
    if (isNaN(dob.getTime())) return -1;
    var now = onDate || new Date();
    var years = now.getFullYear() - dob.getFullYear();
    var month = now.getMonth() - dob.getMonth();
    if (month < 0 || (month === 0 && now.getDate() < dob.getDate())) years--;
    return years;
  }

  function nameTokens(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[^a-z\s]/g, " ")
      .split(/\s+/)
      .filter(function (token) { return token.length > 1; });
  }

  /* Token overlap so "Reyes, Paolo" still matches "Paolo Reyes". */
  function namesMatch(a, b) {
    var left = nameTokens(a);
    var right = nameTokens(b);
    if (!left.length || !right.length) return true;
    var seen = {};
    right.forEach(function (token) { seen[token] = true; });
    var hits = 0;
    left.forEach(function (token) { if (seen[token]) hits++; });
    return hits >= Math.min(2, Math.min(left.length, right.length));
  }

  function datesMatch(a, b) {
    if (!a || !b) return true;
    return String(a) === String(b);
  }

  function licenseFitsVehicle(licenseClass, restrictions, vehicle) {
    var cls = String(licenseClass || "").toUpperCase();
    if (!cls.trim()) {
      return { ok: false, message: "Enter the license class printed on your license." };
    }
    var type = String((vehicle && vehicle.type) || "").toLowerCase();
    var transmission = String((vehicle && vehicle.transmission) || "").toLowerCase();
    var isMoto = /motor|bike|scooter/.test(type);
    var codes = cls.match(/\b(A1|B1|B2|BE|CE|A|B|C|D)\b/g) || [];
    var professional = /PROFESSIONAL/.test(cls);
    if (isMoto) {
      var moto = codes.some(function (code) { return code === "A" || code === "A1"; });
      if (!moto) {
        return { ok: false, message: "This vehicle needs a motorcycle license (class A or A1)." };
      }
    } else {
      var onlyMoto = codes.length > 0 && codes.every(function (code) { return code === "A" || code === "A1"; });
      var car = codes.some(function (code) { return code !== "A" && code !== "A1"; }) || professional;
      if (onlyMoto || !car) {
        return {
          ok: false,
          message: "This vehicle needs a car license (class B, B1, B2, or professional). " + cls + " does not cover it."
        };
      }
    }
    var limits = String(restrictions || "").toUpperCase();
    if (/\b8\b|AUTOMATIC ONLY|AUTO ONLY/.test(limits) && transmission.indexOf("manual") !== -1) {
      return { ok: false, message: "Your license is limited to automatic transmission, and this vehicle is manual." };
    }
    return { ok: true, message: "" };
  }

  function daylightBlocked(restrictions, pickupTime, returnTime) {
    var limits = String(restrictions || "").toUpperCase();
    if (!/\b4\b|DAYLIGHT/.test(limits)) return false;
    function outside(value) {
      return !!value && (value < "05:00" || value > "18:00");
    }
    return outside(pickupTime) || outside(returnTime);
  }

  NS.validation = {
    email: email,
    phMobile: phMobile,
    normalizePhone: normalizePhone,
    license: license,
    normalizeLicense: normalizeLicense,
    futureDate: futureDate,
    dateRange: dateRange,
    daysBetween: daysBetween,
    plate: plate,
    required: required,
    validId: validId,
    idNumberForType: idNumberForType,
    idNumberHint: idNumberHint,
    ageOn: ageOn,
    namesMatch: namesMatch,
    datesMatch: datesMatch,
    licenseFitsVehicle: licenseFitsVehicle,
    daylightBlocked: daylightBlocked
  };
})(window);
