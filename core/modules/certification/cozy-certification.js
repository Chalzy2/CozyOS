/**
 * CozyOS Enterprise Framework — Certification Coordinator
 * File Reference: core/modules/certification/cozy-certification.js
 * Layer: Core / Quality Assurance & Enterprise Certification Authority
 * Version: 1.0.0-ENTERPRISE
 *
 * RESPONSIBILITIES
 *   - Load and inspect JavaScript source text, metadata, and coordinator
 *     structure for other CozyOS modules.
 *   - Evaluate a pluggable set of enterprise rules across twelve check
 *     groups (Architecture, Security, Coordinator Standards, Diagnostics,
 *     Event System, Registry Engine, Import/Export, Versioning,
 *     Performance, UI Safety, Enterprise Consistency, Documentation).
 *   - Produce certification reports, verdicts, defect lists, regression
 *     summaries, and certification history.
 *   - Certify complete applications (module manifests), not just single
 *     coordinators.
 *
 * ZERO LOGIC RULE / METADATA-ONLY / EXECUTION-FREE
 *   This coordinator NEVER executes, evals, or imports the source it
 *   inspects. Every rule in this file operates on the source text as a
 *   string (regex / structural heuristics) plus caller-supplied metadata.
 *   Because of that, every rule result is a *heuristic* signal, not a
 *   formal proof — this file is honest about that in its own report
 *   output (see #NOTE fields) rather than presenting pattern-matches as
 *   guarantees. A rule marked PASS means "the expected pattern was found
 *   in the source text", not "this code is provably correct."
 */

(function () {
    "use strict";

    window.CozyOS = window.CozyOS || {};
    const CERT_VERSION = "1.0.0-ENTERPRISE";

    // =========================================================================
    // ─── ENUMS ────────────────────────────────────────────────────────────────
    // =========================================================================

    const CERT_LEVELS = Object.freeze({
        ENTERPRISE_CERTIFIED: "ENTERPRISE_CERTIFIED",
        CERTIFIED_WITH_WARNINGS: "CERTIFIED_WITH_WARNINGS",
        CERTIFICATION_FAILED: "CERTIFICATION_FAILED",
        NOT_CERTIFIED: "NOT_CERTIFIED",
        UNKNOWN: "UNKNOWN"
    });

    const DEPLOYMENT_READINESS = Object.freeze({
        ENTERPRISE_CERTIFIED: "Enterprise Production Ready",
        CERTIFIED_WITH_WARNINGS: "Production Ready (Monitor Warnings)",
        CERTIFICATION_FAILED: "Not Deployment Ready",
        NOT_CERTIFIED: "Not Evaluated",
        UNKNOWN: "Indeterminate"
    });

    const SEVERITY = Object.freeze({
        CRITICAL: "CRITICAL",
        HIGH: "HIGH",
        MEDIUM: "MEDIUM",
        LOW: "LOW",
        INFO: "INFO"
    });

    const SEVERITY_WEIGHT = Object.freeze({ CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1, INFO: 0 });
    // Failures at these severities block certification; MEDIUM/LOW/INFO failures
    // surface as warnings instead of hard failures.
    const BLOCKING_SEVERITIES = new Set(["CRITICAL", "HIGH"]);

    class CozyOSCertificationCoordinator {
        // ---- registry of pluggable rules, keyed by rule id ----
        #rules = new Map();

        // ---- certification history: moduleId -> array of frozen records ----
        #history = new Map();

        // ---- registered applications: applicationId -> frozen manifest record ----
        // Populated only via registerApplication() — this coordinator has no way
        // to discover "which apps use which modules" from static source alone,
        // so the app/module usage graph is declarative, supplied by the caller.
        #applications = new Map();

        // ---- explicit component-type tags: name -> "module" | "shell" | "plugin" ----
        // Populated via registerComponentType(). A live window.CozyOS[name]
        // reference alone doesn't say whether something is a coordinator, a
        // shell, or a plugin — that's a taxonomy decision, not something
        // derivable from the object shape without executing/inspecting its
        // internals. Names ending in "Shell" are classified as shells by
        // convention; everything else defaults to "module" unless tagged.
        #componentTypes = new Map();

        // ---- long-term maintenance state (baseline / waivers / freeze / releases) ----
        // Certification Baseline: moduleId -> the frozen ENTERPRISE_CERTIFIED
        // record chosen as "the standard to protect" via setBaseline().
        #baselines = new Map();
        // Waivers: moduleId -> Map<ruleId, {reason, expires, createdAt}>. An
        // active (non-expired) waiver keeps a rule's failure visible in the
        // report but excludes it from what blocks certification.
        #waivers = new Map();
        // Frozen modules: moduleId -> {sourceHash, frozenAt, certificationId}.
        // sourceHash is a cheap change-detection checksum (see #hashSource),
        // NOT a cryptographic hash — it only needs to catch "this changed".
        #frozenModules = new Map();
        // Release locks: releaseId -> frozen release-lock record.
        #releases = new Map();

        // ---- sequence counters for certification IDs, per module ----
        #idSequence = new Map();

        // ---- coordinator-standard logs ----
        #auditLogs = [];
        #timelineEvents = [];

        // ---- event bus ----
        #listeners = new Map();   // eventName -> Set<fn>
        #onceWrapped = new Map(); // original fn -> wrapper fn (for off() symmetry)

        #diagnostics = {
            certificationsRun: 0,
            applicationsRun: 0,
            rulesEvaluated: 0,
            errorsHidden: 0,
            eventsEmitted: 0,
            exportsGenerated: 0,
            memoryBaseline: 6.2
        };

        // ---- rule-set versioning ----
        // Distinct from CERT_VERSION (the coordinator's own code version): this
        // tracks the *rule set*, which can evolve independently (rules added
        // via registerRule()/unregisterRule() after construction). Every
        // report is stamped with the rule-set version active when it ran.
        #ruleSetVersion = "1.0";
        #ruleSetHistory = [];
        #initialized = false;

        constructor() {
            this.#registerDefaultRules();
            this.#ruleSetHistory.push(Object.freeze({
                version: this.#ruleSetVersion, ruleCount: this.#rules.size,
                changedAt: new Date().toISOString(), reason: "Initial enterprise rule set."
            }));
            this.#initialized = true;
            this.#logAudit("INIT_CYCLE", "Certification Coordinator initialized with default enterprise rule set.");
        }

        getVersion() { return CERT_VERSION; }

        // =====================================================================
        // ─── SMALL UTILITIES (deep clone / deep freeze / escaping) ──────────
        // =====================================================================

        #deepClone(value) {
            if (typeof structuredClone === "function") {
                try { return structuredClone(value); } catch (_err) { /* fall through */ }
            }
            return JSON.parse(JSON.stringify(value));
        }

        #deepFreeze(obj) {
            if (obj && typeof obj === "object" && !Object.isFrozen(obj)) {
                Object.getOwnPropertyNames(obj).forEach((key) => this.#deepFreeze(obj[key]));
                Object.freeze(obj);
            }
            return obj;
        }

        #escapeHtml(value) {
            const str = String(value === undefined || value === null ? "" : value);
            return str
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#39;");
        }

        // FNV-1a 32-bit checksum for cheap change-detection (used by
        // freezeModule()/certifyModule() to notice "this source changed").
        // This is explicitly NOT a cryptographic hash — collisions are
        // plausible against an adversary, but it's more than adequate for
        // "did a developer accidentally edit a frozen file" detection.
        #hashSource(text) {
            let hash = 0x811c9dc5;
            for (let i = 0; i < text.length; i++) {
                hash ^= text.charCodeAt(i);
                hash = Math.imul(hash, 0x01000193);
            }
            return (hash >>> 0).toString(16).padStart(8, "0");
        }

        #logAudit(action, msg) {
            const entry = Object.freeze({ id: "audcert_" + crypto.randomUUID(), timestamp: new Date().toISOString(), action, msg });
            this.#auditLogs.push(entry);
            if (this.#auditLogs.length > 500) this.#auditLogs.shift();
        }

        #logTimeline(label) {
            this.#timelineEvents.push(Object.freeze({ time: new Date().toISOString(), label }));
            if (this.#timelineEvents.length > 500) this.#timelineEvents.shift();
        }

        // =====================================================================
        // ─── EVENT BUS (on / off / once / emit) ─────────────────────────────
        // =====================================================================

        on(eventName, handler) {
            if (typeof eventName !== "string" || !eventName.trim()) throw new TypeError("[CozyCertification] on(): eventName must be a non-empty string.");
            if (typeof handler !== "function") throw new TypeError("[CozyCertification] on(): handler must be a function.");
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
            if (typeof handler !== "function") throw new TypeError("[CozyCertification] once(): handler must be a function.");
            const wrapper = (payload) => {
                this.off(eventName, handler);
                this.#onceWrapped.delete(handler);
                handler(payload);
            };
            this.#onceWrapped.set(handler, wrapper);
            this.on(eventName, wrapper);
        }

        emit(eventName, payload) {
            if (typeof eventName !== "string" || !eventName.trim()) {
                this.#diagnostics.errorsHidden++;
                return false;
            }
            // Consistent, colon-namespaced event naming convention, matching the
            // rest of the CozyOS kernel family (e.g. "session:create").
            if (!/^[a-z][a-z0-9]*:[a-z][a-z0-9]*$/.test(eventName)) {
                this.#diagnostics.errorsHidden++;
            }
            const set = this.#listeners.get(eventName);
            this.#diagnostics.eventsEmitted++;
            if (!set || set.size === 0) return false;
            let safePayload = payload;
            try {
                safePayload = this.#deepClone(payload);
            } catch (_err) {
                // Unclonable payload (functions, circular refs) — pass through as-is
                // rather than dropping the event entirely.
                safePayload = payload;
            }
            for (const fn of Array.from(set)) {
                try { fn(safePayload); } catch (_err) { this.#diagnostics.errorsHidden++; }
            }
            return true;
        }

        getDiagnosticsReport() {
            return this.#deepFreeze(this.#deepClone({
                ...this.#diagnostics,
                registryModuleCount: this.#history.size,
                totalCertificationRecords: Array.from(this.#history.values()).reduce((sum, arr) => sum + arr.length, 0),
                ruleCount: this.#rules.size,
                auditLogCount: this.#auditLogs.length,
                timelineEventCount: this.#timelineEvents.length,
                listenerEventTypes: this.#listeners.size
            }));
        }

        // =====================================================================
        // ─── STATIC-ANALYSIS HELPERS (string / regex only — no execution) ───
        // =====================================================================

        #hasPattern(source, regex) {
            const re = new RegExp(regex.source, regex.flags.replace("g", ""));
            return re.test(source);
        }

        #countPattern(source, regex) {
            const re = new RegExp(regex.source, regex.flags.includes("g") ? regex.flags : regex.flags + "g");
            const matches = source.match(re);
            return matches ? matches.length : 0;
        }

        #lineOf(source, regex) {
            const re = new RegExp(regex.source, regex.flags.replace("g", ""));
            const m = re.exec(source);
            if (!m) return null;
            return source.slice(0, m.index).split("\n").length;
        }

        // Heuristic-only balanced-delimiter sanity check. This is NOT a
        // substitute for `node --check` (which this module cannot run on
        // itself without violating the execution-free constraint) — it only
        // catches gross bracket/paren/brace imbalance.
        #basicSyntaxSanityCheck(source) {
            const pairs = { "(": ")", "[": "]", "{": "}" };
            const closers = new Set(Object.values(pairs));
            const stack = [];
            let inString = null;
            let inLineComment = false;
            let inBlockComment = false;
            // Tracks the last significant (non-whitespace, non-comment) character
            // seen, so a bare "/" can be classified as division (follows a value:
            // identifier/number/")"/"]"/quote) vs. a regex-literal opener
            // (follows an operator, "(", ",", "=", start-of-file, etc). Without
            // this, something as ordinary as `.replace(/"/g, "&quot;")` gets
            // misread as a stray double-quote opening a fake string, which then
            // desyncs every bracket count after it.
            let lastSig = "";
            for (let i = 0; i < source.length; i++) {
                const ch = source[i];
                const next = source[i + 1];
                if (inLineComment) { if (ch === "\n") inLineComment = false; continue; }
                if (inBlockComment) { if (ch === "*" && next === "/") { inBlockComment = false; i++; } continue; }
                if (inString) {
                    if (ch === "\\") { i++; continue; }
                    if (ch === inString) { inString = null; lastSig = ch; }
                    continue;
                }
                if (ch === "/" && next === "/") { inLineComment = true; i++; continue; }
                if (ch === "/" && next === "*") { inBlockComment = true; i++; continue; }
                if (ch === "/") {
                    const divisionContext = /[\w$)\]]/.test(lastSig);
                    if (!divisionContext) {
                        // Treat as a regex literal: scan to the matching unescaped
                        // "/", respecting character classes [...] where "/" is literal.
                        let j = i + 1;
                        let inClass = false;
                        let terminated = false;
                        while (j < source.length) {
                            const c = source[j];
                            if (c === "\\") { j += 2; continue; }
                            if (c === "\n") break; // bail: not actually a regex literal
                            if (c === "[") { inClass = true; j++; continue; }
                            if (c === "]") { inClass = false; j++; continue; }
                            if (c === "/" && !inClass) { terminated = true; break; }
                            j++;
                        }
                        if (terminated) {
                            let k = j + 1;
                            while (k < source.length && /[a-z]/i.test(source[k])) k++;
                            i = k - 1;
                            lastSig = "/";
                            continue;
                        }
                        // Not a well-formed regex literal on this line — fall through
                        // and treat the "/" as an ordinary character.
                    }
                    lastSig = ch;
                    continue;
                }
                if (ch === '"' || ch === "'" || ch === "`") { inString = ch; continue; }
                if (pairs[ch]) { stack.push(pairs[ch]); lastSig = ch; continue; }
                if (closers.has(ch)) {
                    if (stack.pop() !== ch) return { balanced: false, reason: `Unexpected "${ch}" near offset ${i}.` };
                    lastSig = ch;
                    continue;
                }
                if (!/\s/.test(ch)) lastSig = ch;
            }
            if (stack.length > 0) return { balanced: false, reason: `${stack.length} unclosed delimiter(s) at end of file.` };
            if (inString) return { balanced: false, reason: "Unterminated string literal." };
            if (inBlockComment) return { balanced: false, reason: "Unterminated block comment." };
            return { balanced: true, reason: null };
        }

        // =====================================================================
        // ─── PLUGGABLE RULE SYSTEM ───────────────────────────────────────────
        // =====================================================================

        /**
         * rule shape:
         *   {
         *     id, group, severity, description, reason, impact, recommendation,
         *     evaluate(source, metadata) -> { pass: boolean, line?: number, detail?: string }
         *   }
         */
        registerRule(rule) {
            if (!rule || typeof rule.id !== "string" || typeof rule.evaluate !== "function") {
                throw new TypeError("[CozyCertification] registerRule(): rule must have an id and an evaluate() function.");
            }
            if (!SEVERITY[rule.severity]) {
                throw new TypeError(`[CozyCertification] registerRule(): unknown severity "${rule.severity}" for rule ${rule.id}.`);
            }
            this.#rules.set(rule.id, Object.freeze({ ...rule }));
            this.#logAudit("RULE_REGISTERED", `Rule ${rule.id} registered under group ${rule.group}.`);
            if (this.#initialized) this.#bumpRuleSetVersion(`Rule ${rule.id} added.`);
            return true;
        }

        unregisterRule(ruleId) {
            const removed = this.#rules.delete(ruleId);
            if (removed) {
                this.#logAudit("RULE_UNREGISTERED", `Rule ${ruleId} removed from active rule set.`);
                if (this.#initialized) this.#bumpRuleSetVersion(`Rule ${ruleId} removed.`);
            }
            return removed;
        }

        #bumpRuleSetVersion(reason) {
            const [major, minor] = this.#ruleSetVersion.split(".").map(Number);
            this.#ruleSetVersion = `${major}.${minor + 1}`;
            this.#ruleSetHistory.push(Object.freeze({
                version: this.#ruleSetVersion, ruleCount: this.#rules.size,
                changedAt: new Date().toISOString(), reason
            }));
        }

        getRuleSetVersion() { return this.#ruleSetVersion; }

        getRuleSetVersionHistory() {
            return this.#deepFreeze(this.#deepClone(this.#ruleSetHistory));
        }

        listRules(group = null) {
            const all = Array.from(this.#rules.values());
            return this.#deepFreeze(this.#deepClone(group ? all.filter(r => r.group === group) : all));
        }

        // A small factory to keep the ~65 default rule definitions declarative
        // and short. `test` receives (source, metadata) and returns a boolean
        // or a { pass, line, detail } object.
        #presenceRule({ id, group, severity, description, reason, impact, recommendation, test }) {
            return {
                id, group, severity, description, reason, impact, recommendation,
                evaluate: (source, metadata) => {
                    const result = test(source, metadata, this);
                    if (typeof result === "boolean") return { pass: result };
                    return result;
                }
            };
        }

        // =====================================================================
        // ─── DEFAULT ENTERPRISE RULE SET (12 check groups) ───────────────────
        // =====================================================================

        #registerDefaultRules() {
            const R = (def) => this.registerRule(this.#presenceRule(def));

            // ---- 0. Syntax sanity (heuristic pre-check, not node --check) ----
            R({
                id: "SYN-001", group: "syntax", severity: SEVERITY.CRITICAL,
                description: "Basic delimiter/string balance sanity check",
                reason: "Unbalanced braces, parens, brackets, or string literals almost always indicate a truncated or corrupted file.",
                impact: "The file may fail to parse at all in a real JS engine.",
                recommendation: "Run `node --check <file>` for authoritative syntax validation; this heuristic only catches gross imbalance.",
                test: (source, _meta, self) => {
                    const result = self.#basicSyntaxSanityCheck(source);
                    return { pass: result.balanced, detail: result.reason || "Delimiters and string literals balance." };
                }
            });

            // ---- 1. Architecture ----
            R({ id: "ARCH-001", group: "architecture", severity: SEVERITY.HIGH,
                description: "IIFE module wrapper", reason: "CozyOS coordinators isolate their scope in an IIFE to avoid leaking globals.",
                impact: "Missing wrapper risks global namespace pollution and cross-module variable collisions.",
                recommendation: "Wrap the file body in `(function () { \"use strict\"; ... })();`.",
                test: (s) => {
                    // Allow a standard leading /** ... */ header comment before the
                    // IIFE opener — that's the expected CozyOS file layout, not a
                    // violation of the wrapper convention.
                    const withoutHeader = s.replace(/^\s*\/\*\*[\s\S]*?\*\/\s*/, "");
                    return /^\s*\(function\s*\(\s*\)\s*\{/.test(withoutHeader) && /\}\)\(\);?\s*$/.test(s.trim());
                } });

            R({ id: "ARCH-002", group: "architecture", severity: SEVERITY.MEDIUM,
                description: "Strict mode declared", reason: "\"use strict\" is the CozyOS baseline for every coordinator.",
                impact: "Without it, silent errors (e.g. accidental globals) go undetected.",
                recommendation: "Add `\"use strict\";` as the first statement inside the IIFE.",
                test: (s) => /["']use strict["'];/.test(s) });

            R({ id: "ARCH-003", group: "architecture", severity: SEVERITY.HIGH,
                description: "window.CozyOS namespace registration", reason: "All coordinators publish under the shared window.CozyOS namespace.",
                impact: "A module outside the namespace won't be discoverable by WorkspaceShell.",
                recommendation: "Register the instance as `window.CozyOS.<Name> = new <Class>();`.",
                test: (s) => /window\.CozyOS/.test(s) });

            R({ id: "ARCH-004", group: "architecture", severity: SEVERITY.HIGH,
                description: "getVersion() method present", reason: "Version introspection is required for discovery and hot-reload guards.",
                impact: "WorkspaceShell falls back to an assumed version, hiding real drift.",
                recommendation: "Add `getVersion() { return <VERSION_CONST>; }`.",
                test: (s, _m, self) => { const line = self.#lineOf(s, /getVersion\s*\(\s*\)/); return { pass: !!line, line }; } });

            R({ id: "ARCH-005", group: "architecture", severity: SEVERITY.HIGH,
                description: "Version-conflict guard on load", reason: "Re-loading a different version of the same coordinator must not silently overwrite state.",
                impact: "A stale or malicious re-load could downgrade a certified coordinator undetected.",
                recommendation: "Compare `existingVersion` vs the new version constant and throw a VERSION_CONFLICT error on mismatch, matching CozyStorage/CozyIdentity convention.",
                test: (s) => /VERSION_CONFLICT/.test(s) });

            R({ id: "ARCH-006", group: "architecture", severity: SEVERITY.MEDIUM,
                description: "Class-based coordinator", reason: "CozyOS coordinators are implemented as a single class instantiated once.",
                impact: "Non-class implementations diverge from the shared architecture and are harder to certify consistently.",
                recommendation: "Implement the coordinator as `class Cozy<Name> { ... }`.",
                test: (s) => /class\s+Cozy\w+/.test(s) });

            R({ id: "ARCH-007", group: "architecture", severity: SEVERITY.LOW,
                description: "Private field encapsulation", reason: "Internal state should use `#field` private class fields, not public properties.",
                impact: "Public mutable state can be tampered with from outside the module, breaking Zero Logic guarantees.",
                recommendation: "Convert internal state fields to `#privateField` syntax.",
                test: (s) => /#[a-zA-Z_]\w*\s*=/.test(s) });

            R({ id: "ARCH-008", group: "architecture", severity: SEVERITY.MEDIUM,
                description: "Frozen exported records (immutable exports)", reason: "Anything handed out of the module (logs, snapshots) should be frozen to prevent external mutation.",
                impact: "Callers could mutate internal records in place, corrupting audit trails.",
                recommendation: "Wrap exported records in `Object.freeze(...)` (or a deep-freeze helper) before returning them.",
                test: (s) => /Object\.freeze\(/.test(s) });

            R({ id: "ARCH-009", group: "architecture", severity: SEVERITY.LOW,
                description: "Deep clone helper present", reason: "Returning live references to internal collections lets callers mutate private state indirectly.",
                impact: "Data integrity of internal Maps/Arrays could be silently compromised.",
                recommendation: "Add a `#deepClone()` helper (structuredClone or JSON round-trip) and use it before returning collections.",
                test: (s) => /structuredClone\(|JSON\.parse\(JSON\.stringify\(|#deepClone/.test(s) });

            R({ id: "ARCH-010", group: "architecture", severity: SEVERITY.LOW,
                description: "Deep freeze helper present", reason: "A single-level Object.freeze does not protect nested objects/arrays.",
                impact: "Nested mutation could bypass a shallow freeze undetected.",
                recommendation: "Add a recursive `#deepFreeze()` helper for nested structures.",
                test: (s) => /#deepFreeze|deepFreeze\s*\(/.test(s) });

            R({ id: "ARCH-011", group: "architecture", severity: SEVERITY.MEDIUM,
                description: "Single namespace export (no duplicate instantiation)", reason: "Exactly one instance should be published per coordinator file.",
                impact: "Multiple `new` exports under the same namespace risk conflicting singleton state.",
                recommendation: "Ensure the file registers `window.CozyOS.<Name> = new <Class>()` exactly once.",
                test: (s, _m, self) => { const count = self.#countPattern(s, /window\.CozyOS\.\w+\s*=\s*new\s+\w+/g); return { pass: count === 1, detail: `${count} instantiation-exports found.` }; } });

            R({ id: "ARCH-012", group: "architecture", severity: SEVERITY.INFO,
                description: "DRY heuristic — no heavily repeated literal lines", reason: "Large blocks of near-identical code often indicate copy-paste rather than shared helpers.",
                impact: "Duplicated logic multiplies the surface area for future bugs and inconsistent fixes.",
                recommendation: "Extract repeated blocks into a shared private method.",
                test: (s) => {
                    const lines = s.split("\n").map(l => l.trim()).filter(l => l.length > 24);
                    const counts = new Map();
                    for (const l of lines) counts.set(l, (counts.get(l) || 0) + 1);
                    const worst = Array.from(counts.values()).reduce((m, c) => Math.max(m, c), 0);
                    return { pass: worst <= 3, detail: `Most-repeated non-trivial line occurs ${worst} times.` };
                } });

            // ---- 2. Security ----
            R({ id: "SEC-001", group: "security", severity: SEVERITY.CRITICAL,
                description: "Prototype-pollution guard on dynamic key assignment", reason: "Bracket-notation assignment from externally-influenced keys can pollute Object.prototype if `__proto__` is not rejected.",
                impact: "A crafted payload could pollute the shared prototype chain across the whole page.",
                recommendation: "Reject `__proto__`, `constructor`, and `prototype` as keys before any dynamic assignment or merge.",
                test: (s) => {
                    const hasDynamicAssign = /\[\s*[a-zA-Z_$][\w$]*\s*\]\s*=/.test(s);
                    const hasGuard = /__proto__/.test(s);
                    return { pass: !hasDynamicAssign || hasGuard, detail: hasDynamicAssign && !hasGuard ? "Dynamic key assignment found with no __proto__ guard nearby." : "OK" };
                } });

            R({ id: "SEC-002", group: "security", severity: SEVERITY.CRITICAL,
                description: "Constructor-injection guard", reason: "Merging external data into internal objects without rejecting a `constructor` key risks constructor-chain injection.",
                impact: "Could allow overriding constructor behavior via a crafted import/merge payload.",
                recommendation: "Explicitly reject the `constructor` key in any merge/import routine.",
                test: (s) => {
                    const hasMerge = /merge\w*\s*\(|Object\.assign\(/.test(s);
                    const hasGuard = /["']constructor["']/.test(s);
                    return { pass: !hasMerge || hasGuard, detail: hasMerge && !hasGuard ? "Merge/assign logic found with no explicit \"constructor\" key rejection." : "OK" };
                } });

            R({ id: "SEC-003", group: "security", severity: SEVERITY.HIGH,
                description: "Sensitive key rejection list", reason: "A denylist of dangerous keys should exist wherever external data is merged into internal state.",
                impact: "Without an explicit denylist, new dangerous keys could slip through unnoticed.",
                recommendation: "Maintain an explicit array/set like `[\"__proto__\", \"constructor\", \"prototype\"]` and check against it.",
                test: (s) => /__proto__/.test(s) && /constructor/.test(s) && /prototype/.test(s) });

            R({ id: "SEC-004", group: "security", severity: SEVERITY.CRITICAL,
                description: "No hardcoded secrets", reason: "API keys, passwords, or tokens should never be literal strings in source.",
                impact: "Hardcoded secrets committed to source are trivially exposed to anyone with file access.",
                recommendation: "Move any secret to a runtime-injected configuration source, never a string literal.",
                test: (s, _m, self) => {
                    const re = /["'](?:api[_-]?key|secret|password|token)["']\s*:\s*["'][^"']{6,}["']/i;
                    const found = re.test(s);
                    const line = found ? self.#lineOf(s, re) : null;
                    return { pass: !found, line, detail: found ? "Possible hardcoded credential literal found." : "OK" };
                } });

            R({ id: "SEC-005", group: "security", severity: SEVERITY.MEDIUM,
                description: "Event payload validation", reason: "emit() should sanity-check the event name / payload shape rather than blindly forwarding it.",
                impact: "Malformed events can crash or confuse listeners.",
                recommendation: "Validate `eventName` type and clone/sanitize the payload before dispatch.",
                test: (s) => /emit\s*\([^)]*\)\s*\{/.test(s) && /typeof\s+eventName/.test(s) });

            R({ id: "SEC-006", group: "security", severity: SEVERITY.HIGH,
                description: "Import/snapshot validation before merge", reason: "Imported snapshots are untrusted input and must be shape-checked before merging into live state.",
                impact: "An invalid or malicious snapshot could corrupt internal registries.",
                recommendation: "Validate `typeof`/`Array.isArray` on the snapshot shape before merging.",
                test: (s) => {
                    const hasImport = /import\w*Snapshot\s*\(|importSnapshot\s*\(/.test(s);
                    const hasValidation = /typeof\s+\w+\s*!==?\s*["']object["']|Array\.isArray\(/.test(s);
                    return { pass: !hasImport || hasValidation, detail: hasImport && !hasValidation ? "Import routine found with no visible shape validation." : "OK" };
                } });

            R({ id: "SEC-007", group: "security", severity: SEVERITY.MEDIUM,
                description: "Export returns cloned data, not live references", reason: "Exported snapshots should not hand back live internal Maps/objects.",
                impact: "Callers could mutate internal state through an exported reference.",
                recommendation: "Clone (deep clone / Array.from / spread) before returning exported data.",
                test: (s) => /export\w*Snapshot\s*\(/.test(s) ? (/#deepClone|structuredClone|Array\.from\(|\{\s*\.\.\./.test(s)) : true });

            R({ id: "SEC-008", group: "security", severity: SEVERITY.MEDIUM,
                description: "Immutable metadata / log records", reason: "Audit and certification records should be frozen at creation.",
                impact: "Mutable log entries could be tampered with after the fact, undermining the audit trail.",
                recommendation: "Wrap each record in `Object.freeze(...)` when it's created.",
                test: (s) => /Object\.freeze\(\s*\{?\s*(entry|record)?/.test(s) || /Object\.freeze\(\{/.test(s) });

            R({ id: "SEC-009", group: "security", severity: SEVERITY.MEDIUM,
                description: "Safe cloning on read (no direct Map/Array reference leak)", reason: "Getter-style methods returning `this.#collection` directly leak a live reference.",
                impact: "External code could push/splice/delete on the coordinator's private collection directly.",
                recommendation: "Return `Array.from(...)` or a cloned copy instead of the raw Map/Array.",
                test: (s) => /Array\.from\(\s*this\.#/.test(s) });

            R({ id: "SEC-010", group: "security", severity: SEVERITY.CRITICAL,
                description: "HTML escaping before DOM interpolation", reason: "Any dynamic string reaching innerHTML must be escaped to prevent XSS.",
                impact: "Unescaped interpolation into innerHTML is a direct stored/reflected XSS vector.",
                recommendation: "Route every dynamic value through an `#escapeHtml()` helper before interpolating into a template literal destined for innerHTML.",
                test: (s) => {
                    const usesInnerHtml = /\.innerHTML\s*=/.test(s);
                    const hasEscaper = /escapeHtml\s*\(/.test(s);
                    return { pass: !usesInnerHtml || hasEscaper, detail: usesInnerHtml && !hasEscaper ? "innerHTML assignment found with no escapeHtml() helper in use." : "OK" };
                } });

            R({ id: "SEC-011", group: "security", severity: SEVERITY.MEDIUM,
                description: "Safe JSON serialization", reason: "JSON.stringify on complex/circular objects can throw at runtime.",
                impact: "An uncaught serialization error can crash an export or event-emit path.",
                recommendation: "Wrap JSON.stringify calls in try/catch, or ensure inputs are known-safe plain data.",
                test: (s) => !/JSON\.stringify\(/.test(s) || /try\s*\{[^}]*JSON\.stringify/.test(s) || /catch/.test(s) });

            R({ id: "SEC-012", group: "security", severity: SEVERITY.HIGH,
                description: "Version-downgrade protection", reason: "Same guard as ARCH-005, viewed from a security angle: prevents a malicious or stale reload from silently downgrading a certified module.",
                impact: "Without it, an attacker-controlled script load order could quietly replace certified code with an older, vulnerable version.",
                recommendation: "Keep the VERSION_CONFLICT guard at load time (see ARCH-005).",
                test: (s) => /VERSION_CONFLICT/.test(s) });

            // ---- 3. Coordinator Standards ----
            R({ id: "COORD-001", group: "coordinator", severity: SEVERITY.HIGH,
                description: "getVersion() export", reason: "Required for discovery/version-conflict handling.", impact: "Coordinator is not properly discoverable.",
                recommendation: "Implement getVersion().", test: (s) => /getVersion\s*\(\s*\)/.test(s) });

            R({ id: "COORD-002", group: "coordinator", severity: SEVERITY.MEDIUM,
                description: "getDiagnosticsReport() method", reason: "Standard introspection surface for health/metrics.", impact: "Operators cannot pull structured diagnostics from the module.",
                recommendation: "Implement getDiagnosticsReport() returning a frozen metrics snapshot.", test: (s) => /getDiagnosticsReport\s*\(/.test(s) });

            R({ id: "COORD-003", group: "coordinator", severity: SEVERITY.MEDIUM,
                description: "Export function present", reason: "Coordinators should support exporting their state as a snapshot.", impact: "State cannot be backed up or migrated.",
                recommendation: "Implement an export*/Snapshot method.", test: (s) => /export\w*\s*\(/i.test(s) });

            R({ id: "COORD-004", group: "coordinator", severity: SEVERITY.MEDIUM,
                description: "Import function present", reason: "Coordinators should support restoring state from a snapshot.", impact: "State cannot be restored or migrated between environments.",
                recommendation: "Implement an import*/Snapshot method.", test: (s) => /import\w*\s*\(/i.test(s) });

            R({ id: "COORD-005", group: "coordinator", severity: SEVERITY.LOW,
                description: "Timeline tracking", reason: "A chronological event trail aids debugging and audit review.", impact: "No historical trail of significant coordinator events.",
                recommendation: "Maintain a bounded #timelineEvents array.", test: (s) => /timeline/i.test(s) });

            R({ id: "COORD-006", group: "coordinator", severity: SEVERITY.HIGH,
                description: "Audit logging", reason: "Enterprise coordinators must log significant actions for traceability.", impact: "No accountability trail for state-changing actions.",
                recommendation: "Maintain a bounded #auditLogs array with a #logAudit() helper.", test: (s) => /audit/i.test(s) });

            R({ id: "COORD-007", group: "coordinator", severity: SEVERITY.HIGH,
                description: "Full event bus (on/off/once/emit)", reason: "Coordinators communicate via a consistent pub/sub surface.", impact: "Other coordinators/WorkspaceShell cannot subscribe to this module's events.",
                recommendation: "Implement on(), off(), once(), and emit().",
                test: (s) => /\bon\s*\(/.test(s) && /\boff\s*\(/.test(s) && /\bonce\s*\(/.test(s) && /\bemit\s*\(/.test(s) });

            R({ id: "COORD-008", group: "coordinator", severity: SEVERITY.MEDIUM,
                description: "Registry engine (Map-based storage)", reason: "Internal collections should use Map for O(1) CRUD.", impact: "Array-based storage without Map degrades CRUD performance and code clarity.",
                recommendation: "Back primary collections with `new Map()`.", test: (s) => /new Map\(\)/.test(s) });

            R({ id: "COORD-009", group: "coordinator", severity: SEVERITY.LOW,
                description: "Plugin support surface", reason: "Enterprise coordinators are expected to support pluggable extensions.", impact: "No extension point for future rules/behaviors without core edits.",
                recommendation: "Expose a register/plugin mechanism.", test: (s) => /plugin/i.test(s) });

            R({ id: "COORD-010", group: "coordinator", severity: SEVERITY.LOW,
                description: "Closed integrations / dependency declarations", reason: "Coordinators should declare their dependencies explicitly.", impact: "Implicit dependencies make impact analysis and regression detection harder.",
                recommendation: "Declare a dependencies list in metadata.", test: (s) => /dependenc/i.test(s) });

            R({ id: "COORD-011", group: "coordinator", severity: SEVERITY.INFO,
                description: "Session-engine references", reason: "Session-aware coordinators track session lifecycle explicitly.", impact: "Informational only — not all coordinators need session tracking.",
                recommendation: "If the module has session semantics, track them explicitly; otherwise this check is not applicable.", test: (s) => /session/i.test(s) });

            // ---- 4. Diagnostics ----
            R({ id: "DIAG-001", group: "diagnostics", severity: SEVERITY.MEDIUM,
                description: "Counters object present", reason: "Structured counters are the basis of a diagnostics report.", impact: "No quantitative signal for health/usage monitoring.",
                recommendation: "Maintain a #diagnostics object with numeric counters.", test: (s) => /#?diagnostics\s*=\s*\{/.test(s) });

            R({ id: "DIAG-002", group: "diagnostics", severity: SEVERITY.MEDIUM,
                description: "Error tracking field", reason: "Diagnostics should surface a running error/incident count.", impact: "Silent failures accumulate with no visible signal.",
                recommendation: "Track an errors/errorsHidden counter in diagnostics.", test: (s) => /error/i.test(s) });

            R({ id: "DIAG-003", group: "diagnostics", severity: SEVERITY.LOW,
                description: "Timeline reflected in diagnostics", reason: "Timeline event count is a useful diagnostics signal.", impact: "Diagnostics report is incomplete without a timeline count.",
                recommendation: "Include timelineEventCount in getDiagnosticsReport().", test: (s) => /timeline/i.test(s) });

            R({ id: "DIAG-004", group: "diagnostics", severity: SEVERITY.LOW,
                description: "Audit reflected in diagnostics", reason: "Audit log count is a useful diagnostics signal.", impact: "Diagnostics report is incomplete without an audit count.",
                recommendation: "Include auditLogCount in getDiagnosticsReport().", test: (s) => /audit/i.test(s) });

            R({ id: "DIAG-005", group: "diagnostics", severity: SEVERITY.LOW,
                description: "Memory metric", reason: "A memory/footprint estimate is standard across CozyOS diagnostics.", impact: "No signal for memory-growth regressions.",
                recommendation: "Track a memoryBaseline (or similar) diagnostics field.", test: (s) => /memory/i.test(s) });

            R({ id: "DIAG-006", group: "diagnostics", severity: SEVERITY.LOW,
                description: "Registry count metric", reason: "Collection sizes should be observable.", impact: "Cannot detect unbounded registry growth without a size metric.",
                recommendation: "Expose `.size`/`.length` counts of primary collections.", test: (s) => /\.size\b/.test(s) });

            R({ id: "DIAG-007", group: "diagnostics", severity: SEVERITY.INFO,
                description: "Session count metric", reason: "If sessions exist, their count should be observable.", impact: "Informational only.",
                recommendation: "Expose a session count if the module tracks sessions.", test: (s) => /session/i.test(s) });

            R({ id: "DIAG-008", group: "diagnostics", severity: SEVERITY.INFO,
                description: "Plugin count metric", reason: "If plugins exist, their count should be observable.", impact: "Informational only.",
                recommendation: "Expose a plugin count if the module supports plugins.", test: (s) => /plugin/i.test(s) });

            R({ id: "DIAG-009", group: "diagnostics", severity: SEVERITY.INFO,
                description: "Integration count metric", reason: "If external integrations exist, their count should be observable.", impact: "Informational only.",
                recommendation: "Expose an integration/dependency count.", test: (s) => /integration|dependenc/i.test(s) });

            // ---- 5. Event System ----
            R({ id: "EVENT-001", group: "event", severity: SEVERITY.HIGH, description: "on() present", reason: "Subscription is core to pub/sub.", impact: "Other modules cannot subscribe to events.", recommendation: "Implement on(eventName, handler).", test: (s) => /\bon\s*\(/.test(s) });
            R({ id: "EVENT-002", group: "event", severity: SEVERITY.MEDIUM, description: "off() present", reason: "Unsubscription prevents listener leaks.", impact: "Listeners accumulate indefinitely, leaking memory.", recommendation: "Implement off(eventName, handler).", test: (s) => /\boff\s*\(/.test(s) });
            R({ id: "EVENT-003", group: "event", severity: SEVERITY.LOW, description: "once() present", reason: "One-shot subscriptions are a common, expected convenience.", impact: "Callers must manually unsubscribe after first invocation.", recommendation: "Implement once(eventName, handler).", test: (s) => /\bonce\s*\(/.test(s) });
            R({ id: "EVENT-004", group: "event", severity: SEVERITY.HIGH, description: "emit() present", reason: "Dispatch is the other half of pub/sub.", impact: "The module cannot notify subscribers of anything.", recommendation: "Implement emit(eventName, payload).", test: (s) => /\bemit\s*\(/.test(s) });
            R({ id: "EVENT-005", group: "event", severity: SEVERITY.MEDIUM, description: "Payload validation on emit", reason: "Same as SEC-005 — dispatch should validate before fan-out.", impact: "Malformed payloads propagate to every listener.", recommendation: "Validate eventName/payload shape inside emit().", test: (s) => /emit\s*\([^)]*\)\s*\{/.test(s) && /typeof\s+eventName/.test(s) });
            R({ id: "EVENT-006", group: "event", severity: SEVERITY.LOW, description: "Consistent colon-namespaced event names", reason: "CozyOS convention uses `domain:action` event names (e.g. session:create).", impact: "Inconsistent naming makes cross-module event wiring error-prone.", recommendation: "Use `lowercase:lowercase` event name literals throughout.", test: (s) => /["'][a-z][a-z0-9]*:[a-z][a-z0-9]*["']/.test(s) });

            // ---- 6. Registry Engine (CRUD) ----
            R({ id: "REG-001", group: "registry", severity: SEVERITY.MEDIUM, description: "Create operation", reason: "CRUD create is foundational to a registry.", impact: "No supported way to add new records.", recommendation: "Implement a create*() method.", test: (s) => /\bcreate\w*\s*\(/i.test(s) });
            R({ id: "REG-002", group: "registry", severity: SEVERITY.MEDIUM, description: "Read/get operation", reason: "CRUD read is foundational to a registry.", impact: "No supported way to retrieve a single record.", recommendation: "Implement a get*()/read*() method.", test: (s) => /\b(get|read)\w*\s*\(/i.test(s) });
            R({ id: "REG-003", group: "registry", severity: SEVERITY.MEDIUM, description: "Update operation", reason: "CRUD update is foundational to a registry.", impact: "Records cannot be amended once created.", recommendation: "Implement an update*() method.", test: (s) => /\bupdate\w*\s*\(/i.test(s) });
            R({ id: "REG-004", group: "registry", severity: SEVERITY.MEDIUM, description: "Delete operation", reason: "CRUD delete is foundational to a registry.", impact: "Records cannot be removed.", recommendation: "Implement a delete*()/remove*() method.", test: (s) => /\b(delete|remove)\w*\s*\(/i.test(s) });
            R({ id: "REG-005", group: "registry", severity: SEVERITY.LOW, description: "List operation", reason: "Bulk enumeration is a standard registry operation.", impact: "Callers cannot enumerate records.", recommendation: "Implement a list*() method.", test: (s) => /\blist\w*\s*\(/i.test(s) });
            R({ id: "REG-006", group: "registry", severity: SEVERITY.LOW, description: "Count operation", reason: "Cheap size introspection avoids full enumeration for a simple count.", impact: "Callers must list-then-length instead of a direct count.", recommendation: "Implement a count*() method (or expose `.size`).", test: (s) => /\bcount\w*\s*\(/i.test(s) || /\.size\b/.test(s) });
            R({ id: "REG-007", group: "registry", severity: SEVERITY.LOW, description: "Has/exists operation", reason: "Existence checks should not require a full read.", impact: "Callers must read-then-check-undefined instead of a direct has().", recommendation: "Implement a has*() method (or expose `.has(`).", test: (s) => /\bhas\w*\s*\(/i.test(s) || /\.has\(/.test(s) });
            R({ id: "REG-008", group: "registry", severity: SEVERITY.MEDIUM, description: "Merge operation", reason: "Merging imported data into the live registry needs an explicit strategy.", impact: "Ad-hoc merging risks silently overwriting or duplicating records.", recommendation: "Implement a merge*() method with an explicit conflict strategy.", test: (s) => /merge\w*\s*\(/i.test(s) });
            R({ id: "REG-009", group: "registry", severity: SEVERITY.MEDIUM, description: "Snapshot operation", reason: "A point-in-time snapshot underlies both export and regression comparison.", impact: "No consistent basis for backup, export, or regression diffing.", recommendation: "Implement a snapshot*() method returning a frozen clone of registry state.", test: (s) => /snapshot\w*\s*\(/i.test(s) });

            // ---- 7. Import / Export ----
            R({ id: "IE-001", group: "importexport", severity: SEVERITY.MEDIUM, description: "Export-snapshot method", reason: "Required for backup/migration.", impact: "State cannot leave the module in a portable form.", recommendation: "Implement exportSnapshot().", test: (s) => /export\w*Snapshot\s*\(|exportSnapshot\s*\(/i.test(s) });
            R({ id: "IE-002", group: "importexport", severity: SEVERITY.MEDIUM, description: "Import-snapshot method", reason: "Required for restore/migration.", impact: "Exported state cannot be restored anywhere.", recommendation: "Implement importSnapshot().", test: (s) => /import\w*Snapshot\s*\(|importSnapshot\s*\(/i.test(s) });
            R({ id: "IE-003", group: "importexport", severity: SEVERITY.MEDIUM, description: "Explicit merge strategy on import", reason: "Import needs a named strategy (replace/merge) rather than implicit behavior.", impact: "Ambiguous import behavior risks silent data loss.", recommendation: "Accept an explicit `mergeStrategy` option on import.", test: (s) => /mergeStrategy|strategy\s*[:=]/.test(s) });
            R({ id: "IE-004", group: "importexport", severity: SEVERITY.MEDIUM, description: "Conflict handling on import", reason: "Concurrent/duplicate IDs across import boundaries need a defined resolution.", impact: "Colliding records could be silently dropped or duplicated.", recommendation: "Define and document conflict resolution (e.g. latest-timestamp-wins).", test: (s) => /conflict/i.test(s) });
            R({ id: "IE-005", group: "importexport", severity: SEVERITY.LOW, description: "Metadata preservation across import/export", reason: "Round-tripping should not drop metadata fields.", impact: "Re-imported records could lose auditability metadata.", recommendation: "Ensure export/import round-trips all metadata fields untouched.", test: (s) => /metadata/i.test(s) });
            R({ id: "IE-006", group: "importexport", severity: SEVERITY.LOW, description: "Version preservation across import/export", reason: "Snapshots should carry the version they were produced under.", impact: "Without a version tag, a snapshot's provenance is ambiguous.", recommendation: "Include the coordinator version in every exported snapshot.", test: (s) => /version/i.test(s) });

            // ---- 8. Versioning ----
            R({ id: "VER-001", group: "versioning", severity: SEVERITY.HIGH, description: "Version-conflict guard", reason: "Same as ARCH-005/SEC-012.", impact: "Silent version downgrade/mismatch on reload.", recommendation: "Keep the VERSION_CONFLICT guard.", test: (s) => /VERSION_CONFLICT/.test(s) });
            R({ id: "VER-002", group: "versioning", severity: SEVERITY.MEDIUM, description: "Semantic version format", reason: "Versions should follow a recognizable x.y.z(-suffix) pattern.", impact: "Non-semver strings break automated compatibility comparisons.", recommendation: "Use a version string like `2.0.0-ENTERPRISE`.", test: (s) => /["']?\d+\.\d+\.\d+(-[A-Za-z0-9]+)?["']?/.test(s) });
            R({ id: "VER-003", group: "versioning", severity: SEVERITY.LOW, description: "Single source-of-truth version constant", reason: "Version should be declared once and reused, not repeated as separate literals.", impact: "Divergent version literals in the same file are a common source of certification drift.", recommendation: "Declare one `const X_VERSION = \"...\"` and reference it everywhere.", test: (s) => /const\s+\w*VERSION\w*\s*=/.test(s) });
            R({ id: "VER-004", group: "versioning", severity: SEVERITY.LOW, description: "Compatibility check logic", reason: "Cross-module compatibility should be checked explicitly, not assumed.", impact: "Incompatible module pairings could be certified together by mistake.", recommendation: "Add a compatibility-check function comparing declared version ranges.", test: (s) => /compat/i.test(s) });

            // ---- 9. Performance ----
            R({ id: "PERF-001", group: "performance", severity: SEVERITY.HIGH, description: "Bounded arrays", reason: "Log/event arrays must have an upper bound to avoid unbounded memory growth.", impact: "A long-running session could grow an unbounded array indefinitely.", recommendation: "Cap arrays with a `.length > N` check followed by shift()/pop().", test: (s) => /\.length\s*>\s*\d+\s*\)\s*[\w.#]*\.(shift|pop)\(\)/.test(s) });
            R({ id: "PERF-002", group: "performance", severity: SEVERITY.LOW, description: "No unbounded-growth comments left unresolved", reason: "TODO/FIXME markers about growth usually indicate a known unresolved leak.", impact: "A documented-but-unfixed issue is worse than an undocumented one — it signals technical debt was deferred.", recommendation: "Resolve or explicitly re-scope any growth-related TODO/FIXME.", test: (s) => !/(TODO|FIXME).{0,40}(unbounded|grow|leak)/i.test(s) });
            R({ id: "PERF-003", group: "performance", severity: SEVERITY.HIGH, description: "No dangling intervals/timers", reason: "setInterval without a matching clearInterval leaks a timer for the page's lifetime.", impact: "Background timers keep running (and holding closures) after the module is no longer needed.", recommendation: "Pair every setInterval with a stored handle and a clearInterval path.", test: (s) => !/setInterval\(/.test(s) || /clearInterval\(/.test(s) });
            R({ id: "PERF-004", group: "performance", severity: SEVERITY.MEDIUM, description: "No duplicate listener registration", reason: "Re-binding a document/window-level listener on every render/cycle stacks duplicate handlers.", impact: "Each cycle adds another listener, causing handlers to fire multiple times per real event.", recommendation: "Guard one-time global listener registration with a boolean flag (e.g. `#boundOnce`).", test: (s) => !/addEventListener\(/.test(s) || /Bound\s*=\s*(true|false)/.test(s) });
            R({ id: "PERF-005", group: "performance", severity: SEVERITY.LOW, description: "No duplicated registries", reason: "The same domain data should live in exactly one Map, not parallel structures that can drift.", impact: "Parallel registries for the same data invite desync bugs.", recommendation: "Consolidate to a single Map per logical registry.", test: (s, _m, self) => { const count = self.#countPattern(s, /new Map\(\)/g); return { pass: count <= 6, detail: `${count} Map instances declared.` }; } });
            R({ id: "PERF-006", group: "performance", severity: SEVERITY.MEDIUM, description: "No duplicated exports", reason: "Same as ARCH-011 — a single namespace export avoids duplicate singleton instances.", impact: "Duplicate instantiation risks divergent in-memory state under the same name.", recommendation: "Export exactly one instance under the namespace.", test: (s, _m, self) => self.#countPattern(s, /window\.CozyOS\.\w+\s*=\s*new\s+\w+/g) === 1 });

            // ---- 10. UI Safety ----
            R({ id: "UI-001", group: "uisafety", severity: SEVERITY.HIGH, description: "Escape-HTML helper present", reason: "A dedicated escaping helper is the baseline defense against XSS in template rendering.", impact: "Without a helper, escaping is ad hoc and easy to forget at any given call site.", recommendation: "Implement `#escapeHtml(value)` covering & < > \" '.", test: (s) => /escapeHtml\s*\(\s*value/.test(s) || /function\s+escapeHtml|#escapeHtml\s*\(/.test(s) });
            R({ id: "UI-002", group: "uisafety", severity: SEVERITY.HIGH, description: "Escaping actually applied at interpolation sites", reason: "Defining an escaper is meaningless if template literals don't call it.", impact: "Unescaped interpolation remains exploitable even with a helper defined elsewhere.", recommendation: "Call escapeHtml(...) around every dynamic value inside a template literal feeding innerHTML.", test: (s, _m, self) => { const usesInnerHtml = /\.innerHTML\s*=/.test(s); const escapeCalls = self.#countPattern(s, /escapeHtml\(/g); return { pass: !usesInnerHtml || escapeCalls >= 3, detail: `${escapeCalls} escapeHtml() call sites found.` }; } });
            R({ id: "UI-003", group: "uisafety", severity: SEVERITY.CRITICAL, description: "No document.write / raw HTML sinks", reason: "Raw HTML-sink DOM APIs bypass any escaping discipline used elsewhere.", impact: "A raw HTML sink is a direct XSS vector regardless of other precautions.", recommendation: "Avoid raw HTML-writing DOM APIs; build DOM nodes or sanitized innerHTML only.", test: (s) => !/document\.write\(/.test(s) });
            R({ id: "UI-004", group: "uisafety", severity: SEVERITY.MEDIUM, description: "Safe-mount guard", reason: "DOM mount/render entry points should validate their target before touching the DOM.", impact: "Calling mount() with a bad target throws an unhelpful low-level DOM error.", recommendation: "Validate the mount target and throw a clear, named error if invalid.", test: (s) => !/mount\s*\(/.test(s) || /throw new Error/.test(s) });
            R({ id: "UI-005", group: "uisafety", severity: SEVERITY.INFO, description: "Template-literal interpolation ratio (heuristic)", reason: "A very high ratio of raw `${...}` interpolations to escapeHtml() calls suggests some sites may be unescaped.", impact: "Informational — flags files worth a closer manual look, not a definitive defect.", recommendation: "Manually audit template literals where the ratio looks high.", test: (s, _m, self) => { const raw = self.#countPattern(s, /\$\{/g); const escaped = self.#countPattern(s, /escapeHtml\(/g); return { pass: raw === 0 || escaped / Math.max(raw, 1) >= 0.15, detail: `${escaped} escapeHtml() calls across ${raw} interpolation sites.` }; } });

            // ---- 11. Enterprise Consistency (vs baseline CozyOS API surface) ----
            R({ id: "CONSIST-001", group: "consistency", severity: SEVERITY.HIGH, description: "No missing standard APIs", reason: "Every certified coordinator exposes getVersion, on, off, emit, getDiagnosticsReport.", impact: "A module missing baseline APIs cannot be uniformly discovered, monitored, or wired by other coordinators.", recommendation: "Implement all five standard API surface methods.", test: (s) => ["getVersion", "\\bon\\s*\\(", "\\boff\\s*\\(", "\\bemit\\s*\\(", "getDiagnosticsReport"].every(p => new RegExp(p).test(s)) });
            R({ id: "CONSIST-002", group: "consistency", severity: SEVERITY.MEDIUM, description: "No missing diagnostics", reason: "Consistency with the rest of the fleet's introspection surface.", impact: "Operators lose a uniform place to check module health.", recommendation: "Implement getDiagnosticsReport().", test: (s) => /getDiagnosticsReport/.test(s) });
            R({ id: "CONSIST-003", group: "consistency", severity: SEVERITY.MEDIUM, description: "No missing audit trail", reason: "Consistency with the rest of the fleet's accountability surface.", impact: "Fleet-wide audit tooling would have a blind spot for this module.", recommendation: "Implement #logAudit()/#auditLogs.", test: (s) => /audit/i.test(s) });
            R({ id: "CONSIST-004", group: "consistency", severity: SEVERITY.LOW, description: "No missing timeline", reason: "Consistency with the rest of the fleet's chronological trail.", impact: "Fleet-wide timeline views would have a gap for this module.", recommendation: "Implement #timelineEvents/#logTimeline().", test: (s) => /timeline/i.test(s) });
            R({ id: "CONSIST-005", group: "consistency", severity: SEVERITY.MEDIUM, description: "No missing registries", reason: "Consistency with the rest of the fleet's Map-backed storage pattern.", impact: "Non-standard storage complicates cross-module tooling (import/export, snapshotting).", recommendation: "Back primary state with Map-based registries.", test: (s) => /new Map\(\)/.test(s) });
            R({ id: "CONSIST-006", group: "consistency", severity: SEVERITY.INFO, description: "No missing sessions (where applicable)", reason: "Informational parity check against session-aware coordinators.", impact: "Informational only.", recommendation: "Add session tracking if the module's domain implies it.", test: (s) => /session/i.test(s) });
            R({ id: "CONSIST-007", group: "consistency", severity: SEVERITY.LOW, description: "No missing metadata fields", reason: "Records across the fleet should carry consistent metadata (id, timestamp, version).", impact: "Inconsistent record shapes make cross-module reporting harder.", recommendation: "Ensure records include id/timestamp/version fields.", test: (s) => /timestamp/i.test(s) && /\bid\b/.test(s) });

            // ---- 12. Documentation ----
            R({ id: "DOC-001", group: "documentation", severity: SEVERITY.HIGH, description: "Enterprise header comment block", reason: "Every coordinator file opens with a standard /** ... */ header.", impact: "Missing header makes the file's purpose and layer unclear at a glance.", recommendation: "Add a header block matching the CozyOS Enterprise Framework format.", test: (s) => /^\s*\/\*\*/.test(s) });
            R({ id: "DOC-002", group: "documentation", severity: SEVERITY.MEDIUM, description: "Version field in header", reason: "The header should state the file's version explicitly.", impact: "Readers can't confirm which version they're looking at without hunting through the code.", recommendation: "Add a `* Version: x.y.z` line to the header.", test: (s) => /\*\s*Version:/.test(s) });
            R({ id: "DOC-003", group: "documentation", severity: SEVERITY.MEDIUM, description: "File-reference line in header", reason: "The header should state the canonical path of the file.", impact: "Harder to confirm the file matches its expected location in the repo.", recommendation: "Add a `* File Reference: path/to/file.js` line.", test: (s) => /File Reference:/.test(s) });
            R({ id: "DOC-004", group: "documentation", severity: SEVERITY.LOW, description: "Layer / responsibilities description", reason: "The header should state the architectural layer and responsibilities.", impact: "Harder for reviewers to judge whether the file belongs where it lives.", recommendation: "Add `* Layer:` and a short responsibilities note.", test: (s) => /Layer:|Responsibilit/i.test(s) });
            R({ id: "DOC-005", group: "documentation", severity: SEVERITY.INFO, description: "Inline comment density (heuristic)", reason: "Non-trivial coordinator logic benefits from some inline explanation.", impact: "Informational — low comment density isn't a defect by itself, just a signal worth a manual look.", recommendation: "Add brief comments around any non-obvious logic.", test: (s) => { const lines = s.split("\n"); const commentLines = lines.filter(l => /^\s*(\/\/|\*|\/\*)/.test(l)).length; return { pass: lines.length === 0 || commentLines / lines.length >= 0.03, detail: `${commentLines}/${lines.length} lines are comments.` }; } });
            R({ id: "DOC-006", group: "documentation", severity: SEVERITY.LOW, description: "Substantive coordinator description", reason: "The header should be more than a one-liner — enough to orient a new reader.", impact: "A too-thin header forces readers to reverse-engineer intent from code.", recommendation: "Expand the header to at least a few descriptive lines.", test: (s) => { const m = /\/\*\*([\s\S]*?)\*\//.exec(s); return m ? m[1].split("\n").filter(l => l.trim().length > 0).length >= 3 : false; } });

            this.#logAudit("RULES_LOADED", `Default enterprise rule set registered: ${this.#rules.size} rules across 12 check groups.`);
        }

        // =====================================================================
        // ─── VERDICT / SCORE COMPUTATION ─────────────────────────────────────
        // =====================================================================

        #computeVerdict({ total, passed, criticalFailures, highFailures }) {
            if (total === 0) return CERT_LEVELS.UNKNOWN;
            const score = (passed / total) * 100;
            if (criticalFailures > 0) return CERT_LEVELS.CERTIFICATION_FAILED;
            if (score === 100) return CERT_LEVELS.ENTERPRISE_CERTIFIED;
            if (score >= 85 && highFailures === 0) return CERT_LEVELS.ENTERPRISE_CERTIFIED;
            if (score >= 70) return CERT_LEVELS.CERTIFIED_WITH_WARNINGS;
            return CERT_LEVELS.CERTIFICATION_FAILED;
        }

        #nextCertificationId(moduleId, version) {
            const seq = (this.#idSequence.get(moduleId) || 0) + 1;
            this.#idSequence.set(moduleId, seq);
            const tag = String(moduleId).toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/(^-|-$)/g, "");
            const seqStr = String(seq).padStart(3, "0");
            return `CZ-${tag}-${seqStr}-${version || "0.0.0"}`;
        }

        // =====================================================================
        // ─── REPORT ENRICHMENT (dashboard, priority queue, diagrams, fixes) ──
        // =====================================================================

        static #GROUP_LABELS = {
            syntax: "Syntax Sanity", architecture: "Architecture", security: "Security",
            coordinator: "Coordinator Standards", diagnostics: "Diagnostics", event: "Event System",
            registry: "Registry Engine", importexport: "Import / Export", versioning: "Versioning",
            performance: "Performance", uisafety: "UI Safety", consistency: "Enterprise Consistency",
            documentation: "Documentation"
        };

        // Curated, illustrative fix guidance for the rules most likely to need a
        // concrete example. Anything not listed here falls back to a generic
        // snippet built from the rule's own `recommendation` text — never a
        // fabricated rewrite of the caller's actual code.
        static #FIX_HINTS = {
            "SEC-010": { minutes: 8, snippet: 'const safe = this.#escapeHtml(userValue);\ncontainer.innerHTML = `<span>${safe}</span>`;' },
            "UI-002": { minutes: 8, snippet: 'container.innerHTML = `<div>${this.#escapeHtml(dynamicValue)}</div>`;' },
            "UI-003": { minutes: 5, snippet: 'const node = document.createElement("div");\nnode.textContent = value; // avoid raw HTML sinks entirely' },
            "EVENT-002": { minutes: 3, snippet: 'const unsubscribe = coordinator.on("session:create", handler);\n// later, when the session/component tears down:\nunsubscribe(); // or coordinator.off("session:create", handler);' },
            "PERF-003": { minutes: 3, snippet: 'const handle = setInterval(tick, 1000);\n// on teardown:\nclearInterval(handle);' },
            "PERF-001": { minutes: 4, snippet: 'this.#auditLogs.push(entry);\nif (this.#auditLogs.length > 500) this.#auditLogs.shift();' },
            "PERF-004": { minutes: 4, snippet: 'if (!this.#boundOnce) {\n    document.addEventListener("click", this.#handleDocClick);\n    this.#boundOnce = true;\n}' },
            "SEC-004": { minutes: 10, snippet: '// move the literal out of source:\nconst apiKey = window.CozyOS.Config.get("SERVICE_API_KEY");' },
            "SEC-001": { minutes: 10, snippet: 'if (key === "__proto__" || key === "constructor" || key === "prototype") continue; // reject before assignment\ntarget[key] = value;' },
            "SEC-002": { minutes: 10, snippet: 'const DENY_KEYS = new Set(["__proto__", "constructor", "prototype"]);\nfor (const key of Object.keys(incoming)) {\n    if (DENY_KEYS.has(key)) continue;\n    target[key] = incoming[key];\n}' },
            "ARCH-005": { minutes: 6, snippet: 'if (window.CozyOS.Speech && window.CozyOS.Speech.getVersion() !== SPEECH_VERSION) {\n    throw new Error("VERSION_CONFLICT: ...");\n}' },
            "COORD-006": { minutes: 12, snippet: '#logAudit(action, msg) {\n    this.#auditLogs.push(Object.freeze({ id: crypto.randomUUID(), timestamp: new Date().toISOString(), action, msg }));\n    if (this.#auditLogs.length > 500) this.#auditLogs.shift();\n}' },
            "IE-001": { minutes: 12, snippet: 'exportSnapshot() {\n    return this.#deepFreeze(this.#deepClone({ exportedAt: new Date().toISOString(), data: [...this.#registry.values()] }));\n}' },
            "IE-002": { minutes: 12, snippet: 'importSnapshot(snapshot, { mergeStrategy = "merge" } = {}) {\n    if (!snapshot || !Array.isArray(snapshot.data)) throw new TypeError("invalid snapshot");\n    // ...validate, then merge or replace\n}' }
        };

        #niceGroupName(group) { return CozyOSCertificationCoordinator.#GROUP_LABELS[group] || group; }

        #estimatedFixMinutes(ruleId, severity) {
            const hint = CozyOSCertificationCoordinator.#FIX_HINTS[ruleId];
            if (hint) return hint.minutes;
            return { CRITICAL: 15, HIGH: 10, MEDIUM: 5, LOW: 3, INFO: 2 }[severity] || 5;
        }

        #suggestedFix(rule) {
            const hint = CozyOSCertificationCoordinator.#FIX_HINTS[rule.id];
            if (hint) return hint.snippet;
            // Generic fallback — restates the recommendation as a comment, never
            // a fabricated rewrite of code we haven't actually seen fixed.
            return `// Suggested direction (${rule.id}):\n// ${rule.recommendation}`;
        }

        #priorityTier(severity) {
            switch (severity) {
                case SEVERITY.CRITICAL: return { emoji: "🔴", label: "Critical (fix before release)" };
                case SEVERITY.HIGH: return { emoji: "🟠", label: "High" };
                case SEVERITY.MEDIUM: return { emoji: "🟡", label: "Medium" };
                case SEVERITY.LOW: return { emoji: "🔵", label: "Low" };
                default: return { emoji: "🟢", label: "Suggestion" };
            }
        }

        // Heuristic only: scans backward from the matched line for the nearest
        // enclosing function/method signature. Not a real scope resolver — it
        // will occasionally point to the wrong enclosing block in deeply nested
        // or minified code, which is why it's always labeled "approximate".
        #approximateFunctionName(source, lineNumber) {
            if (!lineNumber) return "not localized (module-wide check)";
            const lines = source.split("\n");
            const fnPattern = /(?:^|\s)(?:function\s+([A-Za-z_$][\w$]*)|(?:#|)([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{|class\s+([A-Za-z_$][\w$]*))/;
            for (let i = Math.min(lineNumber, lines.length) - 1; i >= 0; i--) {
                const m = fnPattern.exec(lines[i]);
                if (m) {
                    const name = m[1] || m[2] || m[3];
                    if (name && !["if", "for", "while", "switch", "catch"].includes(name)) return `${name}() [approx.]`;
                }
            }
            return "module scope (top-level) [approx.]";
        }

        // Returns { startLine, lines: [{num, text, isTarget}] } for a small
        // context window around the offending line — never the whole file.
        #codeSnippet(source, lineNumber, context = 2) {
            if (!lineNumber) return null;
            const lines = source.split("\n");
            const idx = lineNumber - 1;
            const start = Math.max(0, idx - context);
            const end = Math.min(lines.length - 1, idx + context);
            const snippetLines = [];
            for (let i = start; i <= end; i++) {
                snippetLines.push({ num: i + 1, text: lines[i], isTarget: i === idx });
            }
            return { startLine: start + 1, lines: snippetLines };
        }

        #overallGrade(scorePercent) {
            if (scorePercent >= 97) return "A+";
            if (scorePercent >= 93) return "A";
            if (scorePercent >= 90) return "A-";
            if (scorePercent >= 85) return "B+";
            if (scorePercent >= 80) return "B";
            if (scorePercent >= 70) return "C";
            if (scorePercent >= 60) return "D";
            return "F";
        }

        #computeDashboard(checksByGroup) {
            const rows = Object.entries(checksByGroup).map(([group, stats]) => ({
                group, label: this.#niceGroupName(group),
                percent: stats.total === 0 ? 100 : Math.round((stats.passed / stats.total) * 1000) / 10,
                passed: stats.passed, total: stats.total
            }));
            rows.sort((a, b) => a.label.localeCompare(b.label));
            return rows;
        }

        #computeReleaseReadiness(severityCounts) {
            if (severityCounts.critical > 0) return { status: "NOT_READY", label: "❌ Not ready for deployment" };
            if (severityCounts.high > 0) return { status: "READY_AFTER_HIGH", label: "⚠ Ready after High issues are fixed" };
            return { status: "READY", label: "✅ Ready for Production" };
        }

        #computeArchitectureDiagram(checksByGroup) {
            // A module-level tree showing pass/fail per check group, in the
            // spirit of the coordinator's own section structure.
            const order = ["coordinator", "registry", "event", "diagnostics", "importexport", "security", "uisafety", "documentation"];
            const present = order.filter(g => checksByGroup[g]);
            return present.map((group, i) => {
                const stats = checksByGroup[group];
                const ok = stats.failed === 0;
                return { group, label: this.#niceGroupName(group), ok, isLast: i === present.length - 1 };
            });
        }

        #buildCertificate(report) {
            return {
                title: "CozyOS Enterprise Certification",
                module: report.moduleName,
                version: report.version,
                result: report.verdict,
                score: report.summary.scorePercent,
                critical: report.severityCounts.critical,
                high: report.severityCounts.high,
                medium: report.severityCounts.medium,
                low: report.severityCounts.low,
                waived: report.summary.waived || 0,
                state: report.frozen ? "FROZEN" : "ACTIVE",
                certificationEngine: `CozyOS Enterprise Certification Engine v${report.auditorVersion}`,
                ruleSetVersion: report.ruleSetVersion,
                certificationDate: report.timestamp.slice(0, 10),
                certificationId: report.certificationId
            };
        }

        // =====================================================================
        // ─── MODULE CERTIFICATION (main entry point) ─────────────────────────
        // =====================================================================

        /**
         * certifyModule(sourceText, metadata)
         *   metadata: { moduleId, moduleName, version, auditorVersion, filePath }
         * Returns a frozen certification report. Never executes sourceText.
         */
        certifyModule(sourceText, metadata = {}) {
            this.#diagnostics.certificationsRun++;
            const moduleId = metadata.moduleId || "unknown_module";
            const moduleName = metadata.moduleName || moduleId;
            const version = metadata.version || "0.0.0";
            const auditorVersion = CERT_VERSION;
            const certificationId = this.#nextCertificationId(moduleId, version);
            const timestamp = new Date().toISOString();
            const ruleSetVersion = this.#ruleSetVersion;

            if (typeof sourceText !== "string" || sourceText.trim().length === 0) {
                const failReport = this.#deepFreeze({
                    certificationId, moduleId, moduleName, version, auditorVersion, timestamp, ruleSetVersion,
                    verdict: CERT_LEVELS.NOT_CERTIFIED,
                    certificationLevel: DEPLOYMENT_READINESS.NOT_CERTIFIED,
                    verificationMethod: "Static source analysis (heuristic, execution-free)",
                    summary: { totalChecks: 0, passed: 0, failed: 0, warnings: 0, waived: 0, scorePercent: 0, adjustedScorePercent: 0 },
                    checksByGroup: {},
                    defects: [{
                        id: "SYN-000", severity: SEVERITY.CRITICAL, group: "syntax",
                        description: "No source provided", location: null,
                        reason: "certifyModule() requires non-empty source text.",
                        impact: "The module cannot be evaluated at all.",
                        recommendation: "Provide the module's full source text.",
                        waived: false, waiver: null
                    }],
                    regression: null,
                    sourceHash: null, frozen: false, frozenViolation: null, baselineComparison: null
                });
                this.#storeRecord(moduleId, failReport);
                return failReport;
            }

            const sourceHash = this.#hashSource(sourceText);
            const frozenInfo = this.#frozenModules.get(moduleId) || null;
            const frozenViolation = frozenInfo
                ? (frozenInfo.sourceHash !== sourceHash
                    ? { violated: true, message: "Certified module modified. Re-certification required.", frozenAt: frozenInfo.frozenAt, frozenCertificationId: frozenInfo.certificationId }
                    : { violated: false, message: "Source unchanged since freeze.", frozenAt: frozenInfo.frozenAt, frozenCertificationId: frozenInfo.certificationId })
                : null;

            const results = [];
            for (const rule of this.#rules.values()) {
                this.#diagnostics.rulesEvaluated++;
                let outcome;
                try {
                    outcome = rule.evaluate(sourceText, metadata);
                } catch (_err) {
                    this.#diagnostics.errorsHidden++;
                    outcome = { pass: false, detail: "Rule evaluation threw an internal error and was treated as a failure." };
                }
                results.push({ rule, outcome });
            }

            const total = results.length;
            const passed = results.filter(r => r.outcome.pass).length;
            // Raw score — always reflects true rule-pass rate, unaffected by
            // waivers. Waivers change what BLOCKS certification, not what the
            // engine measures; a waived issue is still a real issue.
            const scorePercent = Math.round((passed / total) * 1000) / 10;

            const activeWaivers = this.#activeWaiverMap(moduleId, timestamp);
            const failedResultsAll = results.filter(r => !r.outcome.pass);
            const nonWaivedFailed = failedResultsAll.filter(r => !activeWaivers.has(r.rule.id));
            const waivedFailed = failedResultsAll.filter(r => activeWaivers.has(r.rule.id));

            // Preservation Rule enforcement: only runs when the caller
            // explicitly supplies the prior version's source text (this
            // engine does not retain full source across certifications,
            // only hashes — see checkFeaturePreservation() for why this is
            // opt-in per call rather than automatic from history). Runs
            // BEFORE verdict computation below so a removed public method
            // genuinely blocks certification rather than only appearing
            // cosmetically in the defect list afterward.
            let apiSurfaceRegression = null;
            const preservationDefects = [];
            const preservationWaived = !!(metadata.approvedBreakingChange && activeWaivers.has("PRESERVE-001"));
            if (typeof metadata.previousSourceText === "string" && metadata.previousSourceText.trim()) {
                apiSurfaceRegression = this.checkFeaturePreservation(metadata.previousSourceText, sourceText);
                if (apiSurfaceRegression.hasRegression && !metadata.approvedBreakingChange) {
                    for (const methodName of apiSurfaceRegression.removedMethods) {
                        preservationDefects.push({
                            id: "PRESERVE-001", severity: SEVERITY.HIGH, group: "regression",
                            description: `Public method "${methodName}()" was removed compared to the previous version.`,
                            location: null,
                            reason: "The Preservation Rule requires every previously-implemented public capability to remain unless its removal is explicitly approved.",
                            impact: "Any code depending on this method will break.",
                            recommendation: `Restore "${methodName}()", or pass approvedBreakingChange:true in certifyModule() metadata if this removal is intentional and approved.`,
                            waived: preservationWaived,
                            waiver: preservationWaived ? (this.#waivers.get(moduleId)?.get("PRESERVE-001") || null) : null
                        });
                    }
                }
            }

            const criticalFailures = nonWaivedFailed.filter(r => r.rule.severity === SEVERITY.CRITICAL).length;
            const highFailures = nonWaivedFailed.filter(r => r.rule.severity === SEVERITY.HIGH).length
                + preservationDefects.filter(d => !d.waived && d.severity === SEVERITY.HIGH).length;
            const blockingFailures = nonWaivedFailed.filter(r => BLOCKING_SEVERITIES.has(r.rule.severity)).length
                + preservationDefects.filter(d => !d.waived).length;
            const warnings = nonWaivedFailed.length - (nonWaivedFailed.filter(r => BLOCKING_SEVERITIES.has(r.rule.severity)).length);

            // Verdict uses a waiver-adjusted pass count: a rule with an active,
            // reasoned waiver counts as "handled" for release-blocking purposes
            // (the team explicitly signed off on it), even though the raw
            // scorePercent above stays truthful and unaffected — so the
            // dashboard/score never gets inflated by waivers, only the verdict
            // does. Both numbers are reported so this stays legible.
            const adjustedPassed = passed + waivedFailed.length;
            const adjustedScorePercent = Math.round((adjustedPassed / total) * 1000) / 10;
            const verdict = this.#computeVerdict({ total, passed: adjustedPassed, criticalFailures, highFailures });
            const certificationLevel = DEPLOYMENT_READINESS[verdict] || DEPLOYMENT_READINESS.UNKNOWN;

            const checksByGroup = {};
            for (const { rule, outcome } of results) {
                if (!checksByGroup[rule.group]) checksByGroup[rule.group] = { total: 0, passed: 0, failed: 0 };
                checksByGroup[rule.group].total++;
                checksByGroup[rule.group][outcome.pass ? "passed" : "failed"]++;
            }

            const filePath = metadata.filePath || moduleId;
            const defects = failedResultsAll.map(({ rule, outcome }) => {
                const line = outcome.line || null;
                const waiver = activeWaivers.get(rule.id) || null;
                return {
                    id: rule.id,
                    severity: rule.severity,
                    group: rule.group,
                    section: this.#niceGroupName(rule.group),
                    file: filePath,
                    description: rule.description,
                    location: line ? `line ${line}` : "not localized (structural / module-wide check)",
                    approximateLine: line,
                    approximateFunction: this.#approximateFunctionName(sourceText, line),
                    codeSnippet: this.#codeSnippet(sourceText, line),
                    reason: rule.reason,
                    impact: rule.impact,
                    recommendation: rule.recommendation,
                    suggestedFix: this.#suggestedFix(rule),
                    estimatedFixMinutes: this.#estimatedFixMinutes(rule.id, rule.severity),
                    priority: this.#priorityTier(rule.severity),
                    detail: outcome.detail || null,
                    waived: !!waiver,
                    waiver: waiver ? { reason: waiver.reason, expires: waiver.expires } : null
                };
            });
            for (const pd of preservationDefects) {
                defects.push({
                    ...pd, section: this.#niceGroupName(pd.group), file: filePath,
                    approximateLine: null, codeSnippet: null, suggestedFix: null,
                    estimatedFixMinutes: 15, priority: this.#priorityTier(pd.severity), detail: null
                });
            }
            // Sort defects by severity, worst first, for readability.
            defects.sort((a, b) => SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity]);

            const rulePassMap = {};
            for (const { rule, outcome } of results) rulePassMap[rule.id] = outcome.pass;

            const previous = this.#latestRecord(moduleId);
            const regression = previous ? this.#computeRegression(previous, { rulePassMap, defects }) : null;

            // severityCounts drives releaseReadiness / dependencyImpact / roadmap
            // — it deliberately excludes waived items, since those represent
            // deliberately-deferred, approved risk rather than unexpected risk.
            const severityCounts = {
                critical: defects.filter(d => !d.waived && d.severity === SEVERITY.CRITICAL).length,
                high: defects.filter(d => !d.waived && d.severity === SEVERITY.HIGH).length,
                medium: defects.filter(d => !d.waived && d.severity === SEVERITY.MEDIUM).length,
                low: defects.filter(d => !d.waived && d.severity === SEVERITY.LOW).length,
                info: defects.filter(d => !d.waived && d.severity === SEVERITY.INFO).length
            };

            const priorityQueue = {
                critical: defects.filter(d => !d.waived && d.severity === SEVERITY.CRITICAL),
                high: defects.filter(d => !d.waived && d.severity === SEVERITY.HIGH),
                medium: defects.filter(d => !d.waived && d.severity === SEVERITY.MEDIUM),
                low: defects.filter(d => !d.waived && d.severity === SEVERITY.LOW),
                suggestions: defects.filter(d => !d.waived && d.severity === SEVERITY.INFO),
                waived: defects.filter(d => d.waived)
            };

            const reportDraft = {
                certificationId, moduleId, moduleName, version, auditorVersion, timestamp, ruleSetVersion,
                filePath, sourceHash,
                frozen: !!frozenInfo, frozenViolation,
                verdict, certificationLevel,
                verificationMethod: "Static source analysis (heuristic, execution-free — pattern matches, not a formal proof)",
                summary: {
                    totalChecks: total, passed, failed: blockingFailures, warnings, waived: waivedFailed.length,
                    scorePercent, adjustedScorePercent
                },
                overallGrade: this.#overallGrade(scorePercent),
                severityCounts,
                checksByGroup,
                dashboard: this.#computeDashboard(checksByGroup),
                architectureDiagram: this.#computeArchitectureDiagram(checksByGroup),
                releaseReadiness: this.#computeReleaseReadiness(severityCounts),
                priorityQueue,
                defects,
                rulePassMap,
                regression,
                // Fleet-level signals — only meaningful once applications have
                // been registered / expectations declared via metadata; harmless
                // empty defaults otherwise (see #dependentsOf, verifyIntegrations,
                // checkCompatibility docs above for why these need declared input).
                dependencyImpact: this.getDependencyImpact(moduleId, verdict),
                integrationVerification: metadata.expectedIntegrations ? this.verifyIntegrations(sourceText, metadata.expectedIntegrations) : null,
                compatibility: metadata.compatibleWith ? this.checkCompatibility(metadata.compatibleWith) : null,
                baselineComparison: null // filled below if a baseline is on file for this module
            };

            const baseline = this.#baselines.get(moduleId);
            if (baseline) reportDraft.baselineComparison = this.#compareToBaseline(baseline, reportDraft);

            reportDraft.certificate = this.#buildCertificate(reportDraft);
            reportDraft.similarIssuesResolved = this.#checkMemoryForResolvedIssues(defects);
            const report = this.#deepFreeze(reportDraft);

            this.#storeRecord(moduleId, report);
            const isInternalPreviewCall = /_(before|after|beforesave|aftersave|analysis|preview|ai_check)$/.test(moduleId);
            if (window.CozyOS.CozyMemory && !isInternalPreviewCall) {
                try {
                    const activeRuleIds = defects.filter(d => !d.waived).map(d => d.id);
                    window.CozyOS.CozyMemory.saveMemory("Project", `certification-${moduleId}`, { moduleId, verdict, scorePercent, version, certificationId, timestamp, activeRuleIds }, { tags: ["certification", verdict, moduleId, ...activeRuleIds] });
                } catch (_err) { /* memory is additive — never blocks certification */ }
            }
            this.#logAudit("CERTIFICATION_RUN", `${moduleId} certified as ${verdict} (${scorePercent}%) — ${certificationId}.`);
            this.#logTimeline(`${moduleName} certification completed: ${verdict}`);
            if (frozenViolation && frozenViolation.violated) {
                this.#logAudit("FROZEN_MODULE_VIOLATION", `${moduleId} was FROZEN at ${frozenViolation.frozenCertificationId} but its source has changed — re-certification required before re-freezing.`);
                this.emit("module:frozen-violation", { moduleId, frozenCertificationId: frozenViolation.frozenCertificationId });
            }
            this.emit("certification:completed", { moduleId, certificationId, verdict, scorePercent });
            return report;
        }

        #simpleVerdictLabel(verdict) {
            if (verdict === CERT_LEVELS.ENTERPRISE_CERTIFIED) return "CERTIFIED";
            if (verdict === CERT_LEVELS.CERTIFIED_WITH_WARNINGS) return "CERTIFIED WITH WARNINGS";
            return "FAILED"; // CERTIFICATION_FAILED, NOT_CERTIFIED, UNKNOWN all read as FAILED at a glance
        }

        // =====================================================================
        // ─── CERTIFICATION MODES: quickCertification / fullCertification ─────
        // =====================================================================

        /**
         * quickCertification(sourceText, metadata)
         *   For a developer working on ONE file. Certifies only that module —
         *   every existing capability stays active (dashboard, priority queue,
         *   snippets, suggested fixes, regression, diagram, readiness,
         *   certificate, dependency impact, integration/compatibility checks
         *   when declared). Nothing is removed or bypassed; this is a thin,
         *   additive wrapper around certifyModule() that also attaches a
         *   plain-English top-line verdict.
         */
        quickCertification(sourceText, metadata = {}) {
            const moduleReport = this.certifyModule(sourceText, metadata);
            const quickVerdict = this.#simpleVerdictLabel(moduleReport.verdict);
            this.#logAudit("QUICK_CERTIFICATION", `${moduleReport.moduleId} quick-certified: ${quickVerdict}.`);
            return this.#deepFreeze({ ...this.#deepClone(moduleReport), quickVerdict });
        }


        /**
         * #extractPublicApiSurface(sourceText)
         *   Real, regex-based extraction of public method names from a
         *   class body: lines shaped like `    methodName(` at typical
         *   class-member indentation, excluding private fields/methods
         *   (`#name`), constructor, and control-flow keywords that can
         *   match the same shape (if/for/while/switch/catch). This is a
         *   text heuristic — not an AST parser — and can miss unusually
         *   formatted code; it is not claimed to be a perfect API extractor.
         */
        #extractPublicApiSurface(sourceText) {
            if (typeof sourceText !== "string") return [];
            const matches = Array.from(sourceText.matchAll(/^\s{4,12}(async\s+)?([A-Za-z][A-Za-z0-9_$]*)\s*\(/gm));
            const excluded = new Set(["constructor", "if", "for", "while", "switch", "catch", "function", "return"]);
            return Array.from(new Set(matches.map(m => m[2]).filter(name => !excluded.has(name) && !name.startsWith("_"))));
        }

        /**
         * checkFeaturePreservation(previousSourceText, currentSourceText)
         *   The real mechanism behind the Preservation Rule: extracts each
         *   version's public API surface and reports which methods were
         *   removed. This is the check WorkspaceShell's saveFile() runs
         *   automatically before overwriting a file, and what Developer
         *   Hub surfaces before a save completes. A heuristic, disclosed
         *   as such — not a substitute for actually reviewing a diff.
         */
        /**
         * #checkMemoryForResolvedIssues(defects)
         *   Certification Memory Read: searches CozyMemory's real
         *   "Project" namespace for prior certifications whose stored
         *   record shares rule IDs with THIS report's active defects —
         *   surfacing "this kind of issue was seen before" for consistent
         *   handling. Non-blocking, purely informational; never alters
         *   the verdict/score. Empty when CozyMemory isn't connected or
         *   nothing real matches.
         */
        #checkMemoryForResolvedIssues(defects) {
            const mem = window.CozyOS.CozyMemory;
            if (!mem || typeof mem.searchMemory !== "function") return [];
            const ruleIds = Array.from(new Set(defects.filter(d => !d.waived).map(d => d.id)));
            if (ruleIds.length === 0) return [];
            const matchesByKey = new Map();
            for (const ruleId of ruleIds) {
                let results;
                try { results = mem.searchMemory("Project", ruleId); } catch (_err) { continue; }
                for (const r of results.filter(r => r.key.startsWith("certification-"))) {
                    const existing = matchesByKey.get(r.key);
                    matchesByKey.set(r.key, { r, matchCount: (existing ? existing.matchCount : 0) + r.matchCount });
                }
            }
            return Array.from(matchesByKey.values())
                .sort((a, b) => b.matchCount - a.matchCount)
                .slice(0, 5)
                .map(({ r }) => ({ moduleId: r.entry.value.moduleId, verdict: r.entry.value.verdict, timestamp: r.entry.savedAt }));
        }

        checkFeaturePreservation(previousSourceText, currentSourceText) {
            const previousSurface = this.#extractPublicApiSurface(previousSourceText);
            const currentSurface = this.#extractPublicApiSurface(currentSourceText);
            const currentSet = new Set(currentSurface);
            const previousSet = new Set(previousSurface);
            const removedMethods = previousSurface.filter(m => !currentSet.has(m));
            const addedMethods = currentSurface.filter(m => !previousSet.has(m));
            return this.#deepFreeze({
                previousMethodCount: previousSurface.length, currentMethodCount: currentSurface.length,
                removedMethods, addedMethods,
                hasRegression: removedMethods.length > 0,
                method: "regex-based public-method-name extraction (heuristic, not an AST diff)"
            });
        }

        #computeRegression(previousReport, current) {
            const prevPassMap = previousReport.rulePassMap || {};
            const currPassMap = current.rulePassMap;
            const newDefects = [];
            const resolvedDefects = [];
            const regressions = [];
            const improvements = [];

            const prevFailIds = new Set((previousReport.defects || []).map(d => d.id));
            const currFailIds = new Set(current.defects.map(d => d.id));

            for (const id of currFailIds) if (!prevFailIds.has(id)) newDefects.push(id);
            for (const id of prevFailIds) if (!currFailIds.has(id)) resolvedDefects.push(id);

            for (const ruleId of Object.keys(currPassMap)) {
                const prevPass = prevPassMap[ruleId];
                const currPass = currPassMap[ruleId];
                if (prevPass === undefined) continue; // rule didn't exist at previous cert (API/rule-set change)
                if (prevPass === true && currPass === false) regressions.push(ruleId);
                if (prevPass === false && currPass === true) improvements.push(ruleId);
            }

            const apiChanges = regressions.filter(id => id.startsWith("COORD-")).concat(improvements.filter(id => id.startsWith("COORD-")));
            const architectureChanges = regressions.filter(id => id.startsWith("ARCH-")).concat(improvements.filter(id => id.startsWith("ARCH-")));

            const currentScorePercent = Math.round((Object.values(currPassMap).filter(Boolean).length / Object.keys(currPassMap).length) * 1000) / 10;
            const previousScorePercent = previousReport.summary ? previousReport.summary.scorePercent : 0;

            return this.#deepFreeze({
                comparedAgainst: previousReport.certificationId,
                previousScore: previousScorePercent,
                currentScore: currentScorePercent,
                newDefects, resolvedDefects, regressions, improvements,
                apiChanges, architectureChanges,
                scoreDelta: Math.round((currentScorePercent - previousScorePercent) * 10) / 10
            });
        }

        // =====================================================================
        // ─── CERTIFICATION HISTORY REGISTRY (CRUD) ───────────────────────────
        // =====================================================================

        #storeRecord(moduleId, record) {
            if (!this.#history.has(moduleId)) this.#history.set(moduleId, []);
            const arr = this.#history.get(moduleId);
            arr.push(record);
            if (arr.length > 200) arr.shift();
        }

        #latestRecord(moduleId) {
            const arr = this.#history.get(moduleId);
            return arr && arr.length > 0 ? arr[arr.length - 1] : null;
        }

        createRecord(moduleId, record) {
            if (!moduleId || typeof record !== "object") throw new TypeError("[CozyCertification] createRecord(): moduleId and record are required.");
            const frozen = this.#deepFreeze(this.#deepClone(record));
            this.#storeRecord(moduleId, frozen);
            this.#logAudit("RECORD_CREATED", `Manual certification record added for ${moduleId}.`);
            return frozen;
        }

        readRecord(moduleId, certificationId) {
            const arr = this.#history.get(moduleId) || [];
            return arr.find(r => r.certificationId === certificationId) || null;
        }

        updateRecord(moduleId, certificationId, patch) {
            const arr = this.#history.get(moduleId) || [];
            const idx = arr.findIndex(r => r.certificationId === certificationId);
            if (idx === -1) return null;
            // Records are immutable once certified; "update" appends a correction
            // note rather than mutating history, preserving audit integrity.
            const corrected = this.#deepFreeze({ ...this.#deepClone(arr[idx]), correctionNote: patch, correctedAt: new Date().toISOString() });
            arr[idx] = corrected;
            this.#logAudit("RECORD_CORRECTED", `Correction note appended to ${certificationId} for ${moduleId}.`);
            return corrected;
        }

        deleteRecord(moduleId, certificationId) {
            const arr = this.#history.get(moduleId);
            if (!arr) return false;
            const idx = arr.findIndex(r => r.certificationId === certificationId);
            if (idx === -1) return false;
            arr.splice(idx, 1);
            this.#logAudit("RECORD_DELETED", `Certification record ${certificationId} removed for ${moduleId}.`);
            return true;
        }

        listRecords(moduleId) {
            const arr = this.#history.get(moduleId) || [];
            return this.#deepFreeze(this.#deepClone(arr));
        }

        countRecords(moduleId) {
            return (this.#history.get(moduleId) || []).length;
        }

        hasRecord(moduleId, certificationId) {
            const arr = this.#history.get(moduleId) || [];
            return arr.some(r => r.certificationId === certificationId);
        }

        mergeRecords(moduleId, incomingRecords, { conflictStrategy = "keep-latest-timestamp" } = {}) {
            if (!Array.isArray(incomingRecords)) throw new TypeError("[CozyCertification] mergeRecords(): incomingRecords must be an array.");
            if (!this.#history.has(moduleId)) this.#history.set(moduleId, []);
            const existing = this.#history.get(moduleId);
            const byId = new Map(existing.map(r => [r.certificationId, r]));
            for (const incoming of incomingRecords) {
                if (!incoming || typeof incoming.certificationId !== "string") continue; // reject malformed entries
                const current = byId.get(incoming.certificationId);
                if (!current) { byId.set(incoming.certificationId, incoming); continue; }
                if (conflictStrategy === "keep-existing") continue;
                if (conflictStrategy === "keep-incoming") { byId.set(incoming.certificationId, incoming); continue; }
                // default: keep-latest-timestamp
                if (new Date(incoming.timestamp) > new Date(current.timestamp)) byId.set(incoming.certificationId, incoming);
            }
            const merged = Array.from(byId.values()).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
            this.#history.set(moduleId, merged);
            this.#logAudit("RECORDS_MERGED", `${incomingRecords.length} incoming record(s) merged for ${moduleId} using "${conflictStrategy}".`);
            return this.#deepFreeze(this.#deepClone(merged));
        }

        snapshotRegistry() {
            const obj = {};
            for (const [moduleId, records] of this.#history.entries()) obj[moduleId] = records;
            return this.#deepFreeze(this.#deepClone(obj));
        }

        // =====================================================================
        // ─── IMPORT / EXPORT SNAPSHOT (whole-registry backup/restore) ────────
        // =====================================================================

        exportSnapshot() {
            const snapshot = {
                exportedAt: new Date().toISOString(),
                auditorVersion: CERT_VERSION,
                history: this.snapshotRegistry()
            };
            this.#logAudit("SNAPSHOT_EXPORTED", `Full certification history exported (${this.#history.size} modules).`);
            return this.#deepFreeze(this.#deepClone(snapshot));
        }

        importSnapshot(snapshot, { mergeStrategy = "merge" } = {}) {
            if (!snapshot || typeof snapshot !== "object" || typeof snapshot.history !== "object" || snapshot.history === null) {
                throw new TypeError("[CozyCertification] importSnapshot(): snapshot must be an object with a `history` map.");
            }
            if (mergeStrategy !== "merge" && mergeStrategy !== "replace") {
                throw new TypeError('[CozyCertification] importSnapshot(): mergeStrategy must be "merge" or "replace".');
            }
            if (mergeStrategy === "replace") this.#history.clear();

            for (const [moduleId, records] of Object.entries(snapshot.history)) {
                if (!Array.isArray(records)) continue; // reject malformed entries, keep going
                this.mergeRecords(moduleId, records, { conflictStrategy: "keep-latest-timestamp" });
            }
            this.#logAudit("SNAPSHOT_IMPORTED", `Certification history imported using "${mergeStrategy}" strategy.`);
            this.emit("registry:imported", { mergeStrategy, moduleCount: Object.keys(snapshot.history).length });
            return true;
        }

        // =====================================================================
        // ─── APPLICATION CERTIFICATION (e.g. QuarryOS, ChurchOS, ShopOS) ─────
        // =====================================================================

        /**
         * certifyApplication(appManifest)
         *   appManifest: { id, name, version, modules: ["CozyStorage", ...],
         *                  offlineReady?: boolean }
         * Metadata-only: checks presence/certification status of declared
         * modules against window.CozyOS and this coordinator's own history.
         * Never loads or executes any module code.
         */
        certifyApplication(appManifest) {
            this.#diagnostics.applicationsRun++;
            if (!appManifest || typeof appManifest !== "object" || typeof appManifest.id !== "string") {
                throw new TypeError("[CozyCertification] certifyApplication(): appManifest must include at least an `id`.");
            }
            const requiredModules = Array.isArray(appManifest.modules) ? appManifest.modules : [];
            const moduleFindings = requiredModules.map((name) => {
                const liveRef = window.CozyOS ? window.CozyOS[name] : undefined;
                const discovered = !!liveRef;
                const liveVersion = discovered && typeof liveRef.getVersion === "function" ? liveRef.getVersion() : null;
                const certHistory = this.#history.get(name.toLowerCase()) || this.#history.get(name) || [];
                const lastCert = certHistory.length > 0 ? certHistory[certHistory.length - 1] : null;
                return {
                    module: name,
                    discovered,
                    liveVersion,
                    lastCertificationVerdict: lastCert ? lastCert.verdict : CERT_LEVELS.NOT_CERTIFIED,
                    lastCertificationScore: lastCert ? lastCert.summary.scorePercent : null,
                    criticalIssues: lastCert ? lastCert.severityCounts.critical : null
                };
            });

            const missingCoordinators = moduleFindings.filter(m => !m.discovered).map(m => m.module);
            const uncertifiedModules = moduleFindings.filter(m => m.lastCertificationVerdict === CERT_LEVELS.NOT_CERTIFIED || m.lastCertificationVerdict === CERT_LEVELS.UNKNOWN).map(m => m.module);
            const failedModules = moduleFindings.filter(m => m.lastCertificationVerdict === CERT_LEVELS.CERTIFICATION_FAILED).map(m => m.module);
            const hasCriticalIssues = moduleFindings.some(m => (m.criticalIssues || 0) > 0);

            const dependencyIntegrity = missingCoordinators.length === 0;
            const moduleCompatibility = moduleFindings.every(m => !m.discovered || typeof m.liveVersion === "string");
            const offlineReadiness = appManifest.offlineReady === true;
            const securityPosture = hasCriticalIssues ? "AT_RISK" : "SECURE";

            let overallReadiness;
            if (missingCoordinators.length > 0 || failedModules.length > 0 || hasCriticalIssues) overallReadiness = CERT_LEVELS.CERTIFICATION_FAILED;
            else if (uncertifiedModules.length > 0) overallReadiness = CERT_LEVELS.CERTIFIED_WITH_WARNINGS;
            else overallReadiness = CERT_LEVELS.ENTERPRISE_CERTIFIED;

            const report = this.#deepFreeze({
                applicationId: appManifest.id,
                applicationName: appManifest.name || appManifest.id,
                version: appManifest.version || "0.0.0",
                timestamp: new Date().toISOString(),
                auditorVersion: CERT_VERSION,
                verificationMethod: "Metadata-only manifest analysis against discovered window.CozyOS coordinators and certification history — no module code executed.",
                requiredModulesPresent: missingCoordinators.length === 0,
                missingCoordinators,
                moduleCompatibility,
                versionCompatibility: moduleCompatibility,
                dependencyIntegrity,
                offlineReadiness,
                securityPosture,
                overallReadiness,
                certificationLevel: DEPLOYMENT_READINESS[overallReadiness] || DEPLOYMENT_READINESS.UNKNOWN,
                moduleFindings
            });

            this.#logAudit("APPLICATION_CERTIFIED", `${appManifest.id} evaluated as ${overallReadiness}.`);
            this.#logTimeline(`Application certification completed: ${appManifest.id} (${overallReadiness})`);
            this.emit("application:certified", { applicationId: appManifest.id, overallReadiness });
            return report;
        }

        // =====================================================================
        // ─── REPORT EXPORT (JSON / CSV / Markdown / HTML / Text / PDF blueprint)
        // =====================================================================

        exportReport(report, format = "json") {
            if (!report || typeof report !== "object") throw new TypeError("[CozyCertification] exportReport(): a report object is required.");
            this.#diagnostics.exportsGenerated++;
            switch (format) {
                case "json": return this.#toJSON(report);
                case "csv": return this.#toCSV(report);
                case "markdown": return this.#toMarkdown(report);
                case "html": return this.#toHTML(report);
                case "text": return this.#toPlainText(report);
                case "pdf-blueprint": return this.#toPDFBlueprint(report);
                default: throw new TypeError(`[CozyCertification] exportReport(): unsupported format "${format}".`);
            }
        }

        #toJSON(report) {
            try {
                return JSON.stringify(report, null, 2);
            } catch (_err) {
                this.#diagnostics.errorsHidden++;
                return JSON.stringify({ error: "Report could not be serialized." });
            }
        }

        #toCSV(report) {
            const header = ["Severity", "Group", "RuleId", "Description", "File", "Location", "Function", "EstimatedFixMinutes", "Reason", "Impact", "Recommendation"];
            const csvEscape = (v) => `"${String(v === undefined || v === null ? "" : v).replace(/"/g, '""')}"`;
            const rows = (report.defects || []).map(d => [
                d.severity, d.group, d.id, d.description, d.file, d.location, d.approximateFunction,
                d.estimatedFixMinutes, d.reason, d.impact, d.recommendation
            ].map(csvEscape).join(","));
            return [header.join(","), ...rows].join("\n");
        }

        #asciiDiagram(report) {
            const lines = [report.moduleName, "    │"];
            (report.architectureDiagram || []).forEach((node) => {
                const branch = node.isLast ? "└──" : "├──";
                lines.push(`    ${branch} ${node.label}`);
                lines.push(`    ${node.isLast ? " " : "│"}      ${node.ok ? "✓" : "❌"}`);
                if (!node.isLast) lines.push("    │");
            });
            return lines.join("\n");
        }

        #priorityQueueEntries(report) {
            const tiers = [
                ["critical", "🔴 Critical (fix before release)"],
                ["high", "🟠 High"],
                ["medium", "🟡 Medium"],
                ["low", "🔵 Low"],
                ["suggestions", "🟢 Suggestions"]
            ];
            return tiers.map(([key, label]) => ({ key, label, items: (report.priorityQueue && report.priorityQueue[key]) || [] }));
        }

        #toMarkdown(report) {
            const lines = [];
            const dash = report.dashboard || [];
            const readiness = report.releaseReadiness || {};
            const cert = report.certificate || {};

            // ---- Table of contents (markdown anchor links) ----
            lines.push(`# CozyOS Enterprise Audit Report`, "");
            lines.push(`## Table of Contents`, "");
            const tocEntries = [
                ["Executive Summary", "executive-summary"], ["Score Dashboard", "score-dashboard"],
                ["Release Readiness", "release-readiness"], ["Architecture Diagram", "architecture-diagram"],
                ["Priority Queue", "priority-queue"], ["Detailed Defects", "detailed-defects"],
                ["Regression Report", "regression-report"]
            ];
            if (report.baselineComparison) tocEntries.push(["Baseline Comparison", "baseline-comparison"]);
            tocEntries.push(["Enterprise Certificate", "enterprise-certificate"]);
            tocEntries.forEach(([title, anchor]) => lines.push(`- [${title}](#${anchor})`));
            lines.push("");

            if (report.frozenViolation && report.frozenViolation.violated) {
                lines.push(`> ⚠️ **FROZEN MODULE MODIFIED** — ${report.frozenViolation.message} (frozen at ${report.frozenViolation.frozenCertificationId} on ${report.frozenViolation.frozenAt}).`, "");
            }

            // ---- Executive Summary ----
            lines.push(`## Executive Summary`, "");
            lines.push(`| Field | Value |`, `|---|---|`);
            lines.push(`| Module | ${report.moduleName} (${report.moduleId}) |`);
            lines.push(`| Version | ${report.version} |`);
            lines.push(`| Certification Verdict | **${report.verdict}** |`);
            lines.push(`| Overall Score | ${report.summary.scorePercent}% (Grade ${report.overallGrade}) |`);
            lines.push(`| State | ${report.frozen ? "🔒 FROZEN" : "ACTIVE"} |`);
            if (report.summary.waived > 0) lines.push(`| Waived Items | ${report.summary.waived} (see Priority Queue) |`);
            lines.push(`| Date | ${report.timestamp} |`);
            lines.push(`| Certification Engine | v${report.auditorVersion} |`);
            lines.push(`| Rule Set Version | v${report.ruleSetVersion} |`);
            lines.push(`| Verification Method | ${report.verificationMethod} |`, "");

            // ---- Score Dashboard ----
            lines.push(`## Score Dashboard`, "");
            lines.push(`| Check Group | Score | Passed / Total |`, `|---|---|---|`);
            dash.forEach(row => lines.push(`| ${row.label} | ${row.percent}% | ${row.passed}/${row.total} |`));
            lines.push("", `**Overall Grade: ${report.overallGrade}**`, "");

            // ---- Release Readiness ----
            lines.push(`## Release Readiness`, "");
            lines.push(`${readiness.label || "Unknown"}`, "");

            // ---- Architecture Diagram ----
            lines.push(`## Architecture Diagram`, "");
            lines.push("```", this.#asciiDiagram(report), "```", "");

            // ---- Priority Queue ----
            lines.push(`## Priority Queue`, "");
            this.#priorityQueueEntries(report).forEach(({ label, items }) => {
                lines.push(`### ${label} (${items.length})`);
                if (items.length === 0) lines.push("- none");
                items.forEach(d => lines.push(`- **${d.id}** — ${d.description} (${d.file}, ${d.location}) — est. ${d.estimatedFixMinutes} min`));
                lines.push("");
            });
            const waivedItems = (report.priorityQueue && report.priorityQueue.waived) || [];
            lines.push(`### ⏸ Waived (${waivedItems.length})`);
            if (waivedItems.length === 0) lines.push("- none");
            waivedItems.forEach(d => lines.push(`- **${d.id}** — ${d.description} — waived: "${d.waiver.reason}"${d.waiver.expires ? ` (expires ${d.waiver.expires})` : " (no expiry)"}`));
            lines.push("");

            // ---- Detailed Defects ----
            if (report.defects && report.defects.length > 0) {
                lines.push(`## Detailed Defects`, "");
                for (const d of report.defects) {
                    lines.push(`### ${d.waived ? "⏸ WAIVED" : d.priority.emoji} ${d.severity} — ${d.description} (${d.id})`);
                    if (d.waived) lines.push(`- **Waiver reason:** ${d.waiver.reason}${d.waiver.expires ? ` (expires ${d.waiver.expires})` : " (no expiry)"}`);
                    lines.push(`- **File:** ${d.file}`);
                    lines.push(`- **Section:** ${d.section}`);
                    lines.push(`- **Approximate line:** ${d.approximateLine || "n/a"}`);
                    lines.push(`- **Function:** ${d.approximateFunction}`);
                    lines.push(`- **Rule:** ${d.id}`);
                    lines.push(`- **Reason:** ${d.reason}`);
                    lines.push(`- **Impact:** ${d.impact}`);
                    lines.push(`- **Recommendation:** ${d.recommendation}`);
                    lines.push(`- **Estimated fix time:** ${d.estimatedFixMinutes} minutes`);
                    if (d.codeSnippet) {
                        lines.push("", "  Code:", "```js");
                        d.codeSnippet.lines.forEach(l => lines.push(`${l.text}${l.isTarget ? "  // ▲ Issue here" : ""}`));
                        lines.push("```");
                    }
                    lines.push("", "  Suggested fix:", "```js", d.suggestedFix, "```", "");
                }
            }

            // ---- Regression Report ----
            lines.push(`## Regression Report`, "");
            if (report.regression) {
                lines.push(`Compared against: ${report.regression.comparedAgainst}`);
                lines.push(`- Previous Score: ${report.regression.previousScore}%`);
                lines.push(`- Current Score: ${report.regression.currentScore}%`);
                lines.push(`- Fixed: ${report.regression.resolvedDefects.map(id => `✓ ${id}`).join(", ") || "none"}`);
                lines.push(`- New Issues: ${report.regression.newDefects.map(id => `• ${id}`).join(", ") || "none"}`);
                lines.push(`- Regressions: ${report.regression.regressions.join(", ") || "none"}`);
                lines.push(`- Improvements: ${report.regression.improvements.join(", ") || "none"}`, "");
            } else {
                lines.push("No previous certification on record — this is the first run.", "");
            }

            // ---- Baseline Comparison ----
            if (report.baselineComparison) {
                const bc = report.baselineComparison;
                lines.push(`## Baseline Comparison`, "");
                lines.push(`Compared to Enterprise Baseline: ${bc.comparedAgainst} (v${bc.baselineVersion})`, "");
                bc.groups.forEach(g => {
                    const mark = g.status === "REGRESSED" ? "✗" : g.status === "IMPROVED" ? "✓" : "✓";
                    const word = g.status === "REGRESSED" ? "regressed" : g.status === "IMPROVED" ? "improved" : g.status === "NEW" ? "new" : "unchanged";
                    lines.push(`${mark} ${g.label} ${word}`);
                });
                lines.push("", `**Status: ${bc.statusLabel}**`, "");
            }

            // ---- Enterprise Certificate ----
            lines.push(`## Enterprise Certificate`, "");
            lines.push(`**CozyOS Enterprise Certification**`, "");
            lines.push(`- **Module:** ${cert.module}`);
            lines.push(`- **Version:** ${cert.version}`);
            lines.push(`- **Result:** ${cert.result}`);
            lines.push(`- **Score:** ${cert.score}%`);
            lines.push(`- **Critical:** ${cert.critical}`);
            lines.push(`- **High:** ${cert.high}`);
            lines.push(`- **Medium:** ${cert.medium}`);
            lines.push(`- **Low:** ${cert.low}`);
            lines.push(`- **Certification Engine:** ${cert.certificationEngine}`);
            lines.push(`- **Certification Date:** ${cert.certificationDate}`);

            return lines.join("\n");
        }

        #toHTML(report) {
            const esc = (v) => this.#escapeHtml(v);
            const dash = report.dashboard || [];
            const readiness = report.releaseReadiness || {};
            const cert = report.certificate || {};

            const dashboardRows = dash.map(row => `<tr><td>${esc(row.label)}</td><td>${esc(row.percent)}%</td><td>${esc(row.passed)}/${esc(row.total)}</td></tr>`).join("");

            const diagramText = this.#asciiDiagram(report);

            const priorityHtml = this.#priorityQueueEntries(report).map(({ label, items }) => `
                <h3>${esc(label)} (${items.length})</h3>
                <ul>${items.length === 0 ? "<li>none</li>" : items.map(d => `<li><b>${esc(d.id)}</b> — ${esc(d.description)} (${esc(d.file)}, ${esc(d.location)}) — est. ${esc(d.estimatedFixMinutes)} min</li>`).join("")}</ul>`).join("");

            const defectsHtml = (report.defects || []).map(d => {
                const snippetHtml = d.codeSnippet
                    ? `<pre class="snippet">${d.codeSnippet.lines.map(l => `${String(l.num).padStart(4, " ")}| ${esc(l.text)}${l.isTarget ? '  <span class="marker">▲ Issue here</span>' : ""}`).join("\n")}</pre>`
                    : `<p class="muted">Not localized — module-wide / structural check.</p>`;
                const waivedBanner = d.waived
                    ? `<p class="waived-banner">⏸ WAIVED — ${esc(d.waiver.reason)}${d.waiver.expires ? ` (expires ${esc(d.waiver.expires)})` : " (no expiry)"}</p>`
                    : "";
                return `
                <div class="defect sev-${d.severity.toLowerCase()}${d.waived ? " waived" : ""}" id="defect-${esc(d.id)}">
                    <h3>${d.waived ? "⏸" : d.priority.emoji} ${esc(d.severity)} — ${esc(d.description)} <span class="rule-id">(${esc(d.id)})</span></h3>
                    ${waivedBanner}
                    <table class="meta">
                        <tr><th>File</th><td>${esc(d.file)}</td></tr>
                        <tr><th>Section</th><td>${esc(d.section)}</td></tr>
                        <tr><th>Approximate line</th><td>${esc(d.approximateLine || "n/a")}</td></tr>
                        <tr><th>Function</th><td>${esc(d.approximateFunction)}</td></tr>
                        <tr><th>Rule</th><td>${esc(d.id)}</td></tr>
                        <tr><th>Estimated fix time</th><td>${esc(d.estimatedFixMinutes)} minutes</td></tr>
                    </table>
                    <p><b>Problem:</b> ${esc(d.description)}</p>
                    <p><b>Why it matters:</b> ${esc(d.impact)}</p>
                    <p><b>Recommended fix:</b> ${esc(d.recommendation)}</p>
                    ${snippetHtml}
                    <p><b>Suggested fix:</b></p>
                    <pre class="fix">${esc(d.suggestedFix)}</pre>
                </div>`;
            }).join("");

            const regressionHtml = report.regression ? `
                <p>Compared against: ${esc(report.regression.comparedAgainst)}</p>
                <p>Previous Score: ${esc(report.regression.previousScore)}% &nbsp;→&nbsp; Current Score: ${esc(report.regression.currentScore)}%</p>
                <p><b>Fixed:</b> ${report.regression.resolvedDefects.map(id => `✓ ${esc(id)}`).join(", ") || "none"}</p>
                <p><b>New Issues:</b> ${report.regression.newDefects.map(id => `• ${esc(id)}`).join(", ") || "none"}</p>
                <p><b>Regressions:</b> ${report.regression.regressions.map(esc).join(", ") || "none"}</p>
                <p><b>Improvements:</b> ${report.regression.improvements.map(esc).join(", ") || "none"}</p>`
                : `<p>No previous certification on record — this is the first run.</p>`;

            return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>CozyOS Enterprise Audit Report — ${esc(report.moduleName)}</title>
<style>
  body { font-family: -apple-system, Segoe UI, Roboto, sans-serif; margin: 0; padding: 0 2rem 4rem; color: #1c1c1e; }
  h1 { margin-top: 2rem; } h2 { border-bottom: 2px solid #eee; padding-bottom: .3rem; margin-top: 3rem; }
  nav.toc { background: #f7f7f9; border: 1px solid #e2e2e6; border-radius: 8px; padding: 1rem 1.5rem; }
  nav.toc a { display: block; padding: .15rem 0; text-decoration: none; color: #2563eb; }
  table { border-collapse: collapse; width: 100%; margin: .75rem 0; }
  th, td { border: 1px solid #ddd; padding: .4rem .6rem; text-align: left; font-size: .92rem; }
  .defect { border-left: 6px solid #ccc; padding: .75rem 1rem; margin: 1.25rem 0; background: #fafafa; border-radius: 0 6px 6px 0; }
  .defect.sev-critical { border-color: #dc2626; } .defect.sev-high { border-color: #ea580c; }
  .defect.sev-medium { border-color: #ca8a04; } .defect.sev-low { border-color: #2563eb; } .defect.sev-info { border-color: #16a34a; }
  .rule-id { color: #6b7280; font-weight: normal; font-size: .85em; }
  pre.snippet, pre.fix { background: #0f172a; color: #e2e8f0; padding: .75rem 1rem; border-radius: 6px; overflow-x: auto; font-size: .85rem; }
  .marker { color: #f87171; font-weight: bold; }
  .muted { color: #6b7280; font-style: italic; }
  .certificate { page-break-before: always; text-align: center; border: 3px double #333; padding: 3rem 2rem; margin-top: 4rem; }
  .certificate h1 { font-size: 1.8rem; letter-spacing: .05em; }
  .badge { display: inline-block; padding: .25rem .75rem; border-radius: 999px; font-weight: 600; }
  .badge.ready { background: #dcfce7; color: #166534; } .badge.warn { background: #fef9c3; color: #854d0e; } .badge.blocked { background: #fee2e2; color: #991b1b; }
  .defect.waived { border-color: #9333ea; background: #faf5ff; opacity: .85; }
  .waived-banner { color: #7e22ce; font-weight: 600; }
  .frozen-banner { background: #fee2e2; border: 1px solid #dc2626; color: #991b1b; padding: .75rem 1rem; border-radius: 6px; font-weight: 600; }
</style>
</head>
<body>

<h1>CozyOS Enterprise Audit Report</h1>
${report.frozenViolation && report.frozenViolation.violated ? `<p class="frozen-banner">⚠️ FROZEN MODULE MODIFIED — ${esc(report.frozenViolation.message)} (frozen at ${esc(report.frozenViolation.frozenCertificationId)} on ${esc(report.frozenViolation.frozenAt)}).</p>` : ""}
<nav class="toc" id="table-of-contents">
  <b>Table of Contents</b>
  <a href="#executive-summary">Executive Summary</a>
  <a href="#score-dashboard">Score Dashboard</a>
  <a href="#release-readiness">Release Readiness</a>
  <a href="#architecture-diagram">Architecture Diagram</a>
  <a href="#priority-queue">Priority Queue</a>
  <a href="#detailed-defects">Detailed Defects</a>
  <a href="#regression-report">Regression Report</a>
  ${report.baselineComparison ? `<a href="#baseline-comparison">Baseline Comparison</a>` : ""}
  <a href="#enterprise-certificate">Enterprise Certificate</a>
</nav>
<p class="muted">Tip: this Table of Contents uses ordinary in-page links. Using your browser's "Print → Save as PDF" keeps them clickable in the resulting PDF file.</p>

<h2 id="executive-summary">Executive Summary</h2>
<table>
  <tr><th>Module</th><td>${esc(report.moduleName)} (${esc(report.moduleId)})</td></tr>
  <tr><th>Version</th><td>${esc(report.version)}</td></tr>
  <tr><th>Certification Verdict</th><td><b>${esc(report.verdict)}</b></td></tr>
  <tr><th>Overall Score</th><td>${esc(report.summary.scorePercent)}% (Grade ${esc(report.overallGrade)})</td></tr>
  <tr><th>State</th><td>${report.frozen ? "🔒 FROZEN" : "ACTIVE"}</td></tr>
  ${report.summary.waived > 0 ? `<tr><th>Waived Items</th><td>${esc(report.summary.waived)}</td></tr>` : ""}
  <tr><th>Date</th><td>${esc(report.timestamp)}</td></tr>
  <tr><th>Certification Engine</th><td>v${esc(report.auditorVersion)}</td></tr>
  <tr><th>Rule Set Version</th><td>v${esc(report.ruleSetVersion)}</td></tr>
</table>

<h2 id="score-dashboard">Score Dashboard</h2>
<table><thead><tr><th>Check Group</th><th>Score</th><th>Passed / Total</th></tr></thead><tbody>${dashboardRows}</tbody></table>
<p><b>Overall Grade: ${esc(report.overallGrade)}</b></p>

<h2 id="release-readiness">Release Readiness</h2>
<p class="badge ${readiness.status === "READY" ? "ready" : readiness.status === "READY_AFTER_HIGH" ? "warn" : "blocked"}">${esc(readiness.label)}</p>

<h2 id="architecture-diagram">Architecture Diagram</h2>
<pre class="snippet">${esc(diagramText)}</pre>

<h2 id="priority-queue">Priority Queue</h2>
${priorityHtml}

<h2 id="detailed-defects">Detailed Defects</h2>
${defectsHtml || "<p>No defects found.</p>"}

<h2 id="regression-report">Regression Report</h2>
${regressionHtml}

${report.baselineComparison ? `<h2 id="baseline-comparison">Baseline Comparison</h2>
<p>Compared to Enterprise Baseline: ${esc(report.baselineComparison.comparedAgainst)} (v${esc(report.baselineComparison.baselineVersion)})</p>
<ul>${report.baselineComparison.groups.map(g => `<li>${g.status === "REGRESSED" ? "✗" : "✓"} ${esc(g.label)} ${g.status === "REGRESSED" ? "regressed" : g.status === "IMPROVED" ? "improved" : g.status === "NEW" ? "new" : "unchanged"}</li>`).join("")}</ul>
<p class="badge ${report.baselineComparison.status === "BASELINE_REGRESSED" ? "blocked" : "ready"}">${esc(report.baselineComparison.statusLabel)}</p>` : ""}

<div class="certificate" id="enterprise-certificate">
  <h1>CozyOS Enterprise Certification</h1>
  <p><b>Module:</b><br>${esc(cert.module)}</p>
  <p><b>Version:</b><br>${esc(cert.version)}</p>
  <p><b>Result:</b><br>${esc(cert.result)}</p>
  <p><b>Score:</b><br>${esc(cert.score)}%</p>
  <p><b>Critical:</b> ${esc(cert.critical)} &nbsp; <b>High:</b> ${esc(cert.high)} &nbsp; <b>Medium:</b> ${esc(cert.medium)} &nbsp; <b>Low:</b> ${esc(cert.low)}</p>
  <p><b>Certification Engine:</b><br>${esc(cert.certificationEngine)}</p>
  <p><b>Certification Date:</b><br>${esc(cert.certificationDate)}</p>
  <p><b>Certification ID:</b><br>${esc(report.certificationId)}</p>
</div>

</body></html>`;
        }

        #toPlainText(report) {
            const parts = [];
            parts.push(`CozyOS Enterprise Audit Report`);
            parts.push(`Certification ID: ${report.certificationId}`);
            parts.push(`Module: ${report.moduleName} (${report.moduleId}) v${report.version}`);
            parts.push(`Verdict: ${report.verdict} — ${report.certificationLevel}`);
            parts.push(`Score: ${report.summary.scorePercent}% (Grade ${report.overallGrade}) — ${report.summary.passed}/${report.summary.totalChecks} passed, ${report.summary.warnings} warnings`);
            parts.push(`Release Readiness: ${report.releaseReadiness ? report.releaseReadiness.label : "Unknown"}`);
            parts.push("");
            parts.push("SCORE DASHBOARD");
            (report.dashboard || []).forEach(row => parts.push(`  ${row.label}: ${row.percent}% (${row.passed}/${row.total})`));
            parts.push("");
            parts.push("ARCHITECTURE DIAGRAM");
            parts.push(this.#asciiDiagram(report));
            parts.push("");
            parts.push("PRIORITY QUEUE");
            this.#priorityQueueEntries(report).forEach(({ label, items }) => {
                parts.push(`  ${label} (${items.length})`);
                items.forEach(d => parts.push(`    - ${d.id}: ${d.description} [${d.file}, ${d.location}] est. ${d.estimatedFixMinutes} min`));
            });
            parts.push("");
            parts.push("DETAILED DEFECTS");
            for (const d of report.defects || []) {
                parts.push(`[${d.severity}] ${d.id} — ${d.description}`);
                parts.push(`  File: ${d.file}`);
                parts.push(`  Section: ${d.section}`);
                parts.push(`  Approximate line: ${d.approximateLine || "n/a"}`);
                parts.push(`  Function: ${d.approximateFunction}`);
                parts.push(`  Reason: ${d.reason}`);
                parts.push(`  Impact: ${d.impact}`);
                parts.push(`  Recommendation: ${d.recommendation}`);
                parts.push(`  Estimated fix time: ${d.estimatedFixMinutes} minutes`);
                if (d.codeSnippet) {
                    parts.push("  Code:");
                    d.codeSnippet.lines.forEach(l => parts.push(`    ${l.text}${l.isTarget ? "   <- ▲ Issue here" : ""}`));
                }
                parts.push("  Suggested fix:");
                d.suggestedFix.split("\n").forEach(l => parts.push(`    ${l}`));
                parts.push("");
            }
            if (report.regression) {
                parts.push("REGRESSION REPORT");
                parts.push(`  Previous Score: ${report.regression.previousScore}%`);
                parts.push(`  Current Score: ${report.regression.currentScore}%`);
                parts.push(`  Fixed: ${report.regression.resolvedDefects.join(", ") || "none"}`);
                parts.push(`  New Issues: ${report.regression.newDefects.join(", ") || "none"}`);
                parts.push("");
            }
            parts.push("ENTERPRISE CERTIFICATE");
            const c = report.certificate || {};
            parts.push(`  Module: ${c.module}`);
            parts.push(`  Version: ${c.version}`);
            parts.push(`  Result: ${c.result}`);
            parts.push(`  Score: ${c.score}%`);
            parts.push(`  Critical: ${c.critical}  High: ${c.high}  Medium: ${c.medium}  Low: ${c.low}`);
            parts.push(`  Certification Engine: ${c.certificationEngine}`);
            parts.push(`  Certification Date: ${c.certificationDate}`);
            return parts.join("\n");
        }

        // Metadata blueprint only — this coordinator is execution-free and does
        // not render actual PDF bytes. This describes the structure (including
        // a clickable table of contents) a PDF renderer (outside this module,
        // or the browser's own "Print → Save as PDF") should produce.
        #toPDFBlueprint(report) {
            const tocEntries = [
                { anchor: "executive-summary", title: "Executive Summary" },
                { anchor: "score-dashboard", title: "Score Dashboard" },
                { anchor: "release-readiness", title: "Release Readiness" },
                { anchor: "architecture-diagram", title: "Architecture Diagram" },
                { anchor: "priority-queue", title: "Priority Queue" },
                { anchor: "detailed-defects", title: "Detailed Defects" },
                { anchor: "regression-report", title: "Regression Report" },
                { anchor: "enterprise-certificate", title: "Enterprise Certificate" }
            ];
            return this.#deepFreeze(this.#deepClone({
                documentTitle: `CozyOS Enterprise Audit Report — ${report.moduleName}`,
                note: "This is a structural blueprint for a PDF export, not rendered PDF bytes. The HTML export (exportReport(report, \"html\")) already implements the clickable in-page TOC described here via anchor links; feed either into a PDF-generation tool for a bookmarked/outlined PDF.",
                tableOfContents: tocEntries,
                sections: [
                    { anchor: "executive-summary", heading: "Executive Summary", fields: ["moduleName", "moduleId", "version", "verdict", "summary", "timestamp", "auditorVersion"] },
                    { anchor: "score-dashboard", heading: "Score Dashboard", table: "dashboard", extra: ["overallGrade"] },
                    { anchor: "release-readiness", heading: "Release Readiness", fields: ["releaseReadiness"] },
                    { anchor: "architecture-diagram", heading: "Architecture Diagram", diagram: "architectureDiagram" },
                    { anchor: "priority-queue", heading: "Priority Queue", table: "priorityQueue" },
                    { anchor: "detailed-defects", heading: "Detailed Defects", table: "defects", perItemFields: ["severity", "file", "section", "approximateLine", "approximateFunction", "reason", "impact", "recommendation", "codeSnippet", "suggestedFix", "estimatedFixMinutes"] },
                    { anchor: "regression-report", heading: "Regression Report", fields: ["regression"] },
                    { anchor: "enterprise-certificate", heading: "Enterprise Certificate", fields: ["certificate"], pageBreakBefore: true }
                ],
                estimatedPageCount: Math.max(2, Math.ceil((report.defects || []).length / 6) + 3)
            }));
        }

        // =====================================================================
        // ─── WORKSPACE INTEGRATION ────────────────────────────────────────────
        // =====================================================================

        /**
         * Condensed record for WorkspaceShell-style dashboards:
         * { module, version, certification, score, health, warnings, criticalIssues, auditDate }
         */
        getWorkspaceSummary(moduleId) {
            const record = this.#latestRecord(moduleId);
            if (!record) {
                return this.#deepFreeze({ module: moduleId, version: null, certification: CERT_LEVELS.NOT_CERTIFIED, score: null, health: null, warnings: null, criticalIssues: null, auditDate: null });
            }
            return this.#deepFreeze({
                module: record.moduleName,
                version: record.version,
                certification: record.verdict,
                score: record.summary.scorePercent,
                health: record.summary.scorePercent,
                warnings: record.summary.warnings,
                criticalIssues: record.severityCounts.critical,
                auditDate: record.timestamp
            });
        }

        // =====================================================================
        // ─── FLEET INTELLIGENCE ──────────────────────────────────────────────
        // As CozyOS grows past a handful of modules, certifying one file at a
        // time stops being enough — you need to know who depends on it, what
        // it actually integrates with, and whether an application built from
        // many modules is really ready. Everything in this section is honest
        // about its inputs: it can only reason about applications and expected
        // integrations that were explicitly *declared* to it (via
        // registerApplication() / metadata.expectedIntegrations /
        // metadata.compatibleWith). This coordinator cannot discover a true
        // dependency graph by reading source text alone — inferring "who uses
        // this module" from code would require executing/importing it, which
        // violates the Zero Logic / execution-free rule. So the graph here is
        // declarative, not discovered magic.
        // =====================================================================

        // ---- Application registry (CRUD) ----

        registerApplication(manifest) {
            if (!manifest || typeof manifest.id !== "string") {
                throw new TypeError("[CozyCertification] registerApplication(): manifest must include at least an `id`.");
            }
            const record = this.#deepFreeze(this.#deepClone({
                id: manifest.id,
                name: manifest.name || manifest.id,
                version: manifest.version || "0.0.0",
                modules: Array.isArray(manifest.modules) ? manifest.modules : [],
                plannedFeatures: Array.isArray(manifest.plannedFeatures) ? manifest.plannedFeatures : [],
                registeredAt: new Date().toISOString()
            }));
            this.#applications.set(manifest.id, record);
            this.#logAudit("APPLICATION_REGISTERED", `${manifest.id} registered with ${record.modules.length} declared module(s).`);
            return record;
        }

        getApplication(applicationId) {
            return this.#applications.get(applicationId) || null;
        }

        listApplications() {
            return this.#deepFreeze(this.#deepClone(Array.from(this.#applications.values())));
        }

        deleteApplication(applicationId) {
            const removed = this.#applications.delete(applicationId);
            if (removed) this.#logAudit("APPLICATION_DELETED", `${applicationId} removed from application registry.`);
            return removed;
        }

        // ---- Component taxonomy (for Full Certification's platform discovery) ----

        /**
         * registerComponentType(name, type)
         *   type: "module" | "shell" | "plugin"
         * Optional. Names ending in "Shell" are auto-classified as shells;
         * everything else defaults to "module" unless explicitly tagged here
         * (this is the only reliable way to mark something as a "plugin" —
         * there's no structural signal on a live object that says so).
         */
        registerComponentType(name, type) {
            if (!["module", "shell", "plugin"].includes(type)) {
                throw new TypeError('[CozyCertification] registerComponentType(): type must be "module", "shell", or "plugin".');
            }
            this.#componentTypes.set(name, type);
            return true;
        }

        #classifyComponent(name) {
            if (this.#componentTypes.has(name)) return this.#componentTypes.get(name);
            if (/Shell$/i.test(name)) return "shell";
            return "module";
        }

        // =====================================================================
        // ─── LONG-TERM MAINTENANCE: waivers, module freeze, baseline ─────────
        // These exist to keep a certified module certified over time — not to
        // make a single report richer, but to stop a stable, certified module
        // from silently getting worse across future edits.
        // =====================================================================

        // ---- Waiver System ----

        /**
         * addWaiver(moduleId, ruleId, { reason, expires })
         *   reason is required — a waiver with no stated reason isn't an
         *   engineering decision, it's just a suppressed warning.
         *   expires (optional): ISO date string. Once passed, the waiver stops
         *   suppressing the failure automatically — no waiver is permanent by
         *   accident.
         */
        addWaiver(moduleId, ruleId, { reason, expires = null } = {}) {
            if (!reason || typeof reason !== "string") {
                throw new TypeError("[CozyCertification] addWaiver(): a non-empty `reason` is required.");
            }
            if (!this.#rules.has(ruleId)) {
                throw new TypeError(`[CozyCertification] addWaiver(): unknown rule id "${ruleId}".`);
            }
            if (!this.#waivers.has(moduleId)) this.#waivers.set(moduleId, new Map());
            const record = Object.freeze({ ruleId, reason, expires, createdAt: new Date().toISOString() });
            this.#waivers.get(moduleId).set(ruleId, record);
            this.#logAudit("WAIVER_ADDED", `${moduleId}/${ruleId} waived: ${reason}${expires ? ` (expires ${expires})` : " (no expiry)"}.`);
            return record;
        }

        removeWaiver(moduleId, ruleId) {
            const map = this.#waivers.get(moduleId);
            if (!map) return false;
            const removed = map.delete(ruleId);
            if (removed) this.#logAudit("WAIVER_REMOVED", `${moduleId}/${ruleId} waiver removed.`);
            return removed;
        }

        listWaivers(moduleId) {
            const map = this.#waivers.get(moduleId);
            return map ? this.#deepFreeze(this.#deepClone(Array.from(map.values()))) : this.#deepFreeze([]);
        }

        // Returns only currently-active (non-expired) waivers as of `atISOString`.
        // An expired waiver is intentionally NOT deleted here — it stays on
        // record (visible via listWaivers) but simply stops suppressing the
        // failure, so nothing silently stays waived forever.
        #activeWaiverMap(moduleId, atISOString) {
            const map = this.#waivers.get(moduleId);
            const active = new Map();
            if (!map) return active;
            const now = new Date(atISOString);
            for (const [ruleId, waiver] of map.entries()) {
                if (waiver.expires && new Date(waiver.expires) < now) continue; // expired — no longer active
                active.set(ruleId, waiver);
            }
            return active;
        }

        // ---- Freeze Certified Modules ----

        /**
         * freezeModule(moduleId)
         *   Only allowed on a module whose latest certification is
         *   ENTERPRISE_CERTIFIED. Records a checksum of the certified source;
         *   the next certifyModule() call for this moduleId will flag a
         *   frozenViolation if the checksum no longer matches, rather than
         *   silently re-certifying as if nothing happened.
         */
        freezeModule(moduleId) {
            const record = this.#latestRecord(moduleId);
            if (!record) throw new Error(`[CozyCertification] freezeModule(): no certification on file for "${moduleId}".`);
            if (record.verdict !== CERT_LEVELS.ENTERPRISE_CERTIFIED) {
                throw new Error(`[CozyCertification] freezeModule(): can only freeze a module that is currently ENTERPRISE_CERTIFIED (last verdict for "${moduleId}" was ${record.verdict}).`);
            }
            const frozenRecord = this.#deepFreeze({
                sourceHash: record.sourceHash, frozenAt: new Date().toISOString(),
                certificationId: record.certificationId, version: record.version
            });
            this.#frozenModules.set(moduleId, frozenRecord);
            this.#logAudit("MODULE_FROZEN", `${moduleId} frozen at ${record.certificationId} (v${record.version}).`);
            return frozenRecord;
        }

        unfreezeModule(moduleId) {
            const removed = this.#frozenModules.delete(moduleId);
            if (removed) this.#logAudit("MODULE_UNFROZEN", `${moduleId} unfrozen — future edits will no longer trigger a frozen-module violation.`);
            return removed;
        }

        isModuleFrozen(moduleId) { return this.#frozenModules.has(moduleId); }

        getFrozenInfo(moduleId) { return this.#frozenModules.get(moduleId) || null; }

        // ---- Certification Baseline ----

        /**
         * setBaseline(moduleId, certificationId?)
         *   Only an ENTERPRISE_CERTIFIED record can become a baseline. Defaults
         *   to the latest certification if certificationId is omitted. Every
         *   future certifyModule() call for this moduleId will include a
         *   baselineComparison against whatever baseline is on file — until
         *   you deliberately call setBaseline() again to move it forward.
         */
        setBaseline(moduleId, certificationId = null) {
            const record = certificationId ? this.readRecord(moduleId, certificationId) : this.#latestRecord(moduleId);
            if (!record) {
                throw new Error(`[CozyCertification] setBaseline(): no certification${certificationId ? ` "${certificationId}"` : ""} on file for "${moduleId}".`);
            }
            if (record.verdict !== CERT_LEVELS.ENTERPRISE_CERTIFIED) {
                throw new Error(`[CozyCertification] setBaseline(): only an ENTERPRISE_CERTIFIED record can become a baseline (this one is ${record.verdict}).`);
            }
            this.#baselines.set(moduleId, record);
            this.#logAudit("BASELINE_SET", `${moduleId} baseline set to ${record.certificationId} (v${record.version}).`);
            return record;
        }

        getBaseline(moduleId) { return this.#baselines.get(moduleId) || null; }

        clearBaseline(moduleId) {
            const removed = this.#baselines.delete(moduleId);
            if (removed) this.#logAudit("BASELINE_CLEARED", `${moduleId} baseline cleared.`);
            return removed;
        }

        // Compares a candidate report-in-progress against a stored baseline,
        // both at the check-group level (score deltas) and the rule level
        // (did anything that PASSED at baseline time start FAILING now).
        #compareToBaseline(baseline, current) {
            const baselineGroups = new Map(this.#computeDashboard(baseline.checksByGroup).map(g => [g.group, g]));
            const groups = this.#computeDashboard(current.checksByGroup).map((g) => {
                const base = baselineGroups.get(g.group);
                const baselineScore = base ? base.percent : null;
                let status;
                if (baselineScore === null) status = "NEW";
                else if (g.percent > baselineScore) status = "IMPROVED";
                else if (g.percent < baselineScore) status = "REGRESSED";
                else status = "UNCHANGED";
                return { group: g.group, label: g.label, baselineScore, currentScore: g.percent, status };
            });

            const regressedGroups = groups.filter(g => g.status === "REGRESSED").map(g => g.label);
            const improvedGroups = groups.filter(g => g.status === "IMPROVED").map(g => g.label);

            const baseRulePass = baseline.rulePassMap || {};
            const curRulePass = current.rulePassMap;
            const regressedRules = Object.keys(curRulePass).filter(ruleId => baseRulePass[ruleId] === true && curRulePass[ruleId] === false);

            const noRegressions = regressedGroups.length === 0 && regressedRules.length === 0;
            const status = !noRegressions ? "BASELINE_REGRESSED" : (improvedGroups.length > 0 ? "BASELINE_EXCEEDED" : "BASELINE_PRESERVED");
            const statusLabel = {
                BASELINE_REGRESSED: "Baseline Regressed",
                BASELINE_EXCEEDED: "Baseline Exceeded",
                BASELINE_PRESERVED: "Baseline Preserved"
            }[status];

            return this.#deepFreeze({
                comparedAgainst: baseline.certificationId,
                baselineVersion: baseline.version,
                noRegressions,
                regressedGroups, improvedGroups, regressedRules,
                groups, status, statusLabel
            });
        }

        #dependentsOf(moduleId) {
            const dependents = [];
            for (const app of this.#applications.values()) {
                if (app.modules.includes(moduleId)) dependents.push({ applicationId: app.id, applicationName: app.name });
            }
            return dependents;
        }

        // ---- 1. Dependency Impact Analysis ----

        /**
         * getDependencyImpact(moduleId, verdictOverride?)
         * verdictOverride lets certifyModule() call this mid-certification,
         * before the new record is stored, so the risk reflects the report
         * being produced right now rather than a stale previous one.
         */
        getDependencyImpact(moduleId, verdictOverride = null) {
            const latest = this.#latestRecord(moduleId);
            const verdict = verdictOverride || (latest ? latest.verdict : CERT_LEVELS.NOT_CERTIFIED);
            const dependents = this.#dependentsOf(moduleId);
            const baseRisk = {
                [CERT_LEVELS.ENTERPRISE_CERTIFIED]: 0,
                [CERT_LEVELS.CERTIFIED_WITH_WARNINGS]: 1,
                [CERT_LEVELS.CERTIFICATION_FAILED]: 3,
                [CERT_LEVELS.NOT_CERTIFIED]: 2,
                [CERT_LEVELS.UNKNOWN]: 2
            }[verdict] ?? 2;
            const dependentBoost = dependents.length >= 5 ? 2 : dependents.length >= 3 ? 1 : 0;
            const riskScore = Math.min(3, baseRisk + (baseRisk > 0 ? dependentBoost : 0));
            const risk = ["NONE", "LOW", "MEDIUM", "HIGH"][riskScore];
            return this.#deepFreeze({
                module: moduleId,
                moduleVerdict: verdict,
                usedBy: dependents,
                affectedApplications: dependents.length,
                risk
            });
        }

        // ---- 2. Integration Verification ----

        /**
         * verifyIntegrations(sourceText, expectedIntegrations)
         * expectedIntegrations: array of module names as they'd appear under
         * window.CozyOS (e.g. "CozyMedia" or "Media" — both forms are tried).
         * "Found" means the name is both referenced in the source text AND
         * currently discoverable on window.CozyOS (or certified in this
         * coordinator's own history) — text mentioning a name is not proof
         * the integration is wired up correctly, only a necessary signal.
         */
        verifyIntegrations(sourceText, expectedIntegrations = []) {
            const results = (expectedIntegrations || []).map((name) => {
                const shortName = name.replace(/^Cozy/, "");
                const mentionedInSource = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(sourceText || "");
                const discovered = !!(typeof window !== "undefined" && window.CozyOS && (window.CozyOS[name] || window.CozyOS[shortName]));
                const certifiedInHistory = this.#history.has(name) || this.#history.has(shortName);
                const found = mentionedInSource && (discovered || certifiedInHistory);
                return { name, mentionedInSource, discovered: discovered || certifiedInHistory, found };
            });
            const found = results.filter(r => r.found);
            const missing = results.filter(r => !r.found);
            const integrationScore = results.length === 0 ? 100 : Math.round((found.length / results.length) * 1000) / 10;
            return this.#deepFreeze({
                expected: expectedIntegrations,
                found: found.map(r => r.name),
                missing: missing.map(r => r.name),
                details: results,
                integrationScore
            });
        }

        // ---- 5. Cross-Version Compatibility ----

        #parseSemver(v) {
            const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(String(v || "").trim());
            if (!m) return null;
            return { major: +m[1], minor: +m[2], patch: +m[3] };
        }

        #compareSemver(a, b) {
            if (a.major !== b.major) return a.major - b.major;
            if (a.minor !== b.minor) return a.minor - b.minor;
            return a.patch - b.patch;
        }

        // Simplified semver range support: "^x.y.z", "~x.y.z", ">=x.y.z", and
        // exact "x.y.z". This is NOT the full npm-semver spec (no OR ranges,
        // no pre-release precedence) — good enough for a fleet compatibility
        // signal, not a substitute for a real semver library.
        #satisfiesRange(version, range) {
            const v = this.#parseSemver(version);
            if (!v) return null;
            const raw = String(range || "").trim();
            let op = "exact", base = raw;
            if (raw.startsWith("^")) { op = "caret"; base = raw.slice(1); }
            else if (raw.startsWith("~")) { op = "tilde"; base = raw.slice(1); }
            else if (raw.startsWith(">=")) { op = "gte"; base = raw.slice(2).trim(); }
            const b = this.#parseSemver(base);
            if (!b) return null;
            const cmp = this.#compareSemver(v, b);
            switch (op) {
                case "caret": return v.major === b.major && cmp >= 0;
                case "tilde": return v.major === b.major && v.minor === b.minor && cmp >= 0;
                case "gte": return cmp >= 0;
                default: return cmp === 0;
            }
        }

        /**
         * checkCompatibility(compatibleWith)
         * compatibleWith: { "Workspace": "^2.0.0", "CozyAutomation": "^1.0.0", ... }
         * Declared by the certifying caller (in the module's own header/manifest)
         * — the only honest source, since true API compatibility can't be
         * inferred from source text.
         */
        checkCompatibility(compatibleWith = {}) {
            const rows = Object.entries(compatibleWith || {}).map(([dep, range]) => {
                let discoveredVersion = null;
                if (typeof window !== "undefined" && window.CozyOS && window.CozyOS[dep] && typeof window.CozyOS[dep].getVersion === "function") {
                    discoveredVersion = window.CozyOS[dep].getVersion();
                } else {
                    const historyRecord = this.#latestRecord(dep);
                    if (historyRecord) discoveredVersion = historyRecord.version;
                }
                const compatible = discoveredVersion ? this.#satisfiesRange(discoveredVersion, range) : null;
                return { dependency: dep, requiredRange: range, discoveredVersion, compatible };
            });
            return this.#deepFreeze(rows);
        }

        // ---- 3. Readiness Matrix (per application) ----

        getReadinessMatrix(applicationId) {
            const app = this.#applications.get(applicationId);
            if (!app) throw new Error(`[CozyCertification] getReadinessMatrix(): no application registered with id "${applicationId}". Call registerApplication() first.`);
            const modules = app.modules.map((moduleId) => {
                const record = this.#latestRecord(moduleId);
                const verdict = record ? record.verdict : CERT_LEVELS.NOT_CERTIFIED;
                const symbol = verdict === CERT_LEVELS.ENTERPRISE_CERTIFIED ? "✓" : verdict === CERT_LEVELS.CERTIFIED_WITH_WARNINGS ? "⚠" : "❌";
                return { moduleId, verdict, score: record ? record.summary.scorePercent : 0, symbol };
            });
            const overallReadiness = modules.length === 0 ? 0 : Math.round((modules.reduce((sum, m) => sum + m.score, 0) / modules.length) * 10) / 10;
            const blocking = modules.filter(m => m.verdict === CERT_LEVELS.CERTIFICATION_FAILED || m.verdict === CERT_LEVELS.NOT_CERTIFIED).map(m => m.moduleId);
            const warningOnly = modules.filter(m => m.verdict === CERT_LEVELS.CERTIFIED_WITH_WARNINGS).map(m => m.moduleId);
            let deploymentStatus;
            if (blocking.length > 0) deploymentStatus = `NOT READY — blocked by ${blocking.join(", ")}`;
            else if (warningOnly.length > 0) deploymentStatus = `READY AFTER ${warningOnly.join(", ").toUpperCase()}`;
            else deploymentStatus = "READY";
            return this.#deepFreeze({
                applicationId: app.id, applicationName: app.name, modules, overallReadiness, deploymentStatus
            });
        }

        // ---- 4. Automatic Roadmap ----

        /**
         * getRoadmap(applicationId)
         * "Estimated completion" is a rough heuristic: it sums the estimated
         * fix time of CRITICAL/HIGH defects across the app's not-yet-certified
         * modules (from their latest certification report) and converts that
         * to engineering days at 6 productive hours/day. Planned features that
         * were declared but never certified have no defect data to estimate
         * from, so they're listed as remaining work with no time estimate
         * rather than a made-up number.
         */
        getRoadmap(applicationId) {
            const app = this.#applications.get(applicationId);
            if (!app) throw new Error(`[CozyCertification] getRoadmap(): no application registered with id "${applicationId}". Call registerApplication() first.`);
            const matrix = this.getReadinessMatrix(applicationId);
            const remainingModules = matrix.modules.filter(m => m.verdict !== CERT_LEVELS.ENTERPRISE_CERTIFIED).map(m => m.moduleId);
            const remainingFeatures = app.plannedFeatures.filter(f => !f.done).map(f => f.name);
            const remaining = [...remainingModules, ...remainingFeatures];

            let estimableMinutes = 0;
            let hasEstimate = false;
            for (const moduleId of remainingModules) {
                const record = this.#latestRecord(moduleId);
                if (!record) continue;
                hasEstimate = true;
                for (const d of record.defects) {
                    if (d.waived) continue; // deliberately deferred/approved — not unplanned remaining work
                    if (d.severity === SEVERITY.CRITICAL || d.severity === SEVERITY.HIGH) estimableMinutes += d.estimatedFixMinutes;
                }
            }
            const estimatedCompletionDays = hasEstimate ? Math.max(1, Math.ceil(estimableMinutes / (6 * 60))) : null;

            const totalTracked = matrix.modules.length + app.plannedFeatures.length;
            const doneTracked = matrix.modules.filter(m => m.verdict === CERT_LEVELS.ENTERPRISE_CERTIFIED).length + app.plannedFeatures.filter(f => f.done).length;
            const completedPercent = totalTracked === 0 ? 0 : Math.round((doneTracked / totalTracked) * 1000) / 10;

            return this.#deepFreeze({
                applicationId: app.id, applicationName: app.name,
                completedPercent, remaining,
                estimatedCompletionDays,
                note: remainingFeatures.length > 0
                    ? "Estimate covers modules with certification data only; planned features with no certification history aren't time-estimated."
                    : "Estimate is a rough heuristic from flagged Critical/High defect fix-time estimates, not a project-management forecast."
            });
        }

        // =====================================================================
        // ─── ENTERPRISE UPGRADE VERIFICATION ─────────────────────────────────
        // Answers one specific, recurring question: "is it safe to ship v1.1.0
        // over the currently-certified v1.0.0?" It reuses machinery already in
        // this coordinator (rule-level regression diffing, semver parsing) —
        // the new part is packaging it as a before/after upgrade decision with
        // an explicit APPROVED / APPROVED_WITH_WARNINGS / REJECTED verdict,
        // rather than something you'd have to piece together by hand from two
        // separate reports.
        // =====================================================================

        #findRecordByVersion(moduleId, version) {
            const records = this.#history.get(moduleId) || [];
            for (let i = records.length - 1; i >= 0; i--) {
                if (records[i].version === version) return records[i];
            }
            return null;
        }

        /**
         * verifyUpgrade(moduleId, { fromVersion, toVersion, fromCertificationId, toCertificationId })
         *   With no options, compares the two most recent certifications on
         *   file for moduleId. Otherwise resolves each side by version string
         *   or by exact certificationId (certificationId takes precedence if
         *   both are given for the same side).
         *
         *   Checks:
         *     - No regressions: no rule that PASSED in the "from" record now
         *       FAILS in the "to" record (any severity).
         *     - Backward compatible: no regression in the module's public-API
         *       surface groups (Coordinator Standards, Event System, Registry
         *       Engine, Import/Export, Versioning) AND no semver major-version
         *       bump. A major bump is treated as an intentional breaking
         *       change signal, per semver convention — not a defect, but not
         *       "backward compatible" either.
         *     - Previous certification preserved: the "from" record is still
         *       intact and retrievable from history, byte-for-byte (it always
         *       will be — history is append-only and every record is frozen —
         *       this check exists to make that guarantee explicit and
         *       verifiable rather than merely assumed).
         */
        verifyUpgrade(moduleId, options = {}) {
            const { fromVersion = null, toVersion = null, fromCertificationId = null, toCertificationId = null } = options;
            const records = this.#history.get(moduleId) || [];

            const resolve = (certId, version, fallback) => {
                if (certId) return this.readRecord(moduleId, certId);
                if (version) return this.#findRecordByVersion(moduleId, version);
                return fallback;
            };
            const toRecord = resolve(toCertificationId, toVersion, records[records.length - 1]);
            const fromRecord = resolve(fromCertificationId, fromVersion, records[records.length - 2]);

            if (!fromRecord || !toRecord) {
                throw new Error(`[CozyCertification] verifyUpgrade(): could not resolve both a "from" and "to" certification for "${moduleId}". Certify at least two versions, or pass explicit fromVersion/toVersion.`);
            }
            if (fromRecord.certificationId === toRecord.certificationId) {
                throw new Error(`[CozyCertification] verifyUpgrade(): "from" and "to" resolved to the same certification (${fromRecord.certificationId}) — nothing to compare.`);
            }

            const fromPass = fromRecord.rulePassMap || {};
            const toPass = toRecord.rulePassMap || {};
            const regressedRules = Object.keys(toPass).filter(id => fromPass[id] === true && toPass[id] === false);
            const improvedRules = Object.keys(toPass).filter(id => fromPass[id] === false && toPass[id] === true);
            const noRegressions = regressedRules.length === 0;

            const API_SURFACE_GROUPS = new Set(["coordinator", "event", "registry", "importexport", "versioning"]);
            const apiRegressions = regressedRules.filter(id => API_SURFACE_GROUPS.has(this.#rules.get(id)?.group));
            const blockingRegressions = regressedRules.filter(id => {
                const sev = this.#rules.get(id)?.severity;
                return sev === SEVERITY.CRITICAL || sev === SEVERITY.HIGH;
            });

            const fromSemver = this.#parseSemver(fromRecord.version);
            const toSemver = this.#parseSemver(toRecord.version);
            const majorVersionBump = !!(fromSemver && toSemver && toSemver.major > fromSemver.major);
            const backwardCompatible = apiRegressions.length === 0 && !majorVersionBump;

            // The "previous certification preserved" guarantee: history is
            // append-only and every stored record is frozen, so this is a
            // verification of an invariant, not a probabilistic check.
            const previousCertificationPreserved = this.readRecord(moduleId, fromRecord.certificationId) === fromRecord;

            let upgradeStatus;
            if (blockingRegressions.length > 0 || apiRegressions.length > 0 || !previousCertificationPreserved) {
                upgradeStatus = "REJECTED";
            } else if (regressedRules.length > 0 || majorVersionBump) {
                upgradeStatus = "APPROVED_WITH_WARNINGS";
            } else {
                upgradeStatus = "APPROVED";
            }

            const result = this.#deepFreeze({
                moduleId,
                fromVersion: fromRecord.version, toVersion: toRecord.version,
                fromCertificationId: fromRecord.certificationId, toCertificationId: toRecord.certificationId,
                fromVerdict: fromRecord.verdict, toVerdict: toRecord.verdict,
                fromScore: fromRecord.summary.scorePercent, toScore: toRecord.summary.scorePercent,
                checks: { noRegressions, backwardCompatible, previousCertificationPreserved },
                regressedRules, improvedRules, apiRegressions, blockingRegressions,
                majorVersionBump,
                upgradeStatus
            });

            this.#logAudit("UPGRADE_VERIFIED", `${moduleId} ${fromRecord.version} → ${toRecord.version}: ${upgradeStatus}.`);
            this.emit("upgrade:verified", { moduleId, fromVersion: fromRecord.version, toVersion: toRecord.version, upgradeStatus });
            return result;
        }

        exportUpgradeVerification(result, format = "text") {
            const checkLine = (label, ok) => `${ok ? "✓" : "✗"} ${label}`;
            const checks = [
                checkLine("No regressions", result.checks.noRegressions),
                checkLine("Backward compatible", result.checks.backwardCompatible),
                checkLine("Previous certification preserved", result.checks.previousCertificationPreserved)
            ];
            if (format === "json") return JSON.stringify(result, null, 2);
            if (format === "markdown") {
                const lines = [
                    `## ${result.moduleId}`, "",
                    `**v${result.fromVersion}** → **v${result.toVersion}**`, "",
                    "### Verification", "",
                    ...checks.map(c => `- ${c}`), "",
                    `### Upgrade Status`, "", `**${result.upgradeStatus}**`
                ];
                if (result.majorVersionBump) lines.push("", "> Note: major version bump detected — treated as an intentional breaking change, not a defect.");
                if (result.regressedRules.length > 0) lines.push("", `Regressed rules: ${result.regressedRules.join(", ")}`);
                return lines.join("\n");
            }
            // text — mirrors the "v1.0.0 ↓ Upgrade v1.1.0" presentation style
            const lines = [
                result.moduleId, `v${result.fromVersion}`, "  ↓", "Upgrade", `v${result.toVersion}`, "",
                "Verification", "", ...checks, "",
                "Upgrade Status", "", result.upgradeStatus
            ];
            return lines.join("\n");
        }

        // =====================================================================
        // ─── RELEASE LOCK ─────────────────────────────────────────────────────
        // A known-good snapshot you can always point back to. Locking doesn't
        // re-certify anything — it freezes an immutable record of what each
        // named module/application's certification status WAS at lock time, so
        // "what did we ship as CozyOS 2.0" stays answerable long after those
        // modules have moved on to newer certifications.
        // =====================================================================

        /**
         * lockRelease({ releaseId?, name, moduleIds, applicationIds })
         *   releaseId defaults to "REL-YYYY.MM.DD" (with a numeric suffix if
         *   that id is already taken same-day). Status is "LOCKED" only if
         *   every named module is ENTERPRISE_CERTIFIED and every named
         *   application's deploymentStatus is "READY" — otherwise
         *   "LOCKED_WITH_GAPS", which is still a valid, honest snapshot (it
         *   records what was actually true, gaps included) rather than a
         *   fabricated all-green status.
         */
        lockRelease({ releaseId = null, name = null, moduleIds = [], applicationIds = [] } = {}) {
            const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, ".");
            let id = releaseId || `REL-${datePart}`;
            let suffix = 2;
            while (this.#releases.has(id)) { id = `${releaseId || `REL-${datePart}`}-${suffix}`; suffix++; }

            const moduleSnapshots = moduleIds.map((moduleId) => {
                const record = this.#latestRecord(moduleId);
                return {
                    moduleId,
                    version: record ? record.version : null,
                    verdict: record ? record.verdict : CERT_LEVELS.NOT_CERTIFIED,
                    score: record ? record.summary.scorePercent : 0,
                    sourceHash: record ? record.sourceHash : null,
                    certificationId: record ? record.certificationId : null
                };
            });
            const applicationSnapshots = applicationIds.map((applicationId) => {
                try {
                    const matrix = this.getReadinessMatrix(applicationId);
                    return { applicationId, overallReadiness: matrix.overallReadiness, deploymentStatus: matrix.deploymentStatus };
                } catch (_err) {
                    return { applicationId, overallReadiness: 0, deploymentStatus: "NOT READY — application not registered" };
                }
            });

            const modulesReady = moduleSnapshots.filter(m => m.verdict === CERT_LEVELS.ENTERPRISE_CERTIFIED).length;
            const applicationsReady = applicationSnapshots.filter(a => a.deploymentStatus === "READY").length;
            const status = (modulesReady === moduleSnapshots.length && applicationsReady === applicationSnapshots.length)
                ? "LOCKED" : "LOCKED_WITH_GAPS";

            const release = this.#deepFreeze({
                releaseId: id,
                name: name || id,
                lockedAt: new Date().toISOString(),
                auditorVersion: CERT_VERSION,
                ruleSetVersion: this.#ruleSetVersion,
                coreModules: { ready: modulesReady, total: moduleSnapshots.length, modules: moduleSnapshots },
                applications: { ready: applicationsReady, total: applicationSnapshots.length, applications: applicationSnapshots },
                status
            });
            this.#releases.set(id, release);
            this.#logAudit("RELEASE_LOCKED", `${id} locked: ${status} (${modulesReady}/${moduleSnapshots.length} modules, ${applicationsReady}/${applicationSnapshots.length} applications).`);
            this.emit("release:locked", { releaseId: id, status });
            return release;
        }

        getRelease(releaseId) { return this.#releases.get(releaseId) || null; }

        listReleases() { return this.#deepFreeze(this.#deepClone(Array.from(this.#releases.values()))); }

        /**
         * verifyReleaseIntegrity(releaseId)
         *   Compares a locked snapshot's module versions/hashes against
         *   whatever is CURRENTLY certified for those same moduleIds, so you
         *   can tell whether "known-good" still matches reality.
         */
        verifyReleaseIntegrity(releaseId) {
            const release = this.#releases.get(releaseId);
            if (!release) throw new Error(`[CozyCertification] verifyReleaseIntegrity(): no release locked with id "${releaseId}".`);
            const drift = release.coreModules.modules.map((locked) => {
                const current = this.#latestRecord(locked.moduleId);
                const currentVersion = current ? current.version : null;
                const currentHash = current ? current.sourceHash : null;
                const driftDetected = locked.sourceHash !== currentHash || locked.version !== currentVersion;
                return { moduleId: locked.moduleId, lockedVersion: locked.version, currentVersion, drift: driftDetected };
            });
            return this.#deepFreeze({ releaseId, checkedAt: new Date().toISOString(), drift, anyDrift: drift.some(d => d.drift) });
        }

        exportRelease(releaseId, format = "text") {
            const release = this.#releases.get(releaseId);
            if (!release) throw new Error(`[CozyCertification] exportRelease(): no release locked with id "${releaseId}".`);
            if (format === "json") return JSON.stringify(release, null, 2);
            if (format === "markdown") {
                const lines = [`# Release Lock: ${release.name}`, "", `**Release ID:** ${release.releaseId}`, `**Locked At:** ${release.lockedAt}`, `**Status:** ${release.status}`, ""];
                lines.push(`## Core Modules (${release.coreModules.ready}/${release.coreModules.total})`, "", "| Module | Version | Verdict | Score |", "|---|---|---|---|");
                release.coreModules.modules.forEach(m => lines.push(`| ${m.moduleId} | ${m.version || "n/a"} | ${m.verdict} | ${m.score}% |`));
                lines.push("", `## Applications (${release.applications.ready}/${release.applications.total})`, "", "| Application | Overall | Deployment |", "|---|---|---|");
                release.applications.applications.forEach(a => lines.push(`| ${a.applicationId} | ${a.overallReadiness}% | ${a.deploymentStatus} |`));
                return lines.join("\n");
            }
            // text
            const lines = [`Lock Release`, "", release.name, "", `Core Modules  ${release.coreModules.ready}/${release.coreModules.total}`, `Applications  ${release.applications.ready}/${release.applications.total}`, "", `Release ID    ${release.releaseId}`, "", `Status        ${release.status}`];
            return lines.join("\n");
        }

        // =====================================================================
        // ─── PLATFORM UPGRADE VERIFICATION ────────────────────────────────────
        // The platform-wide sibling of verifyUpgrade(): "is it safe to move the
        // whole of CozyOS from one locked release to the next?" It compares two
        // Release Lock snapshots module-by-module (via verifyUpgrade, reusing
        // the exact certificationIds captured at each lock) and application-
        // by-application (via each release's own readiness snapshot), rather
        // than re-deriving anything new — a platform upgrade is fundamentally
        // "every module upgrade, plus every application's readiness, taken
        // together," not a separate kind of analysis.
        // =====================================================================

        /**
         * verifyPlatformUpgrade(fromReleaseId, toReleaseId)
         *   Both releases must already exist via lockRelease(). Modules/
         *   applications present in only one release are reported as NEW or
         *   REMOVED rather than silently ignored or treated as regressions.
         */
        verifyPlatformUpgrade(fromReleaseId, toReleaseId) {
            const fromRelease = this.#releases.get(fromReleaseId);
            const toRelease = this.#releases.get(toReleaseId);
            if (!fromRelease) throw new Error(`[CozyCertification] verifyPlatformUpgrade(): no release locked with id "${fromReleaseId}".`);
            if (!toRelease) throw new Error(`[CozyCertification] verifyPlatformUpgrade(): no release locked with id "${toReleaseId}".`);

            const fromModules = new Map(fromRelease.coreModules.modules.map(m => [m.moduleId, m]));
            const toModules = new Map(toRelease.coreModules.modules.map(m => [m.moduleId, m]));
            const allModuleIds = new Set([...fromModules.keys(), ...toModules.keys()]);

            const moduleResults = [];
            for (const moduleId of allModuleIds) {
                const fromMod = fromModules.get(moduleId);
                const toMod = toModules.get(moduleId);
                if (fromMod && toMod) {
                    if (!fromMod.certificationId || !toMod.certificationId) {
                        moduleResults.push({ moduleId, status: "UNVERIFIABLE", reason: "release snapshot is missing a certificationId for this module", regressedRules: [], backwardCompatible: null });
                        continue;
                    }
                    try {
                        const upgrade = this.verifyUpgrade(moduleId, { fromCertificationId: fromMod.certificationId, toCertificationId: toMod.certificationId });
                        moduleResults.push({
                            moduleId, status: upgrade.upgradeStatus,
                            fromVersion: upgrade.fromVersion, toVersion: upgrade.toVersion,
                            regressedRules: upgrade.regressedRules, apiRegressions: upgrade.apiRegressions,
                            backwardCompatible: upgrade.checks.backwardCompatible
                        });
                    } catch (err) {
                        moduleResults.push({ moduleId, status: "UNVERIFIABLE", reason: err.message, regressedRules: [], backwardCompatible: null });
                    }
                } else if (toMod && !fromMod) {
                    moduleResults.push({ moduleId, status: "NEW", toVersion: toMod.version, regressedRules: [], backwardCompatible: true });
                } else {
                    moduleResults.push({ moduleId, status: "REMOVED", fromVersion: fromMod.version, regressedRules: [], backwardCompatible: null });
                }
            }

            const verifiedCount = moduleResults.filter(m => m.status === "APPROVED" || m.status === "APPROVED_WITH_WARNINGS" || m.status === "NEW").length;
            const totalCount = toModules.size;
            const moduleRegressionsCount = moduleResults.filter(m => m.regressedRules.length > 0).length;
            const rejectedModules = moduleResults.filter(m => m.status === "REJECTED").map(m => m.moduleId);
            const removedModules = moduleResults.filter(m => m.status === "REMOVED").map(m => m.moduleId);
            const unverifiableModules = moduleResults.filter(m => m.status === "UNVERIFIABLE").map(m => m.moduleId);

            const fromApps = new Map(fromRelease.applications.applications.map(a => [a.applicationId, a]));
            const toApps = new Map(toRelease.applications.applications.map(a => [a.applicationId, a]));
            const allAppIds = new Set([...fromApps.keys(), ...toApps.keys()]);
            const rank = (status) => status === "READY" ? 2 : (status || "").startsWith("READY AFTER") ? 1 : 0;

            const applicationResults = [];
            for (const applicationId of allAppIds) {
                const fromApp = fromApps.get(applicationId);
                const toApp = toApps.get(applicationId);
                if (fromApp && toApp) {
                    const regressed = rank(toApp.deploymentStatus) < rank(fromApp.deploymentStatus);
                    applicationResults.push({ applicationId, fromStatus: fromApp.deploymentStatus, toStatus: toApp.deploymentStatus, regressed, ready: rank(toApp.deploymentStatus) >= 2 });
                } else if (toApp && !fromApp) {
                    applicationResults.push({ applicationId, fromStatus: null, toStatus: toApp.deploymentStatus, regressed: false, ready: rank(toApp.deploymentStatus) >= 2, isNew: true });
                } else {
                    applicationResults.push({ applicationId, fromStatus: fromApp.deploymentStatus, toStatus: null, regressed: true, ready: false, isRemoved: true });
                }
            }
            const applicationRegressionsCount = applicationResults.filter(a => a.regressed).length;

            const compatibility = moduleResults.every(m => m.status !== "REJECTED" && m.backwardCompatible !== false) ? "PASS" : "FAIL";

            let releaseStatus;
            if (rejectedModules.length > 0 || applicationRegressionsCount > 0 || compatibility === "FAIL" || unverifiableModules.length > 0) {
                releaseStatus = "REJECTED";
            } else if (moduleRegressionsCount > 0 || removedModules.length > 0 || moduleResults.some(m => m.status === "APPROVED_WITH_WARNINGS")) {
                releaseStatus = "APPROVED_WITH_WARNINGS";
            } else {
                releaseStatus = "APPROVED";
            }

            const result = this.#deepFreeze({
                fromReleaseId, toReleaseId,
                fromReleaseName: fromRelease.name, toReleaseName: toRelease.name,
                fromVersion: fromRelease.name, toVersion: toRelease.name,
                coreCoordinators: { verified: verifiedCount, total: totalCount },
                applications: applicationResults,
                moduleRegressions: moduleRegressionsCount,
                applicationRegressions: applicationRegressionsCount,
                compatibility,
                rejectedModules, removedModules, unverifiableModules,
                moduleResults,
                releaseStatus
            });

            this.#logAudit("PLATFORM_UPGRADE_VERIFIED", `${fromReleaseId} → ${toReleaseId}: ${releaseStatus} (${verifiedCount}/${totalCount} modules verified, compatibility ${compatibility}).`);
            this.emit("platform:upgrade-verified", { fromReleaseId, toReleaseId, releaseStatus });
            return result;
        }

        exportPlatformUpgradeVerification(result, format = "text") {
            const appMark = (a) => a.isRemoved ? "✗" : a.regressed ? "✗" : a.isNew ? "✓ (new)" : a.ready ? "✓" : "⚠";
            if (format === "json") return JSON.stringify(result, null, 2);
            if (format === "markdown") {
                const lines = [
                    `# CozyOS Platform Upgrade`, "",
                    `**Current Release:** ${result.fromReleaseName} (${result.fromReleaseId})`, "",
                    `↓`, "",
                    `**Candidate Release:** ${result.toReleaseName} (${result.toReleaseId})`, "",
                    `## Core Coordinators`, "", `${result.coreCoordinators.verified}/${result.coreCoordinators.total} verified`, "",
                    `## Applications`, ""
                ];
                result.applications.forEach(a => lines.push(`- ${a.applicationId}  ${appMark(a)}`));
                lines.push("", `## Module Regressions`, "", `${result.moduleRegressions}`, "");
                lines.push(`## Application Regressions`, "", `${result.applicationRegressions}`, "");
                lines.push(`## Compatibility`, "", `${result.compatibility}`, "");
                lines.push(`## Release Status`, "", `**${result.releaseStatus}**`);
                if (result.removedModules.length > 0) lines.push("", `Removed modules: ${result.removedModules.join(", ")}`);
                if (result.rejectedModules.length > 0) lines.push("", `Rejected modules: ${result.rejectedModules.join(", ")}`);
                return lines.join("\n");
            }
            // text — mirrors the sketched presentation
            const lines = [
                "COZYOS PLATFORM UPGRADE", "",
                "Current Release", result.fromReleaseName, "", "↓", "",
                "Candidate Release", result.toReleaseName, "",
                "Core Coordinators", `${result.coreCoordinators.verified}/${result.coreCoordinators.total} verified`, "",
                "Applications"
            ];
            result.applications.forEach(a => lines.push(`${a.applicationId.padEnd(14, " ")}${appMark(a)}`));
            lines.push("", "Module Regressions", `${result.moduleRegressions}`, "");
            lines.push("Application Regressions", `${result.applicationRegressions}`, "");
            lines.push("Compatibility", `${result.compatibility}`, "");
            lines.push("Release Status", "", result.releaseStatus);
            return lines.join("\n");
        }

        // =====================================================================
        // ─── FULL CERTIFICATION (whole-platform aggregation) ─────────────────
        // =====================================================================

        /**
         * fullCertification()
         *   Discovers every object registered under window.CozyOS (skipping
         *   this coordinator itself), classifies each as module/shell/plugin,
         *   and aggregates whatever certification history already exists for
         *   each — plus every registered application's readiness matrix —
         *   into one Platform Report.
         *
         *   IMPORTANT, HONEST LIMITATION: this coordinator cannot execute code,
         *   read the filesystem, or make network requests (Zero Logic Rule),
         *   so it has no way to pull a fresh copy of a discovered module's
         *   *source text* from a live `window.CozyOS[name]` object reference —
         *   a live instance is not its own source file. Full Certification can
         *   only report on modules that were already certified via
         *   quickCertification()/certifyModule() and are sitting in history.
         *   Anything discovered but never certified is reported honestly as
         *   "NOT YET CERTIFIED" rather than silently skipped or faked as
         *   passing. If a discovered module's live getVersion() no longer
         *   matches its last certified version, it's flagged "STALE" so you
         *   know to re-run quickCertification on the current source.
         */
        fullCertification() {
            // A real coordinator is always an object exposing methods
            // (getVersion, on/off/emit, etc). Bare functions attached
            // directly to window.CozyOS — e.g. ServiceRegistry's
            // registerApplication()/getCoordinator()/... convenience
            // passthroughs — are helpers, not coordinators, and must never
            // be reported as a "module" awaiting certification. Internal
            // bookkeeping keys (prefixed with "__") are excluded the same
            // way, for the same reason.
            const discoveredNames = (typeof window !== "undefined" && window.CozyOS)
                ? Object.keys(window.CozyOS).filter(name =>
                    name !== "Certification" &&
                    !name.startsWith("__") &&
                    typeof window.CozyOS[name] !== "function")
                : [];

            const moduleReports = [];
            const componentSummaries = [];
            for (const name of discoveredNames) {
                const liveRef = window.CozyOS[name];
                const liveVersion = liveRef && typeof liveRef.getVersion === "function" ? liveRef.getVersion() : null;
                const type = this.#classifyComponent(name);
                const record = this.#latestRecord(name);

                let staleness;
                if (!record) staleness = "NOT_YET_CERTIFIED";
                else if (liveVersion && record.version !== liveVersion) staleness = "STALE";
                else staleness = "CURRENT";

                if (record) moduleReports.push(record);

                componentSummaries.push({
                    name, type,
                    discoveredVersion: liveVersion,
                    certifiedVersion: record ? record.version : null,
                    verdict: record ? record.verdict : CERT_LEVELS.NOT_CERTIFIED,
                    score: record ? record.summary.scorePercent : 0,
                    grade: record ? record.overallGrade : "F",
                    releaseReadiness: record ? record.releaseReadiness.label : DEPLOYMENT_READINESS.NOT_CERTIFIED,
                    severityCounts: record ? record.severityCounts : { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
                    staleness,
                    note: staleness === "NOT_YET_CERTIFIED"
                        ? "Discovered on window.CozyOS but no certification on file — this coordinator cannot read its source from a live object reference; run quickCertification(sourceText, {moduleId: \"" + name + "\"}) to certify it."
                        : staleness === "STALE"
                            ? `Live getVersion() (${liveVersion}) differs from last certified version (${record.version}) — re-run quickCertification on the current source.`
                            : "Certification is current."
                });
            }

            const coreModules = componentSummaries.filter(c => c.type === "module");
            const shells = componentSummaries.filter(c => c.type === "shell");
            const plugins = componentSummaries.filter(c => c.type === "plugin");

            const applicationReports = Array.from(this.#applications.keys()).map(appId => {
                try { return this.getReadinessMatrix(appId); } catch (_err) { return null; }
            }).filter(Boolean);

            const certifiedCount = componentSummaries.filter(c => c.verdict === CERT_LEVELS.ENTERPRISE_CERTIFIED).length;
            const warningsCount = componentSummaries.filter(c => c.verdict === CERT_LEVELS.CERTIFIED_WITH_WARNINGS).length;
            const failedCount = componentSummaries.filter(c => c.verdict === CERT_LEVELS.CERTIFICATION_FAILED).length;
            const notCertifiedCount = componentSummaries.filter(c => c.verdict === CERT_LEVELS.NOT_CERTIFIED || c.verdict === CERT_LEVELS.UNKNOWN).length;

            const severityTotals = { critical: 0, high: 0, medium: 0, low: 0 };
            for (const c of componentSummaries) {
                severityTotals.critical += c.severityCounts.critical || 0;
                severityTotals.high += c.severityCounts.high || 0;
                severityTotals.medium += c.severityCounts.medium || 0;
                severityTotals.low += c.severityCounts.low || 0;
            }

            const scoredComponents = componentSummaries.filter(c => c.staleness !== "NOT_YET_CERTIFIED");
            const overallPlatformScore = scoredComponents.length === 0 ? 0
                : Math.round((scoredComponents.reduce((sum, c) => sum + c.score, 0) / scoredComponents.length) * 10) / 10;
            const overallGrade = this.#overallGrade(overallPlatformScore);

            let enterpriseVerdict;
            if (severityTotals.critical > 0 || failedCount > 0) enterpriseVerdict = CERT_LEVELS.CERTIFICATION_FAILED;
            else if (notCertifiedCount > 0 || warningsCount > 0) enterpriseVerdict = CERT_LEVELS.CERTIFIED_WITH_WARNINGS;
            else enterpriseVerdict = CERT_LEVELS.ENTERPRISE_CERTIFIED;

            const overallDeploymentStatus = notCertifiedCount > 0
                ? `NOT READY — ${notCertifiedCount} component(s) never certified`
                : this.#computeReleaseReadiness(severityTotals).label;

            const platformReport = this.#deepFreeze({
                generatedAt: new Date().toISOString(),
                auditorVersion: CERT_VERSION,
                verificationMethod: "Aggregation of existing certification history for every component discovered on window.CozyOS, plus every registered application's readiness matrix. Does not re-analyze source — see per-component 'staleness' field for what's current vs. stale vs. never certified.",
                counts: {
                    coreModulesTotal: coreModules.length,
                    applicationsTotal: applicationReports.length,
                    shellsTotal: shells.length,
                    pluginsTotal: plugins.length,
                    certified: certifiedCount,
                    warnings: warningsCount,
                    failed: failedCount,
                    notYetCertified: notCertifiedCount
                },
                overallPlatformScore,
                overallGrade,
                overallReadiness: overallPlatformScore,
                overallDeploymentStatus,
                severityTotals,
                enterpriseVerdict,
                enterpriseVerdictLabel: this.#simpleVerdictLabel(enterpriseVerdict),
                coreModules: coreModules,
                shells: shells,
                plugins: plugins,
                applications: applicationReports.map(a => ({ applicationId: a.applicationId, applicationName: a.applicationName, overallReadiness: a.overallReadiness, deploymentStatus: a.deploymentStatus }))
            });

            this.#logAudit("FULL_CERTIFICATION_RUN", `Platform certification run: ${componentSummaries.length} component(s), ${applicationReports.length} application(s), verdict ${enterpriseVerdict}.`);
            this.#logTimeline(`Full platform certification completed: ${enterpriseVerdict}`);
            this.emit("platform:certified", { enterpriseVerdict, overallPlatformScore });

            return { platformReport, moduleReports, applicationReports };
        }

        // =====================================================================
        // ─── PROJECT CERTIFICATION (Phase 3) ────────────────────────────────
        // Extends single-file certification to a complete multi-file
        // project (ZIP/multi-upload/Workspace project) — never a second
        // certification engine. Every .js file is certified through the
        // exact same quickCertification() used everywhere else in CozyOS;
        // this layer only aggregates those real results and adds real,
        // verifiable cross-file checks over the actual file contents.
        // =====================================================================

        /**
         * #deriveModuleIdFromPath(path)
         *   Same kebab-to-Pascal convention used across CozyOS (Workspace,
         *   Builder) — kept local here rather than importing another
         *   coordinator, since Certification must stay independently
         *   loadable.
         */
        #deriveModuleIdFromPath(path) {
            const filename = path.split("/").pop() || path;
            const bare = filename.replace(/\.[^.]+$/, "");
            const m = /^cozy-([a-z0-9-]+)$/i.exec(bare);
            const words = (m ? m[1] : bare).split("-").filter(Boolean);
            return words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join("") || "Module";
        }

        /**
         * certifyProject(files, { projectName, version })
         *   files: {path: content}. Every .js file is certified via the
         *   real, unchanged quickCertification() — no duplicated rules.
         *   Non-JS files (HTML/CSS/JSON/docs/assets) are listed but not
         *   certified against JS rules; they ARE used as real input to
         *   cross-file validation (asset references, manifest
         *   consistency).
         */
        certifyProject(files, { projectName = "Project", version = "1.0.0" } = {}) {
            const perFile = {};
            const jsFiles = Object.entries(files).filter(([path]) => /\.js$/i.test(path));
            const nonJsFiles = Object.entries(files).filter(([path]) => !/\.js$/i.test(path));

            for (const [path, content] of jsFiles) {
                const moduleId = this.#deriveModuleIdFromPath(path);
                try {
                    const report = this.quickCertification(content, { moduleId, moduleName: moduleId, version });
                    perFile[path] = {
                        moduleId, verdict: report.verdict, scorePercent: report.summary.scorePercent,
                        critical: report.severityCounts.critical, high: report.severityCounts.high,
                        medium: report.severityCounts.medium, low: report.severityCounts.low,
                        remainingFindings: (report.defects || []).filter(d => !d.waived).map(d => `[${d.severity}] ${d.id}: ${d.description}`)
                    };
                } catch (err) {
                    perFile[path] = { moduleId, verdict: "CERTIFICATION_ERROR", error: err.message, critical: null, high: null, medium: null, low: null, remainingFindings: [] };
                }
            }
            for (const [path] of nonJsFiles) {
                perFile[path] = { moduleId: null, verdict: "NOT_APPLICABLE", note: "Non-JS file — not certified against JS rules.", critical: 0, high: 0, medium: 0, low: 0, remainingFindings: [] };
            }

            const jsResults = jsFiles.map(([path]) => perFile[path]);
            const certifiedFiles = jsResults.filter(r => r.verdict === "ENTERPRISE_CERTIFIED").length;
            const warningFiles = jsResults.filter(r => r.verdict === "CERTIFIED_WITH_WARNINGS").length;
            const failedFiles = jsResults.filter(r => r.verdict === "CERTIFICATION_FAILED" || r.verdict === "CERTIFICATION_ERROR").length;
            const scoredResults = jsResults.filter(r => typeof r.scorePercent === "number");
            const overallProjectScore = scoredResults.length ? Math.round((scoredResults.reduce((sum, r) => sum + r.scorePercent, 0) / scoredResults.length) * 10) / 10 : null;
            const overallProjectVerdict = jsResults.length === 0 ? "NO_JS_FILES"
                : failedFiles > 0 ? "CERTIFICATION_FAILED"
                : warningFiles > 0 ? "CERTIFIED_WITH_WARNINGS"
                : "ENTERPRISE_CERTIFIED";

            const crossFileValidation = this.#validateProjectCrossFile(files, jsFiles, version);

            this.#logAudit("PROJECT_CERTIFIED", `${projectName}: ${overallProjectVerdict} (${overallProjectScore}%), ${jsFiles.length} JS file(s).`);
            this.emit("project:certified", { projectName, overallProjectVerdict });

            return this.#deepFreeze(this.#deepClone({
                projectName, version, totalFiles: Object.keys(files).length,
                certifiedFiles, warningFiles, failedFiles,
                overallProjectScore, overallProjectVerdict,
                perFile, crossFileValidation
            }));
        }

        /**
         * #validateProjectCrossFile(files, jsFiles, projectVersion)
         *   Every check here is a real, verifiable scan over the actual
         *   file contents — never a guess. A check that has nothing to
         *   verify (e.g. no manifest.json present) is reported as
         *   "not applicable", never fabricated as passing.
         */
        #validateProjectCrossFile(files, jsFiles, projectVersion) {
            const definedExports = new Map(); // exportName -> [paths that define it]
            const registeredNames = new Map(); // coordinator name -> [paths that register it]
            const referencedNames = new Map(); // referenced name -> [paths that reference it]
            const headerVersions = new Map(); // path -> version string found in its header
            const KNOWN_PLATFORM_NAMES = new Set(["WorkspaceShell", "ServiceRegistry", "Certification", "Builder", "BugFixer", "UnderstandingEngine", "RequirementReader", "ProjectRefactor", "CozyMemory", "DeploymentManager", "registerCoordinator", "PluginManager", "KernelPlugins", "LanguageEngine"]);

            for (const [path, content] of jsFiles) {
                for (const m of content.matchAll(/window\.CozyOS\.([A-Za-z][A-Za-z0-9_]*)\s*=\s*new\s+/g)) {
                    (definedExports.get(m[1]) || definedExports.set(m[1], []).get(m[1])).push(path);
                }
                for (const m of content.matchAll(/registerCoordinator\(\s*\{\s*name\s*:\s*["']([^"']+)["']/g)) {
                    (registeredNames.get(m[1]) || registeredNames.set(m[1], []).get(m[1])).push(path);
                }
                for (const m of content.matchAll(/window\.CozyOS\.([A-Za-z][A-Za-z0-9_]*)/g)) {
                    if (m[1] === "CozyOS") continue;
                    (referencedNames.get(m[1]) || referencedNames.set(m[1], []).get(m[1])).push(path);
                }
                const versionMatch = /\*\s*Version:\s*([^\n*]+)/.exec(content);
                if (versionMatch) headerVersions.set(path, versionMatch[1].trim());
            }

            // Duplicate exports: the SAME window.CozyOS.X = new X() in 2+ files — a real registration collision.
            const duplicateExports = Array.from(definedExports.entries()).filter(([, paths]) => paths.length > 1).map(([name, paths]) => ({ name, paths }));
            // Duplicate registrations: the SAME registerCoordinator name from 2+ files.
            const duplicateRegistrations = Array.from(registeredNames.entries()).filter(([, paths]) => paths.length > 1).map(([name, paths]) => ({ name, paths }));
            // Missing dependencies: referenced but neither defined in this project nor a known platform coordinator.
            const missingDependencies = Array.from(referencedNames.entries()).filter(([name]) => !definedExports.has(name) && !KNOWN_PLATFORM_NAMES.has(name)).map(([name, paths]) => ({ name, referencedIn: paths }));

            // Version consistency: every JS header version should match the project version — flagged, not assumed.
            const versionMismatches = Array.from(headerVersions.entries()).filter(([, v]) => v !== projectVersion).map(([path, v]) => ({ path, fileVersion: v, projectVersion }));

            // Manifest consistency: real JSON parse, real field comparison — only if a manifest actually exists.
            const manifestEntry = Object.entries(files).find(([path]) => /manifest\.json$/i.test(path));
            let manifestConsistency = { applicable: false };
            if (manifestEntry) {
                try {
                    const manifest = JSON.parse(manifestEntry[1]);
                    manifestConsistency = { applicable: true, path: manifestEntry[0], versionMatches: manifest.version === projectVersion, manifestVersion: manifest.version || null };
                } catch (err) { manifestConsistency = { applicable: true, path: manifestEntry[0], parseError: err.message }; }
            }

            // Asset references / entry point validity: every real src=/href= in HTML files must resolve to a file actually present in this project (external http(s) URLs are not project-local assets and are skipped, not flagged).
            const allPaths = new Set(Object.keys(files));
            const brokenReferences = [];
            for (const [path, content] of Object.entries(files)) {
                if (!/\.html?$/i.test(path)) continue;
                const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/") + 1) : "";
                for (const m of content.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
                    const ref = m[1];
                    if (/^(https?:)?\/\//i.test(ref) || ref.startsWith("data:")) continue;
                    const resolved = (dir + ref).replace(/^\.\//, "");
                    if (!allPaths.has(resolved) && !allPaths.has(ref)) brokenReferences.push({ inFile: path, reference: ref });
                }
            }

            return {
                duplicateExports, duplicateRegistrations, missingDependencies, versionMismatches,
                manifestConsistency, brokenReferences,
                method: "real regex/JSON scans over actual file contents — every finding traces to a specific file and pattern, none inferred"
            };
        }

        #platformAsciiDashboard(platformReport) {
            const cnt = platformReport.counts;
            const modulesNotYet = platformReport.coreModules.filter(m => m.staleness === "NOT_YET_CERTIFIED").length;
            const modulesCertifiedRatio = `${cnt.coreModulesTotal - modulesNotYet}/${cnt.coreModulesTotal}`;
            const lines = [
                "══════════════════════════════", "",
                "COZYOS ENTERPRISE", "",
                `Core Modules       ${modulesCertifiedRatio}`,
                `Applications       ${cnt.applicationsTotal}`,
                `Shells             ${cnt.shellsTotal}`,
                `Plugins            ${cnt.pluginsTotal}`, "",
                `Certified          ${cnt.certified}`,
                `Warnings           ${cnt.warnings}`,
                `Failed             ${cnt.failed}`,
                `Not Yet Certified  ${cnt.notYetCertified}`, "",
                `Overall Score      ${platformReport.overallPlatformScore}%`,
                // "Status" reflects deployment readiness (stricter — accounts for
                // never-certified components); "Verdict" reflects the quality of
                // whatever HAS been certified. These can legitimately differ, so
                // both are shown rather than collapsing them into one number
                // that would otherwise contradict itself.
                `Status             ${platformReport.overallDeploymentStatus}`,
                `Verdict            ${platformReport.enterpriseVerdictLabel} (Grade ${platformReport.overallGrade})`, "",
                "══════════════════════════════"
            ];
            return lines.join("\n");
        }

        /**
         * exportPlatformReport(fullCertificationResult, format)
         *   format: "json" | "html" | "markdown" | "csv" | "text"
         */
        exportPlatformReport(fullResult, format = "json") {
            const { platformReport, moduleReports, applicationReports } = fullResult;
            switch (format) {
                case "json":
                    return JSON.stringify({ platformReport, moduleReports, applicationReports }, null, 2);
                case "csv": {
                    const header = ["Name", "Type", "Verdict", "Score", "Grade", "Staleness"];
                    const esc = (v) => `"${String(v === undefined || v === null ? "" : v).replace(/"/g, '""')}"`;
                    const rows = [...platformReport.coreModules, ...platformReport.shells, ...platformReport.plugins]
                        .map(c => [c.name, c.type, c.verdict, c.score, c.grade, c.staleness].map(esc).join(","));
                    return [header.join(","), ...rows].join("\n");
                }
                case "markdown": {
                    const lines = [];
                    lines.push("# CozyOS Enterprise Platform Report", "");
                    lines.push("```", this.#platformAsciiDashboard(platformReport), "```", "");
                    lines.push("## Core Modules", "", "| Module | Score | Verdict | Release | Staleness |", "|---|---|---|---|---|");
                    platformReport.coreModules.forEach(c => lines.push(`| ${c.name} | ${c.score}% | ${c.verdict} | ${c.releaseReadiness} | ${c.staleness} |`));
                    if (platformReport.shells.length > 0) {
                        lines.push("", "## Shells", "", "| Shell | Score | Verdict | Staleness |", "|---|---|---|---|");
                        platformReport.shells.forEach(c => lines.push(`| ${c.name} | ${c.score}% | ${c.verdict} | ${c.staleness} |`));
                    }
                    if (platformReport.plugins.length > 0) {
                        lines.push("", "## Plugins", "", "| Plugin | Score | Verdict | Staleness |", "|---|---|---|---|");
                        platformReport.plugins.forEach(c => lines.push(`| ${c.name} | ${c.score}% | ${c.verdict} | ${c.staleness} |`));
                    }
                    lines.push("", "## Applications", "", "| Application | Overall | Deployment |", "|---|---|---|");
                    platformReport.applications.forEach(a => lines.push(`| ${a.applicationName} | ${a.overallReadiness}% | ${a.deploymentStatus} |`));
                    lines.push("", "## Enterprise Verdict", "", `**${platformReport.enterpriseVerdictLabel}** (${platformReport.enterpriseVerdict}) — Grade ${platformReport.overallGrade}`);
                    return lines.join("\n");
                }
                case "text": {
                    const lines = [this.#platformAsciiDashboard(platformReport), "", "CORE MODULES"];
                    platformReport.coreModules.forEach(c => lines.push(`  ${c.name} — ${c.score}% — ${c.verdict} — ${c.staleness}`));
                    if (platformReport.shells.length) { lines.push("", "SHELLS"); platformReport.shells.forEach(c => lines.push(`  ${c.name} — ${c.score}% — ${c.verdict}`)); }
                    if (platformReport.plugins.length) { lines.push("", "PLUGINS"); platformReport.plugins.forEach(c => lines.push(`  ${c.name} — ${c.score}% — ${c.verdict}`)); }
                    lines.push("", "APPLICATIONS");
                    platformReport.applications.forEach(a => lines.push(`  ${a.applicationName} — ${a.overallReadiness}% — ${a.deploymentStatus}`));
                    lines.push("", `ENTERPRISE VERDICT: ${platformReport.enterpriseVerdictLabel} (Grade ${platformReport.overallGrade})`);
                    return lines.join("\n");
                }
                case "html": {
                    const esc = (v) => this.#escapeHtml(v);
                    const rowsFor = (list) => list.map(c => `<tr><td>${esc(c.name)}</td><td>${esc(c.score)}%</td><td>${esc(c.verdict)}</td><td>${esc(c.staleness)}</td></tr>`).join("");
                    const appRows = platformReport.applications.map(a => `<tr><td>${esc(a.applicationName)}</td><td>${esc(a.overallReadiness)}%</td><td>${esc(a.deploymentStatus)}</td></tr>`).join("");
                    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>CozyOS Enterprise Platform Report</title>
<style>body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;margin:2rem;color:#1c1c1e;}
table{border-collapse:collapse;width:100%;margin:1rem 0;} th,td{border:1px solid #ddd;padding:.4rem .6rem;font-size:.9rem;text-align:left;}
pre.dash{background:#0f172a;color:#e2e8f0;padding:1rem;border-radius:6px;}</style></head><body>
<h1>CozyOS Enterprise Platform Report</h1>
<pre class="dash">${esc(this.#platformAsciiDashboard(platformReport))}</pre>
<h2>Core Modules</h2><table><thead><tr><th>Module</th><th>Score</th><th>Verdict</th><th>Staleness</th></tr></thead><tbody>${rowsFor(platformReport.coreModules)}</tbody></table>
${platformReport.shells.length ? `<h2>Shells</h2><table><thead><tr><th>Shell</th><th>Score</th><th>Verdict</th><th>Staleness</th></tr></thead><tbody>${rowsFor(platformReport.shells)}</tbody></table>` : ""}
${platformReport.plugins.length ? `<h2>Plugins</h2><table><thead><tr><th>Plugin</th><th>Score</th><th>Verdict</th><th>Staleness</th></tr></thead><tbody>${rowsFor(platformReport.plugins)}</tbody></table>` : ""}
<h2>Applications</h2><table><thead><tr><th>Application</th><th>Overall</th><th>Deployment</th></tr></thead><tbody>${appRows}</tbody></table>
<h2>Enterprise Verdict</h2><p><b>${esc(platformReport.enterpriseVerdictLabel)}</b> (${esc(platformReport.enterpriseVerdict)}) — Grade ${esc(platformReport.overallGrade)}</p>
</body></html>`;
                }
                default:
                    throw new TypeError(`[CozyCertification] exportPlatformReport(): unsupported format "${format}".`);
            }
        }
    }

    // --- INSTANTIATION & VERSION CONFLICT / HOT RELOAD PROTECTION ---
    // Mirrors the convention used by every other CozyOS kernel: a same-version
    // reload is a safe no-op; a different-version reload throws rather than
    // silently overwriting certified state.
    if (window.CozyOS.Certification && typeof window.CozyOS.Certification.getVersion === "function") {
        const existingVersion = window.CozyOS.Certification.getVersion();
        if (existingVersion !== CERT_VERSION) {
            throw new Error(`[CozyOS Framework Execution Error] VERSION_CONFLICT: Certification existing v${existingVersion} conflicts with load target v${CERT_VERSION}.`);
        }
        return;
    }

    window.CozyOS.Certification = new CozyOSCertificationCoordinator();

    // Auto-register with the Service Registry — retries if it isn't loaded
    // yet (load order isn't guaranteed), instead of only ever trying once.
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
        const maxAttempts = 200; // ~50s at 250ms — bounded, not infinite
        const intervalId = setInterval(() => {
            attempts++;
            if (attempt() || attempts >= maxAttempts) {
                clearInterval(intervalId);
                const idx = window.CozyOS.__pendingCoordinatorRegistrations.indexOf(descriptor);
                if (idx !== -1) window.CozyOS.__pendingCoordinatorRegistrations.splice(idx, 1);
            }
        }, 250);
    })({
        name: "Certification", category: "Foundation", icon: "certification.svg",
        description: "CozyCertification — the independent quality authority for CozyOS. Certifies modules and applications against Enterprise architecture rules; never modifies, executes, or evaluates the code it inspects."
    });
})();
