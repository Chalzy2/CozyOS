'use strict';

/**
 * core/shell/tests/profile-language-registry-audit.js
 * Profile Phase 2A-1 — READ-ONLY evidence script. Not a test and not
 * shipped to browsers. Loads, unmodified, the four registries in this
 * repository that carry language identifiers and prints what each one
 * actually holds at runtime, so the 2A-1 report's audit table is
 * reproducible rather than asserted.
 *
 *   Tier 1  core/modules/intelligence/language-packs/cozy-language-pack-registry.js   (window.CozyOS.CozyLanguagePacks)   identity authority (its own header says so)
 *   Tier 2  core/modules/intelligence/language/cozy-language-registry.js               (window.CozyOS.CozyLanguageRegistry) chat/response-template selector
 *   UI      core/modules/language/language-engine.js                                   (window.CozyOS.LanguageEngine)       UI-string translation + locale
 *   Speech  core/modules/speech/cozy-speech.js                                         (window.CozyOS.CozySpeech)           recognition/voice language registry
 *
 * The "Speech code (name match)" column pairs a Tier-1 language with a
 * Speech entry whose NAME matches (accent/case-folded, containment).
 * It is a report aid only — no mapping table is created or stored.
 *
 * Run: node core/shell/tests/profile-language-registry-audit.js
 */

const path = require('path');
const MODULES = path.join(__dirname, '..', '..', 'modules');

function load(rel) {
  global.window = { CozyOS: {} };
  const p = path.join(MODULES, rel);
  delete require.cache[require.resolve(p)];
  require(p);
  return global.window.CozyOS;
}

const fold = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const t1 = load('intelligence/language-packs/cozy-language-pack-registry.js').CozyLanguagePacks.listPacks().map((p) => p.identity);
const t2 = load('intelligence/language/cozy-language-registry.js').CozyLanguageRegistry.listLanguages();
const engine = load('language/language-engine.js').LanguageEngine;
const engineLangs = engine.listLanguages();
const speech = load('speech/cozy-speech.js').CozySpeech.listLanguages();

const engineByCode = new Map(engineLangs.map((l) => [l.code, l]));
const t2ByCode = new Map(t2.map((l) => [l.code, l]));
const speechByCode = new Map(speech.map((l) => [l.languageCode, l]));

function speechNameMatch(identity) {
  const n = fold(identity.name);
  return speech.find((s) => { const sn = fold(s.name); return sn && (n.includes(sn) || sn.includes(n)); }) || null;
}

const rows = t1.map((id) => {
  const e = engineByCode.get(id.languageId);
  const sp = speechNameMatch(id);
  return {
    id: id.languageId,
    name: id.name,
    nativeName: id.nativeName,
    iso: id.iso,
    inTier2: t2ByCode.has(id.languageId),
    engineLocale: e ? (e.locale || null) : null,
    speechCodeByName: sp ? sp.languageCode : null,
    speechBcp47: sp ? sp.bcp47Tag : null,
  };
});

const out = {
  tier1Count: t1.length,
  tier2Count: t2.length,
  engineCount: engineLangs.length,
  speechCount: speech.length,
  tier1: rows,
  tier2NotInTier1: t2.filter((l) => !t1.some((i) => i.languageId === l.code)).map((l) => l.code),
  engineNotInTier1: engineLangs.filter((l) => !t1.some((i) => i.languageId === l.code)).map((l) => l.code),
  tier1DifferentSpeechCode: rows.filter((r) => r.speechCodeByName && r.speechCodeByName !== r.id).map((r) => `${r.id}->${r.speechCodeByName}`),
  tier1WithNullIso: rows.filter((r) => !r.iso).map((r) => r.id),
  aliasFieldAnywhere: [t1, t2, engineLangs, speech].some((list) => list.some((l) => Object.keys(l).some((k) => /alias|altName|searchName/i.test(k)))),
};

if (require.main === module) {
  console.log(JSON.stringify(out, null, 2));
  setTimeout(() => process.exit(0), 100);
}
module.exports = out;
