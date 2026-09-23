(function (global) {
  "use strict";

  var NS = (global.iDrive = global.iDrive || {});
  var API_BASE = "http://127.0.0.1:8000";
  var KNOWN_BRANDS = [
    "Audi", "BMW", "Chevrolet", "Ford", "Honda",
    "Hyundai", "Kia", "Mercedes-Benz", "Nissan", "Toyota"
  ];

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

  function defaultTelemetry(vehicle) {
    var values = {
      brand: vehicle.brand,
      timestamp: new Date().toISOString(),
      odometer_reading: Number(vehicle.mileage) || 50000
    };
    GROUPS.forEach(function (group) {
      group.fields.forEach(function (field) {
        values[field[0]] = field[2];
      });
    });
    return values;
  }

  function predict(attributes) {
    var controller = new AbortController();
    var timeout = setTimeout(function () {
      controller.abort();
    }, 10000);

    return fetch(API_BASE + "/predict/failure_imminent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attributes: attributes }),
      signal: controller.signal
    })
      .then(function (response) {
        return response.json().catch(function () {
          return {};
        }).then(function (data) {
          if (!response.ok) {
            throw new Error(data.detail || "ML API returned " + response.status + ".");
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
    defaultTelemetry: defaultTelemetry,
    supportsBrand: function (brand) {
      return KNOWN_BRANDS.indexOf(brand) !== -1;
    },
    predict: predict
  };
})(window);
