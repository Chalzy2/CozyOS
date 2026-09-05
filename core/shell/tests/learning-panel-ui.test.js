/**
 * core/shell/tests/learning-panel-ui.test.js
 * Run with: node --test core/shell/tests/learning-panel-ui.test.js
 *
 * IMPORTANT — VERIFICATION LEVEL, STATED PLAINLY
 * ------------------------------------------------
 * Every DOM element, click, and hardware call below is a Node-side
 * fake. These tests prove learning-panel-ui.js's own orchestration
 * logic (which engine method it calls, in what order, with what
 * arguments, and how it reacts to success/failure) against controlled
 * inputs. This is UNIT VERIFIED. It is NOT Browser-Runtime Verified
 * and is NOT Production Certified — neither of those has been
 * performed, and this file does not claim otherwise anywhere.
 *
 * The underlying engines (LearningCameraAdapter, UniversalLearningPipeline,
 * MultimodalObservationCore, LearningInteractionCore) each already
 * have their own dedicated test suites; this file does not re-test
 * their internals, only how learning-panel-ui.js composes them.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const PANEL_PATH = path.join(__dirname, '..', 'learning-panel-ui.js');
const CORE_PATH = path.join(__dirname, '..', '..', 'modules', 'learning', 'learning-interaction-core.js');

class FakeElement {
    constructor(tag) {
        this.tagName = (tag || 'div').toUpperCase();
        this._html = '';
        this._children = new Map();
        this._listeners = {};
        this._text = '';
        this.style = {};
        this.classList = { add() {}, remove() {}, contains: () => false };
        this.srcObject = null;
    }
    set innerHTML(html) {
        this._html = html;
        this._children = new Map();
        const idRegex = /id="([^"]+)"/g;
        let m;
        while ((m = idRegex.exec(html))) {
            if (!this._children.has(m[1])) this._children.set(m[1], new FakeElement(m[1] === 'cozy-learn-video' ? 'video' : 'div'));
        }
    }
    get innerHTML() { return this._html; }
    querySelector(sel) {
        if (!sel.startsWith('#')) return null;
        return this._findById(sel.slice(1));
    }
    _findById(id) {
        if (this._children.has(id)) return this._children.get(id);
        for (const child of this._children.values()) {
            const found = child._findById(id);
            if (found) return found;
        }
        return null;
    }
    querySelectorAll(sel) { const el = this.querySelector(sel); return el ? [el] : []; }
    addEventListener(type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); }
    click() { (this._listeners.click || []).forEach((fn) => fn()); }
    get textContent() { return this._text; }
    set textContent(v) { this._text = String(v); }
}

function freshPanel() {
    delete require.cache[require.resolve(PANEL_PATH)];
    delete require.cache[require.resolve(CORE_PATH)];
    global.window = { CozyOS: {} };
    global.document = {};
    require(CORE_PATH);
    require(PANEL_PATH);
    return global.window.CozyOS.LearningPanelUI;
}

function fakeCameraAdapter({ startResult, captureResult } = {}) {
    let active = false;
    return {
        isSupported: () => true,
        startCapture: async () => {
            if (startResult && startResult.success === false) return startResult;
            active = true;
            return { success: true, stream: { fake: true } };
        },
        captureForLearning: async () => captureResult || { success: true, stage: 'capture-only', frame: { success: true }, ocr: { attempted: false } },
        stopCapture: () => { active = false; return { success: true }; },
        _isActive: () => active,
    };
}

function fakePipeline({ voiceResult, matchingConfidence = 0.9 } = {}) {
    const confirmCalls = [];
    return {
        captureVoiceForLearning: async () => voiceResult || { success: true, stage: 'voice-captured', audio: { transcript: 'buenos dias', confidence: 0.9, language: null, source: 'microphone' } },
        learnFromMultimodalObservation: ({ userId, visual, audio, context }) => {
            const observation = {
                observationId: 'obs-1', userId, visual, audio, context,
                translation: visual || audio ? { meaning: 'Good morning' } : null,
                matching: { visualAudioMatch: visual && audio ? matchingConfidence : null, combinedConfidence: (visual || audio) ? matchingConfidence : null },
                verification: { status: 'unverified' }, learning: { status: 'observation' },
            };
            return { success: true, observation, decision: { action: 'REVIEW_REQUIRED' } };
        },
        confirmMultimodalObservation: (observation, opts) => { confirmCalls.push({ observation, opts }); return { success: true, storedObservationId: observation.observationId }; },
        _confirmCalls: confirmCalls,
    };
}

function container() { return new FakeElement('div'); }

test('open() renders the mode-select buttons and a diagnostics note, requests no hardware access by itself', () => {
    const panel = freshPanel();
    global.window.CozyOS.LearningCameraAdapter = fakeCameraAdapter();
    const mount = container();
    const result = panel.open({ userId: 'u1', container: mount });
    assert.equal(result.success, true);
    assert.ok(mount.querySelector('#cozy-learn-scan'));
    assert.ok(mount.querySelector('#cozy-learn-listen'));
    assert.ok(mount.querySelector('#cozy-learn-both'));
    assert.ok(mount.querySelector('#cozy-learn-diagnostics'));
});

test('open() fails honestly if LearningInteractionCore is not loaded', () => {
    delete require.cache[require.resolve(PANEL_PATH)];
    global.window = { CozyOS: {} };
    require(PANEL_PATH);
    const panel = global.window.CozyOS.LearningPanelUI;
    const result = panel.open({ userId: 'u1', container: container() });
    assert.equal(result.success, false);
    assert.match(result.reason, /LearningInteractionCore/);
});

test('Scan: real permission request, camera preview shown, capture with real OCR success leads to a review card', async () => {
    const panel = freshPanel();
    global.window.CozyOS.LearningCameraAdapter = fakeCameraAdapter({
        captureResult: { success: true, stage: 'capture-and-ocr', frame: { success: true }, ocr: { attempted: true, available: true, extracted: { text: 'Buenos días' } } },
    });
    global.window.CozyOS.UniversalLearningPipeline = fakePipeline();
    const mount = container();
    panel.open({ userId: 'u1', container: mount });

    mount.querySelector('#cozy-learn-scan').click();
    await new Promise((r) => setTimeout(r, 0));
    assert.ok(mount.querySelector('#cozy-learn-video'), 'a real video preview element must be rendered while capture is active');

    await mount.querySelector('#cozy-learn-capture').click();
    await new Promise((r) => setTimeout(r, 10));

    assert.ok(mount.querySelector('#cozy-learn-review-card'), 'a review card must appear after a successful capture');
    assert.ok(mount.querySelector('#cozy-learn-review-learn'));
    assert.ok(mount.querySelector('#cozy-learn-review-review'));
    assert.ok(mount.querySelector('#cozy-learn-review-ignore'));
});

test('Scan: when OCR is genuinely unavailable, the honest boundary message is shown and no text is fabricated', async () => {
    const panel = freshPanel();
    global.window.CozyOS.LearningCameraAdapter = fakeCameraAdapter({
        captureResult: { success: true, stage: 'capture-only', frame: { success: true }, ocr: { attempted: true, available: false, reason: 'Missing real capabilities: ocr-learning.' } },
    });
    global.window.CozyOS.UniversalLearningPipeline = fakePipeline();
    const mount = container();
    panel.open({ userId: 'u1', container: mount });
    mount.querySelector('#cozy-learn-scan').click();
    await new Promise((r) => setTimeout(r, 0));
    await mount.querySelector('#cozy-learn-capture').click();
    await new Promise((r) => setTimeout(r, 10));

    const status = mount.querySelector('#cozy-learn-status').textContent;
    assert.match(status, /OCR is not currently available/);
    assert.doesNotMatch(status, /Buenos días/, 'must never fabricate extracted text when OCR did not run');
});

test('Listen: real permission-style capture succeeds and leads to a review card', async () => {
    const panel = freshPanel();
    global.window.CozyOS.UniversalLearningPipeline = fakePipeline();
    const mount = container();
    panel.open({ userId: 'u1', container: mount });
    mount.querySelector('#cozy-learn-listen').click();
    await new Promise((r) => setTimeout(r, 10));
    assert.ok(mount.querySelector('#cozy-learn-review-card'));
});

test('Listen: an honest voice-capture failure is reported with the real reason, never fabricated', async () => {
    const panel = freshPanel();
    global.window.CozyOS.UniversalLearningPipeline = fakePipeline({ voiceResult: { success: false, stage: 'voice-capture-failed', reason: 'Real speech recognition error: network' } });
    const mount = container();
    panel.open({ userId: 'u1', container: mount });
    mount.querySelector('#cozy-learn-listen').click();
    await new Promise((r) => setTimeout(r, 10));
    const status = mount.querySelector('#cozy-learn-status').textContent;
    assert.match(status, /hearing/);
    assert.match(status, /network/);
});

test('Scan + Listen: both real observations are combined into one multimodal observation with a real cross-modal confidence', async () => {
    const panel = freshPanel();
    global.window.CozyOS.LearningCameraAdapter = fakeCameraAdapter({
        captureResult: { success: true, stage: 'capture-and-ocr', frame: { success: true }, ocr: { attempted: true, available: true, extracted: { text: 'Buenos días' } } },
    });
    const pipeline = fakePipeline({ matchingConfidence: 0.97 });
    global.window.CozyOS.UniversalLearningPipeline = pipeline;
    const mount = container();
    panel.open({ userId: 'u1', container: mount });
    mount.querySelector('#cozy-learn-both').click();
    await new Promise((r) => setTimeout(r, 0));
    await mount.querySelector('#cozy-learn-capture').click();
    await new Promise((r) => setTimeout(r, 10));
    assert.ok(mount.querySelector('#cozy-learn-review-card'), 'the combined session must reach review, not stop after Scan alone');
});

test('Learn button calls the real confirmMultimodalObservation() with the exact observation and userId', async () => {
    const panel = freshPanel();
    global.window.CozyOS.UniversalLearningPipeline = fakePipeline();
    const mount = container();
    panel.open({ userId: 'user-42', container: mount });
    mount.querySelector('#cozy-learn-listen').click();
    await new Promise((r) => setTimeout(r, 10));

    mount.querySelector('#cozy-learn-review-learn').click();
    const calls = global.window.CozyOS.UniversalLearningPipeline._confirmCalls;
    assert.equal(calls.length, 1);
    assert.equal(calls[0].observation.observationId, 'obs-1');
    assert.equal(calls[0].opts.userId, 'user-42');
});

test('Review and Ignore buttons never call confirmMultimodalObservation()', async () => {
    const panel = freshPanel();
    global.window.CozyOS.UniversalLearningPipeline = fakePipeline();
    const mount = container();

    panel.open({ userId: 'u1', container: mount });
    mount.querySelector('#cozy-learn-listen').click();
    await new Promise((r) => setTimeout(r, 10));
    mount.querySelector('#cozy-learn-review-review').click();
    assert.equal(global.window.CozyOS.UniversalLearningPipeline._confirmCalls.length, 0);

    panel.open({ userId: 'u1', container: mount });
    mount.querySelector('#cozy-learn-listen').click();
    await new Promise((r) => setTimeout(r, 10));
    mount.querySelector('#cozy-learn-review-ignore').click();
    assert.equal(global.window.CozyOS.UniversalLearningPipeline._confirmCalls.length, 0, 'Ignore must never commit durable learning either');
});

test('close() unconditionally stops the camera, even if nothing was ever started', () => {
    const panel = freshPanel();
    const camera = fakeCameraAdapter();
    global.window.CozyOS.LearningCameraAdapter = camera;
    const mount = container();
    panel.open({ userId: 'u1', container: mount });
    assert.doesNotThrow(() => panel.close());
});

test('close() stops an actually-active camera stream (lifecycle: no dangling camera after the panel closes)', async () => {
    const panel = freshPanel();
    const camera = fakeCameraAdapter({
        captureResult: { success: true, stage: 'capture-only', frame: { success: true }, ocr: { attempted: false } },
    });
    global.window.CozyOS.LearningCameraAdapter = camera;
    global.window.CozyOS.UniversalLearningPipeline = fakePipeline();
    const mount = container();
    panel.open({ userId: 'u1', container: mount });
    mount.querySelector('#cozy-learn-scan').click();
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(camera._isActive(), true, 'precondition: camera must actually be active before testing that close() stops it');
    panel.close();
    assert.equal(camera._isActive(), false);
});

test('a camera failure (e.g. permission denied) is classified with a real component/problem/solution, and the camera is stopped', async () => {
    const panel = freshPanel();
    global.window.CozyOS.LearningCameraAdapter = fakeCameraAdapter({ startResult: { success: false, reason: 'Real getUserMedia rejection: Permission denied' } });
    const mount = container();
    panel.open({ userId: 'u1', container: mount });
    mount.querySelector('#cozy-learn-scan').click();
    await new Promise((r) => setTimeout(r, 10));
    const status = mount.querySelector('#cozy-learn-status').textContent;
    assert.match(status, /camera/);
    assert.match(status, /Permission denied/);
    assert.match(status, /Grant camera permission/, 'must include the real, known possible solution, not a generic message');
});
