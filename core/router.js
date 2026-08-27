export default {
    navigate(endpointTarget) {
        location.href = endpointTarget;
    },
    getCurrentRoute() {
        // SECURITY FIX (RP-ADMIN-ROUTING-SPLIT), applied for consistency with
        // the already-fixed root router.js: a blank/root path must fall back
        // to the public entry point, never an administrator-adjacent file.
        // This file is currently unreferenced anywhere in the repository
        // (confirmed by repo-wide grep) - fixed defensively so it can never
        // reintroduce the same bug if it is ever wired up later.
        return window.location.pathname.split('/').pop() || "index.html";
    }
};
