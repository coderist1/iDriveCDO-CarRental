/**
 * Authentication, sessions, and role-based page guards.
 *
 * No password is ever checked, hashed or stored in this browser. Signing in, signing up, changing a
 * password and resetting one all go to the API (AuthController), which answers with a random token.
 * The token travels with every API request and the server decides who the caller is and what they
 * may read or change. Everything below only mirrors that answer so the pages can draw themselves.
 */
(function (global) {
  "use strict";

  var NS = (global.iDrive = global.iDrive || {});
  var SESSION_MS = 30 * 60 * 1000;
  /* Only show the idle toast when the session just timed out while using the app — not for leftovers from yesterday. */
  var IDLE_NOTICE_GRACE_MS = 5 * 60 * 1000;
  var ROLES = { driver: 1, customer: 1, staff: 2, admin: 3 };
  var DISABLED_MSG = "Your account has been disabled. Please contact the admin.";
  var ENDED_MSG = "Your session has ended. Please sign in again.";
  var IDLE_MSG = "You were signed out after 30 minutes of inactivity. Please sign in again.";
  var UPGRADE_MSG =
    "Sign-in has been updated. Please sign in again. If you signed up before this change, use Forgot password once to set a new password.";
  var NOTICE_KEY = "idrive_authNotice";
  /* Cached copies of other people's records must not outlive the session that was allowed to read them. */
  var PERSONAL_KEYS = ["users", "bookings", "payments"];

  function users() {
    return NS.store.get("users", []);
  }

  function saveUsers(list) {
    NS.store.set("users", list);
  }

  var PHONE_TAKEN = "This mobile number is already registered.";

  /** Another account on this browser already uses this mobile, or null. */
  function phoneOwner(phone, exceptUserId) {
    var canon = NS.validation.canonicalPhone(phone);
    if (!canon) return null;
    var list = users();
    for (var i = 0; i < list.length; i++) {
      if (exceptUserId && list[i].id === exceptUserId) continue;
      if (NS.validation.canonicalPhone(list[i].phone) === canon) return list[i];
    }
    return null;
  }

  /** Laravel validation text, or the fetch error — never a generic "try again". */
  function serverMessage(err, fallback) {
    var errors = err && err.data && err.data.errors;
    if (errors) {
      var parts = [];
      Object.keys(errors).forEach(function (k) {
        [].concat(errors[k] || []).forEach(function (m) {
          if (parts.indexOf(m) === -1) parts.push(m);
        });
      });
      if (parts.length) return parts.join(" ");
    }
    return (err && err.message) || fallback;
  }

  function phoneCheckError(err) {
    return serverMessage(err, "Could not check that mobile number.");
  }

  /** The server's answer as an Error the pages can show, keeping the status for the few that care. */
  function failure(err, fallback) {
    var out = new Error(serverMessage(err, fallback));
    out.status = err && err.status;
    out.code = err && err.data && err.data.code;
    return out;
  }

  /** Resolves with the +63 number, or rejects when it is invalid or already registered. */
  function ensurePhoneFree(phone, exceptUserId) {
    var canon = NS.validation.canonicalPhone(phone);
    if (!canon) return Promise.reject(new Error("Use a Philippine mobile number (09XXXXXXXXX)."));
    if (phoneOwner(canon, exceptUserId)) return Promise.reject(new Error(PHONE_TAKEN));
    if (exceptUserId) {
      var mine = users().filter(function (u) { return u.id === exceptUserId; })[0];
      if (mine && NS.validation.canonicalPhone(mine.phone) === canon) return Promise.resolve(canon);
    }
    if (!NS.api || !NS.api.post) return Promise.resolve(canon);
    return NS.api.post("/users/phone-available", { phone: canon }).then(function (res) {
      if (res && res.taken) throw new Error(PHONE_TAKEN);
      return canon;
    }).catch(function (err) {
      if (err && err.message === PHONE_TAKEN) throw err;
      throw new Error(phoneCheckError(err));
    });
  }

  var AVATAR_MAX = 320000;

  function normalizeAvatar(value) {
    if (value == null || value === "") return "";
    if (typeof value !== "string") throw new Error("Invalid profile image.");
    var trimmed = value.trim();
    if (!trimmed) return "";
    if (trimmed.length > AVATAR_MAX) throw new Error("Profile image is too large. Choose a smaller photo.");
    if (/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(trimmed)) return trimmed;
    if (/^https:\/\/[^\s"'<>]+$/i.test(trimmed)) return trimmed;
    throw new Error("Use a JPG, PNG, or WebP photo.");
  }

  function publicUser(user) {
    if (!user) return null;
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      address: user.address || "",
      department: user.department || "",
      driverId: user.driverId || "",
      licenseNo: user.licenseNo,
      licenseExpiry: user.licenseExpiry,
      birthdate: user.birthdate || "",
      privacyAcceptedAt: user.privacyAcceptedAt || "",
      isBadRenter: !!user.isBadRenter,
      badRenterReason: user.badRenterReason || "",
      badRenterLabeledBy: user.badRenterLabeledBy || "",
      badRenterLabeledAt: user.badRenterLabeledAt || "",
      idImage: user.idImage || "",
      avatar: user.avatar || "",
      status: user.status,
      authProvider: user.authProvider || "password",
      passwordSet: user.authProvider === "google" ? user.passwordSet === true : user.passwordSet !== false,
      createdAt: user.createdAt
    };
  }

  /* ---------------------------------------------------------------- notices and local session */

  function setNotice(message) {
    try {
      sessionStorage.setItem(NOTICE_KEY, message);
    } catch (e) {
      /* the login page still blocks the session */
    }
  }

  function takeNotice() {
    try {
      var msg = sessionStorage.getItem(NOTICE_KEY) || "";
      if (msg) sessionStorage.removeItem(NOTICE_KEY);
      return msg;
    } catch (e) {
      return "";
    }
  }

  function purgePersonalData() {
    PERSONAL_KEYS.forEach(function (key) {
      NS.store.set(key, []);
    });
  }

  /** Drops the local session (the server ends its own when idle) and what was cached for it. */
  function endSession(notice) {
    if (notice) setNotice(notice);
    NS.store.setSession(null);
    purgePersonalData();
  }

  function hasToken(session) {
    return !!(session && typeof session.token === "string" && session.token.length >= 32);
  }

  function touchSession() {
    var s = NS.store.getSession();
    if (!s) return null;
    if (!hasToken(s)) {
      /* A session from before sign-in moved to the server: there is nothing the API would accept. */
      endSession(UPGRADE_MSG);
      return null;
    }
    var expiresAt = Number(s.expiresAt) || 0;
    if (!expiresAt || Date.now() > expiresAt) {
      /*
       * Stale localStorage sessions (browser reopen after hours/days) used to plant IDLE_MSG on the
       * first page load, so Sign in looked like an inactivity logout. Only announce idle timeout when
       * the session expired moments ago; older leftovers are cleared quietly.
       */
      var justTimedOut = expiresAt > 0 && Date.now() - expiresAt < IDLE_NOTICE_GRACE_MS;
      endSession(justTimedOut ? IDLE_MSG : null);
      return null;
    }
    s.expiresAt = Date.now() + SESSION_MS;
    NS.store.setSession(s);
    return s;
  }

  function sessionUser() {
    var s = NS.store.getSession();
    if (!s || !hasToken(s) || Date.now() > s.expiresAt) return null;
    var list = users();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === s.userId) return list[i];
    }
    return null;
  }

  function onLoginPage() {
    return /\/auth\/login\.html/i.test(location.pathname || "");
  }

  function leaveDisabled() {
    setNotice(DISABLED_MSG);
    logout();
    if (!onLoginPage()) {
      location.replace(NS.routes.href("login"));
    }
  }

  var ending = false;

  /*
   * The API said this token is no longer good (it expired, was revoked by a password change, or the
   * account was disabled). Called by the API client; does nothing when nobody is signed in here.
   */
  function sessionEnded() {
    if (ending || !NS.store.getSession()) return;
    ending = true;
    endSession(ENDED_MSG);
    var need = (document.body && document.body.getAttribute("data-auth")) || "public";
    if (need === "public") {
      location.reload();
    } else if (!onLoginPage()) {
      location.replace(NS.routes.href("login", "?next=" + encodeURIComponent(currentRouteKey())));
    }
  }

  function current() {
    var s = touchSession();
    if (!s) return null;
    var user = sessionUser();
    if (!user) {
      logout();
      return null;
    }
    if (user.status !== "active") {
      leaveDisabled();
      return null;
    }
    return publicUser(user);
  }

  /* Re-checks the server copy so a disable applies even if this browser still says "active". */
  function assertActive() {
    var user = sessionUser();
    if (!user) return Promise.reject(new Error("Sign in required."));
    if (user.status !== "active") {
      leaveDisabled();
      return Promise.reject(new Error(DISABLED_MSG));
    }
    if (!NS.api || user.apiId == null) return Promise.resolve(publicUser(user));
    return NS.api.users.get(user.apiId).then(
      function (row) {
        var data = row && row.data && row.data.email ? row.data : row;
        var status = data && data.status;
        if (status && status !== "active") {
          var list = users();
          for (var i = 0; i < list.length; i++) {
            if (list[i].id === user.id) list[i].status = "disabled";
          }
          saveUsers(list);
          leaveDisabled();
          throw new Error(DISABLED_MSG);
        }
        return publicUser(sessionUser() || user);
      },
      function () {
        return publicUser(user);
      }
    );
  }

  function startSession(user, token) {
    NS.store.setSession({
      id: NS.security.randomHex(16),
      userId: user.id,
      role: user.role,
      issuedAt: Date.now(),
      expiresAt: Date.now() + SESSION_MS,
      token: token
    });
    return publicUser(user);
  }

  /* ---------------------------------------------------------------- server accounts */

  /*
   * Puts the account the server just returned into the local cache (keyed by its server id).
   * The server never sends password data, and none is ever written here.
   */
  function adoptServerUser(row, extras) {
    var list = users();
    var email = NS.security.sanitizeEmail(row.email);
    var at = -1;
    var i;
    for (i = 0; i < list.length; i++) {
      if (row.user_id != null && list[i].apiId === row.user_id) {
        at = i;
        break;
      }
    }
    if (at < 0) {
      for (i = 0; i < list.length; i++) {
        if (list[i].apiId == null && list[i].email === email) {
          at = i;
          break;
        }
      }
    }
    var prev = at >= 0 ? list[at] : null;
    var next = Object.assign({}, prev, NS.domain.apiUser(row, prev), extras || {}, {
      id: prev ? prev.id : "usr_api_" + row.user_id,
      apiId: row.user_id
    });
    delete next.passwordHash;
    delete next.salt;
    if (!next.avatar && row.avatar) {
      try {
        next.avatar = normalizeAvatar(row.avatar);
      } catch (e) {
        /* an unusable picture is simply not shown */
      }
    }
    if (at >= 0) list[at] = next;
    else list.push(next);
    saveUsers(list);
    return next;
  }

  /* Turns a sign-in answer ({ token, user }) into this browser's session. */
  function openSession(res, action, detail, extras) {
    if (!res || typeof res.token !== "string" || !res.user || !res.user.email) {
      throw new Error("Sign-in failed. Please try again.");
    }
    purgePersonalData();
    var user = adoptServerUser(res.user, extras);
    if (user.status !== "active") throw new Error(DISABLED_MSG);
    NS.security.issueCsrf();
    var profile = startSession(user, res.token);
    NS.domain.audit(action, user.id, detail);
    return profile;
  }

  function login(email, password) {
    email = NS.security.sanitizeEmail(email);
    if (!email || !password) return Promise.reject(new Error("Email and password are required."));
    if (!NS.api) return Promise.reject(new Error("Sign-in is unavailable right now."));
    return NS.api.post("/auth/login", { email: email, password: password }).then(
      function (res) {
        return openSession(res, "login", "Signed in.");
      },
      function (err) {
        throw failure(err, "Sign in failed. Check the email and password.");
      }
    );
  }

  function register(payload, ignoredCsrf) {
    var body;
    var idImage = "";
    try {
      var email = NS.security.sanitizeEmail(payload.email);
      var firstName = NS.security.sanitizeText(payload.firstName, 40);
      var lastName = NS.security.sanitizeText(payload.lastName, 40);
      var phone = NS.validation.canonicalPhone(payload.phone);
      var password = payload.password || "";

      if (!firstName) throw new Error("First name is required.");
      if (!lastName) throw new Error("Last name is required.");
      if (!NS.validation.email(email)) throw new Error("Enter a valid email address.");
      if (!phone) throw new Error("Use a Philippine mobile number (09XXXXXXXXX).");
      var birthdate = NS.security.sanitizeText(payload.birthdate || payload.idBirthdate || "", 10);
      if (!birthdate) throw new Error("Enter your birth date.");
      if (!payload.privacy) throw new Error("You must accept the Data Privacy notice.");
      if (!payload.terms) throw new Error("You must accept the rental terms.");
      var issues = NS.security.passwordIssues(password, email);
      if (issues.length) throw new Error("Password needs: " + issues.join(" "));
      if (password !== payload.confirmPassword) throw new Error("Passwords do not match.");
      if (!NS.api) throw new Error("Sign-up is unavailable right now.");

      /* Optional details read from the uploaded ID (OCR); they are only sent when they look right. */
      var idNumber = NS.security.sanitizeText(payload.idNumber || "", 30).toUpperCase().replace(/\s+/g, "");
      var idExpiry = NS.security.sanitizeText(payload.idExpiry || "", 10);
      var idAddress = NS.security.sanitizeText(payload.idAddress || "", 120);
      idImage = typeof payload.idImage === "string" ? payload.idImage.trim() : "";
      if (idImage && !/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(idImage)) idImage = "";
      if (idImage && idImage.length > 750000) idImage = "";

      body = {
        first_name: firstName,
        last_name: lastName,
        email: email,
        phone: phone,
        password: password,
        password_confirmation: payload.confirmPassword,
        birthdate: birthdate,
        privacy_accepted: true,
        terms_accepted: true
      };
      if (idNumber && NS.validation.license(idNumber)) body.license_no = idNumber;
      if (/^\d{4}-\d{2}-\d{2}$/.test(idExpiry)) body.license_expiry = idExpiry;
      if (idAddress) body.address = idAddress;
    } catch (err) {
      return Promise.reject(err);
    }

    return NS.api.post("/auth/register", body).then(
      function (res) {
        /* The ID photo is only kept on this device; the desk sees the one given with a booking. */
        return openSession(res, "register", "Customer registered.", idImage ? { idImage: idImage } : null);
      },
      function (err) {
        throw failure(err, "Could not create account.");
      }
    );
  }

  /*
   * Finishes a Google sign-in once the backend has verified the ID token and answered with
   * { token, user }. The account is created or linked on the server, never decided here.
   */
  function googleSignIn(data) {
    if (!data || !data.user || !data.user.email) throw new Error("Google sign-in failed.");
    return openSession(
      data,
      data.created ? "register" : "login",
      data.created ? "Account created with Google sign-in." : "Signed in with Google."
    );
  }

  function setPhone(phone) {
    var me = current();
    if (!me) throw new Error("Sign in required.");
    var normalized = NS.validation.canonicalPhone(phone);
    if (!normalized) throw new Error("Use a Philippine mobile number (09XXXXXXXXX).");
    if (phoneOwner(normalized, me.id)) throw new Error(PHONE_TAKEN);
    var list = users();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === me.id) {
        list[i].phone = normalized;
        saveUsers(list);
        if (NS.domain.pushUserProfileToApi) NS.domain.pushUserProfileToApi(list[i]);
        NS.domain.audit("profile", me.id, "Mobile number added.");
        return publicUser(list[i]);
      }
    }
    throw new Error("User not found.");
  }

  /*
   * Ends the session here and on the server. Resolves when the server has answered (or after a few
   * seconds), so a page that navigates away straight after does not cancel the request.
   */
  function logout() {
    var s = NS.store.getSession();
    var done = Promise.resolve();
    if (s) {
      NS.domain.audit("logout", s.userId, "Signed out.");
      if (hasToken(s) && NS.api) {
        done = NS.api.post("/auth/logout", {}, { timeoutMs: 4000 }).then(
          function () {},
          function () {
            /* the server ends an unused session by itself */
          }
        );
      }
    }
    NS.store.setSession(null);
    purgePersonalData();
    return done;
  }

  function updateProfile(userId, patch, csrf) {
    try {
      if (csrf) NS.security.assertCsrf(csrf);
      else NS.security.issueCsrf();
    } catch (csrfErr) {
      NS.security.issueCsrf();
    }
    var me = current();
    if (!me || (me.id !== userId && me.role !== "admin")) throw new Error("Not allowed.");
    var list = users();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === userId) {
        var phone = NS.validation.canonicalPhone(patch.phone);
        var firstName = NS.security.sanitizeText(patch.firstName, 40);
        var lastName = NS.security.sanitizeText(patch.lastName, 40);
        var licenseNo = NS.security.sanitizeText(patch.licenseNo, 30).toUpperCase();
        var licenseExpiry = NS.security.sanitizeText(patch.licenseExpiry, 10);
        if (!firstName || !lastName) throw new Error("Name is required.");
        if (!phone) throw new Error("Use a Philippine mobile number (09XXXXXXXXX).");
        if (phoneOwner(phone, list[i].id)) throw new Error(PHONE_TAKEN);
        if (licenseNo && licenseNo !== list[i].licenseNo) {
          if (list[i].role === "customer" && !NS.validation.license(licenseNo)) throw new Error("Invalid license number.");
          list[i].licenseNo = licenseNo;
        }
        if (licenseExpiry && licenseExpiry !== list[i].licenseExpiry) {
          if (list[i].role === "customer" && !NS.validation.futureDate(licenseExpiry)) throw new Error("License expiry must be in the future.");
          list[i].licenseExpiry = licenseExpiry;
        }
        list[i].firstName = firstName;
        list[i].lastName = lastName;
        list[i].phone = phone;
        list[i].address = NS.security.sanitizeText(patch.address || "", 120);
        if (list[i].role === "staff" || list[i].role === "admin") {
          list[i].department = NS.security.sanitizeText(patch.department || list[i].department || "", 60);
        }
        if (Object.prototype.hasOwnProperty.call(patch, "avatar")) {
          list[i].avatar = normalizeAvatar(patch.avatar);
        }
        saveUsers(list);
        if (NS.domain.pushUserProfileToApi) NS.domain.pushUserProfileToApi(list[i]);
        NS.domain.audit("profile", userId, "Profile updated.");
        return publicUser(list[i]);
      }
    }
    throw new Error("User not found.");
  }

  function updateAvatar(userId, avatar, csrf) {
    try {
      if (csrf) NS.security.assertCsrf(csrf);
      else NS.security.issueCsrf();
    } catch (csrfErr) {
      NS.security.issueCsrf();
    }
    var me = current();
    if (!me || (me.id !== userId && me.role !== "admin")) throw new Error("Not allowed.");
    var next = normalizeAvatar(avatar);
    var list = users();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === userId) {
        list[i].avatar = next;
        saveUsers(list);
        NS.domain.audit("avatar", userId, next ? "Profile photo updated." : "Profile photo removed.");
        return publicUser(list[i]);
      }
    }
    throw new Error("User not found.");
  }

  /*
   * Changes the password of the signed-in account on the server. Every other session of the account
   * ends. An account that signs in with Google and has no password yet leaves the current one empty.
   */
  function changePassword(currentPassword, nextPassword, csrf, confirmPassword) {
    try {
      NS.security.assertCsrf(csrf);
    } catch (csrfErr) {
      return Promise.reject(csrfErr);
    }
    var me = current();
    if (!me) return Promise.reject(new Error("Sign in required."));
    var issues = NS.security.passwordIssues(nextPassword, me.email);
    if (issues.length) return Promise.reject(new Error("New password: " + issues.join(" ")));
    var body = {
      password: nextPassword,
      password_confirmation: confirmPassword == null ? nextPassword : confirmPassword
    };
    if (currentPassword) body.current_password = currentPassword;
    return NS.api.post("/auth/password", body).then(
      function (res) {
        if (res && res.user) adoptServerUser(res.user);
        NS.domain.audit("password", me.id, "Password changed.");
        return true;
      },
      function (err) {
        throw failure(err, "Could not change the password.");
      }
    );
  }

  /* ---------------------------------------------------------------- forgotten password */

  var RESET_TICKET_KEY = "idrive_reset_ticket";
  var RESET_TICKET_MS = 10 * 60 * 1000;

  function readResetTicket() {
    try {
      var raw = sessionStorage.getItem(RESET_TICKET_KEY);
      if (!raw) return null;
      var ticket = JSON.parse(raw);
      if (!ticket || !ticket.email || !ticket.ticket || !ticket.at || Date.now() - ticket.at > RESET_TICKET_MS) {
        sessionStorage.removeItem(RESET_TICKET_KEY);
        return null;
      }
      return ticket;
    } catch (e) {
      return null;
    }
  }

  function saveResetTicket(email, ticket) {
    sessionStorage.setItem(RESET_TICKET_KEY, JSON.stringify({ email: email, ticket: ticket, at: Date.now() }));
  }

  function clearResetTicket() {
    try {
      sessionStorage.removeItem(RESET_TICKET_KEY);
    } catch (e) {
      /* ignore */
    }
  }

  /*
   * Emails a 6-digit code. The server answers the same whether or not the address has an account, so
   * nothing here can be used to find out who is registered. Resolves with the server's message.
   */
  function sendResetCode(email) {
    email = NS.security.sanitizeEmail(email);
    if (!NS.validation.email(email)) return Promise.reject(new Error("Enter a valid email address."));
    return NS.api.post("/auth/password-code", { email: email }).then(
      function (res) {
        return (res && res.message) || "If that email has an account, a 6-digit code is on its way.";
      },
      function (err) {
        throw failure(err, "Could not send the code.");
      }
    );
  }

  /* Confirms the emailed code; the server hands back a one-time ticket for the new-password page. */
  function verifyResetCode(email, code) {
    email = NS.security.sanitizeEmail(email);
    code = String(code || "").replace(/\D/g, "");
    if (!NS.validation.email(email)) return Promise.reject(new Error("Enter a valid email address."));
    if (code.length !== 6) return Promise.reject(new Error("Enter the 6-digit code from the email."));
    return NS.api.post("/auth/password-code/verify", { email: email, code: code }).then(
      function (res) {
        if (!res || !res.ticket) throw new Error("That code is not valid.");
        saveResetTicket(email, res.ticket);
        return email;
      },
      function (err) {
        throw failure(err, "That code is not valid.");
      }
    );
  }

  function completeVerifiedReset(nextPassword, confirmPassword) {
    var ticket = readResetTicket();
    if (!ticket) return Promise.reject(new Error("Confirm the email code first. It may have expired."));
    var issues = NS.security.passwordIssues(nextPassword, ticket.email);
    if (issues.length) return Promise.reject(new Error("New password: " + issues.join(" ")));
    return NS.api
      .post("/auth/password-reset", {
        email: ticket.email,
        ticket: ticket.ticket,
        password: nextPassword,
        password_confirmation: confirmPassword == null ? nextPassword : confirmPassword
      })
      .then(
        function () {
          clearResetTicket();
          return true;
        },
        function (err) {
          throw failure(err, "Could not save the password.");
        }
      );
  }

  /* ---------------------------------------------------------------- staff tools */

  function setUserStatus(userId, status, csrf) {
    NS.security.assertCsrf(csrf);
    var me = current();
    if (!me || !hasRole("staff")) throw new Error("Staff access required.");
    if (me.id === userId) throw new Error("You cannot disable your own account.");
    var list = users();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === userId) {
        if (list[i].role === "admin") throw new Error("Admin accounts cannot be disabled here.");
        if (me.role !== "admin" && list[i].role !== "customer") throw new Error("Only an admin can change staff and driver accounts.");
        var before = list[i].status;
        list[i].status = status === "active" ? "active" : "disabled";
        saveUsers(list);
        if (NS.api && list[i].apiId != null) {
          NS.api.users.update(list[i].apiId, { status: list[i].status }).catch(function (err) {
            /* The server decides; put the screen back to what it still says. */
            var again = users();
            for (var j = 0; j < again.length; j++) {
              if (again[j].id === userId) again[j].status = before;
            }
            saveUsers(again);
            if (NS.ui && NS.ui.toast) NS.ui.toast("Could not change that account: " + serverMessage(err, "try again."), "err");
          });
        }
        NS.domain.audit("user-status", me.id, list[i].email + " → " + list[i].status);
        return publicUser(list[i]);
      }
    }
    throw new Error("User not found.");
  }

  function userById(id) {
    var list = users();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return publicUser(list[i]);
    }
    return null;
  }

  function listUsers() {
    var me = current();
    if (!me || !hasRole("staff")) throw new Error("Staff access required.");
    return users().map(publicUser);
  }

  function countRole(role) {
    return users().filter(function (u) {
      return u.role === role;
    }).length;
  }

  function hasRole(minRole) {
    var me = current();
    if (!me) return false;
    return (ROLES[me.role] || 0) >= (ROLES[minRole] || 99);
  }

  function currentRouteKey() {
    var path = (location.pathname || "").replace(/\\/g, "/");
    var parts = path.split("/");
    var file = parts.pop() || "index.html";
    var folder = parts.pop() || "";
    return folder + "/" + file;
  }

  function enforcePageAccess() {
    var need = document.body.getAttribute("data-auth") || "public";
    var me = current();
    if (need === "public") return me;
    if (!me) {
      if ((document.body.getAttribute("data-page") || "") === "book") return null;
      var next = currentRouteKey();
      location.replace(NS.routes.href("login", "?next=" + encodeURIComponent(next)));
      return null;
    }
    // Drivers only ever see the driver workspace.
    if (me.role === "driver") {
      if (need === "driver") return me;
      location.replace(NS.routes.href("driverHome"));
      return null;
    }
    if (need === "driver") {
      location.replace(NS.routes.href(hasRole("staff") ? "adminHome" : "account"));
      return null;
    }
    if (need === "user") return me;
    if (need === "staff" && !hasRole("staff")) {
      location.replace(NS.routes.href("account"));
      return null;
    }
    if (need === "admin" && !hasRole("admin")) {
      location.replace(NS.routes.href("account"));
      return null;
    }
    return me;
  }

  NS.auth = {
    publicUser: publicUser,
    userById: userById,
    current: current,
    assertActive: assertActive,
    takeNotice: takeNotice,
    sessionEnded: sessionEnded,
    DISABLED_MSG: DISABLED_MSG,
    login: login,
    register: register,
    phoneOwner: phoneOwner,
    ensurePhoneFree: ensurePhoneFree,
    phoneCheckError: phoneCheckError,
    googleSignIn: googleSignIn,
    setPhone: setPhone,
    logout: logout,
    updateProfile: updateProfile,
    updateAvatar: updateAvatar,
    changePassword: changePassword,
    sendResetCode: sendResetCode,
    verifyResetCode: verifyResetCode,
    completeVerifiedReset: completeVerifiedReset,
    readResetTicket: readResetTicket,
    setUserStatus: setUserStatus,
    listUsers: listUsers,
    countRole: countRole,
    hasRole: hasRole,
    enforcePageAccess: enforcePageAccess
  };
})(window);
