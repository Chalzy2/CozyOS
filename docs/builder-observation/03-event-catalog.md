# CozyOS — Event Catalog (extracted, not invented)
Every event name below was found by grepping actual `dispatchEvent`/`CustomEvent`/`bus.emit`/`bus.publish` calls and colon-namespaced string literals across the workspace. This is a first pass — high-confidence but not guaranteed exhaustive (dynamic event names built via template literals wouldn't be caught by static grep and are called out where suspected).

## Identity / Auth domain
`identity:login` · `identity:session-created` · `identity:session-ended` · `identity:permission-denied` · `identity:status_changed` · `identity:user-enabled` · `identity:user-disabled` · `identity:license_assigned` · `identity:feature_toggled` · `identity:application_assigned` / `_toggled` / `_unassigned` · `identity:department-created` / `-updated` · `identity:organization-created` / `-updated` / `-archived` / `-deleted` / `-restored` · `session:create` · `device:added` · `device:removed`

## Plugin domain
`plugin:install` · `plugin:register` · `plugin:enable` · `plugin:disable` · `plugin:reload` · `plugin:restart` · `plugin:validate` (dispatched with `cozyos:` prefix per `pluginManager.js`'s own header: `cozyos:plugin:{install,enable,disable,error,timeout,remove}`)

## Kernel / Platform domain
`kernel:ready` (27 occurrences — heavily used despite Kernel itself being orphaned, see architecture report §2/§11) · `cozyos:kernel-bridge-ready` · `coordinator:registered` · `coordinator:unregister` · `registry:validate` · `registry:repair` · `module:validate` · `discovery:scan` / `:scanned` / `:refresh` · `dependency:refresh` · `file:registered` · `health:refresh` · `usage:refresh` (+ `refreshDuplicate`, `refreshDead` variants)

## Application lifecycle
`application:launch` · `application:stop` · `application:validate` · `application:unregister` · `application:state-changed`

## Workflow / automation
`workflow:started` · `workflow:completed` · `workflow:failed` · `workflow:idempotentReturn` · `workflow:doubleTapBlocked`

## Living / UI domain
`cozy:launch-sequence-complete` (the real startup-completion gate, Rule 16 compliance point) · `cozy:environment-changed` · `living:scripture-detected` · `living:scripture-share` · `living:caption-translated` · `worship-phase-changed` · `theme:registered` / `theme:theme-activated` / `theme:theme-deactivated`

## Commerce / domain-specific
`payment:completed` · `purchase:invoiced` · `sales:mutation_complete` · `content:create` / `content:publish` · `search:query` · `resource:registered` / `:allocated` / `:released` / `:action` / `:failed`

## Certification / audit
`certification:run` · `audit:export` · `hub:repaired` · `release:locked` · `upgrade:verified`

## Gaps observed (not found via grep — worth confirming in Layer 2/3, since the Observation Engine mission list expects these)
`FileCreated/Modified/Deleted`, `BuildStarted/Completed/Failed`, `MemorySpikeDetected`, `CrashDetected`, `NetworkDisconnected/Restored`, `SynchronizationStarted/Completed`, `TestPassed/Failed` — none of these literal strings were found in application code. Either they're aspirational (described in the Observation Engine spec you supplied but not yet implemented in CozyOS itself), or they're built via dynamic string concatenation that static grep can't catch. Flagging rather than guessing.
