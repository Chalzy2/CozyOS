/**
 * ── COZYOS RETAIL ROLE-BASED ACCESS CONTROL MATRIX ──
 * FILE: core/business/permissions.js
 */

export const BUSINESS_ROLES = {
    "Owner": [
        "dashboard", "sales.read", "sales.write", "sales.delete", "inventory.read", "inventory.write",
        "expenses.read", "expenses.write", "mpesa.read", "mpesa.write", "ai.interrogate", 
        "reports.view", "billing.manage", "settings.write", "staff.manage", "customer.write"
    ],
    "Cashier": [
        "pos.view", "sales.write", "receipts.print", "customer.lookup", "qr.payment", "ai.interrogate"
    ],
    "Storekeeper": [
        "inventory.read", "inventory.write", "stock.in", "stock.out", "suppliers.manage", "ai.interrogate"
    ],
    "Accountant": [
        "sales.read", "expenses.read", "expenses.write", "profit.view", "taxes.calculate", "reports.view", "ai.interrogate"
    ]
};

export default {
    /**
     * STRICT SECURITY CLEARANCE GUARD VIA ACTIVE RUNTIME SESSION
     */
    verifyClearance(session, explicitPermissionKey) {
        if (!session || !session.tenantId) return false;
        
        const assignedRole = session.profile?.role;
        const capabilities = BUSINESS_ROLES[assignedRole] || [];
        
        return capabilities.includes(explicitPermissionKey);
    },

    /**
     * TENANT ISOLATION BOUNDARY PROTECTOR
     */
    enforceSanctity(session, databaseRecord) {
        if (session.tenantId !== databaseRecord.tenantId) {
            throw new Error(`🚨 Security Violation: Tenant ID mismatch. Action terminated.`);
        }
        return true;
    }
};
