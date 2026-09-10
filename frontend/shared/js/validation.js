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
    validId: validId
  };
})(window);
