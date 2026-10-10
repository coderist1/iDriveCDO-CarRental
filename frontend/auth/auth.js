/**
 * Authentication, sessions, and role-based page guards.
 */
(function (global) {
  "use strict";

  var NS = (global.iDrive = global.iDrive || {});
  var SESSION_MS = 30 * 60 * 1000;
  var ROLES = { driver: 1, customer: 1, staff: 2, admin: 3 };

  function users() {
    return NS.store.get("users", []);
  }

  function saveUsers(list) {
    NS.store.set("users", list);
  }

  function findUser(email) {
    email = NS.security.sanitizeEmail(email);
    var list = users();
    for (var i = 0; i < list.length; i++) {
      if (list[i].email === email) return list[i];
    }
    return null;
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
      idImage: user.idImage || "",
      avatar: user.avatar || "",
      status: user.status,
      createdAt: user.createdAt
    };
  }

  function touchSession() {
    var s = NS.store.getSession();
    if (!s) return null;
    if (Date.now() > s.expiresAt) {
      logout();
      return null;
    }
    s.expiresAt = Date.now() + SESSION_MS;
    NS.store.setSession(s);
    return s;
  }

  function current() {
    var s = touchSession();
    if (!s) return null;
    var user = null;
    var list = users();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === s.userId) user = list[i];
    }
    if (!user || user.status !== "active") {
      logout();
      return null;
    }
    return publicUser(user);
  }

  function startSession(user) {
    var session = {
      id: NS.security.randomHex(16),
      userId: user.id,
      role: user.role,
      issuedAt: Date.now(),
      expiresAt: Date.now() + SESSION_MS
    };
    NS.store.setSession(session);
    return publicUser(user);
  }

  function login(email, password, csrf) {
    email = NS.security.sanitizeEmail(email);
    if (!email || !password) throw new Error("Email and password are required.");
    NS.security.assertNotLocked(email);
    var user = findUser(email);
    var dummySalt = "00000000000000000000000000000000";
    var candidateHash = NS.security.hashPassword(password, user ? user.salt : dummySalt);
    var ok = user && NS.security.timingSafeEqual(user.passwordHash, candidateHash);
    if (!ok) {
      NS.security.recordLoginFailure(email);
      throw new Error("Invalid email or password.");
    }
    if (user.status !== "active") throw new Error("This account is disabled.");

    try {
      if (csrf) NS.security.assertCsrf(csrf);
      else NS.security.issueCsrf();
    } catch (csrfErr) {
      NS.security.issueCsrf();
    }

    NS.security.clearLoginFailures(email);
    var profile = startSession(user);
    NS.domain.audit("login", user.id, "Signed in.");
    return profile;
  }

  function register(payload, csrf) {
    var email = NS.security.sanitizeEmail(payload.email);
    var firstName = NS.security.sanitizeText(payload.firstName, 40);
    var lastName = NS.security.sanitizeText(payload.lastName, 40);
    var phone = NS.validation.normalizePhone(payload.phone);
    var password = payload.password || "";

    if (!firstName) throw new Error("First name is required.");
    if (!lastName) throw new Error("Last name is required.");
    if (!NS.validation.email(email)) throw new Error("Enter a valid email address.");
    if (!NS.validation.phMobile(phone)) throw new Error("Use a Philippine mobile number (09XXXXXXXXX).");
    if (!payload.ageConfirm) throw new Error("You must confirm you are 21 or older.");
    if (!payload.terms) throw new Error("You must accept the rental terms.");
    var issues = NS.security.passwordIssues(password, email);
    if (issues.length) throw new Error("Password needs: " + issues.join(" "));
    if (password !== payload.confirmPassword) throw new Error("Passwords do not match.");
    if (findUser(email)) throw new Error("An account with this email already exists.");

    /* Soft CSRF: if token missing/mismatch after validation, rotate and continue for this local demo. */
    try {
      if (csrf) NS.security.assertCsrf(csrf);
      else NS.security.issueCsrf();
    } catch (csrfErr) {
      NS.security.issueCsrf();
    }

    var salt = NS.security.randomHex(16);
    /* Optional ID details captured from the register upload (OCR). All optional. */
    var idNumber = NS.security.sanitizeText(payload.idNumber || "", 30).toUpperCase().replace(/\s+/g, "");
    var idExpiry = NS.security.sanitizeText(payload.idExpiry || "", 10);
    var idAddress = NS.security.sanitizeText(payload.idAddress || "", 120);
    var idBirthdate = NS.security.sanitizeText(payload.idBirthdate || "", 10);
    var idImage = typeof payload.idImage === "string" ? payload.idImage.trim() : "";
    if (idImage && !/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(idImage)) idImage = "";
    if (idImage && idImage.length > 750000) idImage = "";
    var user = {
      id: "usr_" + NS.security.randomHex(8),
      email: email,
      passwordHash: NS.security.hashPassword(password, salt),
      salt: salt,
      role: "customer",
      firstName: firstName,
      lastName: lastName,
      phone: phone,
      licenseNo: idNumber || "",
      licenseExpiry: idExpiry || "",
      address: idAddress || "",
      birthdate: idBirthdate || "",
      idImage: idImage || "",
      avatar: "",
      status: "active",
      createdAt: new Date().toISOString()
    };
    var list = users();
    list.push(user);
    saveUsers(list);
    NS.domain.audit("register", user.id, "Customer registered.");
    var profile = startSession(user);
    NS.domain.audit("login", user.id, "Signed in after registration.");
    return profile;
  }

  /*
   * Finishes a Google sign-in after the backend verified the ID token and returned the account.
   * Links to an existing local account by email, otherwise creates one (no usable password).
   */
  function googleSignIn(apiUser) {
    if (!apiUser || !apiUser.email) throw new Error("Google sign-in failed.");
    var email = NS.security.sanitizeEmail(apiUser.email);
    var list = users();
    var user = null;
    for (var i = 0; i < list.length; i++) {
      if (list[i].email === email || (apiUser.user_id != null && list[i].apiId === apiUser.user_id)) user = list[i];
    }
    var picture = "";
    try {
      picture = normalizeAvatar(apiUser.avatar || "");
    } catch (e) {
      picture = "";
    }
    if (user) {
      if (user.status !== "active") throw new Error("This account is disabled.");
      if (user.apiId == null && apiUser.user_id != null) user.apiId = apiUser.user_id;
      if (!user.avatar && picture) user.avatar = picture;
      user.authProvider = user.authProvider || "google";
    } else {
      var salt = NS.security.randomHex(16);
      user = {
        id: "usr_" + NS.security.randomHex(8),
        apiId: apiUser.user_id != null ? apiUser.user_id : null,
        email: email,
        passwordHash: NS.security.hashPassword(NS.security.randomHex(32), salt),
        salt: salt,
        role: ROLES[apiUser.role] ? apiUser.role : "customer",
        firstName: NS.security.sanitizeText(apiUser.first_name || "", 40) || email.split("@")[0],
        lastName: NS.security.sanitizeText(apiUser.last_name || "", 40),
        phone: NS.validation.phMobile(apiUser.phone || "") ? apiUser.phone : "",
        licenseNo: "",
        licenseExpiry: "",
        address: NS.security.sanitizeText(apiUser.address || "", 120),
        avatar: picture,
        authProvider: "google",
        status: "active",
        createdAt: new Date().toISOString()
      };
      list.push(user);
      NS.domain.audit("register", user.id, "Account created with Google sign-in.");
    }
    saveUsers(list);
    NS.security.issueCsrf();
    var profile = startSession(user);
    NS.domain.audit("login", user.id, "Signed in with Google.");
    return profile;
  }

  function setPhone(phone) {
    var me = current();
    if (!me) throw new Error("Sign in required.");
    var normalized = NS.validation.normalizePhone(phone);
    if (!NS.validation.phMobile(normalized)) throw new Error("Use a Philippine mobile number (09XXXXXXXXX).");
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

  function logout() {
    var s = NS.store.getSession();
    if (s) NS.domain.audit("logout", s.userId, "Signed out.");
    NS.store.setSession(null);
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
        var phone = NS.security.sanitizeText(patch.phone, 15);
        var firstName = NS.security.sanitizeText(patch.firstName, 40);
        var lastName = NS.security.sanitizeText(patch.lastName, 40);
        var licenseNo = NS.security.sanitizeText(patch.licenseNo, 30).toUpperCase();
        var licenseExpiry = NS.security.sanitizeText(patch.licenseExpiry, 10);
        if (!firstName || !lastName) throw new Error("Name is required.");
        if (!NS.validation.phMobile(phone)) throw new Error("Invalid mobile number.");
        if (list[i].role === "customer") {
          if (!NS.validation.license(licenseNo)) throw new Error("Invalid license number.");
          if (!NS.validation.futureDate(licenseExpiry)) throw new Error("License expiry must be in the future.");
          list[i].licenseNo = licenseNo;
          list[i].licenseExpiry = licenseExpiry;
        } else {
          if (licenseNo) list[i].licenseNo = licenseNo;
          if (licenseExpiry) list[i].licenseExpiry = licenseExpiry;
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

  function changePassword(currentPassword, nextPassword, csrf) {
    NS.security.assertCsrf(csrf);
    var me = current();
    if (!me) throw new Error("Sign in required.");
    var list = users();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === me.id) {
        var check = NS.security.hashPassword(currentPassword, list[i].salt);
        if (!NS.security.timingSafeEqual(check, list[i].passwordHash)) {
          throw new Error("Current password is incorrect.");
        }
        var issues = NS.security.passwordIssues(nextPassword, list[i].email);
        if (issues.length) throw new Error("New password: " + issues.join(" "));
        var salt = NS.security.randomHex(16);
        list[i].salt = salt;
        list[i].passwordHash = NS.security.hashPassword(nextPassword, salt);
        saveUsers(list);
        NS.domain.audit("password", me.id, "Password changed.");
        return true;
      }
    }
    throw new Error("User not found.");
  }

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
        list[i].status = status === "active" ? "active" : "disabled";
        saveUsers(list);
        if (NS.api && list[i].apiId != null) {
          NS.api.users.update(list[i].apiId, { status: list[i].status }).catch(function (err) {
            console.warn("iDrive: account status was not saved to the server.", err);
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
    login: login,
    register: register,
    googleSignIn: googleSignIn,
    setPhone: setPhone,
    logout: logout,
    updateProfile: updateProfile,
    updateAvatar: updateAvatar,
    changePassword: changePassword,
    setUserStatus: setUserStatus,
    listUsers: listUsers,
    countRole: countRole,
    hasRole: hasRole,
    enforcePageAccess: enforcePageAccess
  };
})(window);
