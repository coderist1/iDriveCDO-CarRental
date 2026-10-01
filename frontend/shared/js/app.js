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
    if ((access === "staff" || access === "admin") && NS.api && NS.domain && NS.domain.syncAllFromApi) {
      /* The Laravel dev server answers one request at a time, so a full sync takes seconds. After the
         first sync, pages render from the saved copy and refresh it in the background. */
      if (NS.store.get("apiSyncedAt", null)) {
        runPage();
        NS.domain.syncAllFromApi().then(
          function () {
            NS.store.set("apiSyncedAt", new Date().toISOString());
          },
          function (e) {
            console.warn("iDrive: background sync with the API failed.", e);
          }
        );
      } else {
        if (NS.ui && NS.ui.toast) NS.ui.toast("Loading data from the server…", "ok");
        NS.domain.syncAllFromApi().then(
          function () {
            NS.store.set("apiSyncedAt", new Date().toISOString());
            runPage();
          },
          function (e) {
            console.warn("iDrive: could not load data from the API, showing local data.", e);
            if (NS.ui && NS.ui.toast) NS.ui.toast("Could not reach the server. Showing saved data.", "err");
            runPage();
          }
        );
      }
    } else {
      runPage();
    }
  });
})(window);
