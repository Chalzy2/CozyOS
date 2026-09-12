# PHASE 10C-3C — AUDIT MANIFEST

- Session type: investigation only. No production files created, modified, or deleted.
- Environment: sandbox container, Node v22.22.2, network access disabled, no physical device.
- Input verified: `COS-REPO-MERGED-PHASE10C3B5__1_.zip`, SHA-256
  `c57c4a1e39ff25eade8197e94fb04d0f291a6afc74fc2477627b4634cd0c5614` — matches Phase 10C-3B6 prompt.

## Commands actually executed (abbreviated)

```
sha256sum COS-REPO-MERGED-PHASE10C3B5__1_.zip
unzip -o COS-REPO-MERGED-PHASE10C3B5__1_.zip -d extracted
grep -rl "CozyThinking" --include="*.js" .
grep -rl "CognitiveCoordinator" --include="*.js" .
grep -rl "LivingAI" --include="*.js" .
find . -iname "package.json"
find . -iname "*.test.js" | wc -l        # 178
for f in <all 178 test files>: node "$f"  (10s timeout each)
grep -oE "[0-9]+ passed, [0-9]+ failed" <combined output> | sort | uniq -c
sha256sum core/config.js core/living/cozy-living-ai.js core/modules/cognitive/cognitive-coordinator.js
         core/modules/thinking/cozy-thinking.js core/ai/cozy-ai-platform.js server/auth/google-login-endpoint.js
```

## Test execution summary (this session, real)

- Total test files found: 178
- Exit 0 (fully passing): 137
- Exit 1 (real failure): 12
- Exit 124 (timeout at 10s): 27
- Files with a "passed/failed" count matching each of the 11 baseline numbers cited in the
  Phase 10C-3B6 prompt: 16/16 ✓, 22/22 ✓, 11/11 ✓, 5/5 ✓, 8/8 ✓, 12/12 ✓, 7/7 ✓, 10/10 ✓,
  49/49 ✓, **17/17 ✗ (not found anywhere in this run)**.

Full raw output retained at `/tmp/testrun/all_output.txt` in this sandbox (not included in
any deliverable zip; ephemeral to this session).

## Files produced this session

- `PHASE10C-3C-STAGE2-ARCHITECTURE-AUDIT.md`
- `PHASE10C-3C-AUDIT-MANIFEST.md` (this file)

## Files modified this session

None.

## Outcome

B — architecture confirmed, test infrastructure incomplete (see full audit report for detail).
