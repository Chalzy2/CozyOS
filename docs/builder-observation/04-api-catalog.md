# CozyOS — API Catalog (key coordinators)
Method lists below were extracted directly from source (not inferred). Private methods (`#name`) are listed for completeness since Builder needs them for accurate dependency/impact analysis, but only non-`#` methods are the real public API surface external callers can use.

## AuthCoordinator — `core/modules/identity/auth-coordinator.js` (v1.2.0-ENTERPRISE)
**Global:** `window.CozyOS.AuthCoordinator`
**Public methods:** `getVersion()` · `loginWithCredentials(username, password, {rememberMe})` · `getLoginHistory(username)` · `changePassword(username, oldPassword, newPassword)` · `loginWithTrustedDevice({userId, deviceId})` · `loginWithBiometrics({userId, deviceId})` · `restoreSession()` · `logout()` · `getCurrentIdentity()` · `isAuthenticated()` · `getDiagnosticsReport()`
**Private:** `#identity()` `#recoveryPolicy()` `#session()` `#auth()` `#persistPointer()` `#readPointer()`
**Depends on:** IdentityEngine, AdminRecoveryPolicy, CozyOS.Session, CozyOS.Auth
**M372 change:** `restoreSession()` behavior unchanged in signature; auto-restore retry logic added at module-load time (not a public method, but changes observable timing behavior for callers relying on restoration completing quickly after page load).

## AuthorizationCoordinator — `core/security/auth-coordinator.js` (distinct file, distinct global)
**Global:** `window.CozyOS.AuthorizationCoordinator`
**Public methods:** `getVersion()` · `getAuditLog()` · `authorize({policy, context})` · `authenticate(operationName, context)` · `login({username, password, rememberDevice, deviceNickname})` · `logout()` · `publishAuditReport()` · `getDiagnosticsReport()` · `getFactorInventory()` · `getFactorHealthReport()`
**Depends on:** CozyOS.Auth, AuthPolicyEngine, AuthFactorRegistry
**Note:** has its own `login()`/`logout()` distinct from AuthCoordinator's — confirm with the team whether callers are expected to know which one to call for which purpose; this is the kind of ambiguity Builder should flag for human review rather than resolve unilaterally.

## SessionService — `core/modules/session/cozy-session-service.js`
**Global:** (registers as `window.CozyOS.Session`, referenced via `#session()` in AuthCoordinator)
**Public methods:** `getVersion()` · `getAuditLog(predicate)` · `current()` · `isSignedIn()` · `establishFromIdentity(sessionId)` · `establishFromExternalAuth(rawProfile)` · `end()` · `getDiagnosticsReport()` · `isVersionCompatible(v)`

## PluginManager — `core/pluginManager.js` (v1.2.0)
**Public methods:** `initModule(tenantId, moduleContext)` · `unregister(pluginId)` (async) · `resolve(pluginId)` · `stats()` · `list()` · `health(includeRemoved)` · `get(pluginId)`
**Behavioral guarantees (from header):** crash isolation with per-plugin failure counter + auto-disable at threshold; concurrent-execution guard unless `manifest.allowConcurrent`; permission allowlisting; lifecycle events on `window`.

## ModuleRegistry — `core/modules/module-registry.js` (v1.0.0-ENTERPRISE)
**Public methods:** `getVersion()` · `getAuditLog(predicate)` · `remove(id)` · `freeze()` · `isFrozen()` · `get(id)` · `resolve(id)` · `resolvePaths(id)` · `list({includeDisabled})` · `isVersionCompatible(v)` · `getDiagnosticsReport()`
**Honest scope constraint (self-documented):** only registers applications with real shell-integrated files — currently developer-hub, shopos, mpesaos.

## Contract Builder should enforce automatically going forward
Every coordinator inspected exposes `getVersion()`, and most expose `getDiagnosticsReport()` / `getAuditLog()`. Any new coordinator that omits these should be flagged as a convention violation during Analysis, since it's a de facto interface contract even though it's not written down as one of the 24 numbered rules.
