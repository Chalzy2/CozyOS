/**
 * ── COZYOS DYNAMIC DASHBOARD RENDERER BOOTSTRAPPER ──
 * VERSION: 15.0.0 (Production Performance Isolation Script)
 * DOMAIN: core/dashboard.js
 */

import Permissions from './permissions.js';
import Logger from './logger.js';

export default {
    /**
     * DYNAMIC DOM LAYER COMPILING PIPELINE
     * Mounts only the precise user dashboard view context, completely skipping forbidden components.
     */
    async bootstrapDashboardShell() {
        Logger.info("Shell Engine", "Beginning dynamic system dashboard rendering loop...");

        const navigationContainer = document.getElementById("cozy-sidebar-nav");
        const dashboardGridContainer = document.getElementById("cozy-dashboard-grid");

        if (!navigationContainer || !dashboardGridContainer) {
            Logger.warn("Shell Engine", "Awaiting viewport structure DOM bindings anchor nodes.");
            return;
        }

        // Clear out fallback templates completely to prevent markup flashing
        navigationContainer.innerHTML = "";
        dashboardGridContainer.innerHTML = "";

        // 1. Dynamic Menu Sidebar Item Iteration Loop
        const userAllowedModules = Permissions.getAllowedModules(); // Array format: ['Students', 'Teachers', 'AI']
        
        userAllowedModules.forEach(modKey => {
            const navItem = document.createElement("li");
            navItem.className = "cozy-nav-item";
            navItem.innerHTML = `<a href="${modKey.toLowerCase()}.html" class="nav-link"><span>${modKey}</span></a>`;
            navigationContainer.appendChild(navItem);
        });

        // 2. Dynamic Interface Dashboard Component Grid Card Injection Loop
        const userAllocatedCards = Permissions.getDashboardCards(); // Array format: [{id:'card_fees', label:'Fees Tracker'}]
        
        userAllocatedCards.forEach(card => {
            const cardEl = document.createElement("div");
            cardEl.className = "cozy-dashboard-card premium-accent";
            cardEl.id = card.id;
            cardEl.innerHTML = `
                <div class="card-header"><h4>${card.label}</h4></div>
                <div class="card-content-viewport" id="viewport_${card.id}">
                    <p class="placeholder-text">Syncing modular parameters...</p>
                </div>
            `;
            dashboardGridContainer.appendChild(cardEl);
        });

        Logger.info("Shell Engine", `Dynamic Shell Build Complete. Mounted [${userAllowedModules.length}] modules securely.`);
    }
};
