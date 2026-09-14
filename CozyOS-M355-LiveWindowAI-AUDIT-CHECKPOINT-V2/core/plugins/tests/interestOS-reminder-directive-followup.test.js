'use strict';

/**
 * core/plugins/tests/interestOS-reminder-directive-followup.test.js
 * Targeted increment: lets an existing reminder carry/use its linked
 * directive's real action/follow-up information.
 *
 * Covers two things, deliberately kept separate from the existing
 * suites they extend rather than duplicating them:
 *   1. completeDirective() (interestOS-core.js) — the one missing
 *      status transition; STATUSES has always declared "completed"
 *      but nothing ever reached it before this increment.
 *   2. The My Reminders UI's new directive lookup + "Mark done" button
 *      (interestos.html's renderReminders()) — static source checks,
 *      matching interestOS-my-reminders-ui.test.js's own style.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.join(__dirname, '..', '..', '..');
const MEMORY_PATH = path.join(REPO_ROOT, 'core/modules/memory/cozy-memory-engine.js');
const NOTIFICATION_PATH = path.join(REPO_ROOT, 'core/modules/notification/cozy-notification.js');
const INTERESTOS_PATH = path.join(REPO_ROOT, 'core/plugins/interestOS-core.js');
const HTML_PATH = path.join(REPO_ROOT, 'applications', 'InterestOS', 'interestos.html');

global.window = { CozyOS: {} };
require(MEMORY_PATH);
require(NOTIFICATION_PATH);
require(INTERESTOS_PATH);
const IOS = global.window.CozyOS.InterestOS;

let ownerCounter = 0;
function freshOwner() { return `user-${++ownerCounter}-${Math.random().toString(36).slice(2, 8)}`; }

// ---------------------------------------------------------------
// completeDirective() — core engine method
// ---------------------------------------------------------------

test('COMPLETE: completeDirective() transitions a real directive to "completed" and persists it', () => {
  const owner = freshOwner();
  const d = IOS.createDirective({ owner, text: 'Call the customer', source: 'text', confirmed: true });
  assert.equal(d.status, 'active');
  const completed = IOS.completeDirective(d.id, owner);
  assert.equal(completed.status, 'completed');
  // Genuinely persisted, not just returned in-memory.
  assert.equal(IOS.getDirective(d.id, owner).status, 'completed');
});

test('COMPLETE: reuses the existing #mutateDirective pathway — same "not found" behavior as pause/resume', () => {
  const owner = freshOwner();
  assert.throws(() => IOS.completeDirective('directive_does-not-exist', owner), /No directive/);
});

test('COMPLETE: owner isolation — another actor cannot complete a directive that is not theirs', () => {
  const ownerA = freshOwner();
  const ownerB = freshOwner();
  const d = IOS.createDirective({ owner: ownerA, text: 'Private task', source: 'text', confirmed: true });
  assert.throws(() => IOS.completeDirective(d.id, ownerB), /No directive/);
  assert.equal(IOS.getDirective(d.id, ownerA).status, 'active');
});

test('COMPLETE: a completed directive can still be read normally via listDirectives()', () => {
  const owner = freshOwner();
  const d = IOS.createDirective({ owner, text: 'Finish this', source: 'text', confirmed: true });
  IOS.completeDirective(d.id, owner);
  const listed = IOS.listDirectives(owner, owner);
  const found = listed.find((x) => x.key === d.id || x.id === d.id);
  assert.ok(found);
  assert.equal(found.status, 'completed');
});

test('NO SECOND ENGINE: completeDirective() calls no persistence API other than the real, existing CozyMemory used by pause/resume', () => {
  const coreSource = fs.readFileSync(INTERESTOS_PATH, 'utf8');
  assert.match(coreSource, /completeDirective\(id, actorId\) \{ return this\.#mutateDirective\(id, actorId, \{ status: "completed" \}\); \}/);
});

// ---------------------------------------------------------------
// My Reminders UI — directive lookup + Mark done button
// ---------------------------------------------------------------

const html = fs.readFileSync(HTML_PATH, 'utf8');
const inlineScript = html.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/)[1];
const startIdx = inlineScript.indexOf('function renderReminders');
const endIdx = inlineScript.indexOf('\n    function ', startIdx + 10);
const rendersSection = inlineScript.slice(startIdx, endIdx === -1 ? startIdx + 3000 : endIdx);

test('LOOKUP: renderReminders() looks up the reminder\'s real linked directive via the existing getDirective(), never a new store', () => {
  assert.match(rendersSection, /interestOS\.getDirective\(r\.directiveId, owner\)/);
  assert.doesNotMatch(rendersSection, /new\s+\w*Store\(/);
});

test('HONEST FALLBACK: a missing/deleted directive or unloaded InterestOS degrades to no directive info, never a fabricated one', () => {
  assert.match(rendersSection, /let directive = null;/);
  assert.match(rendersSection, /catch \(_err\) \{ directive = null; \}/);
});

test('FOLLOW-UP ACTION: a "Mark done" button appears only while the linked directive is not already completed, wired to completeDirective()', () => {
  assert.match(rendersSection, /directive\.status !== "completed"/);
  assert.match(rendersSection, /doneBtn\.textContent = "Mark done";/);
  assert.match(rendersSection, /interestOS\.completeDirective\(directive\.id, owner\);/);
});

test('LIVE REFRESH: completing a directive from My Reminders re-renders both My Directives and My Reminders', () => {
  const clickIdx = rendersSection.indexOf('doneBtn.addEventListener');
  const afterClick = rendersSection.slice(clickIdx, clickIdx + 250);
  assert.match(afterClick, /renderDirectives\(\);/);
  assert.match(afterClick, /renderReminders\(\);/);
});

test('OWNER ISOLATION: the directive lookup uses the same resolveActorId()-derived owner as the reminder list itself, never a literal', () => {
  assert.match(rendersSection, /interestOS\.getDirective\(r\.directiveId, owner\)/);
  const ownerDeclIdx = rendersSection.indexOf('const owner = resolveActorId();');
  assert.ok(ownerDeclIdx !== -1, 'owner must come from resolveActorId(), matching the pre-existing pattern');
});

test('REGRESSION: existing message/time/status rendering is untouched by the directive-lookup addition', () => {
  assert.match(rendersSection, /r\.message/);
  assert.match(rendersSection, /new Date\(r\.fireAt\)\.toLocaleString\(\)/);
  assert.match(rendersSection, /r\.delivered === true \? "Delivered" : "Pending"/);
});
