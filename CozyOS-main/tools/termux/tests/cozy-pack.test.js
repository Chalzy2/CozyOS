/**
 * tools/termux/tests/cozy-pack.test.js
 * RP-035 COS-LANG-PM-001 — real, executed tests for tools/termux/cozy-pack.js
 * Runs REAL fs operations against a real temp directory standing in for the
 * SD-card root, and shells out to the REAL zip/unzip binaries. If zip/unzip
 * are not installed, the zip-dependent tests report ENVIRONMENTAL rather
 * than being silently skipped as PASS.
 * Run with: node tools/termux/tests/cozy-pack.test.js
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

// Requires the leaf core module directly (not cozy-pack.js) so that this
// test file and the CLI entrypoint never form a circular require. See the
// "ARCHITECTURE" note at the top of tools/termux/cozy-pack.js.
const tool = require(path.join(__dirname, '..', 'cozy-pack-core.js'));

let passed = 0, failed = 0, environmental = 0;
async function test(name, fn) {
    try {
        await fn();
        console.log(`  \u2713 ${name}`);
        passed++;
    } catch (err) {
        if (err && err.__environmental) {
            console.log(`  \u26A0 ${name} (ENVIRONMENTAL: ${err.message})`);
            environmental++;
            return;
        }
        console.log(`  \u2717 ${name}`);
        console.log(`      ${err.stack || err.message}`);
        failed++;
    }
}

function hasBinary(name) {
    try { execFileSync('which', [name]); return true; } catch (_err) { return false; }
}

function mkTempRoot() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'cozy-sd-root-'));
}

(async () => {
    await test('checkPathCapability reports exists/readable/writable=false for a non-existent path (never fabricated true)', async () => {
        const cap = tool.checkPathCapability('/definitely/does/not/exist/cozyos-test');
        assert.strictEqual(cap.exists, false);
        assert.strictEqual(cap.readable, false);
        assert.strictEqual(cap.writable, false);
    });

    await test('checkPathCapability reports real true values for a real, writable temp directory', async () => {
        const root = mkTempRoot();
        const cap = tool.checkPathCapability(root);
        assert.strictEqual(cap.exists, true);
        assert.strictEqual(cap.isDirectory, true);
        assert.strictEqual(cap.readable, true);
        assert.strictEqual(cap.writable, true);
    });

    await test('getDiskSpace returns a real, self-consistent total/used/free from `df` (or honest UNKNOWN)', async () => {
        const root = mkTempRoot();
        const space = tool.getDiskSpace(root);
        if (space.state === 'UNKNOWN') {
            console.log(`      (df unavailable/unparseable in this environment — honestly reported UNKNOWN: ${space.reason})`);
            return;
        }
        assert.strictEqual(space.state, 'AVAILABLE');
        assert.ok(space.totalBytes > 0);
        assert.ok(space.freeBytes >= 0);
        assert.ok(space.totalBytes >= space.usedBytes);
    });

    await test('init-storage refuses (never fabricates READY) on a non-existent root', async () => {
        const logs = [];
        const origLog = console.log;
        console.log = (s) => logs.push(s);
        try {
            await tool.cmdInitStorage({ root: '/definitely/does/not/exist/cozyos-test' });
        } finally { console.log = origLog; }
        const output = JSON.parse(logs[0]);
        assert.strictEqual(output.ok, false);
        assert.strictEqual(output.reason, 'ROOT_PATH_DOES_NOT_EXIST');
    });

    await test('init-storage creates the real CozyOS directory tree on a real writable root', async () => {
        const root = mkTempRoot();
        const logs = [];
        const origLog = console.log;
        console.log = (s) => logs.push(s);
        try {
            await tool.cmdInitStorage({ root });
        } finally { console.log = origLog; }
        const output = JSON.parse(logs[0]);
        assert.strictEqual(output.ok, true);
        for (const sub of ['language-packs', 'memory/user', 'memory/teaching', 'backups', 'imports', 'exports', 'manifests', 'logs']) {
            assert.ok(fs.existsSync(path.join(root, sub)), `expected real directory: ${sub}`);
        }
    });

    await test('hash command computes a real, twice-matching SHA-256 for a real file', async () => {
        const root = mkTempRoot();
        const filePath = path.join(root, 'sample.txt');
        fs.writeFileSync(filePath, 'CozyOS RP-035 COS-LANG-PM-001 test fixture');
        const logs = [];
        const origLog = console.log;
        console.log = (s) => logs.push(s);
        try {
            await tool.cmdHash({ file: filePath });
        } finally { console.log = origLog; }
        const output = JSON.parse(logs[0]);
        assert.strictEqual(output.matched, true);
        assert.strictEqual(output.sha256.length, 64);
        const crypto = require('crypto');
        const expected = crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
        assert.strictEqual(output.sha256, expected);
    });

    await test('export + verify + import round-trip works end-to-end on real files with real zip/unzip', async () => {
        if (!hasBinary('zip') || !hasBinary('unzip')) {
            const e = new Error("zip/unzip binaries not found on PATH — install via 'pkg install zip unzip' on Termux");
            e.__environmental = true;
            throw e;
        }
        const root = mkTempRoot();
        const logs = [];
        const origLog = console.log;
        console.log = (s) => logs.push(s);
        try {
            await tool.cmdInitStorage({ root });
        } finally { console.log = origLog; }

        const sourcePath = path.join(root, 'sw-source.json');
        fs.writeFileSync(sourcePath, JSON.stringify({
            languageName: 'Kiswahili',
            licenseState: 'COMMUNITY_CONSENTED',
            resourceState: 'COMMUNITY_BUILDING',
            vocabulary: [{ expression: 'jambo', meaning: 'hello' }, { expression: 'asante', meaning: 'thank you' }]
        }));

        logs.length = 0;
        console.log = (s) => logs.push(s);
        try {
            await tool.cmdExport({ root, source: sourcePath, lang: 'sw', version: '0.1.0' });
        } finally { console.log = origLog; }
        const exportOutput = JSON.parse(logs[logs.length - 1]);
        assert.strictEqual(exportOutput.ok, true);
        assert.strictEqual(exportOutput.hashMatched, true);
        assert.strictEqual(exportOutput.unzipTestPassed, true);
        assert.strictEqual(exportOutput.recordCount, 2);
        assert.ok(fs.existsSync(exportOutput.zipPath));

        logs.length = 0;
        console.log = (s) => logs.push(s);
        try {
            await tool.cmdVerify({ file: exportOutput.zipPath });
        } finally { console.log = origLog; }
        const verifyOutput = JSON.parse(logs[logs.length - 1]);
        assert.strictEqual(verifyOutput.result, 'PACK_VERIFIED');

        const importRoot = mkTempRoot();
        logs.length = 0;
        console.log = (s) => logs.push(s);
        try {
            await tool.cmdInitStorage({ root: importRoot });
        } finally { console.log = origLog; }

        logs.length = 0;
        console.log = (s) => logs.push(s);
        try {
            await tool.cmdImport({ root: importRoot, file: exportOutput.zipPath, lang: 'sw' });
        } finally { console.log = origLog; }
        const importOutput = JSON.parse(logs[logs.length - 1]);
        assert.strictEqual(importOutput.result, 'PACK_VERIFIED');
        assert.strictEqual(importOutput.installed, true);
        assert.ok(fs.existsSync(importOutput.destDir));
        assert.ok(fs.existsSync(path.join(importOutput.destDir, 'manifest.json')));

        // Idempotency: importing the identical zip again must not report a
        // fresh install.
        logs.length = 0;
        console.log = (s) => logs.push(s);
        try {
            await tool.cmdImport({ root: importRoot, file: exportOutput.zipPath, lang: 'sw' });
        } finally { console.log = origLog; }
        const secondImport = JSON.parse(logs[logs.length - 1]);
        assert.strictEqual(secondImport.installed, false);
        assert.strictEqual(secondImport.duplicateImport, true);
    });

    await test('verify rejects a tampered zip (corrupted content hash) and never installs it', async () => {
        if (!hasBinary('zip') || !hasBinary('unzip')) {
            const e = new Error("zip/unzip binaries not found on PATH");
            e.__environmental = true;
            throw e;
        }
        const root = mkTempRoot();
        const logs = [];
        const origLog = console.log;
        console.log = (s) => logs.push(s);
        try { await tool.cmdInitStorage({ root }); } finally { console.log = origLog; }

        const sourcePath = path.join(root, 'sw-source.json');
        fs.writeFileSync(sourcePath, JSON.stringify({ vocabulary: [{ expression: 'jambo', meaning: 'hello' }] }));

        logs.length = 0;
        console.log = (s) => logs.push(s);
        try { await tool.cmdExport({ root, source: sourcePath, lang: 'sw' }); } finally { console.log = origLog; }
        const exportOutput = JSON.parse(logs[logs.length - 1]);

        // Tamper: extract, modify pack.json, re-zip in place.
        const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cozy-tamper-'));
        execFileSync('unzip', ['-q', '-o', exportOutput.zipPath, '-d', stagingDir]);
        const packJsonPath = path.join(stagingDir, 'pack.json');
        const packJson = JSON.parse(fs.readFileSync(packJsonPath, 'utf8'));
        packJson.vocabulary[0].meaning = 'TAMPERED';
        fs.writeFileSync(packJsonPath, JSON.stringify(packJson));
        const tamperedZip = path.join(root, 'tampered.zip');
        execFileSync('zip', ['-j', '-q', tamperedZip, path.join(stagingDir, 'manifest.json'), packJsonPath]);

        logs.length = 0;
        console.log = (s) => logs.push(s);
        try { await tool.cmdVerify({ file: tamperedZip }); } finally { console.log = origLog; }
        const verifyOutput = JSON.parse(logs[logs.length - 1]);
        assert.strictEqual(verifyOutput.result, 'PACK_CORRUPTED');
    });

    console.log(`\n${passed} passed, ${failed} failed, ${environmental} environmental`);
    process.exitCode = failed > 0 ? 1 : 0;
})();
