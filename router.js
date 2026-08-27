export default {
    navigate(endpointTarget) {
        location.href = endpointTarget;
    },
    getCurrentRoute() {
        // SECURITY FIX: a blank/root path used to fall back to
        // "dashboard.html" (the administrator workspace). Root paths must
        // fall back to the public entry point instead - the administrator
        // workspace must never be reached implicitly.
        return window.location.pathname.split('/').pop() || "index.html";
    }
};
