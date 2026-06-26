export default {
    async enqueueTransaction(collectionPath, actionType, payload, customId = null) {
        const entry = {
            id: `tx_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            collection: collectionPath, action: actionType, payload, customId,
            timestamp: Date.now(), retries: 0
        };
        return new Promise(r => {
            const db = window.CozyOS.Storage.getRawInstance();
            if (!db) return r(false);
            const tx = db.transaction("cozy_sync_queue", "readwrite");
            tx.objectStore("cozy_sync_queue").add(entry).onsuccess = () => {
                window.CozyOS.Notifications.dispatchSystemToast("💾 Transaction Sequenced Locally");
                this.flushSyncQueue();
                r(true);
            };
        });
    },
    async flushSyncQueue() {
        if (!navigator.onLine) return;
        const db = window.CozyOS.Storage.getRawInstance();
        if (!db) return;

        const tx = db.transaction("cozy_sync_queue", "readonly");
        tx.objectStore("cozy_sync_queue").getAll().onsuccess = async (e) => {
            const queue = e.target.result || [];
            if (queue.length === 0) return;

            queue.sort((a, b) => a.timestamp - b.timestamp);
            const activeTask = queue[0];

            try {
                const targetDB = window.CozyFirebaseDB;
                const sdk = window.CozyFirebaseSDK;
                if (!targetDB || !sdk) throw new Error("Firebase runtime layers unmapped onto loader scope boundaries.");

                let targetRef = activeTask.customId ? 
                    sdk.doc(targetDB, activeTask.collection, activeTask.customId) : 
                    sdk.doc(sdk.collection(targetDB, activeTask.collection));

                activeTask.payload.lastSyncedAt = new Date().toISOString();
                activeTask.payload.syncOrigin = "CozyOS_Micro_Sync";

                if (activeTask.action === "SET") {
                    await sdk.setDoc(targetRef, activeTask.payload, { merge: true });
                } else if (activeTask.action === "UPDATE") {
                    await sdk.updateDoc(targetRef, activeTask.payload);
                }

                const rmTx = db.transaction("cozy_sync_queue", "readwrite");
                rmTx.objectStore("cozy_sync_queue").delete(activeTask.id).oncomplete = () => {
                    this.flushSyncQueue();
                };
            } catch (err) {
                console.warn("[Sync Backoff Triggered]", err);
            }
        };
    },
    startSyncOrchestrator() {
        window.addEventListener('online', () => this.flushSyncQueue());
        setInterval(() => this.flushSyncQueue(), 30000);
    }
};
