/**
 * Central API config + fetch wrapper for the Laravel backend.
 * Override the base URL with window.IDRIVE_API_BASE_URL (set before this script loads).
 */
(function (global) {
  "use strict";

  var NS = (global.iDrive = global.iDrive || {});

  var API_URLS = {
    local: "http://127.0.0.1:8000/api",
    /* Replace with the deployed Laravel backend (must be https). */
    production: "https://YOUR-BACKEND-DOMAIN/api"
  };

  function isLocalHost() {
    var host = global.location ? global.location.hostname : "";
    return !host || host === "localhost" || host === "127.0.0.1" || /^192\.168\./.test(host) || /^10\./.test(host);
  }

  var env = isLocalHost() ? "local" : "production";
  if (env === "production" && API_URLS.production.indexOf("YOUR-BACKEND-DOMAIN") !== -1 && !global.IDRIVE_API_BASE_URL) {
    console.error("iDrive: set API_URLS.production in shared/js/api.js to your deployed backend URL.");
  }

  var CONFIG = {
    env: env,
    baseUrl: global.IDRIVE_API_BASE_URL || API_URLS[env],
    timeoutMs: 15000,
    /* Laravel users.id attached to every booking until login is backed by the API. */
    backendUserId: 5,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    }
  };

  /* Laravel apiResource routes: index, store, show, update, destroy. */
  var ENDPOINTS = {
    vehicles: "/vehicles",
    driverDetails: "/driver-details",
    bookings: "/bookings",
    payments: "/payments",
    fuelRecords: "/fuel-records",
    vehicleMaintenances: "/vehicle-maintenances",
    vehicleRegDetails: "/vehicle-reg-details",
    staffInfo: "/staff-info",
    customerInfo: "/customer-info"
  };

  function ApiError(message, status, data) {
    var err = new Error(message);
    err.name = "ApiError";
    err.status = status;
    err.data = data;
    return err;
  }

  function buildUrl(path, query) {
    var url = /^https?:\/\//i.test(path) ? path : CONFIG.baseUrl.replace(/\/+$/, "") + path;
    if (!query) return url;
    var parts = [];
    Object.keys(query).forEach(function (k) {
      var v = query[k];
      if (v === undefined || v === null || v === "") return;
      parts.push(encodeURIComponent(k) + "=" + encodeURIComponent(v));
    });
    return parts.length ? url + (url.indexOf("?") === -1 ? "?" : "&") + parts.join("&") : url;
  }

  function authHeader() {
    var s = NS.store && NS.store.getSession ? NS.store.getSession() : null;
    return s && s.token ? { Authorization: "Bearer " + s.token } : {};
  }

  function request(method, path, options) {
    options = options || {};
    var headers = Object.assign({}, CONFIG.headers, authHeader(), options.headers || {});
    var body = options.body;
    if (body instanceof FormData) delete headers["Content-Type"];
    else if (body !== undefined && typeof body !== "string") body = JSON.stringify(body);

    var controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, options.timeoutMs || CONFIG.timeoutMs) : null;

    return fetch(buildUrl(path, options.query), {
      method: method,
      headers: headers,
      body: body,
      credentials: options.credentials || "same-origin",
      signal: controller ? controller.signal : undefined
    })
      .then(function (res) {
        var type = res.headers.get("Content-Type") || "";
        var parse = res.status === 204 ? Promise.resolve(null) : type.indexOf("application/json") !== -1 ? res.json() : res.text();
        return parse.then(function (data) {
          if (!res.ok) {
            var msg = (data && data.message) || res.statusText || "Request failed";
            if (res.status === 401 && NS.store) NS.store.setSession(null);
            throw ApiError(msg, res.status, data);
          }
          return data;
        });
      })
      .catch(function (e) {
        if (e && e.name === "AbortError") throw ApiError("Request timed out.", 0, null);
        if (e && e.name === "ApiError") throw e;
        throw ApiError("Network error: unable to reach the server.", 0, null);
      })
      .finally(function () {
        if (timer) clearTimeout(timer);
      });
  }

  function lastPage(res) {
    if (!res || typeof res !== "object") return 1;
    if (res.meta && res.meta.last_page) return res.meta.last_page;
    return res.last_page || 1;
  }

  function resource(path) {
    function item(id) {
      return path + "/" + encodeURIComponent(id);
    }
    return {
      path: path,
      /* Laravel paginates 15 per page; resolves to the raw paginator ({ data, current_page, last_page, ... }). */
      list: function (query) { return request("GET", path, { query: query }); },
      /* Follows every page and resolves to one flat array of records. */
      all: function (query) {
        var out = [];
        function load(page) {
          return request("GET", path, { query: Object.assign({}, query, { page: page }) }).then(function (res) {
            out = out.concat(Array.isArray(res) ? res : (res && res.data) || []);
            return !Array.isArray(res) && page < lastPage(res) ? load(page + 1) : out;
          });
        }
        return load(1);
      },
      get: function (id) { return request("GET", item(id)); },
      create: function (data) { return request("POST", path, { body: data }); },
      update: function (id, data) { return request("PUT", item(id), { body: data }); },
      remove: function (id) { return request("DELETE", item(id)); }
    };
  }

  var api = {
    CONFIG: CONFIG,
    API_URLS: API_URLS,
    ENDPOINTS: ENDPOINTS,
    ApiError: ApiError,
    buildUrl: buildUrl,
    request: request,
    get: function (path, options) { return request("GET", path, options); },
    post: function (path, body, options) { return request("POST", path, Object.assign({}, options, { body: body })); },
    put: function (path, body, options) { return request("PUT", path, Object.assign({}, options, { body: body })); },
    patch: function (path, body, options) { return request("PATCH", path, Object.assign({}, options, { body: body })); },
    del: function (path, options) { return request("DELETE", path, options); }
  };

  Object.keys(ENDPOINTS).forEach(function (name) {
    api[name] = resource(ENDPOINTS[name]);
  });

  NS.api = api;
})(window);
