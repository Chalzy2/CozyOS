export default {
    async installPlugin(meta) {
        await window.CozyOS.Storage.writeLocal("cozy_plugins", meta);
        window.CozyOS.Notifications.dispatchSystemToast(`📦 Module Plugged: ${meta.name}`);
    }
};
