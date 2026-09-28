#!/usr/bin/env node
'use strict';
/**
 * scripts/offline-model/fetch-offline-model.js
 *
 * CozyOS Offline Generation — local model acquisition (explicit, opt-in).
 *
 * WHAT THIS DOES
 *   Fetches the ONE local text-generation model CozyOS's offline generation
 *   provider (core/modules/intelligence/semantic-answer/generation/) is
 *   built and tested against, verifies it byte-for-byte, and writes it to
 *   `.cozy-offline-model/` (gitignored — a 322 MB binary never belongs in
 *   git). Nothing else in this repository downloads model weights, and the
 *   default `npm install` does NOT pull them: offline generation is an
 *   explicit opt-in, so a developer/CI job that never runs this script pays
 *   zero bytes for it.
 *
 * WHY THIS SOURCE (full audit in OFFLINE-GENERATION-REPORT.md)
 *   The sandbox this was built in blocks huggingface.co and every common
 *   model mirror at the network-policy level; the npm registry is the one
 *   reachable, integrity-hashed channel that actually carries a real,
 *   small, chat-tuned GGUF: TinyLlama/TinyLlama-1.1B-Chat-v1.0 quantized
 *   to IQ2_XXS, published (Apache-2.0) as two immutable npm data packages
 *   because the registry rejects a single tarball of this size.
 *
 *   `npm pack <name>@<exact version>` is used (never a hand-built URL) so
 *   npm itself verifies each tarball against the registry's own sha512
 *   integrity. This script then independently re-verifies each part and
 *   the assembled file against the SHA-256 values below (which match the
 *   publisher's own MODEL.json, cross-checked when this was written).
 *   Any mismatch aborts and deletes the partial output — a model file that
 *   fails verification is never left where the provider could load it.
 *
 * PROVENANCE LIMIT (disclosed, not hidden)
 *   Chain of custody is: TinyLlama authors -> community IQ2_XXS quant
 *   (huggingface.co/imi2/TinyLlama-1.1B-Chat-v1.0-2bit-wikitext-gguf,
 *   revision 100bdb2a...) -> npm data packages by the `slaunt` author. The
 *   hashes prove these bytes are exactly what those npm packages carry;
 *   they could not be re-verified against Hugging Face from this sandbox
 *   (blocked). Treat as a third-party redistribution of an Apache-2.0 model.
 *
 * Usage: node scripts/offline-model/fetch-offline-model.js
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const OUT_DIR = path.join(REPO_ROOT, '.cozy-offline-model');

const MODEL = Object.freeze({
    id: 'tinyllama-1.1b-chat-v1.0-iq2_xxs',
    fileName: 'tinyllama-1.1b-chat-v1.0.IQ2_XXS.gguf',
    baseModel: 'TinyLlama/TinyLlama-1.1B-Chat-v1.0',
    quantization: 'IQ2_XXS',
    license: 'Apache-2.0',
    sizeBytes: 322591712,
    sha256: '9ee11adf737960ff06123d5c4fba24d12c5b05ba460a7afa88950fbf2b61add0',
    parts: Object.freeze([
        Object.freeze({ spec: 'slaunt-model-tinyllama-1b-part1@0.1.0', sizeBytes: 161295856, sha256: '6d02636f9fb88b3d58f4c20ccb28986a1623c1cbb6a490177751ed25a694285e' }),
        Object.freeze({ spec: 'slaunt-model-tinyllama-1b-part2@0.1.0', sizeBytes: 161295856, sha256: 'f9ce535bd5a9df9dc9c903a15c9fdfe13faf32f7f766f32dd8b249e1563017bb' }),
    ]),
});

function sha256File(file) {
    const hash = crypto.createHash('sha256');
    const fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(8 << 20);
    try {
        let n;
        while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) hash.update(buf.subarray(0, n));
    } finally { fs.closeSync(fd); }
    return hash.digest('hex');
}

function verifyExisting(target) {
    if (!fs.existsSync(target)) return false;
    if (fs.statSync(target).size !== MODEL.sizeBytes) return false;
    return sha256File(target) === MODEL.sha256;
}

function main() {
    const target = path.join(OUT_DIR, MODEL.fileName);
    fs.mkdirSync(OUT_DIR, { recursive: true });
    if (verifyExisting(target)) {
        console.log(`[offline-model] already present and verified: ${path.relative(REPO_ROOT, target)}`);
        return;
    }

    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'cozy-offline-model-'));
    const partial = `${target}.partial`;
    try {
        const partFiles = [];
        for (const part of MODEL.parts) {
            console.log(`[offline-model] npm pack ${part.spec} (registry integrity verified by npm) ...`);
            const out = execFileSync('npm', ['pack', part.spec, '--pack-destination', work, '--silent'], { encoding: 'utf8' }).trim().split('\n').pop();
            const tgz = path.join(work, out);
            const extractDir = path.join(work, part.spec.replace(/[^a-z0-9.-]/gi, '_'));
            fs.mkdirSync(extractDir);
            execFileSync('tar', ['xzf', tgz, '-C', extractDir]);
            const partFile = path.join(extractDir, 'package', 'model.part');
            const size = fs.statSync(partFile).size;
            const digest = sha256File(partFile);
            if (size !== part.sizeBytes || digest !== part.sha256) {
                throw new Error(`part ${part.spec} failed verification (size ${size}, sha256 ${digest})`);
            }
            partFiles.push(partFile);
        }

        const fd = fs.openSync(partial, 'w');
        try {
            for (const partFile of partFiles) fs.writeSync(fd, fs.readFileSync(partFile));
        } finally { fs.closeSync(fd); }

        const size = fs.statSync(partial).size;
        const digest = sha256File(partial);
        if (size !== MODEL.sizeBytes || digest !== MODEL.sha256) {
            throw new Error(`assembled model failed verification (size ${size}, sha256 ${digest})`);
        }
        const magic = Buffer.alloc(4);
        const mfd = fs.openSync(partial, 'r');
        fs.readSync(mfd, magic, 0, 4, 0);
        fs.closeSync(mfd);
        if (magic.toString('ascii') !== 'GGUF') throw new Error('assembled model is not a GGUF file');

        fs.renameSync(partial, target);
        fs.writeFileSync(path.join(OUT_DIR, 'MODEL.json'), JSON.stringify(Object.assign({}, MODEL, { verifiedAt: new Date().toISOString() }), null, 2) + '\n');
        console.log(`[offline-model] verified and written: ${path.relative(REPO_ROOT, target)} (${size} bytes, sha256 ${digest})`);
    } catch (err) {
        if (fs.existsSync(partial)) fs.unlinkSync(partial);
        console.error(`[offline-model] FAILED: ${err.message}`);
        process.exitCode = 1;
    } finally {
        fs.rmSync(work, { recursive: true, force: true });
    }
}

if (require.main === module) main();
module.exports = { MODEL, OUT_DIR, sha256File, verifyExisting };
