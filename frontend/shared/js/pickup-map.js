/**
 * Free pickup pin using Leaflet and OpenStreetMap. No API key.
 * The location dropdown stays the general area; this pin is the exact spot.
 */
(function (global) {
  "use strict";

  var NS = (global.iDrive = global.iDrive || {});
  var PIN_KEY = "idrive_lastPickupPin";
  var CDO = [8.4542, 124.6319];
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

  function writeFields(form, pin) {
    if (form.pickupLat) form.pickupLat.value = pin ? String(pin.lat) : "";
    if (form.pickupLng) form.pickupLng.value = pin ? String(pin.lng) : "";
    if (form.pickupLabel) form.pickupLabel.value = pin && pin.label ? pin.label : "";
  }

  function mount(form) {
    var box = form.querySelector("[data-map]");
    if (!box || box.getAttribute("data-ready") === "1" || !global.L) return;
    box.setAttribute("data-ready", "1");
    var status = form.querySelector("[data-map-status]");
    var search = form.querySelector("[data-map-search]");
    var locate = form.querySelector("[data-map-locate]");
    var pin = savedPin();
    var map = global.L.map(box, { scrollWheelZoom: false }).setView(pin ? [pin.lat, pin.lng] : CDO, pin ? 16 : 13);
    global.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);
    var marker = global.L.marker(pin ? [pin.lat, pin.lng] : CDO, { draggable: true }).addTo(map);
    form._pickupMap = map;

    function setPin(lat, lng, label) {
      var next = { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6, label: label || "" };
      marker.setLatLng([next.lat, next.lng]);
      map.setView([next.lat, next.lng], Math.max(map.getZoom(), 16));
      writeFields(form, next);
      remember(next);
      if (status) status.textContent = next.label || next.lat + ", " + next.lng;
    }

    if (pin) setPin(pin.lat, pin.lng, pin.label);
    marker.on("dragend", function () {
      var at = marker.getLatLng();
      setPin(at.lat, at.lng, form.pickupLabel ? form.pickupLabel.value : "");
    });
    map.on("click", function (e) {
      setPin(e.latlng.lat, e.latlng.lng, "");
    });

    if (search) {
      var timer = null;
      search.addEventListener("input", function () {
        clearTimeout(timer);
        var q = search.value.trim();
        if (q.length < 3) return;
        timer = setTimeout(function () {
          var now = Date.now();
          var wait = Math.max(0, 1100 - (now - lastSearch));
          setTimeout(function () {
            lastSearch = Date.now();
            fetch(
              "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=ph&q=" +
                encodeURIComponent(q),
              { headers: { Accept: "application/json" } }
            )
              .then(function (res) { return res.json(); })
              .then(function (rows) {
                if (!rows || !rows[0]) {
                  if (status) status.textContent = "No place found. Click the map to drop a pin.";
                  return;
                }
                setPin(Number(rows[0].lat), Number(rows[0].lon), rows[0].display_name || q);
              })
              .catch(function () {
                if (status) status.textContent = "Search is unavailable. Click the map to drop a pin.";
              });
          }, wait);
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
            setPin(pos.coords.latitude, pos.coords.longitude, "Current location");
          },
          function () {
            if (status) status.textContent = "Location permission was denied. Search or click the map.";
          },
          { enableHighAccuracy: true, timeout: 8000 }
        );
      });
    }

    setTimeout(function () { map.invalidateSize(); }, 200);
  }

  function read(form) {
    if (!form || !form.pickupLat || !form.pickupLat.value) return null;
    var lat = Number(form.pickupLat.value);
    var lng = Number(form.pickupLng.value);
    if (!isFinite(lat) || !isFinite(lng)) return null;
    return { lat: lat, lng: lng, label: form.pickupLabel ? form.pickupLabel.value : "" };
  }

  function show(id, pin) {
    var box = document.getElementById(id);
    if (!box || !pin || !global.L) return;
    var map = global.L.map(box, { scrollWheelZoom: false, dragging: true }).setView([pin.lat, pin.lng], 16);
    global.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap'
    }).addTo(map);
    global.L.marker([pin.lat, pin.lng]).addTo(map);
    setTimeout(function () { map.invalidateSize(); }, 200);
  }

  NS.pickupMap = { mount: mount, read: read, show: show };
})(window);
