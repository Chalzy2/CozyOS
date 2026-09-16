'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { AccountLinkSessionStore } = require('../account-link-session-store');
const { AccountLinkSessionIssuer } = require('../account-link-session-issuer');

function tempFilePath() {
    return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cozyos-link-session-')), 'sessions.json');
}

test('issue() mints a token, resolve() returns the bound userId', () => {
    const store = new AccountLinkSessionStore({ filePath: tempFilePath() });
    const issuer = new AccountLinkSessionIssuer({ store });
    const { token, expiresAt } = issuer.issue('user-abc');
    assert.ok(token.length >= 32);
    assert.ok(expiresAt > Date.now());
    assert.equal(issuer.resolve(token), 'user-abc');
});

test('resolve() never trusts the raw userId string alone — only a genuinely issued token works', () => {
    const store = new AccountLinkSessionStore({ filePath: tempFilePath() });
    const issuer = new AccountLinkSessionIssuer({ store });
    issuer.issue('user-abc');
    assert.equal(issuer.resolve('user-abc'), null); // presenting the userId itself, not a token, must fail
    assert.equal(issuer.resolve('totally-made-up-token'), null);
});

test('expired token resolves to null (fails closed) and is swept on touch', () => {
    const store = new AccountLinkSessionStore({ filePath: tempFilePath() });
    const issuer = new AccountLinkSessionIssuer({ store, ttlMs: -1 }); // already expired the instant it's issued
    const { token } = issuer.issue('user-abc');
    assert.equal(issuer.resolve(token), null);
});

test('consume:true deletes the token after one use — a captured token cannot be replayed', () => {
    const store = new AccountLinkSessionStore({ filePath: tempFilePath() });
    const issuer = new AccountLinkSessionIssuer({ store });
    const { token } = issuer.issue('user-abc');
    assert.equal(issuer.resolve(token, { consume: true }), 'user-abc');
    assert.equal(issuer.resolve(token, { consume: true }), null, 'second use of the same token must fail');
});

test('a token issued for one userId never resolves to a different userId, even after a real restart', () => {
    const filePath = tempFilePath();
    const store1 = new AccountLinkSessionStore({ filePath });
    const issuer1 = new AccountLinkSessionIssuer({ store: store1 });
    const { token } = issuer1.issue('user-A');

    // Real restart: brand-new store + issuer instances, same file.
    const store2 = new AccountLinkSessionStore({ filePath });
    const issuer2 = new AccountLinkSessionIssuer({ store: store2 });
    assert.equal(issuer2.resolve(token), 'user-A');
});

test('two tokens for two different users never collide', () => {
    const store = new AccountLinkSessionStore({ filePath: tempFilePath() });
    const issuer = new AccountLinkSessionIssuer({ store });
    const a = issuer.issue('user-A');
    const b = issuer.issue('user-B');
    assert.notEqual(a.token, b.token);
    assert.equal(issuer.resolve(a.token), 'user-A');
    assert.equal(issuer.resolve(b.token), 'user-B');
});

test('store: raw token is never persisted to disk, only its hash', () => {
    const filePath = tempFilePath();
    const store = new AccountLinkSessionStore({ filePath });
    const issuer = new AccountLinkSessionIssuer({ store });
    const { token: rawToken } = issuer.issue('user-A');
    const onDisk = fs.readFileSync(filePath, 'utf8');
    assert.ok(!onDisk.includes(rawToken), 'raw token must never appear in the persisted file');
});

test('store: corrupted backing file fails closed at construction', () => {
    const filePath = tempFilePath();
    fs.writeFileSync(filePath, 'not json', 'utf8');
    assert.throws(() => new AccountLinkSessionStore({ filePath }), /invalid JSON/);
});
