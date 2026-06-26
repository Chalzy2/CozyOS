/**
 * ── COZYOS CENTRAL INTERFACE DASHBOARD MATRICES COMPILER ──
 * DOMAIN: core/dashboard.js
 * REFERENCE: CozyOS_Universal_Session_Identity_Kernel_Production_Upgrade.pdf
 */

import Permissions from './permissions.js';

// 1. ADD THE RETAIL & AGENT INTERFACE EMBED TO YOUR COMPONENT DICTIONARY
const COMPONENT_REGISTRY = {
    // Legacy registry entries (school analytics, etc.) remain untouched here...

    // All-Inclusive Small Business & M-Pesa Agent Dashboard Card Element
    small_business_agent_matrix: {
        scope: "sales.write", 
        title: "Retail & M-Pesa Agent Control Panel",
        html: `
            <div class="cozy-dashboard-card" style="border-top: 3px solid #C5A059; background: #0b0d0f; padding: 20px; border-radius: 6px;">
                <h3 style="color: #C5A059; margin: 0 0 15px 0; font-size: 16px; letter-spacing: 0.5px;">🏪 Business & Agent Matrix</h3>
                
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 12px; margin-bottom: 15px;" id="smallbiz-dynamic-rendering-target">
                    <div>
                        <span style="font-size: 11px; color: #777; display: block; text-transform: uppercase;">Today's Sales</span>
                        <strong style="font-size: 18px; color: #fff;" id="sb-sales-val">KES 0.00</strong>
                    </div>
                    <div>
                        <span style="font-size: 11px; color: #777; display: block; text-transform: uppercase;">Net Profit</span>
                        <strong style="font-size: 18px; color: #10b981;" id="sb-profit-val">KES 0.00</strong>
                    </div>
                    <div>
                        <span style="font-size: 11px; color: #777; display: block; text-transform: uppercase;">Cash Reserve</span>
                        <strong style="font-size: 18px; color: #3b82f6;" id="sb-cash-val">KES 0.00</strong>
                    </div>
                    <div>
                        <span style="font-size: 11px; color: #777; display: block; text-transform: uppercase;">M-Pesa Pool</span>
                        <strong style="font-size: 18px; color: #8b5cf6;" id="sb-mpesa-val">KES 0.00</strong>
                    </div>
                </div>

                <div style="display: flex; gap: 10px; margin-bottom: 15px;">
                    <button onclick="window.CozyOS.MpesaAgent.triggerCameraHardware('qr')" style="flex:1; background:#161b22; color:#fff; border:1px solid #30363d; padding:8px; border-radius:4px; cursor:pointer; font-size:12px;">📷 Scan QR / Barcode</button>
                    <button onclick="window.CozyOS.MpesaAgent.triggerCameraHardware('id')" style="flex:1; background:#161b22; color:#fff; border:1px solid #30363d; padding:8px; border-radius:4px; cursor:pointer; font-size:12px;">🪪 Scan ID / Passport</button>
                </div>

                <hr style="border: 0; border-top: 1px solid #1f242b; margin: 15px 0;">
                <div style="font-size: 12px; color: #aaa;" id="sb-stock-alerts">
                    ✨ System synchronized and monitoring inventory...
                </div>
            </div>
        `
    }
};

export default {
    /**
     * BOOTSTRAP DASHBOARD VIEWS
     * Compiles layout blocks safely based on active session access levels.
     */
    async bootstrapDashboardShell(session = window.CozyOS.Session) {
        if (!session) throw new Error("Interface Boot Error: Active user operational session state untraceable.");

        const navContainer = document.getElementById("cozy-sidebar-nav");
        const gridContainer = document.getElementById("cozy-dashboard-grid");

        if (!navContainer || !gridContainer) return;

        // Clear layout canvas to avoid duplicate interface artifacts
        navContainer.innerHTML = "";
        gridContainer.innerHTML = "";

        // Industry categorization verification filter array
        const businessTypes = ["school", "hotel", "church", "shop", "general", "restaurant", "retail"];

        // 2. RUN BACKGROUND DATA INITIALIZATION BEFORE THE INTERFACE LOOP RENDERS
        if (businessTypes.includes(session.industry.toLowerCase())) {
            if (window.CozyOS.SmallBiz?.init) {
                await window.CozyOS.SmallBiz.init();
            }
        }

        // Iterate through system layout definitions and check permission rules dynamically
        for (const [key, element] of Object.entries(COMPONENT_REGISTRY)) {
            
            if (Permissions.check(element.scope)) {
                
                // Mount Sidebar Items
                const navItem = document.createElement("li");
                navItem.innerHTML = `<a href="#${key}" style="display:block; color:#ccc; text-decoration:none; padding:10px 15px;">• ${element.title}</a>`;
                navContainer.appendChild(navItem);

                // Mount Card Elements to Grid Canvas Area
                const rangeWrapper = document.createElement("div");
                rangeWrapper.innerHTML = element.html;
                gridContainer.appendChild(rangeWrapper.firstElementChild);
            }
        }

        // 3. SECURELY POPULATE CACHED BALANCES INTO PLACEHOLDER NODES IMEDIENTLY AFTER MOUNT
        if (businessTypes.includes(session.industry.toLowerCase())) {
            this.populateRetailMetrics();
        }
    },

    /**
     * HYDRATE RETAIL AND OPERATION COUNTER LABELS
     */
    populateRetailMetrics() {
        if (!window.CozyOS?.SmallBiz) return;
        
        const data = window.CozyOS.SmallBiz.getMetrics();
        
        const salesEl = document.getElementById("sb-sales-val");
        const profitEl = document.getElementById("sb-profit-val");
        const cashEl = document.getElementById("sb-cash-val");
        const mpesaEl = document.getElementById("sb-mpesa-val");
        const alertEl = document.getElementById("sb-stock-alerts");
        
        if (salesEl) salesEl.innerText = `KES ${data.todaySales.toLocaleString()}`;
        if (profitEl) profitEl.innerText = `KES ${data.todayProfit.toLocaleString()}`;
        if (cashEl) cashEl.innerText = `KES ${data.cashSummary.toLocaleString()}`;
        if (mpesaEl) mpesaEl.innerText = `KES ${data.mpesaSummary.toLocaleString()}`;
        
        if (alertEl && data.lowStockItems.length > 0) {
            alertEl.innerHTML = `⚠️ <b>Low Stock Alerts:</b> ${data.lowStockItems.map(i => `${i.name} (${i.stock} left)`).join(', ')}`;
            alertEl.style.color = "#ff9800";
        }
    }
};
/**
 * ── COZYOS DYNAMIC INTERFACE CONTROLLER ──
 * FILE: core/dashboard.js
 */

function updateDashboardTelemetry() {
    // Queries memory space objects populated by the frozen kernel manager
    const plugins = window.CozyOS?.PluginMetadata || new Map();
    const enabledCount = Array.from(plugins.values()).filter(m => m.status === 'enabled').length;
    
    const countEl = document.getElementById('plugin-count');
    if (countEl) {
        countEl.innerText = `${enabledCount} Active`;
    }
}

async function executeDashboardIntent() {
    const inputEl = document.getElementById('terminal-input');
    const outputEl = document.getElementById('terminal-output');
    if (!inputEl || !outputEl) return;

    const query = inputEl.value.trim();
    if (!query) return;

    // Log the user's input line immediately inside the viewport console
    outputEl.innerHTML += `<div style="color: #ffffff; margin-top: 6px;">&gt; ${query}</div>`;
    inputEl.value = '';

    try {
        // Enforces secure pipeline entry by communicating directly with the centralized global layers
        if (window.CozyOS && typeof window.CozyOS.executeVoiceIntent === 'function') {
            const response = await window.CozyOS.executeVoiceIntent(query);
            outputEl.innerHTML += `<div style="color: var(--accent-gold); margin-top: 2px;">${response.responseText}</div>`;
        } else {
            // Development fallback log lines if running without a live kernel session attachment
            outputEl.innerHTML += `<div style="color: var(--text-secondary); margin-top: 2px;">💡 Kernel Gateway Sandbox: Intent captured successfully. App running decoupled from central cluster layers.</div>`;
        }
    } catch (e) {
        outputEl.innerHTML += `<div style="color: #dc3545; margin-top: 2px;">🚨 Core Exception Fault: ${e.message}</div>`;
    }
    
    // Auto-scroll screen down smoothly to track fast metrics lookups
    outputEl.scrollTop = outputEl.scrollHeight;
}

// Attach listeners safely to DOM element triggers once loaded
window.addEventListener('DOMContentLoaded', () => {
    updateDashboardTelemetry();

    const executeBtn = document.getElementById('execute-btn');
    const inputEl = document.getElementById('terminal-input');

    if (executeBtn) executeBtn.addEventListener('click', executeDashboardIntent);
    if (inputEl) {
        inputEl.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                executeDashboardIntent();
            }
        });
    }
});
window.CozyOS.DashboardShell = {
    bootstrap: async () => { return await module.exports.default.bootstrapDashboardShell(); },
    populateRetailMetrics: () => { module.exports.default.populateRetailMetrics(); }
};
