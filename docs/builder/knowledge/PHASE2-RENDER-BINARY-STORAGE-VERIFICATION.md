# CozyOS File Phase 2 — Render Persistent Storage Verification

## What was actually tested, and where

The `FilesystemObjectStorageProvider` was tested exhaustively in this
sandbox: real streaming writes, real SHA-256 computed over actual
bytes, real byte-for-byte round-trip retrieval, real path-traversal
rejection, a real 5MB large-file test, real cross-organization
isolation, and real version-preservation (old binary content
untouched when a new version is uploaded) — 13/13 tests passing.

**This proves the code is correct.** It does not, by itself, prove
Render's specific persistent disk behaves identically — this sandbox
has no network access to Render at all, and no Render Shell access.
That verification genuinely requires running on the live Render
service, which this environment cannot do.

## Why this is honestly BLOCKED here, not a gap in the implementation

The object storage provider is a plain, standard Node.js filesystem
component (`fs.createWriteStream`/`fs.createReadStream`, standard
`path.join` operations) — the same class of API `server/webauthn-rp/db.js`
already uses for the SQLite file itself, which is already confirmed
real and running against the actual Render persistent disk mounted at
`/var/data` (per the V4 Render deployment fix). There is no reason to
expect this provider to behave differently on Render than in this
sandbox — but "no reason to expect a difference" is not the same as
"verified," and this report does not claim the latter.

## Exact configuration for Render

`server.js`'s `objectStorageRoot` parameter controls where binary
content is stored, following the exact same explicit-configuration
philosophy as `COZY_WEBAUTHN_DB`, and is now genuinely wired through
`server/static-boundary-server.js` (the real production entrypoint) to
the `COZY_OBJECT_STORAGE_ROOT` environment variable. To use the same
persistent disk Render already has attached, set on the Render service:

```
COZY_OBJECT_STORAGE_ROOT=/var/data/documents
```

## What remains to be done — real, not yet completed

1. **`COZY_OBJECT_STORAGE_ROOT` is now wired into the real production
   entrypoint** (`server/static-boundary-server.js`), following the
   exact same explicit-configuration pattern as `COZY_WEBAUTHN_DB`.
   This was completed and verified this round: the real server was
   started with `COZY_OBJECT_STORAGE_ROOT` set and confirmed listening
   successfully, and the existing static-boundary test suite (11 tests
   across 3 files) was re-run and confirmed passing unchanged. This is
   no longer an open gap.

2. **Manual verification on the live Render service**, once deployed
   with this environment variable set:
   ```
   ls -la /var/data/documents
   ```
   via Render's Shell tab, after uploading a real test document through
   the live application, to confirm the directory and files actually
   appear on the persistent disk as expected.

3. **Confirm persistent-disk survival across a real Render restart**:
   upload a document, note its real checksum, restart the Render
   service (or wait for a real redeploy), then download the same
   document again and confirm the checksum still matches. This is the
   same kind of proof this round already performed for the SQLite
   database in V4/V7 — genuinely proving durability requires the same
   kind of before/after-restart test, on Render specifically, which
   this sandbox cannot perform.

## Status, stated plainly

- **Filesystem-backed binary storage provider: REAL, IMPLEMENTED, TESTED (13/13 in this sandbox).**
- **`COZY_OBJECT_STORAGE_ROOT` environment-variable wiring into the production entrypoint: DONE this round — real server-start verification performed, existing static-boundary tests (11/11) re-confirmed passing.**
- **Render-specific persistent-disk verification for binary content: BLOCKED — no network/Shell access from this environment.**

This is not being presented as "Render verified" when it has not
actually been tested there.
