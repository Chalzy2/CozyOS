/**
 * CozyOS Quarry Manager Enterprise v2.2.1 - Dedicated Production Module
 * File: /core/modules/quarry/quarry-linker.js
 * Extends CozyBaseLinker v2.4.1 (route/authContext/payload only)
 */

(function () {
    'use strict';

    const QUARRY_ROUTES = {
        GET_METRICS: "get_executive_metrics",
        COMMIT_PRODUCTION: "process_production_entry"
    };

    const QUARRY_EVENTS = {
        DATA_CHANGED: "QUARRY_DATA_CHANGED"
    };

    class QuarryLinker extends window.CozyBaseLinker {
        constructor() {
            super("QuarryManager", QUARRY_ROUTES, QUARRY_EVENTS);
        }

        buildDomCache() {
            return {
                ...super.buildDomCache(),
                productionForm: document.getElementById('production-form'),
                pDate: document.getElementById('p-date'),
                pShift: document.getElementById('p-shift'),
                pMachine: document.getElementById('p-machine'),
                pOperator: document.getElementById('p-operator'),
                pParcel: document.getElementById('p-parcel'),
                pMaterial: document.getElementById('p-material'),
                pQty: document.getElementById('p-qty'),
                pPrice: document.getElementById('p-price'),

                dashboardStreamTable: document.getElementById('dashboard-stream-tbody'),
                insightBanner: document.querySelector('.insight-banner'),
                chatBox: document.getElementById('chat-box'),
                chatInput: document.getElementById('chat-input')
            };
        }

        bindModuleInterfaceEvents() {
            if (this.DOM.productionForm) {
                this.DOM.productionForm.addEventListener('submit', (e) =>
                    this.handleProductionSubmission(e)
                );

                this.enableAutosave(this.DOM.productionForm, 'quarry-production');
            }
        }

        onModuleReady() {
            this.refreshDashboardMetrics();
        }

        onDataChanged() {
            this.refreshDashboardMetrics();
        }

        async refreshDashboardMetrics() {
            try {
                const response = await this.engine.handle({
                    route: this.ACTIONS.GET_METRICS,
                    authContext: this.currentIdentity,
                    payload: { timestamp: new Date().toISOString() }
                });

                if (!response?.success) return;

                const data = response.data;

                this.updateKPI("stones-produced", `${data.stonesProducedToday} Stones`);
                this.updateKPI("revenue-today", `KSh ${data.revenueToday}`);
                this.updateKPI("profit-today", `KSh ${data.profitToday}`);
                this.updateKPI("active-workers", `${data.activeWorkersCount}`);
                this.updateKPI("active-machines", `${data.activeMachinesCount}`);
                this.updateKPI("outstanding-loans", `KSh ${data.outstandingLoansTotal}`);
                this.updateKPI("pending-deliveries", `${data.pendingDeliveriesCount}`);
                this.updateKPI("system-alerts", `${data.alertCount}`);

                this.renderTransactionTableStream(data.recentTransactions || []);

                if (this.DOM.insightBanner && data.aiGeneratedInsights) {
                    this.DOM.insightBanner.innerHTML =
                        `<strong>AI Insight:</strong> ${data.aiGeneratedInsights}`;
                }
            } catch (err) {
                this.handleSystemError("Metrics Load Failed", err);
            }
        }

        renderTransactionTableStream(transactions) {
            if (!this.DOM.dashboardStreamTable) return;

            this.DOM.dashboardStreamTable.innerHTML = "";

            if (!transactions.length) {
                this.DOM.dashboardStreamTable.innerHTML =
                    `<tr><td colspan="7">No records found</td></tr>`;
                return;
            }

            transactions.forEach(tx => {
                const row = document.createElement("tr");
                row.innerHTML = `
                    <td>${tx.timestamp}</td>
                    <td>${tx.shift}</td>
                    <td>${tx.machineId}</td>
                    <td>${tx.stoneType}</td>
                    <td>${tx.quantity}</td>
                    <td>${tx.revenue}</td>
                    <td>${tx.profit}</td>
                `;
                this.DOM.dashboardStreamTable.appendChild(row);
            });
        }

        async handleProductionSubmission(event) {
            event.preventDefault();

            const btn = this.DOM.productionForm.querySelector('button[type="submit"]');
            this.renderLoadingState(btn, true, "Processing...");

            const payload = {
                date: this.DOM.pDate.value,
                shift: this.DOM.pShift.value,
                machineId: this.DOM.pMachine.value,
                operator: this.DOM.pOperator.value,
                parcel: this.DOM.pParcel.value,
                stoneType: this.DOM.pMaterial.value,
                outputTons: parseFloat(this.DOM.pQty.value),
                breakdownOccurred: false,
                timestamp: new Date().toISOString()
            };

            try {
                const outcome = await this.engine.handle({
                    route: this.ACTIONS.COMMIT_PRODUCTION,
                    authContext: this.currentIdentity,
                    payload
                });

                this.renderLoadingState(btn, false);

                if (outcome?.success || outcome?.queued) {
                    this.clearAutosaveDraft("quarry-production");
                    this.triggerDataChangedSync();

                    this.showToastNotification(
                        outcome.queued
                            ? "Saved Offline - Pending Sync"
                            : "Production saved successfully",
                        "success"
                    );
                } else {
                    this.showToastNotification(outcome.message || "Rejected", "error");
                }
            } catch (err) {
                this.renderLoadingState(btn, false);
                this.handleSystemError("Production Failed", err);
            }
        }

        async handleAiAdvisorQuery() {
            const text = this.DOM.chatInput.value.trim();
            if (!text || !window.CozyOS?.AI?.ask) return;

            this.DOM.chatInput.value = "";

            try {
                const res = await window.CozyOS.AI.ask({
                    module: "quarry",
                    prompt: text
                });

                const msg = res?.message || "No response";

                if (this.DOM.chatBox) {
                    const div = document.createElement("div");
                    div.innerText = msg;
                    this.DOM.chatBox.appendChild(div);
                }
            } catch (err) {
                this.handleSystemError("AI Error", err);
            }
        }
    }

    const instance = new QuarryLinker();
    instance.init();

    window.handleChatSubmit = () => instance.handleAiAdvisorQuery();

})();
