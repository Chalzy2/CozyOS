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
 *   --single-process       ADDED after CP6.1's field retry (CP6.2):
 *                          --no-zygote alone was not sufficient — the
 *                          identical "CANNOT LINK EXECUTABLE
 *                          /proc/self/exe ... libtermux-exec.so ... not
 *                          accessible" error, plus a hung/ETIMEDOUT
 *                          launch, still occurred. Reason: --no-zygote
 *                          only removes the pre-fork zygote *host*;
 *                          Chromium's child-process launcher
 *                          (content::ChildProcessLauncher on POSIX)
 *                          still re-execs the browser binary via
 *                          /proc/self/exe for each renderer/utility/
 *                          network-service child regardless of the
 *                          zygote setting, as a guard against argv[0]
 *                          tampering. That re-exec still bypasses
 *                          termux-exec's LD_PRELOAD interception the
 *                          same way the original zygote self-reexec
 *                          did, so the child hangs/fails to link and
 *                          the parent times out waiting for it.
 *                          --single-process removes the only remaining
 *                          cause of that re-exec by running the
 *                          renderer inside the browser's own process —
 *                          no child process, so no /proc/self/exe
 *                          re-exec, so no termux-exec namespace
 *                          failure. This is Chromium's own documented
 *                          flag for environments where child-process
 *                          launch itself is restricted (the same class
 *                          of restricted-exec environment --no-zygote
 *                          targets, just the next level of the same
 *                          fix). Trade-off, disclosed rather than
 *                          hidden: Playwright's own docs flag
 *                          --single-process as less battle-tested with
 *                          CDP-driven automation than multi-process
 *                          Chromium. It is scoped here to the
 *                          Android-native branch only — no other
 *                          platform's launch options are affected — and
 *                          step 4 of chromium-dependency-verify.js
 *                          exists specifically to catch it here, in
 *                          isolation, before the real Taskbar/WebAuthn
 *                          suites ever run under it.
 *                          CORRECTION (CP6.3): CP6.2's checkpoint text
 *                          asserted --single-process would remove the
 *                          remaining child-process re-exec problem.
 *                          The Termux retry showed that claim was not
 *                          fully proven — a new failure surfaced
 *                          instead (see --no-proxy-server below) before
 *                          any pass/fail of the original termux-exec
 *                          hypothesis could be confirmed.
 *                          CORRECTION (CP6.5) — REMOVED, do not re-add:
 *                          the CP6.4 bisect (real Termux device, one
 *                          flag at a time) reached step 04 with
 *                          --no-sandbox --no-zygote --disable-gpu
 *                          --in-process-gpu --disable-dev-shm-usage
 *                          already active and PASSING (exit 0, marker
 *                          found) — proof the renderer child process
 *                          already launches and runs JS correctly on
 *                          this device WITHOUT --single-process, which
 *                          quietly invalidates the premise above (that
 *                          a renderer re-exec failure would still occur
 *                          without it). Adding --single-process on top
 *                          of that passing state is what produced the
 *                          SIGTRAP. This is not a flag-ordering problem
 *                          like the GPU-process one CP6.4 fixed in the
 *                          bisect script — it is Chromium for Android
 *                          not supporting single-process mode at all: a
 *                          Chromium-dev mailing-list thread on this
 *                          exact flag confirms "Chrome for Android
 *                          doesn't support single-process mode, and
 *                          thus is not guaranteed to work properly in
 *                          it" (Torne/Primiano Tucci thread, "Flags
 *                          --single-process doesn't work on chrome
 *                          public"), and a SIGTRAP with no other signal
 *                          is the expected shape of that failure:
 *                          release-build CHECK()/NOTREACHED() failures
 *                          in Chromium call base::ImmediateCrash(),
 *                          which raises a trap instruction, not a
 *                          segfault or abort — an independently filed
 *                          CEF issue reproduces the identical
 *                          Chromium-build SIGTRAP specifically and only
 *                          when --single-process is passed (chromiumembedded/cef#4067),
 *                          and its own workaround is the same shape as
 *                          this file's remaining flags: no-zygote,
 *                          no-sandbox, in-process-gpu,
 *                          disable-dev-shm-usage — everything here
 *                          except --single-process itself. --single-
 *                          process is therefore removed from the
 *                          Android-native args below, not reordered or
 *                          paired differently. Its two downstream
 *                          flags, --no-proxy-server and
 *                          --disable-crash-reporter, are left in place
 *                          (untested without --single-process, and
 *                          harmless either way for this no-network
 *                          headless fixture) rather than removed on
 *                          guesswork — that is a separate question for
 *                          a future checkpoint if either is ever shown
 *                          to matter on its own.
 *   --no-proxy-server       Chromium's default proxy resolution tries
 *                          to spin up an out-of-process V8 instance to
 *                          evaluate PAC scripts; --single-process
 *                          removes the process that would host it,
 *                          which is exactly what the recurring
 *                          "Cannot use V8 Proxy resolver in single
 *                          process mode" error reports
 *                          (proxy_service_factory.cc /
 *                          system_network_context_manager.cc — this is
 *                          a long-standing, widely-reported Chromium
 *                          message specific to --single-process, not a
 *                          CozyOS- or Termux-specific bug; see e.g.
 *                          chromium issue 80564 and multiple CEF/
 *                          brozzler reports of the identical line).
 *                          The documented workaround for a non-Windows
 *                          build (the Windows-only alternative is
 *                          --winhttp-proxy-resolver, not applicable
 *                          here) is to remove the need for proxy
 *                          resolution entirely: --no-proxy-server tells
 *                          Chromium there is no proxy to resolve, so
 *                          the V8 resolver — in-process or out — is
 *                          never invoked. This test fixture makes no
 *                          outbound network requests (the harness is
 *                          served from a local http server and loads
 *                          only local files), so disabling proxy
 *                          support has no effect on what is being
 *                          tested.
 *   --disable-crash-reporter
 *                          Added alongside --no-proxy-server because
 *                          Termux also reported Crashpad permission/
 *                          error messages in the same run. Crashpad's
 *                          handler is itself a separate process
 *                          Chromium launches on startup to catch its
 *                          own crashes; under the same restricted-exec
 *                          conditions already documented above for
 *                          --no-zygote/--single-process, that launch is
 *                          a plausible additional source of noise or
 *                          hang, and it serves no purpose for this
 *                          scripted, disposable, headless test launch.
 *                          This flag stops Chromium from initializing
 *                          Crashpad at all, removing that process
 *                          launch as a variable rather than leaving it
 *                          to fail silently in a restricted namespace
 *                          like the others did.
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
    // CP6.5: --single-process removed — see file header correction.
    // Chrome/Chromium for Android does not support single-process mode;
    // it hits an internal CHECK/ImmediateCrash (SIGTRAP), confirmed on
    // this exact device by the CP6.4 bisect. The renderer already works
    // without it once --no-zygote, --disable-gpu, --in-process-gpu, and
    // --disable-dev-shm-usage are active together (bisect steps 01-03
    // all passed before --single-process was ever added).
    opts.args = [...(opts.args || []), '--no-sandbox', '--no-zygote', '--disable-gpu', '--disable-dev-shm-usage', '--in-process-gpu', '--no-proxy-server', '--disable-crash-reporter'];
  }
  return opts;
}

module.exports = { discoverChromium, resolveLaunchOptions };
