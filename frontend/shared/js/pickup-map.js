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
    if (lat) lat.value = pin ? String(pin.lat) : "";
    if (lng) lng.value = pin ? String(pin.lng) : "";
    if (lab) lab.value = pin && pin.label ? pin.label : "";
  }

  function withCdo(q) {
    if (/philippines|laguindingan|airport/i.test(q)) return q;
    if (/cagayan|cdo/i.test(q)) return q;
    return q + ", Cagayan de Oro, Philippines";
  }

  function searchPlace(q) {
    return fetch(
      "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=ph&q=" +
        encodeURIComponent(withCdo(q)),
      { headers: { Accept: "application/json" } }
    ).then(function (res) {
      return res.json();
    });
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
    var sync =
      form.querySelector('[name="' + prefix + '"][data-map-sync]') ||
      block.querySelector("[data-map-sync]") ||
      (prefix === "pickup" ? form.querySelector("[data-map-sync]") : null);
    var typed = !!sync;
    var pin = typed ? null : savedPin();
    var start = pin ? [pin.lat, pin.lng] : typed && prefix === "pickup" && form.id === "self-form" ? [OFFICE.lat, OFFICE.lng] : CDO;
    var zoom = pin || typed ? 16 : 13;
    var map = global.L.map(box, { scrollWheelZoom: false }).setView(start, zoom);
    global.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);
    var marker = global.L.marker(start, { draggable: true }).addTo(map);
    form._pickupMaps = form._pickupMaps || [];
    form._pickupMaps.push(map);
    if (!form._pickupMap) form._pickupMap = map;

    function setPin(lat, lng, label, options) {
      options = options || {};
      var next = { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6, label: label || "" };
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
    else if (typed && prefix === "pickup" && form.id === "self-form") writeFields(form, block, prefix, OFFICE);

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
            setPin(Number(rows[0].lat), Number(rows[0].lon), rows[0].display_name || q, { fillSync: !!fillSync });
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
          function () {
            if (status) status.textContent = "Location permission was denied. Search or click the map.";
          },
          { enableHighAccuracy: true, timeout: 8000 }
        );
      });
    }

    setTimeout(function () {
      map.invalidateSize();
    }, 200);
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
    var lat = Number(latEl.value);
    var lng = Number(form[prefix + "Lng"] && form[prefix + "Lng"].value);
    if (!isFinite(lat) || !isFinite(lng)) return null;
    return { lat: lat, lng: lng, label: form[prefix + "Label"] ? form[prefix + "Label"].value : "" };
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
    var map = global.L.map(box, { scrollWheelZoom: false, dragging: true }).setView([pin.lat, pin.lng], 16);
    global.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap"
    }).addTo(map);
    global.L.marker([pin.lat, pin.lng]).addTo(map);
    setTimeout(function () {
      map.invalidateSize();
    }, 200);
  }

  NS.pickupMap = { mount: mount, read: read, readDropoff: readDropoff, show: show };
})(window);
