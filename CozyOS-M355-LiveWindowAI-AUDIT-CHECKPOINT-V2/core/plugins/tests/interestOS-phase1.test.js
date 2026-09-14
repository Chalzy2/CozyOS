'use strict';

/**
 * core/plugins/tests/interestOS-phase1.test.js
 * InterestOS Phase 1 — real tests composing the real, unmodified
 * CozyMemory and CozyNotification engines (not mocked), matching the
 * "no second memory/notification engine" architectural rule by proving
 * InterestOS actually uses the real ones rather than assuming it does.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const REPO_ROOT = path.join(__dirname, '..', '..', '..');
const MEMORY_PATH = path.join(REPO_ROOT, 'core/modules/memory/cozy-memory-engine.js');
const NOTIFICATION_PATH = path.join(REPO_ROOT, 'core/modules/notification/cozy-notification.js');
const INTERESTOS_PATH = path.join(REPO_ROOT, 'core/plugins/interestOS-core.js');

global.window = { CozyOS: {} };
require(MEMORY_PATH);
require(NOTIFICATION_PATH);
let ownerCounter = 0;
function freshOwner() { return `user-${++ownerCounter}-${Math.random().toString(36).slice(2, 8)}`; }

function freshInterestOS() {
  delete require.cache[require.resolve(INTERESTOS_PATH)];
  require(INTERESTOS_PATH);
  return global.window.CozyOS.InterestOS;
}

// ---------------------------------------------------------------
// Minimal fake IndexedDB — test-only scaffolding, not production code.
// Implements exactly the subset InterestOSReminderStore actually uses:
// indexedDB.open() -> onupgradeneeded/onsuccess, db.transaction() ->
// objectStore().put()/getAll(), tx.oncomplete/onerror. No repository
// fake-indexeddb package is available offline, so this is a real,
// small, honest substitute scoped to this test file only.
// ---------------------------------------------------------------
function installFakeIndexedDB() {
  const databases = new Map(); // dbName -> Map(storeName -> Map(id -> record))

  class FakeRequest {
    constructor() { this.onsuccess = null; this.onerror = null; this.result = undefined; this.error = null; }
    _succeed(result) { this.result = result; if (this.onsuccess) this.onsuccess({ target: this }); }
    _fail(error) { this.error = error; if (this.onerror) this.onerror({ target: this }); }
  }
  class FakeObjectStore {
    constructor(map) { this.map = map; }
    put(record) { this.map.set(record.id, structuredCloneLike(record)); const req = new FakeRequest(); queueMicrotask(() => req._succeed(record.id)); return req; }
    getAll() { const req = new FakeRequest(); const values = [...this.map.values()].map(structuredCloneLike); queueMicrotask(() => req._succeed(values)); return req; }
  }
  class FakeTransaction {
    constructor(map) { this.map = map; this.oncomplete = null; this.onerror = null; this.error = null; queueMicrotask(() => { if (this.oncomplete) this.oncomplete(); }); }
    objectStore() { return new FakeObjectStore(this.map); }
  }
  class FakeDB {
    constructor(storeMap) { this.storeMap = storeMap; this.objectStoreNames = { contains: (name) => this.storeMap.has(name) }; }
    createObjectStore(name) { const m = new Map(); this.storeMap.set(name, m); return new FakeObjectStore(m); }
    transaction(name) { return new FakeTransaction(this.storeMap.get(name)); }
  }
  function structuredCloneLike(v) { return JSON.parse(JSON.stringify(v)); }

  global.indexedDB = {
    open(name, _version) {
      const req = new FakeRequest();
      queueMicrotask(() => {
        if (!databases.has(name)) databases.set(name, new Map());
        const storeMap = databases.get(name);
        const db = new FakeDB(storeMap);
        if (storeMap.size === 0 && req.onupgradeneeded) req.onupgradeneeded({ target: { result: db } });
        req._succeed(db);
      });
      return req;
    },
  };
  return { clear: () => databases.clear() };
}

const fakeIDB = installFakeIndexedDB();

// ---------------------------------------------------------------
// Confirmation-first rule
// ---------------------------------------------------------------

test('CONFIRMATION-FIRST: createDirective() refuses to persist without confirmed:true', () => {
  const IOS = freshInterestOS();
  assert.throws(() => IOS.createDirective({ owner: 'user-1', text: 'Remind me at 4pm', source: 'text' }), /confirmed/);
});

test('CONFIRMATION-FIRST: createDirective() succeeds once confirmed:true is explicitly passed', () => {
  const IOS = freshInterestOS();
  const d = IOS.createDirective({ owner: 'user-1', text: 'Call the customer', source: 'text', confirmed: true });
  assert.equal(typeof d.id, 'string');
  assert.equal(d.status, 'active');
});

// ---------------------------------------------------------------
// Directive persistence (real CozyMemory, not mocked)
// ---------------------------------------------------------------

test('PERSISTENCE: a created directive is genuinely retrievable afterward via the real CozyMemory-backed getDirective()', () => {
  const IOS = freshInterestOS();
  const d = IOS.createDirective({ owner: 'user-1', text: 'Buy stock', source: 'text', confirmed: true });
  const fetched = IOS.getDirective(d.id, 'user-1');
  assert.equal(fetched.text, 'Buy stock');
});

test('MALFORMED: createDirective() rejects missing owner/text/invalid source', () => {
  const IOS = freshInterestOS();
  assert.throws(() => IOS.createDirective({ text: 'x', source: 'text', confirmed: true }), TypeError);
  assert.throws(() => IOS.createDirective({ owner: 'user-1', source: 'text', confirmed: true }), TypeError);
  assert.throws(() => IOS.createDirective({ owner: 'user-1', text: 'x', source: 'carrier-pigeon', confirmed: true }), TypeError);
});

// ---------------------------------------------------------------
// Edit / pause / resume / delete
// ---------------------------------------------------------------

test('EDIT: updateDirective() changes text, leaves other fields intact', () => {
  const IOS = freshInterestOS();
  const d = IOS.createDirective({ owner: 'user-1', text: 'Original', source: 'text', confirmed: true });
  const updated = IOS.updateDirective(d.id, { text: 'Revised' }, 'user-1');
  assert.equal(updated.text, 'Revised');
  assert.equal(updated.owner, 'user-1');
});

test('PAUSE/RESUME: real status transitions persist', () => {
  const IOS = freshInterestOS();
  const d = IOS.createDirective({ owner: 'user-1', text: 'X', source: 'text', confirmed: true });
  IOS.pauseDirective(d.id, 'user-1');
  assert.equal(IOS.getDirective(d.id, 'user-1').status, 'paused');
  IOS.resumeDirective(d.id, 'user-1');
  assert.equal(IOS.getDirective(d.id, 'user-1').status, 'active');
});

test('DELETE: a deleted directive is genuinely gone from the real memory store', () => {
  const IOS = freshInterestOS();
  const d = IOS.createDirective({ owner: 'user-1', text: 'X', source: 'text', confirmed: true });
  assert.equal(IOS.deleteDirective(d.id, 'user-1'), true);
  assert.equal(IOS.getDirective(d.id, 'user-1'), null);
});

// ---------------------------------------------------------------
// Owner isolation / authorization boundary
// ---------------------------------------------------------------

test('OWNER ISOLATION: listDirectives() for one owner never returns another owner\'s directives', () => {
  const IOS = freshInterestOS();
  const ownerA = freshOwner(), ownerB = freshOwner();
  IOS.createDirective({ owner: ownerA, text: 'A', source: 'text', confirmed: true });
  IOS.createDirective({ owner: ownerB, text: 'B', source: 'text', confirmed: true });
  const listA = IOS.listDirectives(ownerA, ownerA);
  assert.equal(listA.length, 1);
  assert.equal(listA[0].text, 'A');
});

test('AUTHORIZATION: a different actorId cannot read a private-owned directive (real CozyMemory visibility check, not InterestOS-invented)', () => {
  const IOS = freshInterestOS();
  const d = IOS.createDirective({ owner: 'user-1', text: 'Private', source: 'text', confirmed: true });
  assert.equal(IOS.getDirective(d.id, 'user-2'), null);
});

// ---------------------------------------------------------------
// Provenance (Teach Cozy)
// ---------------------------------------------------------------

test('PROVENANCE: teach() always records USER_TAUGHT, never AI_INFERRED or SYSTEM_VERIFIED', () => {
  const IOS = freshInterestOS();
  const t = IOS.teach({ owner: 'user-1', text: 'In my business, VIP means repeat customer' });
  assert.equal(t.provenance, 'USER_TAUGHT');
  assert.throws(() => IOS.teach({ owner: 'user-1', text: 'x', provenance: 'AI_INFERRED' }), /USER_TAUGHT entries/);
});

test('PROVENANCE: listTaught() reflects real persisted entries, owner-isolated', () => {
  const IOS = freshInterestOS();
  const ownerA = freshOwner(), ownerB = freshOwner();
  IOS.teach({ owner: ownerA, text: 'fact one' });
  IOS.teach({ owner: ownerB, text: 'fact two' });
  assert.equal(IOS.listTaught(ownerA, ownerA).length, 1);
});

// ---------------------------------------------------------------
// Directive interpretation (disclosed heuristic)
// ---------------------------------------------------------------

test('INTERPRETATION: interpretDirective() honestly discloses it is a heuristic, not real AI', () => {
  const IOS = freshInterestOS();
  const result = IOS.interpretDirective('Remind me at 6 PM to call the customer');
  assert.equal(result.method, 'HEURISTIC');
  assert.match(result.disclosure, /not real AI/);
  assert.equal(result.actionGuess, 'reminder');
  assert.ok(result.reminderAtGuess);
});

test('INTERPRETATION: empty text is honestly reported unavailable, not silently guessed', () => {
  const IOS = freshInterestOS();
  const result = IOS.interpretDirective('   ');
  assert.equal(result.available, false);
});

test('KISWAHILI: a real Kiswahili directive is recognized via keywords, and Kiswahili confirmation-wording gap is honestly disclosed', () => {
  const IOS = freshInterestOS();
  const result = IOS.interpretDirective('Nikumbushe saa 4 nimpigie simu mteja');
  assert.equal(result.available, true);
  assert.equal(result.detectedLanguage, 'sw');
  assert.equal(result.actionGuess, 'reminder');
  assert.ok(result.reminderAtGuess);
  assert.match(result.disclosure, /Kiswahili confirmation wording is not yet implemented/);
});

test('KISWAHILI: an English directive is not misdetected as Kiswahili', () => {
  const IOS = freshInterestOS();
  const result = IOS.interpretDirective('Remind me at 4pm to call the customer');
  assert.equal(result.detectedLanguage, 'en');
});

// ---------------------------------------------------------------
// One-time reminders (real CozyNotification registry, tab-lifetime disclosed)
// ---------------------------------------------------------------

test('REMINDER: scheduleOneTimeReminder() honestly reports persistedToDisk when IndexedDB is available', async () => {
  const IOS = freshInterestOS();
  const fireAt = new Date(Date.now() + 60000).toISOString();
  const result = await IOS.scheduleOneTimeReminder({ directiveId: 'd1', owner: 'user-1', fireAt, message: 'Call John' });
  assert.equal(result.available, true);
  assert.equal(result.persistent, false);
  assert.equal(result.persistedToDisk, true);
  assert.match(result.disclosure, /survives a page reload/);
  result.cancel();
});

test('REMINDER: a past fireAt is honestly refused, never silently fired immediately', async () => {
  const IOS = freshInterestOS();
  const fireAt = new Date(Date.now() - 60000).toISOString();
  const result = await IOS.scheduleOneTimeReminder({ directiveId: 'd1', owner: 'user-1', fireAt, message: 'Too late' });
  assert.equal(result.available, false);
});

test('REMINDER: without CozyNotification loaded, honestly reports unavailable — never a fake success', async () => {
  const IOS = freshInterestOS();
  const saved = global.window.CozyOS.CozyNotification;
  delete global.window.CozyOS.CozyNotification;
  try {
    const fireAt = new Date(Date.now() + 60000).toISOString();
    const result = await IOS.scheduleOneTimeReminder({ directiveId: 'd1', owner: 'user-1', fireAt, message: 'X' });
    assert.equal(result.available, false);
    assert.match(result.reason, /CozyNotification is not loaded/);
  } finally {
    global.window.CozyOS.CozyNotification = saved;
  }
});

// ---------------------------------------------------------------
// Phase 2, Dependency #1 — IndexedDB persistence + reload rehydration
// ---------------------------------------------------------------

test('PHASE 2 PERSISTENCE: a scheduled reminder is genuinely written to the real (fake) IndexedDB store', async () => {
  fakeIDB.clear();
  const IOS = freshInterestOS();
  const fireAt = new Date(Date.now() + 60000).toISOString();
  const result = await IOS.scheduleOneTimeReminder({ directiveId: 'd1', owner: 'user-1', fireAt, message: 'Persisted reminder' });
  const store = new global.window.CozyOS.InterestOSReminderStore();
  const all = await store.loadAll();
  assert.equal(all.success, true);
  assert.equal(all.records.length, 1);
  assert.equal(all.records[0].id, result.reminderId);
  assert.equal(all.records[0].delivered, false);
  result.cancel();
});

test('PHASE 2 REHYDRATION: a future reminder is re-armed with the correct remaining duration, not a fresh full duration', async () => {
  fakeIDB.clear();
  const IOS = freshInterestOS();
  const store = new global.window.CozyOS.InterestOSReminderStore();
  const fireAt = new Date(Date.now() + 500).toISOString();
  await store.save({ id: 'rem-future', directiveId: 'd1', owner: 'user-1', fireAt, message: 'Soon', delivered: false });

  const result = await IOS.rehydrateReminders('user-1');
  assert.equal(result.available, true);
  assert.equal(result.rearmed, 1);
  assert.equal(result.dueImmediately, 0);

  // Wait past the real remaining duration and confirm it actually fired and updated persisted state.
  await new Promise((resolve) => setTimeout(resolve, 700));
  const after = await store.loadAll();
  assert.equal(after.records.find((r) => r.id === 'rem-future').delivered, true);
});

test('PHASE 2 DUE REMINDERS: an already-due reminder is handled deterministically — marked delivered immediately, not silently fired late', async () => {
  fakeIDB.clear();
  const IOS = freshInterestOS();
  const store = new global.window.CozyOS.InterestOSReminderStore();
  const pastFireAt = new Date(Date.now() - 60000).toISOString();
  await store.save({ id: 'rem-past', directiveId: 'd1', owner: 'user-1', fireAt: pastFireAt, message: 'Overdue', delivered: false });

  const result = await IOS.rehydrateReminders('user-1');
  assert.equal(result.dueImmediately, 1);
  assert.equal(result.rearmed, 0);

  const after = await store.loadAll();
  const rec = after.records.find((r) => r.id === 'rem-past');
  assert.equal(rec.delivered, true);
  assert.ok(rec.deliveredAt);
});

test('PHASE 2 DELIVERY STATE: delivered reminders are never re-armed on a later rehydration', async () => {
  fakeIDB.clear();
  const IOS = freshInterestOS();
  const store = new global.window.CozyOS.InterestOSReminderStore();
  await store.save({ id: 'rem-done', directiveId: 'd1', owner: 'user-1', fireAt: new Date(Date.now() + 60000).toISOString(), message: 'Already delivered', delivered: true, deliveredAt: new Date().toISOString() });

  const result = await IOS.rehydrateReminders('user-1');
  assert.equal(result.rearmed, 0);
  assert.equal(result.dueImmediately, 0);
});

test('PHASE 2 OWNER ISOLATION: rehydrateReminders() never re-arms or reports another owner\'s reminders', async () => {
  fakeIDB.clear();
  const IOS = freshInterestOS();
  const store = new global.window.CozyOS.InterestOSReminderStore();
  await store.save({ id: 'rem-a', directiveId: 'd1', owner: 'user-1', fireAt: new Date(Date.now() + 500).toISOString(), message: 'Mine', delivered: false });
  await store.save({ id: 'rem-b', directiveId: 'd2', owner: 'user-2', fireAt: new Date(Date.now() + 500).toISOString(), message: 'Not mine', delivered: false });

  const result = await IOS.rehydrateReminders('user-1');
  assert.equal(result.rearmed, 1);

  await new Promise((resolve) => setTimeout(resolve, 700));
  const all = await store.loadAll();
  assert.equal(all.records.find((r) => r.id === 'rem-a').delivered, true);
  assert.equal(all.records.find((r) => r.id === 'rem-b').delivered, false, "user-2's reminder must never be touched by user-1's rehydration");
});

test('PHASE 2 FAIL-SAFE: rehydrateReminders() honestly reports unavailable when IndexedDB is genuinely absent, never throws', async () => {
  const saved = global.indexedDB;
  delete global.indexedDB;
  try {
    const IOS = freshInterestOS();
    const result = await IOS.rehydrateReminders('user-1');
    assert.equal(result.available, false);
    assert.match(result.reason, /IndexedDB is not available/);
  } finally {
    global.indexedDB = saved;
  }
});

test('PHASE 2 FAIL-SAFE: scheduleOneTimeReminder() still succeeds (tab-lifetime only) when IndexedDB is genuinely absent', async () => {
  const saved = global.indexedDB;
  delete global.indexedDB;
  try {
    const IOS = freshInterestOS();
    const fireAt = new Date(Date.now() + 60000).toISOString();
    const result = await IOS.scheduleOneTimeReminder({ directiveId: 'd1', owner: 'user-1', fireAt, message: 'X' });
    assert.equal(result.available, true);
    assert.equal(result.persistedToDisk, false);
    assert.match(result.disclosure, /will NOT survive a reload/);
    result.cancel();
  } finally {
    global.indexedDB = saved;
  }
});

test('PHASE 2 REGRESSION: confirmation-first rule is unchanged — a directive still cannot be created without confirmed:true', () => {
  const IOS = freshInterestOS();
  assert.throws(() => IOS.createDirective({ owner: 'user-1', text: 'X', source: 'text' }), /confirmed/);
});

// ---------------------------------------------------------------
// Phase 2, Dependency #2 — Calculations integration (pure passthrough)
// ---------------------------------------------------------------

function withCalculationEngine(fn) {
  const CALC_REGISTRY_PATH = path.join(REPO_ROOT, 'core/calculation/formula-registry.js');
  const CALC_LIB_PATH = path.join(REPO_ROOT, 'core/calculation/formula-library.js');
  const CALC_DATETIME_PATH = path.join(REPO_ROOT, 'core/calculation/formula-library-datetime.js');
  const CALC_ENGINE_PATH = path.join(REPO_ROOT, 'core/calculation/calculation-engine.js');
  [CALC_REGISTRY_PATH, CALC_LIB_PATH, CALC_DATETIME_PATH, CALC_ENGINE_PATH].forEach((p) => delete require.cache[require.resolve(p)]);
  require(CALC_REGISTRY_PATH);
  require(CALC_LIB_PATH);
  require(CALC_DATETIME_PATH);
  require(CALC_ENGINE_PATH);
  return fn();
}

test('CALCULATIONS: listCalculationFormulas() honestly reports unavailable when FormulaRegistry is not loaded', () => {
  const IOS = freshInterestOS();
  const result = IOS.listCalculationFormulas();
  assert.equal(result.available, false);
});

test('CALCULATIONS: listCalculationFormulas() is a pure passthrough to the real, existing FormulaRegistry — same formulas, not a copy', () => {
  withCalculationEngine(() => {
    const IOS = freshInterestOS();
    const result = IOS.listCalculationFormulas();
    assert.equal(result.available, true);
    assert.ok(result.formulas.some((f) => f.formulaId === 'Business.Margin'));
    assert.deepEqual(result.formulas, global.window.CozyOS.FormulaRegistry.list());
  });
});

test('CALCULATIONS: runCalculation() is a pure passthrough to the real CalculationEngine — real result, not InterestOS-computed', () => {
  withCalculationEngine(() => {
    const IOS = freshInterestOS();
    const result = IOS.runCalculation('Business.Margin', { revenue: 100, cost: 60 });
    assert.equal(result.success, true);
    assert.equal(result.result, global.window.CozyOS.CalculationEngine.calculate('Business.Margin', { revenue: 100, cost: 60 }).result);
  });
});

test('CALCULATIONS: runCalculation() surfaces the real engine\'s own fail-closed refusal, never invents a result', () => {
  withCalculationEngine(() => {
    const IOS = freshInterestOS();
    const result = IOS.runCalculation('Business.Margin', { revenue: 100 }); // missing "cost"
    assert.equal(result.success, false);
  });
});

test('CALCULATIONS: no goal-progress logic is duplicated — InterestOS never computes a percentage itself (Goals engine remains sole authority)', () => {
  const source = require('node:fs').readFileSync(INTERESTOS_PATH, 'utf8');
  assert.doesNotMatch(source, /savedAmount\s*\/\s*targetAmount/);
  assert.doesNotMatch(source, /Math\.round\(.*100\)/);
});

// ---------------------------------------------------------------
// Phase 2, Dependency #3 — DateTime.DaysBetween (real formula,
// extending the existing FormulaRegistry, not a new engine)
// ---------------------------------------------------------------

test('DATETIME FORMULA: DateTime.DaysBetween registers on the real, existing FormulaRegistry', () => {
  withCalculationEngine(() => {
    const entry = global.window.CozyOS.FormulaRegistry.get('DateTime.DaysBetween');
    assert.ok(entry);
    assert.deepEqual(entry.requiredInputs, ['startEpochMs', 'endEpochMs']);
  });
});

test('DATETIME FORMULA: valid epoch inputs produce the correct, deterministic day count', () => {
  withCalculationEngine(() => {
    const start = Date.UTC(2026, 0, 1);
    const end = Date.UTC(2026, 0, 8); // 7 days later
    const result = global.window.CozyOS.CalculationEngine.calculate('DateTime.DaysBetween', { startEpochMs: start, endEpochMs: end });
    assert.equal(result.success, true);
    assert.equal(result.result, 7);
  });
});

test('DATETIME FORMULA: a target date already in the past produces a negative "days until" value, not an error', () => {
  withCalculationEngine(() => {
    const now = Date.UTC(2026, 5, 10);
    const pastTarget = Date.UTC(2026, 5, 5); // 5 days earlier
    const result = global.window.CozyOS.CalculationEngine.calculate('DateTime.DaysBetween', { startEpochMs: now, endEpochMs: pastTarget });
    assert.equal(result.success, true);
    assert.equal(result.result, -5);
  });
});

test('DATETIME FORMULA: invalid (non-numeric) inputs are refused by the real CalculationEngine\'s own fail-closed validation, not silently coerced', () => {
  withCalculationEngine(() => {
    const result = global.window.CozyOS.CalculationEngine.calculate('DateTime.DaysBetween', { startEpochMs: '2026-01-01', endEpochMs: Date.now() });
    assert.equal(result.success, false);
  });
});

test('DATETIME FORMULA: same inputs always produce the same output — no internal Date.now() dependency', () => {
  withCalculationEngine(() => {
    const inputs = { startEpochMs: 1704067200000, endEpochMs: 1704240000000 };
    const r1 = global.window.CozyOS.CalculationEngine.calculate('DateTime.DaysBetween', inputs);
    const r2 = global.window.CozyOS.CalculationEngine.calculate('DateTime.DaysBetween', inputs);
    assert.equal(r1.result, r2.result);
  });
});

test('DATETIME FORMULA: reachable through InterestOS\'s existing passthrough, not a new InterestOS method', () => {
  withCalculationEngine(() => {
    const IOS = freshInterestOS();
    const list = IOS.listCalculationFormulas();
    assert.ok(list.formulas.some((f) => f.formulaId === 'DateTime.DaysBetween'));
    const result = IOS.runCalculation('DateTime.DaysBetween', { startEpochMs: 0, endEpochMs: 86400000 });
    assert.equal(result.result, 1);
  });
});

test('DATETIME FORMULA: no duplicate date logic added inside InterestOS itself', () => {
  const source = require('node:fs').readFileSync(INTERESTOS_PATH, 'utf8');
  assert.doesNotMatch(source, /86400000/);
  assert.doesNotMatch(source, /DaysBetween\s*=/);
});

test('PHASE 2 NO DUPLICATE ENGINE: InterestOSReminderStore has its own real, separate database — never the identity/session store', async () => {
  fakeIDB.clear();
  const IOS = freshInterestOS();
  await IOS.scheduleOneTimeReminder({ directiveId: 'd1', owner: 'user-1', fireAt: new Date(Date.now() + 60000).toISOString(), message: 'X' })
    .then((r) => r.cancel());
  assert.equal(global.window.CozyOS.InterestOSReminderStore.DB_NAME, 'cozyos-interestos');
  assert.notEqual(global.window.CozyOS.InterestOSReminderStore.DB_NAME, 'cozyos-identity');
});

// ---------------------------------------------------------------
// No duplicate engine — real composition check
// ---------------------------------------------------------------

test('NO DUPLICATE ENGINE: InterestOS composes the real window.CozyOS.CozyMemory instance, never its own store', () => {
  const IOS = freshInterestOS();
  const d = IOS.createDirective({ owner: 'user-1', text: 'X', source: 'text', confirmed: true });
  const raw = global.window.CozyOS.CozyMemory.readMemory('interestos:directives', d.id, 'user-1');
  assert.equal(raw.value.text, 'X');
});

test('NO DUPLICATE ENGINE: requireMemory() throws honestly if CozyMemory is genuinely absent, rather than silently creating a fallback store', () => {
  const IOS = freshInterestOS();
  const saved = global.window.CozyOS.CozyMemory;
  delete global.window.CozyOS.CozyMemory;
  try {
    assert.throws(() => IOS.createDirective({ owner: 'user-1', text: 'X', source: 'text', confirmed: true }), /CozyMemory is not loaded/);
  } finally {
    global.window.CozyOS.CozyMemory = saved;
  }
});
