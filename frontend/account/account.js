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
    if (me && NS.auth.hasRole("staff")) {
      location.replace(NS.routes.href("adminHome"));
      return;
    }
    var welcome = document.getElementById("account-welcome");
    var stats = document.getElementById("account-stats");
    var recent = document.getElementById("account-recent");
    if (!me || !welcome) return;
    paintAvatar(document.getElementById("account-avatar"), me, "xl");
    welcome.textContent = "Hello, " + me.firstName + ".";
    var list = NS.domain.myBookings();
    var upcoming = list.filter(function (b) {
      return (
        b.status === "pending" ||
        b.status === "confirmed" ||
        b.status === "ongoing" ||
        b.status === "return_requested"
      );
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

    var listHost = document.getElementById("account-threads");
    var viewHost = document.getElementById("account-thread-view");
    var selectedId = "";
    var myThreads = NS.domain.myThreads ? NS.domain.myThreads() : [];

    function renderThreadList() {
      if (!listHost) return;
      myThreads = NS.domain.myThreads();
      listHost.innerHTML = myThreads.length
        ? myThreads
            .map(function (t) {
              return (
                '<button type="button" class="thread-item' +
                (t.id === selectedId ? " active" : "") +
                (t.unreadCustomer ? " unread" : "") +
                '" data-thread="' +
                t.id +
                '"><strong>' +
                NS.security.escapeHtml(t.topic) +
                "</strong><span>" +
                (t.unreadCustomer ? "New desk reply" : "Conversation") +
                "</span></button>"
              );
            })
            .join("")
        : "<p class='notice'>No desk messages yet. Book a car or <a href='" +
          NS.routes.href("contact") +
          "'>contact the desk</a>.</p>";
    }

    function renderAccountThread() {
      if (!viewHost) return;
      if (!selectedId) {
        viewHost.innerHTML = "<p class='notice'>Select a conversation to read desk replies.</p>";
        return;
      }
      var thread = NS.domain.getThread(selectedId);
      if (!thread) {
        viewHost.innerHTML = "<p class='notice'>Conversation not found.</p>";
        return;
      }
      NS.domain.markThreadRead(thread.id);
      viewHost.innerHTML =
        "<h3>" +
        NS.security.escapeHtml(thread.topic) +
        "</h3>" +
        '<div class="chat-log">' +
        (thread.messages || [])
          .map(function (m) {
            return (
              '<div class="chat-line chat-' +
              NS.security.escapeHtml(m.fromRole || "customer") +
              '"><strong>' +
              NS.security.escapeHtml(m.fromName || m.fromRole) +
              "</strong><span>" +
              NS.ui.fmtDate(m.at) +
              "</span><p>" +
              NS.security.escapeHtml(m.body) +
              "</p></div>"
            );
          })
          .join("") +
        "</div>" +
        '<form id="customer-reply" class="reply-form">' +
        '<label class="field">Reply to desk<textarea class="form-control" name="body" maxlength="500" required></textarea></label>' +
        '<button class="btn btn-gold" type="submit">Send</button></form>';
      var form = document.getElementById("customer-reply");
      NS.ui.bindCsrf(form);
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        NS.ui.askYesNo("Send this message to the desk?", { title: "Save edit" }).then(function (ok) {
          if (!ok) return;
          try {
            NS.domain.replyToThread(thread.id, form.body.value, form.csrf ? form.csrf.value : "");
            NS.ui.toast("Message sent to staff.", "ok");
            renderThreadList();
            renderAccountThread();
          } catch (err) {
            NS.ui.toast(err.message, "err");
          }
        });
      });
    }

    if (listHost) {
      listHost.addEventListener("click", function (e) {
        var btn = e.target.closest("[data-thread]");
        if (!btn) return;
        selectedId = btn.getAttribute("data-thread");
        renderThreadList();
        renderAccountThread();
      });
      renderThreadList();
    }
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
    if (form.address) form.address.value = me.address || "";
    if (form.department) form.department.value = me.department || "";
    form.licenseNo.value = me.licenseNo || "";
    form.licenseExpiry.value = me.licenseExpiry || "";
    document.getElementById("profile-email").textContent = me.email;
    var deptField = document.getElementById("department-field");
    var licNo = document.getElementById("license-no-field");
    var licExp = document.getElementById("license-exp-field");
    if (me.role === "staff" || me.role === "admin") {
      if (deptField) deptField.hidden = false;
      if (form.licenseNo) form.licenseNo.required = false;
      if (form.licenseExpiry) form.licenseExpiry.required = false;
    } else {
      if (deptField) deptField.hidden = true;
      if (form.licenseNo) form.licenseNo.required = true;
      if (form.licenseExpiry) form.licenseExpiry.required = true;
    }
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
          NS.ui.askYesNo("Save this profile photo?", { title: "Save edit" }).then(function (ok) {
            if (!ok) return;
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
      });
    }

    if (removeBtn) {
      removeBtn.addEventListener("click", function () {
        NS.ui.askYesNo("Remove your profile photo?", { title: "Save edit" }).then(function (ok) {
          if (!ok) return;
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
      });
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      NS.ui.askYesNo("Save profile?", { title: "Save edit", yes: "Yes", no: "No" }).then(function (ok) {
        if (!ok) return;
        try {
          NS.ui.bindCsrf(form);
          NS.auth.updateProfile(
            me.id,
            {
              firstName: form.firstName.value,
              lastName: form.lastName.value,
              phone: form.phone.value,
              address: form.address ? form.address.value : "",
              department: form.department ? form.department.value : "",
              licenseNo: form.licenseNo.value,
              licenseExpiry: form.licenseExpiry.value
            },
            form.csrf ? form.csrf.value : ""
          );
          NS.ui.bindCsrf(form);
          refreshMe();
          NS.ui.toast("Profile saved.", "ok");
        } catch (err) {
          NS.ui.bindCsrf(form);
          NS.ui.toast(err.message, "err");
        }
      });
    });
    pw.addEventListener("submit", function (e) {
      e.preventDefault();
      NS.ui.askYesNo("Update password?", { title: "Save edit", yes: "Yes", no: "No" }).then(function (ok) {
        if (!ok) return;
        try {
          if (pw.nextPassword.value !== pw.confirmPassword.value) throw new Error("New passwords do not match.");
          NS.ui.bindCsrf(pw);
          NS.auth.changePassword(pw.currentPassword.value, pw.nextPassword.value, pw.csrf ? pw.csrf.value : "");
          pw.reset();
          NS.ui.bindCsrf(pw);
          NS.ui.toast("Password updated.", "ok");
        } catch (err) {
          NS.ui.bindCsrf(pw);
          NS.ui.toast(err.message, "err");
        }
      });
    });
  };
})(window);
