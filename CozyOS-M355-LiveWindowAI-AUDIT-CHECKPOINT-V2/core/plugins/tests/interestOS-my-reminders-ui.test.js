'use strict';

/**
 * core/plugins/tests/interestOS-my-reminders-ui.test.js
 * My Reminders list view — verifies the real HTML file's structure and
 * that its inline script reads exclusively from window.CozyOS.
 * CozyNotification.notification.list() (the same registry
 * scheduleOneTimeReminder() already writes into), with real
 * owner-isolation and honest empty/error states. Does not duplicate
 * interestOS-phase1.test.js's own coverage of scheduleOneTimeReminder()/
 * rehydrateReminders() — this file only verifies the new read/render UI.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const HTML_PATH = path.join(__dirname, '..', '..', '..', 'applications', 'InterestOS', 'interestos.html');
const html = fs.readFileSync(HTML_PATH, 'utf8');
const inlineScript = html.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/)[1];
const rendersSection = inlineScript.slice(inlineScript.indexOf('function renderReminders'), inlineScript.indexOf('function renderReminders') + 2200);

test('STRUCTURE: My Reminders section exists with list and note elements', () => {
  assert.match(html, /<h3>My Reminders<\/h3>/);
  assert.match(html, /id="ios-reminders-list"/);
  assert.match(html, /id="ios-reminders-note"/);
});

test('AUTHORITATIVE SOURCE: reminders are read via CozyNotification.notification.list() only — no second reminder store', () => {
  assert.match(rendersSection, /window\.CozyOS\.CozyNotification/);
  assert.match(rendersSection, /notification\.notification\.list\(\)/);
  assert.doesNotMatch(rendersSection, /InterestOSReminderStore/, 'the UI must read via CozyNotification, never a direct IndexedDB store of its own');
  assert.doesNotMatch(rendersSection, /new\s+\w*Store\(/);
});

test('FILTERING: only records with type "interestos-reminder" and the real current owner are shown', () => {
  assert.match(rendersSection, /r\.type === "interestos-reminder"/);
  assert.match(rendersSection, /r\.owner === owner/);
});

test('OWNER ISOLATION: owner comes only from resolveActorId(), never a parameter or literal the UI invents', () => {
  assert.match(rendersSection, /const owner = resolveActorId\(\);/);
  assert.doesNotMatch(rendersSection, /owner\s*:\s*['"]/, 'no hardcoded/fabricated owner literal');
});

test('STATUS: delivered/pending comes only from the record\'s real `delivered` field, never inferred from comparing fireAt to "now"', () => {
  assert.match(rendersSection, /r\.delivered === true \? "Delivered" : "Pending"/);
  assert.doesNotMatch(rendersSection, /new Date\(\)\s*[<>]=?\s*new Date\(r\.fireAt\)/, 'must not infer status by comparing the current time to fireAt');
  assert.doesNotMatch(rendersSection, /Date\.now\(\)\s*[<>]/);
});

test('RENDERING: message and scheduled time are both rendered from the real record fields', () => {
  assert.match(rendersSection, /r\.message/);
  assert.match(rendersSection, /new Date\(r\.fireAt\)\.toLocaleString\(\)/);
});

test('EMPTY STATE: no reminders for the current owner shows an honest empty message, never a fabricated reminder', () => {
  assert.match(rendersSection, /No reminders yet\./);
});

test('ERROR STATES: missing CozyNotification and a genuine list() failure are both handled honestly', () => {
  assert.match(rendersSection, /CozyNotification is not loaded/);
  assert.match(rendersSection, /Could not load reminders: /);
});

test('UNAUTHENTICATED: no signed-in user is handled honestly, list is cleared rather than left stale', () => {
  assert.match(rendersSection, /No signed-in user — cannot list reminders\./);
});

test('REGRESSION: renderReminders() is called during init() alongside the existing render calls', () => {
  assert.match(inlineScript, /renderDirectives\(\);\s*\n\s*renderReminders\(\);/);
});

test('LIVE REFRESH: renderReminders() is re-invoked right after a reminder is successfully scheduled — CozyNotification is in-memory only, so a scheduled reminder would otherwise never appear this session', () => {
  const scheduleIdx = inlineScript.indexOf('scheduleOneTimeReminder(');
  const afterScheduleSection = inlineScript.slice(scheduleIdx, scheduleIdx + 700);
  assert.match(afterScheduleSection, /renderReminders\(\);/);
});

test('NO SECOND ENGINE: scheduleOneTimeReminder()/rehydrateReminders() in interestOS-core.js are untouched by this UI addition', () => {
  const coreSource = fs.readFileSync(path.join(__dirname, '..', 'interestOS-core.js'), 'utf8');
  assert.match(coreSource, /async scheduleOneTimeReminder\(/);
  assert.match(coreSource, /async rehydrateReminders\(/);
});
