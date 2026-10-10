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

  var workerPromise = null;
  var progressSink = null;

  /* One reusable worker: creating one per photo re-downloads the language data. */
  function getWorker() {
    if (workerPromise) return workerPromise;
    workerPromise = loadTesseract()
      .then(function (Tesseract) {
        return Tesseract.createWorker("eng", 1, {
          logger: function (m) {
            if (progressSink && m && m.status === "recognizing text") progressSink(Number(m.progress) || 0);
          }
        });
      })
      .then(function (worker) {
        return worker.setParameters({ preserve_interword_spaces: "1", user_defined_dpi: "300" }).then(function () {
          return worker;
        });
      })
      .catch(function (err) {
        workerPromise = null;
        throw err;
      });
    return workerPromise;
  }

  /**
   * Scales the photo to a size Tesseract reads well, rotates it, converts to grayscale and
   * stretches the contrast so faded print and colored card backgrounds do not swallow the text.
   */
  function preprocess(src, rotation) {
    return loadImageElement(src).then(function (img) {
      var w = img.naturalWidth || img.width;
      var h = img.naturalHeight || img.height;
      var scale = Math.min(3, Math.max(1, 1800 / Math.max(w, h)));
      if (Math.max(w, h) * scale > 2600) scale = 2600 / Math.max(w, h);
      var sw = Math.round(w * scale);
      var sh = Math.round(h * scale);
      var turned = rotation === 90 || rotation === 270;
      var canvas = document.createElement("canvas");
      canvas.width = turned ? sh : sw;
      canvas.height = turned ? sw : sh;
      var ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.imageSmoothingQuality = "high";
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(((rotation || 0) * Math.PI) / 180);
      ctx.drawImage(img, -sw / 2, -sh / 2, sw, sh);

      var image = ctx.getImageData(0, 0, canvas.width, canvas.height);
      var px = image.data;
      var hist = new Uint32Array(256);
      var gray = new Uint8ClampedArray(px.length / 4);
      for (var i = 0, p = 0; i < gray.length; i++, p += 4) {
        /* Min channel keeps dark text dark on the pink/blue LTO security background. */
        var lum = 0.299 * px[p] + 0.587 * px[p + 1] + 0.114 * px[p + 2];
        var v = Math.round(0.6 * lum + 0.4 * Math.min(px[p], px[p + 1], px[p + 2]));
        gray[i] = v;
        hist[v]++;
      }
      var lowCut = gray.length * 0.02;
      var highCut = gray.length * 0.98;
      var acc = 0;
      var lo = 0;
      var hi = 255;
      for (var b = 0; b < 256; b++) {
        acc += hist[b];
        if (acc <= lowCut) lo = b;
        if (acc <= highCut) hi = b;
      }
      var range = Math.max(32, hi - lo);
      for (var j = 0, q = 0; j < gray.length; j++, q += 4) {
        var s = ((gray[j] - lo) * 255) / range;
        s = s < 0 ? 0 : s > 255 ? 255 : s;
        px[q] = px[q + 1] = px[q + 2] = s;
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.putImageData(image, 0, 0);
      return canvas;
    });
  }

  function linesFrom(data) {
    var lines = [];
    (data.lines || []).forEach(function (line) {
      var text = cleanLine(line.text);
      if (text) lines.push({ text: text, conf: (Number(line.confidence) || 0) / 100 });
    });
    if (!lines.length) {
      String(data.text || "")
        .split(/\r?\n/)
        .map(cleanLine)
        .filter(Boolean)
        .forEach(function (text) {
          lines.push({ text: text, conf: (Number(data.confidence) || 0) / 100 });
        });
    }
    return lines;
  }

  /**
   * Runs OCR on an image (data URL, blob, or File) after preprocessing.
   * @param {string|Blob|File} image
   * @param {function(number):void} [onProgress] 0..1 progress callback
   * @param {number} [rotation] degrees clockwise: 0, 90, 180, 270
   */
  function readImage(image, onProgress, rotation) {
    return Promise.all([getWorker(), preprocess(image, rotation || 0)]).then(function (both) {
      progressSink = onProgress || null;
      return both[0].recognize(both[1]).then(function (result) {
        progressSink = null;
        var data = (result && result.data) || {};
        return {
          text: data.text || "",
          words: data.words || [],
          lines: linesFrom(data),
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

  /* ---------- Philippine LTO driver's license ---------- */

  var DIGIT_FIX = { O: "0", Q: "0", D: "0", I: "1", L: "1", "|": "1", Z: "2", S: "5", B: "8", G: "6", T: "7" };

  function fixDigits(s) {
    return String(s).replace(/[OQDIL|ZSBGT]/g, function (c) {
      return DIGIT_FIX[c];
    });
  }

  function realDate(y, m, d) {
    var dt = new Date(Date.UTC(+y, +m - 1, +d));
    return dt.getUTCFullYear() === +y && dt.getUTCMonth() === +m - 1 && dt.getUTCDate() === +d;
  }

  /* Dates on LTO cards print as YYYY/MM/DD; OCR often turns 0 into O and 1 into I. */
  function datesIn(text) {
    var out = [];
    var re = /([0-9OIlSB]{4})\s*[\/\-.]\s*([0-9OIlSB]{2})\s*[\/\-.]\s*([0-9OIlSB]{2})/g;
    var m;
    while ((m = re.exec(String(text).toUpperCase()))) {
      var y = fixDigits(m[1]);
      var mo = fixDigits(m[2]);
      var d = fixDigits(m[3]);
      if (/^\d{4}$/.test(y) && /^\d{2}$/.test(mo) && /^\d{2}$/.test(d) && +y > 1900 && +y < 2100 && realDate(y, mo, d)) {
        out.push(y + "-" + mo + "-" + d);
      }
    }
    return out;
  }

  /* License numbers look like N04-12-345678: one letter, then 2-2-6 digits. */
  function licenseNoIn(text) {
    var re = /\b([A-Z])\s*([0-9OQDILSBZGT]{2})\s*[-–—.~ ]?\s*([0-9OQDILSBZGT]{2})\s*[-–—.~ ]?\s*([0-9OQDILSBZGT]{6})\b/;
    var m = String(text).toUpperCase().match(re);
    if (!m) return "";
    var parts = [fixDigits(m[2]), fixDigits(m[3]), fixDigits(m[4])];
    if (!/^\d{2}$/.test(parts[0]) || !/^\d{2}$/.test(parts[1]) || !/^\d{6}$/.test(parts[2])) return "";
    return m[1] + parts[0] + "-" + parts[1] + "-" + parts[2];
  }

  function titleCase(s) {
    return String(s)
      .toLowerCase()
      .replace(/(^|[\s\-'.,(])([a-zñ])/g, function (all, pre, ch) {
        return pre + ch.toUpperCase();
      })
      .replace(/\b(Dela|De|Del|Delos|Los|Las|Y|Van|Von)\b/g, function (w, word, offset) {
        return offset === 0 ? w : w.toLowerCase();
      });
  }

  function labelIndex(lines, re, from) {
    for (var i = from || 0; i < lines.length; i++) if (re.test(lines[i].text.toUpperCase())) return i;
    return -1;
  }

  function field(value, conf, anchored) {
    if (!value) return { value: "", conf: 0 };
    return { value: value, conf: Math.max(0, Math.min(0.99, conf * (anchored ? 1 : 0.85))) };
  }

  /* "DELA CRUZ, JUAN PEDRO" -> "Juan Pedro dela Cruz" */
  function ltoName(raw) {
    var s = String(raw || "")
      .toUpperCase()
      .replace(/[^A-ZÑ,.\-' ]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!/[A-Z]{2}/.test(s) || /LAST NAME|FIRST NAME|MIDDLE|NATIONALITY|REPUBLIC|LICENSE/.test(s)) return "";
    var comma = s.indexOf(",");
    var ordered = comma > 0 ? s.slice(comma + 1).replace(/,/g, " ").trim() + " " + s.slice(0, comma).trim() : s.replace(/,/g, " ");
    ordered = ordered.replace(/\s+/g, " ").trim();
    if (ordered.split(" ").length < 2 || ordered.length < 5) return "";
    return titleCase(ordered);
  }

  function withParts(f, given, middle, last) {
    if (f && f.value) f.parts = { given: titleCase(given || ""), middle: titleCase(middle || ""), last: titleCase(last || "") };
    return f;
  }

  /* "DELA CRUZ, JUAN PEDRO" -> given "Juan Pedro", last "Dela Cruz" */
  function commaParts(raw) {
    var s = String(raw || "").toUpperCase().replace(/[^A-ZÑ,.\-' ]/g, " ").replace(/\s+/g, " ").trim();
    var comma = s.indexOf(",");
    if (comma <= 0) return null;
    return { last: s.slice(0, comma).trim(), given: s.slice(comma + 1).replace(/,/g, " ").trim() };
  }

  function codesAfter(text, label, allowed) {
    var up = String(text).toUpperCase();
    var at = up.search(label);
    if (at === -1) return null;
    var rest = up.slice(at).replace(label, " ");
    if (/\bNONE\b/.test(rest.slice(0, 20))) return "None";
    var found = [];
    var re = new RegExp("\\b(" + allowed + ")\\b", "g");
    var m;
    while ((m = re.exec(rest.slice(0, 40)))) if (found.indexOf(m[1]) === -1) found.push(m[1]);
    return found.length ? found.join(", ") : "";
  }

  /* "199403117" (slashes blurred into 1s) or "19940317" -> "1994-03-17"; only accepts real calendar dates. */
  function looseDate(token) {
    var raw = fixDigits(String(token).toUpperCase()).replace(/[^0-9]/g, "");
    var candidates = [raw];
    if (raw.length === 9) candidates.push(raw.slice(0, 4) + raw.slice(5), raw.slice(0, 6) + raw.slice(7));
    if (raw.length === 10) candidates.push(raw.slice(0, 4) + raw.slice(5, 7) + raw.slice(8));
    for (var i = 0; i < candidates.length; i++) {
      var c = candidates[i];
      if (c.length === 8 && realDate(c.slice(0, 4), c.slice(4, 6), c.slice(6, 8)) && +c.slice(0, 4) > 1900 && +c.slice(0, 4) < 2100) {
        return c.slice(0, 4) + "-" + c.slice(4, 6) + "-" + c.slice(6, 8);
      }
    }
    return "";
  }

  var ADDRESS_HINT = /\b(CITY|BRGY|BARANGAY|ST|STREET|AVE|AVENUE|ROAD|RD|PROV|PROVINCE|MUNICIPALITY|SUBD|SUBDIVISION|PUROK|ZONE|VILLAGE|BLK|LOT|PHASE|DISTRICT|POBLACION)\b/;
  var CODE_TOKEN = "A1|B1|B2|BE|CE|A|B|C|D|[1-8]";

  /* Fallbacks for photos where the small grey labels are unreadable but the values are not. */
  function ltoFallbacks(lines, out, licLine) {
    var thisYear = new Date().getFullYear();
    var header = labelIndex(lines, /DRIVER.?S\s*LICEN[CS]E|NON-?PROFESSIONAL|PROFESSIONAL/);
    var nameLine = -1;

    if (!out.fullName) {
      for (var i = Math.max(0, header + 1); i < Math.min(lines.length, header + 5); i++) {
        if (/^[A-ZÑ .'\-]{2,},\s*[A-ZÑ .'\-]{2,}$/.test(lines[i].text.toUpperCase())) {
          var nm = ltoName(lines[i].text);
          if (nm) {
            var cp2 = commaParts(lines[i].text);
            out.fullName = withParts(field(nm, lines[i].conf, false), cp2 && cp2.given, "", cp2 && cp2.last);
            nameLine = i;
            break;
          }
        }
      }
    }

    if (!out.birthdate) {
      for (var b = 0; b < lines.length; b++) {
        var m = lines[b].text.toUpperCase().match(/\b(?:PHL|FIL|PHI)\b\s+[MF]\s+([0-9OIlSB\/|.\-]{8,12})/);
        if (!m) continue;
        var bd = looseDate(m[1]);
        if (bd && +bd.slice(0, 4) <= thisYear - 16 && +bd.slice(0, 4) > thisYear - 100) {
          out.birthdate = field(bd, lines[b].conf, false);
        }
        break;
      }
    }

    if (!out.address) {
      var stop = licLine !== -1 ? licLine : lines.length;
      for (var a = Math.max(0, nameLine + 1, header + 1); a < stop; a++) {
        var t = lines[a].text.toUpperCase();
        if (t.length >= 12 && /[A-Z]{3}/.test(t) && ADDRESS_HINT.test(t) && !/\b(PHL|FIL)\b\s+[MF]\b/.test(t) && lines[a].conf >= 0.6) {
          out.address = field(titleCase(lines[a].text.replace(/[^A-Za-z0-9Ññ#.,\-\/' ]/g, "").replace(/\s+/g, " ").trim()), lines[a].conf, false);
          break;
        }
      }
    }

    if (!out.licenseClass) {
      var onlyCodes = new RegExp("^\\s*((?:(?:" + CODE_TOKEN + ")\\s*[.,]?\\s*)+?)(?:\\s+(NONE))?\\s*$");
      for (var c = Math.max(0, licLine); c < lines.length; c++) {
        var cm = lines[c].text.toUpperCase().match(onlyCodes);
        if (!cm) continue;
        var codes = cm[1].match(new RegExp("\\b(" + CODE_TOKEN + ")\\b", "g")) || [];
        if (codes.length) {
          out.licenseClass = field(codes.filter(function (v, k) { return codes.indexOf(v) === k; }).join(", "), lines[c].conf, false);
          if (cm[2] && !out.restrictions) out.restrictions = field("None", lines[c].conf, false);
          break;
        }
      }
    }
    return out;
  }

  function parseLto(lines) {
    var out = {};
    var all = lines.map(function (l) { return l.text; }).join("\n");
    var thisYear = new Date().getFullYear();

    var nameLabel = labelIndex(lines, /LAST\s*NAME|FIRST\s*NAME|MIDDLE\s*NAME/);
    if (nameLabel !== -1) {
      for (var n = nameLabel + 1; n < Math.min(lines.length, nameLabel + 3); n++) {
        var nm = ltoName(lines[n].text);
        if (nm) {
          var cp = commaParts(lines[n].text);
          out.fullName = withParts(field(nm, lines[n].conf, true), cp && cp.given, "", cp && cp.last);
          break;
        }
      }
    }

    var licLine = -1;
    for (var i = 0; i < lines.length; i++) {
      var lic = licenseNoIn(lines[i].text);
      if (lic) {
        out.idNumber = field(lic, lines[i].conf, true);
        licLine = i;
        break;
      }
    }

    var birthLabel = labelIndex(lines, /DATE\s*OF\s*BIRTH|BIRTH\s*DATE|BIRTHDATE/);
    if (birthLabel !== -1) {
      for (var bl = birthLabel; bl < Math.min(lines.length, birthLabel + 2); bl++) {
        var bd = datesIn(lines[bl].text).filter(function (d) {
          var y = +d.slice(0, 4);
          return y > thisYear - 100 && y <= thisYear - 16;
        })[0];
        if (bd) {
          out.birthdate = field(bd, lines[bl].conf, true);
          break;
        }
      }
    }

    var expLabel = labelIndex(lines, /EXPIRATION|EXPIRY|VALID\s*UNTIL/);
    var expLines = [];
    if (expLabel !== -1) expLines.push(expLabel, expLabel + 1);
    if (licLine !== -1) expLines.push(licLine);
    for (var e = 0; e < expLines.length; e++) {
      var li = expLines[e];
      if (!lines[li]) continue;
      var ex = datesIn(lines[li].text).filter(function (d) {
        return +d.slice(0, 4) >= thisYear - 12 && (!out.birthdate || d > out.birthdate.value);
      });
      if (ex.length) {
        out.expiry = field(ex[ex.length - 1], lines[li].conf, true);
        break;
      }
    }

    if (!out.birthdate || !out.expiry) {
      var everyDate = [];
      lines.forEach(function (l) {
        datesIn(l.text).forEach(function (d) { everyDate.push({ d: d, conf: l.conf }); });
      });
      everyDate.sort(function (a, b) { return a.d < b.d ? -1 : 1; });
      if (!out.birthdate && everyDate.length >= 2) {
        var first = everyDate[0];
        if (+first.d.slice(0, 4) <= thisYear - 16) out.birthdate = field(first.d, first.conf, false);
      }
      if (!out.expiry && everyDate.length >= 2) {
        var last = everyDate[everyDate.length - 1];
        if (+last.d.slice(0, 4) >= thisYear - 12) out.expiry = field(last.d, last.conf, false);
      }
    }

    var addrLabel = labelIndex(lines, /^ADDRESS\b|\bADDRESS\s*$/);
    if (addrLabel !== -1) {
      var parts = [];
      var confs = [];
      var sameLine = lines[addrLabel].text.replace(/.*ADDRESS\s*[:\-]?\s*/i, "");
      if (sameLine.length > 6) {
        parts.push(sameLine);
        confs.push(lines[addrLabel].conf);
      }
      for (var a = addrLabel + 1; a < Math.min(lines.length, addrLabel + 3); a++) {
        if (/LICENSE\s*NO|EXPIRATION|AGENCY|BLOOD|DL\s*CODE|CONDITION/i.test(lines[a].text)) break;
        if (licenseNoIn(lines[a].text) || datesIn(lines[a].text).length) break;
        parts.push(lines[a].text);
        confs.push(lines[a].conf);
      }
      var addr = parts.join(", ").replace(/[^A-Za-z0-9Ññ#.,\-\/' ]/g, "").replace(/\s+/g, " ").replace(/,\s*,/g, ",").trim();
      if (addr.length >= 8) {
        var avg = confs.reduce(function (s, c) { return s + c; }, 0) / confs.length;
        out.address = field(titleCase(addr), avg, true);
      }
    }

    var codes = codesAfter(all, /DL\s*CODES?|RESTRICTIONS?\s*CODES?/, "BE|CE|A1|B1|B2|A|B|C|D|[1-8]");
    if (codes) {
      var codeLine = lines[labelIndex(lines, /DL\s*CODES?/)] || lines[0];
      out.licenseClass = field(codes, codeLine ? codeLine.conf : 0.5, true);
    }
    var cond = codesAfter(all, /CONDITIONS?/, "[A-E]|[1-5]");
    if (cond) {
      var condLine = lines[labelIndex(lines, /CONDITIONS?/)] || lines[0];
      out.restrictions = field(cond, condLine ? condLine.conf : 0.5, true);
    }
    return ltoFallbacks(lines, out, licLine);
  }

  /* ---------- Other Philippine IDs ---------- */

  var MONTHS = {
    JAN: "01", ENE: "01", FEB: "02", PEB: "02", MAR: "03", APR: "04", ABR: "04", MAY: "05",
    JUN: "06", HUN: "06", JUL: "07", HUL: "07", AUG: "08", AGO: "08", SEP: "09", SET: "09",
    OCT: "10", OKT: "10", NOV: "11", NOB: "11", DEC: "12", DIS: "12"
  };

  /* Every date in a line, in any format PH IDs use: 1990/01/31, 31 JAN 1990, JANUARY 31, 1990, 01/31/1990. */
  function anyDatesIn(text) {
    var up = String(text).toUpperCase();
    var out = datesIn(up);
    var m;
    var dmy = /\b([0-9OIl]{1,2})\s*[\-\/ ]?\s*([A-Z]{3,9})(?:\s*\/\s*[A-Z]{3,9})?\.?\s*[\-\/ ,]?\s*([0-9OIlSB]{4})\b/g;
    while ((m = dmy.exec(up))) {
      var mo = MONTHS[m[2].slice(0, 3)];
      var d = ("0" + fixDigits(m[1])).slice(-2);
      var y = fixDigits(m[3]);
      if (mo && realDate(y, mo, d)) out.push(y + "-" + mo + "-" + d);
    }
    var mdy = /\b([A-Z]{3,9})\.?\s+([0-9OIl]{1,2}),?\s*([0-9OIlSB]{4})\b/g;
    while ((m = mdy.exec(up))) {
      var mo2 = MONTHS[m[1].slice(0, 3)];
      var d2 = ("0" + fixDigits(m[2])).slice(-2);
      var y2 = fixDigits(m[3]);
      if (mo2 && realDate(y2, mo2, d2)) out.push(y2 + "-" + mo2 + "-" + d2);
    }
    var num = /\b(\d{2})[\/\-.](\d{2})[\/\-.](\d{4})\b/g;
    while ((m = num.exec(up))) {
      if (realDate(m[3], m[1], m[2])) out.push(m[3] + "-" + m[1] + "-" + m[2]);
    }
    return out;
  }

  var LABEL_WORDS = /APELYIDO|PANGALAN|GITNANG|SURNAME|LAST\s*NAME|GIVEN|FIRST\s*NAME|MIDDLE|ADDRESS|TIRAHAN|BIRTH|KAPANGANAKAN|SEX|KASARIAN|NATIONALITY|REPUBLIC|REPUBLIKA|PILIPINAS|PHILIPPINES|CARD|SIGNATURE|LAGDA/;

  function nameish(text) {
    var s = String(text || "").toUpperCase().replace(/[^A-ZÑ.\-' ]/g, " ").replace(/\s+/g, " ").trim();
    if (s.length < 2 || !/[A-Z]{2}/.test(s) || LABEL_WORDS.test(s)) return "";
    return s;
  }

  /* Value printed after a label: rest of the label line, else the next one or two lines. */
  function valueAfter(lines, labelRe, accept, skipRe) {
    for (var i = 0; i < lines.length; i++) {
      var up = lines[i].text.toUpperCase();
      if (!labelRe.test(up) || (skipRe && skipRe.test(up))) continue;
      var rest = up.replace(new RegExp("^.*?(?:" + labelRe.source + ")[^A-Z0-9]*", "i"), "");
      var same = rest && accept(rest);
      if (same) return { value: same, conf: lines[i].conf, line: i };
      for (var j = i + 1; j < Math.min(lines.length, i + 3); j++) {
        var v = accept(lines[j].text);
        if (v) return { value: v, conf: lines[j].conf, line: j };
      }
      return null;
    }
    return null;
  }

  function firstDate(text) {
    return anyDatesIn(text)[0] || "";
  }

  function splitName(lines, labels) {
    var last = valueAfter(lines, labels.last, nameish, labels.lastSkip);
    var given = valueAfter(lines, labels.given, nameish);
    var middle = labels.middle ? valueAfter(lines, labels.middle, nameish) : null;
    if (!last || !given) return null;
    var parts = [given, middle, last].filter(Boolean);
    var conf = Math.min.apply(null, parts.map(function (p) { return p.conf; }));
    return withParts(
      field(titleCase([given.value, middle ? middle.value : "", last.value].join(" ").replace(/\s+/g, " ").trim()), conf, true),
      given.value, middle ? middle.value : "", last.value
    );
  }

  function addressAfter(lines, labelRe) {
    var hit = valueAfter(lines, labelRe, function (t) {
      var s = String(t).replace(/[^A-Za-z0-9Ññ#.,\-\/' ]/g, "").replace(/\s+/g, " ").trim();
      return s.length >= 8 && /[A-Za-z]{3}/.test(s) && !LABEL_WORDS.test(s.toUpperCase()) ? s : "";
    });
    if (!hit) return null;
    var text = hit.value;
    var next = lines[hit.line + 1];
    if (next && ADDRESS_HINT.test(next.text.toUpperCase()) && !LABEL_WORDS.test(next.text.toUpperCase()) && !anyDatesIn(next.text).length) {
      text += ", " + next.text.replace(/[^A-Za-z0-9Ññ#.,\-\/' ]/g, "").trim();
    }
    return field(titleCase(text.replace(/,\s*,/g, ",")), hit.conf, true);
  }

  function datedField(lines, labelRe, test) {
    var hit = valueAfter(lines, labelRe, function (t) {
      var d = anyDatesIn(t).filter(test || function () { return true; })[0];
      return d || "";
    });
    return hit ? field(hit.value, hit.conf, true) : null;
  }

  function adultBirth(d) {
    var y = +d.slice(0, 4);
    var now = new Date().getFullYear();
    return y > now - 100 && y <= now - 16;
  }

  function stillRecent(d) {
    return +d.slice(0, 4) >= new Date().getFullYear() - 12;
  }

  function digitGroupsIn(lines, re, format) {
    for (var i = 0; i < lines.length; i++) {
      var m = lines[i].text.toUpperCase().match(re);
      if (!m) continue;
      var digits = fixDigits(m[1]).replace(/[^0-9]/g, "");
      var formatted = format(digits);
      if (formatted) return field(formatted, lines[i].conf, true);
    }
    return null;
  }

  function collect(out, key, value) {
    if (value && value.value) out[key] = value;
  }

  var CARD_HEADER = /REPUBLI|PILIPINAS|PHILIPPINES|PAMBANSANG|PAGKAKAKILANLAN|IDENTIFICATION|UNIFIED|MULTI|PURPOSE|POSTAL|CORPORATION|IDENTITY|PASAPORTE|PASSPORT|DEPARTMENT|AFFAIRS|SECURITY|GSIS|\bSSS\b|CARD/;

  /*
   * When the small printed labels are unreadable, fall back on the values themselves:
   * confidently-read ALL-CAPS name lines in card order, dates by plausibility, and the address by its wording.
   */
  function valueFallbacks(lines, out, opts) {
    var sure = lines.filter(function (l) { return l.conf >= 0.6; });
    if (!out.fullName && opts.nameOrder) {
      var names = [];
      for (var i = 0; i < sure.length && names.length < 3; i++) {
        var t = sure[i].text;
        if (CARD_HEADER.test(t.toUpperCase()) || LABEL_WORDS.test(t.toUpperCase())) continue;
        var plain = /^[A-ZÑ][A-ZÑ .'\-]+$/.test(t) && sure[i].conf >= 0.75;
        if (plain) names.push(sure[i]);
        else if (names.length) break;
      }
      if (names.length >= 2) {
        var byRole = {};
        opts.nameOrder.forEach(function (role, k) { if (names[k]) byRole[role] = names[k]; });
        var full = [byRole.given, byRole.middle, byRole.last].filter(Boolean);
        out.fullName = withParts(
          field(
            titleCase(full.map(function (l) { return l.text; }).join(" ")),
            Math.min.apply(null, full.map(function (l) { return l.conf; })),
            false
          ),
          byRole.given && byRole.given.text, byRole.middle && byRole.middle.text, byRole.last && byRole.last.text
        );
      }
    }
    var dates = [];
    sure.forEach(function (l) {
      anyDatesIn(l.text).forEach(function (d) { dates.push({ d: d, conf: l.conf }); });
    });
    dates.sort(function (a, b) { return a.d < b.d ? -1 : 1; });
    if (!out.birthdate) {
      var birth = dates.filter(function (x) { return adultBirth(x.d); })[0];
      if (birth) out.birthdate = field(birth.d, birth.conf, false);
    }
    if (!out.expiry && opts.expires && out.birthdate) {
      var later = dates.filter(function (x) { return stillRecent(x.d) && +x.d.slice(0, 4) >= +out.birthdate.value.slice(0, 4) + 16; });
      if (later.length >= 1 && (opts.expiresOnly || later.length === 1 || later[later.length - 1].d > new Date().toISOString().slice(0, 10))) {
        var last = later[later.length - 1];
        out.expiry = field(last.d, last.conf, false);
      }
    }
    if (!out.address && opts.address) {
      for (var a = 0; a < sure.length; a++) {
        var up = sure[a].text.toUpperCase();
        if (up.length >= 12 && ADDRESS_HINT.test(up) && !CARD_HEADER.test(up) && !anyDatesIn(up).length) {
          out.address = field(titleCase(sure[a].text.replace(/[^A-Za-z0-9Ññ#.,\-\/' ]/g, "").replace(/\s+/g, " ").trim()), sure[a].conf, false);
          break;
        }
      }
    }
    return out;
  }

  /* PhilSys national ID / ePhilID */
  function parsePhilsys(lines) {
    var out = {};
    collect(out, "idNumber", digitGroupsIn(lines, /\b([0-9OIlSB]{4}[\s\-]?[0-9OIlSB]{4}[\s\-]?[0-9OIlSB]{4}[\s\-]?[0-9OIlSB]{4})\b/, function (d) {
      return d.length === 16 ? d.replace(/(\d{4})(?=\d)/g, "$1-") : "";
    }));
    collect(out, "fullName", splitName(lines, {
      last: /APELYIDO|LAST\s*NAME/, lastSkip: /GITNANG|MIDDLE/,
      given: /PANGALAN|GIVEN\s*NAMES?/,
      middle: /GITNANG|MIDDLE\s*NAME/
    }));
    collect(out, "birthdate", datedField(lines, /KAPANGANAKAN|DATE\s*OF\s*BIRTH|BIRTH/, adultBirth));
    collect(out, "issueDate", datedField(lines, /PAGKAKALOOB|DATE\s*OF\s*ISSUE|ISSUED/));
    collect(out, "address", addressAfter(lines, /TIRAHAN|ADDRESS/));
    return valueFallbacks(lines, out, { nameOrder: ["last", "given", "middle"], address: true });
  }

  /* SSS / GSIS Unified Multi-Purpose ID */
  function parseUmid(lines) {
    var out = {};
    collect(out, "idNumber", digitGroupsIn(lines, /(?:CRN|C\s*R\s*N)[^0-9OIl]*([0-9OIlSB][0-9OIlSB\s\-]{11,16})/, function (d) {
      return d.length === 12 ? d.slice(0, 4) + "-" + d.slice(4, 11) + "-" + d.slice(11) : "";
    }) || digitGroupsIn(lines, /\b([0-9OIl]{4}\s*-\s*[0-9OIl]{7}\s*-\s*[0-9OIl])\b/, function (d) {
      return d.length === 12 ? d.slice(0, 4) + "-" + d.slice(4, 11) + "-" + d.slice(11) : "";
    }));
    collect(out, "fullName", splitName(lines, {
      last: /SURNAME|LAST\s*NAME|APELYIDO/, lastSkip: /MIDDLE/,
      given: /GIVEN\s*NAMES?|FIRST\s*NAME|PANGALAN/,
      middle: /MIDDLE\s*NAME|GITNANG/
    }));
    collect(out, "birthdate", datedField(lines, /DATE\s*OF\s*BIRTH|BIRTH|KAPANGANAKAN/, adultBirth));
    collect(out, "address", addressAfter(lines, /ADDRESS|TIRAHAN/));
    return valueFallbacks(lines, out, { nameOrder: ["last", "given", "middle"], address: true });
  }

  /* ICAO check digit: weights 7,3,1; digits as-is, A=10..Z=35, '<'=0. */
  function mrzCheck(s) {
    var sum = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i);
      var v = c === "<" ? 0 : /\d/.test(c) ? +c : c.charCodeAt(0) - 55;
      sum += v * [7, 3, 1][i % 3];
    }
    return String(sum % 10);
  }

  function mrzDate(yymmdd, future) {
    var yy = +yymmdd.slice(0, 2);
    var now = new Date().getFullYear() % 100;
    var century = future ? 2000 : yy > now ? 1900 : 2000;
    var y = String(century + yy);
    var iso = y + "-" + yymmdd.slice(2, 4) + "-" + yymmdd.slice(4, 6);
    return realDate(y, yymmdd.slice(2, 4), yymmdd.slice(4, 6)) ? iso : "";
  }

  /* Machine-readable zone at the bottom of the passport data page; check digits make it trustworthy. */
  function parseMrz(lines) {
    var cleaned = lines.map(function (l) {
      return { text: l.text.toUpperCase().replace(/\s+/g, "").replace(/«/g, "<<").replace(/[{(\[]/g, "<"), conf: l.conf };
    });
    var out = {};
    for (var i = 0; i < cleaned.length; i++) {
      var t = cleaned[i].text;
      var top = t.match(/P[<K]([A-Z]{3})([A-Z<]{5,})/);
      if (top && t.length >= 30) {
        var names = top[2].replace(/K{3,}/g, function (run) { return new Array(run.length + 1).join("<"); }).split("<<");
        var surname = names[0].replace(/</g, " ").trim();
        var given = (names[1] || "").replace(/</g, " ").trim();
        if (surname && given) out.mrzName = { surname: surname, given: given, conf: cleaned[i].conf };
      }
      var m = t.match(/([A-Z0-9<]{9})([0-9OIlSB])([A-Z<]{3})([0-9OIlSB]{6})([0-9OIlSB])([MF<])([0-9OIlSB]{6})([0-9OIlSB])/);
      if (m && t.length >= 28) {
        var docNo = m[1];
        var dob = fixDigits(m[4]);
        var exp = fixDigits(m[7]);
        var docOk = mrzCheck(docNo) === fixDigits(m[2]);
        var dobOk = mrzCheck(dob) === fixDigits(m[5]);
        var expOk = mrzCheck(exp) === fixDigits(m[8]);
        var number = docNo.replace(/</g, "");
        out.idNumber = field(number, docOk ? 0.97 : 0.3, true);
        var birth = mrzDate(dob, false);
        if (birth) out.birthdate = field(birth, dobOk ? 0.97 : 0.3, true);
        var expiry = mrzDate(exp, true);
        if (expiry) out.expiry = field(expiry, expOk ? 0.97 : 0.3, true);
      }
    }
    return out;
  }

  function parsePassport(lines) {
    var out = {};
    var mrz = parseMrz(lines);
    ["idNumber", "birthdate", "expiry"].forEach(function (k) { if (mrz[k]) out[k] = mrz[k]; });

    if (!out.idNumber || out.idNumber.conf < 0.5) {
      var visual = valueAfter(lines, /PASSPORT\s*NO|PASAPORTE\s*BLG|NO\.?\s*NG\s*PASAPORTE/, function (t) {
        var m = String(t).toUpperCase().replace(/\s+/g, "").match(/([A-Z]{1,2}[0-9OIlSB]{6,8}[A-Z]?)/);
        if (!m) return "";
        var lead = m[1].match(/^[A-Z]{1,2}/)[0];
        var fixed = lead + fixDigits(m[1].slice(lead.length).replace(/[A-Z]$/, "")) + (/[A-Z]$/.test(m[1].slice(lead.length)) ? m[1].slice(-1) : "");
        return /^[A-Z]{1,2}\d{6,8}[A-Z]?$/.test(fixed) ? fixed : "";
      });
      if (visual) out.idNumber = field(visual.value, visual.conf, true);
    }
    if (!out.birthdate || out.birthdate.conf < 0.5) collect(out, "birthdate", datedField(lines, /DATE\s*OF\s*BIRTH|KAPANGANAKAN/, adultBirth));
    if (!out.expiry || out.expiry.conf < 0.5) collect(out, "expiry", datedField(lines, /DATE\s*OF\s*EXPIRY|EXPIRATION|PAGKAWALANG/, stillRecent));
    collect(out, "issueDate", datedField(lines, /DATE\s*OF\s*ISSUE|PAGKAKALOOB|ISSUED/));

    var printed = splitName(lines, {
      last: /SURNAME|APELYIDO/, lastSkip: /MIDDLE|GITNANG/,
      given: /GIVEN\s*NAMES?|PANGALAN/,
      middle: /MIDDLE\s*NAME|GITNANG/
    });
    if (printed) out.fullName = printed;
    valueFallbacks(lines, out, { nameOrder: ["last", "given", "middle"] });
    var mrzFull = mrz.mrzName ? mrz.mrzName.given + " " + mrz.mrzName.surname : "";
    if (out.fullName && mrzFull && NS.validation && !NS.validation.namesMatch(out.fullName.value, mrzFull)) {
      out.fullName = field(out.fullName.value, Math.min(out.fullName.conf, 0.4), false);
    }
    if (!out.fullName && mrz.mrzName) {
      out.fullName = withParts(
        field(titleCase(mrz.mrzName.given + " " + mrz.mrzName.surname), mrz.mrzName.conf, false),
        mrz.mrzName.given, "", mrz.mrzName.surname
      );
    }
    return out;
  }

  /* PHLPost improved postal ID */
  function parsePostal(lines) {
    var out = {};
    collect(out, "idNumber", digitGroupsIn(lines, /PRN[^0-9OIl]*([0-9OIlSB][0-9OIlSB\s]{10,14}\s*[A-Z]?)/, function (d) {
      return d.length >= 10 && d.length <= 14 ? d : "";
    }));
    if (out.idNumber) {
      var prnLine = lines.filter(function (l) { return /PRN/i.test(l.text); })[0];
      var suffix = prnLine && prnLine.text.toUpperCase().match(/PRN[^0-9]*[0-9\s]{10,16}([A-Z])\b/);
      if (suffix) out.idNumber.value += suffix[1];
    }
    var split = splitName(lines, {
      last: /SURNAME|LAST\s*NAME/, lastSkip: /MIDDLE/,
      given: /GIVEN\s*NAMES?|FIRST\s*NAME/,
      middle: /MIDDLE\s*NAME/
    });
    if (split) out.fullName = split;
    else {
      for (var i = 0; i < lines.length; i++) {
        if (/^[A-ZÑ .'\-]{2,},\s*[A-ZÑ .'\-]{2,}$/.test(lines[i].text.toUpperCase())) {
          var nm = ltoName(lines[i].text);
          if (nm) {
            var cp3 = commaParts(lines[i].text);
            out.fullName = withParts(field(nm, lines[i].conf, false), cp3 && cp3.given, "", cp3 && cp3.last);
            break;
          }
        }
      }
    }
    collect(out, "birthdate", datedField(lines, /DATE\s*OF\s*BIRTH|BIRTH/, adultBirth));
    collect(out, "expiry", datedField(lines, /VALID\s*UNTIL|VALIDITY|EXPIR/, stillRecent));
    collect(out, "issueDate", datedField(lines, /DATE\s*OF\s*ISSUE|ISSUED/));
    collect(out, "address", addressAfter(lines, /ADDRESS/));
    return valueFallbacks(lines, out, { expires: true, expiresOnly: true, address: true });
  }

  var ID_PARSERS = {
    "National ID": parsePhilsys,
    UMID: parseUmid,
    Passport: parsePassport,
    "Postal ID": parsePostal
  };

  function detectType(text) {
    var up = String(text).toUpperCase().replace(/\s+/g, " ");
    if (/P[<K]PHL|PASAPORTE|PASSPORT/.test(up)) return "Passport";
    if (/UNIFIED MULTI|\bUMID\b|\bCRN\b/.test(up)) return "UMID";
    if (/POSTAL|PHLPOST|PHILPOST|\bPRN\b/.test(up)) return "Postal ID";
    if (/PAMBANSANG|PHILIPPINE IDENTIFICATION|PHILSYS|PHILID|PAGKAKAKILANLAN/.test(up)) return "National ID";
    if (looksLikeLicense(up)) return "Driver's License";
    return "";
  }

  function looksLikeLicense(text) {
    var up = String(text).toUpperCase();
    return /DRIVER|LAND\s*TRANSPORTATION|\bLTO\b|LICENSE\s*NO|DL\s*CODE/.test(up) || !!licenseNoIn(up);
  }

  var LAYOUT_KEYS = {
    "Driver's License": ["fullName", "idNumber", "birthdate", "expiry", "address", "licenseClass", "restrictions"],
    "National ID": ["fullName", "idNumber", "birthdate", "issueDate", "address", "expiry"],
    UMID: ["fullName", "idNumber", "birthdate", "address", "expiry", "issueDate"],
    Passport: ["fullName", "idNumber", "birthdate", "expiry", "issueDate", "address"],
    "Postal ID": ["fullName", "idNumber", "birthdate", "expiry", "issueDate", "address"]
  };

  /**
   * Generic heuristics first; when the card type is recognised (or the renter picked it),
   * that type's layout parser replaces them, because generic label matching tends to
   * return label text such as "Last Name, First Name".
   */
  function extractAll(raw, hintType) {
    var text = (raw && raw.text) || "";
    var lines = (raw && raw.lines) || [];
    var fields = extractFields(text, (raw && raw.words) || []);
    var type = detectType(text) || (LAYOUT_KEYS[hintType] ? hintType : "");
    if (type) {
      fields.idType = type;
      fields.confidence.idType = detectType(text) ? 0.9 : 0.7;
      var parsed = type === "Driver's License" ? parseLto(lines) : ID_PARSERS[type](lines);
      LAYOUT_KEYS[type].forEach(function (key) {
        var hit = parsed[key];
        fields[key] = hit && hit.value ? hit.value : "";
        fields.confidence[key] = hit && hit.value ? hit.conf : 0;
      });
      fields.nameParts = parsed.fullName && parsed.fullName.parts ? parsed.fullName.parts : null;
    }
    /* Never guess: values the engine was unsure about are dropped and reported instead. */
    fields.unclear = [];
    Object.keys(fields.confidence).forEach(function (key) {
      if (fields[key] && fields.confidence[key] < MIN_CONFIDENCE) {
        fields.unclear.push(key);
        fields[key] = "";
      }
    });
    if (!fields.fullName) fields.nameParts = null;
    return fields;
  }

  function score(fields) {
    var keys = ["fullName", "idNumber", "birthdate", "expiry", "address"];
    var s = 0;
    keys.forEach(function (k) { if (fields[k]) s += 1 + (fields.confidence[k] || 0); });
    return s;
  }

  /**
   * OCR an ID photo and return extracted fields. If the photo reads poorly the
   * other three orientations are tried and the best reading is kept.
   */
  function scan(image, onProgress, options) {
    var hintType = (options && options.idType) || "";
    var tries = [0, 90, 270, 180];
    var best = null;
    function attempt(idx) {
      var rotation = tries[idx];
      return readImage(image, function (p) {
        if (onProgress) onProgress(p, idx);
      }, rotation).then(function (raw) {
        var fields = extractAll(raw, hintType);
        fields.rotation = rotation;
        if (!best || score(fields) > score(best)) best = fields;
        var goodEnough = best.idNumber && (best.fullName || best.birthdate) && raw.meanConfidence >= 55;
        if (goodEnough || idx === tries.length - 1) return best;
        if (idx === 0 && raw.meanConfidence >= 70 && score(fields) >= 2) return best;
        return attempt(idx + 1);
      });
    }
    return attempt(0);
  }

  var MIN_CONFIDENCE = 0.45;

  NS.ocr = {
    isConfigured: true,
    LOW_CONFIDENCE: 0.62,
    MIN_CONFIDENCE: MIN_CONFIDENCE,
    readImage: readImage,
    preprocess: preprocess,
    extractFields: extractFields,
    parseLto: parseLto,
    parseMrz: parseMrz,
    detectType: detectType,
    assessQuality: assessQuality,
    scan: scan
  };
})(window);
