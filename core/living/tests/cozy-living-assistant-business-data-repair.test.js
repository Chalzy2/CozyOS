'use strict';

/**
 * core/living/tests/cozy-living-assistant-business-data-repair.test.js
 *
 * InterestOS Full Completion — Phase 2 (CozyAI + Live Window Business-
 * Data Q&A). REAL LIVE WINDOW END-TO-END PROOF — every answer below is
 * read back from the real rendered #cozy-living-assistant-messages DOM
 * after real text entry + a real "Enter" keypress, exactly like
 * cozy-living-assistant-live-window-e2e.test.js and cozy-living-
 * assistant-application-semantic-repair.test.js (this file follows
 * those files' own established helper pattern, never a second harness).
 * No internal module is called directly to produce an answer — only to
 * SEED the deterministic test dataset via the real, unmodified
 * InterestOSBusinessWorkspace API before the real questions are typed.
 *
 * DETERMINISTIC DATASET (section 20 of the Phase 2 spec)
 *   Product A: buy=100, sell=150, qty=10 (today);  qty=4 (yesterday)
 *   Product B: buy=200, sell=300, qty=5  (today)
 *   Expense-only row: 300 (today)
 *   Savings-only row: 200 (today)
 *   All rows tagged PAYMENT_STATUS=paid.
 *   Independently pre-computed expected values (matching the unit
 *   test's own identical dataset):
 *     TODAY:     revenue=3000, cost=2000, profit=700, expenses=300,
 *                savings=200, cashBalance=2700, bestProduct=Product A(10)
 *     YESTERDAY: revenue=600,  cost=400,  profit=200, expenses=0,
 *                savings=0,    cashBalance=600,  bestProduct=Product A(4)
 *
 * Grouped into several short test() blocks — see cozy-living-assistant-
 * application-semantic-repair.test.js's own header comment for why: a
 * genuinely unauthenticated Live Window session on dashboard.html
 * eventually redirects to login.html (real, pre-existing, unrelated
 * page behavior), so each real-browser session here stays short.
 *
 * Run with: node --test core/living/tests/cozy-living-assistant-business-data-repair.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
const { resolveLaunchOptions } = require('../../../server/webauthn-rp/test/browser-launch');

const DASHBOARD_HTML = 'file://' + path.resolve(__dirname, '..', '..', '..', 'dashboard.html');
const OWNER = 'biz-test-user';

async function openLiveWindow(actorId) {
    const browser = await chromium.launch(resolveLaunchOptions({ headless: true }));
    const page = await browser.newPage();
    await page.goto(DASHBOARD_HTML, { waitUntil: 'load', timeout: 30000 });
    await page.waitForSelector('#cozy-living-assistant-btn', { timeout: 15000 });
    if (actorId) {
        // Real dashboard.html loads its own real cozy-session-service.js,
        // which sets window.CozyOS.Session for real during page load —
        // an addInitScript stub set BEFORE that runs would simply be
        // overwritten by it. Setting the stub AFTER page load instead
        // (window.CozyOS is a plain, non-frozen object) reliably wins,
        // and cozy-living-assistant.js's own #resolveActorId() reads
        // window.CozyOS.Session.current() fresh on every turn, so this
        // is a valid, real interception point — the same technique this
        // repository's own architecture audit already used and proved.
        await page.evaluate((uid) => {
            window.CozyOS.Session = { current: () => ({ uid }) };
        }, actorId);
    }
    await page.evaluate(() => window.CozyOS.LivingAssistant.open());
    await page.waitForSelector('#cozy-living-assistant-input', { timeout: 15000 });
    return { browser, page };
}

/** Seeds the exact deterministic dataset via the REAL, unmodified InterestOSBusinessWorkspace API. */
async function seedDeterministicData(page, owner) {
    await page.evaluate((ownerId) => {
        const ws = window.CozyOS.InterestOSBusinessWorkspace;
        const table = ws.createTable({ owner: ownerId, name: 'Shop' });
        const dateCol = ws.addColumn(table.id, { label: 'Date', type: 'DATE', role: 'DATE' }, ownerId).columns.find((c) => c.role === 'DATE');
        const productCol = ws.addColumn(table.id, { label: 'Product', type: 'TEXT', role: 'PRODUCT' }, ownerId).columns.find((c) => c.role === 'PRODUCT');
        const buyCol = ws.addColumn(table.id, { label: 'Buy', type: 'NUMBER', role: 'BUYING_PRICE' }, ownerId).columns.find((c) => c.role === 'BUYING_PRICE');
        const sellCol = ws.addColumn(table.id, { label: 'Sell', type: 'NUMBER', role: 'SELLING_PRICE' }, ownerId).columns.find((c) => c.role === 'SELLING_PRICE');
        const qtyCol = ws.addColumn(table.id, { label: 'Qty', type: 'NUMBER', role: 'QUANTITY' }, ownerId).columns.find((c) => c.role === 'QUANTITY');
        const expenseCol = ws.addColumn(table.id, { label: 'Expense', type: 'NUMBER', role: 'EXPENSE_AMOUNT' }, ownerId).columns.find((c) => c.role === 'EXPENSE_AMOUNT');
        const savingsCol = ws.addColumn(table.id, { label: 'Savings', type: 'NUMBER', role: 'SAVINGS_AMOUNT' }, ownerId).columns.find((c) => c.role === 'SAVINGS_AMOUNT');
        const paymentCol = ws.addColumn(table.id, { label: 'Payment', type: 'TEXT', role: 'PAYMENT_STATUS' }, ownerId).columns.find((c) => c.role === 'PAYMENT_STATUS');

        const today = new Date();
        const yesterday = new Date(today.getTime()); yesterday.setDate(yesterday.getDate() - 1);
        const todayISO = today.toISOString();
        const yesterdayISO = yesterday.toISOString();

        ws.addRow(table.id, { [dateCol.id]: todayISO, [productCol.id]: 'Product A', [buyCol.id]: 100, [sellCol.id]: 150, [qtyCol.id]: 10, [paymentCol.id]: 'paid' }, ownerId);
        ws.addRow(table.id, { [dateCol.id]: todayISO, [productCol.id]: 'Product B', [buyCol.id]: 200, [sellCol.id]: 300, [qtyCol.id]: 5, [paymentCol.id]: 'paid' }, ownerId);
        ws.addRow(table.id, { [dateCol.id]: todayISO, [expenseCol.id]: 300 }, ownerId);
        ws.addRow(table.id, { [dateCol.id]: todayISO, [savingsCol.id]: 200 }, ownerId);
        ws.addRow(table.id, { [dateCol.id]: yesterdayISO, [productCol.id]: 'Product A', [buyCol.id]: 100, [sellCol.id]: 150, [qtyCol.id]: 4, [paymentCol.id]: 'paid' }, ownerId);
        return table.id;
    }, owner);
}

async function ask(page, text) {
    const input = page.locator('#cozy-living-assistant-input');
    await input.fill(text);
    await input.press('Enter');
    await page.waitForTimeout(900);
    const messages = await page.$$eval('#cozy-living-assistant-messages > *', (els) => els.map((e) => e.textContent.trim()));
    return messages[messages.length - 1];
}

const EXPECTED = {
    today: { revenue: 3000, cost: 2000, profit: 700, expenses: 300, savings: 200, cashBalance: 2700, bestProduct: 'Product A', bestQty: 10 },
    yesterday: { revenue: 600, cost: 400, profit: 200, expenses: 0, savings: 0, cashBalance: 600, bestProduct: 'Product A', bestQty: 4 },
};

test('BUSINESS DATA Q&A: English revenue/profit/expenses/cash/savings questions return the real, independently-computed numbers', async () => {
    const { browser, page } = await openLiveWindow(OWNER);
    try {
        await seedDeterministicData(page, OWNER);
        const cases = [
            ['How much did I sell today?', EXPECTED.today.revenue],
            ['How much profit did I make today?', EXPECTED.today.profit],
            ['How much did I spend today?', EXPECTED.today.expenses],
            ['How much cash do I have today?', EXPECTED.today.cashBalance],
            ['How much have I saved today?', EXPECTED.today.savings],
        ];
        for (const [q, expected] of cases) {
            const r = await ask(page, q);
            assert.match(r, new RegExp(String(expected)), `"${q}" expected ${expected} in: "${r}"`);
        }
    } finally {
        await browser.close();
    }
});

test('BUSINESS DATA Q&A: stock and product-performance questions return real, disclosed data — never fabricated', async () => {
    const { browser, page } = await openLiveWindow(OWNER);
    try {
        await seedDeterministicData(page, OWNER);
        const rStock = await ask(page, 'How much stock do I have today?');
        assert.match(rStock, new RegExp(String(EXPECTED.today.bestQty)));
        assert.match(rStock, /not track|does not track/i, 'must honestly disclose no on-hand inventory tracking');

        const rBest = await ask(page, 'Which product sold most today?');
        assert.match(rBest, new RegExp(EXPECTED.today.bestProduct));
        assert.match(rBest, new RegExp(String(EXPECTED.today.bestQty)));
    } finally {
        await browser.close();
    }
});

test('BUSINESS DATA Q&A: Kiswahili questions return the SAME real numbers, in real Kiswahili', async () => {
    const { browser, page } = await openLiveWindow(OWNER);
    try {
        await seedDeterministicData(page, OWNER);
        const cases = [
            ['Nilifanya mauzo kiasi gani leo?', EXPECTED.today.revenue, /mauzo/i],
            ['Faida yangu leo ni kiasi gani?', EXPECTED.today.profit, /faida/i],
            ['Nimetumia pesa kiasi gani leo?', EXPECTED.today.expenses, null],
            ['Nina cash kiasi gani leo?', EXPECTED.today.cashBalance, null],
            ['Nimeweka akiba kiasi gani leo?', EXPECTED.today.savings, null],
        ];
        for (const [q, expected, langPattern] of cases) {
            const r = await ask(page, q);
            assert.match(r, new RegExp(String(expected)), `"${q}" expected ${expected} in: "${r}"`);
            if (langPattern) assert.match(r, langPattern, `"${q}" expected genuine Kiswahili content in: "${r}"`);
        }

        const rStock = await ask(page, 'Nina stock kiasi gani leo?');
        assert.match(rStock, new RegExp(String(EXPECTED.today.bestQty)));

        const rBest = await ask(page, 'Ni bidhaa gani imeuza zaidi leo?');
        assert.match(rBest, new RegExp(EXPECTED.today.bestProduct));
    } finally {
        await browser.close();
    }
});

test('BUSINESS DATA Q&A: natural follow-up questions carry real context forward without repeating InterestOS/metric/time-range', async () => {
    const { browser, page } = await openLiveWindow(OWNER);
    try {
        await seedDeterministicData(page, OWNER);
        const r1 = await ask(page, 'How much did I sell today?');
        assert.match(r1, new RegExp(String(EXPECTED.today.revenue)));

        const r2 = await ask(page, 'And yesterday?');
        assert.match(r2, new RegExp(String(EXPECTED.yesterday.revenue)), `follow-up must carry the REVENUE metric forward, got: "${r2}"`);

        const r3 = await ask(page, 'What about profit?');
        assert.match(r3, new RegExp(String(EXPECTED.yesterday.profit)), `follow-up must carry the YESTERDAY time range forward, got: "${r3}"`);
    } finally {
        await browser.close();
    }
});

test('BUSINESS DATA Q&A: ambiguous "How much did I make?" asks a real clarifying question, never guesses a metric', async () => {
    const { browser, page } = await openLiveWindow(OWNER);
    try {
        await seedDeterministicData(page, OWNER);
        const r1 = await ask(page, 'How much did I make?');
        assert.match(r1, /revenue|profit|cash|savings/i);
        assert.match(r1, /\?/);
        assert.doesNotMatch(r1, new RegExp(String(EXPECTED.today.revenue)), 'must never guess a specific number for a genuinely ambiguous question');

        const r2 = await ask(page, 'How much did I make this month?');
        assert.match(r2, /revenue|profit|cash|savings/i);
    } finally {
        await browser.close();
    }
});

test('BUSINESS DATA Q&A: cross-language equivalence — EN and SW phrasings of the same question resolve to the SAME real number', async () => {
    const { browser, page } = await openLiveWindow(OWNER);
    try {
        await seedDeterministicData(page, OWNER);
        const rEn = await ask(page, 'What were my sales today?');
        const rSw = await ask(page, 'Mauzo yangu leo yalikuwa kiasi gani?');
        assert.match(rEn, new RegExp(String(EXPECTED.today.revenue)));
        assert.match(rSw, new RegExp(String(EXPECTED.today.revenue)));
        assert.notStrictEqual(rEn, rSw, 'the two languages must produce genuinely different realized text for the same real number');
    } finally {
        await browser.close();
    }
});

test('BUSINESS DATA Q&A (negative/security): an anonymous visitor never sees business data, and a different signed-in actor never sees another owner\'s data', async () => {
    const { browser: b1, page: p1 } = await openLiveWindow(null);
    try {
        await seedDeterministicData(p1, OWNER); // seeded under OWNER, this session is anonymous
        const r = await ask(p1, 'How much did I sell today?');
        assert.doesNotMatch(r, new RegExp(String(EXPECTED.today.revenue)), 'anonymous visitor must never see the real owner\'s data');
    } finally {
        await b1.close();
    }

    const { browser: b2, page: p2 } = await openLiveWindow('a-different-real-user');
    try {
        await seedDeterministicData(p2, OWNER); // seeded under OWNER again, this session is a different real, signed-in user
        const r = await ask(p2, 'How much did I sell today?');
        assert.doesNotMatch(r, new RegExp(String(EXPECTED.today.revenue)), 'a different real actor must never see the OWNER\'s business data');
        assert.match(r, /haven't recorded|not recorded/i);
    } finally {
        await b2.close();
    }
});

test('BUSINESS DATA Q&A: application-information and general CozyOS questions still work unaffected (no regression)', async () => {
    const { browser, page } = await openLiveWindow(OWNER);
    try {
        const r1 = await ask(page, 'What is InterestOS?');
        assert.match(r1, /InterestOS/i);
        const r2 = await ask(page, 'What is CozyOS?');
        assert.match(r2, /CozyOS/i);
        assert.doesNotMatch(r2, /Some related context exists|I don't have verified information/i);
    } finally {
        await browser.close();
    }
});

console.log('Live Window business-data Q&A real-browser suite: run complete.');
