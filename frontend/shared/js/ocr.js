/**
 * Optional in-browser OCR for ID / driver's license photos.
 *
 * Uses Tesseract.js (loaded lazily from CDN the first time it is needed) to read
 * text from an uploaded ID image, then applies light regex heuristics to pull out
 * common fields: full name, address, birthdate, ID/licence number, and expiry date.
 *
 * This is best-effort only. Users must always be able to review and edit every
 * field, and registration / booking must still work without it.
 */
(function (global) {
  "use strict";

  var NS = (global.iDrive = global.iDrive || {});

  var TESSERACT_URL = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
  var loaderPromise = null;

  function loadTesseract() {
    if (global.Tesseract) return Promise.resolve(global.Tesseract);
    if (loaderPromise) return loaderPromise;
    loaderPromise = new Promise(function (resolve, reject) {
      var script = document.createElement("script");
      script.src = TESSERACT_URL;
      script.async = true;
      script.onload = function () {
        if (global.Tesseract) resolve(global.Tesseract);
        else reject(new Error("OCR engine failed to initialise."));
      };
      script.onerror = function () {
        loaderPromise = null;
        reject(new Error("Could not load the OCR engine. Check your internet connection or fill the fields manually."));
      };
      document.head.appendChild(script);
    });
    return loaderPromise;
  }

  /**
   * Runs OCR on an image (data URL, blob, or File) and resolves to the raw text.
   * @param {string|Blob|File} image
   * @param {function(number):void} [onProgress] 0..1 progress callback
   */
  function readImage(image, onProgress) {
    return loadTesseract().then(function (Tesseract) {
      return Tesseract.recognize(image, "eng", {
        logger: function (m) {
          if (onProgress && m && m.status === "recognizing text") {
            onProgress(Number(m.progress) || 0);
          }
        }
      }).then(function (result) {
        var data = (result && result.data) || {};
        return {
          text: data.text || "",
          words: data.words || [],
          meanConfidence: Number(data.confidence) || 0
        };
      });
    });
  }

  function loadImageElement(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      var blobUrl = "";
      img.onload = function () {
        if (blobUrl) URL.revokeObjectURL(blobUrl);
        resolve(img);
      };
      img.onerror = function () {
        if (blobUrl) URL.revokeObjectURL(blobUrl);
        reject(new Error("That file is not a usable image."));
      };
      if (typeof Blob !== "undefined" && src instanceof Blob) {
        blobUrl = URL.createObjectURL(src);
        img.src = blobUrl;
      } else {
        img.src = src;
      }
    });
  }

  /**
   * Rejects photos that are too small, blurry, blown out, or clipped at the edges.
   * @param {string|Blob|File} src
   * @param {{profile?: "document"|"selfie"}} [options]
   */
  function assessQuality(src, options) {
    options = options || {};
    var selfie = options.profile === "selfie";
    return loadImageElement(src).then(function (img) {
      var width = img.naturalWidth || img.width;
      var height = img.naturalHeight || img.height;
      var issues = [];
      var minShort = selfie ? 320 : 480;
      if (Math.min(width, height) < minShort) {
        issues.push({
          code: "resolution",
          message: "This photo is too small. Move closer so the " + (selfie ? "face" : "ID") + " fills more of the frame."
        });
      }

      var sampleW = Math.min(width, 480);
      var sampleH = Math.max(1, Math.round(height * (sampleW / Math.max(1, width))));
      var canvas = document.createElement("canvas");
      canvas.width = sampleW;
      canvas.height = sampleH;
      var ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, sampleW, sampleH);
      var pixels = ctx.getImageData(0, 0, sampleW, sampleH).data;
      var gray = new Float32Array(sampleW * sampleH);
      var glare = 0;
      for (var i = 0, p = 0; i < gray.length; i++, p += 4) {
        gray[i] = 0.299 * pixels[p] + 0.587 * pixels[p + 1] + 0.114 * pixels[p + 2];
        var spread = Math.max(pixels[p], pixels[p + 1], pixels[p + 2]) - Math.min(pixels[p], pixels[p + 1], pixels[p + 2]);
        if (gray[i] >= 250 && spread < 8) glare++;
      }
      if (!selfie && glare / gray.length > 0.07) {
        issues.push({
          code: "glare",
          message: "Glare is washing out the ID. Tilt it away from the light and upload again."
        });
      }

      var lapSum = 0;
      var lapSq = 0;
      var n = 0;
      for (var y = 1; y < sampleH - 1; y++) {
        for (var x = 1; x < sampleW - 1; x++) {
          var idx = y * sampleW + x;
          var lap = 4 * gray[idx] - gray[idx - 1] - gray[idx + 1] - gray[idx - sampleW] - gray[idx + sampleW];
          lapSum += lap;
          lapSq += lap * lap;
          n++;
        }
      }
      var mean = lapSum / Math.max(1, n);
      var variance = lapSq / Math.max(1, n) - mean * mean;
      if (variance < (selfie ? 40 : 55)) {
        issues.push({
          code: "blur",
          message: "This photo looks blurry. Hold steady and upload a sharper picture."
        });
      }

      if (!selfie) {
        var hits = 0;
        var total = 0;
        function edgeEnergy(x, y) {
          if (x < 1 || y < 1 || x >= sampleW - 1 || y >= sampleH - 1) return 0;
          var at = y * sampleW + x;
          return Math.abs(gray[at] - gray[at - 1]) + Math.abs(gray[at] - gray[at + 1]);
        }
        for (var ex = 0; ex < sampleW; ex += 2) {
          total += 2;
          if (edgeEnergy(ex, 2) > 28) hits++;
          if (edgeEnergy(ex, sampleH - 3) > 28) hits++;
        }
        for (var ey = 0; ey < sampleH; ey += 2) {
          total += 2;
          if (edgeEnergy(2, ey) > 28) hits++;
          if (edgeEnergy(sampleW - 3, ey) > 28) hits++;
        }
        if (total && hits / total > 0.42) {
          issues.push({
            code: "cropped",
            message: "The edges of the ID look cut off. Leave a little space around the whole card and upload again."
          });
        }
      }

      return { ok: issues.length === 0, issues: issues, width: width, height: height };
    });
  }

  function cleanLine(line) {
    return String(line || "").replace(/\s+/g, " ").trim();
  }

  function toIsoDate(raw) {
    if (!raw) return "";
    var s = String(raw).trim();
    // YYYY-MM-DD or YYYY/MM/DD
    var m = s.match(/\b(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})\b/);
    if (m) {
      return m[1] + "-" + ("0" + m[2]).slice(-2) + "-" + ("0" + m[3]).slice(-2);
    }
    // DD/MM/YYYY or MM/DD/YYYY (assume DD/MM/YYYY, common on PH IDs)
    m = s.match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})\b/);
    if (m) {
      return m[3] + "-" + ("0" + m[2]).slice(-2) + "-" + ("0" + m[1]).slice(-2);
    }
    // Month name: "January 5, 1990" / "05 JAN 1990"
    var months = {
      jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
      jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12"
    };
    m = s.match(/\b(\d{1,2})\s+([A-Za-z]{3,})\.?\s+(\d{4})\b/);
    if (m && months[m[2].slice(0, 3).toLowerCase()]) {
      return m[3] + "-" + months[m[2].slice(0, 3).toLowerCase()] + "-" + ("0" + m[1]).slice(-2);
    }
    m = s.match(/\b([A-Za-z]{3,})\.?\s+(\d{1,2}),?\s+(\d{4})\b/);
    if (m && months[m[1].slice(0, 3).toLowerCase()]) {
      return m[3] + "-" + months[m[1].slice(0, 3).toLowerCase()] + "-" + ("0" + m[2]).slice(-2);
    }
    return "";
  }

  function findLabeledValue(lines, labels) {
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      for (var j = 0; j < labels.length; j++) {
        var re = new RegExp(labels[j] + "\\s*[:\\-]?\\s*(.+)", "i");
        var m = line.match(re);
        if (m && cleanLine(m[1])) return cleanLine(m[1]);
        // Label on its own line, value on the next line.
        if (new RegExp("^\\s*" + labels[j] + "\\s*[:\\-]?\\s*$", "i").test(line) && lines[i + 1]) {
          return cleanLine(lines[i + 1]);
        }
      }
    }
    return "";
  }

  /**
   * Extracts common ID fields from raw OCR text using heuristics.
   * @param {string} text
   * @returns {{fullName:string,address:string,birthdate:string,idNumber:string,expiry:string,issueDate:string,idType:string,licenseClass:string,restrictions:string,confidence:Object}}
   */
  function extractFields(text, words) {
    var lines = String(text || "")
      .split(/\r?\n/)
      .map(cleanLine)
      .filter(Boolean);

    var fullName = findLabeledValue(lines, [
      "full name", "name", "pangalan", "last name", "surname"
    ]);
    // If "last name" / "given name" are separate, try to combine.
    var last = findLabeledValue(lines, ["last name", "surname", "apelyido"]);
    var given = findLabeledValue(lines, ["given names?", "first name", "pangalan"]);
    var middle = findLabeledValue(lines, ["middle name"]);
    if (last && given) {
      fullName = cleanLine(given + " " + (middle ? middle + " " : "") + last);
    }

    var address = findLabeledValue(lines, ["address", "tirahan", "residence"]);

    var idNumber = findLabeledValue(lines, [
      "id no", "id number", "license no", "licence no", "lic no",
      "crn", "psn", "card no", "no\\."
    ]);
    if (!idNumber) {
      // Fallback: a token that looks like an ID (letters+digits, 6+ chars).
      for (var k = 0; k < lines.length; k++) {
        var tok = lines[k].match(/\b([A-Z0-9][A-Z0-9\-]{5,19})\b/);
        if (tok && /\d/.test(tok[1]) && /[A-Z0-9]/.test(tok[1])) {
          idNumber = tok[1];
          break;
        }
      }
    }

    var expiryRaw = findLabeledValue(lines, [
      "expiry", "expiration", "expires", "valid until", "date of expiry", "exp"
    ]);
    var expiry = toIsoDate(expiryRaw);

    var birthRaw = findLabeledValue(lines, [
      "date of birth", "birth date", "birthdate", "dob", "petsa ng kapanganakan"
    ]);
    var birthdate = toIsoDate(birthRaw);

    var issueRaw = findLabeledValue(lines, [
      "date of issue", "date issued", "issue date", "issued", "petsa ng pagkakaloob"
    ]);
    var issueDate = toIsoDate(issueRaw);

    var blob = String(text || "");
    var idType = "";
    var upper = blob.toUpperCase();
    if (/DRIVER|LAND TRANSPORTATION|\bLTO\b/.test(upper)) idType = "Driver's License";
    else if (/PHILSYS|NATIONAL ID|PAMBANSANG|PHILIPPINE IDENTIFICATION/.test(upper)) idType = "National ID";
    else if (/PASSPORT/.test(upper)) idType = "Passport";
    else if (/UMID|UNIFIED MULTI/.test(upper)) idType = "UMID";
    else if (/POSTAL ID|PHLPOST/.test(upper)) idType = "Postal ID";

    var licenseClass = findLabeledValue(lines, ["dl codes?", "license class", "classification"]);
    var classMatch = blob.match(/\b(?:DL\s*)?CODES?\s*[:\-]?\s*([A-Z0-9][A-Z0-9,\/\s]{0,18})/i);
    if (!licenseClass && classMatch) licenseClass = cleanLine(classMatch[1]);

    var restrictions = findLabeledValue(lines, ["restrictions?", "conditions", "restriction codes?"]);

    var fields = {
      fullName: fullName || "",
      address: address || "",
      birthdate: birthdate || "",
      idNumber: idNumber ? idNumber.toUpperCase().replace(/\s+/g, "") : "",
      expiry: expiry || "",
      issueDate: issueDate || "",
      idType: idType || "",
      licenseClass: licenseClass || "",
      restrictions: restrictions || "",
      rawText: blob
    };
    fields.confidence = confidenceMap(fields, words || []);
    return fields;
  }

  function confidenceMap(fields, words) {
    var keys = ["fullName", "address", "birthdate", "idNumber", "expiry", "issueDate", "idType", "licenseClass", "restrictions"];
    var out = {};
    keys.forEach(function (key) {
      out[key] = confidenceFor(fields[key], words, key === "idType" ? 0.72 : 0.45);
    });
    return out;
  }

  function confidenceFor(value, words, fallback) {
    if (!value) return 0;
    if (!words || !words.length) return fallback;
    var tokens = String(value).toUpperCase().split(/[^A-Z0-9]+/).filter(function (token) {
      return token.length > 1;
    });
    var scores = [];
    tokens.forEach(function (token) {
      for (var i = 0; i < words.length; i++) {
        var word = String(words[i].text || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
        if (word && (word.indexOf(token) !== -1 || token.indexOf(word) !== -1)) {
          scores.push((Number(words[i].confidence) || 0) / 100);
          break;
        }
      }
    });
    if (!scores.length) return fallback;
    var sum = scores.reduce(function (total, score) { return total + score; }, 0);
    return Math.max(0, Math.min(0.99, Math.round((sum / scores.length) * 100) / 100));
  }

  /**
   * Convenience: OCR an image and return the extracted fields in one call.
   * `readImage` may return a string (older callers) or `{text, words}`.
   */
  function scan(image, onProgress) {
    return readImage(image, onProgress).then(function (raw) {
      var text = typeof raw === "string" ? raw : (raw && raw.text) || "";
      var words = raw && raw.words ? raw.words : [];
      return extractFields(text, words);
    });
  }

  NS.ocr = {
    isConfigured: true,
    LOW_CONFIDENCE: 0.62,
    readImage: readImage,
    extractFields: extractFields,
    assessQuality: assessQuality,
    scan: scan
  };
})(window);
