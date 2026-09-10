/**
 * iDrive CDO — frontend security primitives.
 * Client-side only: hashing, sanitization, CSRF, sessions, lockout, integrity.
 */
(function (global) {
  "use strict";

  var NS = (global.iDrive = global.iDrive || {});

  var HTML_MAP = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
    "/": "&#x2F;"
  };

  function escapeHtml(value) {
    if (value == null) return "";
    return String(value).replace(/[&<>"'/]/g, function (ch) {
      return HTML_MAP[ch];
    });
  }

  function stripTags(value) {
    return String(value == null ? "" : value).replace(/<[^>]*>/g, "");
  }

  function sanitizeText(value, maxLen) {
    var cleaned = stripTags(value).replace(/[\u0000-\u001F\u007F]/g, "").trim();
    if (maxLen && cleaned.length > maxLen) cleaned = cleaned.slice(0, maxLen);
    return cleaned;
  }

  function sanitizeEmail(value) {
    return sanitizeText(value, 120).toLowerCase();
  }

  /* Compact SHA-256 (works on file:// without Web Crypto secure-context). */
  function sha256(ascii) {
    function rightRotate(n, x) {
      return (x >>> n) | (x << (32 - n));
    }
    var mathPow = Math.pow;
    var maxWord = mathPow(2, 32);
    var lengthProperty = "length";
    var i, j;
    var result = "";
    var words = [];
    var asciiBitLength = ascii[lengthProperty] * 8;
    var hash = (sha256.h = sha256.h || []);
    var k = (sha256.k = sha256.k || []);
    var primeCounter = k[lengthProperty];
    var isComposite = {};
    for (var candidate = 2; primeCounter < 64; candidate++) {
      if (!isComposite[candidate]) {
        for (i = 0; i < 313; i += candidate) isComposite[i] = candidate;
        hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
        k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
      }
    }
    ascii += "\x80";
    while ((ascii[lengthProperty] % 64) - 56) ascii += "\x00";
    for (i = 0; i < ascii[lengthProperty]; i++) {
      j = ascii.charCodeAt(i);
      if (j >> 8) return "";
      words[i >> 2] |= j << (((3 - i) % 4) * 8);
    }
    words[words[lengthProperty]] = (asciiBitLength / maxWord) | 0;
    words[words[lengthProperty]] = asciiBitLength;
    for (j = 0; j < words[lengthProperty]; ) {
      var w = words.slice(j, (j += 16));
      var oldHash = hash;
      hash = hash.slice(0, 8);
      for (i = 0; i < 64; i++) {
        var w15 = w[i - 15],
          w2 = w[i - 2];
        var a = hash[0],
          e = hash[4];
        var temp1 =
          hash[7] +
          (rightRotate(6, e) ^ rightRotate(11, e) ^ rightRotate(25, e)) +
          ((e & hash[5]) ^ (~e & hash[6])) +
          k[i] +
          (w[i] =
            i < 16
              ? w[i]
              : (w[i - 16] +
                  (rightRotate(7, w15) ^ rightRotate(18, w15) ^ (w15 >>> 3)) +
                  w[i - 7] +
                  (rightRotate(17, w2) ^ rightRotate(19, w2) ^ (w2 >>> 10))) |
                0);
        var temp2 =
          (rightRotate(2, a) ^ rightRotate(13, a) ^ rightRotate(22, a)) +
          ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
        hash = [(temp1 + temp2) | 0].concat(hash);
        hash[4] = (hash[4] + temp1) | 0;
      }
      for (i = 0; i < 8; i++) hash[i] = (hash[i] + oldHash[i]) | 0;
    }
    for (i = 0; i < 8; i++) {
      for (j = 3; j + 1; j--) {
        var b = (hash[i] >> (j * 8)) & 255;
        result += (b < 16 ? "0" : "") + b.toString(16);
      }
    }
    return result;
  }

  function randomHex(bytes) {
    var arr = new Uint8Array(bytes || 16);
    if (global.crypto && crypto.getRandomValues) {
      crypto.getRandomValues(arr);
    } else {
      for (var i = 0; i < arr.length; i++) arr[i] = (Math.random() * 256) & 255;
    }
    var out = "";
    for (var j = 0; j < arr.length; j++) out += ("0" + arr[j].toString(16)).slice(-2);
    return out;
  }

  function timingSafeEqual(a, b) {
    var x = String(a || "");
    var y = String(b || "");
    var max = Math.max(x.length, y.length);
    var diff = x.length ^ y.length;
    for (var i = 0; i < max; i++) {
      diff |= (x.charCodeAt(i) || 0) ^ (y.charCodeAt(i) || 0);
    }
    return diff === 0;
  }

  function hashPassword(password, salt) {
    var material = unescape(encodeURIComponent(salt + "::" + password + "::idrive-cdo"));
    return sha256(material);
  }

  function passwordIssues(password, email) {
    var issues = [];
    if (!password || password.length < 8) issues.push("At least 8 characters.");
    if (!/[a-z]/.test(password)) issues.push("One lowercase letter.");
    if (!/[A-Z]/.test(password)) issues.push("One uppercase letter.");
    if (!/[0-9]/.test(password)) issues.push("One number.");
    if (!/[^A-Za-z0-9]/.test(password)) issues.push("One special character.");
    if (email && password.toLowerCase().indexOf(String(email).split("@")[0].toLowerCase()) !== -1) {
      issues.push("Must not contain your email name.");
    }
    return issues;
  }

  function integritySeal(payload, secret) {
    return sha256(JSON.stringify(payload) + "::" + secret);
  }

  var CSRF_KEY = "idrive_csrf";
  var csrfMem = null;

  function issueCsrf() {
    var token = randomHex(24);
    csrfMem = token;
    try {
      sessionStorage.setItem(CSRF_KEY, token);
    } catch (e) {
      /* memory token still used */
    }
    return token;
  }

  function getCsrf() {
    if (csrfMem) return csrfMem;
    try {
      csrfMem = sessionStorage.getItem(CSRF_KEY);
    } catch (e) {
      csrfMem = null;
    }
    return csrfMem || issueCsrf();
  }

  function assertCsrf(token) {
    var expected = csrfMem;
    if (!expected) {
      try {
        expected = sessionStorage.getItem(CSRF_KEY);
      } catch (e) {
        expected = null;
      }
    }
    if (!expected || !timingSafeEqual(expected, token)) {
      throw new Error("Security check failed. Reload the page and try again.");
    }
    issueCsrf();
  }

  var LOCK_WINDOW_MS = 15 * 60 * 1000;
  var LOCK_LIMIT = 5;

  function lockKey(email) {
    return "idrive_lock_" + sha256(String(email || "").toLowerCase());
  }

  function getLockState(email) {
    try {
      return JSON.parse(localStorage.getItem(lockKey(email)) || "null") || { fails: 0, until: 0 };
    } catch (e) {
      return { fails: 0, until: 0 };
    }
  }

  function setLockState(email, state) {
    localStorage.setItem(lockKey(email), JSON.stringify(state));
  }

  function assertNotLocked(email) {
    var state = getLockState(email);
    if (state.until && Date.now() < state.until) {
      var mins = Math.ceil((state.until - Date.now()) / 60000);
      throw new Error("Account temporarily locked. Try again in " + mins + " minute(s).");
    }
  }

  function recordLoginFailure(email) {
    var state = getLockState(email);
    if (state.until && Date.now() > state.until) state = { fails: 0, until: 0 };
    state.fails += 1;
    if (state.fails >= LOCK_LIMIT) {
      state.until = Date.now() + LOCK_WINDOW_MS;
      state.fails = 0;
    }
    setLockState(email, state);
    return state;
  }

  function clearLoginFailures(email) {
    localStorage.removeItem(lockKey(email));
  }

  function luhnValid(num) {
    var digits = String(num || "").replace(/\s+/g, "");
    if (!/^\d{13,19}$/.test(digits)) return false;
    var sum = 0;
    var alt = false;
    for (var i = digits.length - 1; i >= 0; i--) {
      var n = parseInt(digits.charAt(i), 10);
      if (alt) {
        n *= 2;
        if (n > 9) n -= 9;
      }
      sum += n;
      alt = !alt;
    }
    return sum % 10 === 0;
  }

  function maskCard(num) {
    var digits = String(num || "").replace(/\s+/g, "");
    return "•••• " + digits.slice(-4);
  }

  NS.security = {
    escapeHtml: escapeHtml,
    stripTags: stripTags,
    sanitizeText: sanitizeText,
    sanitizeEmail: sanitizeEmail,
    sha256: sha256,
    randomHex: randomHex,
    timingSafeEqual: timingSafeEqual,
    hashPassword: hashPassword,
    passwordIssues: passwordIssues,
    integritySeal: integritySeal,
    issueCsrf: issueCsrf,
    getCsrf: getCsrf,
    assertCsrf: assertCsrf,
    assertNotLocked: assertNotLocked,
    recordLoginFailure: recordLoginFailure,
    clearLoginFailures: clearLoginFailures,
    luhnValid: luhnValid,
    maskCard: maskCard,
    LOCK_LIMIT: LOCK_LIMIT
  };
})(window);
