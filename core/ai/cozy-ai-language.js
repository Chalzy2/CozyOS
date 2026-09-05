/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  CozyOS UNIVERSAL AI NATIVE LANGUAGE REGISTRY ENGINE
 *  FILE:    core/ai/cozy-ai-language.js
 *  VERSION: 6.0.0
 *
 *  CHANGES FROM v5.9:
 *  ─────────────────────────────────────────────────────────────────────────────
 *  1. UNLIMITED LANGUAGE PACKS
 *     - Removed hardcoded 3-language list from loadInstalledLanguagePacks()
 *     - Language packs are now discovered from CozyStorage + /core/ai/languages/
 *     - Built-in packs (en, sw, luo) remain as baseline fallbacks
 *     - New: PackRegistry.discover() — finds all installed pack codes
 *     - New: registerPack(code, dictionary) — runtime pack registration
 *     - New: getInstalledPackCodes() — lists all loaded packs
 *
 *  2. CONFIDENCE SCORING
 *     - workspaceKnowledgeBase now stores KnowledgeEntry objects (not bare strings)
 *     - KnowledgeEntry: { meaning, confidence, usageCount, lastUsed,
 *                         approvedBy, approvedAt, flaggedForReview }
 *     - resolve() returns meaning string (backward-compatible) but internally
 *       increments usageCount and updates lastUsed on every hit
 *     - resolveWithConfidence() — new API returning full KnowledgeEntry
 *     - Confidence auto-degrades when corrections are submitted for the same term
 *     - Terms below CONFIDENCE_REVIEW_THRESHOLD are auto-flagged for review
 *     - Confidence flush runs every 60 seconds to avoid write-per-resolve cost
 *
 *  3. LEARNING SCOPE
 *     - Every term now has a scope: 'global' | 'workspace' | 'module' | 'personal'
 *     - submitTerm() accepts optional scope parameter (defaults to 'workspace')
 *     - resolve() accepts a ScopeContext and applies priority chain:
 *         personal → module → workspace → global
 *     - resolveWithScope() — explicit scope-chain lookup with source attribution
 *     - Knowledge is strictly isolated: workspace A terms never appear in workspace B
 *     - Personal scope is user-scoped; module scope is module-type-scoped
 *
 *  ALL v5.9 APIs PRESERVED — zero breaking changes
 *  ─────────────────────────────────────────────────────────────────────────────
 *  ARCHITECTURE RULES (from spec COZYOS-AI-LANG-REG-V6.0-SPEC):
 *  ─────────────────────────────────────────────────────────────────────────────
 *  - Teaching inputs NEVER activate without approval
 *  - Workspace knowledge is ALWAYS workspace-scoped (minimum)
 *  - Global scope requires Owner + System Admin dual approval
 *  - Confidence degrades on correction; auto-flags below threshold
 *  - Scope isolation is enforced in every resolve() call — no cross-workspace leak
 *  - All teaching events written to audit trail
 *  - Level 5 requires Owner / System Admin approval
 * ══════════════════════════════════════════════════════════════════════════════
 */

"use strict";

// ─────────────────────────────────────────────────────────────────────────────
//  CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const TEACHING_LEVELS = {
  1: { label: "New Words",           minSubmitter: "staff",      minApprover: "supervisor" },
  2: { label: "Company Terminology", minSubmitter: "staff",      minApprover: "supervisor" },
  3: { label: "Business Procedures", minSubmitter: "supervisor", minApprover: "manager"    },
  4: { label: "Local Dialect",       minSubmitter: "staff",      minApprover: "supervisor" },
  5: { label: "Industry Knowledge",  minSubmitter: "manager",    minApprover: "owner"      },
};

const TEACHING_STATUSES = {
  PENDING:    "pending",
  APPROVED:   "approved",
  REJECTED:   "rejected",
  SUPERSEDED: "superseded",
};

// Ordered from highest to lowest authority
const ROLE_HIERARCHY = ["owner", "system_admin", "manager", "supervisor", "staff"];

/**
 * Valid learning scopes. Priority chain when resolving: personal → module → workspace → global.
 *
 *   global    — Available across all workspaces on CozyOS (dual-approval required)
 *   workspace — Scoped to the current workspace only (default)
 *   module    — Scoped to a specific module type (e.g. "quarry", "hospital", "retail")
 *   personal  — Scoped to a single user (highest resolution priority)
 */
const LEARNING_SCOPES = {
  GLOBAL:    "global",
  WORKSPACE: "workspace",
  MODULE:    "module",
  PERSONAL:  "personal",
};

// Scope resolution priority: index 0 is checked first
const SCOPE_PRIORITY = [
  LEARNING_SCOPES.PERSONAL,
  LEARNING_SCOPES.MODULE,
  LEARNING_SCOPES.WORKSPACE,
  LEARNING_SCOPES.GLOBAL,
];

// Confidence thresholds
const CONFIDENCE_INITIAL          = 0.75; // Starting confidence for a newly approved term
const CONFIDENCE_REVIEW_THRESHOLD = 0.40; // Below this, auto-flag for re-approval
const CONFIDENCE_MAX              = 1.00;
const CONFIDENCE_CORRECTION_DECAY = 0.15; // Subtracted each time a correction is submitted

// Flush accumulated usage stats to storage at this interval (ms)
// Prevents a storage write on every single resolve() call in high-traffic sessions
const CONFIDENCE_FLUSH_INTERVAL_MS = 60_000; // 1 minute

// Teaching intent detection patterns (v5.9 unchanged)
const TEACHING_PATTERNS = [
  /^(.+?)\s+means\s+(.+)$/i,
  /^(.+?)\s+refers?\s+to\s+(.+)$/i,
  /^we\s+call\s+(.+?)\s+(?:as\s+)?(.+)$/i,
  /^(.+?)\s+is\s+called\s+(.+?)\s+here$/i,
  /^here\s+(?:we\s+call\s+)?(.+?)\s+(?:is\s+)?(.+)$/i,
  /^(.+?)\s+is\s+our\s+(?:word|term|name)\s+for\s+(.+)$/i,
];

// ─────────────────────────────────────────────────────────────────────────────
//  KNOWLEDGE ENTRY
//  Replaces bare string values in workspaceKnowledgeBase.
//  resolve() still returns entry.meaning (string) — backward-compatible.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} KnowledgeEntry
 * @property {string}  meaning           - The resolved meaning of the trigger phrase
 * @property {number}  confidence        - 0.0–1.0. Starts at CONFIDENCE_INITIAL.
 * @property {number}  usageCount        - Incremented on every resolve() hit
 * @property {number}  lastUsed          - Unix timestamp of last resolve() hit
 * @property {string}  approvedBy        - User ID of the approver
 * @property {string}  approvedAt        - ISO timestamp of approval
 * @property {boolean} flaggedForReview  - true when confidence < CONFIDENCE_REVIEW_THRESHOLD
 * @property {string}  scope             - One of LEARNING_SCOPES
 * @property {string}  moduleScope       - Module type this term applies to (or 'all')
 * @property {string}  userId            - Set for personal-scope terms
 * @property {string}  workspaceId       - Set for workspace/module/personal terms
 * @property {boolean} _dirty            - Internal: true when usage stats need flushing
 */

/**
 * Create a new KnowledgeEntry from an approved storage record.
 * @param {Object} record - Approved workspace_ai_knowledge record
 * @returns {KnowledgeEntry}
 */
function createKnowledgeEntry(record) {
  return {
    meaning          : record.resolved_meaning,
    confidence       : typeof record.confidence === "number" ? record.confidence : CONFIDENCE_INITIAL,
    usageCount       : record.usage_count  || 0,
    lastUsed         : record.last_used    || Date.now(),
    approvedBy       : record.approved_by  || "",
    approvedAt       : record.activated_at || new Date().toISOString(),
    flaggedForReview  : record.flagged_for_review || false,
    scope            : record.scope        || LEARNING_SCOPES.WORKSPACE,
    moduleScope      : record.module_scope || "all",
    userId           : record.user_id      || null,
    workspaceId      : record.workspace_id || null,
    _dirty           : false,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  PACK REGISTRY — discovers language pack codes from storage and filesystem
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Discovers installed language pack codes.
 * Priority:
 *   1. CozyStorage (user-installed packs including custom/*)
 *   2. Built-in baseline fallbacks (en, sw, luo)
 *
 * The caller (loadInstalledLanguagePacks) loads the actual dictionaries.
 */
const PackRegistry = {
  /**
   * Returns all pack codes available to load.
   * Merges storage-registered packs with built-in codes.
   * @returns {Promise<string[]>} e.g. ['en', 'sw', 'luo', 'kikuyu', 'french', 'quarry-local']
   */
  async discover() {
    const built_in = ["en", "sw", "luo"];
    const storage  = window.CozyOS?.Storage;

    if (!storage || typeof storage.find !== "function") {
      return built_in;
    }

    try {
      // Storage records should have at minimum: { languageCode: string, dictionary: Object }
      const records   = await storage.find("ai_language_packs", {});
      const fromStore = (records || [])
        .map(r => r.languageCode)
        .filter(c => typeof c === "string" && c.trim().length > 0);

      // Merge: built-ins first (stable ordering), then additional packs
      const all = new Set([...built_in, ...fromStore]);
      return [...all];
    } catch (err) {
      console.warn("[PackRegistry] Discovery failed, using built-ins:", err.message);
      return built_in;
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
//  TEACHING ENGINE
// ─────────────────────────────────────────────────────────────────────────────

class CozyAITeachingEngine {
  /**
   * @param {CozyAILanguageRegistry} registry - Parent registry instance
   */
  constructor(registry) {
    this.registry = registry;

    /**
     * In-memory knowledge store.
     * Keys are scoped to prevent cross-workspace/cross-user pollution.
     *
     * Key format:
     *   personal  → `personal:${userId}:${phrase}`
     *   module    → `module:${workspaceId}:${moduleType}:${phrase}`
     *   workspace → `workspace:${workspaceId}:${phrase}`
     *   global    → `global:${phrase}`
     *
     * This means the same phrase ("kite") can exist simultaneously in multiple scopes
     * with different meanings, and the resolver picks the most specific one.
     *
     * @type {Map<string, KnowledgeEntry>}
     */
    this.knowledgeBase = new Map();

    // Timer handle for periodic confidence/usage flush
    this._flushTimer = null;
  }

  // ── Key Builders ─────────────────────────────────────────────────────────────

  /**
   * Build the canonical Map key for a given scope context.
   * @param {string} phrase         - Normalised trigger phrase
   * @param {string} scope          - One of LEARNING_SCOPES
   * @param {Object} ctx            - { workspaceId, moduleType, userId }
   * @returns {string}
   */
  _buildKey(phrase, scope, ctx = {}) {
    const p = phrase.toLowerCase().trim();
    switch (scope) {
      case LEARNING_SCOPES.PERSONAL:
        return `personal:${ctx.userId || "unknown"}:${p}`;
      case LEARNING_SCOPES.MODULE:
        return `module:${ctx.workspaceId || "unknown"}:${ctx.moduleType || "all"}:${p}`;
      case LEARNING_SCOPES.WORKSPACE:
        return `workspace:${ctx.workspaceId || "unknown"}:${p}`;
      case LEARNING_SCOPES.GLOBAL:
        return `global:${p}`;
      default:
        return `workspace:${ctx.workspaceId || "unknown"}:${p}`;
    }
  }

  // ── Persistence ─────────────────────────────────────────────────────────────

  /**
   * Load all approved terms from CozyStorage into the in-memory knowledge base.
   * Workspace isolation is enforced: only loads records matching the current workspace.
   * Global records are loaded for all workspaces.
   * Called once at registry startup.
   */
  async loadWorkspaceKnowledge() {
    const storage     = window.CozyOS?.Storage;
    const workspaceId = window.CozyOS?.session?.workspace_id;
    const userId      = window.CozyOS?.session?.user_id;

    if (!storage || typeof storage.find !== "function") return;

    try {
      // Load workspace, module, and personal records for this workspace
      const wsRecords = workspaceId
        ? await storage.find("workspace_ai_knowledge", {
            workspace_id: workspaceId,
            status:       TEACHING_STATUSES.APPROVED,
          })
        : [];

      // Load global records (workspace_id is null for global scope)
      const globalRecords = await storage.find("workspace_ai_knowledge", {
        scope:  LEARNING_SCOPES.GLOBAL,
        status: TEACHING_STATUSES.APPROVED,
      });

      let loaded = 0;
      for (const record of [...(wsRecords || []), ...(globalRecords || [])]) {
        const entry = createKnowledgeEntry(record);
        const ctx   = {
          workspaceId : record.workspace_id,
          moduleType  : record.module_scope || "all",
          userId      : record.user_id,
        };
        const key = this._buildKey(record.trigger_phrase, entry.scope, ctx);
        this.knowledgeBase.set(key, entry);
        loaded++;
      }

      console.log(`► [TEACHING ENGINE] Loaded ${loaded} approved terms across all scopes.`);

      // Start periodic flush for usage stats
      this._startFlushTimer();

    } catch (err) {
      console.warn("[Teaching Engine] Failed loading knowledge base:", err.message);
    }
  }

  /**
   * Persist a new teaching record to CozyStorage.
   * @param {Object} record
   * @returns {Promise<string>} Generated record ID
   */
  async _persistRecord(record) {
    const storage = window.CozyOS?.Storage;
    if (!storage || typeof storage.insert !== "function") {
      throw new Error("[Teaching Engine] Storage not available.");
    }
    return storage.insert("workspace_ai_knowledge", record);
  }

  /**
   * Write an audit event for every teaching action.
   * Non-blocking — failures are logged but do not throw.
   * @param {string} event
   * @param {Object} data
   */
  async _audit(event, data) {
    const storage = window.CozyOS?.Storage;
    if (!storage || typeof storage.insert !== "function") return;
    try {
      await storage.insert("ai_teaching_audit", {
        event,
        data,
        timestamp:    new Date().toISOString(),
        workspace_id: window.CozyOS?.session?.workspace_id,
      });
    } catch (err) {
      console.warn("[Teaching Engine] Audit write failed:", err.message);
    }
  }

  /**
   * Flush dirty usage statistics (usageCount, lastUsed, confidence, flaggedForReview)
   * back to CozyStorage. Called on a timer to batch writes rather than writing on
   * every single resolve() call.
   */
  async _flushUsageStats() {
    const storage = window.CozyOS?.Storage;
    if (!storage || typeof storage.update !== "function") return;

    const dirty = [...this.knowledgeBase.entries()].filter(([, entry]) => entry._dirty);
    if (dirty.length === 0) return;

    for (const [, entry] of dirty) {
      try {
        // Use trigger_phrase + workspace_id as the update selector
        await storage.update(
          "workspace_ai_knowledge",
          { trigger_phrase: entry._phrase, workspace_id: entry.workspaceId },
          {
            usage_count:        entry.usageCount,
            last_used:          entry.lastUsed,
            confidence:         entry.confidence,
            flagged_for_review: entry.flaggedForReview,
          }
        );
        entry._dirty = false;
      } catch (err) {
        // Non-fatal — will retry on next flush
        console.warn("[Teaching Engine] Usage flush failed for term:", entry._phrase, err.message);
      }
    }
  }

  /** Start the periodic usage-stat flush timer. */
  _startFlushTimer() {
    if (this._flushTimer) return;
    this._flushTimer = setInterval(() => this._flushUsageStats(), CONFIDENCE_FLUSH_INTERVAL_MS);
  }

  /** Stop the flush timer (call on sign-out / engine teardown). */
  stopFlushTimer() {
    if (this._flushTimer) {
      clearInterval(this._flushTimer);
      this._flushTimer = null;
    }
  }

  // ── Intent Detection ─────────────────────────────────────────────────────────

  /**
   * Analyse raw user input. Returns a parsed teaching intent or null.
   * v5.9 unchanged.
   * @param {string} rawInput
   * @returns {{ triggerPhrase: string, resolvedMeaning: string } | null}
   */
  detectTeachingIntent(rawInput) {
    if (!rawInput || typeof rawInput !== "string") return null;
    const clean = rawInput.trim();
    for (const pattern of TEACHING_PATTERNS) {
      const match = clean.match(pattern);
      if (match) {
        return {
          triggerPhrase:   match[1].trim(),
          resolvedMeaning: match[2].trim(),
        };
      }
    }
    return null;
  }

  /**
   * Classify a teaching intent into a learning level (1–5).
   * v5.9 unchanged.
   * @param {Object} intent - { triggerPhrase, resolvedMeaning }
   * @param {string} context
   * @returns {number} 1–5
   */
  classifyLevel(intent, context = "") {
    const combined = `${intent.triggerPhrase} ${intent.resolvedMeaning} ${context}`.toLowerCase();
    if (/\d+mm|\bgrade\b|\bspecification\b|\brating\b|\bindustry\b/.test(combined)) return 5;
    if (/\bprocedure\b|\bprocess\b|\bstep\b|\bworkflow\b|\breconcil/.test(combined))  return 3;
    if (/\bdialect\b|\bexpression\b|\bphrase\b/.test(combined))                        return 4;
    if (/machine\s*\d+|\bmodel\b|\bproduct\b|\bcode\b|\bsku\b/.test(combined))         return 2;
    return 1;
  }

  // ── Submission ───────────────────────────────────────────────────────────────

  /**
   * Submit a teaching input from a staff member.
   *
   * v6.0 additions:
   *   - `scope` parameter (optional, defaults to WORKSPACE for backward compat)
   *   - Global scope requires Owner or System Admin as submitter
   *   - Scope stored on the record and used during resolution
   *
   * @param {string} rawInput
   * @param {string} submitterId
   * @param {string} submitterRole
   * @param {string} moduleContext
   * @param {string} languageCode
   * @param {string} scope          — LEARNING_SCOPES value (default: 'workspace')
   * @returns {Promise<{ status: string, pendingId?: string, message: string }>}
   */
  async submitTerm(
    rawInput,
    submitterId,
    submitterRole,
    moduleContext = "all",
    languageCode  = "en",
    scope         = LEARNING_SCOPES.WORKSPACE
  ) {
    const intent = this.detectTeachingIntent(rawInput);
    if (!intent) {
      return {
        status:  "no_intent",
        message: "I did not detect a teaching phrase. Try: '[word] means [definition]'.",
      };
    }

    // Global scope requires elevated submitter role — prevents any staff member
    // from submitting terms that would affect all workspaces across CozyOS.
    if (scope === LEARNING_SCOPES.GLOBAL) {
      if (!this._roleHasMinimum(submitterRole, "owner")) {
        return {
          status:  "insufficient_role",
          message: "Global scope terms can only be submitted by Owner or System Admin.",
        };
      }
    }

    const level             = this.classifyLevel(intent, moduleContext);
    const requiredSubmitter = TEACHING_LEVELS[level].minSubmitter;

    if (!this._roleHasMinimum(submitterRole, requiredSubmitter)) {
      return {
        status:  "insufficient_role",
        message: `Level ${level} teaching requires at least a ${requiredSubmitter} role.`,
      };
    }

    const workspaceId = window.CozyOS?.session?.workspace_id;
    const userId      = window.CozyOS?.session?.user_id;
    const now         = new Date().toISOString();

    const record = {
      workspace_id:     scope === LEARNING_SCOPES.GLOBAL ? null : workspaceId,
      user_id:          scope === LEARNING_SCOPES.PERSONAL ? userId : null,
      scope,
      level,
      raw_input:        rawInput,
      trigger_phrase:   intent.triggerPhrase.toLowerCase(),
      resolved_meaning: intent.resolvedMeaning,
      language_code:    languageCode,
      module_scope:     moduleContext,
      submitted_by:     submitterId,
      approved_by:      null,
      status:           TEACHING_STATUSES.PENDING,
      confidence:       CONFIDENCE_INITIAL,
      usage_count:      0,
      last_used:        null,
      flagged_for_review: false,
      created_at:       now,
      activated_at:     null,
      audit_hash:       null,
    };

    const pendingId = await this._persistRecord(record);

    await this._audit("term_submitted", {
      pendingId, submitterId, level, scope,
      triggerPhrase: intent.triggerPhrase, rawInput,
    });

    await this._notifyApprover(level, pendingId, intent, scope);

    const levelLabel  = TEACHING_LEVELS[level].label;
    const scopeLabel  = scope.charAt(0).toUpperCase() + scope.slice(1);
    return {
      status:    "pending",
      pendingId,
      message:   `I have noted that "${intent.triggerPhrase}" means "${intent.resolvedMeaning}". ` +
                 `This is a Level ${level} (${levelLabel}) ${scopeLabel}-scope term and has been sent for approval.`,
    };
  }

  // ── Approval ─────────────────────────────────────────────────────────────────

  /**
   * Approve a pending teaching term. Activates it in the knowledge base.
   * v6.0: Global-scope terms require dual approval (Owner + System Admin).
   * For simplicity in v6.0, this requires approverRole to be 'owner' or 'system_admin'
   * for global terms. Full dual-signature workflow is deferred to v6.1.
   *
   * @param {string} pendingId
   * @param {string} approverId
   * @param {string} approverRole
   * @returns {Promise<{ status: string, message: string }>}
   */
  async approveTerm(pendingId, approverId, approverRole) {
    const storage = window.CozyOS?.Storage;
    if (!storage) return { status: "error", message: "Storage unavailable." };

    const records = await storage.find("workspace_ai_knowledge", { id: pendingId });
    const record  = records?.[0];

    if (!record) return { status: "not_found", message: "Teaching request not found." };
    if (record.status !== TEACHING_STATUSES.PENDING) {
      return { status: "already_processed", message: `This term is already ${record.status}.` };
    }

    // Global-scope terms require Owner or System Admin
    if (record.scope === LEARNING_SCOPES.GLOBAL) {
      if (!["owner", "system_admin"].includes(approverRole)) {
        return {
          status:  "insufficient_role",
          message: "Global scope terms require Owner or System Admin approval.",
        };
      }
    } else {
      const requiredApprover = TEACHING_LEVELS[record.level].minApprover;
      if (!this._roleHasMinimum(approverRole, requiredApprover)) {
        return {
          status:  "insufficient_role",
          message: `Level ${record.level} terms require at least a ${requiredApprover} to approve.`,
        };
      }
    }

    const now       = new Date().toISOString();
    const auditHash = await this._generateHash(`${pendingId}:${approverId}:${now}`);

    await storage.update("workspace_ai_knowledge", { id: pendingId }, {
      status:       TEACHING_STATUSES.APPROVED,
      approved_by:  approverId,
      activated_at: now,
      audit_hash:   auditHash,
      confidence:   CONFIDENCE_INITIAL,
    });

    // Activate in memory immediately — no restart required
    const entry = createKnowledgeEntry({
      ...record,
      approved_by:  approverId,
      activated_at: now,
      confidence:   CONFIDENCE_INITIAL,
    });
    // Store the phrase on the entry so _flushUsageStats can reference it
    entry._phrase = record.trigger_phrase;

    const ctx = {
      workspaceId : record.workspace_id,
      moduleType  : record.module_scope || "all",
      userId      : record.user_id,
    };
    const key = this._buildKey(record.trigger_phrase, entry.scope, ctx);
    this.knowledgeBase.set(key, entry);

    await this._audit("term_approved", {
      pendingId, approverId, triggerPhrase: record.trigger_phrase, scope: record.scope,
    });
    await this._notifySubmitter(record.submitted_by, record.trigger_phrase, "approved");

    return {
      status:  "activated",
      message: `"${record.trigger_phrase}" is now active (${entry.scope} scope). I will use it appropriately.`,
    };
  }

  /**
   * Reject a pending teaching term.
   * v5.9 unchanged in behaviour; scope logged to audit.
   *
   * @param {string} pendingId
   * @param {string} approverId
   * @param {string} approverRole
   * @param {string} reason
   * @returns {Promise<{ status: string, message: string }>}
   */
  async rejectTerm(pendingId, approverId, approverRole, reason = "") {
    const storage = window.CozyOS?.Storage;
    if (!storage) return { status: "error", message: "Storage unavailable." };

    const records = await storage.find("workspace_ai_knowledge", { id: pendingId });
    const record  = records?.[0];

    if (!record) return { status: "not_found", message: "Teaching request not found." };
    if (record.status !== TEACHING_STATUSES.PENDING) {
      return { status: "already_processed", message: `This term is already ${record.status}.` };
    }

    const requiredApprover = TEACHING_LEVELS[record.level].minApprover;
    if (!this._roleHasMinimum(approverRole, requiredApprover)) {
      return { status: "insufficient_role", message: "You do not have permission to reject this." };
    }

    await storage.update("workspace_ai_knowledge", { id: pendingId }, {
      status:      TEACHING_STATUSES.REJECTED,
      approved_by: approverId,
    });

    await this._audit("term_rejected", { pendingId, approverId, reason, scope: record.scope });
    await this._notifySubmitter(record.submitted_by, record.trigger_phrase, "rejected", reason);

    return {
      status:  "rejected",
      message: `The term "${record.trigger_phrase}" was not approved. Reason: ${reason || "unspecified"}.`,
    };
  }

  // ── Confidence Management ─────────────────────────────────────────────────────

  /**
   * Apply a correction event to a known term.
   * Degrades its confidence by CONFIDENCE_CORRECTION_DECAY.
   * If confidence falls below CONFIDENCE_REVIEW_THRESHOLD, auto-flags for review.
   *
   * Called when a user submits a new definition for a phrase that already has
   * an approved term — indicating the existing knowledge may be outdated.
   *
   * @param {string} triggerPhrase
   * @param {ScopeContext} ctx - { workspaceId, moduleType, userId }
   */
  async applyCorrection(triggerPhrase, ctx = {}) {
    const workspaceId = window.CozyOS?.session?.workspace_id;
    const resolvedCtx = { workspaceId, ...ctx };

    // Find the most specific matching entry and degrade its confidence
    for (const scope of SCOPE_PRIORITY) {
      const key = this._buildKey(triggerPhrase, scope, resolvedCtx);
      if (this.knowledgeBase.has(key)) {
        const entry = this.knowledgeBase.get(key);
        entry.confidence    = Math.max(0, +(entry.confidence - CONFIDENCE_CORRECTION_DECAY).toFixed(4));
        entry.flaggedForReview = entry.confidence < CONFIDENCE_REVIEW_THRESHOLD;
        entry._dirty        = true;

        if (entry.flaggedForReview) {
          console.warn(
            `[Teaching Engine] Term "${triggerPhrase}" (${scope}) confidence degraded to ` +
            `${(entry.confidence * 100).toFixed(0)}% — flagged for review.`
          );
          await this._audit("term_confidence_flagged", {
            triggerPhrase, scope, confidence: entry.confidence,
          });
          await this._notifyApproverConfidenceAlert(triggerPhrase, entry.confidence, scope);
        }
        return;
      }
    }
  }

  // ── Scope-Aware Resolution ────────────────────────────────────────────────────

  /**
   * Resolve a trigger phrase using the full scope priority chain.
   * Returns the meaning string for the most specific scope that matches.
   *
   * Scope chain: personal → module → workspace → global
   *
   * Backward-compatible with v5.9: still returns a string or null.
   *
   * @param {string} phrase
   * @param {ScopeContext} [ctx] - { workspaceId, moduleType, userId }
   * @returns {string | null}
   */
  resolve(phrase, ctx = {}) {
    const workspaceId = window.CozyOS?.session?.workspace_id;
    const userId      = window.CozyOS?.session?.user_id;
    const resolvedCtx = { workspaceId, userId, ...ctx };

    for (const scope of SCOPE_PRIORITY) {
      const key = this._buildKey(phrase, scope, resolvedCtx);
      if (this.knowledgeBase.has(key)) {
        const entry = this.knowledgeBase.get(key);
        // Track usage — batched flush prevents write-per-resolve cost
        entry.usageCount++;
        entry.lastUsed = Date.now();
        entry._dirty   = true;
        return entry.meaning;
      }
    }
    return null;
  }

  /**
   * Resolve a phrase and return the full KnowledgeEntry (new in v6.0).
   * Use this when you need confidence, scope, usage count, or review status.
   *
   * Returns null if the phrase is not in the knowledge base.
   *
   * @param {string} phrase
   * @param {ScopeContext} [ctx]
   * @returns {KnowledgeEntry | null}
   */
  resolveWithConfidence(phrase, ctx = {}) {
    const workspaceId = window.CozyOS?.session?.workspace_id;
    const userId      = window.CozyOS?.session?.user_id;
    const resolvedCtx = { workspaceId, userId, ...ctx };

    for (const scope of SCOPE_PRIORITY) {
      const key = this._buildKey(phrase, scope, resolvedCtx);
      if (this.knowledgeBase.has(key)) {
        const entry = this.knowledgeBase.get(key);
        entry.usageCount++;
        entry.lastUsed = Date.now();
        entry._dirty   = true;
        // Return a shallow copy — callers should not mutate the live entry
        return { ...entry, triggerPhrase: phrase };
      }
    }
    return null;
  }

  /**
   * Resolve a phrase across the full scope chain and return source attribution.
   * Useful for UI that wants to show "This term comes from: Workspace scope".
   *
   * @param {string} phrase
   * @param {ScopeContext} [ctx]
   * @returns {{ meaning: string, scope: string, confidence: number, source: string } | null}
   */
  resolveWithScope(phrase, ctx = {}) {
    const entry = this.resolveWithConfidence(phrase, ctx);
    if (!entry) return null;
    return {
      meaning    : entry.meaning,
      scope      : entry.scope,
      confidence : entry.confidence,
      usageCount : entry.usageCount,
      flagged    : entry.flaggedForReview,
      approvedBy : entry.approvedBy,
      approvedAt : entry.approvedAt,
      source     : `${entry.scope.charAt(0).toUpperCase() + entry.scope.slice(1)} scope`,
    };
  }

  /**
   * Return all approved trigger phrases visible in the current context.
   * Used by detectAndRouteDialect() to include workspace terms in scoring.
   * v5.9 API preserved exactly — still returns string[].
   * @returns {string[]}
   */
  getAllTriggerPhrases() {
    // Extract just the phrase portion from each scoped key
    const phrases = new Set();
    for (const key of this.knowledgeBase.keys()) {
      // Key format: scope:...contextParts...:phrase
      // The phrase is always the last colon-separated segment
      const parts = key.split(":");
      if (parts.length >= 2) phrases.add(parts[parts.length - 1]);
    }
    return [...phrases];
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  _roleHasMinimum(userRole, minimumRole) {
    const userIdx    = ROLE_HIERARCHY.indexOf(userRole);
    const minimumIdx = ROLE_HIERARCHY.indexOf(minimumRole);
    if (userIdx === -1 || minimumIdx === -1) return false;
    return userIdx <= minimumIdx;
  }

  async _generateHash(input) {
    if (typeof crypto !== "undefined" && crypto.subtle) {
      const encoded = new TextEncoder().encode(input);
      const buffer  = await crypto.subtle.digest("SHA-256", encoded);
      return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, "0")).join("");
    }
    let hash = 0;
    for (let i = 0; i < input.length; i++) hash = ((hash << 5) - hash) + input.charCodeAt(i);
    return Math.abs(hash).toString(16);
  }

  async _notifyApprover(level, pendingId, intent, scope = LEARNING_SCOPES.WORKSPACE) {
    try {
      window.CozyOS?.Notifications?.send?.({
        type:       "teaching_approval_required",
        level,
        pendingId,
        scope,
        summary:    `New Level ${level} (${scope}) term: "${intent.triggerPhrase}" → "${intent.resolvedMeaning}"`,
        targetRole: scope === LEARNING_SCOPES.GLOBAL ? "owner" : TEACHING_LEVELS[level].minApprover,
      });
    } catch { /* Notifications are non-critical */ }
  }

  async _notifySubmitter(submitterId, triggerPhrase, outcome, reason = "") {
    try {
      window.CozyOS?.Notifications?.send?.({
        type:          "teaching_outcome",
        targetUser:    submitterId,
        triggerPhrase,
        outcome,
        reason,
      });
    } catch { /* Non-critical */ }
  }

  async _notifyApproverConfidenceAlert(triggerPhrase, confidence, scope) {
    try {
      window.CozyOS?.Notifications?.send?.({
        type:          "teaching_confidence_alert",
        triggerPhrase,
        confidence:    `${(confidence * 100).toFixed(0)}%`,
        scope,
        summary:       `Term "${triggerPhrase}" (${scope}) confidence has dropped below review threshold.`,
        targetRole:    "supervisor",
      });
    } catch { /* Non-critical */ }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  MAIN REGISTRY (v6.0 — fully extends v5.9, zero breaking changes)
// ─────────────────────────────────────────────────────────────────────────────

class CozyAILanguageRegistry {
  constructor(masterController) {
    this.master = masterController;

    // ── Selection Modes (v5.9 unchanged) ──────────────────────────────────────
    this.SelectionModes = {
      AUTOMATIC:         "auto",
      WORKSPACE_DEFAULT: "workspace_default",
      FORCE_EN:          "en",
      FORCE_SW:          "sw",
      FORCE_LUO:         "luo",
    };

    this.activeMode = this.SelectionModes.AUTOMATIC;

    // ── Language Packs ────────────────────────────────────────────────────────
    // v6.0: now unlimited — not hardcoded to 3 codes.
    // Map<languageCode, { greetings, commonWords, businessTerms, quarryTerminology, ... }>
    this.installedPacks = new Map();

    // ── Workspace Default (v5.9 unchanged) ───────────────────────────────────
    this.workspaceDefaultLang = "en";

    // ── Teaching Engine (v5.9 unchanged, internals enhanced in v6.0) ─────────
    this.teaching = new CozyAITeachingEngine(this);

    // ── Expose scope constants for callers ────────────────────────────────────
    this.LearningScopes = LEARNING_SCOPES;

    // Self-register and initialise
    this.master.initializeSubEngine("language", this);
    this.loadInstalledLanguagePacks();
    this.loadWorkspaceSettings();
    this.teaching.loadWorkspaceKnowledge();
  }

  // ── v5.9 API — PRESERVED EXACTLY ─────────────────────────────────────────

  /**
   * Set the active selection mode.
   * v5.9 unchanged.
   */
  setExecutionMode(modeTarget) {
    const validModes = Object.values(this.SelectionModes);
    if (!validModes.includes(modeTarget)) {
      throw new Error("[Language Engine] Invalid operational selection override parameter.");
    }
    this.activeMode = modeTarget;
    console.log(`► [LANGUAGE CORE] Operational system constraint altered to: [${modeTarget}]`);
    return { status: "success", enforcedLanguageMode: this.activeMode };
  }

  /**
   * Load installed language packs.
   *
   * v6.0 change: pack codes are discovered via PackRegistry.discover() rather
   * than a hardcoded 3-element array. This makes the system support unlimited
   * packs without any code change.
   *
   * Discovery priority:
   *   1. Packs registered in CozyStorage (ai_language_packs collection)
   *   2. Built-in baseline fallbacks (en, sw, luo — always available)
   *
   * Any pack code found in storage is loaded automatically. Custom industry packs
   * (quarry-local, hospital-local) and regional language packs (kikuyu, french,
   * arabic) are discovered the same way — no special-casing needed.
   */
  async loadInstalledLanguagePacks() {
    // Discover all available pack codes (built-ins + storage-registered)
    const packCodes = await PackRegistry.discover();
    const storage   = window.CozyOS?.Storage;

    for (const code of packCodes) {
      try {
        let dictionary = null;

        // 1. Try CozyStorage first (user-installed or uploaded packs)
        if (storage && typeof storage.find === "function") {
          const dbResult = await storage.find("ai_language_packs", { languageCode: code });
          if (dbResult && dbResult.length > 0) {
            dictionary = dbResult[0].dictionary;
          }
        }

        // 2. Fall back to built-in baseline if no storage record
        if (!dictionary) {
          dictionary = this._getBaselinePackFallback(code);
        }

        this.installedPacks.set(code, dictionary);
        console.log(`► [LANGUAGE CORE] Pack loaded: [${code}]`);
      } catch (err) {
        console.warn(`[Language Kernel] Failed loading pack [${code}]:`, err.message);
      }
    }

    console.log(`► [LANGUAGE CORE] ${this.installedPacks.size} language pack(s) active.`);
  }

  /**
   * Detect and route the dialect of a raw query string.
   * v5.9 unchanged in behaviour — workspace knowledge terms still included in scoring.
   */
  detectAndRouteDialect(rawQueryText) {
    if (this.activeMode !== this.SelectionModes.AUTOMATIC) {
      return this.activeMode;
    }

    const cleanTokens = rawQueryText
      .toLowerCase().trim()
      .replace(/[^\w\s\-]/g, "")
      .split(/\s+/);

    let highestScoreCode    = "en";
    let maximumMatchWeight  = 0;

    for (const [code, pack] of this.installedPacks.entries()) {
      let directMatches = 0;
      const vocabularySpace = [
        ...(pack.greetings         || []),
        ...(pack.commonWords       || []),
        ...(pack.businessTerms     || []),
        ...(pack.quarryTerminology || []),
        // Include all approved workspace terms in the scoring vocabulary
        ...this.teaching.getAllTriggerPhrases(),
      ];

      for (const token of cleanTokens) {
        if (vocabularySpace.includes(token)) directMatches++;
      }

      if (directMatches > maximumMatchWeight) {
        maximumMatchWeight = directMatches;
        highestScoreCode   = code;
      }
    }

    return highestScoreCode;
  }

  async processTranslation(text, targetLangCode) {
    return text.toLowerCase().trim();
  }

  /**
   * Built-in baseline dictionaries for the three default packs.
   * For all other language codes, returns an empty-but-valid dictionary object
   * (the pack will still be registered, just with no baseline vocabulary).
   * @param {string} code
   * @returns {Object}
   */
  _getBaselinePackFallback(code) {
    const baselines = {
      en:  {
        greetings:          ["hello", "morning"],
        commonWords:        ["today", "yes"],
        businessTerms:      ["profit", "revenue"],
        quarryTerminology:  ["stone", "machine"],
      },
      sw:  {
        greetings:          ["mambo", "habari"],
        commonWords:        ["leo", "asante"],
        businessTerms:      ["mapato", "faida"],
        quarryTerminology:  ["mawe", "chimbo"],
      },
      luo: {
        greetings:          ["misawa", "oyawore"],
        commonWords:        ["kawuono", "erokamano"],
        businessTerms:      ["omenda", "nengo"],
        quarryTerminology:  ["kite", "lodi"],
      },
    };
    // For unknown codes, return an empty valid pack structure.
    // The caller is expected to load the dictionary from CozyStorage.
    return baselines[code] || { greetings: [], commonWords: [], businessTerms: [], quarryTerminology: [] };
  }

  // ── v5.9 NEW API — PRESERVED EXACTLY ────────────────────────────────────────

  /**
   * Unified language resolution.
   * v5.9 unchanged.
   */
  resolveActiveLanguage(inputText = "", userMode = null) {
    const mode = userMode || this.activeMode;
    if (mode === this.SelectionModes.FORCE_EN)  return "en";
    if (mode === this.SelectionModes.FORCE_SW)  return "sw";
    if (mode === this.SelectionModes.FORCE_LUO) return "luo";
    if (mode === this.SelectionModes.AUTOMATIC && inputText) {
      return this.detectAndRouteDialect(inputText);
    }
    if (mode === this.SelectionModes.WORKSPACE_DEFAULT || !inputText) {
      return this.workspaceDefaultLang || "en";
    }
    return "en";
  }

  /**
   * Load workspace language settings.
   * v5.9 unchanged.
   */
  async loadWorkspaceSettings() {
    const storage     = window.CozyOS?.Storage;
    const workspaceId = window.CozyOS?.session?.workspace_id;
    if (!storage || typeof storage.find !== "function" || !workspaceId) return;
    try {
      const settings = await storage.find("workspace_settings", { workspace_id: workspaceId });
      if (settings?.[0]?.workspace_default_lang) {
        this.workspaceDefaultLang = settings[0].workspace_default_lang;
        console.log(`► [LANGUAGE CORE] Workspace default language: [${this.workspaceDefaultLang}]`);
      }
    } catch (err) {
      console.warn("[Language Core] Failed loading workspace settings:", err.message);
    }
  }

  /**
   * Set the workspace default language.
   * v5.9 unchanged.
   */
  async setWorkspaceDefault(languageCode, actorId, actorRole) {
    const allowedRoles = ["owner", "system_admin"];
    if (!allowedRoles.includes(actorRole)) {
      return { status: "insufficient_role", message: "Only Owner or System Admin can set the workspace default language." };
    }

    // v6.0: valid codes are all installed packs, not just the built-in 3
    const validCodes = [...this.installedPacks.keys()];
    if (!validCodes.includes(languageCode)) {
      return { status: "invalid_code", message: `Language code must be one of: ${validCodes.join(", ")}.` };
    }

    const storage     = window.CozyOS?.Storage;
    const workspaceId = window.CozyOS?.session?.workspace_id;
    if (storage && workspaceId) {
      await storage.upsert("workspace_settings", { workspace_id: workspaceId }, {
        workspace_default_lang: languageCode,
        set_by: actorId,
        set_at: new Date().toISOString(),
      });
    }

    const previous             = this.workspaceDefaultLang;
    this.workspaceDefaultLang  = languageCode;
    console.log(`► [LANGUAGE CORE] Workspace default: [${previous}] → [${languageCode}] by ${actorId}`);
    return { status: "success", message: `Workspace default language set to: ${languageCode}.` };
  }

  /**
   * Handle potential teaching input in the AI input pipeline.
   * v5.9 unchanged in signature; now passes scope through to submitTerm.
   *
   * @param {string} rawInput
   * @param {Object} session - { userId, userRole, moduleContext, languageCode, scope? }
   * @returns {Promise<string | null>}
   */
  async handlePotentialTeachingInput(rawInput, session = {}) {
    const intent = this.teaching.detectTeachingIntent(rawInput);
    if (!intent) return null;

    // Check if a term already exists — if so, this is a correction, not a new submission.
    // Apply confidence decay to the existing term before queuing the new one for approval.
    const existing = this.teaching.resolve(intent.triggerPhrase);
    if (existing) {
      await this.teaching.applyCorrection(intent.triggerPhrase);
    }

    const result = await this.teaching.submitTerm(
      rawInput,
      session.userId,
      session.userRole,
      session.moduleContext || "all",
      session.languageCode  || "en",
      session.scope         || LEARNING_SCOPES.WORKSPACE
    );

    return result.message;
  }

  /**
   * Check if a phrase has been taught and approved.
   * v5.9 unchanged — returns string or null.
   * @param {string} phrase
   * @returns {string | null}
   */
  resolveWorkspaceTerm(phrase) {
    return this.teaching.resolve(phrase);
  }

  // ── v6.0 NEW API ────────────────────────────────────────────────────────────

  /**
   * Resolve a term with full confidence and scope metadata.
   * Use in UI components that display confidence badges, scope labels, or review alerts.
   *
   * Returns null if the phrase is unknown.
   *
   * @param {string} phrase
   * @param {Object} [ctx] - { moduleType, userId } — workspace resolved from session
   * @returns {{ meaning, scope, confidence, usageCount, flagged, approvedBy, approvedAt, source } | null}
   *
   * @example
   * const info = registry.resolveTermWithMeta('machine 7');
   * // → {
   * //     meaning:    'Simba',
   * //     scope:      'workspace',
   * //     confidence: 0.98,
   * //     usageCount: 412,
   * //     flagged:    false,
   * //     approvedBy: 'user_owner_001',
   * //     approvedAt: '2025-01-15T09:00:00.000Z',
   * //     source:     'Workspace scope'
   * //   }
   */
  resolveTermWithMeta(phrase, ctx = {}) {
    return this.teaching.resolveWithScope(phrase, ctx);
  }

  /**
   * Register a language pack at runtime without a page reload.
   * Useful for dynamically loading additional packs (e.g. after a user
   * installs a new language from the CozyOS marketplace).
   *
   * @param {string} code       - Language code (e.g. 'kikuyu', 'french', 'quarry-local')
   * @param {Object} dictionary - Pack dictionary: { greetings, commonWords, businessTerms, ... }
   * @returns {{ status: string, code: string, message: string }}
   *
   * @example
   * registry.registerPack('kikuyu', {
   *   greetings:    ['nĩ wega', 'wĩ mwega'],
   *   commonWords:  ['ũmũthĩ', 'ĩĩ'],
   *   businessTerms: ['ûndû wa mbia', 'ûndû wa ûtũu'],
   *   quarryTerminology: [],
   * });
   */
  registerPack(code, dictionary) {
    if (typeof code !== "string" || !code.trim()) {
      return { status: "error", code, message: "Language code must be a non-empty string." };
    }
    if (!dictionary || typeof dictionary !== "object") {
      return { status: "error", code, message: "Dictionary must be a plain object." };
    }

    const normalised = code.trim().toLowerCase();
    this.installedPacks.set(normalised, dictionary);
    console.log(`► [LANGUAGE CORE] Pack registered at runtime: [${normalised}]`);
    return { status: "success", code: normalised, message: `Language pack '${normalised}' registered.` };
  }

  /**
   * Get all currently installed language pack codes.
   * Includes built-ins, storage-registered packs, and runtime-registered packs.
   *
   * @returns {string[]}
   *
   * @example
   * registry.getInstalledPackCodes();
   * // → ['en', 'sw', 'luo', 'kikuyu', 'french', 'quarry-local', 'hospital-local']
   */
  getInstalledPackCodes() {
    return [...this.installedPacks.keys()];
  }

  /**
   * Tear down timers. Call on sign-out or app shutdown.
   * Flushes any pending usage stats before stopping.
   */
  async destroy() {
    await this.teaching._flushUsageStats();
    this.teaching.stopFlushTimer();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  BOOTSTRAP — same pattern as v5.9
// ─────────────────────────────────────────────────────────────────────────────

new CozyAILanguageRegistry(window.CozyOS.AI);
