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

    var page = document.body.getAttribute("data-page");

    try {
      var user = NS.auth && NS.auth.enforcePageAccess ? NS.auth.enforcePageAccess() : null;
      if (document.body.getAttribute("data-auth") !== "public" && !user) {
        if (page === "book" && NS.ui && NS.ui.openAuthModal) {
          var flow = document.getElementById("booking-flow");
          if (flow) flow.hidden = true;
          var bookAuth = {
            stay: true,
            onClose: function () {
              var gate = document.getElementById("book-signin-gate");
              if (!gate) {
                gate = document.createElement("div");
                gate.id = "book-signin-gate";
                gate.className = "form-card";
                gate.innerHTML =
                  "<h1>Sign in to book</h1>" +
                  "<p>Sign in or create an account to continue this booking.</p>" +
                  '<button type="button" class="btn btn-gold" id="book-signin-again">Sign in</button>';
                var layout = document.querySelector(".layout");
                if (layout) layout.appendChild(gate);
                gate.querySelector("#book-signin-again").addEventListener("click", function () {
                  gate.hidden = true;
                  NS.ui.openAuthModal(null, bookAuth);
                });
              }
              gate.hidden = false;
            },
            onSuccess: function (signedIn) {
              var gate = document.getElementById("book-signin-gate");
              if (gate) gate.hidden = true;
              if (!signedIn || signedIn.role === "customer") {
                if (flow) flow.hidden = false;
                if (NS.ui.mountChrome) NS.ui.mountChrome();
                startWithSync();
                return;
              }
              location.href = NS.routes.href(signedIn.role === "driver" ? "driverHome" : "adminHome");
            }
          };
          NS.ui.openAuthModal(null, bookAuth);
        }
        return;
      }
    } catch (e) {
      console.error("iDrive access check failed", e);
    }

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
          if (NS.auth && NS.auth.current) NS.auth.current();
          /* Desk pages often paint from a previous sync; refresh once new server data lands. */
          if (applied && started && NS.pages && typeof NS.pages.onSynced === "function") {
            try {
              NS.pages.onSynced();
            } catch (refreshErr) {
              console.warn("iDrive: page refresh after sync failed.", refreshErr);
            }
          }
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

    if (NS.ui && NS.ui.bindPasswordToggles) NS.ui.bindPasswordToggles(document);
    startWithSync();
  });
})(window);
