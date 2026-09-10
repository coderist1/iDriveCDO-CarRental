(function (global) {
  "use strict";

  var NS = (global.iDrive = global.iDrive || {});
  NS.pages = NS.pages || {};

  NS.pages.contact = function contact() {
    var form = document.getElementById("contact-form");
    if (!form) return;
    NS.ui.bindCsrf(form);
    var me = NS.auth.current();
    if (me) {
      if (form.name && !form.name.value) form.name.value = ((me.firstName || "") + " " + (me.lastName || "")).trim();
      if (form.email && !form.email.value) form.email.value = me.email || "";
    }
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      NS.ui.askYesNo("Send this message to the iDrive desk?", { title: "Save edit" }).then(function (ok) {
        if (!ok) return;
        NS.ui.clearErrors(form);
        try {
          NS.ui.bindCsrf(form);
          NS.domain.sendContact(
            {
              name: form.name.value,
              email: form.email.value,
              topic: form.topic.value,
              message: form.message.value
            },
            form.csrf ? form.csrf.value : ""
          );
          form.reset();
          NS.ui.bindCsrf(form);
          NS.ui.toast("Message sent. Staff will see it in the desk inbox.", "ok");
        } catch (err) {
          NS.ui.bindCsrf(form);
          NS.ui.toast(err.message, "err");
        }
      });
    });
  };
})(window);
