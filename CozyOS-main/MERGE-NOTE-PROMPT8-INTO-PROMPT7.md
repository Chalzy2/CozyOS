# Merge Note — PROMPT8-AUTH-DECISION-MID-1 into PROMPT7-GOOGLE-MID-1

PROMPT8 was delivered as a 3-file patch (BYTE-DIFF-SINCE-PROMPT7-GOOGLE-MID-1.diff)
against the PROMPT7-GOOGLE-MID-1 full-repo baseline. This package applies that
patch on top of the baseline to produce one complete, consistent repository.

Files overlaid from PROMPT8 (hashes verified to match
CHANGED-FILE-HASHES-PROMPT8-AUTH-DECISION-MID-1.txt exactly):
- core/security/auth-factor-snapshot.js (new)
- core/security/test/auth-factor-snapshot.test.js (new)
- core/modules/identity/identity-engine.js (additive edit — registrationMethod field)

Verification performed during merge (this session, real node --test execution,
not carried over from either source package):
- core/security/test/**/*.test.js: 104/104 passing on the merged tree.

No other files were modified. This is a mechanical merge only — no new
implementation work was performed.
