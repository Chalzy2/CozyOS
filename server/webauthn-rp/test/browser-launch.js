/**
 * server/webauthn-rp/test/browser-launch.js
 *
 * Portable Chromium discovery for browser-e2e-passkey-login.test.js.
 *
 * WHY THIS EXISTS
 * ----------------
 * Playwright's normal `npx playwright install chromium` downloads a
 * desktop Linux (glibc) Chromium build. That build does not run under
 * Termux: Termux's userland is Android/Bionic libc, not glibc, and it
 * lacks the desktop shared libraries (libX11, libnss3, etc.) that
 * bundle assumes. Playwright's official guidance for Android/Termux is
 * therefore NOT "download our Chromium anyway" — it's to point
 * Playwright at a real, natively-built ARM Chromium already present on
 * the system, and disable Playwright's own download behavior.
 *
 * On Termux specifically, that means Chromium installed from Termux's
 * own X11 package repo:
 *
 *   pkg install x11-repo
 *   pkg install chromium
 *
 * which installs a real, natively-compiled Android/ARM64 Chromium
 * binary (not a desktop-Linux binary running under emulation) at
 * $PREFIX/bin/chromium-browser. $PREFIX is Termux's own environment
 * variable for its install prefix (normally
 * /data/data/com.termux/files/usr) — this module reads that
 * dynamically rather than hard-coding any device's actual path.
 *
 * DISCOVERY ORDER (no personal/hard-coded absolute path anywhere)
 *   1. COZY_E2E_CHROMIUM_PATH env var, if set and the file exists —
 *      explicit override, for any environment including a Termux
 *      device where the operator wants full control.
 *   2. `which chromium-browser` / `which chromium` / `which chromium.br`
 *      on PATH — covers Termux's package (chromium-browser) and most
 *      Linux distros' package name (chromium), wherever PATH actually
 *      resolves it.
 *   3. $PREFIX/bin/chromium-browser — Termux's install location,
 *      derived from Termux's own PREFIX env var (present only inside
 *      Termux; this module never assumes or hard-codes it).
 *   4. Playwright's own managed browser resolution (no executablePath)
 *      — what already works today wherever `npx playwright install
 *      chromium` succeeded (desktop Linux/macOS/Windows, CI, or this
 *      sandbox).
 *
 * Android has no working Chromium sandbox for an unprivileged process,
 * so when a Termux-style executable is in use, several launch flags are
 * added — but ONLY in that case. A discovered desktop Chromium (steps
 * 1/2/3 on non-Android platforms, or step 4) keeps Playwright's normal
 * sandboxed default; this module never weakens the sandbox for
 * environments that don't need the Android workaround.
 *
 *   --no-sandbox          Chromium's setuid/namespace sandbox requires
 *                          OS support Android's app-sandbox model does
 *                          not provide to an unprivileged process.
 *   --no-zygote            THE FIX FOR "CANNOT LINK EXECUTABLE
 *                          /proc/self/exe ... libtermux-exec.so ... not
 *                          accessible". Chromium's zygote host normally
 *                          forks the renderer/GPU/network-service child
 *                          processes by having them re-exec the browser
 *                          binary via /proc/self/exe. That re-exec does
 *                          not go through Termux's normal launcher path
 *                          (the chromium-browser wrapper / PATH-based
 *                          exec), so the LD_PRELOAD environment Termux's
 *                          termux-exec package needs — to work around
 *                          Android 10+'s W^X restriction on executing
 *                          files from the app's private data directory
 *                          — does not survive into the re-exec, and the
 *                          child process fails to link. --no-zygote
 *                          disables that pre-fork/self-reexec model
 *                          entirely: child processes are forked and
 *                          exec'd directly instead, through the same
 *                          path (and therefore the same termux-exec
 *                          interception) as the initial launch. This is
 *                          Chromium's own documented flag for exactly
 *                          this class of restricted-exec environment
 *                          (also the standard fix for the identical
 *                          zygote/self-reexec failure mode reported in
 *                          containers and other locked-down sandboxes)
 *                          — not a bypass of any Android security
 *                          mechanism, and not a CozyOS-specific hack.
 *   --disable-dev-shm-usage
 *                          Android has no general-purpose /dev/shm the
 *                          way desktop Linux does; Chromium's renderer/
 *                          network-service processes otherwise try to
 *                          use it for shared memory and can crash
 *                          (matches the "network service repeatedly
 *                          crashes" symptom) — this makes Chromium fall
 *                          back to a regular temp-file-backed buffer.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

function tryWhich(bin) {
  try {
    const out = execFileSync('which', [bin], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    return out && fs.existsSync(out) ? out : null;
  } catch (_e) {
    return null;
  }
}

/**
 * Returns { executablePath?, isAndroidNative } describing how to launch
 * Chromium in this environment. executablePath is omitted entirely when
 * falling back to Playwright's own managed browser (step 4 above).
 */
function discoverChromium() {
  const override = process.env.COZY_E2E_CHROMIUM_PATH;
  if (override && fs.existsSync(override)) {
    return { executablePath: override, isAndroidNative: process.platform === 'android' };
  }

  for (const bin of ['chromium-browser', 'chromium', 'chromium.br']) {
    const found = tryWhich(bin);
    if (found) return { executablePath: found, isAndroidNative: process.platform === 'android' };
  }

  if (process.env.PREFIX) {
    // Only meaningful inside Termux, which sets PREFIX itself — never a
    // value this module invents or hard-codes.
    const candidate = path.join(process.env.PREFIX, 'bin', 'chromium-browser');
    if (fs.existsSync(candidate)) {
      return { executablePath: candidate, isAndroidNative: true };
    }
  }

  return { isAndroidNative: false }; // let Playwright resolve its own managed browser
}

/**
 * Builds the launch() options object for `chromium.launch(...)`.
 * Merges any caller-supplied opts (e.g. { headless: true }) with the
 * discovered executablePath and, when the discovered binary is Android-
 * native (Termux), the args Chromium needs to run without a working OS
 * sandbox or zygote self-reexec (see file header for why each flag is
 * required).
 */
function resolveLaunchOptions(baseOpts = {}) {
  const { executablePath, isAndroidNative } = discoverChromium();
  const opts = { ...baseOpts };
  if (executablePath) opts.executablePath = executablePath;
  if (isAndroidNative) {
    opts.args = [...(opts.args || []), '--no-sandbox', '--no-zygote', '--disable-gpu', '--disable-dev-shm-usage', '--in-process-gpu'];
  }
  return opts;
}

module.exports = { discoverChromium, resolveLaunchOptions };
