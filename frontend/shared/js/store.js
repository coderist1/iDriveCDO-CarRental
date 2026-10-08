/**
 * Client store with checksums + memory fallback (file:// / blocked storage).
 */
(function (global) {
  "use strict";

  var NS = (global.iDrive = global.iDrive || {});
  var SECRET = "idrive-cdo-integrity-v1";
  var PREFIX = "idrive_";
  var memory = {};
  var sessionMem = null;
  /* Raw strings already checked this page load; reading them again only needs JSON.parse. */
  var verified = {};
  var writes = {};

  function canUse(storage) {
    try {
      var k = PREFIX + "__probe__";
      storage.setItem(k, "1");
      storage.removeItem(k);
      return true;
    } catch (e) {
      return false;
    }
  }

  var hasLocal = canUse(global.localStorage);
  var hasSession = canUse(global.sessionStorage);

  function wrap(value) {
    var sealed = { v: value, t: Date.now() };
    sealed.sig = NS.security.integritySeal(sealed.v, SECRET);
    return sealed;
  }

  function unwrap(raw, fallback) {
    if (!raw) return fallback;
    try {
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || !("v" in parsed)) return fallback;
      var expected = NS.security.integritySeal(parsed.v, SECRET);
      if (!NS.security.timingSafeEqual(expected, parsed.sig)) {
        console.warn("iDrive: stored data failed integrity check and was rejected.");
        return fallback;
      }
      return parsed.v;
    } catch (e) {
      return fallback;
    }
  }

  function key(name) {
    return PREFIX + name;
  }

  function readRaw(name) {
    if (hasLocal) {
      try {
        return localStorage.getItem(key(name));
      } catch (e) {
        /* fall through */
      }
    }
    return Object.prototype.hasOwnProperty.call(memory, name) ? memory[name] : null;
  }

  function writeRaw(name, raw) {
    memory[name] = raw;
    if (hasLocal) {
      try {
        localStorage.setItem(key(name), raw);
      } catch (e) {
        /* memory still holds it for this page */
      }
    }
  }

  function get(name, fallback) {
    var raw = readRaw(name);
    if (raw && verified[name] === raw) {
      try {
        return JSON.parse(raw).v;
      } catch (e) {
        delete verified[name];
      }
    }
    var value = unwrap(raw, fallback);
    if (raw && value !== fallback) verified[name] = raw;
    return value;
  }

  function set(name, value) {
    var raw = JSON.stringify(wrap(value));
    writeRaw(name, raw);
    verified[name] = raw;
    writes[name] = (writes[name] || 0) + 1;
    return value;
  }

  function writeCount(name) {
    return writes[name] || 0;
  }

  function remove(name) {
    delete verified[name];
    writes[name] = (writes[name] || 0) + 1;
    delete memory[name];
    if (hasLocal) {
      try {
        localStorage.removeItem(key(name));
      } catch (e) {
        /* ignore */
      }
    }
  }

  function getSession() {
    if (sessionMem) return sessionMem;
    var raw = null;
    if (hasSession) {
      try {
        raw = sessionStorage.getItem(key("session"));
      } catch (e) {
        raw = null;
      }
    }
    if (!raw) raw = readRaw("session");
    sessionMem = unwrap(raw, null);
    return sessionMem;
  }

  function setSession(value) {
    sessionMem = value;
    var raw = value ? JSON.stringify(wrap(value)) : null;
    if (hasSession) {
      try {
        if (raw) sessionStorage.setItem(key("session"), raw);
        else sessionStorage.removeItem(key("session"));
      } catch (e) {
        /* ignore */
      }
    }
    /* Mirror session into localStorage so multi-page file:// / refresh still works when possible. */
    if (raw) writeRaw("session", raw);
    else remove("session");
    return value;
  }

  NS.store = {
    get: get,
    set: set,
    remove: remove,
    writeCount: writeCount,
    getSession: getSession,
    setSession: setSession,
    storageOk: hasLocal
  };
})(window);
