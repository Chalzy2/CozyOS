'use strict';

/**
 * core/plugins/tests/interestOS-my-documents-ui.test.js
 * My Documents UI increment — verifies the real HTML file's structure
 * and that its inline script uses ONLY window.CozyOS.
 * InterestOSDocumentsClient for every document operation (never a raw
 * fetch(), never DocumentEngine, never a second storage system). The
 * client's own real list/save/search/personal-vs-organization
 * isolation behavior is already covered by interestOS-documents-
 * client.test.js (12/12) — this file verifies the UI composes that
 * boundary correctly, not a duplicate of that logic.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const HTML_PATH = path.join(__dirname, '..', '..', '..', 'applications', 'InterestOS', 'interestos.html');
const html = fs.readFileSync(HTML_PATH, 'utf8');
const inlineScript = html.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/)[1];

test('STRUCTURE: My Documents section exists with the required UI elements (list, search, save, viewer, feedback)', () => {
  for (const id of ['ios-docs-context-note', 'ios-docs-search-input', 'ios-docs-search-btn', 'ios-docs-new-title', 'ios-docs-save-btn', 'ios-docs-feedback', 'ios-docs-list', 'ios-docs-viewer', 'ios-docs-viewer-title', 'ios-docs-viewer-text', 'ios-docs-viewer-close-btn']) {
    assert.match(html, new RegExp(`id="${id}"`), `missing required element #${id}`);
  }
});

test('BOUNDARY: the inline script only ever calls document methods on window.CozyOS.InterestOSDocumentsClient, never a raw fetch() for documents', () => {
  assert.match(inlineScript, /client\.searchDocuments/);
  assert.match(inlineScript, /client\.loadDocument/);
  assert.match(inlineScript, /client\.saveDocument/);
  // The only "client" bound in initMyDocuments() must be the real
  // InterestOSDocumentsClient — no second variable name aliasing a
  // fetch() call as if it were the same boundary.
  const initSection = inlineScript.slice(inlineScript.indexOf('function initMyDocuments'));
  assert.match(initSection, /const client = window\.CozyOS\.InterestOSDocumentsClient;/);
  assert.doesNotMatch(initSection, /\bfetch\(/, 'My Documents UI must never call fetch() directly — InterestOSDocumentsClient is the sole boundary');
});

test('BOUNDARY: no DocumentEngine or provider is referenced by the My Documents UI', () => {
  const initSection = inlineScript.slice(inlineScript.indexOf('function initMyDocuments'), inlineScript.indexOf('function initMyDocuments') + 4000);
  assert.doesNotMatch(initSection, /DocumentEngine/);
  assert.doesNotMatch(initSection, /StorageProvider/);
});

// ---------------------------------------------------------------
// Upload / Download UI — compact "+" attach action
// ---------------------------------------------------------------

test('STRUCTURE: compact "+" attach action, action sheet, and its real file inputs exist', () => {
  for (const id of ['ios-docs-attach-btn', 'ios-docs-attach-sheet', 'ios-docs-attach-camera', 'ios-docs-attach-photos', 'ios-docs-attach-files', 'ios-docs-attach-cancel', 'ios-docs-input-camera', 'ios-docs-input-photos', 'ios-docs-input-files', 'ios-docs-pending-upload', 'ios-docs-pending-confirm-btn', 'ios-docs-pending-cancel-btn', 'ios-docs-upload-feedback']) {
    assert.match(html, new RegExp(`id="${id}"`), `missing required element #${id}`);
  }
});

test('AVAILABLE SOURCES: Scanner and Plugins are never rendered as selectable options — only Camera/Photos/Files, which are real', () => {
  assert.doesNotMatch(html, /id="ios-docs-attach-scanner"/);
  assert.doesNotMatch(html, /id="ios-docs-attach-plugins"/);
  assert.match(inlineScript, /Scanner and Plugins are not available yet/);
});

test('CAMERA/PHOTOS: use the real, standard HTML file-input mechanism (capture attribute), not a fabricated CozyOS camera engine', () => {
  assert.match(html, /id="ios-docs-input-camera"[^>]*capture="environment"/);
  assert.match(html, /id="ios-docs-input-photos"[^>]*accept="image\/\*"/);
  assert.doesNotMatch(html, /id="ios-docs-input-photos"[^>]*capture=/);
});

test('ATTACH SHEET: tapping + opens the sheet, Cancel and each option close it', () => {
  const section = inlineScript.slice(inlineScript.indexOf('attachBtn.addEventListener'), inlineScript.indexOf('function handleFileSelected'));
  assert.match(section, /openAttachSheet/);
  assert.match(section, /closeAttachSheet/);
  assert.match(section, /inputCamera\.click\(\)/);
  assert.match(section, /inputPhotos\.click\(\)/);
  assert.match(section, /inputFiles\.click\(\)/);
});

test('UPLOAD BOUNDARY: upload goes through client.saveDocument() then client.uploadDocument() — never a raw fetch()', () => {
  const uploadHandlerStart = inlineScript.indexOf('ios-docs-pending-confirm-btn").addEventListener');
  const uploadHandlerSection = inlineScript.slice(uploadHandlerStart, uploadHandlerStart + 1800);
  assert.match(uploadHandlerSection, /client\.saveDocument/);
  assert.match(uploadHandlerSection, /client\.uploadDocument/);
  assert.doesNotMatch(uploadHandlerSection, /\bfetch\(/);
});

test('UPLOAD BOUNDARY: the real selected File object (from whichever real source was used) is passed straight through to uploadDocument() — never re-wrapped or re-encoded', () => {
  const uploadHandlerStart = inlineScript.indexOf('ios-docs-pending-confirm-btn").addEventListener');
  const uploadHandlerSection = inlineScript.slice(uploadHandlerStart, uploadHandlerStart + 1800);
  assert.match(uploadHandlerSection, /const file = pendingFile;/);
  assert.match(uploadHandlerSection, /client\.uploadDocument\(documentId, file, \{ filename: file\.name, mimeType: file\.type \}\)/);
});

test('UPLOAD HONEST STATES: selecting, uploading, failure (including server rejection reason), and success are all distinct, real states', () => {
  const uploadHandlerStart = inlineScript.indexOf('ios-docs-pending-confirm-btn").addEventListener');
  const uploadHandlerSection = inlineScript.slice(uploadHandlerStart, uploadHandlerStart + 1800);
  assert.match(inlineScript, /pendingFilename\.textContent = file\.name;/); // selecting
  assert.match(uploadHandlerSection, /Uploading…/); // uploading
  assert.match(uploadHandlerSection, /uploadResult\.reason \|\| .Upload failed\./); // honest failure, server reason preserved
  assert.match(uploadHandlerSection, /Uploaded\./); // success
});

test('UPLOAD: list refresh is triggered only after a genuinely successful upload, never on failure', () => {
  const uploadHandlerStart = inlineScript.indexOf('ios-docs-pending-confirm-btn").addEventListener');
  const uploadHandlerSection = inlineScript.slice(uploadHandlerStart, inlineScript.indexOf('refreshList({});', uploadHandlerStart) + 20);
  const metaFailIdx = uploadHandlerSection.indexOf('Could not create the document record');
  const uploadFailIdx = uploadHandlerSection.indexOf('Upload failed');
  const refreshIdx = uploadHandlerSection.lastIndexOf('refreshList({})');
  assert.ok(metaFailIdx > -1 && uploadFailIdx > -1 && refreshIdx > -1);
  assert.ok(refreshIdx > uploadFailIdx, 'refreshList() must appear only after the failure-handling paths, i.e. on the success path');
});

test('DOWNLOAD BOUNDARY: download goes through client.downloadDocument() only, uses the real returned Blob, never a raw fetch()', () => {
  const dlStart = inlineScript.indexOf('async function downloadDocumentFile');
  const dlSection = inlineScript.slice(dlStart, dlStart + 900);
  assert.match(dlSection, /client\.downloadDocument\(documentId\)/);
  assert.match(dlSection, /URL\.createObjectURL\(result\.blob\)/);
  assert.doesNotMatch(dlSection, /\bfetch\(/);
});

test('DOWNLOAD: a compact icon-style download action is rendered for every document row and wired to the real download handler', () => {
  const renderStart = inlineScript.indexOf('function renderDocList');
  const renderSection = inlineScript.slice(renderStart, renderStart + 1400);
  assert.match(renderSection, /downloadBtn\.textContent = "⬇"/);
  assert.match(renderSection, /downloadDocumentFile\(doc\.documentId, doc\.title\)/);
});

test('DOWNLOAD HONEST STATES: a document with no binary content shows the real server failure reason, not a broken/fabricated download', () => {
  const dlStart = inlineScript.indexOf('async function downloadDocumentFile');
  const dlSection = inlineScript.slice(dlStart, dlStart + 900);
  assert.match(dlSection, /if \(!result\.available\)/);
  assert.match(dlSection, /result\.reason \|\| .Could not download this document\./);
});

test('OWNERSHIP: upload/download never construct or pass actorId/userId/organizationId — only documentId and file metadata', () => {
  const uploadHandlerStart = inlineScript.indexOf('ios-docs-pending-confirm-btn").addEventListener');
  const dlStart = inlineScript.indexOf('async function downloadDocumentFile');
  for (const section of [inlineScript.slice(uploadHandlerStart, uploadHandlerStart + 1800), inlineScript.slice(dlStart, dlStart + 900)]) {
    assert.doesNotMatch(section, /actorId\s*:/);
    assert.doesNotMatch(section, /organizationId\s*:/);
  }
});

test('REGRESSION: existing My Documents save/list/search/view functions are untouched by the "+" redesign', () => {
  assert.match(inlineScript, /client\.saveDocument\(\{ documentId: `interestos_/);
  assert.match(inlineScript, /client\.searchDocuments\(filters \|\| \{\}\)/);
  assert.match(inlineScript, /client\.loadDocument\(documentId\)/);
});

test('HONEST STATES: unavailable client, unauthenticated context, empty list, and failure are all handled without fabricating a document', () => {
  const initSection = inlineScript.slice(inlineScript.indexOf('function initMyDocuments'), inlineScript.indexOf('function initMyDocuments') + 6000);
  assert.match(initSection, /document access client is not loaded/); // client missing
  assert.match(initSection, /ctx\.available/); // context/auth check
  assert.match(initSection, /No documents yet/); // empty state
  assert.match(initSection, /result\.reason \|\| .Could not load documents\./); // error state surfaced honestly
});

test('OWNERSHIP: the UI never passes a client-supplied owner/actorId into any document call — resolveDocumentContext() alone determines it', () => {
  const initSection = inlineScript.slice(inlineScript.indexOf('function initMyDocuments'), inlineScript.indexOf('function initMyDocuments') + 6000);
  assert.doesNotMatch(initSection, /actorId\s*:/);
  assert.doesNotMatch(initSection, /ownerId\s*:/);
  assert.doesNotMatch(initSection, /organizationId\s*:/, 'the UI itself must never construct or pass an organizationId — that comes only from the real session inside the client');
});

test('AI KNOWLEDGE: InterestOS\'s registered capability description records My Documents\' human purpose, real capability, and stated future vision separately', () => {
  const coreSource = fs.readFileSync(path.join(__dirname, '..', 'interestOS-core.js'), 'utf8');
  assert.match(coreSource, /My Documents/);
  assert.match(coreSource, /Human purpose/);
  assert.match(coreSource, /real-life problem solved/i);
  assert.match(coreSource, /beneficiaries/i);
  assert.match(coreSource, /future vision, not a current capability/i);
});
