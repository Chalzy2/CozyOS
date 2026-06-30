/**
 * CozyOS Quarry Manager — Shared Constants
 * Centralizes string literals (storage collections, domain events,
 * lifecycle statuses, finance account prefixes) that were previously
 * duplicated as inline literals throughout index.js.
 *
 * Loaded as a plain script BEFORE index.js. Attaches to
 * window.CozyOS.Shared.QuarryConstants. index.js reads from this object
 * when present and falls back to its own inline literals when absent,
 * so this file is purely additive and never a hard dependency.
 */
"use strict";

(function () {
    if (!window.CozyOS) window.CozyOS = {};
    if (!window.CozyOS.Shared) window.CozyOS.Shared = {};

    window.CozyOS.Shared.QuarryConstants = {
        COLLECTIONS: {
            EMPLOYEES: "quarry_employees",
            ATTENDANCE: "quarry_attendance",
            PARCELS: "quarry_parcels",
            MAINTENANCE: "quarry_maintenance",
            MACHINE_HOURS: "quarry_machine_hours",
            DRIVERS: "quarry_drivers",
            CUSTOMERS: "quarry_customers",
            SALES_ORDERS: "quarry_sales_orders",
            SALES: "quarry_sales",
            QUOTATIONS: "quarry_quotations",
            INVOICES: "quarry_invoices",
            RECEIPTS: "quarry_receipts",
            DELIVERY_NOTES: "quarry_delivery_notes",
            TRUCK_DISPATCH: "quarry_truck_dispatch",
            FUEL_PURCHASES: "quarry_fuel_purchases",
            FUEL_ISSUES: "quarry_fuel_issues",
            LOANS: "quarry_loans",
            LOAN_REPAYMENTS: "quarry_loan_repayments",
            CRUSHER_PRODUCTION: "quarry_crusher_production",
            PRODUCTION: "quarry_production",
            LAND_OWNERS: "quarry_land_owners",
            ROYALTY_ACCRUALS: "quarry_royalty_accruals",
            ROYALTY_SETTLEMENTS: "quarry_royalty_settlements",
            EXPENSES: "quarry_expenses",
            AUDIT_LOG: "quarry_audit_log"
        },

        EVENTS: {
            EMPLOYEE_CREATED: "employee.created",
            SALE_COMPLETED: "sale.completed",
            LOAN_APPROVED: "loan.approved",
            PAYROLL_COMPLETED: "payroll.completed",
            ROYALTY_GENERATED: "royalty.generated",
            REPORT_GENERATED: "report.generated"
        },

        STATUSES: {
            DRAFT: "Draft",
            COMPLETED: "Completed",
            FAILED: "Failed",
            ACTIVE: "Active",
            SUSPENDED: "Suspended",
            TERMINATED: "Terminated",
            OPEN: "Open",
            CLOSED: "Closed"
        },

        EXPENSE_CATEGORIES: [
            "Fuel", "Repairs", "Explosives", "Salaries", "Utilities",
            "Security", "Rentals", "Miscellaneous"
        ],

        FINANCE_ACCOUNTS: {
            PAYROLL_VAULT: "acc_payroll_vault",
            ROYALTY_VAULT: "acc_royalty_vault",
            CASH_RESERVE_OPEX: "acc_cash_reserve_opex",
            CASH_RESERVE_SALES: "acc_cash_reserve_sales",
            FUEL_INVENTORY: "acc_fuel_inventory",
            operatorWallet: (id) => `acc_operator_wallet_${id}`,
            customer: (id) => `acc_customer_${id}`,
            machine: (id) => `acc_machine_${id}`,
            landOwner: (id) => `acc_landowner_${id}`,
            expense: (category) => `acc_expense_${String(category).toLowerCase()}`
        },

        MANDATORY_HEADER_KEYS: [
            "LocalID", "CloudID", "SyncStatus", "IntegrityHash",
            "DeviceID", "EmployeeID", "BranchID"
        ]
    };
})();
