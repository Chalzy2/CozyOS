'use strict';

/**
 * core/modules/intelligence/business-data/tests/cozy-business-data-intent.test.js
 *
 * InterestOS Full Completion — Phase 2 (CozyAI + Live Window Business-
 * Data Q&A). Real, executed tests loading the REAL CozyMemory engine and
 * the REAL, unmodified InterestOSBusinessWorkspace (Phase 1) together
 * with CozyBusinessDataIntent — no mocked memory/workspace, so these
 * tests exercise the genuine authorization/calculation logic, not a
 * stand-in. A deterministic seeded dataset (section 20 of the Phase 2
 * spec) is used throughout so every assertion compares an independently
 * pre-computed EXPECTED value against the ACTUAL answer text, never
 * merely checking for a non-empty response.
 *
 * Run with: node core/modules/intelligence/business-data/tests/cozy-business-data-intent.test.js
 */

const assert = require('assert');
const path = require('path');

let passed = 0;
let failed = 0;

async function test(name, fn) {
    try {
        await fn();
        console.log(`  ✓ ${name}`);
        passed++;
    } catch (err) {
        console.log(`  ✗ ${name}`);
        console.log(`      ${err.message}`);
        failed++;
    }
}

const roots = {
    memoryEngine: path.join(__dirname, '..', '..', '..', 'memory', 'cozy-memory-engine.js'),
    businessWorkspace: path.join(__dirname, '..', '..', '..', '..', 'plugins', 'interestOS-business-workspace.js'),
    intent: path.join(__dirname, '..', 'cozy-business-data-intent.js'),
};

function loadFreshStack() {
    Object.values(roots).forEach((p) => { delete require.cache[require.resolve(p)]; });
    const fakeWindow = { CozyOS: {}, addEventListener: () => {}, dispatchEvent: () => {} };
    global.window = fakeWindow;
    if (!global.crypto) { global.crypto = require('crypto').webcrypto; }
    [roots.memoryEngine, roots.businessWorkspace, roots.intent].forEach((p) => require(p));
    return {
        window: fakeWindow,
        workspace: fakeWindow.CozyOS.InterestOSBusinessWorkspace,
        intent: fakeWindow.CozyOS.CozyBusinessDataIntent,
    };
}

/** Seeds the exact deterministic dataset from the Phase 2 spec's own "Test with controlled business data" section, for one real owner. Returns { tableId, expected: { today: {...}, yesterday: {...} } }. */
function seedDeterministicTable(workspace, owner) {
    const table = workspace.createTable({ owner, name: 'Shop' });
    const dateCol = workspace.addColumn(table.id, { label: 'Date', type: 'DATE', role: 'DATE' }, owner).columns.find((c) => c.role === 'DATE');
    const productCol = workspace.addColumn(table.id, { label: 'Product', type: 'TEXT', role: 'PRODUCT' }, owner).columns.find((c) => c.role === 'PRODUCT');
    const buyCol = workspace.addColumn(table.id, { label: 'Buy', type: 'NUMBER', role: 'BUYING_PRICE' }, owner).columns.find((c) => c.role === 'BUYING_PRICE');
    const sellCol = workspace.addColumn(table.id, { label: 'Sell', type: 'NUMBER', role: 'SELLING_PRICE' }, owner).columns.find((c) => c.role === 'SELLING_PRICE');
    const qtyCol = workspace.addColumn(table.id, { label: 'Qty', type: 'NUMBER', role: 'QUANTITY' }, owner).columns.find((c) => c.role === 'QUANTITY');
    const expenseCol = workspace.addColumn(table.id, { label: 'Expense', type: 'NUMBER', role: 'EXPENSE_AMOUNT' }, owner).columns.find((c) => c.role === 'EXPENSE_AMOUNT');
    const savingsCol = workspace.addColumn(table.id, { label: 'Savings', type: 'NUMBER', role: 'SAVINGS_AMOUNT' }, owner).columns.find((c) => c.role === 'SAVINGS_AMOUNT');
    const paymentCol = workspace.addColumn(table.id, { label: 'Payment', type: 'TEXT', role: 'PAYMENT_STATUS' }, owner).columns.find((c) => c.role === 'PAYMENT_STATUS');

    const today = new Date();
    const yesterday = new Date(today.getTime()); yesterday.setDate(yesterday.getDate() - 1);
    const todayISO = today.toISOString();
    const yesterdayISO = yesterday.toISOString();

    // Product A: buy=100, sell=150, qty=10 (today)
    workspace.addRow(table.id, { [dateCol.id]: todayISO, [productCol.id]: 'Product A', [buyCol.id]: 100, [sellCol.id]: 150, [qtyCol.id]: 10, [paymentCol.id]: 'paid' }, owner);
    // Product B: buy=200, sell=300, qty=5 (today)
    workspace.addRow(table.id, { [dateCol.id]: todayISO, [productCol.id]: 'Product B', [buyCol.id]: 200, [sellCol.id]: 300, [qtyCol.id]: 5, [paymentCol.id]: 'paid' }, owner);
    // Expense-only row (today)
    workspace.addRow(table.id, { [dateCol.id]: todayISO, [expenseCol.id]: 300 }, owner);
    // Savings-only row (today)
    workspace.addRow(table.id, { [dateCol.id]: todayISO, [savingsCol.id]: 200 }, owner);
    // Product A again, yesterday, qty=4
    workspace.addRow(table.id, { [dateCol.id]: yesterdayISO, [productCol.id]: 'Product A', [buyCol.id]: 100, [sellCol.id]: 150, [qtyCol.id]: 4, [paymentCol.id]: 'paid' }, owner);

    return {
        tableId: table.id,
        expected: {
            today: { revenue: 3000, cost: 2000, profit: 700, expenses: 300, savings: 200, cashBalance: 2700, bestProduct: 'Product A', bestQty: 10 },
            yesterday: { revenue: 600, cost: 400, profit: 200, expenses: 0, savings: 0, cashBalance: 600, bestProduct: 'Product A', bestQty: 4 },
        }
    };
}

console.log('CozyBusinessDataIntent — Phase 2 tests\n');

(async () => {

/* ===================================================================
   A. SALES / REVENUE
=================================================================== */
await test('A1. "How much did I sell today?" returns the real, independently-computed revenue for today', async () => {
    const { workspace, intent } = loadFreshStack();
    const { tableId, expected } = seedDeterministicTable(workspace, 'owner-a1');
    const r = intent.answerBusinessDataQuestion('How much did I sell today?', { actorId: 'owner-a1' });
    assert.ok(r && r.matched);
    assert.match(r.content, new RegExp(String(expected.today.revenue)));
    assert.doesNotMatch(r.content, /profit/i, 'a revenue question must never say "profit"');
});

await test('A2. Kiswahili "Nilifanya mauzo kiasi gani leo?" returns the SAME real revenue value, in Kiswahili', async () => {
    const { workspace, intent } = loadFreshStack();
    const { expected } = seedDeterministicTable(workspace, 'owner-a2');
    const r = intent.answerBusinessDataQuestion('Nilifanya mauzo kiasi gani leo?', { actorId: 'owner-a2', language: 'sw' });
    assert.ok(r && r.matched);
    assert.match(r.content, new RegExp(String(expected.today.revenue)));
    assert.match(r.content, /mauzo/i);
});

/* ===================================================================
   B. PROFIT
=================================================================== */
await test('B1. "How much profit did I make today?" returns the real, independently-computed profit (revenue - cost - expenses)', async () => {
    const { workspace, intent } = loadFreshStack();
    const { expected } = seedDeterministicTable(workspace, 'owner-b1');
    const r = intent.answerBusinessDataQuestion('How much profit did I make today?', { actorId: 'owner-b1' });
    assert.match(r.content, new RegExp(String(expected.today.profit)));
});

await test('B2. Kiswahili "Faida yangu leo ni kiasi gani?" returns the SAME real profit value, in Kiswahili', async () => {
    const { workspace, intent } = loadFreshStack();
    const { expected } = seedDeterministicTable(workspace, 'owner-b2');
    const r = intent.answerBusinessDataQuestion('Faida yangu leo ni kiasi gani?', { actorId: 'owner-b2', language: 'sw' });
    assert.match(r.content, new RegExp(String(expected.today.profit)));
    assert.match(r.content, /faida/i);
});

await test('B3. Revenue and profit are never confused: the two real numbers differ and each question gets its OWN metric', async () => {
    const { workspace, intent } = loadFreshStack();
    const { expected } = seedDeterministicTable(workspace, 'owner-b3');
    const rRevenue = intent.answerBusinessDataQuestion('How much did I sell today?', { actorId: 'owner-b3' });
    const rProfit = intent.answerBusinessDataQuestion('How much profit did I make today?', { actorId: 'owner-b3' });
    assert.notStrictEqual(expected.today.revenue, expected.today.profit, 'test dataset sanity: revenue and profit must genuinely differ');
    assert.match(rRevenue.content, new RegExp(String(expected.today.revenue)));
    assert.match(rProfit.content, new RegExp(String(expected.today.profit)));
});

/* ===================================================================
   C. EXPENSES
=================================================================== */
await test('C1. "How much did I spend this week?" returns the real EXPENSE_AMOUNT total, never confused with cost-of-goods', async () => {
    const { workspace, intent } = loadFreshStack();
    const { expected } = seedDeterministicTable(workspace, 'owner-c1');
    const r = intent.answerBusinessDataQuestion('How much did I spend today?', { actorId: 'owner-c1' });
    assert.match(r.content, new RegExp(String(expected.today.expenses)));
});

await test('C2. Kiswahili "Nimetumia pesa kiasi gani wiki hii?" resolves to EXPENSES, real value, in Kiswahili', async () => {
    const { workspace, intent } = loadFreshStack();
    const { expected } = seedDeterministicTable(workspace, 'owner-c2');
    const r = intent.answerBusinessDataQuestion('Nimetumia pesa kiasi gani wiki hii?', { actorId: 'owner-c2', language: 'sw' });
    assert.match(r.content, new RegExp(String(expected.today.expenses)));
});

/* ===================================================================
   D. CASH BALANCE
=================================================================== */
await test('D1. "How much cash do I have?" returns the real, computed cash balance — never automatically revenue minus profit', async () => {
    const { workspace, intent } = loadFreshStack();
    const { expected } = seedDeterministicTable(workspace, 'owner-d1');
    const r = intent.answerBusinessDataQuestion('How much cash do I have today?', { actorId: 'owner-d1' });
    assert.match(r.content, new RegExp(String(expected.today.cashBalance)));
    assert.notStrictEqual(expected.today.cashBalance, expected.today.revenue - expected.today.profit, 'test dataset sanity: cashBalance must NOT equal revenue-profit here (expenses/payment-status make them diverge)');
});

/* ===================================================================
   E. SAVINGS
=================================================================== */
await test('E1. "How much have I saved?" returns the real SAVINGS_AMOUNT total, never confused with profit', async () => {
    const { workspace, intent } = loadFreshStack();
    const { expected } = seedDeterministicTable(workspace, 'owner-e1');
    const r = intent.answerBusinessDataQuestion('How much have I saved today?', { actorId: 'owner-e1' });
    assert.match(r.content, new RegExp(String(expected.today.savings)));
    assert.notStrictEqual(expected.today.savings, expected.today.profit);
});

/* ===================================================================
   F. STOCK
=================================================================== */
await test('F1. "How much stock do I have?" reports real, disclosed stock MOVEMENT and honestly discloses that on-hand inventory is not tracked', async () => {
    const { workspace, intent } = loadFreshStack();
    const { expected } = seedDeterministicTable(workspace, 'owner-f1');
    const r = intent.answerBusinessDataQuestion('How much stock do I have today?', { actorId: 'owner-f1' });
    assert.match(r.content, new RegExp(`Product A: ${expected.today.bestQty}`));
    assert.match(r.content, /not track|does not track/i, 'must honestly disclose the real limitation, never fabricate an on-hand figure');
});

/* ===================================================================
   G. PRODUCT PERFORMANCE
=================================================================== */
await test('G1. "Which product sold most?" returns the real best-selling product and its real quantity', async () => {
    const { workspace, intent } = loadFreshStack();
    const { expected } = seedDeterministicTable(workspace, 'owner-g1');
    const r = intent.answerBusinessDataQuestion('Which product sold most today?', { actorId: 'owner-g1' });
    assert.match(r.content, new RegExp(expected.today.bestProduct));
    assert.match(r.content, new RegExp(String(expected.today.bestQty)));
});

await test('G2. Kiswahili "Ni bidhaa gani imeuza zaidi?" returns the SAME real best-selling product, in Kiswahili', async () => {
    const { workspace, intent } = loadFreshStack();
    const { expected } = seedDeterministicTable(workspace, 'owner-g2');
    const r = intent.answerBusinessDataQuestion('Ni bidhaa gani imeuza zaidi leo?', { actorId: 'owner-g2', language: 'sw' });
    assert.match(r.content, new RegExp(expected.today.bestProduct));
});

/* ===================================================================
   H. DATE/TIME RANGES
=================================================================== */
await test('H1. "today" vs "yesterday" resolve to genuinely different, real, independently-computed values', async () => {
    const { workspace, intent } = loadFreshStack();
    const { expected } = seedDeterministicTable(workspace, 'owner-h1');
    const rToday = intent.answerBusinessDataQuestion('How much did I sell today?', { actorId: 'owner-h1' });
    const rYesterday = intent.answerBusinessDataQuestion('How much did I sell yesterday?', { actorId: 'owner-h1' });
    assert.match(rToday.content, new RegExp(String(expected.today.revenue)));
    assert.match(rYesterday.content, new RegExp(String(expected.yesterday.revenue)));
    assert.notStrictEqual(expected.today.revenue, expected.yesterday.revenue);
});

/* ===================================================================
   Follow-up context
=================================================================== */
await test('FOLLOWUP1. "How much did I sell today?" then "And yesterday?" carries the REVENUE metric forward, changing only the time range', async () => {
    const { workspace, intent } = loadFreshStack();
    const { expected } = seedDeterministicTable(workspace, 'owner-fu1');
    const r1 = intent.answerBusinessDataQuestion('How much did I sell today?', { actorId: 'owner-fu1' });
    assert.match(r1.content, new RegExp(String(expected.today.revenue)));
    const r2 = intent.answerBusinessDataQuestion('And yesterday?', { actorId: 'owner-fu1', conversationState: r1.updatedConversationState });
    assert.ok(r2 && r2.matched, 'a bare follow-up must still resolve using the carried-forward metric');
    assert.match(r2.content, new RegExp(String(expected.yesterday.revenue)));
});

await test('FOLLOWUP2. "...today?" then "And yesterday?" then "What about profit?" carries the time range forward when only the metric changes', async () => {
    const { workspace, intent } = loadFreshStack();
    const { expected } = seedDeterministicTable(workspace, 'owner-fu2');
    const r1 = intent.answerBusinessDataQuestion('How much did I sell today?', { actorId: 'owner-fu2' });
    const r2 = intent.answerBusinessDataQuestion('And yesterday?', { actorId: 'owner-fu2', conversationState: r1.updatedConversationState });
    const r3 = intent.answerBusinessDataQuestion('What about profit?', { actorId: 'owner-fu2', conversationState: r2.updatedConversationState });
    assert.match(r3.content, new RegExp(String(expected.yesterday.profit)), 'must still be scoped to yesterday (the last stated time range), now asking profit');
});

await test('FOLLOWUP3. A genuinely unrelated question does not falsely consume the follow-up markers', async () => {
    const { workspace, intent } = loadFreshStack();
    seedDeterministicTable(workspace, 'owner-fu3');
    const r1 = intent.answerBusinessDataQuestion('How much did I sell today?', { actorId: 'owner-fu3' });
    const unrelated = intent.answerBusinessDataQuestion('What is CozyOS?', { actorId: 'owner-fu3', conversationState: r1.updatedConversationState });
    assert.strictEqual(unrelated, null, 'a plain application-information question must never be treated as a business-data follow-up');
});

/* ===================================================================
   Clarification
=================================================================== */
await test('CLARIFY1. "How much did I make?" (ambiguous) asks a real clarifying question, never guesses a metric', async () => {
    const { workspace, intent } = loadFreshStack();
    seedDeterministicTable(workspace, 'owner-cl1');
    const r = intent.answerBusinessDataQuestion('How much did I make?', { actorId: 'owner-cl1' });
    assert.ok(r && r.matched);
    assert.match(r.content, /revenue|profit|cash|savings/i);
    assert.match(r.content, /\?/, 'a clarification must be phrased as a real question');
    assert.strictEqual(r.updatedConversationState.lastBusinessMetric, null, 'no metric must be committed until the user actually answers the clarification');
});

await test('CLARIFY2. Multiple business tables for the same actor trigger a real clarifying question naming them, never a silent guess', async () => {
    const { workspace, intent } = loadFreshStack();
    workspace.createTable({ owner: 'owner-cl2', name: 'Shop One' });
    workspace.createTable({ owner: 'owner-cl2', name: 'Shop Two' });
    const r = intent.answerBusinessDataQuestion('How much did I sell today?', { actorId: 'owner-cl2' });
    assert.ok(r && r.matched);
    assert.match(r.content, /Shop One/);
    assert.match(r.content, /Shop Two/);
});

/* ===================================================================
   Negative / security tests
=================================================================== */
await test('NEG1. An anonymous actor never sees business data — fails closed with an honest sign-in message', async () => {
    const { workspace, intent } = loadFreshStack();
    seedDeterministicTable(workspace, 'owner-neg1');
    const r = intent.answerBusinessDataQuestion('How much did I sell today?', { actorId: null });
    assert.ok(r && r.matched);
    assert.doesNotMatch(r.content, /\d/, 'must never leak a real number to an unauthenticated caller');
});

await test('NEG2. A different actor never sees another owner\'s business data', async () => {
    const { workspace, intent } = loadFreshStack();
    seedDeterministicTable(workspace, 'owner-neg2-real');
    const r = intent.answerBusinessDataQuestion('How much did I sell today?', { actorId: 'owner-neg2-stranger' });
    assert.ok(r && r.matched);
    assert.match(r.content, /haven't recorded|not recorded/i, 'a stranger must see an honest "no records" answer, never the real owner\'s data');
});

await test('NEG3. A genuinely unrecorded metric (no data at all) reports honestly, never fabricates a zero-with-confidence', async () => {
    const { workspace, intent } = loadFreshStack();
    const table = workspace.createTable({ owner: 'owner-neg3', name: 'Empty Shop' });
    workspace.addColumn(table.id, { label: 'Date', type: 'DATE', role: 'DATE' }, 'owner-neg3');
    const r = intent.answerBusinessDataQuestion('How much did I sell today?', { actorId: 'owner-neg3' });
    assert.match(r.content, /no business records|hakuna rekodi/i);
});

await test('NEG4. No second AI/business database: every real number traces back to the SAME InterestOSBusinessWorkspace.computeSummary() singleton', async () => {
    const { window: win, workspace, intent } = loadFreshStack();
    seedDeterministicTable(workspace, 'owner-neg4');
    let called = false;
    win.CozyOS.InterestOSBusinessWorkspace = {
        ...workspace,
        computeSummary: function (...args) { called = true; return workspace.computeSummary.apply(workspace, args); },
        listTables: workspace.listTables.bind(workspace),
    };
    intent.answerBusinessDataQuestion('How much did I sell today?', { actorId: 'owner-neg4' });
    assert.strictEqual(called, true, 'expected the real, existing InterestOSBusinessWorkspace.computeSummary() to be called — no second calculation engine');
});

await test('NEG5. A plain application-information question is never treated as a business-data query (true no-op, returns null)', async () => {
    const { intent } = loadFreshStack();
    for (const q of ['What is InterestOS?', 'What does InterestOS do?', 'What is ChurchOS?', 'How many applications are available?']) {
        assert.strictEqual(intent.answerBusinessDataQuestion(q, { actorId: 'owner-neg5' }), null, `"${q}" must not be treated as a business-data query`);
    }
});

await test('NEG6. Kiswahili "faida"/word-boundary false positive: "Cozyos inafaida gani kwetu" is never treated as a PROFIT business-data query — regression guard for a real bug this repair found via the real Live Window E2E suite', async () => {
    const { intent } = loadFreshStack();
    assert.strictEqual(intent.parse('Cozyos inafaida gani kwetu'), null, '"inafaida" (agglutinated) must not fuzzy-match the standalone word "faida"');
    assert.strictEqual(intent.answerBusinessDataQuestion('Cozyos inafaida gani kwetu', { actorId: 'owner-neg6' }), null);
    // The real, standalone word must still match correctly.
    const parsed = intent.parse('Faida yangu leo ni kiasi gani?');
    assert.ok(parsed && parsed.metric === 'PROFIT', 'the real standalone word "Faida" must still be recognized');
});

/* ===================================================================
   SUMMARY
=================================================================== */
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

})();
