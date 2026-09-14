#!/usr/bin/env node
/**
 * tools/termux/cozy-pack.js
 * RP-035 COS-LANG-PM-001 — Termux Pack-Management CLI
 *
 * WHAT THIS IS
 *   A real Node.js CLI, meant to run under Termux on the user's Realme
 *   Android phone, against a real filesystem path (the prepared SD card).
 *   This is the ONLY component in COS-LANG-PM-001 with genuine, direct
 *   filesystem access to the SD card — the in-app browser/PWA never claims
 *   this capability (see core/modules/intelligence/language-packs/storage/
 *   cozy-storage-provider.js's SD_CARD_DIRECT provider, which always
 *   reports STORAGE_UNAVAILABLE from the browser context).
 *
 * ARCHITECTURE
 *   All real logic (filesystem checks, hashing, disk-space, and the
 *   storage/export/verify/import commands) lives in the leaf module
 *   ./cozy-pack-core.js, which has no dependency on this file. This file
 *   is a thin CLI dispatcher: parse argv -> call the matching core
 *   function -> exit. The test suite (tests/cozy-pack.test.js) requires
 *   cozy-pack-core.js directly for the exact same reason: so that neither
 *   this file nor the tests ever form a circular require with each other.
 *
 * REQUIREMENTS (Termux)
 *   pkg install nodejs zip unzip coreutils
 *   Node's built-in 'crypto' and 'fs' modules provide real SHA-256 and
 *   real file I/O — no third-party npm packages are required. ZIP
 *   packaging shells out to the real `zip`/`unzip` binaries (installed via
 *   `pkg install zip unzip`) rather than a fabricated in-process zip.
 *
 * HONESTY CONTRACT
 *   - init-storage REFUSES to proceed if the path does not exist, is not
 *     readable, or is not writable. It never reports READY on a guess.
 *   - storage-health reports UNKNOWN (not an estimated number) if free/
 *     total space cannot be read from `df`.
 *   - verify NEVER installs a pack that fails checksum/identity/schema
 *     checks — it reports PACK_CORRUPTED / PACK_IDENTITY_MISMATCH /
 *     PACK_SCHEMA_UNSUPPORTED and stops.
 *   - No command in this file fabricates vocabulary content. export
 *     packages exactly the records found in the given source file; it
 *     does not invent any.
 *
 * USAGE
 *   node cozy-pack.js storage-status  --root /storage/XXXX-XXXX/CozyOS
 *   node cozy-pack.js init-storage    --root /storage/XXXX-XXXX/CozyOS
 *   node cozy-pack.js storage-health  --root /storage/XXXX-XXXX/CozyOS
 *   node cozy-pack.js list            --root /storage/XXXX-XXXX/CozyOS
 *   node cozy-pack.js hash            --file <path>
 *   node cozy-pack.js export          --root <root> --source <records.json> --lang sw
 *   node cozy-pack.js verify          --file <pack.zip>
 *   node cozy-pack.js import          --root <root> --file <pack.zip> --lang sw
 *   node cozy-pack.js test
 */
"use strict";

const path = require("path");
const { spawnSync } = require("child_process");

const core = require("./cozy-pack-core.js");

function parseArgs(argv) {
    const out = { _: [] };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a.startsWith("--")) {
            const key = a.slice(2);
            const val = (i + 1 < argv.length && !argv[i + 1].startsWith("--")) ? argv[++i] : true;
            out[key] = val;
        } else {
            out._.push(a);
        }
    }
    return out;
}

/**
 * runTests()
 *   Runs the real test suite (tests/cozy-pack.test.js) in its own child
 *   process with inherited stdio, rather than `require()`-ing it into this
 *   process. This is deliberate: it keeps the CLI process and the test
 *   process fully independent (no shared module cache, no possibility of
 *   a circular require between cozy-pack.js and the test file, no risk of
 *   a test's `process.exitCode` leaking into or being overwritten by the
 *   CLI's own exit code). The child's exit code is propagated unchanged.
 */
function runTests() {
    const testFile = path.join(__dirname, "tests", "cozy-pack.test.js");
    const result = spawnSync(process.execPath, [testFile], { stdio: "inherit" });
    if (result.error) throw result.error;
    process.exitCode = result.status === null ? 1 : result.status;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const command = args._[0];

    if (command === "test") {
        runTests();
        return;
    }

    const commands = {
        "storage-status": core.cmdStorageStatus,
        "init-storage": core.cmdInitStorage,
        "storage-health": core.cmdStorageHealth,
        "list": core.cmdList,
        "hash": core.cmdHash,
        "export": core.cmdExport,
        "verify": core.cmdVerify,
        "import": core.cmdImport
    };
    const fn = commands[command];
    if (!fn) {
        console.log("Unknown command. Usage: node cozy-pack.js <storage-status|init-storage|storage-health|list|hash|export|verify|import|test> [--flags]");
        process.exitCode = 1;
        return;
    }
    await fn(args);
}

if (require.main === module) {
    main();
}

// Re-exported from core for any external code that imports cozy-pack.js
// directly (backward compatible surface). cozy-pack-core.js is a leaf
// module with no require of this file, so this assignment introduces no
// circularity.
module.exports = {
    checkPathCapability: core.checkPathCapability,
    getDiskSpace: core.getDiskSpace,
    sha256File: core.sha256File,
    sha256FileTwice: core.sha256FileTwice,
    cmdStorageStatus: core.cmdStorageStatus,
    cmdInitStorage: core.cmdInitStorage,
    cmdStorageHealth: core.cmdStorageHealth,
    cmdList: core.cmdList,
    cmdHash: core.cmdHash,
    cmdExport: core.cmdExport,
    cmdVerify: core.cmdVerify,
    cmdImport: core.cmdImport
};
