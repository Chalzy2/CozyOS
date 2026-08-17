/**
 * ══════════════════════════════════════════════════════════════
 * CozyOS OCR Studio — OCRImage
 * core/modules/ocrstudio/ocr-image.js
 * Version: 1.0.0-PRODUCTION
 * ══════════════════════════════════════════════════════════════
 *
 * LAYER
 *   Execution Layer — Image Preprocessing Engine
 *
 * SINGLE RESPONSIBILITY
 *   Provides deterministic, pure-pixel image preprocessing
 *   operations (geometric transforms, matrix filters, tonal
 *   adjustments, statistics, and export) for OCR Studio, operating
 *   entirely on caller-supplied canvas sources with no dependency
 *   on any other OCR Studio or Test Studio module.
 *
 * DESIGNATED EXECUTION ENGINE
 *   The OCR Studio Zero Logic Rule prohibits image preprocessing
 *   in every module "unless explicitly designed as an execution
 *   engine." OCRImage is that designated exception for image
 *   preprocessing specifically. It performs real pixel
 *   manipulation (geometry, filters, tone) by design. It does
 *   NOT perform OCR recognition, does NOT extract text, does NOT
 *   calculate OCR confidence, does NOT translate, summarize, or
 *   spell-check, and does NOT parse PDFs or analyze layout — those
 *   remain the exclusive, separately-certified responsibilities of
 *   other modules later in the build order (ocr-pdf.js,
 *   ocr-region.js, ocr-layout.js, ocr-parser.js, and the actual
 *   recognition engine).
 *
 * ZERO LOGIC RULE — even as an execution engine, this module never:
 *   - performs OCR recognition or text extraction
 *   - calculates OCR confidence scores
 *   - translates, summarizes, or spell-checks text
 *   - parses PDFs or performs layout analysis
 *   - executes plugins
 *   - accesses any other module's private state
 *   - accesses filesystem directly
 *   - accesses network directly
 *   - accesses localStorage
 *   - accesses sessionStorage
 *   - modifies any other Core module
 *   - fabricates telemetry: getHealthDiagnostics() reports only
 *     real counts of operations actually performed by this module
 *
 * FROZEN DEPENDENCIES
 *   None. OCRImage does not call into OCRRegistry, OCRDocument,
 *   OCREngine, OCRResult, or any other module. It reads only the
 *   canvas-like source object supplied directly by its caller and
 *   writes only to canvases it creates itself.
 *
 * NAMESPACE NOTE
 *   This module is exposed at window.CozyOS.OCR.OCRImage (nested
 *   under an OCR namespace object), matching the integration
 *   contract required by its certified test suite
 *   (ocr-image.test.js), rather than the flat
 *   window.CozyOS.OCRX pattern used by OCRRegistry and OCREngine.
 *   This divergence is intentional and is called out explicitly
 *   in this module's certification.
 *
 * INTERNAL ARCHITECTURE
 *   - Every image returned to a caller is an immutable, frozen
 *     wrapper object exposing only { width, height, metadata } and
 *     bound methods — no internal pixel buffer or canvas is ever
 *     exposed as a property.
 *   - Every operation (rotate, resize, crop, pad, grayscale,
 *     sharpen, clone, normalize, brightness, contrast, thumbnail,
 *     autocontrast) is a pure function: it reads the current
 *     image's private pixel buffer and returns a brand-new wrapper
 *     around a brand-new buffer. The original is never mutated,
 *     which is what makes every derived image, and the entire
 *     OCRImage.create()/processPipeline() call chain, safe to
 *     branch and reuse freely.
 *   - create() defensively copies pixel data out of the caller's
 *     canvas at read time; no reference to the caller's canvas or
 *     its 2D context is retained afterward.
 *   - toDataURL()/toBlob() are the only points where a real DOM
 *     canvas is created on the way out, since that is the only way
 *     to obtain browser-native image encoding.
 *   - getHealthDiagnostics() reports two real, module-level
 *     counters (imagesProcessed, processingFailures) that are
 *     incremented only at the two actual boundaries where an image
 *     is created or a pipeline step fails. This is documented,
 *     deterministic operational telemetry — not hidden state.
 *   - CSP compliant (no eval, no inline handlers, no dynamic code).
 *   - ES2022, deterministic (nearest-neighbor sampling and fixed
 *     kernels only — no randomness, no timers).
 * ══════════════════════════════════════════════════════════════
 */

window.CozyOS = window.CozyOS || {};
window.CozyOS.OCR = window.CozyOS.OCR || {};

(function () {
  'use strict';

  /** @const {string} Module version, returned by getVersion() and getHealthDiagnostics(). */
  const VERSION = '1.0.0';

  /**
   * @type {{ imagesProcessed: number, processingFailures: number }}
   * Real, module-level operational counters. imagesProcessed is
   * incremented once per successful create() call. processingFailures
   * is incremented once per failure at the create() boundary or once
   * per failure while applying a processPipeline() step. Instance
   * methods called directly by a caller (e.g. img.resize(-1, 2))
   * are not tracked here, since those are caller-side usage errors,
   * not OCRImage subsystem failures.
   */
  const _health = {
    imagesProcessed: 0,
    processingFailures: 0
  };

  // ── Pixel-level helpers (pure functions) ──────────────────────

  /**
   * Clamps a numeric channel value into the valid 8-bit range.
   * @param {number} v
   * @returns {number}
   */
  function _clamp8(v) {
    return v < 0 ? 0 : (v > 255 ? 255 : v);
  }

  /**
   * Computes standard perceptual luminance for an RGB triplet.
   * @param {number} r
   * @param {number} g
   * @param {number} b
   * @returns {number} integer luminance in [0, 255]
   */
  function _luminance(r, g, b) {
    return Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  }

  /**
   * Reads a single channel value from a pixel buffer with edge-clamped
   * coordinates, used for convolution sampling near borders.
   * @param {{width:number,height:number,data:Uint8ClampedArray}} buf
   * @param {number} x
   * @param {number} y
   * @param {number} c - channel index (0=R, 1=G, 2=B, 3=A)
   * @returns {number}
   */
  function _getPixelClamped(buf, x, y, c) {
    const cx = x < 0 ? 0 : (x >= buf.width ? buf.width - 1 : x);
    const cy = y < 0 ? 0 : (y >= buf.height ? buf.height - 1 : y);
    return buf.data[(cy * buf.width + cx) * 4 + c];
  }

  /**
   * Parses a 6-digit hex color string into an {r,g,b,a} object.
   * @param {string} color
   * @returns {{r:number,g:number,b:number,a:number}}
   * @throws {Error}
   */
  function _parseColor(color) {
    if (typeof color !== 'string') {
      throw new Error('[OCRImage] pad() color must be a string (e.g. "#000000").');
    }
    const match = /^#([0-9a-fA-F]{6})$/.exec(color.trim());
    if (!match) {
      throw new Error('[OCRImage] pad() color must be a 6-digit hex string (e.g. "#000000").');
    }
    const hex = match[1];
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
      a: 255
    };
  }

  /**
   * Validates that a value is a finite, non-negative integer.
   * @param {*} v
   * @returns {boolean}
   */
  function _isNonNegativeInt(v) {
    return typeof v === 'number' && Number.isFinite(v) && Number.isInteger(v) && v >= 0;
  }

  /**
   * Validates that a value is a finite positive integer.
   * @param {*} v
   * @returns {boolean}
   */
  function _isPositiveInt(v) {
    return typeof v === 'number' && Number.isFinite(v) && Number.isInteger(v) && v > 0;
  }

  // ── Pure pixel-buffer operations ──────────────────────────────
  // Each function takes a {width, height, data} buffer and returns
  // a brand-new buffer. None of them mutate their input.

  function _clonePixels(buf) {
    return { width: buf.width, height: buf.height, data: new Uint8ClampedArray(buf.data) };
  }

  function _opGrayscale(buf) {
    const src = buf.data;
    const out = new Uint8ClampedArray(src.length);
    for (let i = 0; i < src.length; i += 4) {
      const lum = _clamp8(_luminance(src[i], src[i + 1], src[i + 2]));
      out[i] = lum; out[i + 1] = lum; out[i + 2] = lum; out[i + 3] = src[i + 3];
    }
    return { width: buf.width, height: buf.height, data: out };
  }

  function _opBrightness(buf, delta) {
    if (typeof delta !== 'number' || !Number.isFinite(delta)) {
      throw new Error('[OCRImage] brightness() delta must be a finite number.');
    }
    const src = buf.data;
    const out = new Uint8ClampedArray(src.length);
    for (let i = 0; i < src.length; i += 4) {
      out[i] = _clamp8(src[i] + delta);
      out[i + 1] = _clamp8(src[i + 1] + delta);
      out[i + 2] = _clamp8(src[i + 2] + delta);
      out[i + 3] = src[i + 3];
    }
    return { width: buf.width, height: buf.height, data: out };
  }

  function _opContrast(buf, factor) {
    if (typeof factor !== 'number' || !Number.isFinite(factor) || factor < 0) {
      throw new Error('[OCRImage] contrast() factor must be a finite number >= 0.');
    }
    const src = buf.data;
    const out = new Uint8ClampedArray(src.length);
    for (let i = 0; i < src.length; i += 4) {
      out[i] = _clamp8((src[i] - 128) * factor + 128);
      out[i + 1] = _clamp8((src[i + 1] - 128) * factor + 128);
      out[i + 2] = _clamp8((src[i + 2] - 128) * factor + 128);
      out[i + 3] = src[i + 3];
    }
    return { width: buf.width, height: buf.height, data: out };
  }

  function _opNormalize(buf) {
    const src = buf.data;
    let min = 255, max = 0;
    for (let i = 0; i < src.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        const v = src[i + c];
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    if (max === min) {
      // Flat image: nothing to stretch. Return an isolated, unchanged copy
      // rather than dividing by zero.
      return _clonePixels(buf);
    }
    const range = max - min;
    const out = new Uint8ClampedArray(src.length);
    for (let i = 0; i < src.length; i += 4) {
      out[i] = _clamp8(((src[i] - min) / range) * 255);
      out[i + 1] = _clamp8(((src[i + 1] - min) / range) * 255);
      out[i + 2] = _clamp8(((src[i + 2] - min) / range) * 255);
      out[i + 3] = src[i + 3];
    }
    return { width: buf.width, height: buf.height, data: out };
  }

  function _opAutocontrast(buf) {
    const src = buf.data;
    const mins = [255, 255, 255], maxs = [0, 0, 0];
    for (let i = 0; i < src.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        const v = src[i + c];
        if (v < mins[c]) mins[c] = v;
        if (v > maxs[c]) maxs[c] = v;
      }
    }
    const ranges = [maxs[0] - mins[0], maxs[1] - mins[1], maxs[2] - mins[2]];
    const out = new Uint8ClampedArray(src.length);
    for (let i = 0; i < src.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        // Per-channel independent stretch. A flat channel (range 0) is left
        // unchanged rather than divided by zero — this is what makes
        // solid white/black/mid-grey images safe to autocontrast.
        out[i + c] = ranges[c] === 0 ? src[i + c] : _clamp8(((src[i + c] - mins[c]) / ranges[c]) * 255);
      }
      out[i + 3] = src[i + 3];
    }
    return { width: buf.width, height: buf.height, data: out };
  }

  function _opSharpen(buf) {
    const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0];
    const out = new Uint8ClampedArray(buf.data.length);
    for (let y = 0; y < buf.height; y++) {
      for (let x = 0; x < buf.width; x++) {
        const idx = (y * buf.width + x) * 4;
        for (let c = 0; c < 3; c++) {
          let sum = 0, k = 0;
          for (let ky = -1; ky <= 1; ky++) {
            for (let kx = -1; kx <= 1; kx++) {
              sum += _getPixelClamped(buf, x + kx, y + ky, c) * kernel[k];
              k++;
            }
          }
          out[idx + c] = _clamp8(sum);
        }
        out[idx + 3] = buf.data[idx + 3];
      }
    }
    return { width: buf.width, height: buf.height, data: out };
  }

  function _opCrop(buf, x, y, w, h) {
    if (![x, y, w, h].every(function (v) { return typeof v === 'number' && Number.isFinite(v) && Number.isInteger(v); })) {
      throw new Error('[OCRImage] crop() coordinates and dimensions must be integers.');
    }
    if (x < 0 || y < 0 || w <= 0 || h <= 0 || x + w > buf.width || y + h > buf.height) {
      throw new Error('[OCRImage] crop() region is out of bounds for a ' + buf.width + 'x' + buf.height + ' image.');
    }
    const out = new Uint8ClampedArray(w * h * 4);
    for (let row = 0; row < h; row++) {
      const srcStart = ((y + row) * buf.width + x) * 4;
      const destStart = (row * w) * 4;
      out.set(buf.data.subarray(srcStart, srcStart + w * 4), destStart);
    }
    return { width: w, height: h, data: out };
  }

  function _opResize(buf, newWidth, newHeight) {
    if (!_isPositiveInt(newWidth) || !_isPositiveInt(newHeight)) {
      throw new Error('[OCRImage] resize() width and height must be positive integers.');
    }
    const out = new Uint8ClampedArray(newWidth * newHeight * 4);
    const xRatio = buf.width / newWidth;
    const yRatio = buf.height / newHeight;
    for (let dy = 0; dy < newHeight; dy++) {
      const sy = Math.min(buf.height - 1, Math.floor(dy * yRatio));
      for (let dx = 0; dx < newWidth; dx++) {
        const sx = Math.min(buf.width - 1, Math.floor(dx * xRatio));
        const srcIdx = (sy * buf.width + sx) * 4;
        const destIdx = (dy * newWidth + dx) * 4;
        out[destIdx] = buf.data[srcIdx];
        out[destIdx + 1] = buf.data[srcIdx + 1];
        out[destIdx + 2] = buf.data[srcIdx + 2];
        out[destIdx + 3] = buf.data[srcIdx + 3];
      }
    }
    return { width: newWidth, height: newHeight, data: out };
  }

  function _opPad(buf, top, right, bottom, left, color) {
    [top, right, bottom, left].forEach(function (v) {
      if (!_isNonNegativeInt(v)) {
        throw new Error('[OCRImage] pad() margins must be non-negative integers.');
      }
    });
    const fill = _parseColor(color);
    const newWidth = buf.width + left + right;
    const newHeight = buf.height + top + bottom;
    const out = new Uint8ClampedArray(newWidth * newHeight * 4);
    for (let i = 0; i < out.length; i += 4) {
      out[i] = fill.r; out[i + 1] = fill.g; out[i + 2] = fill.b; out[i + 3] = fill.a;
    }
    for (let row = 0; row < buf.height; row++) {
      const srcStart = (row * buf.width) * 4;
      const destStart = ((row + top) * newWidth + left) * 4;
      out.set(buf.data.subarray(srcStart, srcStart + buf.width * 4), destStart);
    }
    return { width: newWidth, height: newHeight, data: out };
  }

  function _opThumbnail(buf, maxW, maxH) {
    if (typeof maxW !== 'number' || typeof maxH !== 'number' || !Number.isFinite(maxW) || !Number.isFinite(maxH) || maxW <= 0 || maxH <= 0) {
      throw new Error('[OCRImage] thumbnail() maxWidth and maxHeight must be positive numbers.');
    }
    const scale = Math.min(maxW / buf.width, maxH / buf.height);
    const newWidth = Math.max(1, Math.round(buf.width * scale));
    const newHeight = Math.max(1, Math.round(buf.height * scale));
    return _opResize(buf, newWidth, newHeight);
  }

  function _opRotate(buf, degrees) {
    if (typeof degrees !== 'number' || !Number.isFinite(degrees)) {
      throw new Error('[OCRImage] rotate() degrees must be a finite number.');
    }
    const radians = (degrees * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const newWidth = Math.max(1, Math.round(Math.abs(buf.width * cos) + Math.abs(buf.height * sin)));
    const newHeight = Math.max(1, Math.round(Math.abs(buf.width * sin) + Math.abs(buf.height * cos)));

    const out = new Uint8ClampedArray(newWidth * newHeight * 4);
    const srcCx = buf.width / 2;
    const srcCy = buf.height / 2;
    const destCx = newWidth / 2;
    const destCy = newHeight / 2;

    // Inverse rotation: map each destination pixel back to a source
    // coordinate using nearest-neighbor sampling.
    const invCos = Math.cos(-radians);
    const invSin = Math.sin(-radians);

    for (let dy = 0; dy < newHeight; dy++) {
      for (let dx = 0; dx < newWidth; dx++) {
        const relX = dx - destCx;
        const relY = dy - destCy;
        const srcX = Math.round(relX * invCos - relY * invSin + srcCx);
        const srcY = Math.round(relX * invSin + relY * invCos + srcCy);
        const destIdx = (dy * newWidth + dx) * 4;
        if (srcX >= 0 && srcX < buf.width && srcY >= 0 && srcY < buf.height) {
          const srcIdx = (srcY * buf.width + srcX) * 4;
          out[destIdx] = buf.data[srcIdx];
          out[destIdx + 1] = buf.data[srcIdx + 1];
          out[destIdx + 2] = buf.data[srcIdx + 2];
          out[destIdx + 3] = buf.data[srcIdx + 3];
        } else {
          out[destIdx] = 0; out[destIdx + 1] = 0; out[destIdx + 2] = 0; out[destIdx + 3] = 0;
        }
      }
    }
    return { width: newWidth, height: newHeight, data: out };
  }

  function _computeStatistics(buf) {
    const src = buf.data;
    const histogram = new Array(256).fill(0);
    let sum = 0;
    const pixelCount = buf.width * buf.height;
    for (let i = 0; i < src.length; i += 4) {
      const lum = _clamp8(_luminance(src[i], src[i + 1], src[i + 2]));
      histogram[lum] += 1;
      sum += lum;
    }
    return {
      meanLuminance: pixelCount > 0 ? sum / pixelCount : 0,
      histogramSnapshot: Object.freeze(histogram),
      width: buf.width,
      height: buf.height
    };
  }

  // ── Canvas boundary (source ingestion / export egestion) ──────

  /**
   * Validates that a caller-supplied source is a canvas-like object
   * with a readable 2D context and positive dimensions.
   * @param {*} source
   * @throws {Error}
   */
  function _validateSource(source) {
    if (!source || typeof source.getContext !== 'function') {
      throw new Error('[OCRImage] source must be a canvas-like object exposing getContext("2d").');
    }
    if (typeof source.width !== 'number' || typeof source.height !== 'number' || source.width <= 0 || source.height <= 0) {
      throw new Error('[OCRImage] source must have positive numeric width and height.');
    }
  }

  /**
   * Reads and defensively copies pixel data out of a caller-supplied
   * canvas. No reference to the source canvas or its context is
   * retained after this call returns.
   * @param {*} source
   * @returns {{width:number,height:number,data:Uint8ClampedArray}}
   */
  function _readSourcePixels(source) {
    const ctx = source.getContext('2d');
    if (!ctx || typeof ctx.getImageData !== 'function') {
      throw new Error('[OCRImage] source does not provide a readable 2D rendering context.');
    }
    const imageData = ctx.getImageData(0, 0, source.width, source.height);
    return {
      width: source.width,
      height: source.height,
      data: new Uint8ClampedArray(imageData.data)
    };
  }

  /**
   * Materializes a pixel buffer onto a brand-new canvas element, used
   * only by toDataURL()/toBlob() to obtain browser-native encoding.
   * @param {{width:number,height:number,data:Uint8ClampedArray}} buf
   * @returns {HTMLCanvasElement}
   */
  function _bufferToCanvas(buf) {
    const canvas = document.createElement('canvas');
    canvas.width = buf.width;
    canvas.height = buf.height;
    const ctx = canvas.getContext('2d');
    const imageData = ctx.createImageData(buf.width, buf.height);
    imageData.data.set(buf.data);
    ctx.putImageData(imageData, 0, 0);
    return canvas;
  }

  function _toDataURL(buf, mimeType) {
    const canvas = _bufferToCanvas(buf);
    return canvas.toDataURL(mimeType || 'image/png');
  }

  function _toBlob(buf, mimeType) {
    return new Promise(function (resolve, reject) {
      const canvas = _bufferToCanvas(buf);
      if (typeof canvas.toBlob !== 'function') {
        reject(new Error('[OCRImage] canvas.toBlob is not supported in this environment.'));
        return;
      }
      canvas.toBlob(function (blob) {
        if (!blob) {
          reject(new Error('[OCRImage] canvas.toBlob() returned null.'));
          return;
        }
        resolve(blob);
      }, mimeType || 'image/png');
    });
  }

  // ── Public image wrapper ───────────────────────────────────────

  /**
   * Wraps an internal pixel buffer into the immutable, frozen public
   * image object returned to callers. Every method returns a brand
   * new wrapped image; none mutate the buffer captured in this
   * closure.
   * @param {{width:number,height:number,data:Uint8ClampedArray}} buf
   * @returns {Object} frozen image object
   */
  function _wrapBuffer(buf) {
    const image = {
      width: buf.width,
      height: buf.height,
      metadata: Object.freeze({ mimeType: 'image/png' }),
      rotate: function (degrees) { return _wrapBuffer(_opRotate(buf, degrees)); },
      resize: function (width, height) { return _wrapBuffer(_opResize(buf, width, height)); },
      crop: function (x, y, w, h) { return _wrapBuffer(_opCrop(buf, x, y, w, h)); },
      pad: function (top, right, bottom, left, color) { return _wrapBuffer(_opPad(buf, top, right, bottom, left, color)); },
      grayscale: function () { return _wrapBuffer(_opGrayscale(buf)); },
      sharpen: function () { return _wrapBuffer(_opSharpen(buf)); },
      clone: function () { return _wrapBuffer(_clonePixels(buf)); },
      normalize: function () { return _wrapBuffer(_opNormalize(buf)); },
      brightness: function (delta) { return _wrapBuffer(_opBrightness(buf, delta)); },
      contrast: function (factor) { return _wrapBuffer(_opContrast(buf, factor)); },
      thumbnail: function (maxWidth, maxHeight) { return _wrapBuffer(_opThumbnail(buf, maxWidth, maxHeight)); },
      autocontrast: function () { return _wrapBuffer(_opAutocontrast(buf)); },
      getStatistics: function () { return _computeStatistics(buf); },
      toDataURL: function (mimeType) { return _toDataURL(buf, mimeType); },
      toBlob: function (mimeType) { return _toBlob(buf, mimeType); }
    };
    return Object.freeze(image);
  }

  // ── Public static API ──────────────────────────────────────────

  /**
   * Creates an immutable OCRImage from a canvas-like source. Pixel
   * data is defensively copied out of the source at call time; no
   * reference to the source canvas or its context is retained.
   * @param {*} source - a canvas-like object exposing getContext('2d')
   * @returns {Promise<Object>} frozen image object
   * @throws {Error} on an invalid source
   */
  async function create(source) {
    try {
      _validateSource(source);
      const buf = _readSourcePixels(source);
      const image = _wrapBuffer(buf);
      _health.imagesProcessed += 1;
      return image;
    } catch (err) {
      _health.processingFailures += 1;
      throw err;
    }
  }

  /**
   * Applies a single pipeline step to an image, dispatching on
   * step.type. Unknown step types are rejected with a descriptive
   * Error rather than silently skipped or allowed to corrupt the
   * pipeline.
   * @param {Object} image
   * @param {Object} step
   * @returns {Object} the resulting image
   * @throws {Error}
   */
  function _applyStep(image, step) {
    if (!step || typeof step.type !== 'string' || step.type.trim() === '') {
      throw new Error('[OCRImage] processPipeline step must be an object with a non-empty "type" string.');
    }
    const params = step.params || {};
    switch (step.type) {
      case 'grayscale':
        return image.grayscale();
      case 'sharpen':
        return image.sharpen();
      case 'normalize':
        return image.normalize();
      case 'autocontrast':
        return image.autocontrast();
      case 'rotate':
        return image.rotate(params.degrees);
      case 'resize':
        return image.resize(params.width, params.height);
      case 'crop':
        return image.crop(params.x, params.y, params.width, params.height);
      case 'pad':
        return image.pad(params.top, params.right, params.bottom, params.left, params.color);
      case 'brightness':
        return image.brightness(params.delta);
      case 'contrast':
        return image.contrast(params.factor);
      case 'thumbnail':
        return image.thumbnail(params.maxWidth, params.maxHeight);
      default:
        throw new Error('[OCRImage] processPipeline encountered unknown step type: "' + step.type + '".');
    }
  }

  /**
   * Creates an image from source and applies a sequence of
   * preprocessing steps in order. Each step operates on the result
   * of the previous one; the original source is never mutated.
   * @param {*} source - a canvas-like object exposing getContext('2d')
   * @param {Array<{type:string, params?:Object}>} steps
   * @returns {Promise<Object>} the final frozen image object
   * @throws {Error} on an invalid source, invalid steps array, an
   *   unknown step type, or any step failing its own validation
   */
  async function processPipeline(source, steps) {
    if (!Array.isArray(steps)) {
      throw new Error('[OCRImage] processPipeline() steps must be an array.');
    }
    let image = await create(source);
    try {
      for (let i = 0; i < steps.length; i++) {
        image = _applyStep(image, steps[i]);
      }
      return image;
    } catch (err) {
      _health.processingFailures += 1;
      throw err;
    }
  }

  /**
   * Returns a frozen snapshot of real, module-level operational
   * telemetry: how many images have been successfully created, how
   * many creation/pipeline failures have occurred, and the module
   * version.
   * @returns {{imagesProcessed:number, processingFailures:number, version:string}}
   */
  function getHealthDiagnostics() {
    return Object.freeze({
      imagesProcessed: _health.imagesProcessed,
      processingFailures: _health.processingFailures,
      version: VERSION
    });
  }

  /**
   * Returns the module version string.
   * @returns {string}
   */
  function getVersion() {
    return VERSION;
  }

  /**
   * Frozen public API. The OCR Studio directive for this module's
   * test suite exercises create, processPipeline, and
   * getHealthDiagnostics. getVersion() is included in addition,
   * matching the versioning convention used by every other frozen
   * module — a deliberate parity addition, flagged in this module's
   * certification.
   */
  window.CozyOS.OCR.OCRImage = Object.freeze({
    create: create,
    processPipeline: processPipeline,
    getHealthDiagnostics: getHealthDiagnostics,
    getVersion: getVersion
  });
})();
