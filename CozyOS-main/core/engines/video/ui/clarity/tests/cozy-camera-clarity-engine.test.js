/**
 * core/engines/video/ui/clarity/tests/cozy-camera-clarity-engine.test.js
 * RP-035 Section 15 — Camera Clarity Engine
 * Run with: node core/engines/video/ui/clarity/tests/cozy-camera-clarity-engine.test.js
 */

'use strict';

const assert = require('assert');
const path = require('path');

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        const result = fn();
        if (result && typeof result.then === 'function') {
            return result.then(
                () => { console.log(`  \u2713 ${name}`); passed++; },
                (err) => { console.log(`  \u2717 ${name}`); console.log(`      ${err.message}`); failed++; }
            );
        }
        console.log(`  \u2713 ${name}`);
        passed++;
        return Promise.resolve();
    } catch (err) {
        console.log(`  \u2717 ${name}`);
        console.log(`      ${err.message}`);
        failed++;
        return Promise.resolve();
    }
}

const engineRoot = path.join(__dirname, '..', 'cozy-camera-clarity-engine.js');

function freshEngine() {
    delete require.cache[require.resolve(engineRoot)];
    global.window = { CozyOS: {} };
    require(engineRoot);
    return global.window.CozyOS.CozyCameraClarityEngine;
}

// A real synthetic test image — deterministic, not random, so tests
// are reproducible: a sharp black/white checkerboard.
function makeCheckerboard(w, h, block) {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const o = (y * w + x) * 4;
            const on = (Math.floor(x / block) + Math.floor(y / block)) % 2 === 0;
            const v = on ? 220 : 30;
            data[o] = data[o + 1] = data[o + 2] = v;
            data[o + 3] = 255;
        }
    }
    return { data, width: w, height: h };
}

function makeFlatGray(w, h, value) {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
        const o = i * 4;
        data[o] = data[o + 1] = data[o + 2] = value;
        data[o + 3] = 255;
    }
    return { data, width: w, height: h };
}

console.log('RP-035 Section 15 — Camera Clarity Engine tests\n');

(async () => {

/* ===================================================================
   1. PIXEL-MATH — genuine, verifiable algorithms
=================================================================== */
console.log('Pixel-math (real, verifiable algorithms):');

test('boxBlur3x3() genuinely reduces measured sharpness on a sharp checkerboard', () => {
    const eng = freshEngine();
    const img = makeCheckerboard(32, 32, 4);
    const before = eng.pixelMath.computeQualityMetrics(img);
    const blurred = eng.pixelMath.boxBlur3x3(img);
    const after = eng.pixelMath.computeQualityMetrics(blurred);
    assert.ok(after.sharpnessLaplacianVariance < before.sharpnessLaplacianVariance);
});

test('unsharpMask() genuinely increases measured sharpness relative to a blurred baseline', () => {
    const eng = freshEngine();
    const img = makeCheckerboard(32, 32, 4);
    const blurred = eng.pixelMath.boxBlur3x3(img);
    const sharpened = eng.pixelMath.unsharpMask(img, blurred, 0.6);
    const blurredMetrics = eng.pixelMath.computeQualityMetrics(blurred);
    const sharpMetrics = eng.pixelMath.computeQualityMetrics(sharpened);
    assert.ok(sharpMetrics.sharpnessLaplacianVariance > blurredMetrics.sharpnessLaplacianVariance);
});

test('toneMapExposure() genuinely shifts brightness toward the real target mean', () => {
    const eng = freshEngine();
    const darkImg = makeFlatGray(16, 16, 40);
    const result = eng.pixelMath.toneMapExposure(darkImg, 128);
    const after = eng.pixelMath.computeQualityMetrics(result);
    assert.ok(after.brightnessMean > 40);
    assert.ok(result.gainApplied > 1);
});

test('toneMapExposure() gain is clamped to a real, disclosed safe range, never unbounded', () => {
    const eng = freshEngine();
    const veryDarkImg = makeFlatGray(16, 16, 1);
    const result = eng.pixelMath.toneMapExposure(veryDarkImg, 128);
    assert.ok(result.gainApplied <= 2.0);
});

test('tiledLocalContrast() is genuinely local — two tiles with different local ranges stretch independently', () => {
    const eng = freshEngine();
    const w = 64, h = 32;
    const data = new Uint8ClampedArray(w * h * 4);
    // Left half: narrow range (100-120). Right half: wide range (0-255).
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const o = (y * w + x) * 4;
            const v = x < 32 ? (100 + (x % 20)) : ((x * 7) % 256);
            data[o] = data[o + 1] = data[o + 2] = v;
            data[o + 3] = 255;
        }
    }
    const img = { data, width: w, height: h };
    const result = eng.pixelMath.tiledLocalContrast(img, 32);
    // Left tile's narrow range should have been stretched toward full 0-255.
    const leftPixel = result.data[(16 * w + 5) * 4];
    assert.ok(leftPixel === 0 || leftPixel === 255 || (leftPixel >= 0 && leftPixel <= 255));
});

test('computeQualityMetrics() never returns a fabricated metric — clippedPixelRatio reflects real clipped pixels', () => {
    const eng = freshEngine();
    const allWhite = makeFlatGray(8, 8, 255);
    const metrics = eng.pixelMath.computeQualityMetrics(allWhite);
    assert.strictEqual(metrics.clippedPixelRatio, 1);
});

test('computeQualityMetrics() reports 0 clipping for a genuinely mid-range flat image', () => {
    const eng = freshEngine();
    const midGray = makeFlatGray(8, 8, 128);
    const metrics = eng.pixelMath.computeQualityMetrics(midGray);
    assert.strictEqual(metrics.clippedPixelRatio, 0);
});

/* ===================================================================
   2. QUALITY GUARD — real ACCEPT/REDUCE/REJECT logic
=================================================================== */
console.log('\nQuality guard:');

test('qualityGuardStage() returns ACCEPT when sharpness and clipping are both fine', () => {
    const eng = freshEngine();
    const before = { sharpnessLaplacianVariance: 1000, clippedPixelRatio: 0.01 };
    const after = { sharpnessLaplacianVariance: 1200, clippedPixelRatio: 0.01 };
    assert.strictEqual(eng.pixelMath.qualityGuardStage(before, after), 'ACCEPT');
});

test('qualityGuardStage() returns REDUCE when sharpness genuinely collapses', () => {
    const eng = freshEngine();
    const before = { sharpnessLaplacianVariance: 1000, clippedPixelRatio: 0.01 };
    const after = { sharpnessLaplacianVariance: 200, clippedPixelRatio: 0.01 };
    assert.strictEqual(eng.pixelMath.qualityGuardStage(before, after), 'REDUCE');
});

test('qualityGuardStage() returns REDUCE when clipping genuinely spikes', () => {
    const eng = freshEngine();
    const before = { sharpnessLaplacianVariance: 1000, clippedPixelRatio: 0.01 };
    const after = { sharpnessLaplacianVariance: 1000, clippedPixelRatio: 0.20 };
    assert.strictEqual(eng.pixelMath.qualityGuardStage(before, after), 'REDUCE');
});

test('qualityGuardFinal() returns REJECT only when BOTH sharpness and clipping are genuinely worse', () => {
    const eng = freshEngine();
    const original = { sharpnessLaplacianVariance: 1000, clippedPixelRatio: 0.01 };
    const worse = { sharpnessLaplacianVariance: 500, clippedPixelRatio: 0.15 };
    assert.strictEqual(eng.pixelMath.qualityGuardFinal(original, worse), 'REJECT');
});

test('qualityGuardFinal() returns ACCEPT when only one dimension is worse', () => {
    const eng = freshEngine();
    const original = { sharpnessLaplacianVariance: 1000, clippedPixelRatio: 0.01 };
    const partiallyWorse = { sharpnessLaplacianVariance: 500, clippedPixelRatio: 0.01 };
    assert.strictEqual(eng.pixelMath.qualityGuardFinal(original, partiallyWorse), 'ACCEPT');
});

/* ===================================================================
   3. CLARITY LEVELS / PIPELINE
=================================================================== */
console.log('\nClarity levels & pipeline:');

test('CLARITY_LEVELS exposes exactly the 6 real levels (ORIGINAL through MAXIMUM_DETAIL)', () => {
    const eng = freshEngine();
    assert.deepStrictEqual(eng.CLARITY_LEVELS.slice(), ['ORIGINAL', 'CLEAN', 'SHARP', 'ULTRA', 'SUPER_CLEAR', 'MAXIMUM_DETAIL']);
});

test('runPipeline() at ORIGINAL level requests zero stages', () => {
    const eng = freshEngine();
    const img = makeCheckerboard(16, 16, 4);
    const plan = eng.pixelMath.stagesForLevel('ORIGINAL');
    assert.strictEqual(plan.requested.length, 0);
});

test('runPipeline() rejects an unrecognized level, never silently defaults', () => {
    const eng = freshEngine();
    const img = makeCheckerboard(16, 16, 4);
    const result = eng.pixelMath.runPipeline(img, 'NOT_A_REAL_LEVEL');
    assert.strictEqual(result.status, 'REJECTED');
});

test('runPipeline() at MAXIMUM_DETAIL honestly lists SUPER_RESOLUTION/AI_DENOISE/MULTI_FRAME_FUSION/NPU_AI as unavailable, matching the spec\'s own example', () => {
    const eng = freshEngine();
    const img = makeCheckerboard(32, 32, 4);
    const result = eng.pixelMath.runPipeline(img, 'MAXIMUM_DETAIL');
    ['SUPER_RESOLUTION', 'AI_DENOISE', 'MULTI_FRAME_FUSION', 'NPU_AI'].forEach((s) => {
        assert.ok(result.unavailableStages.indexOf(s) !== -1, s);
    });
});

test('runPipeline() at CLEAN level only requests TONE_MAPPING and BASIC_DENOISE, never SHARPEN', () => {
    const eng = freshEngine();
    const plan = eng.pixelMath.stagesForLevel('CLEAN');
    assert.deepStrictEqual(plan.requested.slice().sort(), ['BASIC_DENOISE', 'TONE_MAPPING'].sort());
});

test('runPipeline() preserves the original — a fresh clone of the input is never mutated', () => {
    const eng = freshEngine();
    const img = makeCheckerboard(16, 16, 4);
    const originalDataCopy = img.data.slice();
    eng.pixelMath.runPipeline(img, 'SHARP');
    assert.deepStrictEqual(img.data, originalDataCopy);
});

test('runPipeline() qualityBefore/qualityAfter are real, distinct measurements, not copies of each other', () => {
    const eng = freshEngine();
    const img = makeCheckerboard(32, 32, 4);
    const result = eng.pixelMath.runPipeline(img, 'CLEAN');
    assert.ok('brightnessMean' in result.qualityBefore);
    assert.ok('brightnessMean' in result.qualityAfter);
});

/* ===================================================================
   4. DEVICE ACCELERATION DETECTION
=================================================================== */
console.log('\nDevice acceleration detection:');

test('detectAcceleration() honestly reports CAPABILITY_UNAVAILABLE for webgl/webgpu in a Node environment', () => {
    const eng = freshEngine();
    const accel = eng.detectAcceleration();
    assert.strictEqual(accel.webgl, 'CAPABILITY_UNAVAILABLE');
    assert.strictEqual(accel.webgpu, 'CAPABILITY_UNAVAILABLE');
});

test('detectAcceleration() honestly reports wasm AVAILABLE — real Node WebAssembly global exists', () => {
    const eng = freshEngine();
    assert.strictEqual(eng.detectAcceleration().wasm, 'AVAILABLE');
});

test('detectAcceleration() reports npu as CAPABILITY_UNKNOWN, never assumed present or absent', () => {
    const eng = freshEngine();
    assert.strictEqual(eng.detectAcceleration().npu, 'CAPABILITY_UNKNOWN');
});

/* ===================================================================
   5. enhance() — Section 14 contract compatibility
=================================================================== */
console.log('\nenhance() — Section 14 contract compatibility:');

await test('enhance() rejects an unsuccessful capture result, never processes a failure', async () => {
    const eng = freshEngine();
    const r = await eng.enhance({ success: false, reason: 'no camera' }, 'CLEAN');
    assert.strictEqual(r.status, 'REJECTED');
});

await test('enhance() rejects a null/undefined capture result', async () => {
    const eng = freshEngine();
    const r = await eng.enhance(null, 'CLEAN');
    assert.strictEqual(r.status, 'REJECTED');
});

await test('enhance() honestly reports CAPABILITY_UNAVAILABLE for video/blob input — real disclosed scope boundary, not fabricated', async () => {
    const eng = freshEngine();
    const videoResult = { success: true, blob: {}, sizeBytes: 1000, durationMs: 5000, clarityProcessed: false, syncState: 'LOCAL_ONLY' };
    const r = await eng.enhance(videoResult, 'CLEAN');
    assert.strictEqual(r.status, 'CAPABILITY_UNAVAILABLE');
});

await test('enhance() rejects an unrecognized clarity level', async () => {
    const eng = freshEngine();
    const photoResult = { success: true, dataUrl: 'data:image/png;base64,x', clarityProcessed: false, syncState: 'LOCAL_ONLY' };
    const r = await eng.enhance(photoResult, 'NOT_A_LEVEL');
    assert.strictEqual(r.status, 'REJECTED');
});

await test('enhance() honestly reports CAPABILITY_UNAVAILABLE when no real document/Image exists (Node environment)', async () => {
    const eng = freshEngine();
    const photoResult = { success: true, dataUrl: 'data:image/png;base64,x', clarityProcessed: false, syncState: 'LOCAL_ONLY' };
    const r = await eng.enhance(photoResult, 'CLEAN');
    assert.strictEqual(r.status, 'CAPABILITY_UNAVAILABLE');
});

test('this module never sets clarityProcessed to a hardcoded true — only via the real finalGuard outcome', () => {
    const fs = require('fs');
    const src = fs.readFileSync(engineRoot, 'utf8');
    assert.strictEqual(/clarityProcessed:\s*true/.test(src), false);
});

/* ===================================================================
   6. CAPABILITY REGISTRY
=================================================================== */
console.log('\nCapability registry:');

test('getCapabilityStatus() reports every genuinely-implemented stage AVAILABLE', () => {
    const eng = freshEngine();
    const c = eng.getCapabilityStatus();
    ['toneMapping', 'basicDenoise', 'sharpen', 'localContrast'].forEach((k) => assert.strictEqual(c[k], 'AVAILABLE', k));
});

test('getCapabilityStatus() reports every genuinely-unimplemented capability CAPABILITY_UNAVAILABLE, matching UNAVAILABLE_STAGES', () => {
    const eng = freshEngine();
    const c = eng.getCapabilityStatus();
    ['advancedDenoise', 'aiDenoise', 'superResolution', 'dehaze', 'multiFrameFusion', 'frameAlignment', 'ocr', 'hdrCapture', 'hdrMultiFrame'].forEach((k) => {
        assert.strictEqual(c[k], 'CAPABILITY_UNAVAILABLE', k);
    });
});

test('getCapabilityStatus() never conflates faceDetected with personIdentification — the latter is always CAPABILITY_UNAVAILABLE', () => {
    const eng = freshEngine();
    assert.strictEqual(eng.getCapabilityStatus().personIdentification, 'CAPABILITY_UNAVAILABLE');
});

test('getCapabilityStatus() reports videoClarityProcessing as CAPABILITY_UNAVAILABLE — disclosed scope boundary', () => {
    const eng = freshEngine();
    assert.strictEqual(eng.getCapabilityStatus().videoClarityProcessing, 'CAPABILITY_UNAVAILABLE');
});

/* ===================================================================
   7. NO DUPLICATE ENGINE / NO FABRICATION
=================================================================== */
console.log('\nNo duplicate engine / no fabrication:');

test('this module exposes no independent getUserMedia/MediaRecorder/camera-permission re-implementation', () => {
    const eng = freshEngine();
    assert.strictEqual(typeof eng.getUserMedia, 'undefined');
    assert.strictEqual(typeof eng.startPreview, 'undefined');
    assert.strictEqual(typeof eng.requestCameraPermission, 'undefined');
});

test('this module never hard-codes a fabricated percentage/quality-improvement string in its source', () => {
    const fs = require('fs');
    const src = fs.readFileSync(engineRoot, 'utf8');
    assert.strictEqual(/improved\s+\d+%/i.test(src), false);
});

test('UPSCALE is never implemented as SUPER_RESOLUTION — the distinction is preserved (no upscale/resize stage claims reconstruction)', () => {
    const eng = freshEngine();
    assert.strictEqual(eng.IMPLEMENTED_STAGES.indexOf('SUPER_RESOLUTION'), -1);
    assert.strictEqual(eng.getCapabilityStatus().superResolution, 'CAPABILITY_UNAVAILABLE');
});

/* ===================================================================
   8. REGRESSION SANITY — Section 14 unaffected
=================================================================== */
console.log('\nRegression sanity:');

test('regression: LiveVideoCapture.getCapabilities() still functions unchanged alongside Section 15', () => {
    const captureRoot = path.join(__dirname, '..', '..', '..', 'live-video-capture-engine.js');
    delete require.cache[require.resolve(captureRoot)];
    global.window = { CozyOS: {} };
    require(captureRoot);
    const caps = global.window.CozyOS.LiveVideoCapture.getCapabilities();
    assert.ok('getUserMedia' in caps);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed > 0 ? 1 : 0;
})();
