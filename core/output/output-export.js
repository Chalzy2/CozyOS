/**
 * CozyOS Output Center — Export
 * File Reference: core/output/output-export.js
 * Layer: Core / Platform Foundation — Shared Platform Service
 * Version: 1.0.0-ENTERPRISE
 *
 * RESPONSIBILITY
 *   Real ZIP export for one or more real artifacts. `createZipStore()`
 *   below is copied verbatim from Developer Hub's own implementation —
 *   not reimplemented — because that exact function was already
 *   independently verified against the real system `unzip` utility
 *   (byte-correct extraction, nested folder paths preserved). Copying a
 *   working, already-tested implementation carries far less risk than
 *   writing a second one that merely looks equivalent.
 */
(function () {
    "use strict";

    window.CozyOS = window.CozyOS || {};
    const OUTPUT_EXPORT_VERSION = "1.0.0-ENTERPRISE";

    // Copied verbatim from developer-hub.js's real, independently-verified
    // implementation (Rule 52) — see that file's own header for the
    // original verification story. Not reimplemented here.
    function createZipStore(files) {
        function crc32(bytes) {
            if (!crc32.table) {
                const table = new Uint32Array(256);
                for (let n = 0; n < 256; n++) {
                    let c = n;
                    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
                    table[n] = c >>> 0;
                }
                crc32.table = table;
            }
            let crc = 0xFFFFFFFF;
            for (let i = 0; i < bytes.length; i++) crc = crc32.table[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
            return (crc ^ 0xFFFFFFFF) >>> 0;
        }
        function dosDateTime(date) {
            const time = ((date.getHours() & 0x1F) << 11) | ((date.getMinutes() & 0x3F) << 5) | ((date.getSeconds() >> 1) & 0x1F);
            const dosDate = (((date.getFullYear() - 1980) & 0x7F) << 9) | (((date.getMonth() + 1) & 0xF) << 5) | (date.getDate() & 0x1F);
            return { time, dosDate };
        }
        function writeUInt16LE(arr, offset, value) { arr[offset] = value & 0xFF; arr[offset + 1] = (value >>> 8) & 0xFF; }
        function writeUInt32LE(arr, offset, value) { arr[offset] = value & 0xFF; arr[offset + 1] = (value >>> 8) & 0xFF; arr[offset + 2] = (value >>> 16) & 0xFF; arr[offset + 3] = (value >>> 24) & 0xFF; }

        const encoder = new TextEncoder();
        const localParts = [];
        const centralParts = [];
        let offset = 0;
        const { time, dosDate } = dosDateTime(new Date());

        for (const { name, content } of files) {
            const nameBytes = encoder.encode(name);
            const contentBytes = typeof content === "string" ? encoder.encode(content) : new Uint8Array(content);
            const crc = crc32(contentBytes);

            const localHeader = new Uint8Array(30);
            writeUInt32LE(localHeader, 0, 0x04034b50);
            writeUInt16LE(localHeader, 4, 20);
            writeUInt16LE(localHeader, 6, 0);
            writeUInt16LE(localHeader, 8, 0);
            writeUInt16LE(localHeader, 10, time);
            writeUInt16LE(localHeader, 12, dosDate);
            writeUInt32LE(localHeader, 14, crc);
            writeUInt32LE(localHeader, 18, contentBytes.length);
            writeUInt32LE(localHeader, 22, contentBytes.length);
            writeUInt16LE(localHeader, 26, nameBytes.length);
            writeUInt16LE(localHeader, 28, 0);
            localParts.push(localHeader, nameBytes, contentBytes);

            const centralHeader = new Uint8Array(46);
            writeUInt32LE(centralHeader, 0, 0x02014b50);
            writeUInt16LE(centralHeader, 4, 20);
            writeUInt16LE(centralHeader, 6, 20);
            writeUInt16LE(centralHeader, 8, 0);
            writeUInt16LE(centralHeader, 10, 0);
            writeUInt16LE(centralHeader, 12, time);
            writeUInt16LE(centralHeader, 14, dosDate);
            writeUInt32LE(centralHeader, 16, crc);
            writeUInt32LE(centralHeader, 20, contentBytes.length);
            writeUInt32LE(centralHeader, 24, contentBytes.length);
            writeUInt16LE(centralHeader, 28, nameBytes.length);
            writeUInt32LE(centralHeader, 42, offset);
            centralParts.push(centralHeader, nameBytes);
            offset += localHeader.length + nameBytes.length + contentBytes.length;
        }

        const centralDirStart = offset;
        const centralDirSize = centralParts.reduce((sum, b) => sum + b.length, 0);
        const eocd = new Uint8Array(22);
        writeUInt32LE(eocd, 0, 0x06054b50);
        writeUInt16LE(eocd, 8, files.length);
        writeUInt16LE(eocd, 10, files.length);
        writeUInt32LE(eocd, 12, centralDirSize);
        writeUInt32LE(eocd, 16, centralDirStart);

        const all = [...localParts, ...centralParts, eocd];
        const totalLength = all.reduce((sum, b) => sum + b.length, 0);
        const result = new Uint8Array(totalLength);
        let pos = 0;
        for (const part of all) { result.set(part, pos); pos += part.length; }
        return result;
    }

    class CozyOutputExport {
        getVersion() { return OUTPUT_EXPORT_VERSION; }

        /**
         * exportArtifactsAsZip(artifactIds)
         *   Real — fetches each real artifact from OutputCenter, wraps
         *   non-binary ones in a real ZIP via the verified writer above.
         *   Binary artifacts (already a Blob/Uint8Array, e.g. an existing
         *   .zip) are skipped with a real, disclosed reason rather than
         *   double-wrapped in a second layer of compression.
         */
        exportArtifactsAsZip(artifactIds) {
            const outputCenter = window.CozyOS.OutputCenter;
            if (!outputCenter) return { success: false, reason: "OutputCenter is not loaded." };
            const artifacts = artifactIds.map(id => outputCenter.get(id)).filter(Boolean);
            const exportable = artifacts.filter(a => !a.isBinary);
            const skipped = artifacts.filter(a => a.isBinary).map(a => a.name);
            if (exportable.length === 0) return { success: false, reason: "No exportable (non-binary) artifacts among the given ids.", skipped };
            try {
                const zipBytes = createZipStore(exportable.map(a => ({ name: a.name, content: a.content })));
                const events = window.CozyOS.OutputEvents;
                if (events) exportable.forEach(a => events.emit("artifact-exported", { artifactId: a.artifactId, name: a.name }));
                return { success: true, zipBytes, skipped };
            } catch (err) {
                return { success: false, reason: err.message };
            }
        }
    }

    if (window.CozyOS.OutputExport && typeof window.CozyOS.OutputExport.getVersion === "function") {
        const existingVersion = window.CozyOS.OutputExport.getVersion();
        if (existingVersion !== OUTPUT_EXPORT_VERSION) throw new Error(`[CozyOS] VERSION_CONFLICT: OutputExport existing v${existingVersion} conflicts with load target v${OUTPUT_EXPORT_VERSION}.`);
        return;
    }

    window.CozyOS.OutputExport = new CozyOutputExport();
})();
