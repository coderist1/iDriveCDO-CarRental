(function (global) {
  "use strict";

  var NS = (global.iDrive = global.iDrive || {});
  var API_BASE = "http://127.0.0.1:8001";
  var KNOWN_BRANDS = [
    "Audi", "BMW", "Chevrolet", "Ford", "Honda",
    "Hyundai", "Kia", "Mercedes-Benz", "Nissan", "Toyota"
  ];
  // Map fleet brands missing from training data to the closest trained brand.
  var BRAND_ALIASES = {
    Mitsubishi: "Toyota",
    Suzuki: "Toyota",
    Isuzu: "Toyota",
    Mazda: "Honda",
    Subaru: "Honda",
    Lexus: "Toyota",
    Jeep: "Ford",
    MG: "Hyundai"
  };

  var GROUPS = [
    {
      title: "Engine",
      fields: [
        ["engine_temp_c", "Engine temperature", 95, "°C"],
        ["engine_rpm", "Engine RPM", 2500, "rpm"],
        ["oil_pressure_psi", "Oil pressure", 40, "psi"],
        ["coolant_temp_c", "Coolant temperature", 90, "°C"],
        ["fuel_level_percent", "Fuel level", 55, "%"],
        ["fuel_consumption_lph", "Fuel consumption", 8, "L/h"],
        ["engine_load_percent", "Engine load", 40, "%"],
        ["throttle_pos_percent", "Throttle position", 30, "%"],
        ["air_flow_rate_gps", "Air flow rate", 20, "g/s"],
        ["exhaust_gas_temp_c", "Exhaust temperature", 400, "°C"],
        ["vibration_level", "Vibration level", 2, ""],
        ["engine_hours", "Engine hours", 1500, "h"]
      ]
    },
    {
      title: "Brakes and wheels",
      fields: [
        ["brake_fluid_level_psi", "Brake fluid pressure", 900, "psi"],
        ["brake_pad_wear_mm", "Brake pad thickness", 8, "mm"],
        ["brake_temp_c", "Brake temperature", 80, "°C"],
        ["abs_fault_indicator", "ABS fault (0 or 1)", 0, ""],
        ["brake_pedal_pos_percent", "Brake pedal position", 10, "%"],
        ["wheel_speed_fl_kph", "Front-left wheel", 60, "km/h"],
        ["wheel_speed_fr_kph", "Front-right wheel", 60, "km/h"],
        ["wheel_speed_rl_kph", "Rear-left wheel", 60, "km/h"],
        ["wheel_speed_rr_kph", "Rear-right wheel", 60, "km/h"]
      ]
    },
    {
      title: "Battery and environment",
      fields: [
        ["battery_voltage_v", "Battery voltage", 12.4, "V"],
        ["battery_current_a", "Battery current", 5, "A"],
        ["battery_temp_c", "Battery temperature", 30, "°C"],
        ["alternator_output_v", "Alternator output", 14, "V"],
        ["battery_charge_percent", "Battery charge", 80, "%"],
        ["battery_health_percent", "Battery health", 90, "%"],
        ["vehicle_speed_kph", "Vehicle speed", 60, "km/h"],
        ["ambient_temp_c", "Ambient temperature", 28, "°C"],
        ["humidity_percent", "Humidity", 70, "%"]
      ]
    }
  ];

  function resolveBrand(brand) {
    var name = String(brand || "").trim();
    if (KNOWN_BRANDS.indexOf(name) !== -1) return name;
    if (BRAND_ALIASES[name]) return BRAND_ALIASES[name];
    return "Toyota";
  }

  function supportsBrand(brand) {
    // Every fleet brand is scoreable via alias or fallback.
    return !!String(brand || "").trim();
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function defaultTelemetry(vehicle) {
    var mileage = Number(vehicle && vehicle.mileage) || 50000;
    var year = Number(vehicle && vehicle.year) || 2024;
    var age = Math.max(0, 2026 - year);
    var wear = clamp(mileage / 120000, 0, 1);
    var diesel = String((vehicle && vehicle.fuel) || "").toLowerCase() === "diesel";

    var values = {
      brand: resolveBrand(vehicle && vehicle.brand),
      timestamp: new Date().toISOString(),
      odometer_reading: mileage,
      engine_temp_c: clamp(88 + age * 1.5 + wear * 18, 80, 135),
      engine_rpm: diesel ? 2100 : 2400,
      oil_pressure_psi: clamp(48 - wear * 14 - age * 0.8, 18, 55),
      coolant_temp_c: clamp(84 + age + wear * 12, 75, 120),
      fuel_level_percent: 55,
      fuel_consumption_lph: diesel ? 9 + wear * 3 : 7 + wear * 4,
      engine_load_percent: clamp(35 + wear * 25, 20, 85),
      throttle_pos_percent: 30,
      air_flow_rate_gps: 20,
      exhaust_gas_temp_c: clamp(380 + wear * 90 + (diesel ? 20 : 0), 320, 620),
      vibration_level: clamp(1.2 + wear * 3.5 + age * 0.15, 0.5, 8),
      engine_hours: Math.round(mileage / 38 + age * 180),
      brake_fluid_level_psi: clamp(980 - wear * 180, 650, 1100),
      brake_pad_wear_mm: clamp(11 - wear * 8 - age * 0.35, 1.2, 12),
      brake_temp_c: clamp(70 + wear * 35, 50, 160),
      abs_fault_indicator: wear > 0.82 ? 1 : 0,
      brake_pedal_pos_percent: 10,
      wheel_speed_fl_kph: 60,
      wheel_speed_fr_kph: 60,
      wheel_speed_rl_kph: 60,
      wheel_speed_rr_kph: 60,
      battery_voltage_v: clamp(13.8 - wear * 2.4 - age * 0.12, 9.8, 14.2),
      battery_current_a: 5,
      battery_temp_c: 30,
      alternator_output_v: clamp(14.2 - wear * 1.1, 11.5, 14.6),
      battery_charge_percent: clamp(92 - wear * 35 - age * 2, 35, 98),
      battery_health_percent: clamp(96 - wear * 40 - age * 3, 28, 99),
      vehicle_speed_kph: 60,
      ambient_temp_c: 28,
      humidity_percent: 70
    };

    // Keep group defaults as a safety net for any missing keys.
    GROUPS.forEach(function (group) {
      group.fields.forEach(function (field) {
        if (values[field[0]] === undefined) values[field[0]] = field[2];
      });
    });
    return values;
  }

  function predict(attributes) {
    var payload = Object.assign({}, attributes);
    if (payload.brand) payload.brand = resolveBrand(payload.brand);

    var controller = new AbortController();
    var timeout = setTimeout(function () {
      controller.abort();
    }, 10000);

    return fetch(API_BASE + "/predict/failure_imminent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attributes: payload }),
      signal: controller.signal
    })
      .then(function (response) {
        return response
          .json()
          .catch(function () {
            return {};
          })
          .then(function (data) {
            if (!response.ok) {
              var detail = data.detail;
              if (Array.isArray(detail)) {
                detail = detail
                  .map(function (item) {
                    return item.msg || JSON.stringify(item);
                  })
                  .join("; ");
              }
              throw new Error(detail || "ML API returned " + response.status + ".");
            }
            return data;
          });
      })
      .catch(function (error) {
        if (error.name === "AbortError") {
          throw new Error("The ML API did not respond. Make sure start-ml-api.bat is running.");
        }
        if (error instanceof TypeError) {
          throw new Error("Cannot reach the ML API at " + API_BASE + ". Start start-ml-api.bat first.");
        }
        throw error;
      })
      .then(
        function (data) {
          clearTimeout(timeout);
          return data;
        },
        function (error) {
          clearTimeout(timeout);
          throw error;
        }
      );
  }

  NS.ml = {
    API_BASE: API_BASE,
    GROUPS: GROUPS,
    KNOWN_BRANDS: KNOWN_BRANDS,
    BRAND_ALIASES: BRAND_ALIASES,
    defaultTelemetry: defaultTelemetry,
    resolveBrand: resolveBrand,
    supportsBrand: supportsBrand,
    predict: predict
  };
})(window);
