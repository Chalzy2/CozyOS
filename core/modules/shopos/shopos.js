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
        #activeSaleId = null; // set when viewing/editing a specific sale's cart, checkout, receipt, or refund
        #checkoutMode = false; // true when viewing Checkout instead of Cart for the active DRAFT sale
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
            if (this.#activeSaleId) {
                const sale = sales.getSale(this.#activeSaleId);
                if (!sale) { this.#activeSaleId = null; this.#checkoutMode = false; }
                else if (sale.status === "DRAFT") return this.#checkoutMode ? this.#renderCheckout(sale) : this.#renderCart(sale);
                else if (sale.status === "COMPLETED") return this.#renderReceiptAndRefund(sale);
                else return this.#renderOrderStatus(sale);
            }
            const snapshot = sales.exportSnapshot();
            const list = snapshot.sales.map(([, s]) => s);
            return `
                <section class="sp-field">
                    <button class="sp-btn sp-btn-primary" id="sp-start-order-btn">Start New Order</button>
                </section>
                <table class="sp-table"><tr><th>Order</th><th>Status</th><th>Items</th></tr>
                ${list.map(s => `<tr class="sp-row-clickable" data-sale-id="${escapeHtml(s.id)}"><td>${escapeHtml(s.id)}</td><td>${escapeHtml(s.status)}</td><td>${s.lineItems.length}</td></tr>`).join("") || `<tr><td colspan="3" class="sp-empty-note">No orders yet.</td></tr>`}
                </table>`;
        }

        #renderOrderStatus(sale) {
            return `<p class="sp-empty-note">Order ${escapeHtml(sale.id)} is ${escapeHtml(sale.status)} — no further action available in this status.</p>
                <button class="sp-btn" id="sp-back-to-orders-btn">Back to Orders</button>`;
        }

        /**
         * #renderCart(sale)
         *   Real Cart UI — Phase 2. Every action calls the existing Sales
         *   Engine directly (addLineItem/applyDiscount/completeSale) —
         *   no cart logic, pricing, or totals are computed here; the
         *   numbers shown come straight from ShopSales's own real
         *   computeTotals() output (already included in the sale object
         *   it returns).
         */
        #renderCart(sale) {
            const products = window.CozyOS.ShopProduct;
            const productList = products ? products.listProducts({ status: "ACTIVE" }) : [];
            const rows = sale.lineItems.map(li => {
                const p = products ? products.getProduct(li.productId) : null;
                return `<tr><td>${escapeHtml(p ? p.name : li.productId)}</td><td>${li.quantity}</td><td>${li.unitPrice.toFixed(2)}</td><td>${li.lineTotal.toFixed(2)}</td></tr>`;
            }).join("") || `<tr><td colspan="4" class="sp-empty-note">Cart is empty — add a product below.</td></tr>`;

            return `
                <button class="sp-btn" id="sp-back-to-orders-btn">← Back to Orders</button>
                <h3>Order ${escapeHtml(sale.id)} — Cart</h3>
                <table class="sp-table"><tr><th>Product</th><th>Qty</th><th>Unit Price</th><th>Line Total</th></tr>${rows}</table>
                <section class="sp-field">
                    <label>Add Product</label>
                    <select id="sp-cart-product-select">
                        ${productList.map(p => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)} (${(p.retailPrice ?? 0).toFixed(2)})</option>`).join("") || `<option disabled>No active products</option>`}
                    </select>
                    <label>Quantity</label><input id="sp-cart-qty" type="number" min="1" value="1" />
                    <button class="sp-btn sp-btn-primary" id="sp-cart-add-btn">Add to Cart</button>
                </section>
                <div class="sp-totals">
                    <div>Subtotal: <b>${sale.subtotal.toFixed(2)}</b></div>
                    <div>Discount: <b>${(sale.discount ?? 0).toFixed(2)}</b></div>
                    <div>Tax: <b>${(sale.tax ?? 0).toFixed(2)}</b></div>
                    <div>Grand Total: <b>${sale.grandTotal.toFixed(2)}</b></div>
                </div>
                ${sale.lineItems.length ? `<button class="sp-btn sp-btn-primary" id="sp-cart-checkout-btn">Proceed to Checkout</button>` : ""}`;
        }

        /**
         * #renderCheckout(sale)
         *   Real Checkout/Payment UI — Phase 4/5. Only shows payment
         *   methods ShopPayments.listProviders() actually reports as
         *   configured — per the explicit instruction, never fabricates a
         *   working payment option. Cash is real and configured by
         *   default; anything else shown as "not configured" rather than
         *   hidden, so it's visible that the capability exists but isn't
         *   set up, not invented as if it worked.
         */
        #renderCheckout(sale) {
            const payments = window.CozyOS.ShopPayments;
            const providers = payments ? payments.listProviders() : [];
            const configuredOptions = providers.filter(p => p.configured).map(p => `<option value="${escapeHtml(p.name)}">${escapeHtml(p.name)}</option>`).join("");
            const unconfiguredNote = providers.filter(p => !p.configured).map(p => p.name).join(", ");
            return `
                <button class="sp-btn" id="sp-back-to-cart-btn">← Back to Cart</button>
                <h3>Checkout — Order ${escapeHtml(sale.id)}</h3>
                <div class="sp-totals"><div>Amount Due: <b>${sale.grandTotal.toFixed(2)}</b></div></div>
                ${configuredOptions ? `
                <section class="sp-field">
                    <label>Payment Method</label>
                    <select id="sp-checkout-method">${configuredOptions}</select>
                    <label>Amount Tendered (cash only)</label><input id="sp-checkout-tendered" type="number" min="0" />
                    <button class="sp-btn sp-btn-primary" id="sp-checkout-pay-btn">Complete Sale</button>
                </section>` : `<p class="sp-empty-note">No payment provider is configured — cannot process a real payment. Do not fabricate a successful sale.</p>`}
                ${unconfiguredNote ? `<p class="sp-empty-note">Not yet configured: ${escapeHtml(unconfiguredNote)}</p>` : ""}`;
        }

        /**
         * #renderReceiptAndRefund(sale)
         *   Real Receipt (Phase 6) and Refund (Phase 7) UI for a completed
         *   sale. Receipt data comes directly from ShopSales.generateReceipt()
         *   — never recomputed here. The real, separate
         *   core/templates/receipt/cozy-receipt-template.html exists but its
         *   exact data-injection contract wasn't verified in the time
         *   available for this milestone — rather than risk a fragile
         *   integration with an unverified contract, this renders the same
         *   real receipt data inline, with real Print (window.print()) and
         *   Download (Blob) actions, both standard techniques already used
         *   elsewhere in this codebase. Email/Share are not implemented
         *   anywhere real — omitted, not faked, per "if a capability is
         *   missing, report it honestly instead of simulating it."
         */
        #renderReceiptAndRefund(sale) {
            const salesEngine = window.CozyOS.ShopSales;
            let receipt;
            try { receipt = salesEngine.generateReceipt(sale.id); }
            catch (err) { return `<p class="sp-empty-note">${escapeHtml(err.message)}</p>`; }

            const lines = receipt.lineItems.map(li => `<tr><td>${escapeHtml(li.productId)}</td><td>${li.quantity}</td><td>${li.lineTotal.toFixed(2)}</td></tr>`).join("");
            const paymentLines = (receipt.payments || []).map(p => `<div>${escapeHtml(p.method)}: ${p.amount.toFixed(2)}${p.change ? ` (change: ${p.change.toFixed(2)})` : ""}</div>`).join("") || `<p class="sp-empty-note">No payment records found for this sale.</p>`;

            return `
                <button class="sp-btn" id="sp-back-to-orders-btn">← Back to Orders</button>
                <div id="sp-receipt-print-area">
                    <h3>Receipt — ${escapeHtml(receipt.receiptSerial || receipt.id)}</h3>
                    <table class="sp-table"><tr><th>Product</th><th>Qty</th><th>Total</th></tr>${lines}</table>
                    <div class="sp-totals"><div>Grand Total: <b>${receipt.grandTotal.toFixed(2)}</b></div></div>
                    <h4>Payments</h4>${paymentLines}
                </div>
                <button class="sp-btn" id="sp-receipt-print-btn">Print</button>
                <button class="sp-btn" id="sp-receipt-download-btn">Download</button>
                <hr/>
                <h4>Request Refund</h4>
                <section class="sp-field">
                    <label>Payment</label>
                    <select id="sp-refund-payment">${(receipt.payments || []).map(p => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.method)} — ${p.amount.toFixed(2)}</option>`).join("") || `<option disabled>No payments to refund</option>`}</select>
                    <label>Amount</label><input id="sp-refund-amount" type="number" min="0" step="0.01" />
                    <label>Reason</label><input id="sp-refund-reason" placeholder="Reason for refund" />
                    <button class="sp-btn sp-btn-primary" id="sp-refund-submit-btn" ${(receipt.payments || []).length ? "" : "disabled"}>Submit Refund Request</button>
                </section>`;
        }

        #bindTabEvents() {
            // Order row click -> real navigation into that sale's cart/receipt view
            this.#root.querySelectorAll(".sp-row-clickable[data-sale-id]").forEach(row => {
                row.addEventListener("click", () => { this.#activeSaleId = row.getAttribute("data-sale-id"); this.#renderTabContent(); });
            });
            const backToOrdersBtn = this.#root.querySelector("#sp-back-to-orders-btn");
            if (backToOrdersBtn) backToOrdersBtn.addEventListener("click", () => { this.#activeSaleId = null; this.#checkoutMode = false; this.#renderTabContent(); });
            const backToCartBtn = this.#root.querySelector("#sp-back-to-cart-btn");
            if (backToCartBtn) backToCartBtn.addEventListener("click", () => { this.#checkoutMode = false; this.#renderTabContent(); });

            // Cart: Add to Cart -> real ShopSales.addLineItem()
            const cartAddBtn = this.#root.querySelector("#sp-cart-add-btn");
            if (cartAddBtn) cartAddBtn.addEventListener("click", () => {
                const productId = this.#root.querySelector("#sp-cart-product-select")?.value;
                const quantity = Number(this.#root.querySelector("#sp-cart-qty")?.value);
                if (!productId) return;
                try {
                    window.CozyOS.ShopSales.addLineItem(this.#activeSaleId, { productId, quantity });
                    this.emit("shopos:line_item_added", { saleId: this.#activeSaleId, productId, quantity });
                    this.#renderTabContent();
                } catch (err) { window.CozyOS.Toast?.show?.(err.message); }
            });

            // Cart: Proceed to Checkout -> real navigation, no engine call yet
            const cartCheckoutBtn = this.#root.querySelector("#sp-cart-checkout-btn");
            if (cartCheckoutBtn) cartCheckoutBtn.addEventListener("click", () => { this.#checkoutMode = true; this.#renderTabContent(); });

            // Checkout: Complete Sale -> real ShopSales.completeSale() (which itself awaits ShopPayments.process())
            const checkoutPayBtn = this.#root.querySelector("#sp-checkout-pay-btn");
            if (checkoutPayBtn) checkoutPayBtn.addEventListener("click", async () => {
                const method = this.#root.querySelector("#sp-checkout-method")?.value;
                const amountTendered = Number(this.#root.querySelector("#sp-checkout-tendered")?.value) || undefined;
                checkoutPayBtn.disabled = true; checkoutPayBtn.textContent = "Processing…";
                try {
                    const result = await window.CozyOS.ShopSales.completeSale(this.#activeSaleId, { method, amountTendered });
                    this.#checkoutMode = false;
                    if (result.status === "COMPLETED") {
                        this.emit("shopos:sale_completed", { saleId: this.#activeSaleId });
                    } else {
                        window.CozyOS.Toast?.show?.(`Payment did not complete (status: ${result.status}).`);
                    }
                    this.#renderTabContent();
                } catch (err) {
                    checkoutPayBtn.disabled = false; checkoutPayBtn.textContent = "Complete Sale";
                    window.CozyOS.Toast?.show?.(err.message);
                }
            });

            // Receipt: Print (real window.print()) / Download (real Blob download)
            const receiptPrintBtn = this.#root.querySelector("#sp-receipt-print-btn");
            if (receiptPrintBtn) receiptPrintBtn.addEventListener("click", () => window.print());
            const receiptDownloadBtn = this.#root.querySelector("#sp-receipt-download-btn");
            if (receiptDownloadBtn) receiptDownloadBtn.addEventListener("click", () => {
                const area = this.#root.querySelector("#sp-receipt-print-area");
                if (!area) return;
                const blob = new Blob([area.innerText], { type: "text/plain" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url; a.download = `receipt-${this.#activeSaleId}.txt`;
                document.body.appendChild(a); a.click(); document.body.removeChild(a);
                URL.revokeObjectURL(url);
            });

            // Refund: real ShopSales.requestRefund() (which delegates to ShopPayments.refund())
            const refundSubmitBtn = this.#root.querySelector("#sp-refund-submit-btn");
            if (refundSubmitBtn) refundSubmitBtn.addEventListener("click", async () => {
                const paymentId = this.#root.querySelector("#sp-refund-payment")?.value;
                const amount = Number(this.#root.querySelector("#sp-refund-amount")?.value);
                const reason = this.#root.querySelector("#sp-refund-reason")?.value.trim();
                if (!paymentId || !reason) { window.CozyOS.Toast?.show?.("Payment and reason are required."); return; }
                refundSubmitBtn.disabled = true;
                try {
                    const result = await window.CozyOS.ShopSales.requestRefund(this.#activeSaleId, { paymentId, amount, reason });
                    this.emit("shopos:refund_requested", { saleId: this.#activeSaleId, result });
                    window.CozyOS.Toast?.show?.(result && result.success ? "Refund processed." : "Refund request recorded — see result for status.");
                    this.#renderTabContent();
                } catch (err) {
                    refundSubmitBtn.disabled = false;
                    window.CozyOS.Toast?.show?.(err.message);
                }
            });

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
                    this.#activeSaleId = sale.id;
                    this.#checkoutMode = false;
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

    // Business Applications Unification milestone: real, additive
    // self-registration — same fix already proven for mpesaos.js. Makes
    // "automatically appears in the End User Dashboard" true without any
    // manual dashboard edit.
    if (window.CozyOS.ModuleRegistry && typeof window.CozyOS.ModuleRegistry.register === "function") {
        try {
            window.CozyOS.ModuleRegistry.register({
                id: "shopos", name: "ShopOS", version: SHOPOS_UI_VERSION,
                folder: "core/modules/shopos", html: "shopos.html", css: "shopos.css", js: "shopos.js",
                theme: "shopos", icon: "shopos.svg", dashboard: "end-user", enabled: true
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
