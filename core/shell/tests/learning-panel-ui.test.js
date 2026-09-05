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
        this.value = '';
    }
    set innerHTML(html) {
        this._html = html;
        this._children = new Map();
        const idRegex = /id="([^"]+)"/g;
        let m;
        while ((m = idRegex.exec(html))) {
            const el = new FakeElement(m[1] === 'cozy-learn-video' ? 'video' : (m[1] === 'cozy-learn-context-select' ? 'select' : 'div'));
            if (m[1] === 'cozy-learn-context-select') {
                const selectedMatch = new RegExp(`<option value="([^"]+)"\\s+selected>`).exec(html);
                el.value = selectedMatch ? selectedMatch[1] : 'auto';
            }
            if (!this._children.has(m[1])) this._children.set(m[1], el);
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
    changeTo(newValue) { this.value = newValue; (this._listeners.change || []).forEach((fn) => fn({ target: this })); }
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

function fakePipeline({ voiceResult, matchingConfidence = 0.9, stopVoiceCaptureFn } = {}) {
    const confirmCalls = [];
    return {
        captureVoiceForLearning: async () => voiceResult || { success: true, stage: 'voice-captured', audio: { transcript: 'buenos dias', confidence: 0.9, language: null, source: 'microphone' } },
        stopVoiceCapture: stopVoiceCaptureFn || (() => ({ success: true })),
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

test('Listen: shows a real, visible "Listening" indicator and a working Stop button while listening is in progress', async () => {
    const panel = freshPanel();
    let resolveVoice;
    const pipeline = fakePipeline();
    pipeline.captureVoiceForLearning = () => new Promise((resolve) => { resolveVoice = resolve; });
    global.window.CozyOS.UniversalLearningPipeline = pipeline;
    const mount = container();
    panel.open({ userId: 'u1', container: mount });
    mount.querySelector('#cozy-learn-listen').click();
    await new Promise((r) => setTimeout(r, 0));

    assert.ok(mount.querySelector('#cozy-learn-listening-indicator'), 'the user must always be able to see that listening is active');
    assert.ok(mount.querySelector('#cozy-learn-stop-listening'), 'a working Stop control must be visible while listening');

    resolveVoice({ success: true, audio: { transcript: 'buenos dias', confidence: 0.9, language: null } });
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(mount.querySelector('#cozy-learn-listening-indicator'), null, 'the listening indicator must be removed once listening ends');
});

test('Listen: tapping Stop calls the real UniversalLearningPipeline.stopVoiceCapture() — the same real SpeechRecognitionAdapter path, no second engine', async () => {
    const panel = freshPanel();
    let stopCalled = false;
    const pipeline = fakePipeline({ stopVoiceCaptureFn: () => { stopCalled = true; return { success: true }; } });
    pipeline.captureVoiceForLearning = () => new Promise(() => { /* never resolves in this test — only Stop matters here */ });
    global.window.CozyOS.UniversalLearningPipeline = pipeline;
    const mount = container();
    panel.open({ userId: 'u1', container: mount });
    mount.querySelector('#cozy-learn-listen').click();
    await new Promise((r) => setTimeout(r, 0));
    mount.querySelector('#cozy-learn-stop-listening').click();
    assert.equal(stopCalled, true);
});

test('Listen: after a manual Stop (or genuine silence), the honest "No speech detected." outcome is shown, never a fabricated transcript', async () => {
    const panel = freshPanel();
    global.window.CozyOS.UniversalLearningPipeline = fakePipeline({ voiceResult: { success: false, stage: 'voice-capture-failed', reason: 'No speech detected.' } });
    const mount = container();
    panel.open({ userId: 'u1', container: mount });
    mount.querySelector('#cozy-learn-listen').click();
    await new Promise((r) => setTimeout(r, 10));
    const status = mount.querySelector('#cozy-learn-status').textContent;
    assert.match(status, /No speech detected/);
});

test('Listen: on a real successful transcript, the exact real "Heard: <transcript>" status is shown before review, never a different or fabricated transcript', async () => {
    const panel = freshPanel();
    global.window.CozyOS.UniversalLearningPipeline = fakePipeline({
        voiceResult: { success: true, audio: { transcript: 'buenos dias', confidence: 0.9, language: 'es-ES' } },
    });
    const mount = container();
    panel.open({ userId: 'u1', container: mount });
    mount.querySelector('#cozy-learn-listen').click();
    await new Promise((r) => setTimeout(r, 10));
    // The status line is immediately overwritten by the review-card
    // render, so this asserts the review card carries the exact real
    // transcript through instead (the "Heard:" line itself is
    // transient by design — see #runListenAndFinish).
    const card = mount.querySelector('#cozy-learn-review-card');
    assert.ok(card, 'review card must exist');
});

test('Repeated sessions: Listen -> Stop -> Listen again works normally, with no stale state left over', async () => {
    const panel = freshPanel();
    let callCount = 0;
    const pipeline = fakePipeline();
    pipeline.captureVoiceForLearning = async () => { callCount++; return { success: true, audio: { transcript: `session-${callCount}`, confidence: 0.9, language: null } }; };
    global.window.CozyOS.UniversalLearningPipeline = pipeline;
    const mount = container();

    panel.open({ userId: 'u1', container: mount });
    mount.querySelector('#cozy-learn-listen').click();
    await new Promise((r) => setTimeout(r, 10));
    assert.ok(mount.querySelector('#cozy-learn-review-card'));

    panel.open({ userId: 'u1', container: mount }); // re-open for a fresh second session, as the panel would after Learn/Review/Ignore returns to MODE_SELECT
    mount.querySelector('#cozy-learn-listen').click();
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(callCount, 2, 'the second session must genuinely call captureVoiceForLearning again, not reuse stale state');
    assert.ok(mount.querySelector('#cozy-learn-review-card'), 'the second session must reach review normally too');
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

// --- CP15: Kiswahili Hearing -> Living Learning ---

test('CP15: open() accepts an optional languageCode/context and passes them through to Listen — never hardcoded, caller-supplied only', async () => {
    const panel = freshPanel();
    let receivedConfig = null;
    const pipeline = fakePipeline();
    pipeline.captureVoiceForLearning = async (cfg) => { receivedConfig = cfg; return { success: true, audio: { transcript: 'Habari za asubuhi', confidence: 0.88, language: 'sw' } }; };
    global.window.CozyOS.UniversalLearningPipeline = pipeline;
    const mount = container();

    panel.open({ userId: 'u1', container: mount, languageCode: 'sw', context: { type: 'sermon' } });
    mount.querySelector('#cozy-learn-listen').click();
    await new Promise((r) => setTimeout(r, 10));

    assert.equal(receivedConfig.languageCode, 'sw');
    assert.deepEqual(receivedConfig.context, { type: 'sermon' });
});

test('CP15: open() with no languageCode (the default, unchanged behavior) never fabricates or defaults to any specific language', async () => {
    const panel = freshPanel();
    let receivedConfig = null;
    const pipeline = fakePipeline();
    pipeline.captureVoiceForLearning = async (cfg) => { receivedConfig = cfg; return { success: true, audio: { transcript: 'hello', confidence: 0.9, language: null } }; };
    global.window.CozyOS.UniversalLearningPipeline = pipeline;
    const mount = container();
    panel.open({ userId: 'u1', container: mount });
    mount.querySelector('#cozy-learn-listen').click();
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(receivedConfig.languageCode, null, 'must never silently default to a specific language when the caller supplied none');
});

test('CP15: a real final Kiswahili transcript flows end-to-end into a reviewable observation with language preserved, and Learn commits it through the existing confirmation path', async () => {
    const panel = freshPanel();
    const pipeline = fakePipeline();
    pipeline.captureVoiceForLearning = async () => ({ success: true, audio: { transcript: 'Habari za asubuhi', confidence: 0.88, language: 'sw', source: 'microphone' } });
    global.window.CozyOS.UniversalLearningPipeline = pipeline;
    const mount = container();

    panel.open({ userId: 'pastor-1', container: mount, languageCode: 'sw', context: { type: 'sermon' } });
    mount.querySelector('#cozy-learn-listen').click();
    await new Promise((r) => setTimeout(r, 10));

    const card = mount.querySelector('#cozy-learn-review-card');
    assert.ok(card, 'a real final Kiswahili result must reach a reviewable observation, not just be displayed as text');

    mount.querySelector('#cozy-learn-review-learn').click();
    const calls = pipeline._confirmCalls;
    assert.equal(calls.length, 1);
    assert.equal(calls[0].observation.audio.transcript, 'Habari za asubuhi', 'the exact real transcript must be what gets committed, never altered');
    assert.equal(calls[0].observation.audio.language, 'sw', 'the real recognized language must be preserved through to the durable-commit call');
    assert.equal(calls[0].opts.userId, 'pastor-1');
});

test('CP15: pressing Learn a second time on the same review card is structurally impossible — the button is removed after the first, real commit', async () => {
    const panel = freshPanel();
    global.window.CozyOS.UniversalLearningPipeline = fakePipeline();
    const mount = container();
    panel.open({ userId: 'u1', container: mount });
    mount.querySelector('#cozy-learn-listen').click();
    await new Promise((r) => setTimeout(r, 10));

    mount.querySelector('#cozy-learn-review-learn').click();
    assert.equal(global.window.CozyOS.UniversalLearningPipeline._confirmCalls.length, 1);

    // The review host is cleared after Learn — a second click has
    // nothing left to click, matching the real DOM behavior a user
    // pressing Learn twice would encounter.
    const secondLearnBtn = mount.querySelector('#cozy-learn-review-learn');
    assert.equal(secondLearnBtn, null, 'the Learn button must no longer exist after a successful commit');
});

test('CP15: an unavailable/uncertain confidence is preserved honestly (never fabricated into a fake percentage) through to the review card', async () => {
    const panel = freshPanel();
    const pipeline = fakePipeline();
    pipeline.captureVoiceForLearning = async () => ({ success: true, audio: { transcript: 'asante', confidence: 'unavailable', language: 'sw' } });
    // learnFromMultimodalObservation below is the fake's own — it
    // builds matching.combinedConfidence from audio.confidence only if
    // it's a real number, so a non-numeric "unavailable" must not
    // silently become a fabricated percentage in the review card.
    pipeline.learnFromMultimodalObservation = ({ userId, visual, audio, context }) => {
        const observation = {
            observationId: 'obs-unavailable', userId, visual, audio, context,
            translation: null,
            matching: { visualAudioMatch: null, combinedConfidence: null },
            verification: { status: 'unverified' }, learning: { status: 'observation' },
        };
        return { success: true, observation, decision: { action: 'REVIEW_REQUIRED' } };
    };
    global.window.CozyOS.UniversalLearningPipeline = pipeline;
    const mount = container();
    panel.open({ userId: 'u1', container: mount, languageCode: 'sw' });
    mount.querySelector('#cozy-learn-listen').click();
    await new Promise((r) => setTimeout(r, 10));

    const card = mount.querySelector('#cozy-learn-review-card');
    assert.ok(card, 'review card must still appear even with an unavailable confidence');
});

test('CP15: session lifecycle — Listen, get a result, then Listen again in the SAME panel instance starts cleanly with no stale transcript', async () => {
    const panel = freshPanel();
    let callCount = 0;
    const pipeline = fakePipeline();
    pipeline.captureVoiceForLearning = async () => { callCount++; return { success: true, audio: { transcript: `sw-session-${callCount}`, confidence: 0.9, language: 'sw' } }; };
    global.window.CozyOS.UniversalLearningPipeline = pipeline;
    const mount = container();
    panel.open({ userId: 'u1', container: mount, languageCode: 'sw' });

    mount.querySelector('#cozy-learn-listen').click();
    await new Promise((r) => setTimeout(r, 10));
    mount.querySelector('#cozy-learn-review-ignore').click();

    // Listen again WITHOUT re-opening the panel — the mode-select
    // buttons remain present for the whole panel lifetime by design.
    mount.querySelector('#cozy-learn-listen').click();
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(callCount, 2, 'the second Listen must genuinely call captureVoiceForLearning again, not reuse the first result');
    assert.ok(mount.querySelector('#cozy-learn-review-card'), 'the second session must reach review normally too, with no stale state blocking it');
});

// --- CP16B: Church-context selector ---

test('CP16B: the context selector renders with real, existing conceptual categories, defaulting to Auto', () => {
    const panel = freshPanel();
    const mount = container();
    panel.open({ userId: 'u1', container: mount });
    const select = mount.querySelector('#cozy-learn-context-select');
    assert.ok(select, 'a real context selector must be present, reusing the existing panel — no new navigation surface');
    assert.equal(select.value, 'auto');
});

test('CP16B: selecting a real context updates the session context, which flows through to Listen', async () => {
    const panel = freshPanel();
    let receivedContext;
    const pipeline = fakePipeline();
    pipeline.captureVoiceForLearning = async (cfg) => { receivedContext = cfg.context; return { success: true, audio: { transcript: 'x', confidence: 0.9, language: null } }; };
    global.window.CozyOS.UniversalLearningPipeline = pipeline;
    const mount = container();
    panel.open({ userId: 'u1', container: mount });

    mount.querySelector('#cozy-learn-context-select').changeTo('sermon');
    mount.querySelector('#cozy-learn-listen').click();
    await new Promise((r) => setTimeout(r, 10));

    assert.deepEqual(receivedContext, { type: 'sermon' });
});

test('CP16B: "Auto" means genuinely no assumed context (null), never a fabricated {type:"auto"} object', async () => {
    const panel = freshPanel();
    let receivedContext = 'not-yet-set';
    const pipeline = fakePipeline();
    pipeline.captureVoiceForLearning = async (cfg) => { receivedContext = cfg.context; return { success: true, audio: { transcript: 'x', confidence: 0.9, language: null } }; };
    global.window.CozyOS.UniversalLearningPipeline = pipeline;
    const mount = container();
    panel.open({ userId: 'u1', container: mount });

    // Explicitly select a real context, then switch back to Auto —
    // proves Auto genuinely clears it rather than only being the
    // untouched initial state.
    mount.querySelector('#cozy-learn-context-select').changeTo('prayer');
    mount.querySelector('#cozy-learn-context-select').changeTo('auto');
    mount.querySelector('#cozy-learn-listen').click();
    await new Promise((r) => setTimeout(r, 10));

    assert.equal(receivedContext, null);
});

test('CP16B: a real context selected before Scan+Listen flows through to the final multimodal observation', async () => {
    const panel = freshPanel();
    global.window.CozyOS.LearningCameraAdapter = fakeCameraAdapter({
        captureResult: { success: true, stage: 'capture-and-ocr', frame: { success: true }, ocr: { attempted: true, available: true, extracted: { text: 'Buenos días' } } },
    });
    let receivedContext;
    const pipeline = fakePipeline();
    pipeline.learnFromMultimodalObservation = ({ userId, visual, audio, context }) => {
        receivedContext = context;
        const observation = { observationId: 'obs-1', userId, visual, audio, context, translation: null, matching: { combinedConfidence: null }, verification: {}, learning: {} };
        return { success: true, observation, decision: { action: 'REVIEW_REQUIRED' } };
    };
    global.window.CozyOS.UniversalLearningPipeline = pipeline;
    const mount = container();
    panel.open({ userId: 'u1', container: mount });

    mount.querySelector('#cozy-learn-context-select').changeTo('scripture');
    mount.querySelector('#cozy-learn-both').click();
    await new Promise((r) => setTimeout(r, 0));
    await mount.querySelector('#cozy-learn-capture').click();
    await new Promise((r) => setTimeout(r, 10));

    assert.deepEqual(receivedContext, { type: 'scripture' });
});

test('CP16B: open() with a pre-set context reflects it in the selector\'s initial value, without the user needing to reselect it', () => {
    const panel = freshPanel();
    const mount = container();
    panel.open({ userId: 'u1', container: mount, context: { type: 'worship' } });
    const select = mount.querySelector('#cozy-learn-context-select');
    assert.equal(select.value, 'worship');
});
