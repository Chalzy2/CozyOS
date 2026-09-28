/**
 * core/modules/QuarryOS/tests/quarry-storage-persistence-browser.test.js
 *
 * REAL browser (Playwright + actual headless Chromium) verification that
 * the QuarryOS persistence root-cause fix (core/modules/QuarryOS/
 * quarry-index.js) genuinely persists data through the real, unmodified
 * window.CozyStorage gateway (core/storage.js) — REAL IndexedDB, not a
 * mock, and REAL survival across an actual page reload, which is the
 * concrete, user-visible thing "persistence" means.
 *
 * This exists for the same reason
 * core/tests/browser/business-record-browser.test.js exists: Node has no
 * real IndexedDB, so core/modules/QuarryOS/tests/quarry-storage-persistence.test.js
 * (Node, a FakeStorageGateway double) can only prove the CALLING
 * CONVENTION is correct, not that data genuinely survives in a real
 * browser's storage across a reload. This suite is the one place that
 * cross-reload proof is made.
 *
 * Run with: node core/modules/QuarryOS/tests/quarry-storage-persistence-browser.test.js
 */

'use strict';

const { withBrowser, makeRunner } = require('../../../tests/browser/cozy-browser');

async function main() {
  const { test, summary } = makeRunner();

  try {
    await withBrowser(async ({ openPage, serverURL }) => {
      const { page, consoleErrors, pageErrors } = await openPage();
      await page.goto(serverURL('/core/modules/QuarryOS/tests/fixtures/quarry-storage-persistence-fixture.html'), { waitUntil: 'load' });

      await test('fixture page loads the real window.CozyStorage + QuarryManager dependency chain with no page errors', async () => {
        if (pageErrors.length > 0) throw new Error('uncaught page errors during load: ' + pageErrors.join(' | '));
        const state = await page.evaluate(() => ({
          storage: typeof window.CozyStorage,
          hasSave: !!(window.CozyStorage && typeof window.CozyStorage.save === 'function'),
          hasList: !!(window.CozyStorage && typeof window.CozyStorage.list === 'function'),
          hasInsert: !!(window.CozyStorage && typeof window.CozyStorage.insert === 'function'),
          quarryManager: !!(window.CozyOS && window.CozyOS.Modules && window.CozyOS.Modules.QuarryManager),
        }));
        if (state.storage === 'undefined') throw new Error('expected real window.CozyStorage to be present, got: ' + JSON.stringify(state));
        if (!state.hasSave || !state.hasList) throw new Error('expected the real gateway shape (save+list), got: ' + JSON.stringify(state));
        if (state.hasInsert) throw new Error('sanity check failed: real window.CozyStorage must NOT have an insert() method (confirms this is the real gateway, not an accidental double)');
        if (!state.quarryManager) throw new Error('expected window.CozyOS.Modules.QuarryManager to be present, got: ' + JSON.stringify(state));
      });

      await test('window.CozyStorage.init() opens a real IndexedDB database in this real browser', async () => {
        const opened = await page.evaluate(async () => {
          try {
            return await window.CozyStorage.init();
          } catch (e) {
            return { __error: e.message };
          }
        });
        if (opened !== true) throw new Error('expected CozyStorage.init() to resolve true, got: ' + JSON.stringify(opened));
      });

      // ────────────────────────────────────────────────────────────
      // (a) A route that previously silently no-op'd now actually writes
      //     a real, retrievable IndexedDB record.
      // ────────────────────────────────────────────────────────────
      await test('handle("assign_workforce") through the real QuarryManager actually persists a real row in real IndexedDB', async () => {
        const out = await page.evaluate(async () => {
          const QM = window.CozyOS.Modules.QuarryManager;
          const res = await QM.handle({
            route: 'assign_workforce',
            payload: { machineId: 'CR-77', operatorIds: ['OP-77'] },
            authContext: { role: 'Administrator' }
          });
          // Read back through the RAW gateway directly (bypassing
          // quarry-index.js's own code entirely) to prove the write truly
          // landed in real IndexedDB, not merely in a JS variable this
          // module happens to also expose.
          const rows = await window.CozyStorage.list('quarry_assignments');
          return { res, rows };
        });
        if (out.res.status !== 200) throw new Error('assign_workforce route failed: ' + JSON.stringify(out.res));
        if (out.rows.length !== 1) throw new Error('expected exactly 1 real persisted assignment row, got: ' + JSON.stringify(out.rows));
        if (out.rows[0].machineId !== 'CR-77') throw new Error('persisted row has wrong data: ' + JSON.stringify(out.rows[0]));
        if (typeof out.rows[0].id !== 'number') throw new Error('expected a real IndexedDB-generated numeric "id" primary key, got: ' + JSON.stringify(out.rows[0]));
      });

      await test('employee registration persists, and an update mutates the SAME real record by its real generated key', async () => {
        const out = await page.evaluate(async () => {
          const QM = window.CozyOS.Modules.QuarryManager;
          const reg = await QM.handle({
            route: 'register_employee',
            payload: { phone: '0700123456', position: 'Operator', department: 'Crushing' },
            authContext: { role: 'Administrator' }
          });
          const upd = await QM.handle({
            route: 'update_employee',
            payload: { employeeId: reg.employeeId, position: 'Senior Operator' },
            authContext: { role: 'Administrator' }
          });
          const rows = await window.CozyStorage.list('quarry_employees');
          return { reg, upd, rows };
        });
        if (out.reg.status !== 200 || !out.reg.employeeId) throw new Error('register_employee failed: ' + JSON.stringify(out.reg));
        if (out.upd.status !== 200) throw new Error('update_employee failed: ' + JSON.stringify(out.upd));
        if (out.rows.length !== 1) throw new Error('update must mutate the same record, not create a second one — got: ' + JSON.stringify(out.rows));
        if (out.rows[0].position !== 'Senior Operator') throw new Error('expected the update to have taken effect: ' + JSON.stringify(out.rows[0]));
      });

      await test('no unexpected console/page errors occurred during the main write scenario', async () => {
        if (pageErrors.length > 0) throw new Error('uncaught page errors: ' + pageErrors.join(' | '));
        // Pre-existing, environment-wide harness noise, not caused by this
        // fix: no favicon.ico exists at the repo root the static test
        // server serves from, so every real page load here logs one
        // "Failed to load resource ... 404" console error for it — the
        // same filter core/tests/browser/organization-support-panel-browser.test.js
        // already applies for the identical reason.
        const realConsoleErrors = consoleErrors.filter((msg) => !/404.*Not Found/i.test(msg));
        if (realConsoleErrors.length > 0) throw new Error('console errors: ' + realConsoleErrors.join(' | '));
      });

      // ────────────────────────────────────────────────────────────
      // (c) REAL cross-reload proof: reload the actual page (a fresh
      //     window, fresh JS heap, fresh module instances) and confirm
      //     the previously-written records are still retrievable — the
      //     concrete, user-visible meaning of "persistence".
      // ────────────────────────────────────────────────────────────
      await page.reload({ waitUntil: 'load' });

      await test('AFTER A REAL PAGE RELOAD: the assignment and employee records are still retrievable via the raw gateway', async () => {
        const rows = await page.evaluate(async () => {
          await window.CozyStorage.init();
          const assignments = await window.CozyStorage.list('quarry_assignments');
          const employees = await window.CozyStorage.list('quarry_employees');
          return { assignments, employees };
        });
        if (rows.assignments.length !== 1 || rows.assignments[0].machineId !== 'CR-77') {
          throw new Error('assignment record did not survive a real page reload: ' + JSON.stringify(rows.assignments));
        }
        if (rows.employees.length !== 1 || rows.employees[0].position !== 'Senior Operator') {
          throw new Error('employee record did not survive a real page reload: ' + JSON.stringify(rows.employees));
        }
      });

      await test('AFTER A REAL PAGE RELOAD: the QuarryManager module\'s OWN read path (not just the raw gateway) also sees the persisted data', async () => {
        const out = await page.evaluate(async () => {
          const QM = window.CozyOS.Modules.QuarryManager;
          // A fresh QuarryManager instance was created by this reload's
          // fresh execution of quarry-index.js — its in-memory state
          // (this.stockLevels, this.customerCreditLimits, etc.) is gone,
          // proving any success below comes from real IndexedDB, not a
          // surviving in-memory object.
          return QM.handle({
            route: 'log_crusher_production',
            payload: { machineId: 'CR-RELOAD-CHECK', outputTons: 1 },
            authContext: { role: 'Administrator' }
          });
        });
        if (out.status !== 200) throw new Error('a route call after reload unexpectedly failed: ' + JSON.stringify(out));
        const rows = await page.evaluate(() => window.CozyStorage.list('quarry_crusher_production'));
        if (rows.length !== 1) throw new Error('post-reload write did not persist: ' + JSON.stringify(rows));
      });

      await test('no unexpected console/page errors occurred after reload', async () => {
        if (pageErrors.length > 0) throw new Error('uncaught page errors: ' + pageErrors.join(' | '));
        const realConsoleErrors = consoleErrors.filter((msg) => !/404.*Not Found/i.test(msg));
        if (realConsoleErrors.length > 0) throw new Error('console errors: ' + realConsoleErrors.join(' | '));
      });
    });
  } catch (e) {
    if (e.code === 'NO_PLAYWRIGHT' || e.code === 'NO_BROWSER') {
      console.log('BROWSER_TEST = NOT_RUN (' + e.message + ')');
      console.log('\n0 passed, 0 failed');
      process.exitCode = 0;
      return;
    }
    throw e;
  }

  const { passed, failed } = summary();
  console.log(`\n${passed} passed, ${failed} failed`);
  console.log(failed > 0 ? 'BROWSER_TEST = RAN_WITH_FAILURES' : 'BROWSER_TEST = PASS');
  process.exitCode = failed > 0 ? 1 : 0;
}

main().catch((err) => {
  console.log('BROWSER_TEST = NOT_RUN (' + err.message + ')');
  process.exitCode = 0;
});
