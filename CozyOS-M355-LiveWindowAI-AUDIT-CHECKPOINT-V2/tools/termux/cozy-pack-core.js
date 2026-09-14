/**
 * tools/termux/cozy-pack-core.js
 * RP-035 COS-LANG-PM-001 — reusable core for the Termux Pack-Management CLI
 *
 * WHAT THIS IS
 *   The real, testable implementation behind cozy-pack.js: real filesystem
 *   checks, real SHA-256 hashing, real `df`/`zip`/`unzip` shell-outs, and
 *   the storage/export/verify/import command logic. This module contains
 *   NO CLI argument parsing and NO `require('./cozy-pack.js')` — it is a
 *   leaf module so that both the CLI entrypoint (cozy-pack.js) and the test
 *   suite (tests/cozy-pack.test.js) can depend on it directly without ever
 *   forming a circular require.
 *
 * HONESTY CONTRACT (unchanged from cozy-pack.js)
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
 */
"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

const format = require("../../core/modules/intelligence/language-packs/storage/cozy-language-pack-format.js");

const SD_SUBDIRS = ["language-packs", "memory/user", "memory/owner", "memory/teaching", "memory/corrections", "memory/knowledge", "backups", "imports", "exports", "manifests", "logs"];

function sha256File(filePath) {
    const buf = fs.readFileSync(filePath);
    return crypto.createHash("sha256").update(buf).digest("hex");
}

function sha256FileTwice(filePath) {
    const first = sha256File(filePath);
    const second = sha256File(filePath);
    return { first, second, matched: first === second, hash: first };
}

/**
 * checkPathCapability(root)
 *   Real filesystem checks. No capability is ever reported without
 *   actually attempting the corresponding fs operation.
 */
function checkPathCapability(root) {
    const result = { root, exists: false, readable: false, writable: false, isDirectory: false };
    try {
        const st = fs.statSync(root);
        result.exists = true;
        result.isDirectory = st.isDirectory();
    } catch (_err) {
        return result;
    }
    try {
        fs.accessSync(root, fs.constants.R_OK);
        result.readable = true;
    } catch (_err) { /* honestly false */ }
    try {
        fs.accessSync(root, fs.constants.W_OK);
        result.writable = true;
    } catch (_err) { /* honestly false */ }
    return result;
}

/**
 * getDiskSpace(root)
 *   Shells out to the real `df -k` command. Returns UNKNOWN (never an
 *   estimated number) if df is unavailable or output can't be parsed.
 */
function getDiskSpace(root) {
    try {
        const out = execFileSync("df", ["-k", root], { encoding: "utf8" });
        const lines = out.trim().split("\n");
        const last = lines[lines.length - 1].trim().split(/\s+/);
        // Typical df -k columns: Filesystem 1K-blocks Used Available Use% Mounted
        const totalKb = parseInt(last[1], 10);
        const usedKb = parseInt(last[2], 10);
        const availKb = parseInt(last[3], 10);
        if ([totalKb, usedKb, availKb].some((n) => Number.isNaN(n))) {
            return { state: "UNKNOWN", reason: "UNPARSEABLE_DF_OUTPUT" };
        }
        return {
            state: "AVAILABLE",
            totalBytes: totalKb * 1024,
            usedBytes: usedKb * 1024,
            freeBytes: availKb * 1024
        };
    } catch (err) {
        return { state: "UNKNOWN", reason: `df command failed or unavailable: ${err.message}` };
    }
}

function requireRoot(args) {
    if (!args.root) { fail("--root <CozyOS SD root path> is required"); return null; }
    return args.root;
}

function fail(msg) {
    console.log(JSON.stringify({ ok: false, reason: msg }, null, 2));
    process.exitCode = 1;
}

async function cmdStorageStatus(args) {
    const root = requireRoot(args);
    const cap = checkPathCapability(root);
    const status = cap.exists && cap.isDirectory && cap.readable && cap.writable ? "READY" : (cap.exists ? "STORAGE_PERMISSION_REQUIRED" : "STORAGE_UNAVAILABLE");
    console.log(JSON.stringify({ command: "storage-status", status, capability: cap }, null, 2));
}

async function cmdInitStorage(args) {
    const root = requireRoot(args);
    const cap = checkPathCapability(root);
    if (!cap.exists) {
        console.log(JSON.stringify({ command: "init-storage", ok: false, reason: "ROOT_PATH_DOES_NOT_EXIST", root }, null, 2));
        process.exitCode = 1;
        return;
    }
    if (!cap.readable || !cap.writable) {
        console.log(JSON.stringify({ command: "init-storage", ok: false, reason: "ROOT_PATH_NOT_READABLE_OR_WRITABLE", capability: cap }, null, 2));
        process.exitCode = 1;
        return;
    }
    const created = [];
    for (const sub of SD_SUBDIRS) {
        const full = path.join(root, sub);
        if (!fs.existsSync(full)) {
            fs.mkdirSync(full, { recursive: true });
            created.push(sub);
        }
    }
    const space = getDiskSpace(root);
    console.log(JSON.stringify({ command: "init-storage", ok: true, root, createdDirs: created, space, verifiedAt: new Date().toISOString() }, null, 2));
}

async function cmdStorageHealth(args) {
    const root = requireRoot(args);
    const cap = checkPathCapability(root);
    const space = cap.exists ? getDiskSpace(root) : { state: "UNKNOWN", reason: "ROOT_DOES_NOT_EXIST" };
    console.log(JSON.stringify({
        command: "storage-health",
        provider: "SD_CARD",
        status: cap.exists && cap.readable && cap.writable ? "READY" : "STORAGE_UNAVAILABLE",
        readable: cap.readable,
        writable: cap.writable,
        root,
        totalBytes: space.totalBytes ?? null,
        freeBytes: space.freeBytes ?? null,
        usedBytes: space.usedBytes ?? null,
        spaceState: space.state,
        verifiedAt: new Date().toISOString()
    }, null, 2));
}

async function cmdList(args) {
    const root = requireRoot(args);
    const packsDir = path.join(root, "language-packs");
    if (!fs.existsSync(packsDir)) {
        console.log(JSON.stringify({ command: "list", ok: false, reason: "LANGUAGE_PACKS_DIR_NOT_INITIALIZED" }, null, 2));
        return;
    }
    const entries = fs.readdirSync(packsDir).filter((e) => !e.startsWith("."));
    console.log(JSON.stringify({ command: "list", ok: true, root: packsDir, packs: entries }, null, 2));
}

async function cmdHash(args) {
    const file = args.file;
    if (!file) return fail("--file is required");
    if (!fs.existsSync(file)) return fail(`File not found: ${file}`);
    const result = sha256FileTwice(file);
    console.log(JSON.stringify({ command: "hash", file, sha256: result.hash, run1: result.first, run2: result.second, matched: result.matched }, null, 2));
    if (!result.matched) process.exitCode = 1;
}

/**
 * cmdExport({root, source, lang, version})
 *   `source` is a JSON file containing REAL records:
 *     { vocabulary: [...], translations: [...], phrases: [...],
 *       provenance: [...], corrections: [...], conflicts: [...],
 *       languageName, licenseState, resourceState }
 *   Never invents content — packages exactly what is in `source`.
 */
async function cmdExport(args) {
    const root = requireRoot(args);
    const lang = args.lang;
    if (!lang) return fail("--lang is required");
    if (!format.CANONICAL_IDENTITIES.includes(lang)) {
        console.log(JSON.stringify({ command: "export", ok: false, reason: "NOT_A_CANONICAL_IDENTITY", lang, canonical: format.CANONICAL_IDENTITIES }, null, 2));
        process.exitCode = 1;
        return;
    }
    const sourcePath = args.source;
    if (!sourcePath || !fs.existsSync(sourcePath)) return fail("--source <records.json> must exist");
    const source = JSON.parse(fs.readFileSync(sourcePath, "utf8"));

    const manifest = await format.buildManifest({
        packId: `pack-${lang}`,
        languageCode: lang,
        languageName: source.languageName || lang,
        source: "TERMUX_PACK_BUILDER",
        licenseState: source.licenseState || "LICENSE_UNKNOWN",
        resourceState: source.resourceState || "NOT_READY",
        version: args.version || "0.1.0",
        records: {
            vocabulary: source.vocabulary || [],
            translations: source.translations || [],
            phrases: source.phrases || [],
            provenance: source.provenance || [],
            corrections: source.corrections || [],
            conflicts: source.conflicts || []
        }
    });

    const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), "cozy-pack-export-"));
    const payload = {
        manifest,
        vocabulary: source.vocabulary || [],
        translations: source.translations || [],
        phrases: source.phrases || [],
        provenance: source.provenance || [],
        corrections: source.corrections || [],
        conflicts: source.conflicts || []
    };
    fs.writeFileSync(path.join(stagingDir, "manifest.json"), JSON.stringify(manifest, null, 2));
    fs.writeFileSync(path.join(stagingDir, "pack.json"), JSON.stringify(payload, null, 2));

    const exportsDir = path.join(root, "exports");
    fs.mkdirSync(exportsDir, { recursive: true });
    const zipName = format.packFileName(manifest).replace(/\.json$/, ".zip");
    const zipPath = path.join(exportsDir, zipName);
    if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

    try {
        execFileSync("zip", ["-j", "-q", zipPath, path.join(stagingDir, "manifest.json"), path.join(stagingDir, "pack.json")]);
    } catch (err) {
        console.log(JSON.stringify({ command: "export", ok: false, reason: "ZIP_COMMAND_FAILED", detail: err.message, note: "Termux requires 'pkg install zip'." }, null, 2));
        process.exitCode = 1;
        return;
    }

    const hashResult = sha256FileTwice(zipPath);
    let integrityOk = false;
    try {
        execFileSync("unzip", ["-t", zipPath]);
        integrityOk = true;
    } catch (_err) { /* reported below */ }

    console.log(JSON.stringify({
        command: "export", ok: true, zipPath, sha256: hashResult.hash, hashMatched: hashResult.matched,
        unzipTestPassed: integrityOk, recordCount: manifest.counts.recordCount, resourceState: manifest.resourceState
    }, null, 2));
}

/**
 * cmdVerify({file})
 *   Real unzip -t + manifest/content-hash verification. Never installs.
 */
async function cmdVerify(args) {
    const file = args.file;
    if (!file || !fs.existsSync(file)) return fail("--file <pack.zip> must exist");

    let integrityOk = false;
    try {
        execFileSync("unzip", ["-t", file]);
        integrityOk = true;
    } catch (err) {
        console.log(JSON.stringify({ command: "verify", result: "PACK_CORRUPTED", reason: "UNZIP_TEST_FAILED", detail: err.message }, null, 2));
        process.exitCode = 1;
        return;
    }

    const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), "cozy-pack-verify-"));
    try {
        execFileSync("unzip", ["-q", "-o", file, "-d", stagingDir]);
    } catch (err) {
        console.log(JSON.stringify({ command: "verify", result: "PACK_CORRUPTED", reason: "EXTRACT_FAILED", detail: err.message }, null, 2));
        process.exitCode = 1;
        return;
    }

    const manifestPath = path.join(stagingDir, "manifest.json");
    const packPath = path.join(stagingDir, "pack.json");
    if (!fs.existsSync(manifestPath) || !fs.existsSync(packPath)) {
        console.log(JSON.stringify({ command: "verify", result: "PACK_INCOMPLETE", reason: "MISSING_MANIFEST_OR_PACK_JSON" }, null, 2));
        process.exitCode = 1;
        return;
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const payload = JSON.parse(fs.readFileSync(packPath, "utf8"));
    const check = await format.verifyManifest(manifest, payload);

    console.log(JSON.stringify({ command: "verify", result: check.result, reason: check.reason || null, manifest: { packId: manifest.packId, languageCode: manifest.languageCode, resourceState: manifest.resourceState, recordCount: manifest.counts && manifest.counts.recordCount } }, null, 2));
    if (check.result !== "PACK_VERIFIED") process.exitCode = 1;
}

/**
 * cmdImport({root, file, lang})
 *   Stage -> verify -> verify identity -> commit (move into
 *   <root>/language-packs/Pack-XXX-lang/). Never partially installs.
 */
async function cmdImport(args) {
    const root = requireRoot(args);
    const file = args.file;
    const expectedLang = args.lang;
    if (!file || !fs.existsSync(file)) return fail("--file <pack.zip> must exist");

    try {
        execFileSync("unzip", ["-t", file]);
    } catch (err) {
        console.log(JSON.stringify({ command: "import", result: "PACK_CORRUPTED", reason: "UNZIP_TEST_FAILED" }, null, 2));
        process.exitCode = 1;
        return;
    }

    const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), "cozy-pack-import-"));
    execFileSync("unzip", ["-q", "-o", file, "-d", stagingDir]);

    const manifestPath = path.join(stagingDir, "manifest.json");
    const packPath = path.join(stagingDir, "pack.json");
    if (!fs.existsSync(manifestPath) || !fs.existsSync(packPath)) {
        console.log(JSON.stringify({ command: "import", result: "PACK_INCOMPLETE", reason: "MISSING_MANIFEST_OR_PACK_JSON" }, null, 2));
        process.exitCode = 1;
        return;
    }
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const payload = JSON.parse(fs.readFileSync(packPath, "utf8"));

    const contentCheck = await format.verifyManifest(manifest, payload);
    if (contentCheck.result !== "PACK_VERIFIED") {
        console.log(JSON.stringify({ command: "import", result: contentCheck.result, reason: contentCheck.reason || null }, null, 2));
        process.exitCode = 1;
        return;
    }
    if (expectedLang) {
        const idCheck = format.verifyIdentity(manifest, expectedLang);
        if (idCheck.result !== "PACK_VERIFIED") {
            console.log(JSON.stringify({ command: "import", result: "PACK_IDENTITY_MISMATCH", expected: idCheck.expected, actual: idCheck.actual }, null, 2));
            process.exitCode = 1;
            return;
        }
    }

    const destDirName = `Pack-${String(format.CANONICAL_IDENTITIES.indexOf(manifest.languageCode) + 1).padStart(3, "0")}-${manifest.languageCode}`;
    const destDir = path.join(root, "language-packs", destDirName);
    const alreadyExisted = fs.existsSync(destDir);
    fs.mkdirSync(destDir, { recursive: true });

    let duplicateImport = false;
    const destManifestPath = path.join(destDir, "manifest.json");
    if (fs.existsSync(destManifestPath)) {
        const existingManifest = JSON.parse(fs.readFileSync(destManifestPath, "utf8"));
        if (existingManifest.manifestHash === manifest.manifestHash) {
            duplicateImport = true; // idempotent: identical pack already installed
        }
    }

    if (!duplicateImport) {
        fs.copyFileSync(manifestPath, destManifestPath);
        fs.copyFileSync(packPath, path.join(destDir, "pack.json"));
    }

    console.log(JSON.stringify({
        command: "import", result: "PACK_VERIFIED", installed: !duplicateImport, duplicateImport,
        destDir, alreadyExisted, languageCode: manifest.languageCode, recordCount: manifest.counts.recordCount
    }, null, 2));
}

module.exports = {
    SD_SUBDIRS,
    sha256File, sha256FileTwice,
    checkPathCapability, getDiskSpace,
    requireRoot, fail,
    cmdStorageStatus, cmdInitStorage, cmdStorageHealth, cmdList, cmdHash, cmdExport, cmdVerify, cmdImport
};
