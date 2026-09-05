/**
 * core/modules/speech/adapters/test/fixtures/kiswahili-sentences.js
 * Checkpoint: CP14 — Kiswahili Speech Recognition
 *
 * Controlled test fixtures only. Per CP14 spec item 6/item 14: "The
 * expected value in tests must come from controlled test fixtures, not
 * hard-coded assumptions about what a real provider will recognize."
 * These strings are the CONTROLLED INPUT fed to a fake/mocked
 * SpeechRecognition result in unit tests — they are not a claim about
 * what any real Kiswahili speech-recognition provider will actually
 * output for real audio. Real-provider accuracy is explicitly NOT
 * verified by these fixtures (see CP14 checkpoint report, "KISWAHILI
 * VERIFIED" vs "BROWSER-RUNTIME VERIFIED" distinction).
 */
'use strict';

const KISWAHILI_SENTENCES = Object.freeze([
    { id: 'greeting-short', category: 'greeting', text: 'Habari yako', interimPrefix: 'Habari' },
    { id: 'greeting-formal', category: 'greeting', text: 'Habari za asubuhi, karibu sana.', interimPrefix: 'Habari za asubuhi' },
    { id: 'church-1', category: 'church', text: 'Ndugu zangu, leo tunazungumza kuhusu upendo wa Mungu na namna tunavyopaswa kuishi pamoja.', interimPrefix: 'Ndugu zangu leo tunazungumza' },
    { id: 'church-2', category: 'church', text: 'Tumshukuru Mungu kwa siku hii mpya.', interimPrefix: 'Tumshukuru Mungu' },
    { id: 'question-1', category: 'question', text: 'Je, umekula chakula cha jioni?', interimPrefix: 'Je umekula' },
    { id: 'question-2', category: 'question', text: 'Unaishi wapi sasa hivi?', interimPrefix: 'Unaishi wapi' },
    { id: 'conversation-1', category: 'conversation', text: 'Nilikwenda dukani jana kununua mchele na maharagwe.', interimPrefix: 'Nilikwenda dukani jana' },
    { id: 'repeated-words', category: 'conversation', text: 'Pole pole, twende taratibu taratibu.', interimPrefix: 'Pole pole' },
    { id: 'numbers-1', category: 'numbers', text: 'Nina miaka thelathini na tano, na watoto wanne.', interimPrefix: 'Nina miaka thelathini' },
    { id: 'names-1', category: 'names', text: 'Mchungaji Kimani atazungumza na Bi. Wanjiru kesho.', interimPrefix: 'Mchungaji Kimani atazungumza' },
    { id: 'punctuation-1', category: 'punctuation', text: 'Karibu, tafadhali keti; huduma itaanza punde.', interimPrefix: 'Karibu tafadhali keti' },
    { id: 'pause-segmented', category: 'pause', text: 'Kwanza tutasali, kisha tutaimba, halafu tutasoma neno.', interimPrefix: 'Kwanza tutasali' }
]);

module.exports = { KISWAHILI_SENTENCES };
