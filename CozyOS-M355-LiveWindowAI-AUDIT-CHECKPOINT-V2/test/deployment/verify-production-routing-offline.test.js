'use strict';
/**
 * test/deployment/verify-production-routing-offline.test.js
 *
 * Offline, deterministic tests for scripts/verify-production-routing.sh's
 * decision logic. These tests make ZERO network calls: they source the
 * script (which — by design, see the file's own header — only defines
 * functions when sourced and never calls main()/fetch()) and then invoke
 * its classify_* functions directly with fabricated status codes,
 * content-types, and body files.
 *
 * This intentionally does NOT prove cozyos.org is actually routing
 * correctly in production — only that the script's parsing/detection
 * logic makes the right call for each response shape it could plausibly
 * see. Live verification against the real hostname is a separate,
 * explicitly-manual step: run scripts/verify-production-routing.sh
 * directly (not sourced) from an environment with real network access
 * (e.g. Termux) — see docs/checkpoints/CP4-PART3B-1-CHECKPOINT.md.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SCRIPT_PATH = path.resolve(__dirname, '../../scripts/verify-production-routing.sh');

// Runs `bash -c "source SCRIPT; <fnCall>"` and returns trimmed stdout.
// No network access is possible here: sourcing the script defines
// functions only, and the classify_* functions themselves never invoke
// curl or touch the network — see resolve_workdir/classify_* in the
// script, which operate purely on their arguments and local files.
function runClassifier(fnCall) {
  const out = execFileSync(
    'bash',
    ['-c', `source '${SCRIPT_PATH}'; ${fnCall}`],
    { encoding: 'utf8' }
  );
  return out.trim();
}

function withTempBodyFile(content, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cozyos-offline-test-'));
  const file = path.join(dir, 'body');
  fs.writeFileSync(file, content);
  try {
    return fn(file);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function kindOf(line) {
  return line.split('::')[0];
}

test('script can be sourced with zero network calls (defines functions only)', () => {
  // If sourcing the script tried to hit the network, this would hang or
  // fail in this network-disabled test environment. Its success is
  // itself part of the assertion.
  const out = execFileSync(
    'bash',
    ['-c', `source '${SCRIPT_PATH}'; echo sourced-ok; type classify_root >/dev/null 2>&1 && echo has-classify_root`],
    { encoding: 'utf8', timeout: 5000 }
  );
  assert.match(out, /sourced-ok/);
  assert.match(out, /has-classify_root/);
});

test('/webauthn/session -> 401 application/json {"authenticated":false} = expected backend response (PASS)', () => {
  withTempBodyFile('{"authenticated":false}', (bodyfile) => {
    const line = runClassifier(`classify_webauthn_session_route "401" "application/json" "${bodyfile}"`);
    assert.equal(kindOf(line), 'PASS');
  });
});

test('/webauthn/session -> 200 text/html = Pages/static fallback failure (FAIL)', () => {
  withTempBodyFile('<!doctype html><html><head></head><body>CozyOS</body></html>', (bodyfile) => {
    const line = runClassifier(`classify_webauthn_session_route "200" "text/html" "${bodyfile}"`);
    assert.equal(kindOf(line), 'FAIL');
    assert.match(line, /not hitting Render|HTML/);
  });
});

test('/webauthn/session -> unexpected content type (e.g. text/plain, 200) = WARN, not a silent pass', () => {
  withTempBodyFile('unexpected plain body', (bodyfile) => {
    const line = runClassifier(`classify_webauthn_session_route "200" "text/plain" "${bodyfile}"`);
    assert.equal(kindOf(line), 'WARN');
  });
});

test('/webauthn/session -> 401 JSON content-type but HTML-looking body = FAIL (proxy misconfig signal)', () => {
  withTempBodyFile('<html><body>not really json</body></html>', (bodyfile) => {
    const line = runClassifier(`classify_webauthn_session_route "401" "application/json" "${bodyfile}"`);
    assert.equal(kindOf(line), 'FAIL');
  });
});

test('deep body check: /webauthn/session JSON with {"authenticated":...} shape = PASS', () => {
  withTempBodyFile('{"authenticated":false}', (bodyfile) => {
    const line = runClassifier(`classify_webauthn_session_body "application/json" "${bodyfile}"`);
    assert.equal(kindOf(line), 'PASS');
  });
});

test('deep body check: /webauthn/session HTML body = FAIL (Pages fallback, not Render)', () => {
  withTempBodyFile('<html><body>index</body></html>', (bodyfile) => {
    const line = runClassifier(`classify_webauthn_session_body "text/html" "${bodyfile}"`);
    assert.equal(kindOf(line), 'FAIL');
  });
});

test('/ -> 200 = normal static response (PASS)', () => {
  const line = runClassifier('classify_root "200"');
  assert.equal(kindOf(line), 'PASS');
});

test('/ -> non-200 = WARN, not silently ignored', () => {
  const line = runClassifier('classify_root "503"');
  assert.equal(kindOf(line), 'WARN');
});

test('/admin -> 404 unauthenticated = protected as expected (PASS)', () => {
  withTempBodyFile('Not Found', (bodyfile) => {
    const line = runClassifier(`classify_admin_route "404" "${bodyfile}"`);
    assert.equal(kindOf(line), 'PASS');
  });
});

test('/admin -> 200 with administrator HTML leaked unauthenticated = FAIL (security issue)', () => {
  withTempBodyFile('<html><body>Chalzy Administrator Workspace</body></html>', (bodyfile) => {
    const line = runClassifier(`classify_admin_route "200" "${bodyfile}"`);
    assert.equal(kindOf(line), 'FAIL');
  });
});

test('/admin -> unexpected status without leaked admin content = WARN, not a hard failure', () => {
  withTempBodyFile('some other body', (bodyfile) => {
    const line = runClassifier(`classify_admin_route "500" "${bodyfile}"`);
    assert.equal(kindOf(line), 'WARN');
  });
});

test('/chalzydashboard -> 200 HTML gate page = PASS (with manual-confirm note)', () => {
  withTempBodyFile('<html><body>Sign in to continue</body></html>', (bodyfile) => {
    const line = runClassifier(`classify_chalzydashboard_route "200" "text/html" "${bodyfile}"`);
    assert.equal(kindOf(line), 'PASS');
  });
});

test('/chalzydashboard -> unexpected status/type = WARN', () => {
  withTempBodyFile('{}', (bodyfile) => {
    const line = runClassifier(`classify_chalzydashboard_route "500" "application/json" "${bodyfile}"`);
    assert.equal(kindOf(line), 'WARN');
  });
});

test('/auth/* route -> non-HTML response = PASS', () => {
  withTempBodyFile('{"ok":true}', (bodyfile) => {
    const line = runClassifier(`classify_auth_route "/auth/google" "302" "application/json" "${bodyfile}"`);
    assert.equal(kindOf(line), 'PASS');
  });
});

test('/auth/* route -> HTML shell response = WARN (ambiguous: could be legit redirect page)', () => {
  withTempBodyFile('<html><body>redirecting...</body></html>', (bodyfile) => {
    const line = runClassifier(`classify_auth_route "/auth/google" "200" "text/html" "${bodyfile}"`);
    assert.equal(kindOf(line), 'WARN');
  });
});

test('Set-Cookie flags: all four required flags present = all PASS', () => {
  const header = 'Set-Cookie: cozy_admin_session=REDACTED; Secure; HttpOnly; SameSite=Strict; Path=/';
  for (const flag of ['Secure', 'HttpOnly', 'SameSite=Strict', 'Path=/']) {
    const line = runClassifier(`classify_cookie_flag '${header}' '${flag}'`);
    assert.equal(kindOf(line), 'PASS', `expected PASS for flag ${flag}`);
  }
});

test('Set-Cookie flags: missing Secure = FAIL for that flag only', () => {
  const header = 'Set-Cookie: cozy_admin_session=REDACTED; HttpOnly; SameSite=Strict; Path=/';
  const secureLine = runClassifier(`classify_cookie_flag '${header}' 'Secure'`);
  const httpOnlyLine = runClassifier(`classify_cookie_flag '${header}' 'HttpOnly'`);
  assert.equal(kindOf(secureLine), 'FAIL');
  assert.equal(kindOf(httpOnlyLine), 'PASS');
});

test('resolve_workdir: missing/unwritable TMPDIR falls back to a writable directory', () => {
  const out = execFileSync(
    'bash',
    ['-c', `source '${SCRIPT_PATH}'; TMPDIR=/nonexistent-directory-for-test dir="$(resolve_workdir)"; test -d "$dir" && test -w "$dir" && echo "WORKDIR_OK:$dir"; rm -rf "$dir"`],
    { encoding: 'utf8', timeout: 5000 }
  );
  assert.match(out, /WORKDIR_OK:/);
});

test('resolve_workdir: unwritable-but-existing TMPDIR also falls back to a writable directory', () => {
  const roDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cozyos-ro-'));
  try {
    fs.chmodSync(roDir, 0o400); // read-only, not writable
    const out = execFileSync(
      'bash',
      ['-c', `source '${SCRIPT_PATH}'; TMPDIR='${roDir}' dir="$(resolve_workdir)"; test -d "$dir" && test -w "$dir" && echo "WORKDIR_OK:$dir"; rm -rf "$dir"`],
      { encoding: 'utf8', timeout: 5000 }
    );
    assert.match(out, /WORKDIR_OK:/);
  } finally {
    fs.chmodSync(roDir, 0o700);
    fs.rmSync(roDir, { recursive: true, force: true });
  }
});

test('body_looks_like_html_shell_file: detects <html shell vs plain/JSON body', () => {
  withTempBodyFile('<html><body>x</body></html>', (htmlFile) => {
    withTempBodyFile('{"authenticated":false}', (jsonFile) => {
      const htmlResult = execFileSync(
        'bash',
        ['-c', `source '${SCRIPT_PATH}'; body_looks_like_html_shell_file '${htmlFile}' && echo IS_HTML || echo NOT_HTML`],
        { encoding: 'utf8' }
      ).trim();
      const jsonResult = execFileSync(
        'bash',
        ['-c', `source '${SCRIPT_PATH}'; body_looks_like_html_shell_file '${jsonFile}' && echo IS_HTML || echo NOT_HTML`],
        { encoding: 'utf8' }
      ).trim();
      assert.equal(htmlResult, 'IS_HTML');
      assert.equal(jsonResult, 'NOT_HTML');
    });
  });
});
