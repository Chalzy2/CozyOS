# Milestone 177 — Gate 4 — Known Limitations

- **Browser Runtime Verified not performed** — no browser available in
  this environment. Only Node-harness runtime verification (real,
  unmocked files) was possible, consistent with every prior milestone.
- **`realProviders: 0` is the registry's real, pre-existing state, not
  something this milestone changed or could change.** All 12 factor
  names in `AuthFactorRegistry` are still stub providers
  (`isReal: false`) — none of Face/Fingerprint/Voice/Trusted
  Device/Recovery Questions/Recovery Phrase/Google Account/Device
  Certificate/Security Key/OTP/Recovery Key/Emergency Recovery Code has
  genuine verification logic yet in this static, client-side
  environment. `getFactorHealthReport()` reports this honestly; it does
  not and must not make any factor appear more real than it is.
- **No new capability was added to `AuthFactorRegistry` itself.** This
  milestone's two new methods are read-only passthroughs on
  `AuthorizationCoordinator`; they do not change what factors exist,
  how they're verified, or who owns them.
- **Callers who already imported `AuthFactorRegistry` directly are
  unaffected and not required to migrate** — `getFactorInventory()`/
  `getFactorHealthReport()` are an additive convenience for callers
  that only hold a reference to `AuthorizationCoordinator` (e.g. a
  future Auth Factor dashboard panel), not a removal of the existing,
  valid direct path.
- **No UI consumer was built.** This milestone only verified and
  extended the data-access layer; no dashboard panel, Developer Hub
  screen, or other UI presently calls `getFactorInventory()`/
  `getFactorHealthReport()`. Building such a consumer is separate,
  unscoped, future work.
