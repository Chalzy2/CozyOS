-- CozyOS File Phase 4 - Cozy Share Offline Transport Foundation
--
-- REPOSITORY DISCOVERY THIS ROUND:
--   core/collaboration/cozy-share.js is real but is a Device
--   Collaboration Session Manager for LIVE PRODUCTION roles (camera/
--   audio/lighting/broadcast) - confirmed again this round, unchanged,
--   a different domain from file transfer despite the coincidental
--   name. Not modified, not renamed, not extended with file-transfer
--   responsibilities.
--   core/connectivity/cozy-connect.js (CozyConnect) is real - a
--   browser-side provider-registry for hardware device discovery
--   (Bluetooth/USB via real APIs, honest supported:false elsewhere).
--   No hotspot/WiFi Direct provider exists. Server-side session
--   management here does not require CozyConnect's involvement.
--   core/security/qr-renderer.js is real - an honest interface stub
--   with zero QR encoder anywhere in the repository, deliberately
--   deferred (Milestone 132a) pending a future vendored encoder via
--   registerEncoder(). This phase generates the real QR *payload*
--   (session id + ephemeral token) and calls this existing seam rather
--   than installing a second QR library or fabricating rendering.
--
-- ARCHITECTURE: a transfer session is created by an authenticated
-- SENDER in their own organization. A RECEIVER (a different
-- authenticated user, potentially a different organization) pairs
-- using an ephemeral, cryptographically random token - never a
-- predictable ID. Once paired, the receiver requests the manifest and
-- streams each item through the EXISTING Phase 1/2/3 APIs
-- (documentStorage.save/saveBinary, folders.createFolder) into their
-- OWN organization - the sender's organization_id is retained only in
-- this table for provenance/audit, never as receiver authority.
--
-- ONE-ACTIVE-SESSION ENFORCEMENT: interpreted concretely as one active
-- (non-terminal) session per sender user at a time, preventing
-- accidental concurrent sessions from the same sending context - a
-- real partial unique index, not merely an application-level check.

CREATE TABLE IF NOT EXISTS transfer_sessions (
  id TEXT PRIMARY KEY,
  sender_user_id TEXT NOT NULL REFERENCES users(id),
  sender_organization_id TEXT NOT NULL REFERENCES organizations(id),
  receiver_user_id TEXT REFERENCES users(id),
  receiver_organization_id TEXT REFERENCES organizations(id),
  pairing_token_hash TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pairing' CHECK (state IN ('pairing', 'connected', 'transfer_negotiation', 'transferring', 'verifying', 'completed', 'failed', 'cancelled', 'corrupted', 'expired')),
  manifest_json TEXT,
  failure_reason TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_transfer_sessions_sender ON transfer_sessions(sender_user_id);
CREATE INDEX IF NOT EXISTS idx_transfer_sessions_receiver ON transfer_sessions(receiver_user_id);

-- Real, server-enforced one-active-session-per-sender guarantee - only
-- one non-terminal session may exist per sender at a time.
CREATE UNIQUE INDEX IF NOT EXISTS idx_transfer_sessions_one_active_per_sender ON transfer_sessions(sender_user_id) WHERE state NOT IN ('completed', 'failed', 'cancelled', 'corrupted', 'expired');

-- Real transfer items - the manifest's authoritative, per-item record.
-- Never contains raw file bytes - only metadata plus a reference to
-- the SENDER's existing, already-stored document (reusing Phase 1/2
-- storage, never a second store).
CREATE TABLE IF NOT EXISTS transfer_items (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES transfer_sessions(id),
  source_document_id TEXT NOT NULL REFERENCES documents(id),
  relative_path TEXT NOT NULL,
  filename TEXT NOT NULL,
  size BIGINT,
  mime_type TEXT,
  checksum TEXT,
  received_document_id TEXT REFERENCES documents(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'transferring', 'verified', 'failed')),
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_transfer_items_session ON transfer_items(session_id);
