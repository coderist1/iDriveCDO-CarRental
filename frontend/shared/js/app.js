(function (global) {
  "use strict";

  var NS = (global.iDrive = global.iDrive || {});

  document.addEventListener("DOMContentLoaded", function () {
    if (location.protocol === "file:") {
      var ban = document.createElement("div");
      ban.className = "file-protocol-banner";
      ban.innerHTML =
        "Open this app with <strong>frontend/start-server.bat</strong> (http://localhost:8080). " +
        "Login and register will not keep you signed in when using file:// in most browsers.";
      document.body.insertBefore(ban, document.body.firstChild);
    }

    try {
      if (NS.domain && NS.domain.seedIfNeeded) NS.domain.seedIfNeeded();
    } catch (e) {
      console.error("iDrive seed failed", e);
    }

    try {
      if (NS.ui && NS.ui.mountChrome) NS.ui.mountChrome();
    } catch (e) {
      console.error("iDrive chrome failed", e);
    }

    try {
      var user = NS.auth && NS.auth.enforcePageAccess ? NS.auth.enforcePageAccess() : null;
      if (document.body.getAttribute("data-auth") !== "public" && !user) return;
    } catch (e) {
      console.error("iDrive access check failed", e);
    }

    var page = document.body.getAttribute("data-page");
    function runPage() {
      try {
        if (page && NS.pages && typeof NS.pages[page] === "function") NS.pages[page]();
      } catch (e) {
        console.error("iDrive page init failed", e);
        var host = document.getElementById("form-alert") || document.getElementById("toast-host");
        if (host) {
          host.hidden = false;
          host.textContent = "Page failed to start: " + (e && e.message ? e.message : e);
        }
      }
    }

    var access = document.body.getAttribute("data-auth");

    /*
     * Backend sync: pull the Laravel database into local storage so the frontend shows real data.
     * Only the first desk page of a tab waits for it (at most FIRST_SYNC_WAIT_MS); later pages render
     * from the last sync immediately and refresh it in the background for the next page.
     * If the API is unreachable we fall back to local storage. Writes still mirror to the API per action.
     */
    var SYNC_KEY = "idrive_lastSync";
    var FIRST_SYNC_WAIT_MS = 4000;

    function lastSyncAt() {
      try {
        return Number(sessionStorage.getItem(SYNC_KEY)) || 0;
      } catch (e) {
        return 0;
      }
    }

    function markSynced() {
      try {
        sessionStorage.setItem(SYNC_KEY, String(Date.now()));
      } catch (e) {
        /* sync still applied for this page */
      }
    }

    function startWithSync() {
      var shouldSync =
        NS.api &&
        NS.domain &&
        NS.domain.syncAllFromApi &&
        access !== "public";
      if (!shouldSync) {
        runPage();
        return;
      }
      var started = false;
      function startOnce() {
        if (started) return;
        started = true;
        runPage();
      }
      var sync = NS.domain.syncAllFromApi().then(
        function (applied) {
          if (applied) markSynced();
        },
        function (e) {
          console.warn("iDrive: could not sync from the backend; showing local data.", e);
        }
      );
      if (lastSyncAt()) {
        startOnce();
        return;
      }
      setTimeout(startOnce, FIRST_SYNC_WAIT_MS);
      sync.then(startOnce);
    }

    startWithSync();
  });
})(window);
