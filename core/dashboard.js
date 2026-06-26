/**
 * Append this data object specification layout section into your
 * existing core/dashboard.js COMPONENT_REGISTRY lookup array dictionary.
 */
small_business_dashboard_matrix: {
    scope: "sales.write",
    title: "CozyOS Retail & Duka Intelligence Matrix",
    html: `
        <div class="cozy-dashboard-card" style="border-top: 3px solid #C5A059; background: #0b0d0f; padding: 20px; border-radius: 6px;">
            <h3 style="color: #C5A059; margin: 0 0 15px 0; font-size: 16px; letter-spacing: 0.5px;">🏪 Retail Duka Analytics</h3>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 12px;" id="smallbiz-dynamic-rendering-target">
                <div>
                    <span style="font-size: 11px; color: #777; display: block; uppercase;">Today's Sales</span>
                    <strong style="font-size: 18px; color: #fff;" id="sb-sales-val">KES 0.00</strong>
                </div>
                <div>
                    <span style="font-size: 11px; color: #777; display: block; uppercase;">Net Profit</span>
                    <strong style="font-size: 18px; color: #10b981;" id="sb-profit-val">KES 0.00</strong>
                </div>
                <div>
                    <span style="font-size: 11px; color: #777; display: block; uppercase;">Cash Reserve</span>
                    <strong style="font-size: 18px; color: #3b82f6;" id="sb-cash-val">KES 0.00</strong>
                </div>
                <div>
                    <span style="font-size: 11px; color: #777; display: block; uppercase;">M-Pesa Pool</span>
                    <strong style="font-size: 18px; color: #8b5cf6;" id="sb-mpesa-val">KES 0.00</strong>
                </div>
            </div>
            <hr style="border: 0; border-top: 1px solid #1f242b; margin: 15px 0;">
            <div style="font-size: 12px; color: #aaa;" id="sb-stock-alerts">
                ✨ All inventory metrics reconciled and synchronized.
            </div>
        </div>
    `
}

/**
 * RENDER CONTROLLER FUNCTION HOOK
 * Call this function upon dashboard page initialization to inject the state values.
 */
export async function populateSmallBizDashboardUiValues() {
    if (!window.CozyOS?.SmallBiz) return;
    
    await window.CozyOS.SmallBiz.init();
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
