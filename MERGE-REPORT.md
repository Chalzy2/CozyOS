# Merge Report — Unified Repository

Sources merged (4 uploads, in this order):
1. COS-REPO-PHASE6-FULL.zip — base (fullest baseline: builder capability contract line, Phase 1-6)
2. COS-DASHBOARD-PROMPT10B-MID-2.zip — phone/Google account-linkage feature line (Prompt 9B/10/10B)
3. COS-REPO-PHASE7-CHECKPOINT.zip — capability-knowledge-acquisition.js (Phase 7)
4. COS-REPO-PHASE8-CHECKPOINT.zip — capability-governance-diagnosis.js (Phase 8)

## Base
Started from COS-REPO-PHASE6-FULL.zip (1258 files) since between the two large
zips it was the true superset for the builder/knowledge-registry documentation
(architecture-ambiguity-registry.md AA-007 section, repair-queue.md MD-028/AA-007
rows) — the dashboard zip's copies of those two docs were strict subsets.

## Files added from COS-DASHBOARD-PROMPT10B-MID-2.zip (35 files)
All files that existed only in the dashboard zip were copied in as-is — these
are the real, additive phone-linkage/Google-linkage feature line (Prompt 9B/10/10B):
- core/security/phone-linkage-bootstrap.js, phone-linkage-store-adapter.js,
  google-account-link-client.js + their tests
- core/modules/security/test/authentication-enrollment-panel.test.js
- server/auth/account-link-server.js, account-link-session-issuer.js,
  account-link-session-store.js, google-linkage-store-adapter.js + their tests
- assorted BYTE-DIFF/CHANGED-FILE-HASHES/IMPLEMENTATION-REPORT/TEST-RESULTS
  provenance files from Prompt 9B/10/10B-MID-1/MID-2

## Files where the dashboard zip's version was a strict superset (used instead of Phase6's)
- core/modules/identity/identity-storage.js — DB_VERSION bumped 9→10, adds the
  real "phoneLinkages" IndexedDB store consumed by phone-linkage-store-adapter.js
- core/modules/security/authentication-settings-module.js — Google Login stub's
  whatsNeededNext additively discloses the new real google-account-link-client.js
- core/security/phone-account-linkage.js — adds the window.CozyOS registration
  hook so the plain-<script> UMD branch actually exposes the class
- dashboard.html — adds the five missing <script> tags (phone-provider.js,
  delivery-backend-registry.js, phone-account-linkage.js,
  phone-linkage-store-adapter.js, phone-linkage-bootstrap.js,
  auth-factor-snapshot.js) so AuthCoordinator's window.CozyOS reads resolve

## Files where Phase6's version was already the strict superset (kept, no change)
- docs/builder/knowledge/architecture-ambiguity-registry.md — Phase6 already has
  the AA-007 (Kiswahili) closure section the dashboard zip's copy lacked
- docs/builder/knowledge/repair-queue.md — Phase6 already has the MD-028 and
  AA-007 rows the dashboard zip's copy lacked

## Files added from COS-REPO-PHASE7-CHECKPOINT.zip
- core/modules/builder/capability-knowledge-acquisition.js (+ test, 30/30 passing)
- docs/builder/reports/PHASE7-IMPLEMENTATION-REPORT.md, NEW-FILE-HASHES-PHASE7.txt

## Files added from COS-REPO-PHASE8-CHECKPOINT.zip
- core/modules/builder/capability-governance-diagnosis.js (+ test, 37/37 passing)
- docs/builder/reports/PHASE8-IMPLEMENTATION-REPORT.md, NEW-FILE-HASHES-PHASE8.txt

## Verification performed on the merged tree
- `node --check` on every touched/added .js file — all pass
- Ran in place against the merged tree:
  - capability-knowledge-acquisition.test.js — 30/30 passed
  - capability-governance-diagnosis.test.js — 37/37 passed
  - auth-coordinator.test.js — 0 failed
  - authentication-enrollment-panel.test.js — 0 failed
  - login-decision-engine.test.js — 0 failed
  - phone-linkage-bootstrap.test.js — 0 failed
  - google-account-link-client.test.js — 0 failed
  - google-account-linkage.test.js — 0 failed
  - auth-factor-snapshot.test.js — 0 failed
  - delivery-backend-registry.test.js — 0 failed
  - phone-provider.test.js — 0 failed
  - phone-account-linkage.test.js — 0 failed
  - phone-linkage-store-adapter.test.js — 0 failed
  - password-reset-service.test.js — 0 failed
  - identity-engine.test.js — 0 failed

No builder capability-*.js module (Phase 2–8) is wired into a shared index/registry —
each is a standalone file consumed only by its own test, so Phase 7/8 files needed
no additional integration wiring beyond being added.

## Final file count
1302
