export default {
    logs: [],
    log(lvl, src, msg, meta = null) {
        const entry = { id: `log_${Date.now()}_${Math.random().toString(36).substr(2,4)}`, lvl, src, msg, meta, time: new Date().toISOString() };
        this.logs.push(entry);
        if (this.logs.length > 500) this.logs.shift(); // Prevent structural memory leaks
        console.log(`[%c${lvl.toUpperCase()}%c][${src}] ${msg}`, `color: ${lvl==='error'?'#EF4444':lvl==='warn'?'#F59E0B':'#10B981'}`, 'color:inherit;', meta || '');
    },
    info(src, msg, data)  { this.log("info", src, msg, data); },
    warn(src, msg, data)  { this.log("warn", src, msg, data); },
    error(src, msg, data) { this.log("error", src, msg, data); }
};
