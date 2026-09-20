'use strict';

/**
 * core/plugins/tests/interestOS-business-workspace.test.js
 * InterestOS Full Completion, Phase 1 — real tests for
 * core/plugins/interestOS-business-workspace.js, composing the real,
 * unmodified CozyMemory engine (not mocked), matching
 * interestOS-phase1.test.js's own convention.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const REPO_ROOT = path.join(__dirname, '..', '..', '..');
const MEMORY_PATH = path.join(REPO_ROOT, 'core/modules/memory/cozy-memory-engine.js');
const WORKSPACE_PATH = path.join(REPO_ROOT, 'core/plugins/interestOS-business-workspace.js');

let ownerCounter = 0;
function freshOwner() { return `user-${++ownerCounter}-${Math.random().toString(36).slice(2, 8)}`; }

function freshWorkspace() {
    delete require.cache[require.resolve(MEMORY_PATH)];
    delete require.cache[require.resolve(WORKSPACE_PATH)];
    global.window = { CozyOS: {} };
    require(MEMORY_PATH);
    require(WORKSPACE_PATH);
    return global.window.CozyOS.InterestOSBusinessWorkspace;
}

function addRoleColumn(ws, tableId, owner, label, type, role) {
    const updated = ws.addColumn(tableId, { label, type, role }, owner);
    return updated.columns[updated.columns.length - 1];
}

// ===================================================================
// TABLE / COLUMN / ROW CRUD — flexible schema, no forced fields
// ===================================================================

test('createTable(): a real table starts with zero columns and zero rows — no forced schema', () => {
    const ws = freshWorkspace();
    const owner = freshOwner();
    const table = ws.createTable({ owner, name: 'My Shop' });
    assert.equal(table.name, 'My Shop');
    assert.deepEqual(table.columns, []);
    assert.deepEqual(table.rows, []);
});

test('addColumn(): a plain untagged column (role: null) is a real, ordinary grid column', () => {
    const ws = freshWorkspace();
    const owner = freshOwner();
    const table = ws.createTable({ owner, name: 'T' });
    const updated = ws.addColumn(table.id, { label: 'Notes', type: 'TEXT' }, owner);
    assert.equal(updated.columns.length, 1);
    assert.equal(updated.columns[0].role, null);
});

test('addColumn(): rejects an unknown role rather than accepting arbitrary free text', () => {
    const ws = freshWorkspace();
    const owner = freshOwner();
    const table = ws.createTable({ owner, name: 'T' });
    assert.throws(() => ws.addColumn(table.id, { label: 'X', role: 'NOT_A_REAL_ROLE' }, owner), TypeError);
});

test('renameColumn() / setColumnRole() / removeColumn(): real mutations, removeColumn also strips that column from every row\'s cells', () => {
    const ws = freshWorkspace();
    const owner = freshOwner();
    const table = ws.createTable({ owner, name: 'T' });
    const col = addRoleColumn(ws, table.id, owner, 'Price', 'NUMBER', null);
    ws.addRow(table.id, { [col.id]: 100 }, owner);

    const renamed = ws.renameColumn(table.id, col.id, 'Selling Price', owner);
    assert.equal(renamed.columns[0].label, 'Selling Price');

    const roled = ws.setColumnRole(table.id, col.id, 'SELLING_PRICE', owner);
    assert.equal(roled.columns[0].role, 'SELLING_PRICE');

    const removed = ws.removeColumn(table.id, col.id, owner);
    assert.equal(removed.columns.length, 0);
    assert.equal(Object.keys(removed.rows[0].cells).length, 0);
});

test('reorderColumns() / reorderRows(): real reordering, and refuse a set that does not exactly match current ids', () => {
    const ws = freshWorkspace();
    const owner = freshOwner();
    const table = ws.createTable({ owner, name: 'T' });
    const c1 = addRoleColumn(ws, table.id, owner, 'A', 'TEXT', null);
    const c2 = addRoleColumn(ws, table.id, owner, 'B', 'TEXT', null);
    const reordered = ws.reorderColumns(table.id, [c2.id, c1.id], owner);
    assert.deepEqual(reordered.columns.map((c) => c.id), [c2.id, c1.id]);
    assert.throws(() => ws.reorderColumns(table.id, [c1.id], owner), Error);

    let t = ws.addRow(table.id, {}, owner);
    t = ws.addRow(table.id, {}, owner);
    const [r1, r2] = t.rows;
    const reorderedRows = ws.reorderRows(table.id, [r2.id, r1.id], owner);
    assert.deepEqual(reorderedRows.rows.map((r) => r.id), [r2.id, r1.id]);
});

test('addRow()/updateRow()/removeRow(): real row CRUD; unknown column ids in cells are silently ignored, never persisted', () => {
    const ws = freshWorkspace();
    const owner = freshOwner();
    const table = ws.createTable({ owner, name: 'T' });
    const col = addRoleColumn(ws, table.id, owner, 'Name', 'TEXT', null);
    const withRow = ws.addRow(table.id, { [col.id]: 'Bread', unknownCol: 'ghost' }, owner);
    const row = withRow.rows[0];
    assert.equal(row.cells[col.id], 'Bread');
    assert.equal(row.cells.unknownCol, undefined);

    const updated = ws.updateRow(table.id, row.id, { [col.id]: 'Milk' }, owner);
    assert.equal(updated.rows[0].cells[col.id], 'Milk');

    const afterRemove = ws.removeRow(table.id, row.id, owner);
    assert.equal(afterRemove.rows.length, 0);
});

test('OWNERSHIP ISOLATION: a stranger actorId cannot read, list, or mutate another owner\'s table', () => {
    const ws = freshWorkspace();
    const owner = freshOwner();
    const stranger = freshOwner();
    const table = ws.createTable({ owner, name: 'Private Shop' });

    assert.equal(ws.getTable(table.id, stranger), null);
    assert.deepEqual(ws.listTables(owner, stranger), []); // stranger cannot list owner's tables under owner's own name either
    assert.throws(() => ws.renameTable(table.id, 'Hacked', stranger), Error);
});

test('listTables(): only returns the real, current owner\'s own tables', () => {
    const ws = freshWorkspace();
    const ownerA = freshOwner();
    const ownerB = freshOwner();
    ws.createTable({ owner: ownerA, name: 'A1' });
    ws.createTable({ owner: ownerA, name: 'A2' });
    ws.createTable({ owner: ownerB, name: 'B1' });
    assert.equal(ws.listTables(ownerA, ownerA).length, 2);
    assert.equal(ws.listTables(ownerB, ownerB).length, 1);
});

// ===================================================================
// AUTOMATIC CALCULATIONS — role-based, honest, never forced
// ===================================================================

function buildSalesTable(ws, owner) {
    const table = ws.createTable({ owner, name: 'Sales' });
    const cols = {
        date: addRoleColumn(ws, table.id, owner, 'Date', 'DATE', 'DATE'),
        product: addRoleColumn(ws, table.id, owner, 'Product', 'TEXT', 'PRODUCT'),
        qty: addRoleColumn(ws, table.id, owner, 'Qty', 'NUMBER', 'QUANTITY'),
        buy: addRoleColumn(ws, table.id, owner, 'Buy', 'NUMBER', 'BUYING_PRICE'),
        sell: addRoleColumn(ws, table.id, owner, 'Sell', 'NUMBER', 'SELLING_PRICE'),
        pay: addRoleColumn(ws, table.id, owner, 'Payment', 'TEXT', 'PAYMENT_STATUS'),
        expense: addRoleColumn(ws, table.id, owner, 'Expense', 'NUMBER', 'EXPENSE_AMOUNT'),
    };
    return { table, cols };
}

test('computeSummary(): revenue/cost/profit are computed only from tagged roles, never invented', () => {
    const ws = freshWorkspace();
    const owner = freshOwner();
    const { table, cols } = buildSalesTable(ws, owner);
    const now = new Date().toISOString();
    ws.addRow(table.id, { [cols.date.id]: now, [cols.product.id]: 'Bread', [cols.qty.id]: 3, [cols.buy.id]: 50, [cols.sell.id]: 80, [cols.pay.id]: 'paid' }, owner);
    ws.addRow(table.id, { [cols.date.id]: now, [cols.product.id]: 'Milk', [cols.qty.id]: 2, [cols.buy.id]: 40, [cols.sell.id]: 60, [cols.pay.id]: 'pending' }, owner);

    const summary = ws.computeSummary(table.id, { period: 'monthly', referenceDate: now }, owner);
    assert.equal(summary.available, true);
    assert.equal(summary.revenue, 360); // 3*80 + 2*60
    assert.equal(summary.cost, 230);    // 3*50 + 2*40
    assert.equal(summary.profit, 130);  // 360 - 230 - 0 expenses
    assert.equal(summary.cashBalance, 240); // only the "paid" row (3*80)
    assert.deepEqual(summary.stockMovement.sort((a, b) => a.product.localeCompare(b.product)), [{ product: 'Bread', quantity: 3 }, { product: 'Milk', quantity: 2 }]);
});

test('computeSummary(): with NO DATE role tagged, every row is honestly excluded — never assumed "current"', () => {
    const ws = freshWorkspace();
    const owner = freshOwner();
    const table = ws.createTable({ owner, name: 'Untagged' });
    const sell = addRoleColumn(ws, table.id, owner, 'Sell', 'NUMBER', 'SELLING_PRICE');
    ws.addRow(table.id, { [sell.id]: 100 }, owner);
    const summary = ws.computeSummary(table.id, { period: 'monthly' }, owner);
    assert.equal(summary.rowsInPeriod, 0);
    assert.equal(summary.revenue, 0);
    assert.equal(summary.rolesUsed.dateCol, false);
});

test('computeSummary(): a row with a QUANTITY-role column but an empty quantity cell contributes nothing — never guessed as 1', () => {
    const ws = freshWorkspace();
    const owner = freshOwner();
    const { table, cols } = buildSalesTable(ws, owner);
    const now = new Date().toISOString();
    ws.addRow(table.id, { [cols.date.id]: now, [cols.sell.id]: 100 /* qty cell omitted */ }, owner);
    const summary = ws.computeSummary(table.id, { period: 'monthly', referenceDate: now }, owner);
    assert.equal(summary.rowsInPeriod, 1);
    assert.equal(summary.revenue, 0, 'an empty, tagged QUANTITY cell must never be silently treated as 1');
});

test('computeSummary(): when the table has NO QUANTITY-role column at all, quantity honestly defaults to 1 for revenue/cost', () => {
    const ws = freshWorkspace();
    const owner = freshOwner();
    const table = ws.createTable({ owner, name: 'NoQty' });
    const date = addRoleColumn(ws, table.id, owner, 'Date', 'DATE', 'DATE');
    const sell = addRoleColumn(ws, table.id, owner, 'Sell', 'NUMBER', 'SELLING_PRICE');
    const now = new Date().toISOString();
    ws.addRow(table.id, { [date.id]: now, [sell.id]: 100 }, owner);
    const summary = ws.computeSummary(table.id, { period: 'monthly', referenceDate: now }, owner);
    assert.equal(summary.revenue, 100);
});

test('computeSummary(): expenses and savings roles are tracked independently of revenue/cost', () => {
    const ws = freshWorkspace();
    const owner = freshOwner();
    const table = ws.createTable({ owner, name: 'Expenses' });
    const date = addRoleColumn(ws, table.id, owner, 'Date', 'DATE', 'DATE');
    const expense = addRoleColumn(ws, table.id, owner, 'Expense', 'NUMBER', 'EXPENSE_AMOUNT');
    const savings = addRoleColumn(ws, table.id, owner, 'Savings', 'NUMBER', 'SAVINGS_AMOUNT');
    const now = new Date().toISOString();
    ws.addRow(table.id, { [date.id]: now, [expense.id]: 500 }, owner);
    ws.addRow(table.id, { [date.id]: now, [savings.id]: 200 }, owner);
    const summary = ws.computeSummary(table.id, { period: 'monthly', referenceDate: now }, owner);
    assert.equal(summary.expenses, 500);
    assert.equal(summary.savings, 200);
    assert.equal(summary.profit, -500); // 0 revenue - 0 cost - 500 expenses
});

test('computeSummary(): PAYMENT_STATUS role — only real "paid-looking" values count toward cash collected', () => {
    const ws = freshWorkspace();
    const owner = freshOwner();
    const { table, cols } = buildSalesTable(ws, owner);
    const now = new Date().toISOString();
    ws.addRow(table.id, { [cols.date.id]: now, [cols.qty.id]: 1, [cols.sell.id]: 100, [cols.pay.id]: 'Paid' }, owner); // case-insensitive
    ws.addRow(table.id, { [cols.date.id]: now, [cols.qty.id]: 1, [cols.sell.id]: 50, [cols.pay.id]: 'owing' }, owner);
    const summary = ws.computeSummary(table.id, { period: 'monthly', referenceDate: now }, owner);
    assert.equal(summary.cashBalance, 100);
});

// ===================================================================
// PERIOD BUCKETING
// ===================================================================

test('periodRange(): daily/weekly/monthly/yearly produce real, correct [start,end) calendar ranges', () => {
    const ws = freshWorkspace();
    const ref = '2026-03-18T12:00:00.000Z'; // a Wednesday
    const daily = ws.periodRange('daily', ref);
    assert.equal(daily.start.slice(0, 10), '2026-03-18');

    const monthly = ws.periodRange('monthly', ref);
    assert.equal(monthly.start, new Date(2026, 2, 1).toISOString());
    assert.equal(monthly.end, new Date(2026, 3, 1).toISOString());

    const yearly = ws.periodRange('yearly', ref);
    assert.equal(yearly.start, new Date(2026, 0, 1).toISOString());
    assert.equal(yearly.end, new Date(2027, 0, 1).toISOString());
});

test('periodRange(): weekly is a real Monday-start ISO week', () => {
    const ws = freshWorkspace();
    // 2026-03-18 is a Wednesday (local time interpretation via new Date(local fields))
    const wednesday = new Date(2026, 2, 18, 9, 0, 0);
    const weekly = ws.periodRange('weekly', wednesday.toISOString());
    const start = new Date(weekly.start);
    assert.equal(start.getDay(), 1, 'week start must be a real Monday');
    const end = new Date(weekly.end);
    assert.equal((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24), 7);
});

test('computeSummary(): a row dated outside the requested period is excluded', () => {
    const ws = freshWorkspace();
    const owner = freshOwner();
    const table = ws.createTable({ owner, name: 'OldSale' });
    const date = addRoleColumn(ws, table.id, owner, 'Date', 'DATE', 'DATE');
    const sell = addRoleColumn(ws, table.id, owner, 'Sell', 'NUMBER', 'SELLING_PRICE');
    ws.addRow(table.id, { [date.id]: '2020-01-01T00:00:00.000Z', [sell.id]: 999 }, owner);
    const summary = ws.computeSummary(table.id, { period: 'monthly', referenceDate: new Date().toISOString() }, owner);
    assert.equal(summary.rowsInPeriod, 0);
    assert.equal(summary.revenue, 0);
});

test('computeSummary(): a real, non-existent table id is reported honestly, never fabricated', () => {
    const ws = freshWorkspace();
    const owner = freshOwner();
    const summary = ws.computeSummary('bizt_does_not_exist', { period: 'monthly' }, owner);
    assert.equal(summary.available, false);
});
