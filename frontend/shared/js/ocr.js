/**
 * ID / license reading. The photo is sent to the Laravel /ocr/id endpoint,
 * which calls Google Gemini on the server. The Gemini key never lives here.
 */
(function (global) {
  "use strict";

  var NS = (global.iDrive = global.iDrive || {});

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

  function fileToDataUrl(src) {
    if (typeof src === "string") return Promise.resolve(src);
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        resolve(String(reader.result || ""));
      };
      reader.onerror = function () {
        reject(new Error("Could not read that file. Upload the photo again."));
      };
      reader.readAsDataURL(src);
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
      var lumSum = 0;
      for (var d = 0; d < gray.length; d++) lumSum += gray[d];
      if (!selfie && lumSum / gray.length < 42) {
        issues.push({
          code: "dark",
          message: "This photo is too dark. Turn on a light or move to a brighter spot and take it again."
        });
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

  function splitName(fullName) {
    var parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return null;
    return { given: parts[0], last: parts.length > 1 ? parts.slice(1).join(" ") : "" };
  }

  /**
   * Sends the ID photo to the server Gemini reader and returns the same field
   * shape the booking / register forms already fill.
   */
  function scan(image, onProgress) {
    if (!NS.api || !NS.api.post) {
      return Promise.reject(new Error("The ID reader is unavailable. Type the details below, or refresh the page."));
    }
    if (onProgress) onProgress(0.15, 0);
    return fileToDataUrl(image).then(function (dataUrl) {
      if (!/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(dataUrl)) {
        throw new Error("Upload a JPEG, PNG, or WebP photo of the ID.");
      }
      if (onProgress) onProgress(0.4, 0);
      return NS.api.post("/ocr/id", { image: dataUrl }, { timeoutMs: 45000 });
    }).then(function (res) {
      if (onProgress) onProgress(1, 0);
      var raw = (res && res.fields) || {};
      var fields = {
        fullName: raw.fullName || "",
        idNumber: raw.idNumber || "",
        birthdate: raw.birthDate || raw.birthdate || "",
        expiry: raw.expiryDate || raw.expiry || "",
        address: raw.address || "",
        nameParts: splitName(raw.fullName || ""),
        confidence: {
          fullName: raw.fullName ? 0.92 : 0,
          idNumber: raw.idNumber ? 0.92 : 0,
          birthdate: raw.birthDate || raw.birthdate ? 0.92 : 0,
          expiry: raw.expiryDate || raw.expiry ? 0.92 : 0,
          address: raw.address ? 0.92 : 0
        },
        unclear: []
      };
      if (!fields.fullName && !fields.idNumber && !fields.birthdate && !fields.expiry && !fields.address) {
        throw new Error("No text was found on this photo. If it is blurry, take another picture in better light and upload again.");
      }
      return fields;
    }).catch(function (err) {
      var message = (err && err.data && err.data.message) || (err && err.message) || "";
      if (/timeout|network|failed to fetch|abort/i.test(message)) {
        throw new Error("Could not reach the ID reader. Check the connection and upload again.");
      }
      throw new Error(message || "The ID reader could not process this photo. Upload a clearer picture.");
    });
  }

  NS.ocr = {
    isConfigured: true,
    LOW_CONFIDENCE: 0.62,
    MIN_CONFIDENCE: 0.45,
    assessQuality: assessQuality,
    scan: scan
  };
})(window);
