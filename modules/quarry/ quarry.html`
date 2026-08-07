<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CozyOS — Quarry Business Suite</title>
    <style>
        :root {
            --bg-primary: #0f0f11;
            --bg-secondary: #16161a;
            --bg-tertiary: #212126;
            --accent-color: #dca54a;
            --text-main: #f3f4f6;
            --text-muted: #9ca3af;
            --border-color: #2b2b35;
            --success: #10b981;
            --warning: #f59e0b;
            --danger: #ef4444;
        }

        * { box-sizing: border-box; margin: 0; padding: 0; font-family: monospace; }
        body { background-color: var(--bg-primary); color: var(--text-main); font-size: 13px; }
        
        .statusbar { background: var(--bg-secondary); border-bottom: 1px solid var(--border-color); padding: 8px 16px; display: flex; justify-content: space-between; align-items: center; font-size: 11px; }
        .status-pill { display: inline-flex; align-items: center; gap: 6px; background: var(--bg-tertiary); padding: 3px 8px; border-radius: 4px; border: 1px solid var(--border-color); }
        .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--success); }
        .dot.offline { background: var(--warning); }
        .dot.syncing { background: var(--accent-color); animation: pulse 1s infinite alternate; }

        @keyframes pulse { from { opacity: 0.4; } to { opacity: 1; } }

        .shell { display: grid; grid-template-columns: 240px 1fr; min-height: calc(100vh - 33px); }
        .sidebar { background: var(--bg-secondary); border-right: 1px solid var(--border-color); padding: 20px 12px; display: flex; flex-direction: column; justify-content: space-between; }
        .nav-title { font-weight: bold; font-size: 15px; margin-bottom: 20px; letter-spacing: 1px; color: var(--accent-color); }
        .nav-group { display: flex; flex-direction: column; gap: 4px; }
        .nav-item { background: transparent; border: 1px solid transparent; color: var(--text-muted); padding: 8px 12px; border-radius: 4px; text-align: left; cursor: pointer; }
        .nav-item:hover, .nav-item.active { background: var(--bg-tertiary); color: var(--text-main); border-color: var(--border-color); }
        .nav-item.active { border-left: 2px solid var(--accent-color); }

        .workspace { padding: 24px; overflow-y: auto; }
        .view-section { display: none; }
        .view-section.active-view { display: block; }
        
        .view-header { margin-bottom: 20px; border-bottom: 1px dashed var(--border-color); padding-bottom: 12px; display: flex; justify-content: space-between; align-items: center; }
        .view-header h2 { font-size: 18px; color: var(--text-main); }

        .panel-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; margin-bottom: 20px; }
        .panel-card { background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 6px; padding: 16px; }
        .panel-title { font-size: 13px; font-weight: bold; margin-bottom: 12px; color: var(--accent-color); text-transform: uppercase; }

        .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px; }
        .form-group { margin-bottom: 10px; }
        .form-group label { display: block; font-size: 11px; color: var(--text-muted); margin-bottom: 4px; }
        .form-control { width: 100%; background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 4px; padding: 8px 10px; color: var(--text-main); font-family: monospace; }
        .form-control:focus { outline: none; border-color: var(--accent-color); }

        .btn { background: var(--bg-tertiary); color: var(--text-main); border: 1px solid var(--border-color); padding: 8px 14px; border-radius: 4px; cursor: pointer; font-weight: bold; }
        .btn:hover { background: var(--border-color); }
        .btn-accent { background: var(--accent-color); color: var(--bg-primary); border-color: var(--accent-color); }

        .ai-panel { border: 1px dashed var(--accent-color); background: rgba(220, 165, 74, 0.02); }
        .terminal { background: #050507; border: 1px solid var(--border-color); padding: 12px; height: 160px; overflow-y: auto; font-size: 12px; color: #34d399; margin-bottom: 10px; border-radius: 4px; white-space: pre-wrap; }

        /* --- Pending offline operations queue panel (QUEUE_CHANGED wiring) --- */
        .queue-pill { display:none; }
        .queue-pill.has-items { display:inline-flex; }
        .queue-list { list-style: none; max-height: 140px; overflow-y: auto; }
        .queue-list li { padding: 6px 8px; border-bottom: 1px solid var(--border-color); font-size: 12px; color: var(--text-muted); }
        .queue-empty { color: var(--text-muted); font-size: 12px; }
    </style>
</head>
<body>

    <div class="statusbar">
        <div>CozyOS // Node: `core/modules/quarry/quarry.html`</div>
        <div style="display: flex; gap: 12px;">
            <div class="status-pill"><div class="dot" id="net-dot"></div><span id="net-txt">Connectivity Kernel Pipeline Connected</span></div>
            <div class="status-pill">State: <span id="sync-state-txt" style="color:var(--text-main);">Idle</span></div>
            <div class="status-pill queue-pill" id="queue-pill">Pending Sync: <span id="queue-count-txt" style="color:var(--text-main);">0</span></div>
        </div>
    </div>

    <div class="shell">
        <aside class="sidebar">
            <div class="nav-group">
                <div class="nav-title">QUARRY Suite v2.1</div>
                <button class="nav-item active" onclick="setView('production', this)">📊 1. Production Core</button>
                <button class="nav-item" onclick="setView('inventory', this)">📦 2. Stock & Materials</button>
                <button class="nav-item" onclick="setView('sales', this)">🧾 3. Sales & Dispatch</button>
                <button class="nav-item" onclick="setView('finance', this)">💰 4. Cost Ledgers</button>
                <button class="nav-item" onclick="setView('machinery', this)">🚜 5. Heavy Machinery</button>
                <button class="nav-item" onclick="setView('hr', this)">👷 6. HR & Safety</button>
            </div>
            <div class="ai-panel panel-card" style="padding: 10px;">
                <div class="panel-title" style="font-size: 11px;">System AI Copilot</div>
                <input type="text" class="form-control" id="sidebar-ai-input" placeholder="Ask predictive insights..." style="margin-bottom:6px;">
                <button class="btn btn-accent" style="width:100%; padding:4px;" onclick="askQuarryAi()">Run Analysis</button>
            </div>
        </aside>

        <main class="workspace">
            <section id="view-production" class="view-section active-view">
                <div class="view-header"><h2>1. Site Production, Extraction & Crushing Log</h2></div>
                <div class="panel-grid">
                    <div class="panel-card">
                        <div class="panel-title">Payload Extraction Dispatch</div>
                        <div class="form-group"><label>Quarry Site Allocation</label><input type="text" class="form-control" id="prod-site" placeholder="e.g., North Face Pit C"></div>
                        <div class="form-row">
                            <div class="form-group"><label>Excavator ID</label><input type="text" class="form-control" id="prod-excavator" placeholder="EXC-04"></div>
                            <div class="form-group"><label>Loader Tracking</label><input type="text" class="form-control" id="prod-loader" placeholder="LDR-02"></div>
                        </div>
                        <div class="form-row">
                            <div class="form-group"><label>Crusher Output (Tons)</label><input type="number" class="form-control" id="prod-crusher" placeholder="45.2"></div>
                            <div class="form-group"><label>Truck Loading Queue Pos</label><input type="number" class="form-control" id="prod-queue" placeholder="3"></div>
                        </div>
                        <button class="btn btn-accent" onclick="commitProductionForm()">Save Production Transaction Block</button>
                    </div>
                    <div class="panel-card">
                        <div class="panel-title">Weighbridge & Daily Blasting Logs</div>
                        <div class="form-group"><label>Weighbridge Ticket Integration Ref</label><input type="text" class="form-control" placeholder="WB-90823-KM"></div>
                        <div class="form-group"><label>Daily Blasting Records</label><input type="text" class="form-control" placeholder="Ammonium Nitrate 150kg / Yield 1200T"></div>
                    </div>
                    <div class="panel-card">
                        <div class="panel-title">Pending Offline Operations</div>
                        <div id="queue-empty-msg" class="queue-empty">No pending operations queued.</div>
                        <ul class="queue-list" id="queue-list"></ul>
                    </div>
                </div>
            </section>

            <section id="view-inventory" class="view-section">
                <div class="view-header"><h2>2. Material Inventory Metrics (Current Stock Levels)</h2></div>
                <div class="panel-grid">
                    <div class="panel-card">
                        <div class="panel-title">Aggregate Base Breakdowns</div>
                        <div class="form-row"><div class="form-group"><label>Dust (Tons)</label><input type="number" class="form-control" value="450"></div><div class="form-group"><label>Hardcore (Tons)</label><input type="number" class="form-control" value="1200"></div></div>
                        <div class="form-row"><div class="form-group"><label>Ballast 0.75" (Tons)</label><input type="number" class="form-control" value="820"></div><div class="form-group"><label>Ballast 1.5" (Tons)</label><input type="number" class="form-control" value="340"></div></div>
                        <div class="form-row"><div class="form-group"><label>Building Stones (Pcs)</label><input type="number" class="form-control" value="15000"></div><div class="form-group"><label>Quarry Waste (Tons)</label><input type="number" class="form-control" value="2300"></div></div>
                    </div>
                </div>
            </section>

            <section id="view-sales" class="view-section"><div class="view-header"><h2>3. Customer Orders & Dispatch</h2></div></section>
            <section id="view-finance" class="view-section"><div class="view-header"><h2>4. Finance Records & Royalties</h2></div></section>
            <section id="view-machinery" class="view-section"><div class="view-header"><h2>5. Heavy Fleet Telemetry</h2></div></section>
            <section id="view-hr" class="view-section"><div class="view-header"><h2>6. HR, Safety & Attendance</h2></div></section>

            <div class="panel-card ai-panel" style="margin-top:20px;">
                <div class="panel-title">CozyOS System AI Terminal Bus Output</div>
                <div class="terminal" id="terminal-bus">>> [SYSTEM READY] Awaiting entry transaction dispatches...</div>
            </div>
        </main>
    </div>

    <script>
        "use strict";

        function setView(viewKey, btnElement) {
            document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active-view'));
            document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
            document.getElementById(`view-${viewKey}`).classList.add('active-view');
            btnElement.classList.add('active');
        }

        function appendLog(text) {
            const term = document.getElementById('terminal-bus');
            term.innerText += `\n>> ${text}`;
            term.scrollTop = term.scrollHeight;
        }

        async function commitProductionForm() {
            const dataObj = {
                site: document.getElementById('prod-site').value,
                excavatorId: document.getElementById('prod-excavator').value,
                loaderId: document.getElementById('prod-loader').value,
                crusherOutputTons: parseFloat(document.getElementById('prod-crusher').value) || 0,
                queuePos: parseInt(document.getElementById('prod-queue').value) || 0,
                timestamp: Date.now()
            };

            appendLog(`[ACTION] Dispatching payload block mutation via quarry proxy layer...`);
            
            if (window.CozyOS?.AI?.quarry) {
                try {
                    const result = await window.CozyOS.AI.quarry.save("production_log", dataObj);
                    appendLog(`[MUTATION ACKNOWLEDGED] Response status signature: ${result.status || 'COMMITTED'}`);
                } catch (e) {
                    appendLog(`[EXCEPTION] Dispatch route failed: ${e.message}`);
                }
            } else {
                appendLog(`[CRITICAL] Quarry integration handler instance is missing from window runtime.`);
            }
        }

        async function askQuarryAi() {
            const inputEl = document.getElementById('sidebar-ai-input');
            const promptStr = inputEl.value.trim();
            if (!promptStr) return;

            appendLog(`[AI CALL] Dispatching reasoning question vector: "${promptStr}"`);
            if (window.CozyOS?.AI?.quarry) {
                try {
                    const aiResponse = await window.CozyOS.AI.quarry.evaluate(promptStr, { auth: {} });
                    appendLog(`[AI ENGINE ANSWER]\n${JSON.stringify(aiResponse.payload || aiResponse)}`);
                } catch (e) {
                    appendLog(`[AI EXCEPTION] ${e.message}`);
                }
            }
            inputEl.value = '';
        }

        /**
         * Renders the pending offline operations list from a QUEUE_CHANGED
         * event detail payload. Purely event-driven — no polling is used.
         * Tolerant of whatever shape the existing CUCK pipeline sends
         * (count-only, or an items array) without assuming a new contract.
         */
        function renderQueueState(detail) {
            const pill = document.getElementById('queue-pill');
            const countTxt = document.getElementById('queue-count-txt');
            const listEl = document.getElementById('queue-list');
            const emptyMsg = document.getElementById('queue-empty-msg');

            const items = (detail && Array.isArray(detail.items)) ? detail.items : null;
            const count = (detail && typeof detail.count === 'number')
                ? detail.count
                : (detail && typeof detail.queueLength === 'number')
                    ? detail.queueLength
                    : (items ? items.length : null);

            if (count === null) {
                // Unknown shape — surface raw detail in the terminal so it's
                // visible for diagnostics, without breaking the UI.
                appendLog(`[QUEUE_CHANGED] Received event with unrecognized detail shape.`);
                return;
            }

            countTxt.innerText = String(count);
            pill.classList.toggle('has-items', count > 0);

            listEl.innerHTML = '';
            if (items && items.length) {
                items.forEach(item => {
                    const li = document.createElement('li');
                    li.innerText = item.label || item.collection || item.id || JSON.stringify(item);
                    listEl.appendChild(li);
                });
                emptyMsg.style.display = 'none';
            } else if (count > 0) {
                const li = document.createElement('li');
                li.innerText = `${count} operation(s) pending sync`;
                listEl.appendChild(li);
                emptyMsg.style.display = 'none';
            } else {
                emptyMsg.style.display = 'block';
            }
        }

        /**
         * 5. Bindings listening to normalized CUCK Custom Subscriptions
         */
        document.addEventListener('COZY_QUARRY_UI_NETWORK_ONLINE', () => {
            document.getElementById('net-dot').className = "dot";
            document.getElementById('net-txt').innerText = "Connectivity Engine: Active (Uplink Secure)";
        });

        document.addEventListener('COZY_QUARRY_UI_NETWORK_OFFLINE', () => {
            document.getElementById('net-dot').className = "dot offline";
            document.getElementById('net-txt').innerText = "Connectivity Engine: Air-Gapped (Local Preservation Mode)";
        });

        document.addEventListener('COZY_QUARRY_UI_SYNC_STARTED', () => {
            document.getElementById('net-dot').className = "dot syncing";
            document.getElementById('sync-state-txt').innerText = "Syncing Delta Changes...";
            appendLog("[KERNEL NOTIFICATION] Incremental background delta flush running...");
        });

        document.addEventListener('COZY_QUARRY_UI_SYNC_FINISHED', () => {
            document.getElementById('net-dot').className = "dot";
            document.getElementById('sync-state-txt').innerText = "Idle";
            appendLog("[KERNEL NOTIFICATION] Background sync completed successfully.");
        });

        // QUEUE_CHANGED wiring (item 4) — uses the existing UI passthrough
        // event pipeline only, no polling.
        document.addEventListener('COZY_QUARRY_UI_QUEUE_CHANGED', (e) => {
            renderQueueState(e.detail);
            appendLog(`[KERNEL NOTIFICATION] Offline operation queue changed.`);
        });
    </script>
</body>
</html>
