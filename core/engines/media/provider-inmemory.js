/**
 * =============================================================================
 * CozyOS Media Engine — Reference In-Memory Provider
 * File: core/engines/media/provider-inmemory.js
 * =============================================================================
 *
 * NOT A REAL CODEC/GPU ADAPTER (Rule 6 — Honest Engineering).
 *
 * This runtime has no libvips/ffmpeg/GPU access. Rather than fabricate
 * "successful" JPEG/PNG/MP4 encode/decode, this reference provider does two
 * things honestly:
 *   1. Pixel-level ops (resize/crop/rotate/flip/brightness/contrast/
 *      saturation/grayscale/blur/sharpen/composite) operate for real on a
 *      plain RGBA byte buffer (an "ImageHandle": {width,height,data}) —
 *      these are genuine, executed pixel math, not stubs.
 *   2. Container encode/decode (JPEG/PNG/MP4/etc.) has no real codec
 *      available in this sandbox, so it is implemented as a documented
 *      structural envelope (JSON-wrapped raw bytes) — NOT a real codec —
 *      so every Media Engine method returns a real value with real shape
 *      instead of throwing everywhere or fabricating a fake "success". A
 *      production deployment swaps this provider for a real libvips/
 *      sharp/ffmpeg-wasm adapter without changing any engine above it.
 * =============================================================================
 */

'use strict';

function clamp255(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }

function createImage(width, height, fill = [0, 0, 0, 255]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = fill[0]; data[i + 1] = fill[1]; data[i + 2] = fill[2]; data[i + 3] = fill[3];
  }
  return { width, height, data };
}

function resize(img, targetWidth, targetHeight) {
  const out = new Uint8ClampedArray(targetWidth * targetHeight * 4);
  const xRatio = img.width / targetWidth;
  const yRatio = img.height / targetHeight;
  for (let y = 0; y < targetHeight; y++) {
    for (let x = 0; x < targetWidth; x++) {
      const srcX = Math.min(img.width - 1, Math.floor(x * xRatio));
      const srcY = Math.min(img.height - 1, Math.floor(y * yRatio));
      const srcI = (srcY * img.width + srcX) * 4;
      const dstI = (y * targetWidth + x) * 4;
      out[dstI] = img.data[srcI]; out[dstI + 1] = img.data[srcI + 1];
      out[dstI + 2] = img.data[srcI + 2]; out[dstI + 3] = img.data[srcI + 3];
    }
  }
  return { width: targetWidth, height: targetHeight, data: out };
}

function crop(img, x, y, w, h) {
  if (x < 0 || y < 0 || x + w > img.width || y + h > img.height) {
    throw new Error('[MediaProvider] crop() bounds exceed image dimensions.');
  }
  const out = new Uint8ClampedArray(w * h * 4);
  for (let row = 0; row < h; row++) {
    const srcStart = ((y + row) * img.width + x) * 4;
    const dstStart = (row * w) * 4;
    out.set(img.data.subarray(srcStart, srcStart + w * 4), dstStart);
  }
  return { width: w, height: h, data: out };
}

function rotate(img, degrees) {
  const norm = ((degrees % 360) + 360) % 360;
  if (norm !== 90 && norm !== 180 && norm !== 270) {
    throw new Error('[MediaProvider] rotate() reference provider only supports 90/180/270.');
  }
  if (norm === 180) {
    const out = new Uint8ClampedArray(img.data.length);
    const total = img.width * img.height;
    for (let i = 0; i < total; i++) {
      out.set(img.data.subarray(i * 4, i * 4 + 4), (total - 1 - i) * 4);
    }
    return { width: img.width, height: img.height, data: out };
  }
  const newW = img.height, newH = img.width;
  const out = new Uint8ClampedArray(newW * newH * 4);
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const srcI = (y * img.width + x) * 4;
      let dstX, dstY;
      if (norm === 90) { dstX = img.height - 1 - y; dstY = x; }
      else { dstX = y; dstY = img.width - 1 - x; }
      const dstI = (dstY * newW + dstX) * 4;
      out.set(img.data.subarray(srcI, srcI + 4), dstI);
    }
  }
  return { width: newW, height: newH, data: out };
}

function flip(img, axis) {
  const out = new Uint8ClampedArray(img.data.length);
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const srcI = (y * img.width + x) * 4;
      const srcX = axis === 'horizontal' ? img.width - 1 - x : x;
      const srcY = axis === 'vertical' ? img.height - 1 - y : y;
      const dstI = (srcY * img.width + srcX) * 4;
      out.set(img.data.subarray(srcI, srcI + 4), dstI);
    }
  }
  return { width: img.width, height: img.height, data: out };
}

function adjust(img, { brightness = 0, contrast = 0, saturation = 0 } = {}) {
  const out = new Uint8ClampedArray(img.data.length);
  const contrastFactor = (259 * (contrast + 255)) / (255 * (259 - contrast));
  for (let i = 0; i < img.data.length; i += 4) {
    let r = img.data[i], g = img.data[i + 1], b = img.data[i + 2];
    r = clamp255(contrastFactor * (r - 128) + 128 + brightness);
    g = clamp255(contrastFactor * (g - 128) + 128 + brightness);
    b = clamp255(contrastFactor * (b - 128) + 128 + brightness);
    if (saturation !== 0) {
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      const s = 1 + saturation / 100;
      r = clamp255(gray + (r - gray) * s);
      g = clamp255(gray + (g - gray) * s);
      b = clamp255(gray + (b - gray) * s);
    }
    out[i] = r; out[i + 1] = g; out[i + 2] = b; out[i + 3] = img.data[i + 3];
  }
  return { width: img.width, height: img.height, data: out };
}

function grayscale(img) {
  return adjust(img, { saturation: -100 });
}

function convolve3x3(img, kernel, divisor = 1) {
  const out = new Uint8ClampedArray(img.data.length);
  const { width, height, data } = img;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const sx = Math.min(width - 1, Math.max(0, x + kx));
          const sy = Math.min(height - 1, Math.max(0, y + ky));
          const si = (sy * width + sx) * 4;
          const k = kernel[(ky + 1) * 3 + (kx + 1)];
          r += data[si] * k; g += data[si + 1] * k; b += data[si + 2] * k;
        }
      }
      const di = (y * width + x) * 4;
      out[di] = clamp255(r / divisor); out[di + 1] = clamp255(g / divisor);
      out[di + 2] = clamp255(b / divisor); out[di + 3] = data[di + 3];
    }
  }
  return { width, height, data: out };
}

function blur(img, radius = 1) {
  let current = img;
  for (let i = 0; i < Math.max(1, radius); i++) {
    current = convolve3x3(current, [1, 1, 1, 1, 1, 1, 1, 1, 1], 9);
  }
  return current;
}

function sharpen(img) {
  return convolve3x3(img, [0, -1, 0, -1, 5, -1, 0, -1, 0], 1);
}

/** Composite `fg` over `bg` using a same-size 0..255 alpha `mask` (255 = keep fg). */
function composite(fg, bg, mask) {
  if (fg.width !== bg.width || fg.height !== bg.height) {
    throw new Error('[MediaProvider] composite() requires foreground/background of equal dimensions.');
  }
  const out = new Uint8ClampedArray(fg.data.length);
  const pixels = fg.width * fg.height;
  for (let p = 0; p < pixels; p++) {
    const i = p * 4;
    const a = mask ? mask[p] / 255 : 1;
    out[i] = fg.data[i] * a + bg.data[i] * (1 - a);
    out[i + 1] = fg.data[i + 1] * a + bg.data[i + 1] * (1 - a);
    out[i + 2] = fg.data[i + 2] * a + bg.data[i + 2] * (1 - a);
    out[i + 3] = 255;
  }
  return { width: fg.width, height: fg.height, data: out };
}

/** Honest structural stand-in for a real container codec (see file header). */
function encodeContainer(img, format) {
  return {
    format,
    encoded: true,
    envelope: 'structural-reference-not-real-codec',
    width: img.width,
    height: img.height,
    byteLength: img.data.length,
    payload: Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength).toString('base64')
  };
}

function decodeContainer(container) {
  if (!container || container.envelope !== 'structural-reference-not-real-codec') {
    throw new Error('[MediaProvider] decodeContainer() cannot decode a payload this reference provider did not encode.');
  }
  const buf = Buffer.from(container.payload, 'base64');
  return { width: container.width, height: container.height, data: new Uint8ClampedArray(buf) };
}

function createInMemoryMediaProvider(type = 'reference') {
  return Object.freeze({
    type,
    createImage, resize, crop, rotate, flip, adjust, grayscale, blur, sharpen, composite,
    encodeContainer, decodeContainer
  });
}

export { createInMemoryMediaProvider };
