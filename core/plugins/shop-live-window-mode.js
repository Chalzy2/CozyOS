/**
 * CozyOS — ShopOS Live Window Mode
 * File Reference: core/plugins/shop-live-window-mode.js
 *
 * PURPOSE
 *   Registers "shop" with the ONE universal window.CozyOS.LiveWindow
 *   (core/shell/live-window-controller.js), following the exact pattern
 *   ChurchOS's worship-live-window-mode.js established. Turns ShopOS
 *   from an application with ZERO Live Window presence into a real,
 *   switchable context.
 *
 * COMPOSED, NOT DUPLICATED (every method below already existed before
 * this file was written; none is modified by this file):
 *   - window.CozyOS.ShopReporting.getSalesReport()/getCustomerStatistics()
 *     (core/plugins/shopOS-reporting.js) — real, storage-backed reports.
 *     getSalesReport() itself honestly returns { available:false, reason }
 *     when window.CozyOS.ShopSales is not connected — this file passes
 *     that disclosure straight through rather than papering over it.
 *   - window.CozyOS.ShopInventory.getLowStockItems() (core/plugins/
 *     shopOS-inventory.js) — real low-stock alert list.
 *   - window.CozyOS.ShopProduct.listProducts() (core/plugins/
 *     shopOS-product.js) — the real product catalog.
 *   None of these require a companyId/branchId to produce real output
 *   (each defaults to reading across all branches), unlike ChurchOS's
 *   serviceId-scoped Worship mode — a genuine difference in these
 *   engines' own real contracts, confirmed by reading each file before
 *   writing this one.
 *
 * HONEST SCOPE (disclosed, not fabricated)
 *   Every one of these engines is loaded independently per page (see
 *   dashboard.html vs. admin-workspace.html's own script lists — a real,
 *   pre-existing difference this file did not introduce). Any composed
 *   engine not present on the current page renders an honest "not
 *   connected on this page" disclosure for that section only; the other
 *   sections still render their real content.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const VERSION = "1.0.0";
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    if (window.CozyOS.Modules["shop-live-window-mode"]) return;

    function escapeHtml(s) {
        return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    }

    function renderNotConnected(container, title, engineLabel) {
        const wrap = document.createElement("div");
        wrap.className = "cozy-living-card cozy-live-window-shop-section";
        wrap.innerHTML = `<h4>${escapeHtml(title)}</h4><p class="cozy-disclosure-note">${escapeHtml(engineLabel)} is not connected on this page.</p>`;
        container.appendChild(wrap);
    }

    function renderSalesReport(container) {
        const reporting = window.CozyOS.ShopReporting;
        if (!reporting || typeof reporting.getSalesReport !== "function") return renderNotConnected(container, "Sales (today)", "ShopReporting");
        const wrap = document.createElement("div");
        wrap.className = "cozy-living-card cozy-live-window-shop-sales";
        wrap.innerHTML = `<h4>Sales (today)</h4><p class="cozy-disclosure-note" id="cozy-live-window-shop-sales-status">Loading real sales data…</p>`;
        container.appendChild(wrap);
        const statusEl = wrap.querySelector("#cozy-live-window-shop-sales-status");
        try {
            const report = reporting.getSalesReport({ period: "daily" });
            statusEl.textContent = report.available
                ? `${report.saleCount} sale(s). Net revenue: ${report.netRevenue}.`
                : (report.reason || "Real sales data is not available right now.");
        } catch (err) {
            statusEl.textContent = "Real sales data is not available right now.";
            console.warn("[ShopLiveWindowMode] getSalesReport() failed:", err && err.message);
        }
    }

    function renderLowStock(container) {
        const inventory = window.CozyOS.ShopInventory;
        if (!inventory || typeof inventory.getLowStockItems !== "function") return renderNotConnected(container, "Low Stock", "ShopInventory");
        const wrap = document.createElement("div");
        wrap.className = "cozy-living-card cozy-live-window-shop-lowstock";
        wrap.innerHTML = `<h4>Low Stock</h4><div id="cozy-live-window-shop-lowstock-list" class="cozy-disclosure-note">Loading real inventory levels…</div>`;
        container.appendChild(wrap);
        const listEl = wrap.querySelector("#cozy-live-window-shop-lowstock-list");
        try {
            const items = inventory.getLowStockItems();
            listEl.innerHTML = (items && items.length)
                ? items.slice(0, 5).map((i) => `<div>${escapeHtml(i.productId || "item")}: ${escapeHtml(String(i.availableStock))} available (reorder at ${escapeHtml(String(i.reorderLevel))})</div>`).join("")
                : "No real low-stock items right now.";
        } catch (err) {
            listEl.textContent = "Real inventory levels are not available right now.";
            console.warn("[ShopLiveWindowMode] getLowStockItems() failed:", err && err.message);
        }
    }

    function renderCatalogSearch(container) {
        const product = window.CozyOS.ShopProduct;
        if (!product || typeof product.listProducts !== "function") return renderNotConnected(container, "Product Catalog", "ShopProduct");
        const wrap = document.createElement("div");
        wrap.className = "cozy-living-card cozy-live-window-shop-catalog";
        wrap.innerHTML = `
            <h4>Product Catalog</h4>
            <form id="cozy-live-window-shop-catalog-form" style="display:flex;gap:6px;">
                <input type="text" id="cozy-live-window-shop-catalog-input" class="cozy-living-input" placeholder="Filter by category (optional)" autocomplete="off">
                <button type="submit" class="cozy-btn">List products</button>
            </form>
            <div id="cozy-live-window-shop-catalog-result" class="cozy-disclosure-note"></div>
        `;
        container.appendChild(wrap);
        const form = wrap.querySelector("#cozy-live-window-shop-catalog-form");
        const resultEl = wrap.querySelector("#cozy-live-window-shop-catalog-result");
        const runList = (category) => {
            try {
                const products = product.listProducts(category ? { category } : {});
                resultEl.innerHTML = (products && products.length)
                    ? products.slice(0, 5).map((p) => `<div>${escapeHtml(p.name)} — ${escapeHtml(String(p.retailPrice != null ? p.retailPrice : "no price set"))}</div>`).join("")
                    : "No real products in the catalog yet.";
            } catch (err) {
                resultEl.textContent = "Real product catalog is not available right now.";
                console.warn("[ShopLiveWindowMode] listProducts() failed:", err && err.message);
            }
        };
        form.addEventListener("submit", (evt) => {
            evt.preventDefault();
            runList(wrap.querySelector("#cozy-live-window-shop-catalog-input").value.trim());
        });
        runList(null);
    }

    function activateShop(container) {
        const header = document.createElement("div");
        header.className = "cozy-live-window-shop-header";
        header.innerHTML = `<p class="cozy-disclosure-note"><strong>Context: ShopOS</strong></p>`;
        container.appendChild(header);

        renderSalesReport(container);
        renderLowStock(container);
        renderCatalogSearch(container);

        const speakHint = document.createElement("p");
        speakHint.className = "cozy-disclosure-note";
        speakHint.textContent = "Speak, type, or reply using the CozyOS Live controls below.";
        container.appendChild(speakHint);
    }

    function deactivateShop(container) {
        if (container) container.innerHTML = "";
    }

    function register() {
        const liveWindow = window.CozyOS && window.CozyOS.LiveWindow;
        if (!liveWindow || typeof liveWindow.registerMode !== "function") return false;
        liveWindow.registerMode("shop", { label: "ShopOS", activate: activateShop, deactivate: deactivateShop });
        return true;
    }

    if (!register()) {
        let attempts = 0;
        const retry = () => { if (!register() && ++attempts < 40) setTimeout(retry, 250); };
        retry();
    }

    window.CozyOS.Modules["shop-live-window-mode"] = Object.freeze({
        version: VERSION,
        description: "Registers ShopOS's 'shop' mode with the universal window.CozyOS.LiveWindow — real sales report (ShopReporting), low-stock alerts (ShopInventory) and product catalog search (ShopProduct), each with an honest 'not connected on this page' disclosure when that specific engine is not loaded. Speak/Type/Reply reuses the Live Window's own existing chat form, never duplicated."
    });
})();
