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
        return (result && result.data && result.data.text) || "";
      });
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
   * @returns {{fullName:string,address:string,birthdate:string,idNumber:string,expiry:string}}
   */
  function extractFields(text) {
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

    return {
      fullName: fullName || "",
      address: address || "",
      birthdate: birthdate || "",
      idNumber: idNumber ? idNumber.toUpperCase().replace(/\s+/g, "") : "",
      expiry: expiry || "",
      rawText: String(text || "")
    };
  }

  /**
   * Convenience: OCR an image and return the extracted fields in one call.
   */
  function scan(image, onProgress) {
    return readImage(image, onProgress).then(extractFields);
  }

  NS.ocr = {
    isConfigured: true,
    readImage: readImage,
    extractFields: extractFields,
    scan: scan
  };
})(window);
