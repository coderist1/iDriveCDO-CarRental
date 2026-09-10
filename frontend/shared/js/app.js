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
  });
})(window);
