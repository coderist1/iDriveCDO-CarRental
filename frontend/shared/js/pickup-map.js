/**
 * Free pin using Leaflet and OpenStreetMap. No API key.
 * Each [data-map] block follows its typed address ([data-map-sync] or data-map-for).
 */
(function (global) {
  "use strict";

  var NS = (global.iDrive = global.iDrive || {});
  var PIN_KEY = "idrive_lastPickupPin";
  var CDO = [8.4542, 124.6319];
  var OFFICE = { lat: 8.4808, lng: 124.6463, label: "Montalvan Burgos, Cagayan de Oro" };
  var lastSearch = 0;

  function savedPin() {
    try {
      var raw = localStorage.getItem(PIN_KEY);
      var pin = raw ? JSON.parse(raw) : null;
      if (!pin || !isFinite(Number(pin.lat)) || !isFinite(Number(pin.lng))) return null;
      return { lat: Number(pin.lat), lng: Number(pin.lng), label: pin.label || "" };
    } catch (e) {
      return null;
    }
  }

  function remember(pin) {
    try {
      localStorage.setItem(PIN_KEY, JSON.stringify(pin));
    } catch (e) {
      /* the booking still keeps the pin for this trip */
    }
  }

  function namedField(form, block, prefix, suffix) {
    var name = prefix + suffix;
    if (block) {
      var local = block.querySelector('[name="' + name + '"]');
      if (local) return local;
    }
    return form[name];
  }

  function writeFields(form, block, prefix, pin) {
    var lat = namedField(form, block, prefix, "Lat");
    var lng = namedField(form, block, prefix, "Lng");
    var lab = namedField(form, block, prefix, "Label");
    if (lat) lat.value = pin ? Number(pin.lat).toFixed(7) : "";
    if (lng) lng.value = pin ? Number(pin.lng).toFixed(7) : "";
    if (lab) lab.value = pin && pin.label ? pin.label : "";
  }

  /* left, top, right, bottom — biases a local search toward Cagayan de Oro without rewriting the query. */
  var CDO_VIEWBOX = "124.52,8.58,124.78,8.35";

  function searchPlace(q) {
    var url =
      "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&addressdetails=1&countrycodes=ph&q=" +
      encodeURIComponent(q);
    if (!/manila|davao|cebu|laguindingan|airport/i.test(q)) {
      url += "&viewbox=" + CDO_VIEWBOX + "&bounded=0";
    }
    return fetch(url, { headers: { Accept: "application/json" } }).then(function (res) {
      return res.json();
    });
  }

  function pickResult(rows) {
    if (!rows || !rows.length) return null;
    var inside = rows.filter(function (row) {
      var lat = Number(row.lat);
      var lng = Number(row.lon != null ? row.lon : row.lng);
      return lat >= 8.35 && lat <= 8.58 && lng >= 124.52 && lng <= 124.78;
    });
    return inside[0] || rows[0];
  }

  function roundCoord(n) {
    return Math.round(Number(n) * 1e7) / 1e7;
  }

  /* Leaflet and this app store latitude first. Nominatim calls longitude "lon". */
  function asLatLng(lat, lng) {
    lat = Number(lat);
    lng = Number(lng);
    if (!isFinite(lat) || !isFinite(lng)) return null;
    if (Math.abs(lat) > 90 && Math.abs(lng) <= 90) {
      var swapped = lat;
      lat = lng;
      lng = swapped;
    }
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return { lat: roundCoord(lat), lng: roundCoord(lng) };
  }

  function pinIcon(color) {
    var fill = color === "red" ? "#dc2626" : "#2563eb";
    return global.L.divIcon({
      className: "trip-pin",
      html: '<span class="trip-pin-dot" style="background:' + fill + '"></span>',
      iconSize: [22, 28],
      iconAnchor: [11, 26],
      popupAnchor: [0, -22]
    });
  }

  function geoMessage(err) {
    var code = err && err.code;
    if (code === 1) return "Location permission was denied. Allow location for this site, or search and click the map.";
    if (code === 2) return "Your location is unavailable. Turn on GPS or location services, or search and click the map.";
    if (code === 3) return "Finding your location took too long. Try again, or search and click the map.";
    return "Could not read your location. Search or click the map.";
  }

  function reversePlace(lat, lng) {
    return fetch(
      "https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=" +
        encodeURIComponent(lat) +
        "&lon=" +
        encodeURIComponent(lng),
      { headers: { Accept: "application/json" } }
    ).then(function (res) {
      return res.json();
    });
  }

  function throttleSearch(run) {
    var now = Date.now();
    var wait = Math.max(0, 1100 - (now - lastSearch));
    setTimeout(function () {
      lastSearch = Date.now();
      run();
    }, wait);
  }

  function bindBox(form, box) {
    if (!box || box.getAttribute("data-ready") === "1" || !global.L) return;
    box.setAttribute("data-ready", "1");
    var block = box.closest(".pickup-map-block") || box.parentNode;
    var prefix = (block && block.getAttribute("data-map-for")) || "pickup";
    var status = block.querySelector("[data-map-status]");
    var locate = block.querySelector("[data-map-locate]");
    var search = block.querySelector("[data-map-search]");
    var addressName = (block && block.getAttribute("data-address")) || prefix;
    var sync =
      (block && block.querySelector("[data-map-sync]")) ||
      form.querySelector('[name="' + addressName + '"][data-map-sync]') ||
      form.querySelector('[name="' + addressName + '"]');
    var typed = !!sync;
    var pin = typed ? null : savedPin();
    var start = pin ? [pin.lat, pin.lng] : CDO;
    var zoom = pin || typed ? 16 : 13;
    var map = global.L.map(box, { scrollWheelZoom: false }).setView(start, zoom);
    global.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);
    var marker = global.L.marker(start, { draggable: true, icon: pinIcon(prefix === "dropoff" ? "red" : "blue"), autoPan: true }).addTo(map);
    form._pickupMaps = form._pickupMaps || [];
    form._pickupMaps.push(map);
    if (!form._pickupMap) form._pickupMap = map;

    function setPin(lat, lng, label, options) {
      options = options || {};
      var point = asLatLng(lat, lng);
      if (!point) return;
      var next = { lat: point.lat, lng: point.lng, label: label || "" };
      marker.setLatLng([next.lat, next.lng]);
      map.setView([next.lat, next.lng], Math.max(map.getZoom(), 16));
      writeFields(form, block, prefix, next);
      if (!typed) remember(next);
      if (status) status.textContent = next.label || next.lat + ", " + next.lng;
      if (options.fillSync && sync && next.label && sync.value !== next.label) {
        sync.setAttribute("data-from-map", "1");
        sync.value = next.label;
        sync.dispatchEvent(new Event("input", { bubbles: true }));
        sync.removeAttribute("data-from-map");
      }
    }

    if (pin) setPin(pin.lat, pin.lng, pin.label);

    function pinFromLatLng(lat, lng, fillSync) {
      reversePlace(lat, lng)
        .then(function (row) {
          setPin(lat, lng, (row && row.display_name) || "", { fillSync: !!fillSync });
        })
        .catch(function () {
          setPin(lat, lng, "", { fillSync: false });
        });
    }

    marker.on("dragend", function () {
      var at = marker.getLatLng();
      if (typed) {
        pinFromLatLng(at.lat, at.lng, true);
        return;
      }
      setPin(at.lat, at.lng, namedField(form, block, prefix, "Label") ? namedField(form, block, prefix, "Label").value : "");
    });
    map.on("click", function (e) {
      if (typed) {
        pinFromLatLng(e.latlng.lat, e.latlng.lng, true);
        return;
      }
      setPin(e.latlng.lat, e.latlng.lng, "");
    });

    function geocodeQuery(q, fillSync) {
      if (q.length < 3) return;
      throttleSearch(function () {
        searchPlace(q)
          .then(function (rows) {
            if (!rows || !rows[0]) {
              if (status) status.textContent = "No place found. Click the map to drop a pin.";
              return;
            }
            var row = pickResult(rows);
            var point = row && asLatLng(row.lat, row.lon != null ? row.lon : row.lng);
            if (!point) {
              if (status) status.textContent = "No place found. Click the map to drop a pin.";
              return;
            }
            setPin(point.lat, point.lng, row.display_name || q, { fillSync: !!fillSync });
          })
          .catch(function () {
            if (status) status.textContent = "Search is unavailable. Click the map to drop a pin.";
          });
      });
    }

    if (sync) {
      var timer = null;
      sync.addEventListener("input", function () {
        if (sync.getAttribute("data-from-map") === "1") return;
        clearTimeout(timer);
        var q = sync.value.trim();
        if (q.length < 3) return;
        timer = setTimeout(function () {
          geocodeQuery(q, false);
        }, 700);
      });
    }

    if (search) {
      var searchTimer = null;
      search.addEventListener("input", function () {
        clearTimeout(searchTimer);
        var q = search.value.trim();
        if (q.length < 3) return;
        searchTimer = setTimeout(function () {
          geocodeQuery(q, false);
        }, 700);
      });
    }

    if (locate) {
      locate.addEventListener("click", function () {
        if (!navigator.geolocation) {
          if (status) status.textContent = "This browser cannot share your location.";
          return;
        }
        navigator.geolocation.getCurrentPosition(
          function (pos) {
            if (typed) {
              reversePlace(pos.coords.latitude, pos.coords.longitude)
                .then(function (row) {
                  setPin(pos.coords.latitude, pos.coords.longitude, (row && row.display_name) || "Current location", {
                    fillSync: true
                  });
                })
                .catch(function () {
                  setPin(pos.coords.latitude, pos.coords.longitude, "Current location", { fillSync: true });
                });
              return;
            }
            setPin(pos.coords.latitude, pos.coords.longitude, "Current location");
          },
          function (err) {
            if (status) status.textContent = geoMessage(err);
          },
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
        );
      });
    }

    function fit() {
      map.invalidateSize();
      var at = marker.getLatLng();
      if (at) map.panTo(at, { animate: false });
    }
    setTimeout(fit, 0);
    setTimeout(fit, 250);
    global.addEventListener("resize", fit);
  }

  function bindTripBox(form, box) {
    if (!box || box.getAttribute("data-ready") === "1" || !global.L) return;
    box.setAttribute("data-ready", "1");
    var block = box.closest(".pickup-map-block") || box.parentNode;
    var status = block.querySelector("[data-map-status]");
    var locate = block.querySelector("[data-map-locate]");
    var pickupSync = form.querySelector('[name="pickup"][data-map-sync]') || form.querySelector('[name="pickup"]');
    var dropoffSync = form.querySelector('[name="dropoff"][data-map-sync]') || form.querySelector('[name="dropoff"]');
    var placing = "pickup";
    var map = global.L.map(box, { scrollWheelZoom: false }).setView(CDO, 13);
    global.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);
    var pickupMarker = global.L.marker(CDO, { draggable: true, icon: pinIcon("blue"), autoPan: true });
    var dropoffMarker = global.L.marker(CDO, { draggable: true, icon: pinIcon("red"), autoPan: true });
    var hasPickup = false;
    var hasDropoff = false;
    form._pickupMaps = form._pickupMaps || [];
    form._pickupMaps.push(map);
    form._pickupMap = map;

    function fitPins() {
      var pts = [];
      if (hasPickup) pts.push(pickupMarker.getLatLng());
      if (hasDropoff) pts.push(dropoffMarker.getLatLng());
      if (pts.length === 2) map.fitBounds(global.L.latLngBounds(pts).pad(0.35));
      else if (pts.length === 1) map.setView(pts[0], Math.max(map.getZoom(), 16));
    }

    function setWhich(which, lat, lng, label, options) {
      options = options || {};
      var point = asLatLng(lat, lng);
      if (!point) return;
      var next = { lat: point.lat, lng: point.lng, label: label || "" };
      var marker = which === "dropoff" ? dropoffMarker : pickupMarker;
      if (which === "dropoff") hasDropoff = true;
      else hasPickup = true;
      if (!map.hasLayer(marker)) marker.addTo(map);
      marker.setLatLng([next.lat, next.lng]);
      writeFields(form, block, which, next);
      if (options.fillSync) {
        var sync = which === "dropoff" ? dropoffSync : pickupSync;
        if (sync && next.label && sync.value !== next.label) {
          sync.setAttribute("data-from-map", "1");
          sync.value = next.label;
          sync.dispatchEvent(new Event("input", { bubbles: true }));
          sync.removeAttribute("data-from-map");
        }
      }
      fitPins();
      if (status) {
        status.textContent =
          (hasPickup ? "Blue pick-up set. " : "Click the map or search to set the blue pick-up pin. ") +
          (hasDropoff ? "Red drop-off set." : "Then set the red drop-off pin.");
      }
    }

    function pinFromLatLng(which, lat, lng, fillSync) {
      reversePlace(lat, lng)
        .then(function (row) {
          setWhich(which, lat, lng, (row && row.display_name) || "", { fillSync: !!fillSync });
        })
        .catch(function () {
          setWhich(which, lat, lng, "", { fillSync: false });
        });
    }

    function nearer(lat, lng) {
      if (!hasPickup) return "pickup";
      if (!hasDropoff) return "dropoff";
      var a = pickupMarker.getLatLng();
      var b = dropoffMarker.getLatLng();
      var da = Math.pow(a.lat - lat, 2) + Math.pow(a.lng - lng, 2);
      var db = Math.pow(b.lat - lat, 2) + Math.pow(b.lng - lng, 2);
      return da <= db ? "pickup" : "dropoff";
    }

    pickupMarker.on("dragend", function () {
      var at = pickupMarker.getLatLng();
      pinFromLatLng("pickup", at.lat, at.lng, true);
    });
    dropoffMarker.on("dragend", function () {
      var at = dropoffMarker.getLatLng();
      pinFromLatLng("dropoff", at.lat, at.lng, true);
    });
    map.on("click", function (e) {
      var which = placing || nearer(e.latlng.lat, e.latlng.lng);
      pinFromLatLng(which, e.latlng.lat, e.latlng.lng, true);
    });

    function geocodeQuery(which, q, fillSync) {
      if (q.length < 3) return;
      throttleSearch(function () {
        searchPlace(q)
          .then(function (rows) {
            if (!rows || !rows[0]) {
              if (status) status.textContent = "No place found. Click the map to drop a pin.";
              return;
            }
            var row = pickResult(rows);
            var point = row && asLatLng(row.lat, row.lon != null ? row.lon : row.lng);
            if (!point) {
              if (status) status.textContent = "No place found. Click the map to drop a pin.";
              return;
            }
            setWhich(which, point.lat, point.lng, row.display_name || q, { fillSync: !!fillSync });
          })
          .catch(function () {
            if (status) status.textContent = "Search is unavailable. Click the map to drop a pin.";
          });
      });
    }

    function bindSync(sync, which) {
      if (!sync) return;
      var timer = null;
      sync.addEventListener("input", function () {
        if (sync.getAttribute("data-from-map") === "1") return;
        clearTimeout(timer);
        var q = sync.value.trim();
        if (q.length < 3) return;
        timer = setTimeout(function () {
          geocodeQuery(which, q, false);
        }, 700);
      });
    }
    bindSync(pickupSync, "pickup");
    bindSync(dropoffSync, "dropoff");

    Array.prototype.forEach.call(block.querySelectorAll("[data-place-pin]"), function (btn) {
      btn.addEventListener("click", function () {
        placing = btn.getAttribute("data-place-pin") || "pickup";
        Array.prototype.forEach.call(block.querySelectorAll("[data-place-pin]"), function (other) {
          other.classList.toggle("is-active", other === btn);
        });
        if (status) {
          status.textContent =
            placing === "dropoff"
              ? "Click the map to place the red drop-off pin."
              : "Click the map to place the blue pick-up pin.";
        }
      });
    });

    if (locate) {
      locate.addEventListener("click", function () {
        if (!navigator.geolocation) {
          if (status) status.textContent = "This browser cannot share your location.";
          return;
        }
        navigator.geolocation.getCurrentPosition(
          function (pos) {
            pinFromLatLng("pickup", pos.coords.latitude, pos.coords.longitude, true);
          },
          function (err) {
            if (status) status.textContent = geoMessage(err);
          },
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
        );
      });
    }

    function fit() {
      map.invalidateSize();
      fitPins();
    }
    setTimeout(fit, 0);
    setTimeout(fit, 250);
    global.addEventListener("resize", fit);
  }

  function mount(form) {
    if (!form) return;
    var trip = form.querySelector("[data-trip-map] [data-map], [data-trip-map][data-map]");
    if (trip) {
      bindTripBox(form, trip);
      return;
    }
    var boxes = form.querySelectorAll("[data-map]");
    if (!boxes.length) return;
    Array.prototype.forEach.call(boxes, function (box) {
      bindBox(form, box);
    });
  }

  function readPrefix(form, prefix) {
    var latEl = form[prefix + "Lat"];
    if (!form || !latEl || !latEl.value) return null;
    var point = asLatLng(latEl.value, form[prefix + "Lng"] && form[prefix + "Lng"].value);
    if (!point) return null;
    return { lat: point.lat, lng: point.lng, label: form[prefix + "Label"] ? form[prefix + "Label"].value : "" };
  }

  function read(form) {
    return readPrefix(form, "pickup");
  }

  function readDropoff(form) {
    return readPrefix(form, "dropoff");
  }

  function show(id, pin) {
    var box = document.getElementById(id);
    if (!box || !pin || !global.L) return;
    var point = asLatLng(pin.lat, pin.lng);
    if (!point) return;
    var map = global.L.map(box, { scrollWheelZoom: false, dragging: true }).setView([point.lat, point.lng], 16);
    global.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap"
    }).addTo(map);
    global.L.marker([point.lat, point.lng], { icon: pinIcon("blue") }).addTo(map);
    setTimeout(function () {
      map.invalidateSize();
    }, 250);
  }

  function showTrip(id, pickup, dropoff) {
    var box = document.getElementById(id);
    if (!box || !global.L) return;
    var a = pickup && asLatLng(pickup.lat, pickup.lng);
    var b = dropoff && asLatLng(dropoff.lat, dropoff.lng);
    if (!a && !b) return;
    var start = a || b;
    var map = global.L.map(box, { scrollWheelZoom: false, dragging: true }).setView([start.lat, start.lng], 16);
    global.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap"
    }).addTo(map);
    var pts = [];
    if (a) {
      global.L.marker([a.lat, a.lng], { icon: pinIcon("blue") }).addTo(map);
      pts.push([a.lat, a.lng]);
    }
    if (b) {
      global.L.marker([b.lat, b.lng], { icon: pinIcon("red") }).addTo(map);
      pts.push([b.lat, b.lng]);
    }
    if (pts.length === 2) map.fitBounds(pts, { padding: [28, 28] });
    setTimeout(function () {
      map.invalidateSize();
    }, 250);
  }

  NS.pickupMap = { mount: mount, read: read, readDropoff: readDropoff, show: show, showTrip: showTrip };
})(window);
