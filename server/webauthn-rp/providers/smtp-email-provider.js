'use strict';
/**
 * SmtpEmailProvider — real SMTP-submission email delivery provider.
 *
 * WHY THIS FILE EXISTS
 * ---------------------
 * delivery-provider.js defines the EmailDeliveryProvider interface
 * (send()/status()) plus Mock/Unconfigured implementations, but ships no
 * real network-calling implementation on purpose (see that file's header).
 * This is that real implementation: a minimal SMTP-submission client
 * built entirely on Node's built-in `net`/`tls` modules — no npm
 * dependency added, consistent with this repo's existing zero-runtime-
 * dependency stance (see root package.json).
 *
 * SMTP submission (RFC 5321/3207/4954 AUTH LOGIN) is supported by every
 * mainstream transactional-email provider (SendGrid, Postmark, Mailgun,
 * AWS SES SMTP endpoint, etc.) as well as generic mailbox providers, so
 * one implementation covers "whichever provider Render's env vars point
 * at" without a provider-specific SDK.
 *
 * HONEST SCOPE
 *   PROTOCOL: implements EHLO, optional STARTTLS upgrade, AUTH LOGIN,
 *     MAIL FROM / RCPT TO / DATA, QUIT. Multi-line SMTP responses
 *     (250-... continuation lines) are parsed correctly.
 *   NOT IMPLEMENTED: AUTH PLAIN/CRAM-MD5 (AUTH LOGIN is sufficient for
 *     every provider named above), connection pooling/keep-alive (one
 *     connection per send() call — correct for password-reset email
 *     volumes, not optimized for bulk sending).
 *   TESTED: full command/response exchange (EHLO, AUTH LOGIN, MAIL/RCPT/
 *     DATA, error paths) against a real local plaintext SMTP listener
 *     started in-process by the test (see smtp-email-provider.test.js).
 *     The STARTTLS upgrade itself hands off to Node's own `tls` module
 *     and is not separately re-tested here — this file's own logic is
 *     "does it send STARTTLS and re-negotiate on the same socket", not
 *     "is Node's TLS implementation correct".
 *   NOT VERIFIED: delivery through a real internet-facing provider
 *     (SendGrid/Postmark/etc). That is exactly the Kafexo Lab
 *     verification step this provider exists to support — see the
 *     Render environment variables documented at the bottom of this
 *     file.
 *   SECRET HANDLING: `pass` is held only in a private class field, is
 *     never included in status()/toString()/JSON.stringify() output, and
 *     is never interpolated into a thrown error message. Only generic,
 *     fixed error codes cross the DeliveryError boundary.
 */

const net = require('node:net');
const tls = require('node:tls');
const { DeliveryError } = require('../delivery-provider');

const DEFAULT_TIMEOUT_MS = 10000;

function b64(str) {
  return Buffer.from(str, 'utf8').toString('base64');
}

// ---------- minimal line-buffered SMTP response reader ----------
// SMTP responses are one or more lines "CODE-text\r\n" (continuation) or
// "CODE text\r\n" (final line of that response). We buffer bytes until we
// see a final line, then resolve with { code, text }.
class SmtpResponseReader {
  constructor(socket) {
    this._buf = '';
    this._queue = []; // pending { resolve, reject }
    this._socket = socket;
    this._onData = (chunk) => this._feed(chunk.toString('utf8'));
    socket.on('data', this._onData);
  }

  _feed(str) {
    this._buf += str;
    for (;;) {
      const idx = this._buf.indexOf('\r\n');
      if (idx === -1) return;
      const line = this._buf.slice(0, idx);
      this._buf = this._buf.slice(idx + 2);
      const match = /^(\d{3})([ -])(.*)$/.exec(line);
      if (!match) continue; // ignore malformed/blank line, keep buffering
      const [, codeStr, sep] = match;
      this._pendingLines = this._pendingLines || [];
      this._pendingLines.push(line);
      if (sep === ' ') {
        const code = Number(codeStr);
        const text = this._pendingLines.join('\n');
        this._pendingLines = [];
        const waiter = this._queue.shift();
        if (waiter) waiter.resolve({ code, text });
      }
      // sep === '-' means "more lines follow for this same response", keep reading
    }
  }

  // Re-attach to a new socket after a STARTTLS upgrade (the reader must
  // keep working on the encrypted socket, not the raw one).
  rebind(newSocket) {
    this._socket.removeListener('data', this._onData);
    this._socket = newSocket;
    this._onData = (chunk) => this._feed(chunk.toString('utf8'));
    newSocket.on('data', this._onData);
  }

  next(timeoutMs) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this._queue.indexOf(entry);
        if (idx !== -1) this._queue.splice(idx, 1);
        reject(new DeliveryError('smtp_response_timeout'));
      }, timeoutMs);
      const entry = {
        resolve: (v) => { clearTimeout(timer); resolve(v); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      };
      this._queue.push(entry);
    });
  }
}

class SmtpEmailProvider {
  #host; #port; #secure; #requireTLS; #user; #pass; #from; #timeoutMs; #connectFn; #tlsConnectFn;

  /**
   * @param {object} opts
   * @param {string} opts.host        SMTP server hostname
   * @param {number} [opts.port=587]  SMTP port (465 for implicit TLS, 587 for STARTTLS, 25 legacy)
   * @param {boolean} [opts.secure=false]      true = connect with TLS immediately (port 465 style)
   * @param {boolean} [opts.requireTLS=true]   when !secure, issue STARTTLS before AUTH (ignored if secure=true)
   * @param {string} opts.user        SMTP auth username
   * @param {string} opts.pass        SMTP auth password/API key — never exposed by any method below
   * @param {string} opts.from        envelope + header From address, e.g. "CozyOS <no-reply@cozyos.org>"
   * @param {number} [opts.timeoutMs=10000]
   * @param {function} [opts.connectFn]    test seam — defaults to net.connect
   * @param {function} [opts.tlsConnectFn] test seam — defaults to tls.connect
   */
  constructor({ host, port = 587, secure = false, requireTLS = true, user, pass, from, timeoutMs = DEFAULT_TIMEOUT_MS, connectFn, tlsConnectFn } = {}) {
    if (!host || !user || !pass || !from) {
      // Constructed directly (bypassing select-email-provider.js's own
      // validation) with incomplete config — fail immediately rather than
      // constructing a provider that would silently misbehave later.
      throw new Error('[SmtpEmailProvider] host, user, pass, and from are all required.');
    }
    this.#host = host;
    this.#port = port;
    this.#secure = !!secure;
    this.#requireTLS = requireTLS !== false;
    this.#user = user;
    this.#pass = pass;
    this.#from = from;
    this.#timeoutMs = timeoutMs;
    this.#connectFn = connectFn || net.connect;
    this.#tlsConnectFn = tlsConnectFn || tls.connect;
  }

  // Never includes #pass. Safe to log / return over an HTTP status endpoint.
  status() {
    return { configured: true, healthy: true, kind: 'smtp', host: this.#host, port: this.#port, secure: this.#secure };
  }

  // Deliberately does not implement toJSON with secrets, and defining a
  // plain object here (rather than exposing class fields) means
  // JSON.stringify(provider) / console.log(provider) never walks into
  // #pass — private class fields are already non-enumerable to those,
  // but this is an explicit, honest second guarantee, not reliance on
  // that alone.
  toJSON() { return this.status(); }

  async _cmd(socket, reader, line) {
    socket.write(line + '\r\n');
    return reader.next(this.#timeoutMs);
  }

  async send({ to, subject, text, html }) {
    if (!to) throw new DeliveryError('smtp_missing_recipient');
    let socket;
    try {
      socket = await this._connect();
    } catch (_err) {
      throw new DeliveryError('smtp_connect_failed');
    }

    const reader = new SmtpResponseReader(socket);
    try {
      const greeting = await reader.next(this.#timeoutMs);
      if (greeting.code !== 220) throw new DeliveryError('smtp_greeting_rejected');

      let ehlo = await this._cmd(socket, reader, `EHLO ${this._heloName()}`);
      if (ehlo.code !== 250) throw new DeliveryError('smtp_ehlo_rejected');

      if (!this.#secure && this.#requireTLS) {
        const starttls = await this._cmd(socket, reader, 'STARTTLS');
        if (starttls.code !== 220) throw new DeliveryError('smtp_starttls_rejected');
        socket = await this._upgradeTls(socket);
        reader.rebind(socket);
        ehlo = await this._cmd(socket, reader, `EHLO ${this._heloName()}`);
        if (ehlo.code !== 250) throw new DeliveryError('smtp_ehlo_after_starttls_rejected');
      }

      // AUTH LOGIN — see file header re: not implementing AUTH PLAIN.
      const authStart = await this._cmd(socket, reader, 'AUTH LOGIN');
      if (authStart.code !== 334) throw new DeliveryError('smtp_auth_not_supported');
      const userResp = await this._cmd(socket, reader, b64(this.#user));
      if (userResp.code !== 334) throw new DeliveryError('smtp_auth_failed');
      const passResp = await this._cmd(socket, reader, b64(this.#pass));
      if (passResp.code !== 235) throw new DeliveryError('smtp_auth_failed');

      const fromAddr = extractAddr(this.#from);
      const toAddr = extractAddr(to);

      const mailFrom = await this._cmd(socket, reader, `MAIL FROM:<${fromAddr}>`);
      if (mailFrom.code !== 250) throw new DeliveryError('smtp_mail_from_rejected');
      const rcptTo = await this._cmd(socket, reader, `RCPT TO:<${toAddr}>`);
      if (rcptTo.code !== 250 && rcptTo.code !== 251) throw new DeliveryError('smtp_recipient_rejected');

      const dataStart = await this._cmd(socket, reader, 'DATA');
      if (dataStart.code !== 354) throw new DeliveryError('smtp_data_rejected');

      const messageId = `<${Date.now()}.${Math.random().toString(36).slice(2)}@${this._heloName()}>`;
      const message = buildMimeMessage({ from: this.#from, to, subject, text, html, messageId });
      socket.write(message.replace(/\r\n\.\r\n/g, '\r\n..\r\n') + '\r\n.\r\n'); // dot-stuffing safety
      const dataResp = await reader.next(this.#timeoutMs);
      if (dataResp.code !== 250) throw new DeliveryError('smtp_message_rejected');

      await this._cmd(socket, reader, 'QUIT').catch(() => {}); // best-effort, delivery already succeeded
      return { delivered: true, providerMessageId: messageId };
    } finally {
      try { socket.destroy(); } catch (_e) { /* already closed */ }
    }
  }

  _heloName() {
    // A syntactically valid HELO/EHLO domain is required by many servers;
    // this does not need to resolve to anything, only be well-formed.
    try { return new URL(this.#from.includes('<') ? this.#from.match(/<(.+)>/)[1] : this.#from).hostname; }
    catch (_e) { return 'cozyos.local'; }
  }

  _connect() {
    return new Promise((resolve, reject) => {
      const connector = this.#secure ? this.#tlsConnectFn : this.#connectFn;
      const socket = connector({ host: this.#host, port: this.#port });
      const onError = (err) => { socket.removeListener('connect', onConnect); socket.removeListener('secureConnect', onConnect); reject(err); };
      const onConnect = () => { socket.removeListener('error', onError); resolve(socket); };
      socket.once('error', onError);
      socket.once(this.#secure ? 'secureConnect' : 'connect', onConnect);
      socket.setTimeout(this.#timeoutMs, () => { socket.destroy(); reject(new Error('smtp_connect_timeout')); });
    });
  }

  _upgradeTls(rawSocket) {
    return new Promise((resolve, reject) => {
      const secureSocket = this.#tlsConnectFn({ socket: rawSocket, host: this.#host, servername: this.#host });
      secureSocket.once('secureConnect', () => resolve(secureSocket));
      secureSocket.once('error', reject);
    });
  }
}

function extractAddr(input) {
  if (!input) return input;
  const m = /<([^>]+)>/.exec(input);
  return m ? m[1] : input.trim();
}

function buildMimeMessage({ from, to, subject, text, html, messageId }) {
  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject || ''}`,
    `Message-ID: ${messageId}`,
    `Date: ${new Date().toUTCString()}`,
    'MIME-Version: 1.0',
  ];
  if (html) {
    const boundary = `cozyos-${Date.now().toString(36)}`;
    headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    return [
      ...headers, '',
      `--${boundary}`, 'Content-Type: text/plain; charset=utf-8', '', text || '', '',
      `--${boundary}`, 'Content-Type: text/html; charset=utf-8', '', html, '',
      `--${boundary}--`, '',
    ].join('\r\n');
  }
  headers.push('Content-Type: text/plain; charset=utf-8');
  return [...headers, '', text || ''].join('\r\n');
}

module.exports = { SmtpEmailProvider };

/**
 * REQUIRED RENDER ENVIRONMENT VARIABLES (see providers/select-email-provider.js)
 *   COZY_EMAIL_PROVIDER=smtp
 *   COZY_SMTP_HOST
 *   COZY_SMTP_PORT           (optional, default 587)
 *   COZY_SMTP_SECURE         (optional, "1" = implicit TLS on connect, default unset/"0" = STARTTLS)
 *   COZY_SMTP_REQUIRE_TLS    (optional, default "1"; set "0" only for a trusted local/lab relay with no TLS)
 *   COZY_SMTP_USER
 *   COZY_SMTP_PASS           (SET IN RENDER'S ENVIRONMENT UI ONLY — never commit)
 *   COZY_SMTP_FROM           e.g. "CozyOS <no-reply@cozyos.org>" (or kafexo.com address in Lab)
 */
