# CozyOS Dashboard — Prompt 3, Middle Checkpoint 3 (PROMPT3-MID-3)

Baseline: COS-DASHBOARD-PROMPT3-MID-2.zip
PROMPT 3 STATUS: IN PROGRESS

## STEP 2 — Organization identity/branding metadata seam

### Inspection findings (source-verified, not assumed)

Per MID-2's own "NEXT BUILD MUST START WITH," registry reconciliation is
recorded as a mapping-only decision (no code changed, no consolidation
performed) and branding is confirmed as the next genuinely missing
capability. Direct inspection this session confirmed:

- `core/organization/organization-registry.js` owns only `name`, `type`,
  `notes` on an Organization record — no logo, watermark, address,
  location, contact, or brand-color field anywhere.
- `core/organization/organization-role.js` and `organization-hierarchy.js`
  own roles/reporting structure only — no branding concept.
- `core/modules/identity/identity-engine.js` owns platform-authority and
  resource-permission *enforcement* (`isPlatformAdmin()`,
  `checkResourcePermission()`) — no organization-branding concept, and it
  was not modified.
- `core/modules/media/cozy-media.js` (`CozyMedia`) is a real, existing,
  open-schema asset store (`createMedia`/`getMedia`) with no built-in
  organization-ownership enforcement of its own — callers are expected to
  put ownership fields in the descriptor and check them, which is exactly
  what this checkpoint's new file does rather than reimplementing a
  second asset store.
- No branding/logo/watermark/address/location seam existed anywhere else
  in the repository (grepped for `organization`, `branding`, `logo`,
  `watermark`, `address`, `location`, `tenant`, `currentOrganization`,
  `getOrganization`).

### Built this checkpoint

New file: `core/organization/organization-branding.js` — a sibling to
`organization-registry.js`/`organization-role.js`, not a second
organization engine. Composes, rather than duplicates:

- `OrganizationRegistry.organizationExists()` / `recordExternalHistory()`
  for existence-checking and the one shared audit log.
- `OrganizationRole.listRoles()` for authority: a branding mutation
  requires a real, assigned, non-archived role in that same organization
  declaring the `organization:branding` resource permission (same
  `resource:action` regex `IdentityEngine` already enforces) — or real
  platform-admin authority via `IdentityEngine.isPlatformAdmin()`.
  ChurchOS/ShopOS/etc. keep naming their own roles freely; nothing here
  invents a role hierarchy.
- `CozyMedia.getMedia()` for logo/watermark/favicon references: an asset
  id is only accepted if the referenced asset genuinely exists and its
  own recorded `orgId` matches — fails closed (drops the reference) if
  `CozyMedia` isn't loaded, the asset doesn't exist, or it belongs to a
  different organization. No signing secret and no raw client URL is ever
  trusted directly.

`getBranding(orgId, {viewerUserId})` returns one of two views from the
same record: a public-safe subset (identity, logo/watermark/favicon
refs, colors, website, city/region/country) to anyone unauthorized, and
the full record (adding full address/postal code/contact) only to a
platform admin or a real assigned role in that organization. No device
GPS is ever requested or stored — location is organization-declared
country/region/city only.

### Files changed
- `core/organization/organization-branding.js` (NEW)
- `core/organization/tests/organization-branding.test.js` (NEW)

No existing production file was modified this checkpoint.

### SHA-256 (new files)
```
3b73177727efdbc268ae44f650e25f73d522d56b3e8ca96175d55c4e22667bd5  core/organization/organization-branding.js
10d088e2e114d756603d0a2489b805f6a3469b039147d22be2cabe07fec6a637  core/organization/tests/organization-branding.test.js
```

### Tests
```
core/organization/tests/organization-branding.test.js         : 27/27 passed (new)
core/platform/tests/application-visibility.test.js            : 10/10 passed (unchanged, re-run)
core/shell/tests/dashboard-community-summary-core.test.js     :  8/8  passed (unchanged, re-run)
core/shell/tests/dashboard-navigation-core.test.js             : 43/43 passed (unchanged, re-run)
core/shell/tests/dashboard-settings-admin-boundary-core.test.js:  9/9  passed (unchanged, re-run)
core/shell/tests/launch-sequence-above-only.test.js            : 19/19 passed (unchanged, re-run — this suite includes an intentional ~30s startup-timer wait; not a hang)
```
New suite covers: metadata create/read, partial-merge update,
nonexistent-org rejection, malformed-color/opacity handling, authority
(ordinary user / unknown user / literal `"admin"` string / platform admin
/ cross-org role / application role alone), cross-organization isolation,
asset-ownership rejection (cross-org, absent `CozyMedia`, nonexistent
asset id), public-vs-authorized privacy view, dashboard crash-safety on
absent branding/logo/watermark/location, a non-ChurchOS ("shop")
organization proving the engine is generic, malformed nested input, and
prototype-pollution-key stripping.

The full repository test suite was not re-run in its entirety this
checkpoint (~140 files, would exceed this session's practical budget);
the set above was chosen as what this specific change could plausibly
affect (organization/authority/dashboard/application-visibility paths).

### Protected files
`core/modules/founder-story/*` — unchanged (not opened this checkpoint).
`core/shell/cozy-login-gate.js` — unchanged (not opened this checkpoint).
Confirmed by file-modification-time scan against the uploaded baseline:
the only two files newer than the baseline are the two new files listed
above.

### Known limitations / unresolved
- `organization-registry.js`'s `createOrganization()` still has no
  `createdBy` field, so there is no automatic "creator becomes
  administrator" bootstrap — a new organization's first administrator
  must be granted the `organization:branding` permission through an
  explicit `OrganizationRole` + `assignUser()` call by whatever process
  already provisions a new organization. Flagged, not solved this
  checkpoint (out of branding's own scope).
- Contact (`email`/`phone`/`website`) and address fields are HTML-escaped
  free text only — no format/deliverability validation beyond that and
  hex-color validation for brand colors.
- `preferredLanguage` is stored as free text on the organization record
  and intentionally NOT validated against either existing language
  registry, per the standing instruction not to fold this task into a
  language-registry rewrite — the 17-identity vs. live-resolver
  discrepancy remains disclosed, unchanged.
- Registry reconciliation (ShopOS/MpesaOS/QuarryOS existing in both
  ServiceRegistry and ModuleRegistry, per MID-2) remains an open,
  recorded risk — unchanged, not addressed this checkpoint.
- Browser/device/Internet-scale rendering remains NOT VERIFIED — this
  file was exercised only via Node's `window.CozyOS` shim, the same
  pattern the repository's own existing organization/role tests use.

## NEXT BUILD MUST START WITH
Wiring `OrganizationBranding.getBranding()` into the actual user
dashboard shell (`core/shell/*`) so the Apps/organization-context surface
can render name/logo/watermark/location where authorized, with an honest
empty state when absent. No dashboard file was touched this checkpoint —
the seam is built and tested, ready to be consumed there next.
