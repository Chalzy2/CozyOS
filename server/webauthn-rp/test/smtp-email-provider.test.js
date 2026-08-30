'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const { SmtpEmailProvider } = require('../providers/smtp-email-provider');
const { DeliveryError } = require('../delivery-provider');

const SECRET_PASS = 'super-secret-smtp-password-should-never-leak';

// ---------- fake plaintext SMTP server ----------
// A real, in-process TCP server speaking enough of RFC 5321 + AUTH LOGIN to
// exercise SmtpEmailProvider's actual protocol logic end-to-end (not a
// mock of SmtpEmailProvider itself). `behavior` controls which stage
// responds with a failure code, so each failure path below is a genuine
// rejected-by-the-server case, not a simulated exception.
function startFakeSmtpServer({ behavior = 'success' } = {}) {
  return new Promise((resolve) => {
    const server = net.createServer((socket) => {
      let buf = '';
      let stage = 'start';
      let collectingData = false;
      let dataBuffer = '';
      socket.write('220 fake.smtp ready\r\n');

      socket.on('data', (chunk) => {
        buf += chunk.toString('utf8');
        let idx;
        while ((idx = buf.indexOf('\r\n')) !== -1) {
          const line = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          handleLine(line);
        }
      });

      function handleLine(line) {
        if (collectingData) {
          dataBuffer += line + '\r\n';
          if (dataBuffer.endsWith('\r\n.\r\n') || line === '.') {
            collectingData = false;
            socket.write(behavior === 'reject-data' ? '554 Message rejected\r\n' : '250 OK: queued\r\n');
          }
          return;
        }
        if (stage === 'awaiting-user') {
          stage = 'awaiting-pass';
          socket.write('334 UGFzc3dvcmQ6\r\n');
          return;
        }
        if (stage === 'awaiting-pass') {
          stage = 'authed';
          socket.write(behavior === 'bad-auth' ? '535 authentication failed\r\n' : '235 Authentication successful\r\n');
          return;
        }
        const upper = line.toUpperCase();
        if (upper.startsWith('EHLO')) {
          socket.write('250-fake.smtp\r\n250 AUTH LOGIN\r\n');
        } else if (upper === 'AUTH LOGIN') {
          if (behavior === 'reject-auth-start') { socket.write('502 not supported\r\n'); return; }
          stage = 'awaiting-user';
          socket.write('334 VXNlcm5hbWU6\r\n');
        } else if (upper.startsWith('MAIL FROM')) {
          socket.write('250 OK\r\n');
        } else if (upper.startsWith('RCPT TO')) {
          socket.write(behavior === 'reject-recipient' ? '550 no such user\r\n' : '250 OK\r\n');
        } else if (upper === 'DATA') {
          socket.write('354 Start mail input\r\n');
          collectingData = true;
          dataBuffer = '';
        } else if (upper === 'QUIT') {
          socket.write('221 Bye\r\n');
          socket.end();
        } else {
          socket.write('500 unrecognized command\r\n');
        }
      }
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function makeProvider(server, overrides = {}) {
  return new SmtpEmailProvider({
    host: '127.0.0.1',
    port: server.address().port,
    secure: false,
    requireTLS: false, // fake server is plaintext-only; real STARTTLS path hands off to node:tls, not re-tested here
    user: 'reset-bot@cozyos.org',
    pass: SECRET_PASS,
    from: 'CozyOS <no-reply@cozyos.org>',
    timeoutMs: 2000,
    ...overrides,
  });
}

test('SmtpEmailProvider: successful send against a real SMTP exchange', async () => {
  const server = await startFakeSmtpServer({ behavior: 'success' });
  try {
    const provider = makeProvider(server);
    const result = await provider.send({ to: 'user@example.com', subject: 'Reset your CozyOS password', text: 'link here' });
    assert.equal(result.delivered, true);
    assert.match(result.providerMessageId, /^</);
  } finally {
    server.close();
  }
});

test('SmtpEmailProvider: server rejects auth -> DeliveryError, no secret in error', async () => {
  const server = await startFakeSmtpServer({ behavior: 'bad-auth' });
  try {
    const provider = makeProvider(server);
    await assert.rejects(
      () => provider.send({ to: 'user@example.com', subject: 'x', text: 'y' }),
      (err) => {
        assert.ok(err instanceof DeliveryError);
        assert.equal(err.code, 'smtp_auth_failed');
        assert.ok(!String(err.message).includes(SECRET_PASS));
        assert.ok(!String(err.stack || '').includes(SECRET_PASS));
        return true;
      }
    );
  } finally {
    server.close();
  }
});

test('SmtpEmailProvider: server rejects recipient -> DeliveryError smtp_recipient_rejected', async () => {
  const server = await startFakeSmtpServer({ behavior: 'reject-recipient' });
  try {
    const provider = makeProvider(server);
    await assert.rejects(
      () => provider.send({ to: 'nobody@example.com', subject: 'x', text: 'y' }),
      (err) => { assert.equal(err.code, 'smtp_recipient_rejected'); return true; }
    );
  } finally {
    server.close();
  }
});

test('SmtpEmailProvider: server rejects message body -> DeliveryError smtp_message_rejected', async () => {
  const server = await startFakeSmtpServer({ behavior: 'reject-data' });
  try {
    const provider = makeProvider(server);
    await assert.rejects(
      () => provider.send({ to: 'user@example.com', subject: 'x', text: 'y' }),
      (err) => { assert.equal(err.code, 'smtp_message_rejected'); return true; }
    );
  } finally {
    server.close();
  }
});

test('SmtpEmailProvider: connect failure (nothing listening) -> DeliveryError smtp_connect_failed', async () => {
  const provider = new SmtpEmailProvider({
    host: '127.0.0.1',
    port: 1, // reserved/unlikely-to-be-listening port
    secure: false,
    requireTLS: false,
    user: 'x', pass: SECRET_PASS, from: 'CozyOS <no-reply@cozyos.org>',
    timeoutMs: 500,
  });
  await assert.rejects(
    () => provider.send({ to: 'user@example.com', subject: 'x', text: 'y' }),
    (err) => { assert.equal(err.code, 'smtp_connect_failed'); return true; }
  );
});

test('SmtpEmailProvider: status()/toJSON() never expose the password', async () => {
  const server = await startFakeSmtpServer();
  try {
    const provider = makeProvider(server);
    const status = provider.status();
    assert.deepEqual(Object.keys(status).sort(), ['configured', 'healthy', 'host', 'kind', 'port', 'secure'].sort());
    assert.ok(!JSON.stringify(status).includes(SECRET_PASS));
    assert.ok(!JSON.stringify(provider).includes(SECRET_PASS));
    assert.ok(!JSON.stringify(provider.toJSON()).includes(SECRET_PASS));
  } finally {
    server.close();
  }
});

test('SmtpEmailProvider: constructor requires host/user/pass/from', () => {
  assert.throws(() => new SmtpEmailProvider({ host: 'h', user: 'u', from: 'f' })); // missing pass
  assert.throws(() => new SmtpEmailProvider({ user: 'u', pass: 'p', from: 'f' })); // missing host
  assert.throws(() => new SmtpEmailProvider({ host: 'h', pass: 'p', from: 'f' })); // missing user
  assert.throws(() => new SmtpEmailProvider({ host: 'h', user: 'u', pass: 'p' })); // missing from
});
