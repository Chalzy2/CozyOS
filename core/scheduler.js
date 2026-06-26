export default {
    jobs: {},
    createJob(identity, intervalMs, callbackAction) {
        if (this.jobs[identity]) clearInterval(this.jobs[identity]);
        this.jobs[identity] = setInterval(() => {
            try { callbackAction(); } catch (e) { console.error(`[Scheduler Job Error] ${identity}:`, e); }
        }, intervalMs);
    },
    clearJob(identity) {
        if (this.jobs[identity]) { clearInterval(this.jobs[identity]); delete this.jobs[identity]; }
    }
};
