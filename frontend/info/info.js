(function (global) {
  "use strict";

  var NS = (global.iDrive = global.iDrive || {});
  NS.pages = NS.pages || {};

  NS.pages.contact = function contact() {
    var form = document.getElementById("contact-form");
    if (!form) return;
    NS.ui.bindCsrf(form);
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      NS.ui.clearErrors(form);
      try {
        NS.security.assertCsrf(form.csrf.value);
        var name = NS.security.sanitizeText(form.name.value, 60);
        var email = NS.security.sanitizeEmail(form.email.value);
        var message = NS.security.sanitizeText(form.message.value, 500);
        if (!name) throw new Error("Name is required.");
        if (!NS.validation.email(email)) throw new Error("Valid email is required.");
        if (message.length < 12) throw new Error("Please write a short message.");
        var inbox = NS.store.get("inbox", []);
        inbox.unshift({
          id: "msg_" + NS.security.randomHex(6),
          name: name,
          email: email,
          topic: NS.security.sanitizeText(form.topic.value, 40),
          message: message,
          at: new Date().toISOString()
        });
        NS.store.set("inbox", inbox.slice(0, 50));
        form.reset();
        NS.ui.bindCsrf(form);
        NS.ui.toast("Message saved on this device. A desk agent can review it in Reports.", "ok");
      } catch (err) {
        NS.ui.bindCsrf(form);
        NS.ui.toast(err.message, "err");
      }
    });
  };
})(window);
