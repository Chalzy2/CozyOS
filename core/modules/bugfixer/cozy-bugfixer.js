/**
 * CozyOS Enterprise Framework — CozyBugFixer
 * File Reference: core/modules/bugfixer/cozy-bugfixer.js
 * Layer: Core / Code Generation — Repair Engine
 * Version: 1.0.0-ENTERPRISE
 *
 * RESPONSIBILITY
 *   Repairs CozyOS source files — the smallest safe fix for a known,
 *   mechanically-fixable certification finding, never a full rewrite.
 *   Every repair is backed by a real backup, a hash-pair audit trail, and
 *   an append-only repair log. Nothing is ever saved without an explicit
 *   approval step unless the developer has turned on Auto Repair for that
 *   specific file, that specific session.
 *
 * WHAT THIS MODULE DOES NOT DO (Zero Logic Rule + explicit safety rules)
 *   - NEVER executes, evaluates, or imports the source it's repairing.
 *     No eval(), no new Function(), no dynamic <script> injection, no
 *     dynamic import(). Source is read and written as text, always.
 *   - NEVER re-implements certification's own rule engine. Findings come
 *     from CozyCertification.quickCertification() — this file only maps
 *     a small, curated subset of KNOWN rule IDs to a deterministic text
 *     transformation. Everything else is reported as "requires manual
 *     review," never guessed at.
 *   - NEVER reaches outside the sandbox. File access goes exclusively
 *     through the File System Access API's per-file handle model — this
 *     module cannot browse, list, or open any file the developer didn't
 *     explicitly grant a handle to via a picker. That's not a policy this
 *     file promises to follow; it's what the browser actually allows.
 *   - NEVER calls an external AI/network endpoint. If a real AI-assisted
 *     repair provider is wired in later (see setExternalRepairer below),
 *     this module still only *offers* a best-effort redaction pass over
 *     known secret-shaped patterns before handing anything to it — it
 *     does NOT claim or guarantee no secret reaches that provider. A file
 *     the developer knows contains secrets should not go through
 *     AI-assisted repair mode at all.
 *   - NEVER claims the hash pair it records is a cryptographic signature.
 *     It's a SHA-256 checksum pair (before/after) for tamper *detection*,
 *     not proof of authorship — that would require a private signing key
 *     this module does not hold. Documented as a checksum everywhere it
 *     appears, deliberately not called a "signature."
 *   - NEVER writes to a Protected File (see PROTECTED_FILE_PATTERNS)
 *     without an explicit, separate confirmation beyond the normal
 *     approval step.
 *
 * OPTIONAL INTEGRATIONS
 *   CozyCertification — real quickCertification()/getWorkspaceSummary()
 *                        calls for before/after scoring. Required for any
 *                        actual repair attempt (Analyze mode still works
 *                        without it, showing only the safety scan).
 *   WorkspaceShell     — file handles/metadata may be supplied by
 *                        Workspace's file registry, if connected; this
 *                        module also works with a directly-supplied
 *                        File System Access API handle or a bare source
 *                        string with no handle (download-only repair).
 *   ServiceRegistry    — registerCoordinator(), if present.
 */

(function () {
    "use strict";

    window.CozyOS = window.CozyOS || {};
    const BUGFIXER_VERSION = "1.0.0-ENTERPRISE";

    const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

    const APPROVED_EXTENSIONS = Object.freeze([".js", ".html", ".css", ".json", ".md"]);

    // Protected — writing to these requires enforcedProtectedOverride:true
    // AND passes through the same single write-gate as everything else.
    // Matched against the file's OWN name, not a full path (a file handle's
    // path isn't always available from the File System Access API).
    const PROTECTED_FILE_PATTERNS = Object.freeze([
        /^cozy-certification\.js$/i, /^cozy-workspace\.js$/i,
        /^cozy-identity\.js$/i, /^cozy-security\.js$/i, /^cozy-registry\.js$/i
    ]);

    // Patterns that stop a repair outright until a human reviews them —
    // the same "scan before repair" list from the design brief. This is a
    // SAFETY gate on the INCOMING file, not a certification rule engine.
    const SUSPICIOUS_PATTERNS = Object.freeze([
        { id: "EVAL_USAGE", pattern: /\beval\s*\(/, description: "Contains eval()." },
        { id: "FUNCTION_CTOR", pattern: /\bnew\s+Function\s*\(/, description: "Contains new Function()." },
        { id: "DOCUMENT_WRITE", pattern: /document\s*\.\s*write\s*\(/, description: "Uses the document.write DOM API — a raw HTML-sink pattern." },
        { id: "PROTO_POLLUTION_LITERAL", pattern: /__proto__\s*[:=]/, description: "Contains a literal __proto__ assignment/key." },
        { id: "HIDDEN_IFRAME", pattern: /<iframe[^>]*style\s*=\s*["'][^"']*display\s*:\s*none/i, description: "Contains a hidden (display:none) iframe." },
        { id: "SCRIPT_INJECTION", pattern: /document\s*\.\s*createElement\s*\(\s*["']script["']\s*\)/, description: "Dynamically creates a <script> element." }
    ]);

    // Best-effort secret-shape detection for the (optional, off-by-default)
    // external-repairer hand-off path. This is explicitly NOT a guarantee —
    // see the header note above.
    const SECRET_SHAPE_PATTERNS = Object.freeze([
        /sk-[A-Za-z0-9]{20,}/g,                          // common LLM/API key prefix
        /[A-Za-z0-9_-]{32,}/g,                            // long opaque tokens (broad, high false-positive rate by design — better to over-redact)
        /-----BEGIN [A-Z ]+PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+PRIVATE KEY-----/g,
        /(password|passwd|secret|api[_-]?key|token)\s*[:=]\s*["'][^"']{6,}["']/gi
    ]);

    // =========================================================================
    // ─── DETERMINISTIC, ADDITIVE-ONLY AUTO-FIXES ───────────────────────────────
    // Every function here is a pure TEXT insertion — never a rewrite of
    // existing lines. Each is independently safe: if the anchor pattern it
    // needs isn't found, it does nothing and reports "could not apply"
    // rather than guessing where to splice. This is the entire "smallest
    // safe fix" surface this module supports; anything not listed here is
    // always reported as requiring manual review.
    // =========================================================================

    const ESCAPE_HTML_SNIPPET = `        #escapeHtml(value) {
            const str = String(value === undefined || value === null ? "" : value);
            return str
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#39;");
        }
`;

    const DEEP_FREEZE_SNIPPET = `        #deepFreeze(obj) {
            if (obj && typeof obj === "object" && !Object.isFrozen(obj)) {
                Object.getOwnPropertyNames(obj).forEach((key) => this.#deepFreeze(obj[key]));
                Object.freeze(obj);
            }
            return obj;
        }
`;

    function findFirstClassBodyInsertionPoint(source) {
        // Insert right after the first "{" that opens a class body — a
        // deliberately narrow, conservative anchor. Returns -1 if no class
        // is found (this module never guesses at a fallback location).
        const m = /class\s+[A-Za-z0-9_$]+(?:\s+extends\s+[A-Za-z0-9_$.]+)?\s*\{/.exec(source);
        if (!m) return -1;
        return m.index + m[0].length;
    }

    function fixMissingEscapeHtml(source) {
        if (/#escapeHtml\s*\(/.test(source)) return { applied: false, reason: "Already present." };
        const at = findFirstClassBodyInsertionPoint(source);
        if (at === -1) return { applied: false, reason: "No class body found to insert into." };
        const newSource = source.slice(0, at) + "\n" + ESCAPE_HTML_SNIPPET + source.slice(at);
        return { applied: true, source: newSource, description: "Inserted #escapeHtml() helper (additive only; not wired into any existing render path)." };
    }

    function fixMissingDeepFreeze(source) {
        if (/#deepFreeze\s*\(/.test(source)) return { applied: false, reason: "Already present." };
        const at = findFirstClassBodyInsertionPoint(source);
        if (at === -1) return { applied: false, reason: "No class body found to insert into." };
        const newSource = source.slice(0, at) + "\n" + DEEP_FREEZE_SNIPPET + source.slice(at);
        return { applied: true, source: newSource, description: "Inserted #deepFreeze() helper (additive only)." };
    }

    function fixMissingForbiddenKeysConstant(source) {
        if (/FORBIDDEN_KEYS\s*=\s*new\s+Set/.test(source)) return { applied: false, reason: "Already present." };
        const m = /\(function\s*\(\s*\)\s*\{\s*["']use strict["'];/.exec(source);
        if (!m) return { applied: false, reason: "Could not find the IIFE + \"use strict\" anchor to insert after." };
        const at = m.index + m[0].length;
        const snippet = `\n\n    const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);\n    // NOTE (CozyBugFixer): this constant was inserted automatically because\n    // SEC-003 was missing. It is NOT yet wired into any merge/assignment\n    // path — that requires understanding this module's specific merge\n    // logic and is left for manual review (SEC-001 stays flagged).\n`;
        return { applied: true, source: source.slice(0, at) + snippet + source.slice(at), description: "Inserted FORBIDDEN_KEYS constant (declared only — wiring it into merge logic is left for manual review)." };
    }

    function fixMissingHeaderField(source, fieldLabel, fieldValue) {
        const fieldPattern = new RegExp(`^\\s*\\*\\s*${fieldLabel}:`, "m");
        if (fieldPattern.test(source)) return { applied: false, reason: "Already present." };
        const headerLineMatch = /^\s*\*\s*Version:.*$/m.exec(source) || /^\/\*\*[\s\S]*?\n \*\//.exec(source);
        if (!headerLineMatch) return { applied: false, reason: "No existing header block found to insert into." };
        const insertAt = headerLineMatch.index + headerLineMatch[0].length;
        const newLine = `\n * ${fieldLabel}: ${fieldValue}`;
        return { applied: true, source: source.slice(0, insertAt) + newLine + source.slice(insertAt), description: `Inserted missing header field "${fieldLabel}".` };
    }

    function fixUnboundedPush(source) {
        // Conservative: only touches a push statement that is NOT already
        // followed (within ~120 chars) by a ".length >" check, and only
        // inserts a cap-check line immediately after — never modifies the
        // push statement itself.
        const pushRegex = /this\.(#\w+)\.push\(([^;]*)\);/g;
        let match;
        let newSource = source;
        let appliedCount = 0;
        const applied = [];
        while ((match = pushRegex.exec(source)) !== null) {
            const fieldName = match[1];
            const lookahead = source.slice(match.index, match.index + 200);
            if (new RegExp(`${fieldName}\\.length\\s*>`).test(lookahead)) continue; // already capped
            const insertion = `\n            if (this.${fieldName}.length > 500) this.${fieldName}.shift();`;
            newSource = newSource.replace(match[0], match[0] + insertion);
            appliedCount++;
            applied.push(fieldName);
        }
        if (appliedCount === 0) return { applied: false, reason: "No unbounded push() statements found (or all already capped)." };
        return { applied: true, source: newSource, description: `Inserted a 500-item cap check after ${appliedCount} push() call(s) on: ${applied.join(", ")}.` };
    }

    // Rule ID -> deterministic fixer. Every entry here is genuinely additive
    // and independently safe; anything not in this map is reported as
    // "requires manual review" rather than attempted.
    const DETERMINISTIC_FIXERS = Object.freeze({
        "UI-001": (source) => fixMissingEscapeHtml(source),
        "ARCH-010": (source) => fixMissingDeepFreeze(source),
        "SEC-003": (source) => fixMissingForbiddenKeysConstant(source),
        "PERF-001": (source) => fixUnboundedPush(source),
        "DOC-002": (source) => fixMissingHeaderField(source, "Version", "1.0.0-ENTERPRISE"),
        "DOC-003": (source) => fixMissingHeaderField(source, "File Reference", "(fill in the correct path)"),
        "DOC-004": (source) => fixMissingHeaderField(source, "Layer", "(fill in — e.g. Core / Business Domain)")
    });

    /**
     * PATTERN_FIXER_OVERRIDES
     *   Phase 5 — the ONLY functions an Enterprise Pattern Library entry
     *   can ever cause to run here, keyed by applierId, never by an
     *   approved pattern's free-text description. When an ACTIVE pattern
     *   exists for a ruleId AND its applierId matches an entry here, it
     *   is preferred over DETERMINISTIC_FIXERS for that ruleId (letting
     *   an approved, possibly-improved fixer supersede the built-in one);
     *   otherwise the built-in fixer above is used exactly as before —
     *   this map starts empty and is meant to grow only as genuinely new,
     *   reviewed appliers are added here by a human, the same way
     *   DETERMINISTIC_FIXERS itself grows.
     */
    const PATTERN_FIXER_OVERRIDES = Object.freeze({});

    // =========================================================================
    // ─── UTILITIES ────────────────────────────────────────────────────────────
    // =========================================================================

    async function sha256Hex(text) {
        if (typeof crypto === "undefined" || !crypto.subtle) {
            throw new Error("[CozyBugFixer] crypto.subtle is unavailable in this environment — cannot compute a checksum.");
        }
        const data = new TextEncoder().encode(text);
        const digest = await crypto.subtle.digest("SHA-256", data);
        return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
    }

    function isApprovedExtension(filename) {
        return APPROVED_EXTENSIONS.some(ext => filename.toLowerCase().endsWith(ext));
    }

    function isProtectedFile(filename) {
        return PROTECTED_FILE_PATTERNS.some(pattern => pattern.test(filename));
    }

    function scanForSuspiciousPatterns(source) {
        return SUSPICIOUS_PATTERNS.filter(p => p.pattern.test(source)).map(p => ({ id: p.id, description: p.description }));
    }

    function redactSecretShapes(text) {
        let redacted = text;
        let redactionCount = 0;
        for (const pattern of SECRET_SHAPE_PATTERNS) {
            redacted = redacted.replace(pattern, () => { redactionCount++; return "[REDACTED-BY-COZYBUGFIXER]"; });
        }
        return { redacted, redactionCount };
    }

    class CozyOSBugFixerCoordinator {
        // ---- file registry: fileId -> { filename, handle (optional), lastSource, lastHash } ----
        #files = new Map();
        // ---- backups: fileId -> [{ backupId, source, hash, timestamp }] (append-only, bounded) ----
        #backups = new Map();
        // ---- repair log: append-only, bounded ----
        #repairLog = [];
        #auditLogs = [];
        #timelineEvents = [];
        #listeners = new Map();
        #onceWrapped = new Map();
        #autoRepairSessions = new Set(); // fileIds with Auto Repair enabled THIS session only
        #externalRepairer = null;

        #diagnostics = {
            filesRegistered: 0, repairsAttempted: 0, repairsApplied: 0, repairsRejected: 0,
            protectedFileBlocks: 0, suspiciousScanBlocks: 0, errorsHidden: 0, eventsEmitted: 0, memoryBaseline: 5.6
        };

        getVersion() { return BUGFIXER_VERSION; }

        /**
         * listDeterministicFixerRuleIds()
         *   The real, current keys of DETERMINISTIC_FIXERS — the ground
         *   truth for "which rule IDs can this coordinator actually apply
         *   automatically." Any external classification of a finding as
         *   "auto-fixable" (e.g. from an AI-generated audit report) should
         *   be checked against this list, never trusted on its own say-so.
         */
        listDeterministicFixerRuleIds() { return Object.keys(DETERMINISTIC_FIXERS); }

        /**
         * repairProject(files, { ruleIds, autoApprove })
         *   Phase 2 — BugFixer Project Mode. files is the same flat
         *   {path: content} shape ProjectRefactor's importFromZip()/
         *   buildProjectModel() produce — a genuinely separate feature
         *   from Builder's Project Mode (Phase 1), reusing only
         *   BugFixer's own existing single-file registerSourceText()/
         *   repair() path per real JS file, never a new repair engine.
         *
         *   Real guarantees:
         *   - Every original path is preserved in the output, whether or
         *     not it changed.
         *   - Only .js files are ever candidates for repair (matches
         *     DETERMINISTIC_FIXERS' actual scope — CSS/HTML/JSON/docs
         *     are never touched here).
         *   - A JS file with no applicable fixes comes back byte-
         *     identical to its input — never rewritten for its own sake.
         *   - autoApprove (default false) only controls whether changes
         *     are written into the returned project files map as a
         *     PREVIEW; it never touches Workspace/disk on its own —
         *     saving remains the caller's explicit action, same as the
         *     single-file path.
         */
        async repairProject(files, { ruleIds, autoApprove = false } = {}) {
            if (!files || typeof files !== "object") throw new TypeError("[CozyBugFixer] repairProject(): files must be a {path: content} object.");
            const resultFiles = {};
            const report = {};
            let modifiedCount = 0, unchangedCount = 0, skippedCount = 0;

            for (const [path, content] of Object.entries(files)) {
                if (!/\.js$/i.test(path)) {
                    resultFiles[path] = content; // non-JS files are never candidates for repair — preserved exactly
                    skippedCount++;
                    continue;
                }
                try {
                    const fileId = await this.registerSourceText(path, content);
                    const preview = this.repair(fileId, { ruleIds });
                    if (preview.changed) {
                        resultFiles[path] = preview.proposedSource;
                        report[path] = { changed: true, appliedFixes: preview.appliedFixes, skippedFixes: preview.skippedFixes };
                        modifiedCount++;
                    } else {
                        resultFiles[path] = content; // no applicable fix — byte-identical, never rewritten for its own sake
                        report[path] = { changed: false, appliedFixes: [], skippedFixes: preview.skippedFixes };
                        unchangedCount++;
                    }
                } catch (err) {
                    resultFiles[path] = content; // real failure to parse/repair this file — preserved exactly, never silently dropped
                    report[path] = { changed: false, error: err.message };
                    unchangedCount++;
                }
            }

            this.#logAudit("PROJECT_REPAIR_RUN", `${Object.keys(files).length} file(s): ${modifiedCount} modified, ${unchangedCount} unchanged, ${skippedCount} non-JS preserved as-is.`);
            return {
                files: resultFiles, report,
                fileCount: Object.keys(files).length, modifiedCount, unchangedCount, skippedCount,
                method: "reuses the existing single-file registerSourceText()/repair() path per real JS file — no separate repair engine"
            };
        }

        /**
         * #checkMemoryForPriorFixes(ruleIds)
         *   Memory Read Rule: searches CozyMemory's real "Builder"
         *   namespace repair history for the SAME rule IDs this repair is
         *   about to attempt — non-blocking, purely informational (the
         *   deterministic fixer still runs exactly as before regardless
         *   of what this finds). Returns an empty array when CozyMemory
         *   isn't connected or nothing real matches — never fabricated.
         */
        #checkMemoryForPriorFixes(ruleIds) {
            const mem = window.CozyOS.CozyMemory;
            if (!mem || typeof mem.searchMemory !== "function" || !ruleIds || ruleIds.length === 0) return [];
            const matchesByKey = new Map();
            for (const ruleId of ruleIds) {
                let results;
                try { results = mem.searchMemory("Builder", ruleId); } catch (_err) { continue; }
                for (const r of results.filter(r => r.key.startsWith("repair-"))) {
                    const existing = matchesByKey.get(r.key);
                    matchesByKey.set(r.key, { r, matchCount: (existing ? existing.matchCount : 0) + r.matchCount });
                }
            }
            return Array.from(matchesByKey.values())
                .sort((a, b) => b.matchCount - a.matchCount)
                .slice(0, 5)
                .map(({ r }) => ({
                    key: r.key, filename: r.entry.value.filename, rulesFixed: r.entry.value.rulesFixed,
                    scoreBefore: r.entry.value.certificationScoreBefore, scoreAfter: r.entry.value.certificationScoreAfter,
                    timestamp: r.entry.savedAt
                }));
        }

        #deepClone(value) {
            if (typeof structuredClone === "function") {
                try { return structuredClone(value); } catch (_err) { /* fall through */ }
            }
            try { return JSON.parse(JSON.stringify(value)); } catch (_err) { return value; }
        }

        #logAudit(action, msg) {
            this.#auditLogs.push(Object.freeze({ id: "aud_" + crypto.randomUUID(), timestamp: new Date().toISOString(), action, msg }));
            if (this.#auditLogs.length > 500) this.#auditLogs.shift();
        }

        #logTimeline(label) {
            this.#timelineEvents.push(Object.freeze({ time: new Date().toISOString(), label }));
            if (this.#timelineEvents.length > 500) this.#timelineEvents.shift();
        }

        getTimeline(predicate) {
            const list = this.#timelineEvents.map(e => this.#deepClone(e));
            return Object.freeze(predicate ? list.filter(predicate) : list);
        }

        getAuditLog(predicate) {
            const list = this.#auditLogs.map(e => this.#deepClone(e));
            return Object.freeze(predicate ? list.filter(predicate) : list);
        }

        on(eventName, handler) {
            if (typeof eventName !== "string" || !eventName.trim()) throw new TypeError("[CozyBugFixer] on(): eventName must be a non-empty string.");
            if (typeof handler !== "function") throw new TypeError("[CozyBugFixer] on(): handler must be a function.");
            if (!this.#listeners.has(eventName)) this.#listeners.set(eventName, new Set());
            this.#listeners.get(eventName).add(handler);
            return () => this.off(eventName, handler);
        }

        off(eventName, handler) {
            const set = this.#listeners.get(eventName);
            if (!set) return false;
            const wrapped = this.#onceWrapped.get(handler);
            const removed = set.delete(handler) || (wrapped ? set.delete(wrapped) : false);
            if (set.size === 0) this.#listeners.delete(eventName);
            return removed;
        }

        once(eventName, handler) {
            if (typeof handler !== "function") throw new TypeError("[CozyBugFixer] once(): handler must be a function.");
            const wrapper = (payload) => { this.off(eventName, handler); this.#onceWrapped.delete(handler); handler(payload); };
            this.#onceWrapped.set(handler, wrapper);
            this.on(eventName, wrapper);
        }

        emit(eventName, payload) {
            if (typeof eventName !== "string" || !eventName.trim()) { this.#diagnostics.errorsHidden++; return false; }
            const set = this.#listeners.get(eventName);
            this.#diagnostics.eventsEmitted++;
            if (!set || set.size === 0) return false;
            let safePayload = payload;
            try { safePayload = this.#deepClone(payload); } catch (_err) { safePayload = payload; }
            for (const fn of Array.from(set)) {
                try { fn(safePayload); } catch (_err) { this.#diagnostics.errorsHidden++; }
            }
            return true;
        }

        // =====================================================================
        // ─── FILE REGISTRATION (sandbox entry points) ────────────────────────
        // A file can only ever enter this module one of two ways: (1) a real
        // File System Access API handle the developer picked via a native
        // file/folder picker (this.#files then holds the ACTUAL handle — no
        // other path exists to reach that file), or (2) a bare source string
        // with no handle at all, in which case repair is download-only
        // (there's nothing on disk this module could overwrite even if it
        // wanted to). There is no third path, no folder browsing, no path
        // string that resolves to an arbitrary file.
        // =====================================================================

        /**
         * registerFileHandle(fileHandle)
         *   fileHandle: a real FileSystemFileHandle from
         *   window.showOpenFilePicker() (or a Workspace-provided handle).
         *   Rejects unapproved extensions and unreadable files outright.
         */
        async registerFileHandle(fileHandle) {
            if (!fileHandle || typeof fileHandle.getFile !== "function") {
                throw new TypeError("[CozyBugFixer] registerFileHandle(): a FileSystemFileHandle is required.");
            }
            const filename = fileHandle.name;
            if (!isApprovedExtension(filename)) {
                throw new Error(`[CozyBugFixer] Rejected: "${filename}" is not an approved file type (${APPROVED_EXTENSIONS.join(", ")}).`);
            }
            const file = await fileHandle.getFile();
            const source = await file.text();
            const hash = await sha256Hex(source);
            const fileId = "file_" + crypto.randomUUID();
            this.#files.set(fileId, Object.freeze({ fileId, filename, handle: fileHandle, lastSource: source, lastHash: hash, registeredAt: new Date().toISOString() }));
            this.#diagnostics.filesRegistered++;
            this.#logAudit("FILE_REGISTERED", `${filename} registered with a real file handle (id ${fileId}).`);
            this.#logTimeline(`Registered: ${filename}`);
            this.emit("file:registered", { fileId, filename, hasHandle: true });
            return fileId;
        }

        /**
         * registerSourceText(filename, source)
         *   No file handle — download-only repair. Useful for a file shared
         *   in from another CozyOS tool (e.g. "Share to CozyBugFixer" from
         *   Workspace) without a live disk handle.
         */
        async registerSourceText(filename, source) {
            if (!isApprovedExtension(filename)) {
                throw new Error(`[CozyBugFixer] Rejected: "${filename}" is not an approved file type (${APPROVED_EXTENSIONS.join(", ")}).`);
            }
            if (typeof source !== "string") throw new TypeError("[CozyBugFixer] registerSourceText(): source must be a string.");
            const hash = await sha256Hex(source);
            const fileId = "file_" + crypto.randomUUID();
            this.#files.set(fileId, Object.freeze({ fileId, filename, handle: null, lastSource: source, lastHash: hash, registeredAt: new Date().toISOString() }));
            this.#diagnostics.filesRegistered++;
            this.#logAudit("FILE_REGISTERED", `${filename} registered as text only, no disk handle (id ${fileId}).`);
            this.#logTimeline(`Registered (text-only): ${filename}`);
            this.emit("file:registered", { fileId, filename, hasHandle: false });
            return fileId;
        }

        getFile(fileId) {
            const record = this.#files.get(fileId);
            if (!record) return null;
            const { handle, ...rest } = record; // never leak the live handle out through a read
            return this.#deepClone(rest);
        }

        listFiles() {
            return Array.from(this.#files.values()).map(({ handle, ...rest }) => this.#deepClone(rest));
        }

        /** Auto Repair is scoped to one file, one session — never a persistent global switch. */
        enableAutoRepair(fileId) {
            if (!this.#files.has(fileId)) throw new Error(`[CozyBugFixer] enableAutoRepair(): unknown fileId "${fileId}".`);
            this.#autoRepairSessions.add(fileId);
            this.#logAudit("AUTO_REPAIR_ENABLED", `Auto Repair enabled for ${fileId} (this session only).`);
        }

        disableAutoRepair(fileId) { this.#autoRepairSessions.delete(fileId); }
        isAutoRepairEnabled(fileId) { return this.#autoRepairSessions.has(fileId); }

        setExternalRepairer(fn) {
            if (typeof fn !== "function") throw new TypeError("[CozyBugFixer] setExternalRepairer(): fn must be a function.");
            this.#externalRepairer = fn;
        }
        clearExternalRepairer() { this.#externalRepairer = null; }

        /**
         * prepareForExternalRepair(fileId)
         *   Best-effort secret redaction before handing source to an
         *   external repairer — NOT a guarantee. Returns the redacted text
         *   and a count so the developer can decide whether to proceed.
         */
        prepareForExternalRepair(fileId) {
            const record = this.#files.get(fileId);
            if (!record) throw new Error(`[CozyBugFixer] prepareForExternalRepair(): unknown fileId "${fileId}".`);
            const { redacted, redactionCount } = redactSecretShapes(record.lastSource);
            return { redactedSource: redacted, redactionCount, warning: redactionCount > 0 ? `${redactionCount} possible secret(s) redacted — this is a best-effort scan, not a guarantee. Do not proceed if this file is known to contain sensitive data.` : "No known secret shapes detected — this is still not a guarantee." };
        }

        // =====================================================================
        // ─── ANALYZE (read-only — never modifies anything) ───────────────────
        // =====================================================================

        /**
         * analyze(fileId)
         *   Read-only. Runs the suspicious-pattern safety scan, and — if
         *   CozyCertification is connected — a real quickCertification()
         *   call for the current score and defect list. Never writes
         *   anything, never applies a fix.
         */
        analyze(fileId) {
            const record = this.#files.get(fileId);
            if (!record) throw new Error(`[CozyBugFixer] analyze(): unknown fileId "${fileId}".`);

            const suspicious = scanForSuspiciousPatterns(record.lastSource);
            let certification = { available: false, message: "CozyCertification not connected." };
            if (window.CozyOS.Certification && typeof window.CozyOS.Certification.quickCertification === "function") {
                try {
                    const result = window.CozyOS.Certification.quickCertification(record.lastSource, { moduleId: `${record.filename}_analysis`, moduleName: record.filename, version: "analysis-only" });
                    const ueForAnalyze = window.CozyOS.UnderstandingEngine;
                    const patternRuleIds = new Set((ueForAnalyze && typeof ueForAnalyze.listActivePatterns === "function" ? ueForAnalyze.listActivePatterns() : [])
                        .filter(p => p.extractedPattern && p.extractedPattern.ruleId && PATTERN_FIXER_OVERRIDES[p.extractedPattern.applierId])
                        .map(p => p.extractedPattern.ruleId));
                    certification = {
                        available: true, verdict: result.verdict, scorePercent: result.summary.scorePercent, grade: result.overallGrade,
                        defects: result.defects.map(d => ({ id: d.id, severity: d.severity, description: d.description, autoFixable: !!DETERMINISTIC_FIXERS[d.id] || patternRuleIds.has(d.id) }))
                    };
                } catch (err) {
                    certification = { available: false, message: `Certification analysis failed: ${err.message}` };
                }
            }

            this.#logAudit("ANALYZED", `${record.filename} analyzed (read-only).`);
            return Object.freeze({
                fileId, filename: record.filename,
                isProtected: isProtectedFile(record.filename),
                suspiciousFindings: suspicious,
                blockedForSuspiciousContent: suspicious.length > 0,
                certification
            });
        }

        // =====================================================================
        // ─── BACKUP ───────────────────────────────────────────────────────────
        // =====================================================================

        async #createBackup(fileId) {
            const record = this.#files.get(fileId);
            const backupId = "bak_" + crypto.randomUUID();
            const hash = await sha256Hex(record.lastSource);
            const backup = Object.freeze({ backupId, fileId, source: record.lastSource, hash, timestamp: new Date().toISOString() });
            if (!this.#backups.has(fileId)) this.#backups.set(fileId, []);
            const list = this.#backups.get(fileId);
            list.push(backup);
            if (list.length > 20) list.shift(); // bounded — 20 backups per file is generous for a session
            this.#logAudit("BACKUP_CREATED", `Backup ${backupId} created for ${record.filename} before repair.`);
            return backup;
        }

        listBackups(fileId) {
            return Object.freeze((this.#backups.get(fileId) || []).map(b => this.#deepClone(b)));
        }

        /** Restores a file's in-memory source from a specific backup. Does NOT write to disk — call save() afterward if that's wanted. */
        restoreFromBackup(fileId, backupId) {
            const list = this.#backups.get(fileId) || [];
            const backup = list.find(b => b.backupId === backupId);
            if (!backup) throw new Error(`[CozyBugFixer] restoreFromBackup(): no backup "${backupId}" for file "${fileId}".`);
            const record = this.#files.get(fileId);
            const updated = { ...record, lastSource: backup.source, lastHash: backup.hash };
            this.#files.set(fileId, Object.freeze(updated));
            this.#logAudit("RESTORED_FROM_BACKUP", `${record.filename} restored to backup ${backupId}.`);
            this.emit("file:restored", { fileId, backupId });
            return this.getFile(fileId);
        }

        // =====================================================================
        // ─── REPAIR ───────────────────────────────────────────────────────────
        // Analyze -> Backup -> Apply deterministic fixes -> Re-certify ->
        // return a PREVIEW. Nothing is saved here — save() is the only
        // method that ever writes, and it requires an explicit approve.
        // =====================================================================

        /**
         * repair(fileId, { ruleIds })
         *   ruleIds: which findings to attempt (defaults to every
         *   deterministically-fixable finding from the last analyze()).
         *   Returns a preview: { proposedSource, appliedFixes, skippedFixes,
         *   beforeCertification, afterCertification, backupId }. Call
         *   save(fileId, { approve: true }) to actually persist it.
         */
        repair(fileId, { ruleIds } = {}) {
            const record = this.#files.get(fileId);
            if (!record) throw new Error(`[CozyBugFixer] repair(): unknown fileId "${fileId}".`);
            this.#diagnostics.repairsAttempted++;

            const suspicious = scanForSuspiciousPatterns(record.lastSource);
            if (suspicious.length > 0) {
                this.#diagnostics.suspiciousScanBlocks++;
                this.#logAudit("REPAIR_BLOCKED", `${record.filename}: repair blocked — suspicious pattern(s) found: ${suspicious.map(s => s.id).join(", ")}.`);
                throw new Error(`[CozyBugFixer] Repair blocked — suspicious pattern(s) detected: ${suspicious.map(s => s.description).join("; ")}. Review manually before repairing.`);
            }
            if (isProtectedFile(record.filename)) {
                this.#diagnostics.protectedFileBlocks++;
                this.#logAudit("REPAIR_BLOCKED", `${record.filename}: is a Protected File — repair requires enforcedProtectedOverride via save().`);
            }

            let beforeCertification = { available: false, message: "CozyCertification not connected." };
            let candidateRuleIds = ruleIds;
            const ue = window.CozyOS.UnderstandingEngine;
            const activePatterns = ue && typeof ue.listActivePatterns === "function" ? ue.listActivePatterns() : [];
            const patternByRuleId = new Map();
            for (const p of activePatterns) { if (p.extractedPattern && p.extractedPattern.ruleId) patternByRuleId.set(p.extractedPattern.ruleId, p); }

            if (window.CozyOS.Certification && typeof window.CozyOS.Certification.quickCertification === "function") {
                try {
                    const result = window.CozyOS.Certification.quickCertification(record.lastSource, { moduleId: `${record.filename}_before`, moduleName: record.filename, version: "pre-repair" });
                    beforeCertification = { available: true, verdict: result.verdict, scorePercent: result.summary.scorePercent, grade: result.overallGrade, criticalCount: result.severityCounts.critical, highCount: result.severityCounts.high };
                    if (!candidateRuleIds) candidateRuleIds = result.defects.filter(d => DETERMINISTIC_FIXERS[d.id] || patternByRuleId.has(d.id)).map(d => d.id);
                } catch (err) {
                    this.#diagnostics.errorsHidden++;
                }
            }
            candidateRuleIds = candidateRuleIds || [];
            const priorFixes = this.#checkMemoryForPriorFixes(candidateRuleIds);

            let workingSource = record.lastSource;
            const appliedFixes = [];
            const skippedFixes = [];
            const usedPatternIds = [];
            for (const ruleId of candidateRuleIds) {
                // Phase 5: an ACTIVE, approved pattern for this rule ID is
                // preferred over the built-in fixer IF it names a
                // recognized applierId — never the pattern's free-text
                // description executed as code. Falls back to the
                // existing built-in fixer exactly as before otherwise.
                const pattern = patternByRuleId.get(ruleId);
                const patternApplier = pattern && pattern.extractedPattern ? PATTERN_FIXER_OVERRIDES[pattern.extractedPattern.applierId] : null;
                const fixer = patternApplier || DETERMINISTIC_FIXERS[ruleId];
                if (!fixer) { skippedFixes.push({ ruleId, reason: "No deterministic fixer available — requires manual review." }); continue; }
                const result = fixer(workingSource);
                if (result.applied) {
                    workingSource = result.source;
                    appliedFixes.push({ ruleId, description: result.description, source: patternApplier ? "pattern" : "built-in" });
                    if (patternApplier) usedPatternIds.push(pattern.id);
                } else {
                    skippedFixes.push({ ruleId, reason: result.reason });
                }
            }

            let afterCertification = { available: false, message: "CozyCertification not connected." };
            if (window.CozyOS.Certification && typeof window.CozyOS.Certification.quickCertification === "function" && appliedFixes.length > 0) {
                try {
                    const result = window.CozyOS.Certification.quickCertification(workingSource, { moduleId: `${record.filename}_after`, moduleName: record.filename, version: "post-repair-preview" });
                    afterCertification = { available: true, verdict: result.verdict, scorePercent: result.summary.scorePercent, grade: result.overallGrade, criticalCount: result.severityCounts.critical, highCount: result.severityCounts.high };
                } catch (err) {
                    this.#diagnostics.errorsHidden++;
                }
            }

            // Phase 6: report real, observed outcomes back to the Pattern
            // Library for any pattern actually used above — never estimated.
            if (usedPatternIds.length && ue && typeof ue.recordPatternUsage === "function") {
                const success = afterCertification.available && afterCertification.verdict !== "CERTIFICATION_FAILED";
                for (const id of usedPatternIds) { try { ue.recordPatternUsage(id, { success }); } catch (_err) { /* pattern may have been deprecated meanwhile — non-fatal */ } }
            }

            if (appliedFixes.length === 0) this.#diagnostics.repairsRejected++;
            this.#logAudit("REPAIR_PREVIEWED", `${record.filename}: ${appliedFixes.length} fix(es) prepared, ${skippedFixes.length} skipped. Not yet saved.`);
            this.#logTimeline(`Repair previewed: ${record.filename} (${appliedFixes.length} fix(es))`);

            return Object.freeze({
                fileId, filename: record.filename,
                originalSource: record.lastSource,
                proposedSource: workingSource,
                changed: workingSource !== record.lastSource,
                appliedFixes, skippedFixes, usedPatternIds, priorFixes,
                isProtected: isProtectedFile(record.filename),
                beforeCertification, afterCertification
            });
        }

        /**
         * repairWithAI(fileId, { ruleIds })
         *   Async sibling of repair(). Applies every deterministically-
         *   fixable finding exactly as repair() does, THEN — only for
         *   findings with no deterministic fixer — consults
         *   window.CozyOS.AIMode.requestAssistance("repair", ...) if it's
         *   connected and not in an offline mode. Any AI-proposed source is
         *   re-run through the SAME suspicious-pattern safety gate before
         *   being accepted; a proposal that fails the gate is discarded and
         *   reported, never silently used. In Offline Only/Rules Only mode
         *   (or with no AIMode connected), this produces IDENTICAL output
         *   to repair().
         */
        async repairWithAI(fileId, { ruleIds } = {}) {
            const record = this.#files.get(fileId);
            if (!record) throw new Error(`[CozyBugFixer] repairWithAI(): unknown fileId "${fileId}".`);
            this.#diagnostics.repairsAttempted++;

            const suspicious = scanForSuspiciousPatterns(record.lastSource);
            if (suspicious.length > 0) {
                this.#diagnostics.suspiciousScanBlocks++;
                throw new Error(`[CozyBugFixer] Repair blocked — suspicious pattern(s) detected: ${suspicious.map(s => s.description).join("; ")}. Review manually before repairing.`);
            }

            let beforeCertification = { available: false, message: "CozyCertification not connected." };
            let candidateRuleIds = ruleIds;
            let candidateDefects = [];
            if (window.CozyOS.Certification && typeof window.CozyOS.Certification.quickCertification === "function") {
                try {
                    const result = window.CozyOS.Certification.quickCertification(record.lastSource, { moduleId: `${record.filename}_before`, moduleName: record.filename, version: "pre-repair" });
                    beforeCertification = { available: true, verdict: result.verdict, scorePercent: result.summary.scorePercent, grade: result.overallGrade, criticalCount: result.severityCounts.critical, highCount: result.severityCounts.high };
                    candidateDefects = result.defects;
                    if (!candidateRuleIds) candidateRuleIds = result.defects.map(d => d.id);
                } catch (_err) { this.#diagnostics.errorsHidden++; }
            }
            candidateRuleIds = candidateRuleIds || [];
            const priorFixes = this.#checkMemoryForPriorFixes(candidateRuleIds);

            let workingSource = record.lastSource;
            const appliedFixes = [];
            const skippedFixes = [];
            const aiCandidates = [];
            const ueForAi = window.CozyOS.UnderstandingEngine;
            const activePatternsForAi = ueForAi && typeof ueForAi.listActivePatterns === "function" ? ueForAi.listActivePatterns() : [];
            const patternByRuleIdForAi = new Map();
            for (const p of activePatternsForAi) { if (p.extractedPattern && p.extractedPattern.ruleId) patternByRuleIdForAi.set(p.extractedPattern.ruleId, p); }
            const usedPatternIdsAi = [];
            for (const ruleId of candidateRuleIds) {
                const patternAi = patternByRuleIdForAi.get(ruleId);
                const patternApplierAi = patternAi && patternAi.extractedPattern ? PATTERN_FIXER_OVERRIDES[patternAi.extractedPattern.applierId] : null;
                const fixer = patternApplierAi || DETERMINISTIC_FIXERS[ruleId];
                if (!fixer) { aiCandidates.push(ruleId); continue; }
                const result = fixer(workingSource);
                if (result.applied) {
                    workingSource = result.source;
                    appliedFixes.push({ ruleId, description: result.description, source: patternApplierAi ? "pattern" : "deterministic" });
                    if (patternApplierAi) usedPatternIdsAi.push(patternAi.id);
                } else {
                    skippedFixes.push({ ruleId, reason: result.reason });
                }
            }

            let aiAssisted = false, aiProvider = null, aiTrustPolicy = null;
            if (aiCandidates.length > 0 && window.CozyOS.AIMode && typeof window.CozyOS.AIMode.requestAssistance === "function") {
                const relevantDefects = candidateDefects.filter(d => aiCandidates.includes(d.id));
                const assistance = await window.CozyOS.AIMode.requestAssistance("repair", {
                    filename: record.filename, source: workingSource,
                    ruleIds: aiCandidates, defects: relevantDefects.map(d => ({ id: d.id, description: d.description }))
                });
                if (assistance.handled && assistance.result && typeof assistance.result.proposedSource === "string") {
                    const aiSuspicious = scanForSuspiciousPatterns(assistance.result.proposedSource);
                    if (aiSuspicious.length > 0) {
                        for (const ruleId of aiCandidates) skippedFixes.push({ ruleId, reason: `AI-proposed fix rejected by the safety scan (${aiSuspicious.map(s => s.description).join("; ")}).` });
                        if (window.CozyOS.AIMode && typeof window.CozyOS.AIMode.reportOutcome === "function") window.CozyOS.AIMode.reportOutcome(assistance.provider, { task: "repair", accepted: false });
                    } else {
                        const policy = assistance.policy;
                        let passesCertificationGate = true;
                        let gateReason = null;
                        if (policy && policy.mustPassCertification && window.CozyOS.Certification && typeof window.CozyOS.Certification.quickCertification === "function") {
                            try {
                                const aiCertResult = window.CozyOS.Certification.quickCertification(assistance.result.proposedSource, { moduleId: `${record.filename}_ai_check`, moduleName: record.filename, version: "ai-proposal-check" });
                                if (aiCertResult.verdict === "CERTIFICATION_FAILED") {
                                    passesCertificationGate = false;
                                    gateReason = `AI-proposed fix rejected — its trust policy ("${policy.name}") requires the result to pass Quick Certification, but it scored ${aiCertResult.summary.scorePercent}% (${aiCertResult.verdict}).`;
                                }
                            } catch (_err) {
                                this.#diagnostics.errorsHidden++;
                                passesCertificationGate = false;
                                gateReason = "AI-proposed fix rejected — could not verify it against Quick Certification (required by its trust policy) and refusing to accept it unverified.";
                            }
                        }
                        if (window.CozyOS.AIMode && typeof window.CozyOS.AIMode.reportOutcome === "function") {
                            window.CozyOS.AIMode.reportOutcome(assistance.provider, { task: "repair", accepted: passesCertificationGate });
                        }
                        if (passesCertificationGate) {
                            workingSource = assistance.result.proposedSource;
                            aiAssisted = true;
                            aiProvider = assistance.provider;
                            aiTrustPolicy = policy;
                            for (const ruleId of aiCandidates) appliedFixes.push({ ruleId, description: `Applied by AI mode "${assistance.provider}" (trust policy: ${policy ? policy.name : "unknown"}).`, source: "ai" });
                        } else {
                            for (const ruleId of aiCandidates) skippedFixes.push({ ruleId, reason: gateReason });
                        }
                    }
                } else {
                    for (const ruleId of aiCandidates) skippedFixes.push({ ruleId, reason: assistance.reason || "No deterministic fixer and no AI assistance available." });
                }
            } else {
                for (const ruleId of aiCandidates) skippedFixes.push({ ruleId, reason: "No deterministic fixer available — requires manual review (AIMode not connected or offline)." });
            }

            let afterCertification = { available: false, message: "CozyCertification not connected." };
            if (window.CozyOS.Certification && typeof window.CozyOS.Certification.quickCertification === "function" && appliedFixes.length > 0) {
                try {
                    const result = window.CozyOS.Certification.quickCertification(workingSource, { moduleId: `${record.filename}_after`, moduleName: record.filename, version: "post-repair-preview" });
                    afterCertification = { available: true, verdict: result.verdict, scorePercent: result.summary.scorePercent, grade: result.overallGrade, criticalCount: result.severityCounts.critical, highCount: result.severityCounts.high };
                } catch (_err) { this.#diagnostics.errorsHidden++; }
            }

            if (usedPatternIdsAi.length && ueForAi && typeof ueForAi.recordPatternUsage === "function") {
                const success = afterCertification.available && afterCertification.verdict !== "CERTIFICATION_FAILED";
                for (const id of usedPatternIdsAi) { try { ueForAi.recordPatternUsage(id, { success }); } catch (_err) { /* non-fatal */ } }
            }

            if (appliedFixes.length === 0) this.#diagnostics.repairsRejected++;
            this.#logAudit("REPAIR_PREVIEWED", `${record.filename}: ${appliedFixes.length} fix(es) prepared (${aiAssisted ? "AI-assisted, " + aiProvider : "deterministic only"}), ${skippedFixes.length} skipped.`);
            this.#logTimeline(`Repair previewed: ${record.filename} (${appliedFixes.length} fix(es))`);

            return Object.freeze({
                fileId, filename: record.filename,
                originalSource: record.lastSource,
                proposedSource: workingSource,
                changed: workingSource !== record.lastSource,
                appliedFixes, skippedFixes, aiAssisted, aiProvider, aiTrustPolicy, usedPatternIds: usedPatternIdsAi, priorFixes,
                isProtected: isProtectedFile(record.filename),
                beforeCertification, afterCertification
            });
        }

        // =====================================================================
        // ─── SAVE (the ONLY method that ever writes) ──────────────────────────
        // =====================================================================

        /**
         * save(fileId, { proposedSource, approve, enforcedProtectedOverride, aiTrustPolicy, acknowledgeUntrustedProvider })
         *   BugFixer NEVER writes to disk directly — it hands proposedSource
         *   back to whoever registered the file. If WorkspaceShell is
         *   connected and this file came through it, call
         *   WorkspaceShell.saveFile() with this method's return value
         *   (proposedSource + hashes) to actually persist it; Workspace is
         *   the single write-gate for the whole platform. This method still
         *   requires approval, still blocks Protected Files and suspicious
         *   content, still creates a backup and computes the hash pair —
         *   it just never calls createWritable() itself.
         *
         *   aiTrustPolicy: pass the aiTrustPolicy from a repairWithAI()
         *   preview when the proposedSource came from an AI-assisted
         *   repair. If that policy's autoApplyAllowed is false
         *   (UNTRUSTED_PROVIDER / EXPERIMENTAL_PROVIDER), Auto Repair's
         *   normal approve-bypass is disabled for this call — approve:true
         *   is required regardless — AND a separate
         *   acknowledgeUntrustedProvider:true is required, distinct from
         *   ordinary approval, matching that policy's confirmationRequired.
         */
        async save(fileId, { proposedSource, approve = false, enforcedProtectedOverride = false, ruleIdsFixed = [], aiTrustPolicy = null, acknowledgeUntrustedProvider = false } = {}) {
            const record = this.#files.get(fileId);
            if (!record) throw new Error(`[CozyBugFixer] save(): unknown fileId "${fileId}".`);
            if (typeof proposedSource !== "string" || !proposedSource.trim()) {
                throw new TypeError("[CozyBugFixer] save(): proposedSource is required.");
            }

            const restrictedByTrustPolicy = aiTrustPolicy && aiTrustPolicy.autoApplyAllowed === false;
            const autoRepairActive = this.#autoRepairSessions.has(fileId) && !restrictedByTrustPolicy;
            if (!approve && !autoRepairActive) {
                throw new Error("[CozyBugFixer] save(): requires approve:true (or Auto Repair enabled for this file this session)." + (restrictedByTrustPolicy ? ` Auto Repair is disabled for this save because trust policy "${aiTrustPolicy.name}" does not allow auto-apply.` : ""));
            }
            if (restrictedByTrustPolicy && (aiTrustPolicy.confirmationRequired !== false) && !acknowledgeUntrustedProvider) {
                throw new Error(`[CozyBugFixer] save(): the proposed change came from a "${aiTrustPolicy.name}" source — this trust policy requires acknowledgeUntrustedProvider:true, a separate confirmation from ordinary approval.`);
            }
            if (isProtectedFile(record.filename) && !enforcedProtectedOverride) {
                this.#diagnostics.protectedFileBlocks++;
                throw new Error(`[CozyBugFixer] save(): "${record.filename}" is a Protected File — requires enforcedProtectedOverride:true in addition to approval.`);
            }
            const suspicious = scanForSuspiciousPatterns(proposedSource);
            if (suspicious.length > 0) {
                this.#diagnostics.suspiciousScanBlocks++;
                throw new Error(`[CozyBugFixer] save(): proposed source contains suspicious pattern(s) — ${suspicious.map(s => s.description).join("; ")}. Refusing to save.`);
            }

            const backup = await this.#createBackup(fileId);
            const beforeHash = record.lastHash;
            const afterHash = await sha256Hex(proposedSource);

            let beforeScore = null, afterScore = null;
            if (window.CozyOS.Certification && typeof window.CozyOS.Certification.quickCertification === "function") {
                try {
                    beforeScore = window.CozyOS.Certification.quickCertification(record.lastSource, { moduleId: `${record.filename}_beforesave`, moduleName: record.filename, version: "before" }).summary.scorePercent;
                    afterScore = window.CozyOS.Certification.quickCertification(proposedSource, { moduleId: `${record.filename}_aftersave`, moduleName: record.filename, version: "after" }).summary.scorePercent;
                } catch (_err) { this.#diagnostics.errorsHidden++; }
            }

            // NEVER writes to disk. record.handle is retained only so a
            // caller (e.g. WorkspaceShell.saveFile()) can perform the
            // actual write itself; this file has no createWritable() call
            // anywhere in it.
            const updatedRecord = Object.freeze({ ...record, lastSource: proposedSource, lastHash: afterHash });
            this.#files.set(fileId, updatedRecord);

            const repairEntry = Object.freeze({
                repairId: "repair_" + crypto.randomUUID(),
                fileId, filename: record.filename,
                timestamp: new Date().toISOString(),
                rulesFixed: ruleIdsFixed,
                previousHash: beforeHash, newHash: afterHash,
                certificationScoreBefore: beforeScore, certificationScoreAfter: afterScore,
                backupId: backup.backupId,
                writtenToDisk: false,
                bugfixerVersion: BUGFIXER_VERSION
            });
            this.#repairLog.push(repairEntry);
            if (this.#repairLog.length > 500) this.#repairLog.shift();
            this.#diagnostics.repairsApplied++;
            if (window.CozyOS.CozyMemory) {
                try { window.CozyOS.CozyMemory.saveMemory("Builder", `repair-${repairEntry.repairId}`, repairEntry, { tags: ["repair", record.filename, ...ruleIdsFixed] }); } catch (_err) { /* memory is additive — never blocks a save */ }
            }

            this.#logAudit("SAVED", `${record.filename} saved. Hash ${beforeHash.slice(0, 8)}… -> ${afterHash.slice(0, 8)}…. Score ${beforeScore ?? "?"}% -> ${afterScore ?? "?"}%.`);
            this.#logTimeline(`Saved: ${record.filename}`);
            this.emit("file:saved", { fileId, filename: record.filename, repairId: repairEntry.repairId });
            return { ...repairEntry, proposedSource, handle: record.handle || null };
        }

        getRepairLog(predicate) {
            const list = this.#repairLog.map(e => this.#deepClone(e));
            return Object.freeze(predicate ? list.filter(predicate) : list);
        }

        // =====================================================================
        // ─── DIAGNOSTICS / COMPATIBILITY ──────────────────────────────────────
        // =====================================================================

        isVersionCompatible(version) {
            const a = /^v?(\d+)\./.exec(String(BUGFIXER_VERSION));
            const b = /^v?(\d+)\./.exec(String(version || ""));
            if (!a || !b) return false;
            return a[1] === b[1];
        }

        getDiagnosticsReport() {
            let certificationConnected = !!(window.CozyOS.Certification);
            return Object.freeze({
                moduleVersion: BUGFIXER_VERSION,
                ...this.#diagnostics,
                dependencies: [
                    { name: "CozyCertification", required: false, purpose: "Before/after scoring for repairs; required for any actual repair (Analyze works without it)" },
                    { name: "WorkspaceShell", required: false, purpose: "File handles/metadata handoff" },
                    { name: "ServiceRegistry", required: false, purpose: "Coordinator catalog registration" }
                ],
                integrationCount: [certificationConnected, !!window.CozyOS.WorkspaceShell, !!window.CozyOS.ServiceRegistry].filter(Boolean).length,
                filesInRegistry: this.#files.size,
                autoRepairSessionsActive: this.#autoRepairSessions.size,
                repairLogSize: this.#repairLog.length,
                auditLogCount: this.#auditLogs.length,
                timelineEventCount: this.#timelineEvents.length,
                externalRepairerConnected: !!this.#externalRepairer,
                certificationConnected
            });
        }

        // =====================================================================
        // ─── EXPORT / IMPORT SNAPSHOT ─────────────────────────────────────────
        // Exports the repair log and audit trail — never file handles
        // (those can't survive serialization, and shouldn't: re-registering
        // via a fresh picker is the only way back into the sandbox).
        // =====================================================================

        exportSnapshot() {
            return this.#deepClone({
                version: BUGFIXER_VERSION,
                exportedAt: new Date().toISOString(),
                repairLog: this.#repairLog,
                auditLog: this.#auditLogs,
                timeline: this.#timelineEvents
            });
        }

        importSnapshot(snapshot, { mergeStrategy = "merge" } = {}) {
            if (!snapshot || typeof snapshot !== "object") throw new TypeError("[CozyBugFixer] importSnapshot(): snapshot must be an object.");
            if (mergeStrategy !== "merge" && mergeStrategy !== "replace") {
                throw new TypeError('[CozyBugFixer] importSnapshot(): mergeStrategy must be "merge" or "replace".');
            }
            if (mergeStrategy === "replace") this.#repairLog.length = 0;
            let imported = 0;
            for (const entry of (snapshot.repairLog || [])) {
                if (!this.#repairLog.some(r => r.repairId === entry.repairId)) {
                    this.#repairLog.push(Object.freeze(entry));
                    imported++;
                }
            }
            this.#logAudit("SNAPSHOT_IMPORTED", `${imported} repair log entr(ies) imported (strategy: ${mergeStrategy}).`);
            return { imported };
        }

        isSnapshotCompatible(snapshot) {
            return !!(snapshot && typeof snapshot.version === "string" && snapshot.version.split(".")[0] === BUGFIXER_VERSION.split(".")[0]);
        }
    }

    if (window.CozyOS.BugFixer && typeof window.CozyOS.BugFixer.getVersion === "function") {
        const existingVersion = window.CozyOS.BugFixer.getVersion();
        if (existingVersion !== BUGFIXER_VERSION) {
            throw new Error(`[CozyOS Framework Execution Error] VERSION_CONFLICT: BugFixer existing v${existingVersion} conflicts with load target v${BUGFIXER_VERSION}.`);
        }
        return;
    }

    window.CozyOS.BugFixer = new CozyOSBugFixerCoordinator();
    // Application Visibility Registry — real, additive self-declaration.
    // Same reasoning as Builder: hosted as an internal Developer Hub
    // section, launchTarget deep-links there rather than pretending this
    // mounts as a standalone module.
    window.CozyOS.BugFixer.visibility = Object.freeze({
        appId: "bugfixer", name: "BugFixer", icon: "🐛", category: "platform-tool",
        launchTarget: Object.freeze({ center: "developerHub", section: "bugfixer" }),
        audience: "developer"
    });

    (function registerWithServiceRegistry(descriptor) {
        function attempt() {
            if (typeof window.CozyOS.registerCoordinator !== "function") return false;
            try { window.CozyOS.registerCoordinator(descriptor); } catch (_err) { /* non-fatal */ }
            return true;
        }
        if (attempt()) return;
        if (!Object.prototype.hasOwnProperty.call(window.CozyOS, "__pendingCoordinatorRegistrations")) {
            Object.defineProperty(window.CozyOS, "__pendingCoordinatorRegistrations", { value: [], writable: true, enumerable: false, configurable: true });
        }
        window.CozyOS.__pendingCoordinatorRegistrations.push(descriptor);
        let attempts = 0;
        const maxAttempts = 200;
        const intervalId = setInterval(() => {
            attempts++;
            if (attempt() || attempts >= maxAttempts) {
                clearInterval(intervalId);
                const idx = window.CozyOS.__pendingCoordinatorRegistrations.indexOf(descriptor);
                if (idx !== -1) window.CozyOS.__pendingCoordinatorRegistrations.splice(idx, 1);
            }
        }, 250);
    })({
        name: "BugFixer", category: "Code Generation", icon: "bugfixer.svg",
        description: "CozyBugFixer — repairs CozyOS source files via deterministic, additive-only fixes for known certification findings. Sandboxed to explicitly-granted files; never executes source; every save is backed by a checksum pair, a backup, and an append-only repair log."
    });
})();
