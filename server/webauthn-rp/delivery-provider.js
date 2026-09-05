'use strict';
/**
 * Delivery provider abstraction for password-recovery messages.
 *
 * WHY THIS FILE EXISTS
 * ---------------------
 * Phase B must not fake email/SMS delivery. Instead of writing a reset
 * link straight into an HTTP response or a log line, every delivery goes
 * through an injectable provider interface. Production wiring supplies a
 * real SMTP/API-backed provider; tests supply a Mock provider that records
 * what would have been sent without making a real network call. The route
 * layer (server.js) never knows or cares which one it's talking to.
 *
 * STATUS
 * ------
 * EmailDeliveryProvider / SMSDeliveryProvider: interface only (IMPLEMENTED).
 * MockEmailProvider / MockSMSProvider:          IMPLEMENTED, MOCK TESTED.
 * A real SMTP/SMS provider is NOT included here — see the "real provider"
 * section below for how to plug one in. NOT LIVE-VERIFIED.
 */

// ---------- interfaces ----------
// Not enforced at runtime (this is plain JS), but every provider passed to
// the RP/server must implement this shape: async send({ to, subject, text,
// html }) -> { delivered: boolean, providerMessageId?: string }.
// A provider MUST throw or return { delivered: false } on failure — it
// must never claim delivered: true unless the underlying transport
// actually accepted the message.

class DeliveryError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

// ---------- mock providers (for tests / no-provider-configured builds) ----------

class MockEmailProvider {
  constructor({ failNext = false } = {}) {
    this.sent = [];
    this.failNext = failNext;
    this.healthy = true;
  }

  async send({ to, subject, text, html }) {
    if (this.failNext) {
      this.failNext = false;
      throw new DeliveryError('mock_email_send_failed');
    }
    const record = { to, subject, text, html, sentAt: Date.now() };
    this.sent.push(record);
    return { delivered: true, providerMessageId: `mock-email-${this.sent.length}` };
  }

  status() {
    return { configured: true, healthy: this.healthy, kind: 'mock' };
  }
}

class MockSMSProvider {
  constructor({ failNext = false } = {}) {
    this.sent = [];
    this.failNext = failNext;
    this.healthy = true;
  }

  async send({ to, text }) {
    if (this.failNext) {
      this.failNext = false;
      throw new DeliveryError('mock_sms_send_failed');
    }
    const record = { to, text, sentAt: Date.now() };
    this.sent.push(record);
    return { delivered: true, providerMessageId: `mock-sms-${this.sent.length}` };
  }

  status() {
    return { configured: true, healthy: this.healthy, kind: 'mock' };
  }
}

// ---------- "not configured" providers ----------
// Used when no real provider and no mock has been wired in. Explicitly
// reports unconfigured/unhealthy rather than silently pretending to send —
// this is what makes "no delivery provider configured" an honest, visible
// state instead of a swallowed failure.

class UnconfiguredEmailProvider {
  async send() {
    throw new DeliveryError('email_provider_not_configured');
  }
  status() {
    return { configured: false, healthy: false, kind: 'none' };
  }
}

class UnconfiguredSMSProvider {
  async send() {
    throw new DeliveryError('sms_provider_not_configured');
  }
  status() {
    return { configured: false, healthy: false, kind: 'none' };
  }
}

// ---------- real provider wiring (NOT LIVE-VERIFIED) ----------
// A real provider (e.g. SMTP via nodemailer, or an HTTP API like
// Postmark/SendGrid/Twilio) must be implemented as a class with the same
// send()/status() shape and passed in via the emailProvider/smsProvider
// options on createServer()/createBoundaryServer() — never hardcoded here.
// No provider credentials belong in this file or in any frontend code.
// This module intentionally ships NO real network-calling implementation:
// wiring one in is a deployment-time decision, and doing it here would
// mean either committing a fake "real" provider (dishonest) or committing
// provider secrets (unsafe).

module.exports = {
  DeliveryError,
  MockEmailProvider,
  MockSMSProvider,
  UnconfiguredEmailProvider,
  UnconfiguredSMSProvider,
};
