(function (global) {
  "use strict";

  var NS = (global.iDrive = global.iDrive || {});

  function localDateTime(value) {
    var date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) date = new Date();
    var offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
  }

  function riskMeta(prediction) {
    if (!prediction || prediction.probability === null || prediction.probability === undefined) {
      return { label: "Not assessed", tone: "unknown", percent: "—", value: null };
    }
    var percent = Math.round(prediction.probability * 100);
    if (prediction.needsMaintenance || prediction.probability >= 0.5) {
      return { label: "High risk", tone: "high", percent: percent + "%", value: percent };
    }
    if (prediction.probability >= 0.25) {
      return { label: "Monitor", tone: "mid", percent: percent + "%", value: percent };
    }
    return { label: "Low risk", tone: "low", percent: percent + "%", value: percent };
  }

  function adminPredictiveMaintenance() {
    if (NS.admin && NS.admin.mountNav) NS.admin.mountNav();
    var selectedId = "";
    var form = document.getElementById("ml-form");
    var panel = document.getElementById("ml-panel");
    var empty = document.getElementById("ml-empty");
    var fleetHost = document.getElementById("ml-fleet-list");
    var fieldsHost = document.getElementById("ml-sensor-fields");
    var resultHost = document.getElementById("ml-result");
    var summaryHost = document.getElementById("ml-summary");
    var apiState = document.getElementById("ml-api-state");
    var predictBtn = document.getElementById("ml-predict-btn");
    var brandWarning = document.getElementById("ml-brand-warning");
    var nearList = document.getElementById("ml-near-list");
    var nearCount = document.getElementById("ml-near-count");
    var thresholdInput = document.getElementById("ml-threshold");
    var engineInput = document.getElementById("ml-engine");
    var batteryInput = document.getElementById("ml-battery");
    var brakeInput = document.getElementById("ml-brake");
    var scoreBtn = document.getElementById("ml-score-fleet");
    var isAdmin = NS.auth.hasRole("admin");
    var barChart = null;
    var donutChart = null;
    var rankedIds = [];

    function threshold() {
      return Number(thresholdInput.value) || 35;
    }

    function scenarioPatch() {
      return {
        engine_temp_c: Number(engineInput.value),
        battery_voltage_v: Number(batteryInput.value),
        brake_pad_wear_mm: Number(brakeInput.value)
      };
    }

    function syncSliderLabels() {
      document.getElementById("ml-threshold-label").textContent = threshold() + "%";
      document.getElementById("ml-engine-label").textContent = engineInput.value;
      document.getElementById("ml-battery-label").textContent = Number(batteryInput.value).toFixed(1);
      document.getElementById("ml-brake-label").textContent = brakeInput.value;
    }

    function renderSensorFields() {
      fieldsHost.innerHTML = NS.ml.GROUPS.map(function (group) {
        return (
          '<details class="ml-sensor-group"><summary>' +
          NS.security.escapeHtml(group.title) +
          '</summary><div class="ml-fields">' +
          group.fields
            .map(function (field) {
              return (
                '<label class="field">' +
                NS.security.escapeHtml(field[1]) +
                '<span class="input-unit"><input class="form-control" type="number" step="any" name="' +
                NS.security.escapeHtml(field[0]) +
                '" required><em>' +
                NS.security.escapeHtml(field[3]) +
                "</em></span></label>"
              );
            })
            .join("") +
          "</div></details>"
        );
      }).join("");
    }

    function readPrediction(vehicleId) {
      try {
        return NS.domain.predictionForVehicle(vehicleId);
      } catch (e) {
        return null;
      }
    }

    function scoredRows() {
      return NS.domain
        .vehicles()
        .map(function (vehicle) {
          var prediction = readPrediction(vehicle.id);
          var meta = riskMeta(prediction);
          return {
            vehicle: vehicle,
            prediction: prediction,
            meta: meta,
            score: meta.value === null ? -1 : meta.value
          };
        })
        .sort(function (a, b) {
          return b.score - a.score;
        });
    }

    function renderSummary() {
      var rows = scoredRows();
      var assessed = 0;
      var high = 0;
      var monitor = 0;
      var near = 0;
      var cut = threshold();
      rows.forEach(function (row) {
        if (row.score < 0) return;
        assessed++;
        if (row.score >= cut) near++;
        if (row.meta.tone === "high") high++;
        else if (row.meta.tone === "mid") monitor++;
      });
      summaryHost.innerHTML =
        '<div class="stat"><span>' +
        rows.length +
        "</span>fleet vehicles</div>" +
        '<div class="stat"><span>' +
        assessed +
        "</span>assessed</div>" +
        '<div class="stat"><span>' +
        near +
        "</span>near repair</div>" +
        '<div class="stat"><span>' +
        high +
        "</span>high risk</div>";
    }

    function colorForScore(score, cut) {
      if (score < 0) return "rgba(148, 163, 184, 0.55)";
      if (score >= Math.max(cut, 50)) return "rgba(185, 28, 28, 0.85)";
      if (score >= cut) return "rgba(194, 65, 12, 0.85)";
      if (score >= 25) return "rgba(202, 138, 4, 0.8)";
      return "rgba(22, 163, 74, 0.8)";
    }

    function renderCharts() {
      if (typeof Chart === "undefined") return;
      var rows = scoredRows();
      rankedIds = rows.map(function (row) {
        return row.vehicle.id;
      });
      var labels = rows.map(function (row) {
        return row.vehicle.name.replace(/^Toyota |^Honda |^Ford |^Mitsubishi /, "");
      });
      var values = rows.map(function (row) {
        return row.score < 0 ? 0 : row.score;
      });
      var colors = rows.map(function (row) {
        return colorForScore(row.score, threshold());
      });
      var cut = threshold();
      var mix = { near: 0, watch: 0, ok: 0, none: 0 };
      rows.forEach(function (row) {
        if (row.score < 0) mix.none++;
        else if (row.score >= cut) mix.near++;
        else if (row.score >= 25) mix.watch++;
        else mix.ok++;
      });

      if (barChart) barChart.destroy();
      barChart = new Chart(document.getElementById("ml-bar-chart"), {
        type: "bar",
        data: {
          labels: labels,
          datasets: [
            {
              label: "Repair risk %",
              data: values,
              backgroundColor: colors,
              borderRadius: 8,
              maxBarThickness: 28
            }
          ]
        },
        options: {
          indexAxis: "y",
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: function (ctx) {
                  var row = rows[ctx.dataIndex];
                  if (!row || row.score < 0) return "Not assessed yet";
                  return row.meta.label + " · " + row.meta.percent;
                }
              }
            }
          },
          scales: {
            x: {
              min: 0,
              max: 100,
              ticks: { callback: function (v) { return v + "%"; } },
              grid: { color: "rgba(120, 66, 245, 0.08)" }
            },
            y: { grid: { display: false } }
          },
          onClick: function (_event, elements) {
            if (!elements.length) return;
            selectVehicle(rankedIds[elements[0].index]);
          }
        }
      });

      if (donutChart) donutChart.destroy();
      donutChart = new Chart(document.getElementById("ml-donut-chart"), {
        type: "doughnut",
        data: {
          labels: ["Near repair", "Watch", "Healthy", "Not assessed"],
          datasets: [
            {
              data: [mix.near, mix.watch, mix.ok, mix.none],
              backgroundColor: [
                "rgba(185, 28, 28, 0.85)",
                "rgba(202, 138, 4, 0.8)",
                "rgba(22, 163, 74, 0.8)",
                "rgba(148, 163, 184, 0.55)"
              ],
              borderWidth: 0
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: "bottom" }
          },
          cutout: "62%"
        }
      });

      renderNearList(rows);
      renderSummary();
    }

    function renderNearList(rows) {
      var cut = threshold();
      var near = rows.filter(function (row) {
        return row.score >= cut;
      });
      nearCount.textContent = near.length
        ? near.length + " car(s) at or above " + cut + "% risk"
        : "No cars currently at or above the " + cut + "% threshold.";
      nearList.innerHTML = near.length
        ? near
            .map(function (row, index) {
              return (
                '<button class="ml-near-item" type="button" data-vehicle="' +
                row.vehicle.id +
                '"><span class="ml-near-rank">#' +
                (index + 1) +
                "</span><span class=\"ml-fleet-copy\"><strong>" +
                NS.security.escapeHtml(row.vehicle.name) +
                "</strong><small>" +
                NS.security.escapeHtml(row.vehicle.plate) +
                " · " +
                NS.security.escapeHtml(row.meta.label) +
                '</small></span><span class="ml-risk ml-risk-' +
                row.meta.tone +
                '"><strong>' +
                row.meta.percent +
                "</strong><small>risk</small></span></button>"
              );
            })
            .join("")
        : '<p class="notice">Score the fleet or lower the threshold to see cars nearest to repair.</p>';
    }

    function placePanel() {
      if (!selectedId) {
        panel.hidden = true;
        empty.hidden = false;
        return;
      }
      var row = fleetHost.querySelector('[data-row="' + selectedId + '"]');
      if (!row) {
        panel.hidden = true;
        return;
      }
      row.appendChild(panel);
      panel.hidden = false;
      empty.hidden = true;
    }

    function renderFleet() {
      if (panel.parentElement === fleetHost || fleetHost.contains(panel)) {
        document.body.appendChild(panel);
        panel.hidden = true;
      }
      var vehicles = NS.domain.vehicles();
      fleetHost.innerHTML = vehicles
        .map(function (vehicle) {
          var meta = riskMeta(readPrediction(vehicle.id));
          var unsupported = !NS.ml.supportsBrand(vehicle.brand);
          return (
            '<div class="ml-fleet-row' +
            (vehicle.id === selectedId ? " is-open" : "") +
            '" data-row="' +
            vehicle.id +
            '">' +
            '<button class="ml-fleet-item' +
            (vehicle.id === selectedId ? " active" : "") +
            '" type="button" data-vehicle="' +
            vehicle.id +
            '">' +
            (vehicle.image
              ? '<img src="' + NS.security.escapeHtml(vehicle.image) + '" alt="">'
              : '<span class="ml-car-placeholder">Car</span>') +
            '<span class="ml-fleet-copy"><strong>' +
            NS.security.escapeHtml(vehicle.name) +
            "</strong><small>" +
            NS.security.escapeHtml(vehicle.plate) +
            (unsupported ? " · unsupported brand" : "") +
            '</small></span><span class="ml-risk ml-risk-' +
            meta.tone +
            '"><strong>' +
            meta.percent +
            "</strong><small>" +
            meta.label +
            "</small></span></button></div>"
          );
        })
        .join("");
      placePanel();
      renderCharts();
    }

    function valuesFor(vehicle) {
      var defaults = NS.ml.defaultTelemetry(vehicle);
      var saved = NS.domain.telemetryForVehicle(vehicle.id);
      if (saved && saved.attributes) {
        Object.keys(saved.attributes).forEach(function (key) {
          defaults[key] = saved.attributes[key];
        });
      }
      defaults.brand = vehicle.brand;
      defaults.timestamp = localDateTime(defaults.timestamp);
      defaults.odometer_reading = saved
        ? defaults.odometer_reading
        : Number(vehicle.mileage) || defaults.odometer_reading;
      return defaults;
    }

    function setFormValues(values) {
      Object.keys(values).forEach(function (name) {
        if (form.elements[name]) form.elements[name].value = values[name];
      });
    }

    function renderCurrentRisk(vehicleId) {
      var prediction = readPrediction(vehicleId);
      var meta = riskMeta(prediction);
      document.getElementById("ml-current-risk").innerHTML =
        '<span class="ml-risk ml-risk-' +
        meta.tone +
        '"><strong>' +
        meta.percent +
        "</strong><small>" +
        meta.label +
        "</small></span>";
      if (prediction) renderResult(prediction, false);
      else {
        resultHost.hidden = true;
        resultHost.innerHTML = "";
      }
    }

    function closePanel() {
      selectedId = "";
      resultHost.hidden = true;
      resultHost.innerHTML = "";
      renderFleet();
    }

    function selectVehicle(vehicleId) {
      if (vehicleId === selectedId) {
        closePanel();
        return;
      }
      var vehicle = NS.domain.getVehicle(vehicleId);
      if (!vehicle) return;
      selectedId = vehicleId;
      document.getElementById("ml-vehicle-name").textContent = vehicle.name;
      document.getElementById("ml-vehicle-meta").textContent =
        vehicle.plate +
        " · " +
        vehicle.type +
        " · " +
        (vehicle.mileage || 0).toLocaleString() +
        " km";
      setFormValues(valuesFor(vehicle));

      var supported = NS.ml.supportsBrand(vehicle.brand);
      brandWarning.hidden = supported;
      brandWarning.textContent = supported
        ? ""
        : vehicle.brand +
          " is not represented in the trained model. Choose a supported fleet vehicle or retrain the model with this brand.";
      predictBtn.disabled = !supported;
      renderFleet();
      renderCurrentRisk(vehicleId);
      var row = fleetHost.querySelector('[data-row="' + vehicleId + '"]');
      if (row) row.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    function formAttributes() {
      var attributes = {};
      Array.prototype.forEach.call(form.elements, function (input) {
        if (!input.name || input.type === "submit") return;
        if (input.name === "brand" || input.name === "timestamp") {
          attributes[input.name] = input.value;
        } else {
          var value = Number(input.value);
          if (!Number.isFinite(value)) throw new Error(input.name + " must be numeric.");
          attributes[input.name] = value;
        }
      });
      return attributes;
    }

    function renderResult(prediction, fresh) {
      var vehicle = NS.domain.getVehicle(prediction.vehicleId || selectedId);
      var meta = riskMeta(prediction);
      resultHost.hidden = false;
      resultHost.className = "ml-result ml-result-" + meta.tone;
      resultHost.innerHTML =
        "<div><p class=\"eyebrow\">" +
        (fresh ? "New ML result" : "Latest saved result") +
        "</p><h2>" +
        meta.label +
        " · " +
        meta.percent +
        "</h2><p>Random Forest result for " +
        NS.security.escapeHtml(vehicle ? vehicle.name : "") +
        ". " +
        (prediction.needsMaintenance
          ? "The model flags an imminent maintenance risk."
          : "The model does not currently flag imminent maintenance.") +
        "</p><small>Assessed " +
        NS.ui.fmtDate(prediction.predictedAt) +
        "</small></div>" +
        (isAdmin && prediction.needsMaintenance
          ? '<button class="btn btn-dark" type="button" id="ml-schedule-btn">Schedule maintenance</button>'
          : "");

      var schedule = document.getElementById("ml-schedule-btn");
      if (schedule) {
        schedule.addEventListener("click", function () {
          var tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          try {
            NS.domain.saveMaintenance(
              {
                vehicleId: selectedId,
                maintenanceType: "Predictive maintenance inspection",
                scheduledDate: tomorrow.toISOString().slice(0, 10),
                notes: "ML failure-imminent risk: " + meta.percent,
                finished: false
              },
              NS.security.getCsrf()
            );
            NS.ui.toast("Maintenance inspection scheduled.", "ok");
            schedule.disabled = true;
            schedule.textContent = "Scheduled";
          } catch (error) {
            NS.ui.toast(error.message, "err");
          }
        });
      }
    }

    function checkApi() {
      apiState.textContent = "Checking ML API…";
      apiState.className = "ml-api-state";
      return fetch(NS.ml.API_BASE + "/")
        .then(function (response) {
          if (!response.ok) throw new Error("offline");
          return response.json();
        })
        .then(function () {
          apiState.textContent = "ML API online";
          apiState.className = "ml-api-state is-online";
          return true;
        })
        .catch(function () {
          apiState.textContent = "ML API offline · start start-ml-api.bat";
          apiState.className = "ml-api-state is-offline";
          return false;
        });
    }

    function scoreFleet() {
      var patch = scenarioPatch();
      var targets = NS.domain.vehicles().filter(function (vehicle) {
        return NS.ml.supportsBrand(vehicle.brand);
      });
      if (!targets.length) {
        NS.ui.toast("No supported brands available to score.", "err");
        return;
      }
      scoreBtn.disabled = true;
      scoreBtn.textContent = "Scoring…";
      var chain = Promise.resolve();
      var done = 0;
      targets.forEach(function (vehicle) {
        chain = chain.then(function () {
          var attributes = valuesFor(vehicle);
          Object.keys(patch).forEach(function (key) {
            attributes[key] = patch[key];
          });
          attributes.timestamp = new Date().toISOString();
          return NS.ml.predict(attributes).then(function (response) {
            NS.domain.saveMaintenancePrediction(
              vehicle.id,
              attributes,
              response,
              NS.security.getCsrf()
            );
            done++;
            scoreBtn.textContent = "Scoring " + done + "/" + targets.length;
          });
        });
      });
      chain
        .then(function () {
          renderFleet();
          if (selectedId) renderCurrentRisk(selectedId);
          NS.ui.toast("Fleet scored with current scenario settings.", "ok");
        })
        .catch(function (error) {
          NS.ui.toast(error.message, "err");
          checkApi();
        })
        .then(function () {
          scoreBtn.disabled = false;
          scoreBtn.textContent = "Score whole fleet";
        });
    }

    fleetHost.addEventListener("click", function (event) {
      var button = event.target.closest("[data-vehicle]");
      if (button) selectVehicle(button.getAttribute("data-vehicle"));
    });

    nearList.addEventListener("click", function (event) {
      var button = event.target.closest("[data-vehicle]");
      if (button) selectVehicle(button.getAttribute("data-vehicle"));
    });

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      if (!selectedId) return;
      predictBtn.disabled = true;
      predictBtn.textContent = "Running model…";
      var attributes;
      try {
        attributes = formAttributes();
      } catch (error) {
        NS.ui.toast(error.message, "err");
        predictBtn.disabled = false;
        predictBtn.textContent = "Run ML prediction";
        return;
      }
      NS.ml
        .predict(attributes)
        .then(function (response) {
          var saved = NS.domain.saveMaintenancePrediction(
            selectedId,
            attributes,
            response,
            NS.security.getCsrf()
          );
          renderFleet();
          renderCurrentRisk(selectedId);
          renderResult(saved, true);
          NS.ui.toast("Prediction saved for this vehicle.", "ok");
        })
        .catch(function (error) {
          NS.ui.toast(error.message, "err");
          checkApi();
        })
        .then(function () {
          var vehicle = NS.domain.getVehicle(selectedId);
          predictBtn.disabled = !(vehicle && NS.ml.supportsBrand(vehicle.brand));
          predictBtn.textContent = "Run ML prediction";
        });
    });

    document.getElementById("ml-reset-btn").addEventListener("click", function () {
      var vehicle = NS.domain.getVehicle(selectedId);
      if (vehicle) {
        setFormValues(
          (function () {
            var values = NS.ml.defaultTelemetry(vehicle);
            values.timestamp = localDateTime(values.timestamp);
            return values;
          })()
        );
      }
    });

    document.getElementById("ml-close-btn").addEventListener("click", closePanel);
    document.getElementById("ml-refresh").addEventListener("click", function () {
      renderFleet();
      checkApi();
    });
    scoreBtn.addEventListener("click", scoreFleet);

    [thresholdInput, engineInput, batteryInput, brakeInput].forEach(function (input) {
      input.addEventListener("input", function () {
        syncSliderLabels();
        if (input === thresholdInput) renderCharts();
      });
    });

    syncSliderLabels();
    renderSensorFields();
    renderFleet();
    checkApi();
  }

  NS.pages.adminPredictiveMaintenance = adminPredictiveMaintenance;
})(window);
