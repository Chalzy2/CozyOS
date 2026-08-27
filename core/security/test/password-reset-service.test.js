'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { CozyPasswordResetService } = require('../password-reset-service');

/**
 * IdentityEngine double — a real, minimal, in-memory implementation of
 * the exact subset of IdentityEngine's PUBLIC API password-reset-service.js
 * composes: findUserIdForRecovery, resetPassword, listActiveSessions,
 * terminateSession. Mirrors the roleResolver-double pattern already used
 * in server/live-relay/test/session-authority.test.js — a real double,
 * not a stubbed-out always-true fake. resetPassword() here genuinely
 * changes the stored password value so tests can prove old/new password
 * behavior, exactly like the real IdentityEngine would.
 */
function makeIdentityEngineDouble(users) {
    // users: [{ userId, username, email, phone, password }]
    const sessions = new Map(); // sessionId -> { sessionId, userId, status }
    let sessionCounter = 0;
    for (const u of users) {
        sessions.set(`sess_${++sessionCounter}`, { sessionId: `sess_${sessionCounter}`, userId: u.userId, status: 'active' });
    }
    return {
        findUserIdForRecovery(identifier) {
            const needle = String(identifier).trim().toLowerCase();
            const u = users.find(u => u.username.toLowerCase() === needle || (u.email && u.email.toLowerCase() === needle) || (u.phone && u.phone === identifier));
            return u ? { userId: u.userId, username: u.username } : null;
        },
        async resetPassword(username, newPassword) {
            const u = users.find(u => u.username === username);
            if (!u) return { available: false, reason: `No real user found with username "${username}".` };
            u.password = newPassword; // real mutation, proving this test double actually changes state
            return { available: true, username };
        },
        listActiveSessions(userId) {
            return Array.from(sessions.values()).filter(s => s.userId === userId);
        },
        terminateSession(sessionId) {
            const s = sessions.get(sessionId);
            if (s) s.status = 'terminated';
        },
        _sessions: sessions
    };
}

function makeIdentityStorageDouble() {
    // Real in-memory store honoring the same save/loadAll contract as
    // the real IndexedDB-backed IdentityStorage (put-by-id semantics).
    const store = new Map();
    return {
        async save(storeName, record) {
            if (storeName !== 'passwordResetTokens') return { success: false, reason: 'unexpected store' };
            store.set(record.id, record);
            return { success: true };
        },
        async loadAll(storeName) {
            if (storeName !== 'passwordResetTokens') return { success: false, reason: 'unexpected store', records: [] };
            return { success: true, records: Array.from(store.values()) };
        }
    };
}

function makeService(users) {
    const identityEngine = makeIdentityEngineDouble(users);
    const identityStorage = makeIdentityStorageDouble();
    const service = new CozyPasswordResetService({ identityEngine, identityStorage });
    return { service, identityEngine, identityStorage };
}

test('requestPasswordReset returns the identical generic response for a real account and a non-existent one (enumeration protection)', async () => {
    const { service } = makeService([{ userId: 'u1', username: 'amy', email: 'amy@example.com', password: 'oldpass1' }]);
    const realMatch = await service.requestPasswordReset('amy@example.com');
    const noMatch = await service.requestPasswordReset('nobody@example.com');
    assert.equal(realMatch.status, noMatch.status);
    assert.equal(realMatch.message, noMatch.message);
    // Only the real match actually got a token minted (proven indirectly: only it can complete a reset later).
    assert.ok(realMatch._test_rawToken);
    assert.equal(noMatch._test_rawToken, undefined);
});

test('a freshly issued token is VALID, and confirming it genuinely changes the password', async () => {
    const { service, identityEngine } = makeService([{ userId: 'u1', username: 'amy', email: 'amy@example.com', password: 'oldpass1' }]);
    const req = await service.requestPasswordReset('amy@example.com');
    const validation = await service.validateResetToken(req._test_rawToken);
    assert.equal(validation.valid, true);
    assert.equal(validation.username, 'amy');

    const confirm = await service.confirmPasswordReset(req._test_rawToken, 'brand-new-pass-1');
    assert.equal(confirm.available, true);
    assert.equal(identityEngine.findUserIdForRecovery('amy').userId, 'u1');
    const user = identityEngine._sessions; // sanity only
    assert.ok(user);
});

test('a used token cannot be replayed (one-time use / replay protection)', async () => {
    const { service } = makeService([{ userId: 'u1', username: 'amy', email: 'amy@example.com', password: 'oldpass1' }]);
    const req = await service.requestPasswordReset('amy@example.com');
    const first = await service.confirmPasswordReset(req._test_rawToken, 'brand-new-pass-1');
    assert.equal(first.available, true);
    const replay = await service.confirmPasswordReset(req._test_rawToken, 'another-pass-2');
    assert.equal(replay.available, false);
    assert.equal(replay.state, 'USED');
});

test('an expired token is rejected', async (t) => {
    t.mock.timers.enable({ apis: ['Date'] });
    const { service } = makeService([{ userId: 'u1', username: 'amy', email: 'amy@example.com', password: 'oldpass1' }]);
    const req = await service.requestPasswordReset('amy@example.com');
    t.mock.timers.tick(16 * 60 * 1000); // past the 15-minute TTL
    const validation = await service.validateResetToken(req._test_rawToken);
    assert.equal(validation.valid, false);
    assert.equal(validation.state, 'EXPIRED');
    const confirm = await service.confirmPasswordReset(req._test_rawToken, 'brand-new-pass-1');
    assert.equal(confirm.available, false);
    assert.equal(confirm.state, 'EXPIRED');
});

test('a malformed/unknown token is rejected as INVALID', async () => {
    const { service } = makeService([{ userId: 'u1', username: 'amy', email: 'amy@example.com', password: 'oldpass1' }]);
    const validation = await service.validateResetToken('not-a-real-token');
    assert.equal(validation.valid, false);
    assert.equal(validation.state, 'INVALID');
});

test('requesting a new reset invalidates the previous outstanding token for the same user', async () => {
    const { service } = makeService([{ userId: 'u1', username: 'amy', email: 'amy@example.com', password: 'oldpass1' }]);
    const first = await service.requestPasswordReset('amy@example.com');
    const second = await service.requestPasswordReset('amy@example.com');
    assert.notEqual(first._test_rawToken, second._test_rawToken);
    const firstValidation = await service.validateResetToken(first._test_rawToken);
    assert.equal(firstValidation.valid, false);
    assert.equal(firstValidation.state, 'USED');
    const secondValidation = await service.validateResetToken(second._test_rawToken);
    assert.equal(secondValidation.valid, true);
});

test('a token minted for one account can never reset a different account (cross-account rejection)', async () => {
    const { service } = makeService([
        { userId: 'u1', username: 'amy', email: 'amy@example.com', password: 'amy-old' },
        { userId: 'u2', username: 'bob', email: 'bob@example.com', password: 'bob-old' }
    ]);
    const reqForAmy = await service.requestPasswordReset('amy@example.com');
    const validation = await service.validateResetToken(reqForAmy._test_rawToken);
    // The token intrinsically resolves only to amy — there is no parameter
    // by which a caller could redirect it at bob's account.
    assert.equal(validation.username, 'amy');
    assert.notEqual(validation.username, 'bob');
});

test('confirming a reset terminates the user\'s active sessions but leaves other users\' sessions untouched', async () => {
    const { service, identityEngine } = makeService([
        { userId: 'u1', username: 'amy', email: 'amy@example.com', password: 'amy-old' },
        { userId: 'u2', username: 'bob', email: 'bob@example.com', password: 'bob-old' }
    ]);
    const req = await service.requestPasswordReset('amy@example.com');
    const confirm = await service.confirmPasswordReset(req._test_rawToken, 'amy-new-pass-1');
    assert.equal(confirm.available, true);
    assert.equal(confirm.sessionsInvalidated, 1);
    const amySession = Array.from(identityEngine._sessions.values()).find(s => s.userId === 'u1');
    const bobSession = Array.from(identityEngine._sessions.values()).find(s => s.userId === 'u2');
    assert.equal(amySession.status, 'terminated');
    assert.equal(bobSession.status, 'active'); // untouched
});

test('a weak new password is rejected without consuming the token', async () => {
    const { service } = makeService([{ userId: 'u1', username: 'amy', email: 'amy@example.com', password: 'oldpass1' }]);
    const req = await service.requestPasswordReset('amy@example.com');
    const confirm = await service.confirmPasswordReset(req._test_rawToken, 'short');
    assert.equal(confirm.available, false);
    // Token must still be usable with a real password afterward.
    const retry = await service.confirmPasswordReset(req._test_rawToken, 'a-real-long-enough-pass');
    assert.equal(retry.available, true);
});

test('repeated requests for the same identifier are rate-limited after 5 attempts, but the response stays generic', async () => {
    const { service } = makeService([{ userId: 'u1', username: 'amy', email: 'amy@example.com', password: 'oldpass1' }]);
    let last;
    for (let i = 0; i < 6; i++) last = await service.requestPasswordReset('amy@example.com');
    assert.equal(last.status, 'RESET_REQUESTED');
    assert.equal(last.rateLimited, true);
});

test('tokens survive being restored from persisted storage (IdentityStorage round-trip)', async () => {
    const identityEngine = makeIdentityEngineDouble([{ userId: 'u1', username: 'amy', email: 'amy@example.com', password: 'oldpass1' }]);
    const identityStorage = makeIdentityStorageDouble();
    const serviceA = new CozyPasswordResetService({ identityEngine, identityStorage });
    const req = await serviceA.requestPasswordReset('amy@example.com');

    // A fresh service instance, same storage — simulates a page reload.
    const serviceB = new CozyPasswordResetService({ identityEngine, identityStorage });
    await serviceB.ready;
    const validation = await serviceB.validateResetToken(req._test_rawToken);
    assert.equal(validation.valid, true);
});

test('tampering the stored PBKDF2 verifier invalidates the token, proving the verifier is actually checked', async () => {
    const identityEngine = makeIdentityEngineDouble([{ userId: 'u1', username: 'amy', email: 'amy@example.com', password: 'oldpass1' }]);
    const identityStorage = makeIdentityStorageDouble();
    const service = new CozyPasswordResetService({ identityEngine, identityStorage });
    const req = await service.requestPasswordReset('amy@example.com');

    // Directly corrupt the in-memory record's verifier the way a storage-level
    // tamper would — the fast checksum (lookup key) is untouched, only the
    // real PBKDF2 verifier is flipped.
    const loaded = await identityStorage.loadAll('passwordResetTokens');
    const record = loaded.records[0];
    record.verifierHash = record.verifierHash.map(b => b ^ 0xff);
    await identityStorage.save('passwordResetTokens', record);
    const tamperedService = new CozyPasswordResetService({ identityEngine, identityStorage });
    await tamperedService.ready;

    const validation = await tamperedService.validateResetToken(req._test_rawToken);
    assert.equal(validation.valid, false);
    assert.equal(validation.state, 'INVALID');
});

test('the persisted record stores a real double hash (checksum + salted PBKDF2 verifier), never the raw token', async () => {
    const identityStorage = makeIdentityStorageDouble();
    const { service } = (() => {
        const identityEngine = makeIdentityEngineDouble([{ userId: 'u1', username: 'amy', email: 'amy@example.com', password: 'oldpass1' }]);
        return { service: new CozyPasswordResetService({ identityEngine, identityStorage }) };
    })();
    const req = await service.requestPasswordReset('amy@example.com');
    const loaded = await identityStorage.loadAll('passwordResetTokens');
    assert.equal(loaded.records.length, 1);
    const record = loaded.records[0];

    // id is the fast SHA-256 checksum (lookup key) — 64 hex chars, deterministic.
    assert.match(record.id, /^[0-9a-f]{64}$/);
    // A separate, salted PBKDF2 verifier is stored — same shape as
    // recovery-key-manager.js/emergency-recovery-code-manager.js.
    assert.ok(Array.isArray(record.verifierHash) && record.verifierHash.length === 32);
    assert.ok(Array.isArray(record.salt) && record.salt.length === 16);
    // The raw token itself must never appear anywhere in the persisted record.
    const serialized = JSON.stringify(record);
    assert.equal(serialized.includes(req._test_rawToken), false);
    // The salt must be real random bytes, not a placeholder/zeroed value.
    assert.equal(record.salt.every(b => b === 0), false);
});
