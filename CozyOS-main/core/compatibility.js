/**
 * =============================================================================
 * CozyOS Kernel — Compatibility Engine
 * File: core/kernel/compatibility.js
 * =============================================================================
 *
 * PURPOSE
 * -------
 * Compatibility owns exactly one decision (Rule 1): given a Service
 * Manifest, is this service allowed to join the platform right now?
 *
 *   Bootstrap
 *     │
 *     ▼
 *   Compatibility.check(manifest, { kernelVersion })
 *     │
 *   Compatible?
 *    / \
 *  Yes  No
 *   │    │
 *   ▼    ▼
 * Register Reject
 *
 * It does not validate manifest SHAPE (that's Bootstrap's job via
 * validateManifest() — Rule 2, no duplication). It does not touch
 * registration or runtime state (Rules 1, 12). It answers exactly one
 * question: is this manifest's declared kernel/API version contract
 * satisfied by the running kernel?
 *
 * WHAT IT CHECKS
 * ---------------
 * 1. manifest.minKernelVersion <= the running kernel version (semver).
 * 2. manifest.apiVersion's major version is one this kernel supports.
 *
 * WHAT IT DELIBERATELY DOES NOT CHECK
 * -------------------------------------
 * - Whether manifest.dependencies exist or are running — that's a runtime
 *   concern Lifecycle already owns during verifyService() (Rule 12).
 *   Checking it here would duplicate that logic (Rule 2).
 * - Manifest shape/required fields — Bootstrap already does this
 *   (Rule 9, Rule 2).
 *
 * CERTIFICATION (Rule 7)
 * -----------------------
 * runSelfCertification() exercises this engine against known-good and
 * known-bad manifests and returns a pass/fail report. Run it once at
 * load time in development; treat a failing certification as a reason
 * to NOT wire this engine into Bootstrap.
 * =============================================================================
 */

'use strict';

// -----------------------------------------------------------------------------
// Configuration — what this kernel build supports
// -----------------------------------------------------------------------------

// The major API version this kernel accepts. Services declaring an
// apiVersion outside this major line are rejected. Adjustable via
// setSupportedApiMajorVersion() if the platform intentionally supports
// more than one major line at once (e.g. during a migration window).
let supportedApiMajorVersions = [1];

function setSupportedApiMajorVersions(versions) {
  if (!Array.isArray(versions) || versions.some((v) => typeof v !== 'number')) {
    throw new Error('[Compatibility] setSupportedApiMajorVersions requires an array of numbers.');
  }
  supportedApiMajorVersions = [...versions];
}

// -----------------------------------------------------------------------------
// Semver-lite comparison (no external dependency — kernel modules stay
// dependency-free per the zero-logic/frozen-object convention)
// -----------------------------------------------------------------------------

function parseVersion(version) {
  if (typeof version !== 'string') return null;
  const match = version.trim().match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

/**
 * Returns -1 if a < b, 0 if equal, 1 if a > b. Returns null if either
 * version string is unparseable.
 */
function compareVersions(a, b) {
  const va = parseVersion(a);
  const vb = parseVersion(b);
  if (!va || !vb) return null;
  if (va.major !== vb.major) return va.major < vb.major ? -1 : 1;
  if (va.minor !== vb.minor) return va.minor < vb.minor ? -1 : 1;
  if (va.patch !== vb.patch) return va.patch < vb.patch ? -1 : 1;
  return 0;
}

// -----------------------------------------------------------------------------
// Public API — the one decision this engine makes
// -----------------------------------------------------------------------------

/**
 * @param {object} manifest - Service Manifest from Bootstrap (already
 *   shape-validated).
 * @param {object} context
 * @param {string} context.kernelVersion - The running kernel's version.
 * @returns {{ compatible: boolean, reason?: string, checks: object }}
 */
function check(manifest, context) {
  const checks = {};

  const kernelVersion = context?.kernelVersion;
  if (!kernelVersion || !parseVersion(kernelVersion)) {
    return {
      compatible: false,
      reason: `Compatibility check cannot run: invalid kernel version supplied ("${kernelVersion}").`,
      checks
    };
  }

  // Check 1: minKernelVersion
  if (manifest.minKernelVersion) {
    if (!parseVersion(manifest.minKernelVersion)) {
      checks.minKernelVersion = { pass: false, detail: `Unparseable minKernelVersion: "${manifest.minKernelVersion}"` };
      return { compatible: false, reason: checks.minKernelVersion.detail, checks };
    }
    const cmp = compareVersions(kernelVersion, manifest.minKernelVersion);
    const pass = cmp !== null && cmp >= 0;
    checks.minKernelVersion = {
      pass,
      detail: pass
        ? `Kernel ${kernelVersion} satisfies required minimum ${manifest.minKernelVersion}.`
        : `Kernel ${kernelVersion} is older than required minimum ${manifest.minKernelVersion}.`
    };
    if (!pass) return { compatible: false, reason: checks.minKernelVersion.detail, checks };
  } else {
    checks.minKernelVersion = { pass: true, detail: 'No minKernelVersion declared — skipped.' };
  }

  // Check 2: apiVersion major line
  if (manifest.apiVersion) {
    const parsed = parseVersion(manifest.apiVersion);
    if (!parsed) {
      checks.apiVersion = { pass: false, detail: `Unparseable apiVersion: "${manifest.apiVersion}"` };
      return { compatible: false, reason: checks.apiVersion.detail, checks };
    }
    const pass = supportedApiMajorVersions.includes(parsed.major);
    checks.apiVersion = {
      pass,
      detail: pass
        ? `apiVersion ${manifest.apiVersion} is within supported major line(s) [${supportedApiMajorVersions.join(', ')}].`
        : `apiVersion ${manifest.apiVersion} (major ${parsed.major}) is not in supported major line(s) [${supportedApiMajorVersions.join(', ')}].`
    };
    if (!pass) return { compatible: false, reason: checks.apiVersion.detail, checks };
  } else {
    checks.apiVersion = { pass: true, detail: 'No apiVersion declared — skipped.' };
  }

  return { compatible: true, checks };
}

// -----------------------------------------------------------------------------
// Certification (Rule 7)
// -----------------------------------------------------------------------------

function runSelfCertification() {
  const results = [];
  const kernelVersion = '1.0.0';

  const cases = [
    {
      name: 'compatible: no version constraints declared',
      manifest: { name: 'svc-a' },
      expectCompatible: true
    },
    {
      name: 'compatible: minKernelVersion satisfied',
      manifest: { name: 'svc-b', minKernelVersion: '1.0.0' },
      expectCompatible: true
    },
    {
      name: 'incompatible: minKernelVersion too high',
      manifest: { name: 'svc-c', minKernelVersion: '2.0.0' },
      expectCompatible: false
    },
    {
      name: 'compatible: apiVersion in supported major line',
      manifest: { name: 'svc-d', apiVersion: '1.4.0' },
      expectCompatible: true
    },
    {
      name: 'incompatible: apiVersion major mismatch',
      manifest: { name: 'svc-e', apiVersion: '2.0.0' },
      expectCompatible: false
    },
    {
      name: 'incompatible: unparseable minKernelVersion',
      manifest: { name: 'svc-f', minKernelVersion: 'not-a-version' },
      expectCompatible: false
    }
  ];

  for (const testCase of cases) {
    const result = check(testCase.manifest, { kernelVersion });
    const pass = result.compatible === testCase.expectCompatible;
    results.push({
      name: testCase.name,
      pass,
      expected: testCase.expectCompatible,
      actual: result.compatible,
      reason: result.reason || null
    });
  }

  const allPassed = results.every((r) => r.pass);
  return Object.freeze({
    certified: allPassed,
    totalCases: results.length,
    passedCases: results.filter((r) => r.pass).length,
    results
  });
}

// -----------------------------------------------------------------------------
// Diagnostics (Rule 13)
// -----------------------------------------------------------------------------

function getDiagnostics() {
  return Object.freeze({
    supportedApiMajorVersions: [...supportedApiMajorVersions]
  });
}

// -----------------------------------------------------------------------------
// Frozen public surface
// -----------------------------------------------------------------------------

const Compatibility = Object.freeze({
  check,
  setSupportedApiMajorVersions,
  runSelfCertification,
  getDiagnostics,
  // exposed for reuse by other engines that need version comparison
  // without duplicating this logic (Rule 2)
  compareVersions,
  parseVersion
});

export default Compatibility;
