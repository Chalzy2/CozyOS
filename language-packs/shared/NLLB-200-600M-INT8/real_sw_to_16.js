/**
 * REAL sw -> 16 integration script
 * File Reference: language-packs/shared/NLLB-200-600M-INT8/real_sw_to_16.js
 *
 * NOT part of the automated `node --test` suite — this requires a live,
 * already-running nllb_http_bridge.py process with the real model
 * loaded. Run it manually on the target machine once /health reports
 * modelLoaded: true.
 *
 * WHAT THIS PROVES (per implementation spec item 17)
 *   This script requires the REAL, unmodified production files:
 *     core/modules/speech/adapters/speech-translation-provider.js
 *     core/modules/speech/adapters/speech-translation-provider-nllb.js
 *   and uses Node's real global `fetch` (no mock) against the real
 *   bridge. It does NOT use the disclosed/mocked test provider from
 *   the unit test suite. This is the actual:
 *     JS provider -> HTTP bridge -> real NLLB model
 *   path end to end.
 *
 * USAGE
 *   cd language-packs/shared/NLLB-200-600M-INT8
 *   node real_sw_to_16.js [bridgeBaseUrl]
 *
 *   Default bridgeBaseUrl: http://127.0.0.1:8177
 *
 * OUTPUT
 *   One line per target: target, success, translatedText, latencyMs.
 *   Then single-translation latency and full 16-target fan-out latency.
 */

'use strict';

const path = require('path');

const SPEECH_ADAPTERS_DIR = path.resolve(
    __dirname, '..', '..', '..', 'core', 'modules', 'speech', 'adapters'
);

const bridgeBaseUrl = process.argv[2] || 'http://127.0.0.1:8177';

const SOURCE = 'sw';
const SOURCE_TEXT = 'Habari ya leo?'; // stable short Kiswahili sentence
const TARGETS = ['en', 'fr', 'ar', 'so', 'ru', 'zh', 'ha', 'yo', 'luo', 'ki', 'kam', 'zu', 'am', 'ln', 'ig', 'hi'];

async function main() {
    // Node's built-in fetch is used as-is (no mock) — the provider file
    // itself is untouched from the checkpoint.
    global.window = { CozyOS: {} };
    require(path.join(SPEECH_ADAPTERS_DIR, 'speech-translation-provider.js'));
    require(path.join(SPEECH_ADAPTERS_DIR, 'speech-translation-provider-nllb.js'));

    window.CozyOS.SpeechTranslationNLLBProvider.register(bridgeBaseUrl);
    const provider = window.CozyOS.SpeechTranslationProviders.get('nllb-bridge');

    const healthy = await provider.isAvailable();
    if (!healthy) {
        console.error(`BLOCKED: nllb-bridge provider reports unavailable at ${bridgeBaseUrl}. `
            + `Confirm the bridge is running and /health reports modelLoaded: true.`);
        process.exit(1);
    }

    // ---- single-translation latency (sw -> en) ----
    const singleStart = Date.now();
    const singleResult = await window.CozyOS.SpeechTranslationProviders.translate(
        SOURCE_TEXT, { sourceLanguage: SOURCE, targetLanguage: 'en' }, 'nllb-bridge'
    );
    const singleWallMs = Date.now() - singleStart;

    console.log('=== REAL sw -> en ===');
    console.log(JSON.stringify(singleResult));
    console.log(`single translation wall latency: ${singleWallMs}ms`);
    console.log('');

    if (!singleResult.isReal) {
        console.error('BLOCKED: real sw -> en failed:', singleResult.reason);
        process.exit(1);
    }

    // ---- sw -> 16 fan-out (concurrent, one model, one process) ----
    console.log('=== REAL sw -> 16 fan-out ===');
    const fanoutStart = Date.now();
    const results = await Promise.all(TARGETS.map(async (target) => {
        const start = Date.now();
        const result = await window.CozyOS.SpeechTranslationProviders.translate(
            SOURCE_TEXT, { sourceLanguage: SOURCE, targetLanguage: target }, 'nllb-bridge'
        );
        const wallMs = Date.now() - start;
        return {
            target,
            success: result.isReal === true,
            translatedText: result.translatedText,
            latencyMs: result.latencyMs != null ? result.latencyMs : wallMs,
            reason: result.reason || null,
        };
    }));
    const fanoutWallMs = Date.now() - fanoutStart;

    for (const r of results) {
        console.log(JSON.stringify(r));
    }

    const successCount = results.filter((r) => r.success).length;
    console.log('');
    console.log(`sw -> 16 result: ${successCount}/${TARGETS.length} succeeded`);
    console.log(`16-target fan-out wall latency: ${fanoutWallMs}ms`);
}

main().catch((err) => {
    console.error('FATAL:', err);
    process.exit(1);
});
