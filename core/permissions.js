export default {
    roles: { ADMIN: "admin", MANAGER: "manager", STAFF: "staff", AFFILIATE: "affiliate", CUSTOMER: "customer", GUEST: "guest" },
    schematics: {
        "wallet.html": ["admin", "manager", "affiliate"],
        "contacts.html": ["admin", "manager", "staff"]
    },
    evaluateRouteAccess(userRoles = ["guest"], currentPath = "dashboard.html") {
        const required = this.schematics[currentPath];
        if (!required) return true;
        return userRoles.some(role => required.includes(role));
    }
};
