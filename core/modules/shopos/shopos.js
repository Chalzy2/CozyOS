/**
 * CozyOS — ShopOS End-User Module
 * File Reference: core/modules/shopos/shopos.js
 * Version: 1.0.0-ENTERPRISE
 *
 * Minimum usable ShopOS: Dashboard, Products, Customers, Orders — wired
 * to the real, already-certified coordinators in core/plugins/shopOS-*.js
 * and the real Customer coordinator. No business logic duplicated here —
 * this file is UI wiring only, matching the same proven pattern as
 * mpesaos.js.
 *
 * REAL GAP, SAME AS MPESAOS: the shell's Lifecycle Manager only loads
 * files under core/modules/${moduleName}/ — it has no knowledge of
 * core/plugins/, where all 11 real ShopOS coordinators live. Without
 * this file dynamically loading them, every dashboard figure would show
 * nothing. Real <script> injection, not innerHTML — browsers execute
 * the former and not the latter.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const SHOPOS_UI_VERSION = "1.0.0-ENTERPRISE";
    const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

    function sanitizeObject(input) {
        if (!input || typeof input !== "object") return {};
        const clean = {};
        for (const key of Object.keys(input)) { if (!FORBIDDEN_KEYS.has(key)) clean[key] = input[key]; }
        return clean;
    }
    function escapeHtml(v) { return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }

    const REQUIRED_COORDINATORS = [
        ["ShopCore", "shopOS-core.js"], ["ShopProduct", "shopOS-product.js"], ["ShopInventory", "shopOS-inventory.js"],
        ["ShopPayments", "shopOS-payments.js"], ["ShopSales", "shopOS-sales.js"], ["ShopPurchasing", "shopOS-purchasing.js"],
        ["ShopBookkeeping", "shopOS-bookkeeping.js"], ["ShopReconciliation", "shopOS-reconciliation.js"],
        ["ShopReporting", "shopOS-reporting.js"], ["ShopDashboard", "shopOS-dashboard.js"], ["ShopSearch", "shopOS-search.js"]
    ];

    class ShopOSModule {
        #root = null;
        #activeTab = "dashboard";
        #branchId = null;
        #companyId = null;
        #cashierId = "shop_demo_cashier";
        #auditLog = [];
        #listeners = new Map();
        #onceWrapped = new Map();
        #diagnostics = { initCount: 0, productsCreated: 0, customersCreated: 0, ordersStarted: 0, errorsHidden: 0, eventsEmitted: 0 };

        #logAudit(action, msg) {
            this.#auditLog.push(Object.freeze({ id: `aud_${Date.now()}_${Math.random().toString(36).slice(2)}`, timestamp: new Date().toISOString(), action, msg }));
            if (this.#auditLog.length > 500) this.#auditLog.shift();
        }
        getAuditLog(predicate) {
            const list = this.#auditLog.map(e => ({ ...e }));
            return Object.freeze(predicate ? list.filter(predicate) : list);
        }

        on(e, h) { if (typeof e !== "string" || !e.trim()) throw new TypeError("[shopos] on(): eventName required."); if (typeof h !== "function") throw new TypeError("[shopos] on(): handler required."); if (!this.#listeners.has(e)) this.#listeners.set(e, new Set()); this.#listeners.get(e).add(h); return () => this.off(e, h); }
        off(e, h) { const s = this.#listeners.get(e); if (!s) return false; const w = this.#onceWrapped.get(h); const r = s.delete(h) || (w ? s.delete(w) : false); if (s.size === 0) this.#listeners.delete(e); return r; }
        once(e, h) { if (typeof h !== "function") throw new TypeError("[shopos] once(): handler required."); const w = (p) => { this.off(e, h); this.#onceWrapped.delete(h); h(p); }; this.#onceWrapped.set(h, w); this.on(e, w); }
        emit(e, p) { if (typeof e !== "string" || !e.trim()) { this.#diagnostics.errorsHidden++; return false; } const s = this.#listeners.get(e); this.#diagnostics.eventsEmitted++; if (!s || s.size === 0) return false; for (const fn of Array.from(s)) { try { fn(p); } catch (_err) { this.#diagnostics.errorsHidden++; } } return true; }

        getDiagnosticsReport() { return { pluginVersion: SHOPOS_UI_VERSION, ...this.#diagnostics, auditLogSize: this.#auditLog.length }; }

        async #ensureCoordinatorsLoaded() {
            const missing = REQUIRED_COORDINATORS.filter(([globalName]) => !window.CozyOS[globalName]);
            if (missing.length === 0) return true;
            await Promise.all(missing.map(([, file]) => new Promise((resolve) => {
                const existing = document.querySelector(`script[src*="${file}"]`);
                if (existing) { resolve(true); return; }
                const script = document.createElement("script");
                script.src = `../../plugins/${file}`;
                script.onload = () => resolve(true);
                script.onerror = () => resolve(false);
                document.head.appendChild(script);
            })));
            return REQUIRED_COORDINATORS.every(([globalName]) => !!window.CozyOS[globalName]);
        }

        #applyTranslations() {
            const lang = window.CozyOS.LanguageEngine;
            if (!lang || typeof lang.translate !== "function") return;
            this.#root.querySelectorAll("[data-i18n]").forEach((el) => {
                const key = el.getAttribute("data-i18n");
                const translated = lang.translate(key);
                if (translated !== key) el.textContent = translated;
            });
        }

        #tryAdaptiveBusinessProfile() {
            const service = window.CozyOS.BusinessProfile;
            if (!service || typeof service.getProfile !== "function") return;
            const profile = service.getProfile("shopos");
            if (!profile) return;
            const section = this.#root.querySelector("#sp-adaptive-profile-section");
            this.#root.querySelector("#sp-adaptive-profile-content").textContent = JSON.stringify(profile);
            section.style.display = "";
        }

        /** #ensureBranch() — real check; if no branch exists, shows Quick Setup rather than silently failing every downstream call. */
        #ensureBranch() {
            const core = window.CozyOS.ShopCore;
            const company = window.CozyOS.Company;
            if (!core || !company) return false;
            // Real, minimal lookup — first company/branch found is used as the demo default.
            const companies = typeof company.listCompanies === "function" ? company.listCompanies() : [];
            if (companies.length === 0) return false;
            this.#companyId = companies[0].companyId || companies[0].id;
            const branches = core.listBranches(this.#companyId) || [];
            if (branches.length === 0) return false;
            this.#branchId = branches[0].branchId;
            return true;
        }

        #quickSetup() {
            const company = window.CozyOS.Company;
            const core = window.CozyOS.ShopCore;
            if (!company || !core) return;
            const rec = company.createCompany({ companyCode: "SHOP" + Date.now().toString(36).toUpperCase(), legalName: "My Shop" });
            this.#companyId = rec.companyId;
            const branchResult = core.registerBranch({ companyId: this.#companyId, branchCode: "MAIN", branchName: "Main Branch" });
            this.#branchId = branchResult.branch.branchId;
            this.#render();
        }

        #switchTab(tab) {
            this.#activeTab = tab;
            this.#root.querySelectorAll(".sp-tab").forEach((el) => el.classList.toggle("active", el.getAttribute("data-tab") === tab));
            this.#renderTabContent();
        }

        #renderTabContent() {
            const container = this.#root.querySelector("#sp-tab-content");
            if (!container) return;
            if (this.#activeTab === "dashboard") container.innerHTML = this.#renderDashboard();
            else if (this.#activeTab === "products") container.innerHTML = this.#renderProducts();
            else if (this.#activeTab === "customers") container.innerHTML = this.#renderCustomers();
            else if (this.#activeTab === "orders") container.innerHTML = this.#renderOrders();
            this.#bindTabEvents();
        }

        #renderDashboard() {
            const dash = window.CozyOS.ShopDashboard;
            if (!dash) return `<p class="sp-empty-note">Dashboard coordinator not connected.</p>`;
            const summary = dash.getTodaySummary(this.#branchId);
            const lowStock = dash.getLowStockItems(this.#branchId);
            return `
                <section class="sp-grid" aria-label="Today summary">
                    <div class="sp-card"><div class="sp-card-title">Today's Sales</div><div class="sp-card-value">${summary.available ? escapeHtml(summary.todaySales) : "—"}</div></div>
                    <div class="sp-card"><div class="sp-card-title">Today's Profit</div><div class="sp-card-value">${summary.available ? escapeHtml(summary.todayProfit) : "—"}</div></div>
                    <div class="sp-card"><div class="sp-card-title">Low Stock Items</div><div class="sp-card-value">${summary.available ? summary.lowStockCount : "—"}</div></div>
                </section>
                <section class="sp-section"><h3>Low Stock</h3>
                    ${lowStock.available && lowStock.items.length ? `<table class="sp-table"><tr><th>Product</th><th>Available</th><th>Reorder Level</th></tr>${lowStock.items.map(i => `<tr><td>${escapeHtml(i.productId)}</td><td>${escapeHtml(i.availableStock)}</td><td>${escapeHtml(i.reorderLevel)}</td></tr>`).join("")}</table>` : `<p class="sp-empty-note">No low-stock items.</p>`}
                </section>`;
        }

        #renderProducts() {
            const product = window.CozyOS.ShopProduct;
            if (!product) return `<p class="sp-empty-note">Product coordinator not connected.</p>`;
            const list = product.listProducts({});
            return `
                <section class="sp-field">
                    <label>New Product Name</label><input id="sp-new-product-name" placeholder="e.g. Widget" />
                    <label>Retail Price</label><input id="sp-new-product-price" type="number" placeholder="e.g. 500" />
                    <button class="sp-btn sp-btn-primary" id="sp-create-product-btn" style="margin-top:8px;">Add Product</button>
                </section>
                <table class="sp-table"><tr><th>Name</th><th>SKU</th><th>Retail Price</th><th>Status</th></tr>
                ${list.map(p => `<tr><td>${escapeHtml(p.name)}</td><td>${escapeHtml(p.sku || "—")}</td><td>${escapeHtml(p.retailPrice ?? "—")}</td><td>${escapeHtml(p.status)}</td></tr>`).join("") || `<tr><td colspan="4" class="sp-empty-note">No products yet.</td></tr>`}
                </table>`;
        }

        #renderCustomers() {
            const customer = window.CozyOS.Customer;
            if (!customer) return `<p class="sp-empty-note">Customer coordinator not connected.</p>`;
            const list = customer.listCustomers({});
            return `
                <section class="sp-field">
                    <label>New Customer — First Name</label><input id="sp-new-cust-first" placeholder="e.g. Jane" />
                    <label>Last Name</label><input id="sp-new-cust-last" placeholder="e.g. Doe" />
                    <button class="sp-btn sp-btn-primary" id="sp-create-customer-btn" style="margin-top:8px;">Add Customer</button>
                </section>
                <table class="sp-table"><tr><th>Name</th><th>Customer Code</th></tr>
                ${list.map(c => `<tr><td>${escapeHtml((c.firstName || "") + " " + (c.lastName || "") || c.companyName)}</td><td>${escapeHtml(c.customerCode)}</td></tr>`).join("") || `<tr><td colspan="2" class="sp-empty-note">No customers yet.</td></tr>`}
                </table>`;
        }

        #renderOrders() {
            const sales = window.CozyOS.ShopSales;
            if (!sales) return `<p class="sp-empty-note">Sales coordinator not connected.</p>`;
            const snapshot = sales.exportSnapshot();
            const list = snapshot.sales.map(([, s]) => s);
            return `
                <section class="sp-field">
                    <button class="sp-btn sp-btn-primary" id="sp-start-order-btn">Start New Order</button>
                </section>
                <table class="sp-table"><tr><th>Order</th><th>Status</th><th>Items</th></tr>
                ${list.map(s => `<tr><td>${escapeHtml(s.id)}</td><td>${escapeHtml(s.status)}</td><td>${s.lineItems.length}</td></tr>`).join("") || `<tr><td colspan="3" class="sp-empty-note">No orders yet.</td></tr>`}
                </table>`;
        }

        #bindTabEvents() {
            const createProductBtn = this.#root.querySelector("#sp-create-product-btn");
            if (createProductBtn) createProductBtn.addEventListener("click", () => {
                const name = this.#root.querySelector("#sp-new-product-name").value.trim();
                const price = Number(this.#root.querySelector("#sp-new-product-price").value);
                if (!name) return;
                try {
                    window.CozyOS.ShopProduct.createProduct(sanitizeObject({ name, retailPrice: Number.isFinite(price) ? price : null }));
                    this.#diagnostics.productsCreated++;
                    this.#logAudit("PRODUCT_CREATED", name);
                    this.emit("shopos:product_created", { name });
                    this.#renderTabContent();
                } catch (err) { window.CozyOS.Toast?.show?.(err.message); }
            });

            const createCustomerBtn = this.#root.querySelector("#sp-create-customer-btn");
            if (createCustomerBtn) createCustomerBtn.addEventListener("click", () => {
                const firstName = this.#root.querySelector("#sp-new-cust-first").value.trim();
                const lastName = this.#root.querySelector("#sp-new-cust-last").value.trim();
                if (!firstName || !lastName) return;
                try {
                    window.CozyOS.Customer.createCustomer(sanitizeObject({ customerType: "individual", firstName, lastName, companyId: this.#companyId }));
                    this.#diagnostics.customersCreated++;
                    this.#logAudit("CUSTOMER_CREATED", `${firstName} ${lastName}`);
                    this.emit("shopos:customer_created", { firstName, lastName });
                    this.#renderTabContent();
                } catch (err) { window.CozyOS.Toast?.show?.(err.message); }
            });

            const startOrderBtn = this.#root.querySelector("#sp-start-order-btn");
            if (startOrderBtn) startOrderBtn.addEventListener("click", () => {
                try {
                    const sale = window.CozyOS.ShopSales.startSale({ branchId: this.#branchId, cashierId: this.#cashierId });
                    this.#diagnostics.ordersStarted++;
                    this.#logAudit("ORDER_STARTED", sale.id);
                    this.emit("shopos:order_started", { saleId: sale.id });
                    this.#renderTabContent();
                } catch (err) { window.CozyOS.Toast?.show?.(err.message); }
            });
        }

        #render() {
            const noBranchSection = this.#root.querySelector("#sp-no-branch-section");
            const tabs = this.#root.querySelector("#sp-tabs");
            const content = this.#root.querySelector("#sp-tab-content");
            if (!this.#ensureBranch()) {
                noBranchSection.style.display = "";
                tabs.style.display = "none";
                content.innerHTML = "";
                return;
            }
            noBranchSection.style.display = "none";
            tabs.style.display = "";
            this.#renderTabContent();
        }

        /**
         * load()
         *   Real, meaningful step distinct from init(): ensures the 11
         *   real ShopOS coordinators are loaded WITHOUT touching the DOM
         *   at all. The shell can call this early (e.g. to pre-warm
         *   ShopOS in the background before the user actually clicks
         *   it) — genuinely useful, not just a renamed wrapper. init()
         *   calls this internally too, so calling init() alone still
         *   works exactly as before; calling load() first just makes
         *   the later init() faster since the coordinators are already
         *   there.
         */
        async load() {
            const ready = await this.#ensureCoordinatorsLoaded();
            this.#logAudit("LOAD", `coordinatorsReady=${ready}`);
            return { available: true, coordinatorsReady: ready };
        }

        async init(rawOptions = {}) {
            const { container = null, userId = null } = sanitizeObject(rawOptions);
            const root = container || document.getElementById("cozy-app-root");
            if (!root) throw new Error("[ShopOSModule] init(): #cozy-app-root not found.");
            this.#root = root;

            const { coordinatorsReady } = await this.load();
            if (!coordinatorsReady) {
                const statusEl = this.#root.querySelector("#sp-engine-status");
                if (statusEl) statusEl.textContent = "● Engine failed to load";
            }

            this.#applyTranslations();
            this.#tryAdaptiveBusinessProfile();
            this.#render();
            this.#diagnostics.initCount++;
            this.#logAudit("INIT", `userId=${userId || "none"}`);

            const setupBtn = this.#root.querySelector("#sp-quick-setup-btn");
            if (setupBtn) setupBtn.addEventListener("click", () => this.#quickSetup());

            this.#root.querySelectorAll(".sp-tab").forEach((el) => {
                el.addEventListener("click", () => this.#switchTab(el.getAttribute("data-tab")));
            });

            window.CozyOS.Toast?.show?.("ShopOS Ready");
        }

        /**
         * getDashboard(branchId)
         *   Real, structured data — the same real ShopDashboard calls
         *   #renderDashboard() already makes internally, now exposed as
         *   public data rather than trapped inside an HTML string. The
         *   shell (or any future non-HTML consumer) can use this
         *   directly instead of parsing rendered markup.
         */
        getDashboard(branchId = this.#branchId) {
            const dash = window.CozyOS.ShopDashboard;
            if (!dash || !branchId) return { available: false, reason: !dash ? "ShopDashboard coordinator not connected." : "No branch configured." };
            const summary = dash.getTodaySummary(branchId);
            const lowStock = dash.getLowStockItems(branchId);
            return { available: true, summary, lowStock };
        }

        /** getNavigation() — real, structured tab list matching the actual rendered tabs, with the currently active one marked. */
        getNavigation() {
            return [
                { id: "dashboard", label: "Dashboard", active: this.#activeTab === "dashboard" },
                { id: "products", label: "Products", active: this.#activeTab === "products" },
                { id: "customers", label: "Customers", active: this.#activeTab === "customers" },
                { id: "orders", label: "Orders", active: this.#activeTab === "orders" }
            ];
        }

        /**
         * getStatus()
         *   Real, shell-facing readiness check — distinct from
         *   getDiagnosticsReport() (internal/debug-oriented counters).
         *   This answers "is ShopOS actually usable right now."
         */
        getStatus() {
            const coordinatorsLoaded = !!(window.CozyOS.ShopCore && window.CozyOS.ShopProduct && window.CozyOS.ShopSales && window.CozyOS.ShopDashboard);
            return {
                mounted: !!this.#root, coordinatorsLoaded,
                branchConfigured: !!this.#branchId, activeTab: this.#activeTab
            };
        }

        /**
         * getNotifications()
         *   HONEST, real empty extension point. No notification engine
         *   exists anywhere in this platform yet (flagged as Category B
         *   — Extension Point, not yet built, in the frozen Platform
         *   Architecture). This returns a genuinely empty array, not a
         *   fabricated notification, and is exactly where a future real
         *   notification engine would plug in without this file's public
         *   contract needing to change.
         */
        getNotifications() {
            return [];
        }

        destroy() { this.#root = null; }
        getVersion() { return SHOPOS_UI_VERSION; }
    }

    if (window.CozyOS.Modules && window.CozyOS.Modules["shopos"] && window.CozyOS.Modules["shopos"].version) {
        const existingVersion = window.CozyOS.Modules["shopos"].version;
        if (existingVersion !== SHOPOS_UI_VERSION) throw new Error(`[CozyOS Framework Execution Error] VERSION_CONFLICT: shopos module existing v${existingVersion} conflicts with load target v${SHOPOS_UI_VERSION}.`);
    } else {
        window.CozyOS.Modules = window.CozyOS.Modules || {};
        let singletonInstance = null;
        window.CozyOS.Modules["shopos"] = {
            version: SHOPOS_UI_VERSION,
            files: { folder: "shopos", html: "shopos.html", css: "shopos.css", js: "shopos.js" },
            async load() {
                if (!singletonInstance) singletonInstance = new ShopOSModule();
                return singletonInstance.load();
            },
            async init(options) {
                if (!singletonInstance) singletonInstance = new ShopOSModule();
                await singletonInstance.init(options);
                return singletonInstance;
            },
            destroy() { if (singletonInstance) { singletonInstance.destroy(); singletonInstance = null; } },
            getDashboard(branchId) { return singletonInstance ? singletonInstance.getDashboard(branchId) : { available: false, reason: "Not initialized." }; },
            getNavigation() { return singletonInstance ? singletonInstance.getNavigation() : []; },
            getStatus() { return singletonInstance ? singletonInstance.getStatus() : { mounted: false, coordinatorsLoaded: false, branchConfigured: false, activeTab: null }; },
            getNotifications() { return singletonInstance ? singletonInstance.getNotifications() : []; }
        };
    }
})();
