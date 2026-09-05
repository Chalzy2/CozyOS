# M380 Improvement Report
**Milestone:** M380 | **Status:** Complete | **Date:** 2026-08-05

## Learned
No regression-detection engine exists or was warranted. RG entries are a human-judgment log, same discipline as RP. A naive heading-count check (`## `) would false-match a template placeholder (`RG-NNN`); the real evidence engine's regex (`RG-\d+`) does not — verified directly, not assumed.

## Should improve next
Nothing to build for RG until a real regression occurs. Watch for one during normal engineering, log immediately.

## Should never be repeated
Never fabricate a regression to clear a threshold. Not done here; stated explicitly as a standing rule.
