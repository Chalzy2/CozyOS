/**
 * ── COZYOS MUTATION SYNC ENGINE & CACHE CONTROLLER ──
 * DOMAIN: core/sync.js
 * REFERENCE: CozyOS_Universal_Session_Identity_Kernel_Production_Upgrade.pdf
 */

import { db } from './firebase.js';
import { doc, setDoc } from 'https://www.gstatic.com/firebasejs/10.0.0/firebase-firestore.js';
import AuditLogger from './audit.js';

const CACHE_DB_NAME = "CozyOS_Kernel_Cache";
const CACHE_VERSION = 1;
let indexedDBInstance = null;

export default {
    /**
     * OPEN STORAGE CONTAINER LABELS
     */
    async initializeSyncSubsystem() {
        return new Promise((resolve, reject) => {
            const openRequest = indexedDB.open(CACHE_DB_NAME, CACHE_VERSION);

            openRequest.onupgradeneeded = (event) => {
                const dbInstance = event.target.result;
                if (!dbInstance.objectStoreNames.contains("mutation_queue")) {
                    dbInstance.createObjectStore("mutation_queue", { keyPath: "id" });
                }
            };

            openRequest.onsuccess = (event) => {
                indexedDBInstance = event.target.result;
                console.log("📦 Idempotent Storage: Queue database structures confirmed online.");
                resolve(true);
            };

            openRequest.onerror = (err) => reject(err);
        });
    },

    /**
     * STASH OPERATIONAL INSTRUCTIONS LOCALLY WHEN OFFLINE[span_13](start_span)[span_13](end_span)
     */
    async enqueueMutation(targetCollection, actionType, payloadData) {
        if (!indexedDBInstance) throw new Error("Storage Core Error: Database offline.");

        // Pull active tenant tags from the global execution layer context[span_14](start_span)[span_14](end_span)
        const session = window.CozyOS?.Session;
        const tenantId = session ? session.tenantId : "unmapped_tenant";

        const executionItem = {
            id: `mutation_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            collection: targetCollection,
            action: actionType,
            tenantId: tenantId, // Enforce tenant tracking on all cached transactions[span_15](start_span)[span_15](end_span)
            payload: payloadData,
            timestamp: new Date().toISOString()
        };

        return new Promise((resolve, reject) => {
            const transaction = indexedDBInstance.transaction(["mutation_queue"], "readwrite");
            const store = transaction.objectStore("mutation_queue");
            const appendQuery = store.add(executionItem);

            appendQuery.onsuccess = () => {
                console.warn(` Stashed instruction line [${actionType}] for tenant [${tenantId}] inside IndexedDB.`);
                resolve(executionItem.id);
            };

            appendQuery.onerror = (err) => reject(err);
        });
    },

    /**
     * FLUSH PENDING QUEUES TO FIREBASE WHEN CONNECTION RESTORES[span_16](start_span)[span_16](end_span)
     */
    async flushOfflineMutationQueue() {
        if (!navigator.onLine || !indexedDBInstance) return;

        const transaction = indexedDBInstance.transaction(["mutation_queue"], "readwrite");
        const store = transaction.objectStore("mutation_queue");
        const getAllQuery = store.getAll();

        getAllQuery.onsuccess = async (event) => {
            const items = event.target.result;
            if (items.length === 0) return;

            console.log(`🚀 Storage Sync: Syncing ${items.length} pending mutations to the cloud...`);

            for (const item of items) {
                try {
                    // Double-check isolation rules against the active session[span_17](start_span)[span_17](end_span)
                    if (window.CozyOS?.Session && item.tenantId !== window.CozyOS.Session.tenantId) {
                        console.error(`🚨 Security Intercept: Aborted syncing data across boundaries for ID: ${item.id}`);
                        continue; 
                    }

                    const targetDocumentRef = doc(db, item.collection, item.payload.id || item.id);
                    await setDoc(targetDocumentRef, {
                        ...item.payload,
                        syncedAt: new Date().toISOString(),
                        originatingSessionId: window.CozyOS?.Session?.sessionId || "offline_shell"
                    }, { merge: true });

                    // Remove processed transaction from local storage
                    const cleanTransaction = indexedDBInstance.transaction(["mutation_queue"], "readwrite");
                    cleanTransaction.objectStore("mutation_queue").delete(item.id);

                } catch (syncFault) {
                    console.error(`❌ Failed processing transaction item node ID: ${item.id}`, syncFault);
                }
            }

            await AuditLogger.log("Storage Sync", `Successfully synced mutation queue items.`);
        };
    }
};

window.CozyOS.SyncEngine = {
    enqueue: async (col, act, pay) => { return await module.exports.default.enqueueMutation(col, act, pay); },
    flush: async () => { return await module.exports.default.flushOfflineMutationQueue(); }
};
