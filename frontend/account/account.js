(function (global) {
  "use strict";

  var NS = (global.iDrive = global.iDrive || {});
  NS.pages = NS.pages || {};

  function paintAvatar(host, user, size) {
    if (!host || !host.parentNode) return;
    var wrap = document.createElement("div");
    wrap.innerHTML = NS.ui.avatarHtml(user, size);
    var next = wrap.firstChild;
    if (!next) return;
    next.id = host.id;
    host.parentNode.replaceChild(next, host);
  }

  NS.pages.account = function account() {
    var me = NS.auth.current();
    var welcome = document.getElementById("account-welcome");
    var stats = document.getElementById("account-stats");
    var recent = document.getElementById("account-recent");
    if (!me || !welcome) return;
    paintAvatar(document.getElementById("account-avatar"), me, "xl");
    welcome.textContent = "Hello, " + me.firstName + ".";
    var list = NS.domain.myBookings();
    var upcoming = list.filter(function (b) {
      return b.status === "pending" || b.status === "confirmed";
    }).length;
    stats.innerHTML =
      '<div class="stat"><span>' +
      list.length +
      "</span>trips</div>" +
      '<div class="stat"><span>' +
      upcoming +
      "</span>open</div>" +
      '<div class="stat"><span>' +
      NS.security.escapeHtml(me.role) +
      "</span>role</div>";
    recent.innerHTML = list.length
      ? list
          .slice()
          .reverse()
          .slice(0, 5)
          .map(function (b) {
            var v = NS.domain.getVehicle(b.vehicleId);
            return (
              '<a class="row-link" href="' +
              NS.routes.href("bookingDetail", "?id=" + encodeURIComponent(b.id)) +
              '"><strong>' +
              NS.security.escapeHtml(b.ref) +
              "</strong><span>" +
              NS.security.escapeHtml(v ? v.name : "Vehicle") +
              "</span>" +
              NS.ui.statusBadge(b.status) +
              "</a>"
            );
          })
          .join("")
      : "<p class='notice'>No trips yet. <a href='" + NS.routes.href("fleet") + "'>Choose a car</a>.</p>";
  };

  NS.pages.profile = function profile() {
    var form = document.getElementById("profile-form");
    var pw = document.getElementById("password-form");
    var input = document.getElementById("avatar-input");
    var removeBtn = document.getElementById("avatar-remove");
    var me = NS.auth.current();
    if (!form || !me) return;
    NS.ui.bindCsrf(form);
    NS.ui.bindCsrf(pw);
    form.firstName.value = me.firstName;
    form.lastName.value = me.lastName;
    form.phone.value = me.phone;
    form.licenseNo.value = me.licenseNo;
    form.licenseExpiry.value = me.licenseExpiry;
    document.getElementById("profile-email").textContent = me.email;
    paintAvatar(document.getElementById("profile-avatar"), me, "lg");

    function refreshMe() {
      me = NS.auth.current() || me;
      paintAvatar(document.getElementById("profile-avatar"), me, "lg");
      if (NS.ui.mountChrome) NS.ui.mountChrome();
    }

    if (input) {
      input.addEventListener("change", function () {
        var file = input.files && input.files[0];
        input.value = "";
        if (!file) return;
        NS.ui.readImageAsAvatar(file, function (err, dataUrl) {
          if (err) {
            NS.ui.toast(err.message, "err");
            return;
          }
          try {
            NS.ui.bindCsrf(form);
            NS.auth.updateAvatar(me.id, dataUrl, form.csrf ? form.csrf.value : "");
            NS.ui.bindCsrf(form);
            refreshMe();
            NS.ui.toast("Profile photo updated.", "ok");
          } catch (e) {
            NS.ui.bindCsrf(form);
            NS.ui.toast(e.message || "Could not save photo.", "err");
          }
        });
      });
    }

    if (removeBtn) {
      removeBtn.addEventListener("click", function () {
        try {
          NS.ui.bindCsrf(form);
          NS.auth.updateAvatar(me.id, "", form.csrf ? form.csrf.value : "");
          NS.ui.bindCsrf(form);
          refreshMe();
          NS.ui.toast("Profile photo removed.", "ok");
        } catch (e) {
          NS.ui.bindCsrf(form);
          NS.ui.toast(e.message || "Could not remove photo.", "err");
        }
      });
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      try {
        NS.auth.updateProfile(
          me.id,
          {
            firstName: form.firstName.value,
            lastName: form.lastName.value,
            phone: form.phone.value,
            licenseNo: form.licenseNo.value,
            licenseExpiry: form.licenseExpiry.value
          },
          form.csrf.value
        );
        NS.ui.bindCsrf(form);
        refreshMe();
        NS.ui.toast("Profile saved.", "ok");
      } catch (err) {
        NS.ui.bindCsrf(form);
        NS.ui.toast(err.message, "err");
      }
    });
    pw.addEventListener("submit", function (e) {
      e.preventDefault();
      try {
        if (pw.nextPassword.value !== pw.confirmPassword.value) throw new Error("New passwords do not match.");
        NS.auth.changePassword(pw.currentPassword.value, pw.nextPassword.value, pw.csrf.value);
        pw.reset();
        NS.ui.bindCsrf(pw);
        NS.ui.toast("Password updated.", "ok");
      } catch (err) {
        NS.ui.bindCsrf(pw);
        NS.ui.toast(err.message, "err");
      }
    });
  };
})(window);
