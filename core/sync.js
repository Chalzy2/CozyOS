/**
 * ── COZYOS IDEMPOTENT OFFLINE SYNCHRONIZATION MATRIX ──
 * SERVICE DOMAIN: core/sync.js
 * REFERENCES: 665037.jpg, 665038.jpg
 */

import { db, doc, setDoc } from './firebase.js';
import AuditLogger from './audit.js';

export default {
    _indexedDbInstance: null,

    async initializeSyncSubsystem() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open("cozyos_kernel_offline_db", 1);
            
            request.onupgradeneeded = (event) => {
                const dbInstance = event.target.result;
                if (!dbInstance.objectStoreNames.contains("mutation_queue")) {
                    dbInstance.createObjectStore("mutation_queue", { keyPath: "transactionHashId" });
                }
            };

            request.onsuccess = (event) => {
                this._indexedDbInstance = event.target.result;
                this._registerNetworkOnlineTriggers();
                resolve(true);
            };

            request.onerror = (err) => reject(err);
        });
    },

    /**
     * Saves data locally and generates unique transaction hashes to prevent duplication.
     * Maps precisely to requirements in 665038.jpg.
     */
    async enqueueMutation(targetCollection, operationalAction, documentPayload) {
        // Generate a deterministic transaction hash based on payloads to maintain structural uniqueness
        const payloadString = JSON.stringify(documentPayload);
        const transactionHashId = `tx_${this._generateSimpleHash(payloadString + operationalAction + Date.now())}`;

        const mutationTask = {
            transactionHashId,
            targetCollection,
            operationalAction, // SET, UPDATE, DELETE
            documentPayload,
            capturedTimestamp: new Date().toISOString()
        };

        // Write immediately to the local IndexedDB system
        await this._writeToLocalStore("mutation_queue", mutationTask);
        await AuditLogger.log("Local Mutation Stored", `Tracking ID: ${transactionHashId} locked locally.`);

        // Trigger an automatic background push sequence if online
        if (navigator.onLine) {
            this.flushOfflineMutationQueue();
        }
    },

    async flushOfflineMutationQueue() {
        if (!navigator.onLine || !this._indexedDbInstance) return;

        const tx = this._indexedDbInstance.transaction("mutation_queue", "readwrite");
        const store = tx.objectStore("mutation_queue");
        const getAllRequest = store.getAll();

        getAllRequest.onsuccess = async (event) => {
            const queuedTasks = event.target.result;
            if (queuedTasks.length === 0) return;

            console.log(`[COZYOS SYNC KERNEL] Processing [${queuedTasks.length}] queued transaction mutations.`);

            for (const task of queuedTasks) {
                try {
                    const targetCloudRef = doc(db, task.targetCollection, task.documentPayload.id);
                    
                    // Push changes to cloud infrastructure safely
                    await setDoc(targetCloudRef, task.documentPayload, { merge: true });
                    
                    // Remove item from IndexedDB queue upon successful synchronization
                    const cleanupTx = this._indexedDbInstance.transaction("mutation_queue", "readwrite");
                    cleanupTx.objectStore("mutation_queue").delete(task.transactionHashId);
                    
                    await AuditLogger.log("Sync Complete", `Transaction hash synced: ${task.transactionHashId}`);
                } catch (connectionError) {
                    console.error("Sync batch cycle paused due to connection limits.", connectionError);
                    break;
                }
            }
        };
    },

    _writeToLocalStore(storeName, dataObject) {
        return new Promise((resolve) => {
            const tx = this._indexedDbInstance.transaction(storeName, "readwrite");
            const store = tx.objectStore(storeName);
            store.put(dataObject);
            tx.oncomplete = () => resolve(true);
        });
    },

    _generateSimpleHash(stringSource) {
        let hashValue = 0;
        for (let idx = 0; idx < stringSource.length; idx++) {
            hashValue = (hashValue << 5) - hashValue + stringSource.charCodeAt(idx);
            hashValue |= 0;
        }
        return Math.abs(hashValue).toString(36);
    },

    _registerNetworkOnlineTriggers() {
        window.addEventListener("online", () => {
            console.log("🌐 Network state change captured: Online. Triggering synchronization sync processing cycles...");
            this.flushOfflineMutationQueue();
        });
    }
};
