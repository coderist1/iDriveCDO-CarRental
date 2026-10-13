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

  function pinIcon() {
    return global.L.icon({
      iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
      iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
      shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41],
      shadowAnchor: [12, 41]
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
    var marker = global.L.marker(start, { draggable: true, icon: pinIcon(), autoPan: true }).addTo(map);
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

  function mount(form) {
    if (!form) return;
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
    global.L.marker([point.lat, point.lng], { icon: pinIcon() }).addTo(map);
    setTimeout(function () {
      map.invalidateSize();
    }, 250);
  }

  NS.pickupMap = { mount: mount, read: read, readDropoff: readDropoff, show: show };
})(window);
