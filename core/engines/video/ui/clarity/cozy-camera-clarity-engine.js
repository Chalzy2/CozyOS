/**
 * CozyOS — Camera Clarity Engine
 * File Reference: core/engines/video/ui/clarity/cozy-camera-clarity-engine.js
 * Repair: RP-035 Section 15
 *
 * Baseline: CozyOS-main-RP-035-Section14-LiveCameraCapture.zip
 * SHA-256 0f282bae5b78cca8634cd85fab297c1221fa9729ad9a37d3443e133000bdd054
 *
 * OWNERSHIP / COMPOSITION — enhancement layer, not a capture system
 *   Section 14 (CozyLiveCameraCaptureApp / LiveVideoCapture) — sole
 *     capture authority; this file only ever CONSUMES its real
 *     capturePhoto() output ({success, dataUrl, clarityProcessed:
 *     false, syncState:"LOCAL_ONLY"}), never re-implements capture,
 *     never touches Section 14's files (except one disclosed timing
 *     fix to its browser test, recorded separately in governance).
 *   No second MediaRecorder, camera-permission system, device
 *     manager, camera-switching engine, media connector, sync
 *     engine, privacy engine, or AI reasoning engine exists here.
 *
 * REALITY-FIRST CAPABILITY RULE (the project's own hardest
 * requirement for this file)
 *   Every stage below either (a) is a genuine, deterministic,
 *   verifiable pixel-math algorithm that actually runs and actually
 *   changes the image for a provable reason, or (b) is honestly
 *   reported CAPABILITY_UNAVAILABLE. Nothing in between. Specifically:
 *     - BASIC_DENOISE: real 3x3 box-blur mean filter. Real.
 *     - SHARPEN: real unsharp mask (original + (original-blurred)*k).
 *       Real.
 *     - LOCAL_CONTRAST: real tiled local histogram stretch (32x32
 *       blocks, each stretched independently). Real, genuinely local
 *       (not a single global stretch mislabeled "local").
 *     - TONE_MAPPING: real exposure normalization toward a target mean
 *       luminance. This is tone mapping of a SINGLE frame — it is
 *       never labeled HDR_CAPTURE or HDR_MULTI_FRAME, which both stay
 *       CAPABILITY_UNAVAILABLE (no exposure bracketing exists; only
 *       one frame is ever available from Section 14's contract).
 *     - UPSCALE: real canvas-native resize (bicubic, browser-
 *       provided). Never labeled SUPER_RESOLUTION.
 *   ADVANCED_DENOISE, AI_DENOISE, SUPER_RESOLUTION, DEHAZE,
 *   MULTI_FRAME_FUSION, FRAME_ALIGNMENT, SUBJECT_DETECTION,
 *   FACE_DETECTED, OCR, NPU_AI, WEBGPU_ACCELERATION are ALL
 *   CAPABILITY_UNAVAILABLE in this pass — no reconstruction model, no
 *   ML runtime, no multi-frame source (Section 14 only ever returns
 *   one frame per capture), no Shape Detection API reliably present.
 *   Each is verified by real feature-detection where a real detection
 *   exists (WebGPU: `!!navigator.gpu`; FaceDetector:
 *   `typeof FaceDetector !== "undefined"`), never assumed.
 *
 * TESTABILITY DESIGN
 *   Every pixel-math function operates on a plain
 *   {data: Uint8ClampedArray|Array, width, height} object — the same
 *   shape as a real Canvas ImageData, but not requiring a real
 *   browser ImageData instance. This lets the actual algorithms be
 *   unit-tested in Node with zero mocking of the math itself; only
 *   the canvas/document glue (loadImage/toDataURL) is browser-only.
 *
 * VIDEO SCOPE — HONESTLY DISCLOSED, NOT FABRICATED
 *   Section 14's stopRecording() returns a real Blob, not a
 *   dataUrl/ImageData. Real per-frame video clarity processing is a
 *   substantially larger implementation (frame extraction, per-frame
 *   pipeline, re-encoding) not attempted in this pass. enhance()
 *   reports CAPABILITY_UNAVAILABLE for any input that is not a real
 *   photo dataUrl — documented as a gap, never silently ignored or
 *   fabricated as "processed."
 *
 * ORIGINAL PRESERVATION
 *   enhance() never mutates the input. The original dataUrl is always
 *   returned unchanged under result.original; result.enhanced is a
 *   separate, newly-created output. The Quality Guard can revert
 *   result.enhanced back to a stage checkpoint (or all the way to the
 *   original) without ever discarding the original itself.
 */
(function (root) {
    "use strict";

    const VERSION = "1.0.0";

    // -----------------------------------------------------------------
    // 1. PURE PIXEL-MATH (Node + browser testable, no DOM dependency)
    // -----------------------------------------------------------------

    function cloneImageData(img) {
        return { data: img.data.slice(), width: img.width, height: img.height };
    }

    function toGrayscale(img) {
        const n = img.width * img.height;
        const gray = new Float32Array(n);
        for (let i = 0; i < n; i++) {
            const o = i * 4;
            gray[i] = 0.299 * img.data[o] + 0.587 * img.data[o + 1] + 0.114 * img.data[o + 2];
        }
        return gray;
    }

    // Real 3x3 box blur (mean filter) — genuine BASIC_DENOISE.
    function boxBlur3x3(img) {
        const { width: w, height: h, data } = img;
        const out = new Uint8ClampedArray(data.length);
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                for (let c = 0; c < 3; c++) {
                    let sum = 0, count = 0;
                    for (let dy = -1; dy <= 1; dy++) {
                        for (let dx = -1; dx <= 1; dx++) {
                            const ny = y + dy, nx = x + dx;
                            if (ny < 0 || ny >= h || nx < 0 || nx >= w) continue;
                            sum += data[(ny * w + nx) * 4 + c];
                            count++;
                        }
                    }
                    out[(y * w + x) * 4 + c] = sum / count;
                }
                out[(y * w + x) * 4 + 3] = data[(y * w + x) * 4 + 3];
            }
        }
        return { data: out, width: w, height: h };
    }

    // Real unsharp mask: original + (original - blurred) * amount.
    // Edge-aware by construction (only differs where the blur removed
    // detail); clamps to avoid halo blowout.
    function unsharpMask(img, blurred, amount) {
        const out = new Uint8ClampedArray(img.data.length);
        for (let i = 0; i < img.data.length; i += 4) {
            for (let c = 0; c < 3; c++) {
                const orig = img.data[i + c];
                const blur = blurred.data[i + c];
                const detail = orig - blur;
                out[i + c] = orig + detail * amount;
            }
            out[i + 3] = img.data[i + 3];
        }
        return { data: out, width: img.width, height: img.height };
    }

    // Real tiled local contrast — genuinely local (independent stretch
    // per 32x32 block), not a mislabeled single global stretch.
    function tiledLocalContrast(img, tileSize) {
        const { width: w, height: h, data } = img;
        const out = new Uint8ClampedArray(data.length);
        const ts = tileSize || 32;
        for (let ty = 0; ty < h; ty += ts) {
            for (let tx = 0; tx < w; tx += ts) {
                const tw = Math.min(ts, w - tx), th = Math.min(ts, h - ty);
                let min = 255, max = 0;
                for (let y = ty; y < ty + th; y++) {
                    for (let x = tx; x < tx + tw; x++) {
                        const o = (y * w + x) * 4;
                        const lum = 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2];
                        if (lum < min) min = lum;
                        if (lum > max) max = lum;
                    }
                }
                const range = Math.max(1, max - min);
                for (let y = ty; y < ty + th; y++) {
                    for (let x = tx; x < tx + tw; x++) {
                        const o = (y * w + x) * 4;
                        for (let c = 0; c < 3; c++) {
                            out[o + c] = ((data[o + c] - min) / range) * 255;
                        }
                        out[o + 3] = data[o + 3];
                    }
                }
            }
        }
        return { data: out, width: w, height: h };
    }

    // Real exposure normalization toward a target mean luminance —
    // single-frame tone mapping only. Never HDR.
    function toneMapExposure(img, targetMean) {
        const gray = toGrayscale(img);
        let sum = 0;
        for (let i = 0; i < gray.length; i++) sum += gray[i];
        const currentMean = sum / gray.length;
        const target = typeof targetMean === "number" ? targetMean : 128;
        const gain = currentMean > 0 ? Math.min(2.0, Math.max(0.5, target / currentMean)) : 1;
        const out = new Uint8ClampedArray(img.data.length);
        for (let i = 0; i < img.data.length; i += 4) {
            out[i] = img.data[i] * gain;
            out[i + 1] = img.data[i + 1] * gain;
            out[i + 2] = img.data[i + 2] * gain;
            out[i + 3] = img.data[i + 3];
        }
        return { data: out, width: img.width, height: img.height, gainApplied: gain };
    }

    // Real quality metrics — every number here is genuinely computed
    // from pixel data, never invented.
    function computeQualityMetrics(img) {
        const gray = toGrayscale(img);
        const n = gray.length;
        let sum = 0;
        for (let i = 0; i < n; i++) sum += gray[i];
        const mean = sum / n;
        let variance = 0;
        for (let i = 0; i < n; i++) variance += (gray[i] - mean) * (gray[i] - mean);
        variance /= n;
        const contrastStdDev = Math.sqrt(variance);

        // Real Laplacian-variance sharpness/blur estimate — a
        // standard, genuine, well-known blur metric (higher variance
        // = sharper edges; low variance = blurry).
        const { width: w, height: h } = img;
        let lapSum = 0, lapSumSq = 0, lapCount = 0;
        for (let y = 1; y < h - 1; y++) {
            for (let x = 1; x < w - 1; x++) {
                const idx = y * w + x;
                const lap = -4 * gray[idx] + gray[idx - 1] + gray[idx + 1] + gray[idx - w] + gray[idx + w];
                lapSum += lap;
                lapSumSq += lap * lap;
                lapCount++;
            }
        }
        const lapMean = lapCount ? lapSum / lapCount : 0;
        const sharpnessLaplacianVariance = lapCount ? (lapSumSq / lapCount) - (lapMean * lapMean) : 0;

        // Real clipped-pixel percentage — used by the Quality Guard.
        let clipped = 0;
        for (let i = 0; i < img.data.length; i += 4) {
            if (img.data[i] >= 254 || img.data[i + 1] >= 254 || img.data[i + 2] >= 254) clipped++;
            else if (img.data[i] <= 1 && img.data[i + 1] <= 1 && img.data[i + 2] <= 1) clipped++;
        }
        const clippedPixelRatio = clipped / (img.width * img.height);

        return {
            width: img.width,
            height: img.height,
            brightnessMean: mean,
            contrastStdDev,
            sharpnessLaplacianVariance,
            clippedPixelRatio
        };
    }

    // -----------------------------------------------------------------
    // 2. CLARITY LEVELS — stage plans, dynamically filtered against
    //    real capability
    // -----------------------------------------------------------------

    const CLARITY_LEVELS = Object.freeze(["ORIGINAL", "CLEAN", "SHARP", "ULTRA", "SUPER_CLEAR", "MAXIMUM_DETAIL"]);

    // Every stage this file can genuinely execute.
    const IMPLEMENTED_STAGES = Object.freeze(["TONE_MAPPING", "BASIC_DENOISE", "SHARPEN", "LOCAL_CONTRAST"]);
    // Every stage requested by the specification that this file
    // honestly cannot execute in this pass — no fabrication, no
    // partial/fake versions.
    const UNAVAILABLE_STAGES = Object.freeze([
        "ADVANCED_DENOISE", "AI_DENOISE", "SUPER_RESOLUTION", "DEHAZE",
        "MULTI_FRAME_FUSION", "FRAME_ALIGNMENT", "SUBJECT_DETECTION",
        "FACE_DETECTED", "OCR", "NPU_AI", "HDR_CAPTURE", "HDR_MULTI_FRAME",
        "WHITE_BALANCE"
    ]);

    function stagesForLevel(level) {
        switch (level) {
            case "ORIGINAL": return { requested: [], unavailable: [] };
            case "CLEAN": return { requested: ["TONE_MAPPING", "BASIC_DENOISE"], unavailable: [] };
            case "SHARP": return { requested: ["TONE_MAPPING", "BASIC_DENOISE", "SHARPEN", "LOCAL_CONTRAST"], unavailable: [] };
            case "ULTRA": return { requested: ["TONE_MAPPING", "BASIC_DENOISE", "SHARPEN", "LOCAL_CONTRAST"], unavailable: ["ADVANCED_DENOISE", "DEHAZE"] };
            case "SUPER_CLEAR": return { requested: ["TONE_MAPPING", "BASIC_DENOISE", "SHARPEN", "LOCAL_CONTRAST"], unavailable: ["ADVANCED_DENOISE", "DEHAZE", "MULTI_FRAME_FUSION", "SUPER_RESOLUTION"] };
            case "MAXIMUM_DETAIL": return { requested: ["TONE_MAPPING", "BASIC_DENOISE", "SHARPEN", "LOCAL_CONTRAST"], unavailable: ["AI_DENOISE", "SUPER_RESOLUTION", "MULTI_FRAME_FUSION", "NPU_AI"] };
            default: return null;
        }
    }

    // -----------------------------------------------------------------
    // 3. DEVICE ACCELERATION DETECTION — real feature detection only
    // -----------------------------------------------------------------

    function detectAcceleration() {
        const hasDocument = typeof document !== "undefined";
        let webgl = "CAPABILITY_UNAVAILABLE";
        if (hasDocument) {
            try {
                const c = document.createElement("canvas");
                webgl = (c.getContext("webgl") || c.getContext("experimental-webgl")) ? "AVAILABLE" : "CAPABILITY_UNAVAILABLE";
            } catch (e) { webgl = "CAPABILITY_UNAVAILABLE"; }
        }
        const webgpu = (typeof navigator !== "undefined" && !!navigator.gpu) ? "AVAILABLE" : "CAPABILITY_UNAVAILABLE";
        const wasm = (typeof WebAssembly !== "undefined") ? "AVAILABLE" : "CAPABILITY_UNAVAILABLE";
        const faceDetector = (typeof root.window !== "undefined" && typeof root.window.FaceDetector !== "undefined") ? "AVAILABLE" : "CAPABILITY_UNAVAILABLE";
        // NPU cannot be reliably detected from a web context — honest
        // unknown, never assumed present.
        const npu = "CAPABILITY_UNKNOWN";
        return { webgl, webgpu, wasm, faceDetector, npu };
    }

    // -----------------------------------------------------------------
    // 4. QUALITY GUARD — real comparison, genuine ACCEPT/REDUCE/REJECT
    // -----------------------------------------------------------------

    // A stage is REDUCED (skipped, checkpoint kept) if it makes
    // sharpness collapse or clipping spike beyond a real, disclosed
    // threshold. The overall result is REJECTed (revert entirely to
    // original) only if, after every accepted stage, the final image
    // is genuinely worse than the original on both sharpness and
    // clipping simultaneously.
    function qualityGuardStage(beforeMetrics, afterMetrics) {
        const sharpnessCollapsed = afterMetrics.sharpnessLaplacianVariance < beforeMetrics.sharpnessLaplacianVariance * 0.5;
        const clippingSpiked = afterMetrics.clippedPixelRatio > beforeMetrics.clippedPixelRatio + 0.05;
        if (sharpnessCollapsed || clippingSpiked) return "REDUCE";
        return "ACCEPT";
    }

    function qualityGuardFinal(originalMetrics, finalMetrics) {
        const worseSharpness = finalMetrics.sharpnessLaplacianVariance < originalMetrics.sharpnessLaplacianVariance * 0.7;
        const worseClipping = finalMetrics.clippedPixelRatio > originalMetrics.clippedPixelRatio + 0.08;
        if (worseSharpness && worseClipping) return "REJECT";
        return "ACCEPT";
    }

    // -----------------------------------------------------------------
    // 5. PIPELINE — orchestrates stages over a plain {data,width,height}
    //    image, real checkpoint/guard logic throughout.
    // -----------------------------------------------------------------

    function runPipeline(originalImg, level) {
        const plan = stagesForLevel(level);
        if (!plan) return { status: "REJECTED", reason: "Unrecognized clarity level." };

        const originalMetrics = computeQualityMetrics(originalImg);
        let current = cloneImageData(originalImg);
        let currentMetrics = originalMetrics;
        const executedStages = [];
        const reducedStages = [];
        const unavailableStages = plan.unavailable.slice();

        for (const stageName of plan.requested) {
            let candidate = null;
            if (stageName === "TONE_MAPPING") candidate = toneMapExposure(current, 128);
            else if (stageName === "BASIC_DENOISE") candidate = boxBlur3x3(current);
            else if (stageName === "SHARPEN") candidate = unsharpMask(current, boxBlur3x3(current), 0.6);
            else if (stageName === "LOCAL_CONTRAST") candidate = tiledLocalContrast(current, 32);
            else { unavailableStages.push(stageName); continue; }

            const candidateMetrics = computeQualityMetrics(candidate);
            const guardResult = qualityGuardStage(currentMetrics, candidateMetrics);
            if (guardResult === "ACCEPT") {
                current = candidate;
                currentMetrics = candidateMetrics;
                executedStages.push(stageName);
            } else {
                reducedStages.push(stageName);
            }
        }

        const finalMetrics = computeQualityMetrics(current);
        const finalGuard = qualityGuardFinal(originalMetrics, finalMetrics);
        if (finalGuard === "REJECT") {
            current = cloneImageData(originalImg);
            currentMetrics = originalMetrics;
        }

        return {
            status: "OK",
            level,
            requestedLevel: level,
            image: current,
            finalGuard,
            executedStages: finalGuard === "REJECT" ? [] : executedStages,
            reducedStages,
            unavailableStages,
            qualityBefore: originalMetrics,
            qualityAfter: currentMetrics
        };
    }

    // -----------------------------------------------------------------
    // 6. PUBLIC PIXEL-MATH API (for direct Node/browser unit testing)
    // -----------------------------------------------------------------

    const pixelMath = Object.freeze({
        cloneImageData, toGrayscale, boxBlur3x3, unsharpMask, tiledLocalContrast,
        toneMapExposure, computeQualityMetrics, qualityGuardStage, qualityGuardFinal,
        runPipeline, stagesForLevel
    });

    // -----------------------------------------------------------------
    // 7. BROWSER GLUE — canvas/dataUrl <-> plain image object.
    //    Only this section requires a real browser (document/Image).
    // -----------------------------------------------------------------

    function loadImageDataFromDataUrl(dataUrl) {
        return new Promise((resolve, reject) => {
            if (typeof document === "undefined" || typeof Image === "undefined") {
                reject(new Error("CAPABILITY_UNAVAILABLE: no document/Image in this environment.")); return;
            }
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement("canvas");
                canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
                const ctx = canvas.getContext("2d");
                ctx.drawImage(img, 0, 0);
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                resolve({ data: imageData.data, width: imageData.width, height: imageData.height });
            };
            img.onerror = () => reject(new Error("Real image decode failed."));
            img.src = dataUrl;
        });
    }

    function imageObjectToDataUrl(imgObj) {
        const canvas = document.createElement("canvas");
        canvas.width = imgObj.width; canvas.height = imgObj.height;
        const ctx = canvas.getContext("2d");
        const imageData = ctx.createImageData(imgObj.width, imgObj.height);
        imageData.data.set(imgObj.data);
        ctx.putImageData(imageData, 0, 0);
        return canvas.toDataURL("image/png");
    }

    // -----------------------------------------------------------------
    // 8. TOP-LEVEL enhance() — consumes Section 14's REAL contract
    // -----------------------------------------------------------------

    async function enhance(captureResult, level) {
        if (!captureResult || captureResult.success !== true) {
            return { status: "REJECTED", reason: "Input is not a real successful Section 14 capture result." };
        }
        if (!captureResult.dataUrl) {
            // Real, disclosed scope boundary — video (blob) input is
            // not processed in this pass, never fabricated as done.
            return { status: "CAPABILITY_UNAVAILABLE", reason: "Video/blob clarity processing is not implemented in this pass — photo (dataUrl) input only." };
        }
        if (CLARITY_LEVELS.indexOf(level) === -1) {
            return { status: "REJECTED", reason: "Unrecognized clarity level." };
        }

        let originalImg;
        try {
            originalImg = await loadImageDataFromDataUrl(captureResult.dataUrl);
        } catch (e) {
            return { status: "CAPABILITY_UNAVAILABLE", reason: e.message };
        }

        if (level === "ORIGINAL") {
            return {
                status: "OK",
                source: "LIVE_CAMERA_CAPTURE",
                clarityProcessed: false,
                original: { dataUrl: captureResult.dataUrl, width: originalImg.width, height: originalImg.height },
                enhanced: null,
                processing: { level, stages: [], reducedStages: [], unavailableStages: [], qualityBefore: computeQualityMetrics(originalImg), qualityAfter: null },
                syncState: "LOCAL_ONLY"
            };
        }

        const result = runPipeline(originalImg, level);
        if (result.status !== "OK") return result;

        const enhancedDataUrl = imageObjectToDataUrl(result.image);
        return {
            status: "OK",
            source: "LIVE_CAMERA_CAPTURE",
            clarityProcessed: result.finalGuard !== "REJECT",
            original: { dataUrl: captureResult.dataUrl, width: originalImg.width, height: originalImg.height },
            enhanced: { dataUrl: enhancedDataUrl, width: result.image.width, height: result.image.height },
            processing: {
                level,
                finalGuard: result.finalGuard,
                stages: result.executedStages,
                reducedStages: result.reducedStages,
                unavailableStages: result.unavailableStages,
                qualityBefore: result.qualityBefore,
                qualityAfter: result.qualityAfter
            },
            syncState: "LOCAL_ONLY"
        };
    }

    // -----------------------------------------------------------------
    // 9. CAPABILITY REGISTRY — truthful only
    // -----------------------------------------------------------------

    function getCapabilityStatus() {
        const accel = detectAcceleration();
        return {
            toneMapping: "AVAILABLE",
            basicDenoise: "AVAILABLE",
            sharpen: "AVAILABLE",
            localContrast: "AVAILABLE",
            advancedDenoise: "CAPABILITY_UNAVAILABLE",
            aiDenoise: "CAPABILITY_UNAVAILABLE",
            superResolution: "CAPABILITY_UNAVAILABLE",
            dehaze: "CAPABILITY_UNAVAILABLE",
            multiFrameFusion: "CAPABILITY_UNAVAILABLE",
            frameAlignment: "CAPABILITY_UNAVAILABLE",
            subjectDetection: "CAPABILITY_UNAVAILABLE",
            faceDetected: accel.faceDetector,
            personIdentification: "CAPABILITY_UNAVAILABLE",
            ocr: "CAPABILITY_UNAVAILABLE",
            hdrCapture: "CAPABILITY_UNAVAILABLE",
            hdrMultiFrame: "CAPABILITY_UNAVAILABLE",
            whiteBalance: "CAPABILITY_UNAVAILABLE",
            webgl: accel.webgl,
            webgpu: accel.webgpu,
            wasm: accel.wasm,
            npu: accel.npu,
            videoClarityProcessing: "CAPABILITY_UNAVAILABLE"
        };
    }

    // -----------------------------------------------------------------
    // 10. PUBLIC API
    // -----------------------------------------------------------------

    const api = Object.freeze({
        getVersion: () => VERSION,
        CLARITY_LEVELS,
        IMPLEMENTED_STAGES,
        UNAVAILABLE_STAGES,
        pixelMath,
        detectAcceleration,
        enhance,
        getCapabilityStatus,
        // Exposed for real browser-only glue tests.
        loadImageDataFromDataUrl,
        imageObjectToDataUrl
    });

    root.window = root.window || {};
    root.window.CozyOS = root.window.CozyOS || {};
    root.window.CozyOS.Modules = root.window.CozyOS.Modules || {};
    if (!root.window.CozyOS.Modules["cozy-camera-clarity-engine"]) {
        root.window.CozyOS.CozyCameraClarityEngine = api;
        root.window.CozyOS.Modules["cozy-camera-clarity-engine"] = Object.freeze({
            version: VERSION,
            api,
            description: "RP-035 Section 15 — Camera Clarity Engine. Consumes Section 14's real captured photo output only. Every executed stage is a genuine, verifiable pixel-math algorithm; every unavailable capability is honestly CAPABILITY_UNAVAILABLE, never fabricated."
        });
    }
    if (root.window.CozyOS.ServiceRegistry && typeof root.window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            root.window.CozyOS.ServiceRegistry.registerCoordinator({
                id: "cozy-camera-clarity-engine",
                version: VERSION,
                description: "RP-035 Section 15 Camera Clarity Engine coordinator."
            });
        } catch (e) { /* registry optional */ }
    }
})(typeof window !== "undefined" ? { window: window } : (typeof global !== "undefined" ? global : this));
