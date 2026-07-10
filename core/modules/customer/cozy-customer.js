/**
 * CozyOS Enterprise Framework — Customer Management
 * File Reference: core/modules/customer/cozy-customer.js
 * Layer: Core / Business Domain — Customer Registry (QuarryOS, reusable platform-wide)
 * Version: 1.0.0-ENTERPRISE
 *
 * RESPONSIBILITY
 *   The single source of truth for every customer who purchases products or
 *   services. Quotations, Orders, Invoices, Deliveries, Payments, and
 *   Reports are all expected to reference customers through this
 *   coordinator's customerId — never maintain their own duplicate customer
 *   records.
 *
 * WHAT THIS MODULE DOES NOT DO (Zero Logic Rule)
 *   - Does not authorize anyone. Create/Edit/Archive/Restore/View/Manage
 *     Credit/Upload Documents/Export permissions are all enforced by
 *     CozyIdentity — this module has no concept of "who is allowed," only
 *     "what is the data."
 *   - Does not enforce credit-limit business rules. It records
 *     creditLimit/creditUsed/outstandingBalance/creditStatus faithfully and
 *     exposes a pure computed read (isOverCreditLimit) — it never blocks an
 *     order, refuses a transaction, or changes status automatically when a
 *     limit is exceeded. That decision belongs to whatever business module
 *     (Orders, Invoicing) chooses to act on the numbers this module reports.
 *   - Does not process documents. addCustomerDocument() stores a reference
 *     and metadata only — no file storage, no OCR, no validation of the
 *     document's actual contents.
 *   - Does not invent tenant/company identity. createCustomer() resolves
 *     tenantId by asking Company Management for the company's real
 *     tenantId (via companyId) — Company Management remains the single
 *     source of truth for tenant/company information, per its own module
 *     header. If Company Management isn't connected, a tenantId must be
 *     supplied directly rather than fabricated.
 *   - Does not call out to CozyStorage/CozySync/CozyNotification/
 *     CozySecurity proactively — none of those coordinators exist yet, and
 *     this module doesn't know their real APIs. It only reads Company
 *     Management and CozyCertification generically (both real, already-built
 *     APIs) and registers itself with the Service Registry if present.
 *     Everything else is exposed only as outgoing events for those
 *     coordinators to subscribe to once they exist.
 *
 * PUBLIC API
 *
 *   createCustomer()
 *   updateCustomer()
 *   archiveCustomer()
 *   restoreCustomer()
 *   getCustomer()
 *   listCustomers()
 *   searchCustomers()
 *
 *   addContact() / updateContact() / removeContact()
 *   addDeliveryLocation() / updateDeliveryLocation() / removeDeliveryLocation()
 *   addCustomerNote()
 *   addCustomerDocument()
 *
 *   updateCreditLimit()
 *   recordCreditUsage()
 *   recordPayment()
 *   updateCreditStatus()
 *   isOverCreditLimit()
 *   updatePaymentTerms()
 *
 *   getCustomerHistory()
 *   setCustomerCodePrefix()
 *
 *   getDiagnosticsReport()
 *   exportSnapshot()
 *   importSnapshot()
 *   getVersion()
 *   on() / off() / once() / emit()
 *
 * EMITTED EVENTS (dot-notation, matching this module's own domain — see
 * Company Management's header for the same documented convention choice)
 *
 *   customer.created / customer.updated / customer.archived / customer.restored
 *   customer.contact.created / customer.contact.updated / customer.contact.removed
 *   customer.location.created / customer.location.updated / customer.location.removed
 *   customer.credit.updated
 *   customer.document.added
 *   customer.note.created
 *   customer.snapshot.imported
 *
 * OPTIONAL INTEGRATIONS
 *
 *   Company Management — read generically (getCompany) to resolve tenantId
 *                         from a companyId at customer-creation time.
 *   CozyCertification   — read generically (getWorkspaceSummary) for the
 *                         "certificationStatus" diagnostics field.
 *   ServiceRegistry     — registerCoordinator() called once at load, if present.
 *   WorkspaceShell      — not called directly; discovers this module the same
 *                         generic way it discovers every coordinator.
 */

(function () {
    "use strict";

    window.CozyOS = window.CozyOS || {};
    const CUSTOMER_VERSION = "1.0.0-ENTERPRISE";

    const VALID_STATUSES = Object.freeze(["Active", "Inactive", "Suspended", "Archived", "Blacklisted", "Pending Approval"]);
    const DENY_KEYS = new Set(["__proto__", "constructor", "prototype"]);

    class CozyOSCustomerManagement {
        // ---- primary registry: customerId -> frozen customer record ----
        #customers = new Map();

        // ---- uniqueness index: customerCode -> customerId ----
        #customerCodeIndex = new Map();

        // ---- code generation: prefix -> next sequence number ----
        #codeSequences = new Map();
        #defaultCodePrefix = "CUS-";

        // ---- optional uniqueness policies (off by default, per spec) ----
        #enforceUniqueEmail = false;
        #enforceUniquePhone = false;

        #auditLogs = [];
        #timelineEvents = [];
        #listeners = new Map();
        #onceWrapped = new Map();

        #diagnostics = {
            customersCreated: 0,
            customersUpdated: 0,
            customersArchived: 0,
            customersRestored: 0,
            contactsAdded: 0,
            documentsAdded: 0,
            notesAdded: 0,
            errorsHidden: 0,
            eventsEmitted: 0,
            memoryBaseline: 5.1
        };

        getVersion() { return CUSTOMER_VERSION; }

        // =====================================================================
        // ─── UTILITIES ────────────────────────────────────────────────────────
        // =====================================================================

        #deepClone(value) {
            if (typeof structuredClone === "function") {
                try { return structuredClone(value); } catch (_err) { /* fall through */ }
            }
            try { return JSON.parse(JSON.stringify(value)); } catch (_err) { return value; }
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

        #generateId(prefix) {
            const raw = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
            return `${prefix}_${raw}`;
        }

        #logAudit(action, msg) {
            this.#auditLogs.push(Object.freeze({ id: this.#generateId("aud"), timestamp: new Date().toISOString(), action, msg }));
            if (this.#auditLogs.length > 1000) this.#auditLogs.shift();
        }

        #logTimeline(label) {
            this.#timelineEvents.push(Object.freeze({ time: new Date().toISOString(), label }));
            if (this.#timelineEvents.length > 1000) this.#timelineEvents.shift();
        }

        // Merges `patch` onto a clone of `base`, rejecting __proto__/constructor/
        // prototype keys at every level — the single merge path every update
        // method routes through.
        #safeMerge(base, patch) {
            const result = this.#deepClone(base);
            if (!patch || typeof patch !== "object") return result;
            for (const key of Object.keys(patch)) {
                if (DENY_KEYS.has(key)) continue;
                const value = patch[key];
                if (value && typeof value === "object" && !Array.isArray(value) && result[key] && typeof result[key] === "object" && !Array.isArray(result[key])) {
                    result[key] = this.#safeMerge(result[key], value);
                } else {
                    result[key] = this.#deepClone(value);
                }
            }
            return result;
        }

        // =====================================================================
        // ─── EVENT BUS (on / off / once / emit) ─────────────────────────────
        // =====================================================================

        on(eventName, handler) {
            if (typeof eventName !== "string" || !eventName.trim()) throw new TypeError("[CozyCustomer] on(): eventName must be a non-empty string.");
            if (typeof handler !== "function") throw new TypeError("[CozyCustomer] on(): handler must be a function.");
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
            if (typeof handler !== "function") throw new TypeError("[CozyCustomer] once(): handler must be a function.");
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
        // ─── VALIDATION ───────────────────────────────────────────────────────
        // =====================================================================

        #isValidEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "")); }
        #isValidPhone(phone) { return /^\+?[0-9\s\-()]{6,20}$/.test(String(phone || "")); }

        #assertNoDuplicateCode(code, excludeCustomerId) {
            const existingId = this.#customerCodeIndex.get(code);
            if (existingId && existingId !== excludeCustomerId) {
                throw new Error(`[CozyCustomer] Duplicate Customer Code: "${code}" is already used by customer "${existingId}".`);
            }
        }

        #assertNoDuplicateContactField(field, value, excludeCustomerId) {
            if (!value) return;
            for (const [id, record] of this.#customers.entries()) {
                if (id === excludeCustomerId) continue;
                if ((record.contacts || []).some(c => c[field] === value)) {
                    throw new Error(`[CozyCustomer] Duplicate ${field}: "${value}" is already used by customer "${id}".`);
                }
            }
        }

        #validateCustomerInput(input, { isUpdate = false } = {}) {
            if (!input || typeof input !== "object") throw new TypeError("[CozyCustomer] Customer input must be an object.");
            if (!isUpdate) {
                if (typeof input.customerType !== "string" || !input.customerType.trim()) throw new Error("[CozyCustomer] Missing required field: customerType.");
                const hasCompanyName = typeof input.companyName === "string" && input.companyName.trim();
                const hasPersonName = typeof input.firstName === "string" && input.firstName.trim() && typeof input.lastName === "string" && input.lastName.trim();
                if (!hasCompanyName && !hasPersonName) {
                    throw new Error("[CozyCustomer] Missing required field: either companyName, or both firstName and lastName.");
                }
            }
            if (input.status !== undefined && !VALID_STATUSES.includes(input.status)) {
                throw new Error(`[CozyCustomer] Invalid status: "${input.status}". Must be one of: ${VALID_STATUSES.join(", ")}.`);
            }
            if (input.credit && input.credit.limit !== undefined) {
                const limit = input.credit.limit;
                if (typeof limit !== "number" || Number.isNaN(limit) || limit < 0) {
                    throw new Error(`[CozyCustomer] Invalid credit limit: "${limit}". Must be a non-negative number.`);
                }
            }
        }

        // =====================================================================
        // ─── CUSTOMER CODE GENERATION ─────────────────────────────────────────
        // =====================================================================

        /** Sets the default prefix used when createCustomer() isn't given an explicit codePrefix. */
        setCustomerCodePrefix(prefix) {
            if (typeof prefix !== "string" || !prefix.trim()) throw new TypeError("[CozyCustomer] setCustomerCodePrefix(): prefix must be a non-empty string.");
            this.#defaultCodePrefix = prefix;
        }

        #generateCustomerCode(prefixOverride) {
            const prefix = prefixOverride || this.#defaultCodePrefix;
            let seq = (this.#codeSequences.get(prefix) || 0) + 1;
            let code = `${prefix}${String(seq).padStart(6, "0")}`;
            // Defensive loop: should never actually iterate given the sequence
            // counter is monotonic, but guarantees no duplicate is ever handed
            // out even if the index was seeded unexpectedly (e.g. via import).
            while (this.#customerCodeIndex.has(code)) {
                seq++;
                code = `${prefix}${String(seq).padStart(6, "0")}`;
            }
            this.#codeSequences.set(prefix, seq);
            return code;
        }

        // =====================================================================
        // ─── CUSTOMER CRUD ────────────────────────────────────────────────────
        // =====================================================================

        #defaultCustomerShape() {
            return {
                middleName: null, displayName: null, gender: null,
                assignedSalesRepresentative: null, assignedBranch: null,
                contacts: [], deliveryLocations: [],
                credit: {
                    enabled: false, limit: 0, available: 0, outstandingBalance: 0, used: 0,
                    rating: null, status: null, approvalDate: null, approvedBy: null
                },
                paymentTerms: { method: "Cash", dueDateRule: null, discountTerms: null, penaltyTerms: null },
                documents: [], notes: [],
                history: [],
                relationships: { quotations: [], orders: [], deliveries: [], invoices: [], receipts: [], payments: [], creditAccounts: [], reports: [] },
                metadata: {}
            };
        }

        #resolveTenantId(input) {
            if (input.tenantId) return input.tenantId;
            const companyRef = window.CozyOS && window.CozyOS.Company;
            if (input.companyId && companyRef && typeof companyRef.getCompany === "function") {
                const company = companyRef.getCompany(input.companyId);
                if (company) return company.tenantId;
            }
            throw new Error("[CozyCustomer] Could not resolve tenantId: provide `tenantId` directly, or `companyId` with Company Management connected and that company registered.");
        }

        #pushHistory(record, action, detail) {
            record.history.push(Object.freeze({ id: this.#generateId("hist"), timestamp: new Date().toISOString(), action, detail: detail || null }));
        }

        /**
         * createCustomer(input)
         *   Required: customerType, and either companyName or (firstName + lastName).
         *   tenantId is resolved via input.tenantId, or via input.companyId +
         *   Company Management if connected — never invented.
         */
        createCustomer(input) {
            this.#validateCustomerInput(input, { isUpdate: false });
            const tenantId = this.#resolveTenantId(input);
            if (this.#enforceUniqueEmail) {
                const primaryContact = (input.contacts || [])[0];
                if (primaryContact && primaryContact.email) this.#assertNoDuplicateContactField("email", primaryContact.email, null);
            }
            if (this.#enforceUniquePhone) {
                const primaryContact = (input.contacts || [])[0];
                if (primaryContact && primaryContact.phone) this.#assertNoDuplicateContactField("phone", primaryContact.phone, null);
            }

            const customerId = this.#generateId("cust");
            const customerCode = this.#generateCustomerCode(input.codePrefix);
            const now = new Date().toISOString();

            const displayName = input.displayName || input.companyName || [input.firstName, input.middleName, input.lastName].filter(Boolean).join(" ");

            const record = this.#safeMerge({
                customerId, customerCode,
                customerType: input.customerType,
                companyName: input.companyName ?? null,
                firstName: input.firstName ?? null,
                middleName: input.middleName ?? null,
                lastName: input.lastName ?? null,
                displayName,
                gender: input.gender ?? null,
                dateRegistered: now,
                status: "Active",
                assignedSalesRepresentative: input.assignedSalesRepresentative ?? null,
                assignedBranch: input.assignedBranch ?? null,
                tenantId, companyId: input.companyId ?? null,
                createdDate: now, updatedDate: now,
                ...this.#defaultCustomerShape()
            }, input);

            // Identity/system fields are never overridable via input.
            record.customerId = customerId;
            record.customerCode = customerCode;
            record.tenantId = tenantId;
            record.createdDate = now;
            record.updatedDate = now;
            record.status = "Active";
            record.history = [];
            this.#pushHistory(record, "CUSTOMER_CREATED", `${customerCode} created.`);

            this.#customers.set(customerId, this.#deepFreeze(record));
            this.#customerCodeIndex.set(customerCode, customerId);

            this.#diagnostics.customersCreated++;
            this.#logAudit("CUSTOMER_CREATED", `${customerId} (${customerCode}) created.`);
            this.#logTimeline(`Customer created: ${displayName}`);
            this.emit("customer.created", { customerId, customerCode, tenantId });
            return this.getCustomer(customerId);
        }

        updateCustomer(customerId, patch) {
            const existing = this.#customers.get(customerId);
            if (!existing) throw new Error(`[CozyCustomer] updateCustomer(): no customer found with id "${customerId}".`);
            this.#validateCustomerInput(patch || {}, { isUpdate: true });

            const merged = this.#safeMerge(existing, patch || {});
            merged.customerId = existing.customerId;
            merged.customerCode = existing.customerCode;
            merged.tenantId = existing.tenantId;
            merged.createdDate = existing.createdDate;
            merged.updatedDate = new Date().toISOString();
            merged.history = existing.history.slice();
            this.#pushHistory(merged, "PROFILE_UPDATED", null);

            this.#customers.set(customerId, this.#deepFreeze(merged));
            this.#diagnostics.customersUpdated++;
            this.#logAudit("CUSTOMER_UPDATED", `${customerId} updated.`);
            this.emit("customer.updated", { customerId, tenantId: existing.tenantId });
            return this.getCustomer(customerId);
        }

        archiveCustomer(customerId, reason = null) {
            const existing = this.#customers.get(customerId);
            if (!existing) throw new Error(`[CozyCustomer] archiveCustomer(): no customer found with id "${customerId}".`);
            const merged = this.#deepClone(existing);
            merged.status = "Archived";
            merged.updatedDate = new Date().toISOString();
            this.#pushHistory(merged, "ARCHIVED", reason);
            this.#customers.set(customerId, this.#deepFreeze(merged));
            this.#diagnostics.customersArchived++;
            this.#logAudit("STATUS_CHANGED", `${customerId} archived.${reason ? ` Reason: ${reason}` : ""}`);
            this.emit("customer.archived", { customerId, reason });
            return this.getCustomer(customerId);
        }

        /** Reverses archiveCustomer(). Archived customers can always be restored — no permanent deletion by default. */
        restoreCustomer(customerId) {
            const existing = this.#customers.get(customerId);
            if (!existing) throw new Error(`[CozyCustomer] restoreCustomer(): no customer found with id "${customerId}".`);
            const merged = this.#deepClone(existing);
            merged.status = "Active";
            merged.updatedDate = new Date().toISOString();
            this.#pushHistory(merged, "RESTORED", null);
            this.#customers.set(customerId, this.#deepFreeze(merged));
            this.#diagnostics.customersRestored++;
            this.#logAudit("STATUS_CHANGED", `${customerId} restored to Active.`);
            this.emit("customer.restored", { customerId });
            return this.getCustomer(customerId);
        }

        getCustomer(customerId) {
            const record = this.#customers.get(customerId);
            return record ? this.#deepFreeze(this.#deepClone(record)) : null;
        }

        /**
         * listCustomers(filter)
         *   filter: { tenantId, status, customerType }. Passing tenantId is
         *   strongly recommended — this module does not implicitly scope by
         *   tenant unless asked to, since some legitimate callers (platform
         *   admin tooling) need a cross-tenant view.
         */
        listCustomers(filter = {}) {
            let results = Array.from(this.#customers.values());
            if (filter.tenantId) results = results.filter(c => c.tenantId === filter.tenantId);
            if (filter.status) results = results.filter(c => c.status === filter.status);
            if (filter.customerType) results = results.filter(c => c.customerType === filter.customerType);
            return this.#deepFreeze(results.map(r => this.#deepClone(r)));
        }

        /**
         * searchCustomers(query, filter)
         *   Partial, case-insensitive match across customerCode, name fields,
         *   companyName, contact phone/email, tax PIN (in documents), and
         *   assignedSalesRepresentative — per the spec's Customer Search list.
         *   filter narrows by tenantId first, same recommendation as listCustomers().
         */
        searchCustomers(query, filter = {}) {
            const needle = String(query || "").toLowerCase().trim();
            if (!needle) return this.#deepFreeze([]);
            let pool = Array.from(this.#customers.values());
            if (filter.tenantId) pool = pool.filter(c => c.tenantId === filter.tenantId);

            const results = pool.filter((c) => {
                const haystacks = [
                    c.customerCode, c.displayName, c.companyName, c.firstName, c.lastName,
                    c.assignedSalesRepresentative, c.status, c.customerType,
                    ...(c.contacts || []).flatMap(ct => [ct.phone, ct.mobile, ct.email]),
                    ...(c.deliveryLocations || []).map(l => l.name),
                    ...(c.documents || []).map(d => d.reference)
                ].filter(Boolean).map(v => String(v).toLowerCase());
                return haystacks.some(h => h.includes(needle));
            });
            return this.#deepFreeze(results.map(r => this.#deepClone(r)));
        }

        getCustomerHistory(customerId) {
            const record = this.#customers.get(customerId);
            if (!record) throw new Error(`[CozyCustomer] getCustomerHistory(): no customer found with id "${customerId}".`);
            return this.#deepFreeze(this.#deepClone(record.history));
        }

        // =====================================================================
        // ─── CONTACTS ─────────────────────────────────────────────────────────
        // =====================================================================

        #getCustomerOrThrow(customerId) {
            const record = this.#customers.get(customerId);
            if (!record) throw new Error(`[CozyCustomer] No customer found with id "${customerId}".`);
            return record;
        }

        addContact(customerId, contactInput) {
            const customer = this.#getCustomerOrThrow(customerId);
            if (!contactInput || typeof contactInput.contactName !== "string" || !contactInput.contactName.trim()) {
                throw new Error("[CozyCustomer] addContact(): missing required field contactName.");
            }
            if (contactInput.email && !this.#isValidEmail(contactInput.email)) throw new Error(`[CozyCustomer] Invalid email: "${contactInput.email}".`);
            if (contactInput.phone && !this.#isValidPhone(contactInput.phone)) throw new Error(`[CozyCustomer] Invalid phone: "${contactInput.phone}".`);
            if (this.#enforceUniqueEmail && contactInput.email) this.#assertNoDuplicateContactField("email", contactInput.email, customerId);
            if (this.#enforceUniquePhone && contactInput.phone) this.#assertNoDuplicateContactField("phone", contactInput.phone, customerId);

            const contactId = this.#generateId("contact");
            const now = new Date().toISOString();
            const contact = Object.freeze({
                contactId, contactName: contactInput.contactName,
                position: contactInput.position ?? null, phone: contactInput.phone ?? null,
                mobile: contactInput.mobile ?? null, whatsapp: contactInput.whatsapp ?? null,
                email: contactInput.email ?? null,
                preferredContactMethod: contactInput.preferredContactMethod ?? null,
                isPrimary: !!contactInput.isPrimary, createdAt: now
            });

            const merged = this.#deepClone(customer);
            // Only one primary contact at a time — demoting the others is a
            // data-consistency guarantee, not a business rule.
            if (contact.isPrimary) merged.contacts.forEach(c => { c.isPrimary = false; });
            merged.contacts.push(contact);
            merged.updatedDate = now;
            this.#pushHistory(merged, "CONTACT_ADDED", contact.contactName);
            this.#customers.set(customerId, this.#deepFreeze(merged));

            this.#diagnostics.contactsAdded++;
            this.#logAudit("CONTACT_ADDED", `${contactId} added to ${customerId}.`);
            this.emit("customer.contact.created", { customerId, contactId });
            return contact;
        }

        updateContact(customerId, contactId, patch) {
            const customer = this.#getCustomerOrThrow(customerId);
            const idx = customer.contacts.findIndex(c => c.contactId === contactId);
            if (idx === -1) throw new Error(`[CozyCustomer] updateContact(): no contact "${contactId}" for customer "${customerId}".`);
            if (patch && patch.email && !this.#isValidEmail(patch.email)) throw new Error(`[CozyCustomer] Invalid email: "${patch.email}".`);
            if (patch && patch.phone && !this.#isValidPhone(patch.phone)) throw new Error(`[CozyCustomer] Invalid phone: "${patch.phone}".`);

            const merged = this.#deepClone(customer);
            if (patch && patch.isPrimary) merged.contacts.forEach(c => { c.isPrimary = false; });
            merged.contacts[idx] = { ...merged.contacts[idx], ...this.#safeMerge(merged.contacts[idx], patch || {}) };
            merged.contacts[idx].contactId = contactId;
            merged.updatedDate = new Date().toISOString();
            this.#pushHistory(merged, "CONTACT_UPDATED", contactId);
            this.#customers.set(customerId, this.#deepFreeze(merged));
            this.#logAudit("CONTACT_UPDATED", `${contactId} updated for ${customerId}.`);
            this.emit("customer.contact.updated", { customerId, contactId });
            return this.#deepFreeze(this.#deepClone(merged.contacts[idx]));
        }

        removeContact(customerId, contactId) {
            const customer = this.#getCustomerOrThrow(customerId);
            const merged = this.#deepClone(customer);
            const before = merged.contacts.length;
            merged.contacts = merged.contacts.filter(c => c.contactId !== contactId);
            if (merged.contacts.length === before) return false;
            merged.updatedDate = new Date().toISOString();
            this.#pushHistory(merged, "CONTACT_REMOVED", contactId);
            this.#customers.set(customerId, this.#deepFreeze(merged));
            this.#logAudit("CONTACT_REMOVED", `${contactId} removed from ${customerId}.`);
            this.emit("customer.contact.removed", { customerId, contactId });
            return true;
        }

        // =====================================================================
        // ─── DELIVERY LOCATIONS ───────────────────────────────────────────────
        // =====================================================================

        addDeliveryLocation(customerId, locationInput) {
            const customer = this.#getCustomerOrThrow(customerId);
            if (!locationInput || typeof locationInput.locationName !== "string" || !locationInput.locationName.trim()) {
                throw new Error("[CozyCustomer] addDeliveryLocation(): missing required field locationName.");
            }
            if (locationInput.phone && !this.#isValidPhone(locationInput.phone)) throw new Error(`[CozyCustomer] Invalid phone: "${locationInput.phone}".`);

            const locationId = this.#generateId("loc");
            const now = new Date().toISOString();
            const location = Object.freeze({
                locationId, locationName: locationInput.locationName,
                physicalAddress: locationInput.physicalAddress ?? null, county: locationInput.county ?? null,
                town: locationInput.town ?? null, landmark: locationInput.landmark ?? null,
                gpsCoordinates: locationInput.gpsCoordinates ?? null,
                deliveryInstructions: locationInput.deliveryInstructions ?? null,
                contactPerson: locationInput.contactPerson ?? null, phone: locationInput.phone ?? null,
                isDefault: !!locationInput.isDefault, createdAt: now
            });

            const merged = this.#deepClone(customer);
            if (location.isDefault) merged.deliveryLocations.forEach(l => { l.isDefault = false; });
            merged.deliveryLocations.push(location);
            merged.updatedDate = now;
            this.#pushHistory(merged, "ADDRESS_ADDED", location.locationName);
            this.#customers.set(customerId, this.#deepFreeze(merged));
            this.#logAudit("ADDRESS_UPDATED", `${locationId} added to ${customerId}.`);
            this.emit("customer.location.created", { customerId, locationId });
            return location;
        }

        updateDeliveryLocation(customerId, locationId, patch) {
            const customer = this.#getCustomerOrThrow(customerId);
            const idx = customer.deliveryLocations.findIndex(l => l.locationId === locationId);
            if (idx === -1) throw new Error(`[CozyCustomer] updateDeliveryLocation(): no location "${locationId}" for customer "${customerId}".`);
            if (patch && patch.phone && !this.#isValidPhone(patch.phone)) throw new Error(`[CozyCustomer] Invalid phone: "${patch.phone}".`);

            const merged = this.#deepClone(customer);
            if (patch && patch.isDefault) merged.deliveryLocations.forEach(l => { l.isDefault = false; });
            merged.deliveryLocations[idx] = { ...merged.deliveryLocations[idx], ...this.#safeMerge(merged.deliveryLocations[idx], patch || {}) };
            merged.deliveryLocations[idx].locationId = locationId;
            merged.updatedDate = new Date().toISOString();
            this.#pushHistory(merged, "ADDRESS_UPDATED", locationId);
            this.#customers.set(customerId, this.#deepFreeze(merged));
            this.#logAudit("ADDRESS_UPDATED", `${locationId} updated for ${customerId}.`);
            this.emit("customer.location.updated", { customerId, locationId });
            return this.#deepFreeze(this.#deepClone(merged.deliveryLocations[idx]));
        }

        removeDeliveryLocation(customerId, locationId) {
            const customer = this.#getCustomerOrThrow(customerId);
            const merged = this.#deepClone(customer);
            const before = merged.deliveryLocations.length;
            merged.deliveryLocations = merged.deliveryLocations.filter(l => l.locationId !== locationId);
            if (merged.deliveryLocations.length === before) return false;
            merged.updatedDate = new Date().toISOString();
            this.#pushHistory(merged, "ADDRESS_UPDATED", `${locationId} removed`);
            this.#customers.set(customerId, this.#deepFreeze(merged));
            this.#logAudit("ADDRESS_UPDATED", `${locationId} removed from ${customerId}.`);
            this.emit("customer.location.removed", { customerId, locationId });
            return true;
        }

        // =====================================================================
        // ─── NOTES ────────────────────────────────────────────────────────────
        // =====================================================================

        addCustomerNote(customerId, noteInput) {
            const customer = this.#getCustomerOrThrow(customerId);
            if (!noteInput || typeof noteInput.text !== "string" || !noteInput.text.trim()) {
                throw new Error("[CozyCustomer] addCustomerNote(): missing required field text.");
            }
            const noteId = this.#generateId("note");
            const now = new Date().toISOString();
            const note = Object.freeze({
                noteId, author: noteInput.author ?? null, date: now,
                category: noteInput.category || "Internal Notes",
                priority: noteInput.priority || "Normal",
                text: noteInput.text
            });
            const merged = this.#deepClone(customer);
            merged.notes.push(note);
            merged.updatedDate = now;
            this.#pushHistory(merged, "NOTE_ADDED", note.category);
            this.#customers.set(customerId, this.#deepFreeze(merged));
            this.#diagnostics.notesAdded++;
            this.#logAudit("NOTE_ADDED", `${noteId} added to ${customerId}.`);
            this.emit("customer.note.created", { customerId, noteId });
            return note;
        }

        // =====================================================================
        // ─── DOCUMENTS ────────────────────────────────────────────────────────
        // Metadata/reference only — no document processing, storage, or
        // validation of the referenced file's actual contents.
        // =====================================================================

        addCustomerDocument(customerId, documentInput) {
            const customer = this.#getCustomerOrThrow(customerId);
            if (!documentInput || typeof documentInput.type !== "string" || !documentInput.type.trim()) {
                throw new Error("[CozyCustomer] addCustomerDocument(): missing required field type (e.g. \"National ID\", \"Tax PIN\", \"Contract\").");
            }
            const documentId = this.#generateId("doc");
            const now = new Date().toISOString();
            const document = Object.freeze({
                documentId, type: documentInput.type,
                reference: documentInput.reference ?? null,
                metadata: documentInput.metadata ? this.#deepFreeze(this.#deepClone(documentInput.metadata)) : {},
                uploadedAt: now
            });
            const merged = this.#deepClone(customer);
            merged.documents.push(document);
            merged.updatedDate = now;
            this.#pushHistory(merged, "DOCUMENT_UPLOADED", document.type);
            this.#customers.set(customerId, this.#deepFreeze(merged));
            this.#diagnostics.documentsAdded++;
            this.#logAudit("DOCUMENT_ADDED", `${documentId} (${documentInput.type}) added to ${customerId}.`);
            this.emit("customer.document.added", { customerId, documentId, type: documentInput.type });
            return document;
        }

        // =====================================================================
        // ─── CREDIT MANAGEMENT ────────────────────────────────────────────────
        // Records numbers faithfully; never enforces a block or auto-changes
        // status when a limit is exceeded — that decision belongs to whatever
        // business module (Orders, Invoicing) acts on these numbers.
        // =====================================================================

        updateCreditLimit(customerId, newLimit, { approvedBy = null } = {}) {
            if (typeof newLimit !== "number" || Number.isNaN(newLimit) || newLimit < 0) {
                throw new Error(`[CozyCustomer] updateCreditLimit(): invalid credit limit "${newLimit}" — must be a non-negative number.`);
            }
            const customer = this.#getCustomerOrThrow(customerId);
            const merged = this.#deepClone(customer);
            merged.credit.limit = newLimit;
            merged.credit.enabled = true;
            merged.credit.available = Math.max(0, newLimit - (merged.credit.used || 0));
            merged.credit.approvalDate = new Date().toISOString();
            merged.credit.approvedBy = approvedBy;
            merged.updatedDate = new Date().toISOString();
            this.#pushHistory(merged, "CREDIT_CHANGED", `Limit set to ${newLimit}.`);
            this.#customers.set(customerId, this.#deepFreeze(merged));
            this.#logAudit("CREDIT_CHANGED", `${customerId} credit limit set to ${newLimit}.`);
            this.emit("customer.credit.updated", { customerId, creditLimit: newLimit });
            return this.#deepFreeze(this.#deepClone(merged.credit));
        }

        /** Called when a new invoice/order is created against this customer's credit account. */
        recordCreditUsage(customerId, amount) {
            if (typeof amount !== "number" || Number.isNaN(amount) || amount < 0) {
                throw new Error(`[CozyCustomer] recordCreditUsage(): invalid amount "${amount}" — must be a non-negative number.`);
            }
            const customer = this.#getCustomerOrThrow(customerId);
            const merged = this.#deepClone(customer);
            merged.credit.used = (merged.credit.used || 0) + amount;
            merged.credit.outstandingBalance = (merged.credit.outstandingBalance || 0) + amount;
            merged.credit.available = Math.max(0, (merged.credit.limit || 0) - merged.credit.used);
            merged.updatedDate = new Date().toISOString();
            this.#pushHistory(merged, "CREDIT_CHANGED", `Usage recorded: +${amount}.`);
            this.#customers.set(customerId, this.#deepFreeze(merged));
            this.#logAudit("CREDIT_CHANGED", `${customerId} credit usage +${amount}.`);
            this.emit("customer.credit.updated", { customerId, delta: amount, type: "usage" });
            return this.#deepFreeze(this.#deepClone(merged.credit));
        }

        /** Called when a payment is recorded against this customer's outstanding balance. */
        recordPayment(customerId, amount) {
            if (typeof amount !== "number" || Number.isNaN(amount) || amount < 0) {
                throw new Error(`[CozyCustomer] recordPayment(): invalid amount "${amount}" — must be a non-negative number.`);
            }
            const customer = this.#getCustomerOrThrow(customerId);
            const merged = this.#deepClone(customer);
            merged.credit.outstandingBalance = Math.max(0, (merged.credit.outstandingBalance || 0) - amount);
            merged.credit.used = Math.max(0, (merged.credit.used || 0) - amount);
            merged.credit.available = Math.max(0, (merged.credit.limit || 0) - merged.credit.used);
            merged.updatedDate = new Date().toISOString();
            this.#pushHistory(merged, "PAYMENT_RECORDED", `Payment recorded: -${amount}.`);
            this.#customers.set(customerId, this.#deepFreeze(merged));
            this.#logAudit("CREDIT_CHANGED", `${customerId} payment recorded -${amount}.`);
            this.emit("customer.credit.updated", { customerId, delta: -amount, type: "payment" });
            return this.#deepFreeze(this.#deepClone(merged.credit));
        }

        updateCreditStatus(customerId, status, rating) {
            const customer = this.#getCustomerOrThrow(customerId);
            const merged = this.#deepClone(customer);
            merged.credit.status = status ?? merged.credit.status;
            if (rating !== undefined) merged.credit.rating = rating;
            merged.updatedDate = new Date().toISOString();
            this.#pushHistory(merged, "CREDIT_CHANGED", `Status set to ${status}.`);
            this.#customers.set(customerId, this.#deepFreeze(merged));
            this.#logAudit("CREDIT_CHANGED", `${customerId} credit status set to ${status}.`);
            this.emit("customer.credit.updated", { customerId, status });
            return this.#deepFreeze(this.#deepClone(merged.credit));
        }

        /**
         * isOverCreditLimit(customerId)
         *   A pure computed read (creditUsed > creditLimit) — reports the
         *   fact, does not act on it. Automatic blocking, if any CozyOS
         *   application wants it, is that application's own business rule.
         */
        isOverCreditLimit(customerId) {
            const customer = this.#getCustomerOrThrow(customerId);
            return customer.credit.enabled && customer.credit.used > customer.credit.limit;
        }

        // =====================================================================
        // ─── PAYMENT TERMS ────────────────────────────────────────────────────
        // =====================================================================

        updatePaymentTerms(customerId, patch) {
            const customer = this.#getCustomerOrThrow(customerId);
            const merged = this.#deepClone(customer);
            merged.paymentTerms = this.#safeMerge(merged.paymentTerms, patch || {});
            merged.updatedDate = new Date().toISOString();
            this.#pushHistory(merged, "PROFILE_UPDATED", "Payment terms updated.");
            this.#customers.set(customerId, this.#deepFreeze(merged));
            this.#logAudit("CUSTOMER_UPDATED", `${customerId} payment terms updated.`);
            return this.#deepFreeze(this.#deepClone(merged.paymentTerms));
        }

        // =====================================================================
        // ─── DIAGNOSTICS ──────────────────────────────────────────────────────
        // =====================================================================

        getDiagnosticsReport() {
            const all = Array.from(this.#customers.values());
            const activeCustomers = all.filter(c => c.status === "Active").length;
            const archivedCustomers = all.filter(c => c.status === "Archived").length;
            const creditCustomers = all.filter(c => c.credit && c.credit.enabled).length;

            let certificationStatus = "Unknown — CozyCertification not connected";
            let integrationCount = 0;
            if (window.CozyOS && window.CozyOS.Certification && typeof window.CozyOS.Certification.getWorkspaceSummary === "function") {
                integrationCount++;
                try {
                    const summary = window.CozyOS.Certification.getWorkspaceSummary("Customer");
                    certificationStatus = summary && summary.certification ? summary.certification : "NOT_CERTIFIED";
                } catch (_err) { this.#diagnostics.errorsHidden++; }
            }
            if (window.CozyOS && window.CozyOS.Company) integrationCount++;
            if (window.CozyOS && window.CozyOS.ServiceRegistry) integrationCount++;

            return this.#deepFreeze(this.#deepClone({
                ...this.#diagnostics,
                moduleVersion: CUSTOMER_VERSION,
                dependencies: [
                    { name: "Company Management", required: false, purpose: "Resolve tenantId from companyId at customer creation" },
                    { name: "CozyCertification", required: false, purpose: "Certification status in diagnostics" },
                    { name: "ServiceRegistry", required: false, purpose: "Coordinator catalog auto-registration" }
                ],
                integrationCount,
                customerCount: all.length,
                activeCustomers, archivedCustomers, creditCustomers,
                auditLogCount: this.#auditLogs.length,
                timelineEventCount: this.#timelineEvents.length,
                healthStatus: this.#diagnostics.errorsHidden === 0 ? "OK" : "DEGRADED",
                certificationStatus
            }));
        }

        // =====================================================================
        // ─── EXPORT / IMPORT SNAPSHOT ─────────────────────────────────────────
        // =====================================================================

        exportSnapshot() {
            return this.#deepFreeze(this.#deepClone({
                version: CUSTOMER_VERSION,
                exportedAt: new Date().toISOString(),
                customers: Array.from(this.#customers.values())
            }));
        }

        /**
         * importSnapshot(snapshot, { mergeStrategy })
         *   mergeStrategy: "merge" (default, keep-latest-updatedDate on
         *   conflict) or "replace" (wipe and load exactly what's given).
         */
        importSnapshot(snapshot, { mergeStrategy = "merge" } = {}) {
            if (!snapshot || !Array.isArray(snapshot.customers)) {
                throw new TypeError("[CozyCustomer] importSnapshot(): snapshot must be an object with a `customers` array.");
            }
            if (mergeStrategy !== "merge" && mergeStrategy !== "replace") {
                throw new TypeError('[CozyCustomer] importSnapshot(): mergeStrategy must be "merge" or "replace".');
            }
            if (mergeStrategy === "replace") {
                this.#customers.clear();
                this.#customerCodeIndex.clear();
            }
            let imported = 0, skipped = 0;
            for (const incoming of snapshot.customers) {
                if (!incoming || typeof incoming.customerId !== "string" || typeof incoming.customerCode !== "string") { skipped++; continue; }
                const existing = this.#customers.get(incoming.customerId);
                if (existing && mergeStrategy === "merge") {
                    if (new Date(incoming.updatedDate || 0) <= new Date(existing.updatedDate || 0)) { skipped++; continue; }
                }
                const record = this.#deepFreeze(this.#deepClone(incoming));
                this.#customers.set(incoming.customerId, record);
                this.#customerCodeIndex.set(incoming.customerCode, incoming.customerId);
                imported++;
            }
            this.#logAudit("SNAPSHOT_IMPORTED", `${imported} customer(s) imported, ${skipped} skipped (strategy: ${mergeStrategy}).`);
            this.emit("customer.snapshot.imported", { imported, skipped, mergeStrategy });
            return { imported, skipped };
        }

        isSnapshotCompatible(snapshot) {
            return !!(snapshot && typeof snapshot.version === "string" && snapshot.version.split(".")[0] === CUSTOMER_VERSION.split(".")[0]);
        }
    }

    // --- INSTANTIATION & VERSION CONFLICT / HOT RELOAD PROTECTION ---
    if (window.CozyOS.Customer && typeof window.CozyOS.Customer.getVersion === "function") {
        const existingVersion = window.CozyOS.Customer.getVersion();
        if (existingVersion !== CUSTOMER_VERSION) {
            throw new Error(`[CozyOS Framework Execution Error] VERSION_CONFLICT: Customer existing v${existingVersion} conflicts with load target v${CUSTOMER_VERSION}.`);
        }
        return;
    }

    window.CozyOS.Customer = new CozyOSCustomerManagement();

    // Auto-register with the Service Registry, if it's loaded, so the
    // Workspace Shell's Module Manager shows real category/icon/description
    // for this coordinator. Purely descriptive — never required.
    if (typeof window.CozyOS.registerCoordinator === "function") {
        try {
            window.CozyOS.registerCoordinator({
                name: "Customer",
                category: "Business Domain",
                icon: "customer.svg",
                description: "Customer Management — the authoritative customer registry for QuarryOS and any other CozyOS application that sells products or services."
            });
        } catch (_err) { /* Service Registry rejected the manifest — non-fatal, this module still works standalone. */ }
    }
})();
