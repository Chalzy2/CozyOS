'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const sessionToken = require('../session-token');

const SECRET = 'unit-test-secret';

test('sign/verify round-trip preserves payload', () => {
    const token = sessionToken.sign({ sessionId: 's1', role: 'host', sub: 'pastor-1' }, SECRET, 3600);
    const result = sessionToken.verify(token, SECRET);
    assert.equal(result.valid, true);
    assert.equal(result.payload.sessionId, 's1');
    assert.equal(result.payload.role, 'host');
    assert.equal(result.payload.sub, 'pastor-1');
    assert.equal(typeof result.payload.jti, 'string');
});

test('verify rejects a token signed with a different secret', () => {
    const token = sessionToken.sign({ sessionId: 's1', role: 'viewer', sub: 'v1' }, 'secret-A', 3600);
    const result = sessionToken.verify(token, 'secret-B');
    assert.equal(result.valid, false);
    assert.match(result.reason, /Signature mismatch/);
});

test('verify rejects malformed tokens', () => {
    assert.equal(sessionToken.verify('garbage', SECRET).valid, false);
    assert.equal(sessionToken.verify('a.b', SECRET).valid, false);
    assert.equal(sessionToken.verify(null, SECRET).valid, false);
    assert.equal(sessionToken.verify(undefined, SECRET).valid, false);
});

test('sign requires sessionId, role, sub', () => {
    assert.throws(() => sessionToken.sign({ role: 'host', sub: 'x' }, SECRET));
    assert.throws(() => sessionToken.sign({ sessionId: 's1', sub: 'x' }, SECRET));
    assert.throws(() => sessionToken.sign({ sessionId: 's1', role: 'host' }, SECRET));
});

test('two tokens for the same payload have different jti (no replay-token collisions)', () => {
    const t1 = sessionToken.sign({ sessionId: 's1', role: 'host', sub: 'p1' }, SECRET, 3600);
    const t2 = sessionToken.sign({ sessionId: 's1', role: 'host', sub: 'p1' }, SECRET, 3600);
    const p1 = sessionToken.verify(t1, SECRET).payload;
    const p2 = sessionToken.verify(t2, SECRET).payload;
    assert.notEqual(p1.jti, p2.jti);
});
