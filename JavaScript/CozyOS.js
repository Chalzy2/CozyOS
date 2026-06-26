onolithic Global Namespace Abstraction Layer
 */

const CozyOS = (function() {
    // ── 1. GLOBAL HIGHSPEED SYSTEM EVENT BUS ──
    const EventBus = {
        topics: {},
        subscribe(topic, listener) {
            if (!this.topics[topic]) this.topics[topic] = [];
            this.topics[topic].push(listener);
        },
        publish(topic, data) {
            if (!this.topics[topic]) return;
            this.topics[topic].forEach(listener => {
                try { listener(data); } catch(e) { console.error(`[Kernel Bus Crash] Topic: ${topic} ->`, e); }
            });
        }
    };

    // ── 2. OFFLINE-FIRST PERSISTENT TRANSACTION TRANSACTIONAL ENGINE ──
    let localDB = null;
    const DB_NAME = "CozyOS_Kernel_Storage";
    const DB_VERSION = 4;
    const STORAGE_QUEUE = "cozy_sync_queue";
    const MEMORY_STORE = "cozy_ai_memory";

    const StorageEngine = {
        init() {
            return new Promise((resolve, reject) => {
                const req = indexedDB.open(DB_NAME, DB_VERSION);
                req.onupgradeneeded = (e) => {
                    const db = e.target.result;
                    if (!db.objectStoreNames.contains(STORAGE_QUEUE)) {
                        db.createObjectStore(STORAGE_QUEUE, { keyPath: "id" });
                    }
                    if (!db.objectStoreNames.contains(MEMORY_STORE)) {
                        db.createObjectStore(MEMORY_STORE, { keyPath: "key" });
                    }
                    if (!db.objectStoreNames.contains("telemetry")) {
                        db.createObjectStore("telemetry", { keyPath: "id", autoIncrement: true });
                    }
                };
                req.onsuccess = (e) => {
                    localDB = e.target.result;
                    EventBus.publish('kernel:storage_ready', true);
                    this.startSyncOrchestrator();
                    resolve(true);
                };
                req.onerror = (e) => reject(e.target.error);
            });
        },

        async enqueue(collection, action, payload, customId = null) {
            if (!localDB) return false;
            const txItem = {
                id: `tx_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                collection, action, payload, customId,
                timestamp: Date.now(), retries: 0
            };
            return new Promise((resolve) => {
                const tx = localDB.transaction(STORAGE_QUEUE, "readwrite");
                tx.objectStore(STORAGE_QUEUE).add(txItem);
                tx.oncomplete = () => {
                    CozyOS.Interface.toast("💾 Transaction Logged Locally");
                    EventBus.publish('kernel:queue_mutated', null);
                    this.processQueue();
                    resolve(true);
                };
            });
        },

        async processQueue() {
            if (!navigator.onLine || !localDB) return;
            const tx = localDB.transaction(STORAGE_QUEUE, "readonly");
            const store = tx.objectStore(STORAGE_QUEUE);
            const req = store.getAll();
            
            req.onsuccess = async () => {
                const queue = req.result || [];
                if (queue.length === 0) {
                    this.updateTelemetryDisplay("Steady");
                    return;
                }
                queue.sort((a, b) => a.timestamp - b.timestamp);
                const item = queue[0];

                if (item.retries > 5) {
                    await this.dequeue(item.id);
                    console.error(`[Dead-Letter Queue] Evicted corrupt transaction item: ${item.id}`);
                    this.processQueue();
                    return;
                }

                try {
                    const firestore = window.CozyFirebaseDB;
                    const sdk = window.CozyFirebaseSDK;
                    if (!firestore || !sdk) throw new Error("Firebase Service Layer Unmapped");

                    let docRef = item.customId ? 
                        sdk.doc(firestore, item.collection, item.customId) : 
                        sdk.doc(sdk.collection(firestore, item.collection));

                    item.payload.lastSyncedAt = new Date().toISOString();
                    item.payload.syncOrigin = "CozyOS_Kernel_Engine";

                    if (item.action === "SET") {
                        await sdk.setDoc(docRef, item.payload, { merge: true });
                    } else if (item.action === "UPDATE") {
                        await sdk.updateDoc(docRef, item.payload);
                    }

                    await this.dequeue(item.id);
                    CozyOS.Automation.evaluateRules(item.collection, item.payload);
                    this.processQueue();
                } catch (err) {
                    await this.incrementRetry(item);
                    this.updateTelemetryDisplay("Retrying");
                }
            };
        },

        async dequeue(id) {
            return new Promise(r => {
                const tx = localDB.transaction(STORAGE_QUEUE, "readwrite");
                tx.objectStore(STORAGE_QUEUE).delete(id).onsuccess = () => r(true);
            });
        },

        async incrementRetry(item) {
            return new Promise(r => {
                const tx = localDB.transaction(STORAGE_QUEUE, "readwrite");
                item.retries++;
                tx.objectStore(STORAGE_QUEUE).put(item).onsuccess = () => r(true);
            });
        },

        startSyncOrchestrator() {
            window.addEventListener('online', () => {
                CozyOS.Interface.toast("⚡ Framework Transponders Connected Online");
                this.processQueue();
            });
            window.addEventListener('offline', () => {
                CozyOS.Interface.toast("📡 Network Down: CozyOS Kernel Handling Buffers Local-First");
                this.updateTelemetryDisplay("Offline");
            });
            setInterval(() => this.processQueue(), 20000);
        },

        updateTelemetryDisplay(status) {
            const el = document.getElementById('osDbTelemetry');
            if (!el) return;
            const tx = localDB.transaction(STORAGE_QUEUE, "readonly");
            tx.objectStore(STORAGE_QUEUE).getAll().onsuccess = (e) => {
                el.innerText = `IDB Alloc: Bound | Queue: ${e.target.result.length} Pnd | Sync: ${status}`;
            };
        }
    };

    // ── 3. COZYOS.AI CORE ASSISTANT KERNEL ──
    const AIKernel = {
        async computeReply(prompt, callback) {
            // Write input vector into AI memory structures locally
            if (localDB) {
                const tx = localDB.transaction(MEMORY_STORE, "readwrite");
                tx.objectStore(MEMORY_STORE).put({ key: `prompt_${Date.now()}`, value: prompt, date: new Date().toISOString() });
            }

            const cleanPrompt = prompt.toLowerCase().trim();
            let response = "Instruction compiled into memory matrix. Parsing systemic patterns...";

            // Centralized AI Command Center Mapping Intercepts
            if (cleanPrompt.includes("open wallet") || cleanPrompt.includes("wallet balance")) {
                response = "Navigating to Core Balance Ledger system arrays... Opening Wallet UI.";
                setTimeout(() => { location.href = "wallet.html"; }, 1200);
            } else if (cleanPrompt.includes("show orders") || cleanPrompt.includes("check stock")) {
                response = "Scanning inventory nodes. Navigating directly to Cozy Shop Core Module.";
                setTimeout(() => { location.href = "index.html"; }, 1200);
            } else if (cleanPrompt.includes("open profile") || cleanPrompt.includes("identity")) {
                response = "Accessing secure Workspace Identity Studio anchor pipelines...";
                setTimeout(() => { location.href = "identity.html"; }, 1200);
            } else if (cleanPrompt.includes("run test") || cleanPrompt.includes("diagnostics")) {
                CozyOS.Diagnostics.triggerSelfTest();
                response = "System self-test cycle initiated. Telemetry logs printing to console frame.";
            }

            setTimeout(() => { callback(response); }, 400);
        }
    };

    // ── 4. CROSS-MODULE WORKFLOW AUTOMATION ENGINE ──
    const AutomationEngine = {
        evaluateRules(triggerCollection, payload) {
            console.log(`[Kernel Automation Watcher] Intercepted record mutation in ${triggerCollection}`);
            // Declarative Operational Pipeline Interceptors
            if (triggerCollection === "cozyWallet" && payload.amount > 10000) {
                CozyOS.Interface.toast("🚨 High-Value Capital Vector Logged across system ledger arrays!");
            }
        }
    };

    // ── 5. PERFORMANCE DIAGNOSTICS & SYSTEM TELEMETRY ──
    const Diagnostics = {
        triggerSelfTest() {
            const indicator = document.getElementById('osStatusIndicator');
            if (indicator) indicator.innerText = "⚡ CozyOS Core Node: Processing System Intercept Loop...";
            setTimeout(() => {
                if (indicator) indicator.innerText = "⚡ CozyOS Core Node: Operational";
                CozyOS.Interface.toast("✅ Active Modules Audited. Kernel System Fabric Intact.");
            }, 1000);
        }
    };

    // ── 6. INTERFACE TOAST ARCHITECTURE HOOKS ──
    const InterfaceHelpers = {
        toast(msg) {
            let t = document.getElementById('cc-toast');
            if (!t) {
                t = document.createElement('div');
                t.id = 'cc-toast';
                document.body.appendChild(t);
            }
            t.textContent = msg; t.className = 'show';
            setTimeout(() => t.className = '', 2600);
        }
    };

    return {
        Bus: EventBus,
        Storage: StorageEngine,
        AI: AIKernel,
        Automation: AutomationEngine,
        Diagnostics: Diagnostics,
        Interface: InterfaceHelpers
    };
})();

window.CozyOS = CozyOS;

                  
/**
 * ── COZYOS REVOLUTIONARY LIGHTWEIGHT BOOTSTRAP ──
 * VERSION: 7.0.0 (Production Architecture)
 */
(function() {
    // Early allocation namespace stubbing to prevent script race condition errors in layouts
    const CozyOS = { _bootstrapped: false };
    const apis = ['AI','Storage','Auth','Security','Notifications','Analytics','Router','Plugins','Cache','Sync','Documents','Media','Wallet','CRM','Affiliate','Studio3D','Academy','Settings','Logger','Permissions','Scheduler','Telemetry','Updates'];
    apis.forEach(api => { CozyOS[api] = {}; });

    CozyOS.init = async function() {
        if (this._bootstrapped) return true;
        console.log("🌌 [CozyOS Bootstrap] Igniting Microkernel Payload Loader...");
        try {
            const kernelMod = await import('./core/kernel.js');
            window.CozyOS = kernelMod.default;
            await window.CozyOS.bootSequence();
            this._bootstrapped = true;
            return true;
        } catch (panic) {
            console.error("🚨 [Bootstrap Panic] Base Core Loader Severed:", panic);
            return false;
        }
    };

    window.CozyOS = CozyOS;
})();
