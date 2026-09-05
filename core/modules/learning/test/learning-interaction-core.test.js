/**
 * core/modules/learning/test/learning-interaction-core.test.js
 * Run with: node --test core/modules/learning/test/learning-interaction-core.test.js
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const CORE_PATH = path.join(__dirname, '..', 'learning-interaction-core.js');

function load(windowOverrides) {
    delete require.cache[require.resolve(CORE_PATH)];
    global.window = { CozyOS: windowOverrides || {} };
    require(CORE_PATH);
    return global.window.CozyOS.LearningInteractionCore;
}

const { STAGE, MODE, transition, buildDiagnostics, classifyError, buildReviewCardText } = load();

// --- state machine ---

test('valid transition chain: IDLE -> MODE_SELECT -> PERMISSION_PENDING -> CAPTURING -> REVIEWING -> CONFIRMED', () => {
    let r = transition(STAGE.IDLE, STAGE.MODE_SELECT); assert.equal(r.success, true);
    r = transition(STAGE.MODE_SELECT, STAGE.PERMISSION_PENDING); assert.equal(r.success, true);
    r = transition(STAGE.PERMISSION_PENDING, STAGE.CAPTURING); assert.equal(r.success, true);
    r = transition(STAGE.CAPTURING, STAGE.REVIEWING); assert.equal(r.success, true);
    r = transition(STAGE.REVIEWING, STAGE.CONFIRMED); assert.equal(r.success, true);
});

test('REVIEWING can also go to IGNORED, never silently to CONFIRMED without going through REVIEWING first', () => {
    assert.equal(transition(STAGE.REVIEWING, STAGE.IGNORED).success, true);
    assert.equal(transition(STAGE.IDLE, STAGE.CONFIRMED).success, false, 'must never allow skipping straight to CONFIRMED');
    assert.equal(transition(STAGE.CAPTURING, STAGE.CONFIRMED).success, false, 'must never allow skipping REVIEWING');
});

test('a failure at any capturing stage can move to FAILED, and FAILED can return to IDLE or MODE_SELECT', () => {
    assert.equal(transition(STAGE.PERMISSION_PENDING, STAGE.FAILED).success, true);
    assert.equal(transition(STAGE.CAPTURING, STAGE.FAILED).success, true);
    assert.equal(transition(STAGE.FAILED, STAGE.IDLE).success, true);
    assert.equal(transition(STAGE.FAILED, STAGE.MODE_SELECT).success, true);
});

test('unrecognized stage names are refused, never coerced', () => {
    assert.equal(transition('NOT_A_STAGE', STAGE.IDLE).success, false);
    assert.equal(transition(STAGE.IDLE, 'NOT_A_STAGE').success, false);
});

test('MODE has exactly SCAN/LISTEN/BOTH', () => {
    assert.deepEqual(Object.keys(MODE).sort(), ['BOTH', 'LISTEN', 'SCAN']);
});

test('state machine module is frozen', () => {
    const mod = load();
    assert.ok(Object.isFrozen(mod));
    assert.ok(Object.isFrozen(mod.STAGE));
});

// --- buildDiagnostics ---

test('buildDiagnostics honestly reports every dependency unavailable when nothing is loaded', () => {
    const core = load({});
    const diag = core.buildDiagnostics();
    for (const key of ['camera', 'hearing', 'ocr', 'translation', 'cognitive', 'learning', 'memory', 'matching']) {
        assert.equal(diag[key].available, false, `${key} must be honestly reported unavailable`);
        assert.ok(diag[key].reason, `${key} must include a real reason`);
    }
});

test('buildDiagnostics reports camera available when LearningCameraAdapter is loaded and isSupported() is true', () => {
    const core = load({ LearningCameraAdapter: { isSupported: () => true } });
    assert.equal(core.buildDiagnostics().camera.available, true);
});

test('buildDiagnostics reports camera unavailable with the real hardware reason when isSupported() is false', () => {
    const core = load({ LearningCameraAdapter: { isSupported: () => false } });
    const diag = core.buildDiagnostics();
    assert.equal(diag.camera.available, false);
    assert.match(diag.camera.reason, /getUserMedia/);
});

test('buildDiagnostics reports hearing available when SpeechRecognitionAdapter is loaded and isReal() is true', () => {
    const core = load({ SpeechRecognitionAdapter: { isReal: () => true } });
    assert.equal(core.buildDiagnostics().hearing.available, true);
});

test('buildDiagnostics reports hearing unavailable with the real browser-API reason when isReal() is false', () => {
    const core = load({ SpeechRecognitionAdapter: { isReal: () => false } });
    const diag = core.buildDiagnostics();
    assert.equal(diag.hearing.available, false);
    assert.match(diag.hearing.reason, /SpeechRecognition/);
});

test('buildDiagnostics reports OCR unavailable with the documented-stub reason, distinct from "not loaded"', () => {
    const core = load({});
    assert.match(core.buildDiagnostics().ocr.reason, /documented stub/);
});

test('buildDiagnostics reports every dependency available when all real globals are present', () => {
    const core = load({
        LearningCameraAdapter: { isSupported: () => true },
        SpeechRecognitionAdapter: { isReal: () => true },
        OCREngine: {},
        CozyTranslate: {},
        CognitiveCoordinator: {},
        UniversalLearningPipeline: {},
        CozyMemory: {},
        MultimodalObservationCore: {},
    });
    const diag = core.buildDiagnostics();
    for (const key of Object.keys(diag)) assert.equal(diag[key].available, true, `${key} should be available`);
});

// --- classifyError ---

test('classifyError produces a structured {component, problem, impact, possibleSolution} report', () => {
    const err = classifyError('ocr', 'OCREngine is not loaded.');
    assert.equal(err.component, 'ocr');
    assert.equal(err.problem, 'OCREngine is not loaded.');
    assert.match(err.impact, /ocr/);
    assert.match(err.possibleSolution, /infrastructure/);
});

test('classifyError falls back honestly for an unknown component rather than inventing a solution', () => {
    const err = classifyError('some-unknown-thing', 'it broke');
    assert.match(err.possibleSolution, /No automatic remedy/);
});

test('classifyError never throws on missing arguments', () => {
    const err = classifyError();
    assert.equal(err.component, 'unknown');
    assert.match(err.problem, /unspecified/);
});

// --- buildReviewCardText ---

test('buildReviewCardText includes only the fields the observation actually has, never fabricating placeholders', () => {
    const core = load();
    const observation = {
        visual: { text: 'Buenos días' },
        audio: { transcript: 'buenos dias' },
        translation: { meaning: 'Good morning' },
        matching: { combinedConfidence: 0.95 },
    };
    const card = core.buildReviewCardText(observation, { action: 'REVIEW_REQUIRED' });
    const labels = card.lines.map((l) => l.label);
    assert.deepEqual(labels, ['Text', 'Spoken', 'Meaning', 'Confidence']);
    assert.equal(card.confidencePercent, 95);
    assert.equal(card.recommendedAction, 'REVIEW_REQUIRED');
});

test('buildReviewCardText omits missing fields entirely rather than showing empty placeholders', () => {
    const core = load();
    const observation = { visual: { text: 'x' }, audio: null, translation: null, matching: { combinedConfidence: null } };
    const card = core.buildReviewCardText(observation, {});
    assert.deepEqual(card.lines.map((l) => l.label), ['Text']);
    assert.equal(card.confidencePercent, null);
});

test('buildReviewCardText handles a null observation without throwing', () => {
    const core = load();
    const card = core.buildReviewCardText(null, null);
    assert.deepEqual(card.lines, []);
    assert.equal(card.confidencePercent, null);
});
