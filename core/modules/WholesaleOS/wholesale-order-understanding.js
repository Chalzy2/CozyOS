/**
 * WholesaleOS — Customer Order Request Understanding
 * File Reference: core/modules/WholesaleOS/wholesale-order-understanding.js
 * Layer: Business Domain — Composition Module (RP-035 WOS2, Part 5)
 * Version: 1.0.0-ENTERPRISE
 *
 * BASELINE
 *   COS-RP035-WOS2-AUDIT.zip (WOS1 CERTIFIED state + Rule 29 WOS2
 *   ownership audit), SHA-256
 *   dfc5f9e76ce43fb3cd64992f8d670612e33bb92e5a320ffd09a7ae14c16f6dad.
 *
 * OWNERSHIP AUDIT
 *   Recorded in full in docs/history/RP-035-WOS2-Rule29-Audit.md
 *   (performed before this file was written). Summary relevant to this
 *   file:
 *     - Order engine (customer order *request*): MISSING repository-wide
 *       — window.CozyOS.ShopSales models an in-person POS sale
 *       (DRAFT->PAYMENT_PENDING->COMPLETED), not a customer-initiated
 *       request with a clarification/approval step. This file is that
 *       genuinely new capability. ShopSales/WholesaleCommerce.getOrder()
 *       are NOT touched, modified, or duplicated here.
 *     - Product catalog: window.CozyOS.ShopProduct — REAL, reused
 *       read-only (listProducts()/getProduct()). Never invents a
 *       product.
 *     - Customer: window.CozyOS.Customer.getCustomer() — REAL, composed
 *       read-only, non-blocking enrichment only (see CUSTOMER LOOKUP
 *       below). Customer's frozen shape is never modified; no
 *       language-preference field is added to it.
 *     - Conversational AI / intent extraction: no product-order NLU
 *       exists anywhere. This file is a genuinely new, narrow
 *       rule-based extractor — deterministic keyword/pattern matching
 *       only. It makes no ML/LLM claim and does not "understand"
 *       conversation in general; it only extracts a bounded set of
 *       structured fields from a single inbound message.
 *
 * DISCLOSED SCOPING FACT — ShopProduct HAS NO businessId CONCEPT
 *   Confirmed by direct inspection of core/plugins/shopOS-product.js:
 *   createProduct() only ever stores productId, barcode, qr, sku, name,
 *   category, brand, description, images, variants, unit, costPrice,
 *   retailPrice, wholesalePrice, promoPrice, taxCategory, status,
 *   createdAt, updatedAt. WholesaleCommerce.createProduct(businessId,
 *   input) *passes* businessId through, but ShopProduct silently drops
 *   it — it is not persisted on the product record and cannot be
 *   filtered on. This file therefore cannot, and does not pretend to,
 *   scope product matching by businessId; matching runs against the
 *   full real catalog ShopProduct actually has. This is an inherited
 *   gap in ShopProduct itself (out of this checkpoint's scope to fix —
 *   flagged for the repair queue, not corrected here). businessId is
 *   still recorded on every order-request record for whoever eventually
 *   builds real per-business product scoping.
 *
 * RESPONSIBILITY
 *   Turn one caller-supplied, already-received/decoded inbound message
 *   (rawMessage) into a structured, honestly-bounded order-REQUEST
 *   record: extraction only, never confirmation. Composes ShopProduct
 *   (product matching, read-only) and, non-blocking, Customer
 *   (identity enrichment, read-only). Understanding is not confirmation
 *   (Part 4) — the only states this file can produce are
 *   DRAFT_RESOLVED, ORDER_REQUIRES_CLARIFICATION, and
 *   ORDER_NOT_UNDERSTOOD. It never assigns RESERVED / CONFIRMED / PAID /
 *   COMPLETED — those belong to a future, separately-audited checkpoint
 *   that composes ShopInventory and ShopSales.
 *
 * NEVER
 *   - Guess/invent a product when more than one product could plausibly
 *     match, or when none does — both are ORDER_REQUIRES_CLARIFICATION
 *     or ORDER_NOT_UNDERSTOOD, never an arbitrary pick.
 *   - Guess/invent a quantity. A missing or unparseable quantity is
 *     never defaulted to 1.
 *   - Substitute a "close enough" variant (e.g. size 41 for a requested
 *     size 42). A requested variant not present on the resolved
 *     product's own `variants` data is ORDER_REQUIRES_CLARIFICATION.
 *   - Extract, infer, or negotiate a price. `requestedPrice` is always
 *     null in this checkpoint — price extraction is honestly not
 *     implemented, per Part 8, not silently approximated.
 *   - Auto-detect customerLanguage. It is caller-supplied only; absent
 *     input leaves it null. No language-detection engine is created or
 *     assumed here — the long-term multilingual system composes PHC6
 *     when a future checkpoint actually does that work.
 *   - Decrease stock, reserve inventory, or touch ShopInventory at all.
 *     Inventory validation is explicitly the *next* WOS2 capability
 *     (Rule 29 audit, Part 11), not this one.
 *   - Claim a customer message was actually sent/delivered anywhere.
 *     This file only ever consumes an already-supplied rawMessage
 *     string; no messaging-gateway integration exists or is implied.
 *
 * CUSTOMER LOOKUP (non-blocking, read-only)
 *   If window.CozyOS.Customer is loaded, getCustomer(customerId) is
 *   called purely for enrichment (`customerKnown` on the record). A
 *   customer that is not found, or a Customer engine that is not
 *   loaded, does NOT block order-request submission — commerce
 *   messages can genuinely arrive from a customerId the platform has
 *   not yet on-boarded into the Customer engine, and this file does not
 *   invent a requirement the Rule 29 audit did not establish.
 *
 * AUTHORIZATION — DELIBERATELY OUT OF SCOPE THIS CHECKPOINT
 *   submitOrderRequest() has no IdentityEngine/OrganizationRole gate.
 *   An inbound customer order request is not an authenticated platform
 *   action the way category/product writes are in wholesale-commerce.js
 *   — there is no "userId" actor to authorize. Owner-side read
 *   authorization, approval, and escalation gating are explicitly
 *   reserved for the next WOS2 capability per the Rule 29 audit's
 *   "Approval workflows" / "Privacy controls" rows; adding them here
 *   would be scope creep beyond Part 3-13's stated fields and states.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const WOS_ORDER_UNDERSTANDING_VERSION = "1.0.0-ENTERPRISE";
    const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

    // -------------------------------------------------------------------
    // Deterministic extraction vocab. Bounded and disclosed — not a
    // general-purpose language model. Extending this list is future
    // scope, not silently assumed coverage.
    // -------------------------------------------------------------------

    const CARDINAL_WORDS = {
        zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
        eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
        fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
        nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
        seventy: 70, eighty: 80, ninety: 90,
    };
    const TENS_WORDS = new Set(["twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"]);

    const UNIT_WORDS = new Set([
        "pair", "pairs", "pc", "pcs", "piece", "pieces", "unit", "units",
        "dozen", "dozens", "box", "boxes", "bag", "bags", "sack", "sacks",
        "kg", "kgs", "litre", "litres", "liter", "liters", "carton", "cartons",
    ]);

    const COLOR_WORDS = new Set([
        "black", "white", "red", "blue", "green", "yellow", "orange",
        "purple", "pink", "brown", "grey", "gray", "navy", "maroon", "gold",
        "silver", "beige", "cream", "khaki", "teal", "turquoise",
    ]);

    // English + a few Swahili function words present in the WOS2 Rule 29
    // audit's own example messages ("Nataka pairs 20 za black shoes size
    // 42"). A small, disclosed stoplist, not a translation engine.
    const STOPWORDS = new Set([
        "i", "me", "my", "need", "want", "nataka", "give", "get", "the", "a",
        "an", "some", "please", "can", "could", "would", "like", "order",
        "for", "of", "za", "to", "these", "those", "and", "please,", "hi",
        "hello",
    ]);

    function sanitize(input) {
        if (!input || typeof input !== "object") return {};
        const clean = {};
        for (const key of Object.keys(input)) {
            if (FORBIDDEN_KEYS.has(key)) continue;
            clean[key] = input[key];
        }
        return clean;
    }

    /**
     * parseQuantityToken(token)
     *   Digits parse directly. A single cardinal word parses via
     *   CARDINAL_WORDS. Returns null (never 0-as-fallback, never a
     *   guess) if the token is not a recognized quantity expression on
     *   its own.
     */
    function parseQuantityToken(token) {
        if (/^\d+$/.test(token)) return parseInt(token, 10);
        if (Object.prototype.hasOwnProperty.call(CARDINAL_WORDS, token)) return CARDINAL_WORDS[token];
        return null;
    }

    /**
     * extractQuantity(tokens)
     *   Scans tokens for: a bare digit run, OR a compound cardinal
     *   (e.g. "twenty" "five" -> 25, tens + ones only — deterministic,
     *   no attempt at arbitrarily large numbers). Returns
     *   { value, tokenIndexes } or null.
     */
    function extractQuantity(tokens) {
        for (let i = 0; i < tokens.length; i++) {
            const t = tokens[i];
            if (/^\d+$/.test(t)) return { value: parseInt(t, 10), tokenIndexes: [i] };
            if (TENS_WORDS.has(t)) {
                const next = tokens[i + 1];
                if (next && Object.prototype.hasOwnProperty.call(CARDINAL_WORDS, next) && CARDINAL_WORDS[next] < 10) {
                    return { value: CARDINAL_WORDS[t] + CARDINAL_WORDS[next], tokenIndexes: [i, i + 1] };
                }
                return { value: CARDINAL_WORDS[t], tokenIndexes: [i] };
            }
            if (Object.prototype.hasOwnProperty.call(CARDINAL_WORDS, t)) {
                return { value: CARDINAL_WORDS[t], tokenIndexes: [i] };
            }
        }
        return null;
    }

    /**
     * extractUnit(tokens, quantityTokenIndexes)
     *   A unit word immediately adjacent (before or after) the resolved
     *   quantity token(s) is captured. Purely informational — never
     *   used for any conversion or authoritative stock arithmetic.
     */
    function extractUnit(tokens, quantityTokenIndexes) {
        if (!quantityTokenIndexes || quantityTokenIndexes.length === 0) return { unit: null, tokenIndexes: [] };
        const before = tokens[Math.min(...quantityTokenIndexes) - 1];
        const after = tokens[Math.max(...quantityTokenIndexes) + 1];
        if (before && UNIT_WORDS.has(before)) return { unit: before, tokenIndexes: [Math.min(...quantityTokenIndexes) - 1] };
        if (after && UNIT_WORDS.has(after)) return { unit: after, tokenIndexes: [Math.max(...quantityTokenIndexes) + 1] };
        return { unit: null, tokenIndexes: [] };
    }

    /**
     * extractSize(rawMessage)
     *   Deterministic "size <token>" phrase match on the original
     *   (unlowercased) message. Returns { size, matchedText } or null.
     */
    function extractSize(rawMessage) {
        const m = /\bsize\s+([a-zA-Z0-9]+)\b/i.exec(rawMessage);
        if (!m) return null;
        return { size: m[1], matchedText: m[0] };
    }

    /**
     * extractColor(tokens)
     *   Dictionary match only — never a guessed/nearest color.
     */
    function extractColor(tokens) {
        for (let i = 0; i < tokens.length; i++) {
            if (COLOR_WORDS.has(tokens[i])) return { color: tokens[i], tokenIndex: i };
        }
        return null;
    }

    function tokenize(rawMessage) {
        return rawMessage
            .toLowerCase()
            .replace(/[^\p{L}\p{N}\s]/gu, " ")
            .split(/\s+/)
            .filter(Boolean);
    }

    /**
     * extractProductCandidate(tokens, excludedIndexes)
     *   Removes quantity/unit/color/size/stopword tokens, returns the
     *   remaining significant tokens as the product-candidate phrase.
     *   Returns null if nothing significant is left (i.e. the message
     *   contained no describable product at all).
     */
    function extractProductCandidate(tokens, excludedIndexes, sizeMatchedText) {
        const excluded = new Set(excludedIndexes);
        const sizeWords = sizeMatchedText ? new Set(sizeMatchedText.toLowerCase().split(/\s+/)) : new Set();
        const remaining = [];
        tokens.forEach((tok, idx) => {
            if (excluded.has(idx)) return;
            if (STOPWORDS.has(tok)) return;
            if (sizeWords.has(tok)) return;
            remaining.push(tok);
        });
        return remaining.length ? remaining : null;
    }

    /**
     * matchProducts(candidateTokens)
     *   Reads window.CozyOS.ShopProduct.listProducts() read-only.
     *   A product matches iff every candidate token appears as a
     *   substring within (name + brand + category), lowercased.
     *   Deterministic contains-match — no fuzzy/AI ranking, no
     *   "closest" product.
     */
    function matchProducts(candidateTokens) {
        const shopProduct = window.CozyOS.ShopProduct;
        if (!shopProduct || typeof shopProduct.listProducts !== "function") {
            return { capabilityUnavailable: true, matches: [] };
        }
        const all = shopProduct.listProducts({});
        if (!candidateTokens || candidateTokens.length === 0) return { capabilityUnavailable: false, matches: [] };
        const matches = all.filter((p) => {
            const haystack = `${p.name || ""} ${p.brand || ""} ${p.category || ""}`.toLowerCase();
            return candidateTokens.every((tok) => haystack.includes(tok));
        });
        return { capabilityUnavailable: false, matches };
    }

    /**
     * matchVariant(product, requested)
     *   product.variants is an arbitrary-shape array (ShopProduct
     *   imposes no schema on it) — see shopOS-product.js. This checks,
     *   generically, whether any declared variant entry's own
     *   size/color-like fields match the requested value(s). If the
     *   product declares no variants at all, requested size/color is
     *   informational only (nothing to validate against) and is never
     *   treated as a blocking mismatch.
     */
    function matchVariant(product, requestedSize, requestedColor) {
        const variants = Array.isArray(product.variants) ? product.variants : [];
        if (variants.length === 0) {
            return { applicable: false, resolved: null, unavailable: false };
        }
        if (!requestedSize && !requestedColor) {
            return { applicable: false, resolved: null, unavailable: false };
        }
        const norm = (v) => (v === undefined || v === null ? null : String(v).trim().toLowerCase());
        const wantSize = norm(requestedSize);
        const wantColor = norm(requestedColor);
        const found = variants.find((v) => {
            if (!v || typeof v !== "object") return false;
            const vSize = norm(v.size ?? v.variantSize ?? v.sizeLabel);
            const vColor = norm(v.color ?? v.colour ?? v.variantColor);
            if (wantSize && vSize !== wantSize) return false;
            if (wantColor && vColor !== wantColor) return false;
            return true;
        });
        if (found) return { applicable: true, resolved: found, unavailable: false };
        return { applicable: true, resolved: null, unavailable: true };
    }

    class WholesaleOrderUnderstandingEngine {
        #records = new Map(); // requestId -> frozen record
        #idempotency = new Map(); // `${customerId}:${clientRequestId}` -> requestId
        #byCustomer = new Map(); // customerId -> Set(requestId)
        #auditLog = [];
        #diagnostics = {
            submitted: 0, duplicates: 0, resolved: 0, requiresClarification: 0,
            notUnderstood: 0, rejectedInvalidInput: 0,
        };

        getVersion() { return WOS_ORDER_UNDERSTANDING_VERSION; }

        #deepClone(v) {
            if (typeof structuredClone === "function") { try { return structuredClone(v); } catch (_e) { /* fall through */ } }
            try { return JSON.parse(JSON.stringify(v)); } catch (_e2) { return v; }
        }

        #logAudit(action, detail) {
            this.#auditLog.push(Object.freeze({ id: `aud_${this.#auditLog.length + 1}_${Date.now()}`, timestamp: new Date().toISOString(), action, detail }));
            if (this.#auditLog.length > 500) this.#auditLog.shift();
        }

        getAuditLog(predicate) {
            const list = this.#auditLog.map((e) => this.#deepClone(e));
            return Object.freeze(typeof predicate === "function" ? list.filter(predicate) : list);
        }

        #generateId() {
            return `ordreq_${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2)}`}`;
        }

        /**
         * submitOrderRequest(businessId, customerId, options)
         *   options: { rawMessage, clientRequestId = null, customerLanguage = null }
         *
         * Returns:
         *   { success: false, reason }                          — hard validation failure, no record created
         *   { success: true, duplicate: true,  record }          — clientRequestId already seen for this customer
         *   { success: true, duplicate: false, record }          — new record created (any of the 3 states)
         */
        submitOrderRequest(businessId, customerId, options = {}) {
            const opts = sanitize(options);
            const { rawMessage, clientRequestId = null, customerLanguage = null } = opts;

            if (!customerId) {
                this.#diagnostics.rejectedInvalidInput++;
                return { success: false, reason: "CUSTOMER_ID_REQUIRED" };
            }
            if (typeof rawMessage !== "string") {
                this.#diagnostics.rejectedInvalidInput++;
                return { success: false, reason: "RAW_MESSAGE_INVALID_TYPE" };
            }
            if (!rawMessage.trim()) {
                this.#diagnostics.rejectedInvalidInput++;
                return { success: false, reason: "RAW_MESSAGE_REQUIRED" };
            }

            if (clientRequestId) {
                const idKey = `${customerId}:${clientRequestId}`;
                const existingId = this.#idempotency.get(idKey);
                if (existingId) {
                    const existing = this.#records.get(existingId);
                    if (existing) {
                        this.#diagnostics.duplicates++;
                        this.#logAudit("DUPLICATE_SUBMISSION", { customerId, clientRequestId });
                        return { success: true, duplicate: true, record: this.#deepClone(existing) };
                    }
                }
            }

            // ---- non-blocking customer enrichment (read-only) ----
            let customerKnown = null; // null = engine not loaded / unknown, never asserted false-positive
            const customerEngine = window.CozyOS.Customer;
            if (customerEngine && typeof customerEngine.getCustomer === "function") {
                customerKnown = !!customerEngine.getCustomer(customerId);
            }

            const record = this.#understand({ businessId: businessId ?? null, customerId, clientRequestId, rawMessage, customerLanguage, customerKnown });

            this.#records.set(record.requestId, record);
            if (clientRequestId) this.#idempotency.set(`${customerId}:${clientRequestId}`, record.requestId);
            if (!this.#byCustomer.has(customerId)) this.#byCustomer.set(customerId, new Set());
            this.#byCustomer.get(customerId).add(record.requestId);

            this.#diagnostics.submitted++;
            if (record.status === "DRAFT_RESOLVED") this.#diagnostics.resolved++;
            else if (record.status === "ORDER_REQUIRES_CLARIFICATION") this.#diagnostics.requiresClarification++;
            else this.#diagnostics.notUnderstood++;

            this.#logAudit("ORDER_REQUEST_SUBMITTED", { requestId: record.requestId, customerId, status: record.status });

            return { success: true, duplicate: false, record: this.#deepClone(record) };
        }

        /**
         * #understand(input) — the extraction pipeline itself. Pure
         * function of its input plus a read-only ShopProduct lookup;
         * never mutates ShopProduct/ShopInventory/ShopSales.
         */
        #understand({ businessId, customerId, clientRequestId, rawMessage, customerLanguage, customerKnown }) {
            const now = new Date().toISOString();
            const requestId = this.#generateId();
            const tokens = tokenize(rawMessage);

            const base = {
                requestId, businessId, customerId, clientRequestId: clientRequestId || null,
                rawMessage, customerLanguage: customerLanguage || null, customerKnown,
                productCandidate: null, matchedProductId: null, candidateProductIds: [],
                variant: { requestedSize: null, requestedColor: null, resolved: null, unavailable: false },
                quantity: null, unit: null, requestedPrice: null,
                missingFields: [], notes: [],
                createdAt: now, updatedAt: now,
            };

            if (tokens.length === 0) {
                return Object.freeze({ ...base, status: "ORDER_NOT_UNDERSTOOD", notes: ["EMPTY_AFTER_TOKENIZATION"] });
            }

            // extractSize() must run before quantity extraction: the digits
            // inside a "size 42" phrase are a variant identifier, never a
            // quantity, and must never be picked up by extractQuantity()
            // (a real defect found and fixed during this checkpoint's own
            // test pass — see docs/history for detail).
            const sizeResult = extractSize(rawMessage);
            let sizePhraseIndexes = [];
            if (sizeResult) {
                const sizeValueLower = sizeResult.size.toLowerCase();
                for (let i = 0; i < tokens.length - 1; i++) {
                    if (tokens[i] === "size" && tokens[i + 1] === sizeValueLower) { sizePhraseIndexes = [i, i + 1]; break; }
                }
            }
            const quantityScanTokens = tokens.map((t, idx) => (sizePhraseIndexes.includes(idx) ? "\0" : t));
            const quantityResult = extractQuantity(quantityScanTokens);
            const unitResult = extractUnit(tokens, quantityResult ? quantityResult.tokenIndexes : []);
            const colorResult = extractColor(tokens);

            const excludedIndexes = [
                ...(quantityResult ? quantityResult.tokenIndexes : []),
                ...(unitResult ? unitResult.tokenIndexes : []),
                ...(colorResult ? [colorResult.tokenIndex] : []),
            ];
            const candidateTokens = extractProductCandidate(tokens, excludedIndexes, sizeResult ? sizeResult.matchedText : null);

            if (!candidateTokens) {
                return Object.freeze({
                    ...base,
                    quantity: quantityResult ? quantityResult.value : null,
                    unit: unitResult.unit,
                    status: "ORDER_NOT_UNDERSTOOD",
                    notes: ["NO_PRODUCT_TOKENS"],
                });
            }

            const productCandidate = candidateTokens.join(" ");
            const matchResult = matchProducts(candidateTokens);

            const missingFields = [];
            let matchedProductId = null;
            let candidateProductIds = [];
            let variantOutcome = { requestedSize: sizeResult ? sizeResult.size : null, requestedColor: colorResult ? colorResult.color : null, resolved: null, unavailable: false };

            if (matchResult.capabilityUnavailable) {
                missingFields.push("product");
                base.notes.push("SHOPPRODUCT_CAPABILITY_UNAVAILABLE");
            } else if (matchResult.matches.length === 0) {
                missingFields.push("product");
            } else if (matchResult.matches.length > 1) {
                missingFields.push("product");
                candidateProductIds = matchResult.matches.map((p) => p.productId);
            } else {
                const product = matchResult.matches[0];
                matchedProductId = product.productId;
                const variantMatch = matchVariant(product, variantOutcome.requestedSize, variantOutcome.requestedColor);
                if (variantMatch.applicable) {
                    variantOutcome.resolved = variantMatch.resolved;
                    variantOutcome.unavailable = variantMatch.unavailable;
                    if (variantMatch.unavailable) missingFields.push("variant");
                }
            }

            if (quantityResult === null) missingFields.push("quantity");

            const status = missingFields.length === 0 ? "DRAFT_RESOLVED" : "ORDER_REQUIRES_CLARIFICATION";

            return Object.freeze({
                ...base,
                productCandidate,
                matchedProductId,
                candidateProductIds,
                variant: variantOutcome,
                quantity: quantityResult ? quantityResult.value : null,
                unit: unitResult.unit,
                missingFields,
                status,
            });
        }

        getOrderRequest(requestId) {
            const record = this.#records.get(requestId);
            return record ? this.#deepClone(record) : null;
        }

        listOrderRequestsForCustomer(customerId) {
            const ids = this.#byCustomer.get(customerId);
            if (!ids) return [];
            return Array.from(ids).map((id) => this.#deepClone(this.#records.get(id)));
        }

        getDiagnosticsReport() {
            return this.#deepClone({
                pluginVersion: WOS_ORDER_UNDERSTANDING_VERSION,
                ...this.#diagnostics,
                totalRecords: this.#records.size,
                auditLogSize: this.#auditLog.length,
            });
        }
    }

    const engineInstance = new WholesaleOrderUnderstandingEngine();

    if (window.CozyOS.WholesaleOrderUnderstanding && typeof window.CozyOS.WholesaleOrderUnderstanding.getVersion === "function") {
        const existingVersion = window.CozyOS.WholesaleOrderUnderstanding.getVersion();
        if (existingVersion === WOS_ORDER_UNDERSTANDING_VERSION) {
            return; // Already loaded at the same version — idempotent no-op.
        }
    }
    window.CozyOS.WholesaleOrderUnderstanding = engineInstance;

    (function initRegistration() {
        const manifest = { id: "wholesale-order-understanding", name: "WholesaleOS Order Request Understanding", version: WOS_ORDER_UNDERSTANDING_VERSION };
        if (window.CozyOS && window.CozyOS.PluginManager && typeof window.CozyOS.PluginManager.register === "function") {
            window.CozyOS.PluginManager.register(
                manifest.id, manifest.name, manifest.version,
                typeof window.CozyOS.PluginManager.createMinimalIntentHandler === "function"
                    ? window.CozyOS.PluginManager.createMinimalIntentHandler(engineInstance, "WholesaleOS Order Request Understanding")
                    : engineInstance
            );
        }
        if (!window.CozyOS.KernelPlugins) window.CozyOS.KernelPlugins = new Map();
        window.CozyOS.KernelPlugins.set(manifest.id, { name: manifest.name, version: manifest.version, handler: engineInstance });
        if (!window.CozyOS.Modules) window.CozyOS.Modules = {};
        window.CozyOS.Modules["wholesale-order-understanding"] = { version: WOS_ORDER_UNDERSTANDING_VERSION };
    })();
})();
