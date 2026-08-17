export default {
    navigate(endpointTarget) {
        location.href = endpointTarget;
    },
    getCurrentRoute() {
        return window.location.pathname.split('/').pop() || "dashboard.html";
    }
};
