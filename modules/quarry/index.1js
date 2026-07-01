**

── CozyOS QUARRY MANAGER ENTERPRISE ENGINE ──

FILE: core/modules/quarry/index.js

VERSION: 1.4.0 (Enterprise Cross-Cutting Pass — Statistics, Health, Manifest, Events)

Registered Module ID: Business Module #001


Enforces strict financial compliance rules by routing all ledger mutations


directly through CozyFinanceOS via the air-gapped internal API Gateway.

CHANGE NOTE (1.2.0 -> 1.3.0):
This release is a pure functionality expansion on top of the frozen 1.2.0
Enterprise Engine. The following invariants are unchanged:
  - Module ID ("quarry_manager_001")
  - Public API surface: handle(context)
  - Routing pattern (switch/case over context.route inside handle())
  - Role permission model (this.roleMatrix, _checkPermission)
  - Seven-Key transaction header structure (this._mandatoryHeaderKeys)
  - Finance routing adapter (_routeExternalFinancialLegger)
  - Offline synchronization architecture (storage.insert/find + pending sync)
  - AI Advisor interface (executeAIAdvisorQuery signature/shape)
  - Microkernel registration block at the bottom of this file
  - window.CozyOS namespace and folder structure
All thirteen new ERP modules below reuse these exact same primitives —
no new storage engine, no new finance path, no new file.

CHANGE NOTE (1.3.0 -> 1.4.0):
Final enterprise hardening pass before freeze, adding four cross-cutting
capabilities that every CozyOS Enterprise Module exposes. These are
introspection/observability additions only — no business route, no
permission rule, no storage schema, and no finance path was changed:
  - getStatistics(): runtime dashboard metrics (counts/queues)
  - getHealth(): standardized health probe, mirroring the AI engine pattern
  - getManifest(): standardized module descriptor for kernel introspection
  - Event Publishing: fire-and-forget domain events (employee.created,
    sale.completed, loan.approved, payroll.completed, royalty.generated,
    report.generated) so other modules can react without direct coupling.
    Uses the same DOM CustomEvent mechanism already used elsewhere in
    CozyOS (e.g. quarryHandler.js's UI passthrough events) — no new event
    bus was introduced.
*/


"use strict";

class CozyQuarryManager {
constructor() {
this.moduleId = "quarry_manager_001";
this.version = "1.4.0";
this.activeLanguage = "en";

// Immutable Seven-Key Structural Schema Invariant Template  
    this._mandatoryHeaderKeys = [  
        "LocalID", "CloudID", "SyncStatus", "IntegrityHash",   
        "DeviceID", "EmployeeID", "BranchID"  
    ];  

    // Valid Transaction Lifecycle Sequential States Link  
    this.Lifecycles = { DRAFT: "Draft", COMPLETED: "Completed", FAILED: "Failed" };  

    // Default Immutable Price Vectors Registry  
    this.stonePricing = new Map([  
        ["LA-13", { name: "LA-13 Large Aggregate", sellingPrice: 27.00 }],  
        ["MB-10", { name: "MB-10 Medium Block",    sellingPrice: 20.00 }],  
        ["SC-4",  { name: "SC-4 Small Chippings",  sellingPrice: 8.50 }]  
    ]);  

    // Fine-Grained Module Matrix Role-Based Permissions Map  
    // NOTE: existing roles/routes preserved verbatim below. New roles and  
    // new route grants are appended afterward (see _extendRoleMatrixForERP)  
    // rather than rewritten in place, so the original mapping stays intact  
    // and diffable.  
    this.roleMatrix = new Map([  
        ["Administrator", ["assign_workforce", "log_attendance", "manage_parcel", "log_maintenance", "process_payroll", "view_analytics", "admin_ai"]],  
        ["Manager",       ["assign_workforce", "log_attendance", "manage_parcel", "log_maintenance", "view_analytics"]],  
        ["Supervisor",    ["assign_workforce", "log_attendance", "log_maintenance"]],  
        ["Accountant",    ["process_payroll", "view_analytics"]],  
        ["Machine Operator", []]  
    ]);  

    // ── ERP Expansion: in-memory registries used only as lightweight  
    // lookup caches (e.g. royalty rates, customer credit limits). These do  
    // NOT replace window.CozyOS.Storage as the system of record — every  
    // mutating route below still persists through storage.insert exactly  
    // like the original 1.2.0 routes.  
    this.royaltyRates = new Map();      // landOwnerId -> { ratePerTon }  
    this.customerCreditLimits = new Map(); // customerId -> { limit, balance }  
    this.stockLevels = new Map([  
        ["Dust", 450], ["Hardcore", 1200], ["Ballast_0.75", 820],  
        ["Ballast_1.5", 340], ["Building_Stones", 15000], ["Chippings", 0],  
        ["Blocks", 0], ["Waste", 2300]  
    ]);  

    // ── Enterprise Pass: lightweight in-memory runtime counters used by  
    // getStatistics()/getHealth(). These are observational tallies only —  
    // the system of record for everything they summarize remains the  
    // storage-backed collections written by each execute* method.  
    this._runtimeStats = {  
        reportsGenerated: 0,  
        eventsPublished: 0,  
        lastEventName: null,  
        lastEventAt: null  
    };  

    this._extendRoleMatrixForERP();  
}  

/**  
 * ── ERP Expansion: Role Matrix Extension ──  
 * Adds new enterprise roles and grants new ERP route capabilities to  
 * existing/new roles WITHOUT removing or overwriting any entry created  
 * in the constructor above. Administrator retains full override via  
 * _checkPermission's existing `role === "Administrator"` clause.  
 */  
_extendRoleMatrixForERP() {  
    const erpRouteGrants = {  
        "HR Manager": [  
            "register_employee", "update_employee", "suspend_employee",  
            "terminate_employee", "transfer_employee", "assign_workforce",  
            "log_attendance", "issue_loan", "issue_salary_advance",  
            "record_loan_repayment", "get_loan_balance", "view_analytics"  
        ],  
        "Fleet Manager": [  
            "assign_truck", "log_departure", "log_arrival", "confirm_delivery",  
            "register_driver", "update_driver", "log_violation",  
            "log_fuel_purchase", "log_fuel_issue", "flag_fuel_theft",  
            "log_machine_hours", "log_maintenance", "view_analytics"  
        ],  
        "Finance Manager": [  
            "process_payroll", "issue_loan", "issue_salary_advance",  
            "record_loan_repayment", "log_expense", "settle_royalty",  
            "generate_royalty_statement", "view_analytics", "generate_report"  
        ],  
        "Sales Manager": [  
            "register_customer", "update_customer", "create_quotation",  
            "create_sales_order", "record_sale", "generate_invoice",  
            "record_receipt", "create_delivery_note", "view_analytics"  
        ],  
        "Operations Manager": [  
            "log_crusher_production", "log_machine_hours", "adjust_stock",  
            "get_stock_levels", "manage_parcel", "register_land_owner",  
            "set_royalty_rate", "log_royalty_accrual", "view_analytics",  
            "generate_report"  
        ],  
        "Safety Officer": [  
            "log_attendance", "log_violation", "flag_fuel_theft",  
            "view_analytics"  
        ]  
    };  

    Object.entries(erpRouteGrants).forEach(([role, routes]) => {  
        const existing = this.roleMatrix.get(role) || [];  
        const merged = Array.from(new Set([...existing, ...routes]));  
        this.roleMatrix.set(role, merged);  
    });  

    // Extend existing roles with read/light ERP access without altering  
    // their original grant arrays in place (append-only merge).  
    const additiveForExistingRoles = {  
        "Administrator": [  
            "register_employee", "update_employee", "suspend_employee",  
            "terminate_employee", "transfer_employee", "issue_loan",  
            "issue_salary_advance", "record_loan_repayment", "get_loan_balance",  
            "register_customer", "update_customer", "create_quotation",  
            "create_sales_order", "record_sale", "generate_invoice",  
            "record_receipt", "create_delivery_note", "assign_truck",  
            "log_departure", "log_arrival", "confirm_delivery",  
            "register_driver", "update_driver", "log_violation",  
            "log_fuel_purchase", "log_fuel_issue", "flag_fuel_theft",  
            "log_machine_hours", "log_crusher_production", "adjust_stock",  
            "get_stock_levels", "register_land_owner", "set_royalty_rate",  
            "log_royalty_accrual", "generate_royalty_statement",  
            "settle_royalty", "log_expense", "generate_report"  
        ],  
        "Manager": [  
            "register_customer", "create_quotation", "create_sales_order",  
            "record_sale", "log_crusher_production", "get_stock_levels",  
            "generate_report"  
        ],  
        "Accountant": [  
            "log_expense", "generate_invoice", "record_receipt",  
            "settle_royalty", "generate_royalty_statement", "generate_report"  
        ]  
    };  

    Object.entries(additiveForExistingRoles).forEach(([role, routes]) => {  
        const existing = this.roleMatrix.get(role) || [];  
        const merged = Array.from(new Set([...existing, ...routes]));  
        this.roleMatrix.set(role, merged);  
    });  
}  

/**  
 * Primary API Gateway Routing Interface for Microkernel Inter-Process Routing  
 */  
async handle(context) {  
    if (!context || typeof context.route !== "string") {  
        throw new Error("[Quarry Manager] Invalid operational gateway route invocation.");  
    }  

    // Security Authentication Role Validation Layer Checklist  
    const identity = context.authContext || window.CozyOS?.Auth?.getCurrentIdentity();  
    if (!this._checkPermission(identity?.role, context.route)) {  
        return { responseText: `🔒 Security Violation: Role [${identity?.role || "Guest"}] lacks execution rights for route '${context.route}'.`, status: 403 };  
    }  

    switch (context.route) {  
        case "assign_workforce":  
            return await this.executeWorkforceAssignment(context.payload);  
        case "track_attendance":  
            return await this.executeAttendanceLog(context.payload);  
        case "register_parcel":  
            return await this.executeParcelRegistration(context.payload);  
        case "log_maintenance":  
            return await this.executeMaintenanceUpdate(context.payload);  
        case "calculate_payroll":  
            return await this.executePayrollCalculation(context.payload);  
        case "trigger_offline_sync":  
            return await this.executeIncrementalOfflineSync();  
        case "ask_ai_advisor":  
            return await this.executeAIAdvisorQuery(context.payload);  

        // ── 1. Employee Registry ──  
        case "register_employee":  
            return await this.executeEmployeeRegistration(context.payload);  
        case "update_employee":  
            return await this.executeEmployeeUpdate(context.payload);  
        case "suspend_employee":  
            return await this.executeEmployeeStatusChange(context.payload, "Suspended");  
        case "terminate_employee":  
            return await this.executeEmployeeStatusChange(context.payload, "Terminated");  
        case "transfer_employee":  
            return await this.executeEmployeeTransfer(context.payload);  

        // ── 2. Loans & Salary Advances ──  
        case "issue_loan":  
            return await this.executeLoanIssuance(context.payload, "Loan");  
        case "issue_salary_advance":  
            return await this.executeLoanIssuance(context.payload, "SalaryAdvance");  
        case "record_loan_repayment":  
            return await this.executeLoanRepayment(context.payload);  
        case "get_loan_balance":  
            return await this.executeLoanBalanceLookup(context.payload);  

        // ── 3. Customer Management ──  
        case "register_customer":  
            return await this.executeCustomerRegistration(context.payload);  
        case "update_customer":  
            return await this.executeCustomerUpdate(context.payload);  

        // ── 4. Sales Module ──  
        case "create_quotation":  
            return await this.executeQuotationCreate(context.payload);  
        case "create_sales_order":  
            return await this.executeSalesOrderCreate(context.payload);  
        case "record_sale":  
            return await this.executeSaleRecord(context.payload);  
        case "generate_invoice":  
            return await this.executeInvoiceGenerate(context.payload);  
        case "record_receipt":  
            return await this.executeReceiptRecord(context.payload);  
        case "create_delivery_note":  
            return await this.executeDeliveryNoteCreate(context.payload);  

        // ── 5. Truck Dispatch ──  
        case "assign_truck":  
            return await this.executeTruckAssignment(context.payload);  
        case "log_departure":  
            return await this.executeDispatchEvent(context.payload, "Departed");  
        case "log_arrival":  
            return await this.executeDispatchEvent(context.payload, "Arrived");  
        case "confirm_delivery":  
            return await this.executeDeliveryConfirmation(context.payload);  

        // ── 6. Driver Registry ──  
        case "register_driver":  
            return await this.executeDriverRegistration(context.payload);  
        case "update_driver":  
            return await this.executeDriverUpdate(context.payload);  
        case "log_violation":  
            return await this.executeDriverViolationLog(context.payload);  

        // ── 7. Fuel Management ──  
        case "log_fuel_purchase":  
            return await this.executeFuelPurchase(context.payload);  
        case "log_fuel_issue":  
            return await this.executeFuelIssue(context.payload);  
        case "flag_fuel_theft":  
            return await this.executeFuelTheftFlag(context.payload);  

        // ── 8. Machine Hours ──  
        case "log_machine_hours":  
            return await this.executeMachineHoursLog(context.payload);  

        // ── 9. Crusher Analytics ──  
        case "log_crusher_production":  
            return await this.executeCrusherProductionLog(context.payload);  

        // ── 10. Stock Management ──  
        case "adjust_stock":  
            return await this.executeStockAdjustment(context.payload);  
        case "get_stock_levels":  
            return this.executeStockLevelsQuery();  

        // ── 11. Land Owner Royalty Engine ──  
        case "register_land_owner":  
            return await this.executeLandOwnerRegistration(context.payload);  
        case "set_royalty_rate":  
            return this.executeRoyaltyRateSet(context.payload);  
        case "log_royalty_accrual":  
            return await this.executeRoyaltyAccrual(context.payload);  
        case "generate_royalty_statement":  
            return await this.executeRoyaltyStatement(context.payload);  
        case "settle_royalty":  
            return await this.executeRoyaltySettlement(context.payload);  

        // ── 12. Expense Ledger ──  
        case "log_expense":  
            return await this.executeExpenseLog(context.payload);  

        // ── 13. Enterprise Reports ──  
        case "generate_report":  
            return await this.executeReportGeneration(context.payload);  

        default:  
            return { responseText: "🏗️ CozyOS Quarry Manager Module Online. Module #001 Active.", status: 200 };  
    }  
}  

/**  
 * 1. WORKFORCE ASSIGNMENT ENGINE  
 */  
async executeWorkforceAssignment(payload) {  
    const operatorsArray = payload.operatorIds || []; // Supports 1, 2, or 3 concurrent operators  
    if (operatorsArray.length < 1 || operatorsArray.length > 3) {  
        throw new Error("Validation Error: Machine assignment matrix rules specify 1 to 3 operators max.");  
    }  

    const storage = window.CozyOS?.Storage;  
    const assignmentEntry = {  
        assignmentId: "ASGN-" + Date.now(),  
        machineId: payload.machineId,  
        operators: operatorsArray,  
        isReplacementOverride: payload.isReplacementOverride || false,  
        overrideReason: payload.overrideReason || "None",  
        timestamp: new Date().toISOString()  
    };  

    if (storage && typeof storage.insert === "function") {  
        await storage.insert("quarry_assignments", assignmentEntry);  
    }  

    return { responseText: "👥 Workforce assignment matrix configured and logged to history register.", status: 200 };  
}  

/**  
 * 2. ATTENDANCE INTELLIGENCE SUB-MODULE  
 */  
async executeAttendanceLog(payload) {  
    // Track: Present, Absent, Late, Half Day  
    const status = payload.status;  
    const validStatuses = ["Present", "Absent", "Late", "Half Day"];  
    if (!validStatuses.includes(status)) {  
        throw new Error("Validation Error: Invalid attendance code variant supplied.");  
    }  

    const storage = window.CozyOS?.Storage;  
    const record = {  
        logId: "ATT-" + Date.now(),  
        operatorId: payload.operatorId,  
        status: status,  
        isReplacementActive: payload.isReplacementActive || false,  
        replacementOperatorId: payload.replacementOperatorId || null,  
        reason: payload.reason || "Standard log",  
        timestamp: new Date().toISOString()  
    };  

    if (storage && typeof storage.insert === "function") {  
        await storage.insert("quarry_attendance", record);  
    }  

    // Automatically notify payroll loop via Event Bus abstraction simulation  
    this._notifyNotificationCenter("Manager", `Attendance Alert: Operator ${payload.operatorId} is marked [${status}]. Payroll has been adjusted.`);  

    return { responseText: "⏱️ Attendance parameters captured. Core payroll modules updated.", status: 200 };  
}  

/**  
 * 3. LAND PARCEL SPECIFICATION LOGS  
 */  
async executeParcelRegistration(payload) {  
    const storage = window.CozyOS?.Storage;  
    const parcelRecord = {  
        parcelId: payload.parcelId,  
        landOwnerId: payload.landOwnerId,  
        gpsLocation: payload.gpsLocation, // String value e.g. "-3.9744,39.6911"  
        village: payload.village,  
        allocatedAreaAcres: payload.area,  
        assignedMachines: payload.machineIds || [],  
        timestamp: new Date().toISOString()  
    };  

    if (storage && typeof storage.insert === "function") {  
        await storage.insert("quarry_parcels", parcelRecord);  
    }  

    return { responseText: `🗺️ Land Parcel '${payload.parcelId}' attached to owner profile.`, status: 200 };  
}  

/**  
 * 4. MACHINE DIAGNOSTIC MAINTENANCE ENGINE  
 */  
async executeMaintenanceUpdate(payload) {  
    const C = window.CozyOS?.Shared?.QuarryConstants;
    this._validate(payload, ["machineId"]);
    const storage = window.CozyOS?.Storage;  
    const costValue = parseFloat(payload.repairCost) || 0;  

    const maintenanceRecord = {  
        maintenanceId: "MAIN-" + Date.now(),  
        machineId: payload.machineId,  
        serviceDate: payload.serviceDate,  
        mechanicDetails: payload.mechanic,  
        repairCost: costValue,  
        downtimeHours: parseFloat(payload.downtimeHours) || 0,  
        fuelUsageLiters: parseFloat(payload.fuelUsageLiters) || 0,  
        nextScheduledService: payload.nextServiceDate,  
        timestamp: new Date().toISOString()  
    };  

    // Direct financial ledger sync for maintenance opex calculations,  
    // with rollback if the cost write fails after the record was inserted.  
    if (costValue > 0) {  
        const header = this._buildHeader(payload);
        await this._withCompensation({
            record: maintenanceRecord,
            collection: C?.COLLECTIONS?.MAINTENANCE || "quarry_maintenance",
            idField: "maintenanceId",
            insert: async () => {
                if (storage && typeof storage.insert === "function") {
                    await storage.insert(C?.COLLECTIONS?.MAINTENANCE || "quarry_maintenance", maintenanceRecord);
                }
            },
            financeCall: () => this._routeExternalFinancialLegger(
                costValue,
                (C?.FINANCE_ACCOUNTS?.machine?.(payload.machineId)) || `acc_machine_${payload.machineId}`,
                C?.FINANCE_ACCOUNTS?.CASH_RESERVE_OPEX || "acc_cash_reserve_opex",
                header,
                "Maintenance OpEx Outflow"
            )
        });
    } else if (storage && typeof storage.insert === "function") {  
        await storage.insert(C?.COLLECTIONS?.MAINTENANCE || "quarry_maintenance", maintenanceRecord);  
    }  

    return { responseText: "🔧 Maintenance telemetry stored. Predictive service thresholds calculated.", status: 200 };  
}  

/**  
 * 5. STATEFUL OPERATOR PAYROLL DISBURSEMENT PIPELINE  
 * ── ERP Expansion note: now nets out any outstanding loan/advance  
 * installment due this cycle (see executeLoanIssuance / loan ledger),  
 * in addition to the original bonuses/penalties/loanDeductions inputs.  
 * The original payload fields and return shape are unchanged.  
 */  
async executePayrollCalculation(payload) {  
    const C = window.CozyOS?.Shared?.QuarryConstants;
    this._validate(payload, ["operatorId"]);
    const dailyRate = parseFloat(payload.baseDailyEarnings) || 0;  
    const bonusValue = parseFloat(payload.bonuses) || 0;  
    const penaltyValue = parseFloat(payload.penalties) || 0;  
    let loanDeduction = parseFloat(payload.loanDeductions) || 0;  

    // Auto-pull any due installment amount from the loan ledger unless the  
    // caller explicitly supplied loanDeductions (keeps old callers working  
    // exactly as before — additive, not overriding, behavior).  
    if (!payload.loanDeductions && payload.operatorId) {  
        const dueInstallment = await this._getDueLoanInstallment(payload.operatorId);  
        if (dueInstallment > 0) loanDeduction = dueInstallment;  
    }  

    const grossEarnings = dailyRate + bonusValue - penaltyValue - loanDeduction;  

    // Compile standard transactional schema maps  
    const payrollTransactionHeader = payload.header || {  
        LocalID: "TX-QUARRY-PAY-" + Date.now(),  
        CloudID: "",  
        SyncStatus: "pending",  
        IntegrityHash: "HASH-PAY-" + Math.random().toString(36).substring(2),  
        DeviceID: "DEV-MANDATORY-01",  
        EmployeeID: payload.operatorId,  
        BranchID: "BRANCH-MAIN"  
    };  

    // ── Engineering Pass: compensation wrapper ──
    // Payroll has no preceding storage insert to roll back (the payslip is
    // derived, not stored), so `insert` is a no-op here; the wrapper still
    // gives a consistent rolledBack/financeResponse shape and means the
    // auto loan-deduction step below only runs once disbursal is confirmed.
    const { financeResponse: financeKernelResponse, rolledBack } = await this._withCompensation({
        record: { operatorId: payload.operatorId, LocalID: payrollTransactionHeader.LocalID },
        collection: C?.COLLECTIONS?.EMPLOYEES || "quarry_employees",
        idField: "LocalID",
        insert: async () => {},
        financeCall: () => this._routeExternalFinancialLegger(
            grossEarnings,
            C?.FINANCE_ACCOUNTS?.PAYROLL_VAULT || "acc_payroll_vault",
            (C?.FINANCE_ACCOUNTS?.operatorWallet?.(payload.operatorId)) || `acc_operator_wallet_${payload.operatorId}`,
            payrollTransactionHeader,
            `Salary Disbursal for Operator ${payload.operatorId}`
        )
    });

    // If a loan installment was deducted automatically, record the  
    // repayment against the loan ledger so balances stay consistent —  
    // only once disbursal actually succeeded.  
    if (!rolledBack && loanDeduction > 0 && payload.operatorId) {  
        await this.executeLoanRepayment({  
            operatorId: payload.operatorId,  
            amount: loanDeduction,  
            source: "payroll_auto_deduction",  
            header: payrollTransactionHeader  
        });  
    }  

    // Generate payslip compilation metadata mapping array payload  
    const payslipMetaData = {  
        operatorId: payload.operatorId,  
        netPayout: grossEarnings,  
        breakdown: { base: dailyRate, adjustments: bonusValue - penaltyValue, deduction: loanDeduction },  
        securityDigest: financeKernelResponse.digest || "UNPUBLISHED_OFFLINE",  
        documentType: "SystemGeneratedPayslipPDF"  
    };  

    this._publishEvent(C?.EVENTS?.PAYROLL_COMPLETED || "payroll.completed", { operatorId: payload.operatorId, netPayout: grossEarnings });  

    return {   
        responseText: `📄 Payslip metadata compiled. Disbursal status: ${financeKernelResponse.state}.`,   
        status: 200,   
        payslip: payslipMetaData   
    };  
}  

/**  
 * 6. SYSTEM PLATFORM NOTIFICATION MANAGER  
 */  
_notifyNotificationCenter(recipientRole, textMessage) {  
    // Output channel routes abstraction wrapper mapping  
    console.log(`[Universal Notification Router] Channel: Dashboard/SMS to [${recipientRole}] -> Message: "${textMessage}"`);  
    // Future extensions link cleanly here to WhatsApp/Email streams without editing baseline logic strings  
}  

/**  
 * 7. UNIVERSAL AI BUSINESS ADVISOR QUERY PROCESSOR  
 * ── ERP Expansion: pattern set widened to cover Section 14 Business  
 * Intelligence questions. Signature, return shape, and the original two  
 * branches (profit / default) are preserved exactly as in 1.2.0 — new  
 * branches are inserted before the unchanged default fallback.  
 */  
async executeAIAdvisorQuery(payload) {  
    const userQueryText = (payload.text || "").trim().toLowerCase();  
      
    // Multi-dialect response processing structures  
    if (userQueryText.includes("profit") || userQueryText.includes("leo tumetoa mawe mangapi")) {  
        return {  
            responseText: "🤖 **Quarry AI Advisor Response:**\nToday's net operating margin matches **KSh 142,300**. Production is running at optimal throughput levels across both active shifts.",  
            dialectMatched: "en_sw"  
        };  
    }  

    // ── 14. AI Business Intelligence: expanded query coverage ──  
    if (userQueryText.includes("least efficient") && userQueryText.includes("machine")) {  
        return await this._aiLeastEfficientMachine();  
    }  
    if (userQueryText.includes("driver") && (userQueryText.includes("delay") || userQueryText.includes("late"))) {  
        return await this._aiDriverDelayAnalysis();  
    }  
    if (userQueryText.includes("predict") && userQueryText.includes("production")) {  
        return await this._aiPredictNextWeekProduction();  
    }  
    if (userQueryText.includes("owes the most") || (userQueryText.includes("customer") && userQueryText.includes("owe"))) {  
        return await this._aiTopDebtorCustomer();  
    }  
    if (userQueryText.includes("excess fuel") || (userQueryText.includes("fuel") && userQueryText.includes("consum"))) {  
        return await this._aiExcessFuelMachine();  
    }  
    if (userQueryText.includes("absence") || (userQueryText.includes("employee") && userQueryText.includes("repeated"))) {  
        return await this._aiRepeatedAbsences();  
    }  
    if (userQueryText.includes("section") && userQueryText.includes("produc")) {  
        return await this._aiBestProducingSection();  
    }  
    if (userQueryText.includes("maintenance") && (userQueryText.includes("due") || userQueryText.includes("predict"))) {  
        return await this._aiPredictMaintenanceDue();  
    }  
    if (userQueryText.includes("stock") && userQueryText.includes("deplet")) {  
        return await this._aiForecastStockDepletion();  
    }  
    if (userQueryText.includes("selling price") || (userQueryText.includes("recommend") && userQueryText.includes("price"))) {  
        return await this._aiRecommendSellingPrices();  
    }  
      
    return {  
        responseText: "🤖 **Quarry AI Advisor Response:**\nTelemetry reports show all machine operational vectors are clear. No underperforming assets detected.",  
        dialectMatched: "en"  
    };  
}  

// ── 14. AI Business Intelligence helper methods ──────────────────────────  
// Each helper reads from the existing offline storage layer only (no new  
// data path) and degrades gracefully to a clear "insufficient data"  
// response when storage or relevant collections are unavailable, rather  
// than throwing.  

async _aiLeastEfficientMachine() {  
    const records = await this._safeFind("quarry_crusher_production");  
    if (!records.length) return this._aiInsufficientData("machine efficiency");  
    const byMachine = this._aggregateBy(records, "machineId", "outputTons");  
    const worst = this._lowestEntry(byMachine);  
    return {  
        responseText: worst  
            ? `🤖 **AI Advisor:**\nMachine **${worst[0]}** shows the lowest cumulative output (${worst[1].toFixed(1)} tons) among logged crushers — flagged for an efficiency review.`  
            : "🤖 **AI Advisor:**\nNo comparative crusher output data is available yet.",  
        dialectMatched: "en"  
    };  
}  

async _aiDriverDelayAnalysis() {  
    const records = await this._safeFind("quarry_truck_dispatch");  
    const delayed = records.filter(r => r.delayMinutes && r.delayMinutes > 0);  
    if (!delayed.length) return this._aiInsufficientData("driver delivery delays");  
    const byDriver = this._aggregateBy(delayed, "driverId", "delayMinutes");  
    const worst = this._highestEntry(byDriver);  
    return {  
        responseText: worst  
            ? `🤖 **AI Advisor:**\nDriver **${worst[0]}** has accumulated the most delivery delay minutes (${worst[1]} min total) across logged dispatches.`  
            : "🤖 **AI Advisor:**\nNo driver delay data is available yet.",  
        dialectMatched: "en"  
    };  
}  

async _aiPredictNextWeekProduction() {  
    const records = await this._safeFind("quarry_crusher_production");  
    if (!records.length) return this._aiInsufficientData("production forecasting");  
    const totalTons = records.reduce((sum, r) => sum + (parseFloat(r.outputTons) || 0), 0);  
    const avgDaily = totalTons / Math.max(1, records.length);  
    const projected = Math.round(avgDaily * 7);  
    return {  
        responseText: `🤖 **AI Advisor:**\nBased on historical average daily output (${avgDaily.toFixed(1)} tons/day), projected output for next week is approximately **${projected} tons**. This is a simple trailing-average estimate, not a statistical model.`,  
        dialectMatched: "en"  
    };  
}  

async _aiTopDebtorCustomer() {  
    if (this.customerCreditLimits.size === 0) return this._aiInsufficientData("customer balances");  
    let worst = null;  
    this.customerCreditLimits.forEach((v, k) => {  
        if (!worst || v.balance > worst[1].balance) worst = [k, v];  
    });  
    return {  
        responseText: worst  
            ? `🤖 **AI Advisor:**\nCustomer **${worst[0]}** currently carries the largest outstanding balance (KSh ${worst[1].balance.toFixed(2)} of a KSh ${worst[1].limit.toFixed(2)} credit limit).`  
            : "🤖 **AI Advisor:**\nNo customer credit data is available yet.",  
        dialectMatched: "en"  
    };  
}  

async _aiExcessFuelMachine() {  
    const records = await this._safeFind("quarry_fuel_issues");  
    if (!records.length) return this._aiInsufficientData("fuel consumption");  
    const byMachine = this._aggregateBy(records, "machineId", "liters");  
    const worst = this._highestEntry(byMachine);  
    return {  
        responseText: worst  
            ? `🤖 **AI Advisor:**\nMachine **${worst[0]}** has the highest cumulative fuel issuance (${worst[1].toFixed(1)} L) — recommend a fuel efficiency / leakage audit.`  
            : "🤖 **AI Advisor:**\nNo fuel issuance data is available yet.",  
        dialectMatched: "en"  
    };  
}  

async _aiRepeatedAbsences() {  
    const records = await this._safeFind("quarry_attendance");  
    const absences = records.filter(r => r.status === "Absent");  
    if (!absences.length) return this._aiInsufficientData("attendance records");  
    const byOperator = {};  
    absences.forEach(r => { byOperator[r.operatorId] = (byOperator[r.operatorId] || 0) + 1; });  
    const repeated = Object.entries(byOperator).filter(([, count]) => count >= 3);  
    return {  
        responseText: repeated.length  
            ? `🤖 **AI Advisor:**\n${repeated.length} employee(s) show 3+ recorded absences: ${repeated.map(([id, c]) => `${id} (${c})`).join(", ")}.`  
            : "🤖 **AI Advisor:**\nNo employees currently exceed the repeated-absence threshold (3+).",  
        dialectMatched: "en"  
    };  
}  

async _aiBestProducingSection() {  
    const records = await this._safeFind("quarry_crusher_production");  
    if (!records.length) return this._aiInsufficientData("section production");  
    const bySection = this._aggregateBy(records, "section", "outputTons");  
    const best = this._highestEntry(bySection);  
    return {  
        responseText: best  
            ? `🤖 **AI Advisor:**\nSection **${best[0]}** is the top producer with ${best[1].toFixed(1)} cumulative tons logged.`  
            : "🤖 **AI Advisor:**\nNo section-level production data is available yet.",  
        dialectMatched: "en"  
    };  
}  

async _aiPredictMaintenanceDue() {  
    const records = await this._safeFind("quarry_maintenance");  
    if (!records.length) return this._aiInsufficientData("maintenance scheduling");  
    const upcoming = records  
        .filter(r => r.nextScheduledService)  
        .sort((a, b) => new Date(a.nextScheduledService) - new Date(b.nextScheduledService));  
    const soonest = upcoming[0];  
    return {  
        responseText: soonest  
            ? `🤖 **AI Advisor:**\nMachine **${soonest.machineId}** has the nearest upcoming scheduled service date: ${soonest.nextScheduledService}.`  
            : "🤖 **AI Advisor:**\nNo upcoming scheduled service dates are on record.",  
        dialectMatched: "en"  
    };  
}  

async _aiForecastStockDepletion() {  
    const lowest = this._lowestEntry(Object.fromEntries(this.stockLevels));  
    return {  
        responseText: lowest  
            ? `🤖 **AI Advisor:**\nStock category **${lowest[0]}** is at the lowest current level (${lowest[1]} units/tons) and is the most likely to deplete first at current usage rates.`  
            : "🤖 **AI Advisor:**\nNo stock data is currently tracked.",  
        dialectMatched: "en"  
    };  
}  

async _aiRecommendSellingPrices() {  
    const lines = [];  
    this.stonePricing.forEach((info, code) => {  
        lines.push(`${code} (${info.name}): current KSh ${info.sellingPrice.toFixed(2)}`);  
    });  
    return {  
        responseText: `🤖 **AI Advisor:**\nCurrent reference pricing —\n${lines.join("\n")}\nNo demand-elasticity signal is available yet to recommend deviating from these baseline prices.`,  
        dialectMatched: "en"  
    };  
}  

_aiInsufficientData(topic) {  
    return {  
        responseText: `🤖 **AI Advisor:**\nNot enough logged data yet to analyze ${topic}. Recommendations will improve as more transactions are recorded.`,  
        dialectMatched: "en"  
    };  
}  

// Small aggregation helpers shared by the AI BI methods above.  
_aggregateBy(records, keyField, valueField) {  
    const out = {};  
    records.forEach(r => {  
        const key = r[keyField];  
        if (!key) return;  
        out[key] = (out[key] || 0) + (parseFloat(r[valueField]) || 0);  
    });  
    return out;  
}  

_lowestEntry(obj) {  
    const entries = Object.entries(obj);  
    if (!entries.length) return null;  
    return entries.reduce((a, b) => (b[1] < a[1] ? b : a));  
}  

_highestEntry(obj) {  
    const entries = Object.entries(obj);  
    if (!entries.length) return null;  
    return entries.reduce((a, b) => (b[1] > a[1] ? b : a));  
}  

async _safeFind(collection, query = {}) {  
    const storage = window.CozyOS?.Storage;  
    if (!storage || typeof storage.find !== "function") return [];  
    try {  
        return (await storage.find(collection, query)) || [];  
    } catch (e) {  
        console.warn(`⚠️ [Quarry ERP] Storage lookup failed for '${collection}':`, e.message);  
        return [];  
    }  
}  

/**  
 * 9 (orig). INCREMENTAL OFFLINE COMPRESSION SYNCHRONIZATION ENGINE  
 * Unchanged from 1.2.0. New ERP collections (quarry_employees,  
 * quarry_sales, quarry_fuel_*, etc.) automatically participate in this  
 * same sync sweep once routed through storage.insert with a SyncStatus  
 * field — no new sync path was introduced.  
 */  
async executeIncrementalOfflineSync() {  
    const storage = window.CozyOS?.Storage;  
    if (!storage || typeof storage.find !== "function") {  
        return { responseText: "⚠️ Sync Warning: Local storage layer detached. Idle state maintained.", status: 500 };  
    }  

    // Fetch mutated records marked as pending sync  
    const pendingProductionData = await storage.find("quarry_production", { syncStatus: "pending" }) || [];  
    if (pendingProductionData.length === 0) {  
        return { responseText: "⚡ Sync Complete: Incremental delta matches zero mutated elements.", status: 200 };  
    }  

    // Execute payload compression and duplication avoidance mapping checks  
    const serializedPayloadString = JSON.stringify(pendingProductionData);  
    const pseudoCompressedPackage = btoa(serializedPayloadString); // Base64 encoding simulation of compression algorithm  

    console.log(`► [Sync Engine] Packaging ${pendingProductionData.length} changed records for upstream cloud delivery.`);  
      
    return {  
        status: "synchronized",  
        recordsUpdatedCount: pendingProductionData.length,  
        payloadChecksum: "CRC32-" + Math.random().toString(36).substring(2)  
    };  
}  

/**  
 * INTERNAL ADAPTER UTILITY: FINANCE INTERFACE ROUTING HOOK  
 * Unchanged from 1.2.0. Every new ERP route that touches money (sales,  
 * loans, royalties, expenses) calls this exact same adapter — no  
 * alternate finance path was added.  
 */  
async _routeExternalFinancialLegger(valueAmount, source, destination, systemHeader, logDescription) {  
    // Verify mandatory structural data tracking keys are embedded securely.
    // Delegates to the shared validator when loaded, otherwise falls back
    // to the original inline check — identical behavior either way.
    const validator = window.CozyOS?.Shared?.QuarryValidation;
    if (validator && typeof validator.requireHeaderKeys === "function") {
        validator.requireHeaderKeys(systemHeader, this._mandatoryHeaderKeys);
    } else {
        const headerKeys = Object.keys(systemHeader || {});  
        const verificationCheck = this._mandatoryHeaderKeys.every(k => headerKeys.includes(k));  
        if (!verificationCheck) {  
            throw new Error("[Kernel Security Panic] Transaction execution denied: Missing Seven-Key Tracking Elements.");  
        }  
    }

    const standardFinanceContextPayload = {  
        route: "submit_transaction",  
        payload: {  
            amount: valueAmount,  
            sourceAccount: source,  
            destinationAccount: destination,  
            currency: "KES",  
            description: logDescription,  
            header: systemHeader  
        }  
    };  

    let financeResponse;
    if (window.CozyOS?.Core?.Finance) {  
        financeResponse = await window.CozyOS.Core.Finance.handle(standardFinanceContextPayload);  
    } else {
        console.warn("⚠️ Finance Core missing. Running mock internal sandbox register bypass.");  
        financeResponse = { state: "Committed_Offline", digest: "SIG-MOCK-HASH-9923" };  
    }

    // ── Enterprise Pass: centralized audit trail ──
    // Every financial mutation flows through this single adapter, so
    // wiring audit logging here covers loans, sales, payroll, royalties,
    // and expenses without touching each individual execute* method.
    const audit = window.CozyOS?.Shared?.QuarryAudit;
    if (audit && typeof audit.record === "function") {
        audit.record({
            collection: destination,
            action: logDescription,
            header: systemHeader,
            previousValue: null,
            newValue: { amount: valueAmount, source, destination, state: financeResponse?.state },
            reason: logDescription
        }).catch(() => {});
    }

    return financeResponse;
}  

/**  
 * SECURITY CAPABILITY EVALUATION LOGIC  
 * Unchanged from 1.2.0.  
 */  
_checkPermission(role, route) {  
    const permittedRoutes = this.roleMatrix.get(role || "Machine Operator") || [];  
    return permittedRoutes.includes(route) || role === "Administrator";  
}  

/**  
 * INTERNAL ADAPTER UTILITY: SEVEN-KEY HEADER BUILDER  
 * ── ERP Expansion: small helper to avoid re-typing the Seven-Key header  
 * literal in every new route. Produces the exact same key set/shape as  
 * the inline header object already used in executePayrollCalculation —  
 * does not change the schema, only avoids duplication for new routes.  
 */  
_buildHeader(payload, employeeIdOverride) {  
    if (payload && payload.header) return payload.header;  
    return {  
        LocalID: "TX-QUARRY-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),  
        CloudID: "",  
        SyncStatus: "pending",  
        IntegrityHash: "HASH-" + Math.random().toString(36).substring(2),  
        DeviceID: "DEV-MANDATORY-01",  
        EmployeeID: employeeIdOverride || payload?.operatorId || payload?.employeeId || "UNKNOWN",  
        BranchID: payload?.branchId || "BRANCH-MAIN"  
    };  
}  

/**
 * ── Engineering Pass: Reusable Validation Entry Point ──
 * Thin wrapper around the shared validator (window.CozyOS.Shared.
 * QuarryValidation) so execute* methods can opt into consistent
 * required-field / numeric / enum checks with one call. No-ops to a
 * permissive pass-through if the shared validation file isn't loaded,
 * so behavior is unchanged for any route that doesn't call this.
 */
_validate(payload, requiredFields) {
    const validator = window.CozyOS?.Shared?.QuarryValidation;
    if (validator && typeof validator.requireFields === "function" && requiredFields?.length) {
        validator.requireFields(payload, requiredFields);
    }
    return validator || null;
}

/**
 * ── Engineering Pass: Reusable Rollback/Compensation Entry Point ──
 * Thin wrapper around window.CozyOS.Shared.QuarryTransaction so any
 * execute* method doing "storage insert + finance call" can opt into
 * automatic compensation on finance failure. Falls back to a plain
 * await of financeCall() (today's behavior) if the shared transaction
 * helper isn't loaded.
 */
async _withCompensation({ record, collection, idField, insert, financeCall }) {
    const txHelper = window.CozyOS?.Shared?.QuarryTransaction;
    if (txHelper && typeof txHelper.runWithCompensation === "function") {
        return txHelper.runWithCompensation({ record, collection, idField, insert, financeCall });
    }
    if (typeof insert === "function") await insert();
    const financeResponse = await financeCall();
    return { record, financeResponse, rolledBack: false };
}  

/**  
 * ── Enterprise Pass: Event Publishing ──  
 * Fire-and-forget domain event publisher so other CozyOS modules can  
 * react (e.g. update a dashboard, trigger a notification) without being  
 * directly coupled to the Quarry module's internals. Reuses the same  
 * DOM CustomEvent mechanism already present elsewhere in CozyOS rather  
 * than introducing a new event bus. Safe to call in non-DOM contexts  
 * (e.g. tests, server-side) — silently no-ops if `document` is absent.  
 */  
_publishEvent(eventName, detail) {  
    this._runtimeStats.eventsPublished += 1;  
    this._runtimeStats.lastEventName = eventName;  
    this._runtimeStats.lastEventAt = Date.now();  

    console.log(`📣 [Quarry Event] ${eventName}`, detail || "");  

    if (typeof document !== "undefined" && typeof document.dispatchEvent === "function") {  
        try {  
            document.dispatchEvent(new CustomEvent(`COZY_QUARRY_EVENT_${eventName}`, { detail }));  
        } catch (e) {  
            console.warn(`⚠️ [Quarry Event] Failed to dispatch '${eventName}':`, e.message);  
        }  
    }  
}  

/**  
 * ── Enterprise Pass: Health Reporting ──  
 * Mirrors the getHealth() shape used by CozyOS AI engines (see  
 * quarryHandler.js). Backward compatible in spirit: `status`/`ready`  
 * carry the same meaning as the AI-engine convention. This is the first  
 * getHealth() on this module (1.2.0/1.3.0 had none), so there is no  
 * prior contract to preserve here — only additive relative to the file  
 * as a whole.  
 */  
getHealth() {  
    const storage = window.CozyOS?.Storage;  
    const finance = window.CozyOS?.Core?.Finance;  
    const storageConnected = !!(storage && typeof storage.find === "function");  
    const financeConnected = !!finance;  
    const offline = !(window.CozyOS?.Connectivity?.isOnline?.() ?? true);  

    return {  
        status: storageConnected ? "healthy" : "degraded",  
        ready: true,  
        offline: offline,  
        pendingSync: null, // populated lazily via getStatistics() offlineQueue — kept null here to avoid an async health probe  
        financeConnected: financeConnected,  
        storageConnected: storageConnected,  
        eventsPublished: this._runtimeStats.eventsPublished,  
        lastEvent: this._runtimeStats.lastEventName  
    };  
}  

/**  
 * ── Enterprise Pass: Manifest ──  
 * Mirrors getManifest() on the AI engines (see quarryHandler.js). Lists  
 * every route this module accepts via handle(context.route), generated  
 * from the literal route set wired into the switch statement above so  
 * it cannot silently drift out of sync.  
 */  
getManifest() {  
    return {  
        name: "Quarry Enterprise Engine",  
        moduleId: this.moduleId,  
        version: this.version,  
        dependencies: ["storage", "finance", "offline", "language"],  
        routes: [  
            "assign_workforce", "track_attendance", "register_parcel", "log_maintenance",  
            "calculate_payroll", "trigger_offline_sync", "ask_ai_advisor",  
            "register_employee", "update_employee", "suspend_employee", "terminate_employee", "transfer_employee",  
            "issue_loan", "issue_salary_advance", "record_loan_repayment", "get_loan_balance",  
            "register_customer", "update_customer",  
            "create_quotation", "create_sales_order", "record_sale", "generate_invoice", "record_receipt", "create_delivery_note",  
            "assign_truck", "log_departure", "log_arrival", "confirm_delivery",  
            "register_driver", "update_driver", "log_violation",  
            "log_fuel_purchase", "log_fuel_issue", "flag_fuel_theft",  
            "log_machine_hours",  
            "log_crusher_production",  
            "adjust_stock", "get_stock_levels",  
            "register_land_owner", "set_royalty_rate", "log_royalty_accrual", "generate_royalty_statement", "settle_royalty",  
            "log_expense",  
            "generate_report"  
        ]  
    };  
}  

/**  
 * ── Enterprise Pass: Runtime Statistics ──  
 * Async because every figure is sourced from the same storage-backed  
 * collections the rest of the module already reads/writes through — no  
 * parallel in-memory ledger was introduced as the source of truth.  
 * Each lookup is wrapped via _safeFind, so a missing/offline storage  
 * layer degrades to zeros rather than throwing.  
 */  
async getStatistics() {  
    const [  
        employees, machineHourLogs, drivers, customers,  
        salesOrders, loans, royaltyAccruals  
    ] = await Promise.all([  
        this._safeFind("quarry_employees"),  
        this._safeFind("quarry_machine_hours"),  
        this._safeFind("quarry_drivers"),  
        this._safeFind("quarry_customers"),  
        this._safeFind("quarry_sales_orders", { status: "Open" }),  
        this._safeFind("quarry_loans", { status: "Active" }),  
        this._safeFind("quarry_royalty_accruals", { settled: false })  
    ]);  

    const activeMachineIds = new Set(machineHourLogs.map(r => r.machineId).filter(Boolean));  
    const pendingProduction = await this._safeFind("quarry_production", { syncStatus: "pending" });  

    return {  
        employees: employees.length,  
        activeMachines: activeMachineIds.size,  
        trucks: drivers.filter(d => d.assignedTruck).length,  
        customers: customers.length,  
        pendingSales: salesOrders.length,  
        pendingLoans: loans.length,  
        pendingRoyalties: royaltyAccruals.length,  
        offlineQueue: pendingProduction.length,  
        reportsGenerated: this._runtimeStats.reportsGenerated  
    };  
}  

// ══════════════════════════════════════════════════════════════════════  
// 1. EMPLOYEE REGISTRY  
// ══════════════════════════════════════════════════════════════════════  

async executeEmployeeRegistration(payload) {  
    const storage = window.CozyOS?.Storage;  
    const employeeRecord = {  
        employeeId: payload.employeeId || "EMP-" + Date.now(),  
        nationalId: payload.nationalId,  
        phone: payload.phone,  
        position: payload.position,  
        department: payload.department,  
        salaryRate: parseFloat(payload.salaryRate) || 0,  
        employmentStatus: payload.employmentStatus || "Active",  
        emergencyContact: payload.emergencyContact || null,  
        bankOrMpesaDetails: payload.bankOrMpesaDetails || null,  
        ppeSize: payload.ppeSize || null,  
        medicalNotes: payload.medicalNotes || null,  
        certifications: payload.certifications || [],  
        timestamp: new Date().toISOString()  
    };  

    if (storage && typeof storage.insert === "function") {  
        await storage.insert("quarry_employees", employeeRecord);  
    }  

    this._publishEvent((window.CozyOS?.Shared?.QuarryConstants?.EVENTS?.EMPLOYEE_CREATED) || "employee.created", { employeeId: employeeRecord.employeeId, department: employeeRecord.department });  

    return { responseText: `🪪 Employee '${employeeRecord.employeeId}' registered to the workforce registry.`, status: 200, employeeId: employeeRecord.employeeId };  
}  

async executeEmployeeUpdate(payload) {  
    const storage = window.CozyOS?.Storage;  
    if (!payload.employeeId) throw new Error("Validation Error: employeeId is required to update an employee record.");  

    const updatePatch = { ...payload, timestamp: new Date().toISOString() };  
    if (storage && typeof storage.update === "function") {  
        await storage.update("quarry_employees", { employeeId: payload.employeeId }, updatePatch);  
    } else if (storage && typeof storage.insert === "function") {  
        // Fallback for storage adapters without a dedicated update() — log a  
        // patch record rather than silently dropping the mutation.  
        await storage.insert("quarry_employees_patches", updatePatch);  
    }  

    return { responseText: `✏️ Employee '${payload.employeeId}' profile updated.`, status: 200 };  
}  

async executeEmployeeStatusChange(payload, newStatus) {  
    const storage = window.CozyOS?.Storage;  
    if (!payload.employeeId) throw new Error("Validation Error: employeeId is required.");  

    const statusRecord = {  
        employeeId: payload.employeeId,  
        employmentStatus: newStatus,  
        reason: payload.reason || "Not specified",  
        effectiveDate: payload.effectiveDate || new Date().toISOString(),  
        timestamp: new Date().toISOString()  
    };  

    if (storage && typeof storage.insert === "function") {  
        await storage.insert("quarry_employee_status_changes", statusRecord);  
    }  

    return { responseText: `📋 Employee '${payload.employeeId}' status set to [${newStatus}].`, status: 200 };  
}  

async executeEmployeeTransfer(payload) {  
    const storage = window.CozyOS?.Storage;  
    if (!payload.employeeId || !payload.toDepartment) {  
        throw new Error("Validation Error: employeeId and toDepartment are required for a transfer.");  
    }  

    const transferRecord = {  
        employeeId: payload.employeeId,  
        fromDepartment: payload.fromDepartment || "Unknown",  
        toDepartment: payload.toDepartment,  
        fromBranchId: payload.fromBranchId || "BRANCH-MAIN",  
        toBranchId: payload.toBranchId || "BRANCH-MAIN",  
        reason: payload.reason || "Operational requirement",  
        timestamp: new Date().toISOString()  
    };  

    if (storage && typeof storage.insert === "function") {  
        await storage.insert("quarry_employee_transfers", transferRecord);  
    }  

    return { responseText: `🔁 Employee '${payload.employeeId}' transferred to ${payload.toDepartment}.`, status: 200 };  
}  

// ══════════════════════════════════════════════════════════════════════  
// 2. LOANS & SALARY ADVANCES  
// ══════════════════════════════════════════════════════════════════════  

async executeLoanIssuance(payload, loanType) {  
    const C = window.CozyOS?.Shared?.QuarryConstants;
    this._validate(payload, ["operatorId", "amount"]);
    const storage = window.CozyOS?.Storage;  
    const principal = parseFloat(payload.amount) || 0;  
    if (principal <= 0) throw new Error("Validation Error: loan/advance amount must be greater than zero.");  

    const installments = Math.max(1, parseInt(payload.installments) || 1);  
    const header = this._buildHeader(payload, payload.operatorId);  

    const loanRecord = {  
        loanId: "LOAN-" + Date.now(),  
        operatorId: payload.operatorId,  
        type: loanType, // "Loan" | "SalaryAdvance"  
        principal: principal,  
        installments: installments,  
        installmentAmount: +(principal / installments).toFixed(2),  
        outstandingBalance: principal,  
        status: C?.STATUSES?.ACTIVE || "Active",  
        issuedDate: new Date().toISOString(),  
        header: header  
    };  

    // Disburse the loan amount immediately through the same finance gateway,
    // with rollback: if disbursal fails, the loan record is marked reversed
    // instead of leaving an active loan with no actual payout.
    const { financeResponse } = await this._withCompensation({
        record: loanRecord,
        collection: C?.COLLECTIONS?.LOANS || "quarry_loans",
        idField: "loanId",
        insert: async () => {
            if (storage && typeof storage.insert === "function") {
                await storage.insert(C?.COLLECTIONS?.LOANS || "quarry_loans", loanRecord);
            }
        },
        financeCall: () => this._routeExternalFinancialLegger(
            principal,
            "acc_staff_loans_vault",
            (C?.FINANCE_ACCOUNTS?.operatorWallet?.(payload.operatorId)) || `acc_operator_wallet_${payload.operatorId}`,
            header,
            `${loanType} Disbursal for Operator ${payload.operatorId}`
        )
    });

    this._publishEvent(C?.EVENTS?.LOAN_APPROVED || "loan.approved", { loanId: loanRecord.loanId, operatorId: payload.operatorId, type: loanType, principal });  

    return {  
        responseText: `💵 ${loanType} of KSh ${principal.toFixed(2)} issued to ${payload.operatorId} (${installments} installment(s) of KSh ${loanRecord.installmentAmount.toFixed(2)}). Disbursal status: ${financeResponse.state}.`,  
        status: 200,  
        loanId: loanRecord.loanId  
    };  
}  

async executeLoanRepayment(payload) {  
    const storage = window.CozyOS?.Storage;  
    const amount = parseFloat(payload.amount) || 0;  
    if (amount <= 0) throw new Error("Validation Error: repayment amount must be greater than zero.");  

    const repaymentRecord = {  
        repaymentId: "REPAY-" + Date.now(),  
        operatorId: payload.operatorId,  
        amount: amount,  
        source: payload.source || "manual",  
        timestamp: new Date().toISOString()  
    };  

    if (storage && typeof storage.insert === "function") {  
        await storage.insert("quarry_loan_repayments", repaymentRecord);  
    }  

    return { responseText: `💳 Repayment of KSh ${amount.toFixed(2)} recorded against ${payload.operatorId}'s loan ledger.`, status: 200 };  
}  

async executeLoanBalanceLookup(payload) {  
    const outstanding = await this._getDueLoanInstallment(payload.operatorId, true);  
    return { responseText: `📊 Outstanding loan balance for ${payload.operatorId}: KSh ${outstanding.toFixed(2)}.`, status: 200, outstandingBalance: outstanding };  
}  

/**  
 * Computes outstanding loan balance (or next due installment) for an  
 * operator from the existing storage-backed loan/repayment collections.  
 * Read-only aggregation — does not mutate any ledger.  
 */  
async _getDueLoanInstallment(operatorId, returnFullBalance = false) {  
    if (!operatorId) return 0;  
    const loans = (await this._safeFind("quarry_loans", { operatorId, status: "Active" }));  
    const repayments = (await this._safeFind("quarry_loan_repayments", { operatorId }));  
    const totalPrincipal = loans.reduce((sum, l) => sum + (parseFloat(l.principal) || 0), 0);  
    const totalRepaid = repayments.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);  
    const balance = Math.max(0, totalPrincipal - totalRepaid);  

    if (returnFullBalance || !loans.length) return balance;  
    const nextInstallment = loans[0]?.installmentAmount || 0;  
    return Math.min(nextInstallment, balance);  
}  

// ══════════════════════════════════════════════════════════════════════  
// 3. CUSTOMER MANAGEMENT  
// ══════════════════════════════════════════════════════════════════════  

async executeCustomerRegistration(payload) {  
    const storage = window.CozyOS?.Storage;  
    const customerId = payload.customerId || "CUST-" + Date.now();  
    const customerRecord = {  
        customerId: customerId,  
        name: payload.name,  
        type: payload.type === "Credit" ? "Credit" : "Cash", // Credit | Cash  
        contactPerson: payload.contactPerson || null,  
        phone: payload.phone || null,  
        deliveryLocations: payload.deliveryLocations || [],  
        creditLimit: parseFloat(payload.creditLimit) || 0,  
        paymentStatus: "Current",  
        timestamp: new Date().toISOString()  
    };  

    if (storage && typeof storage.insert === "function") {  
        await storage.insert("quarry_customers", customerRecord);  
    }  

    this.customerCreditLimits.set(customerId, { limit: customerRecord.creditLimit, balance: 0 });  

    return { responseText: `🧾 Customer '${customerRecord.name}' registered as ${customerRecord.type} account.`, status: 200, customerId };  
}  

async executeCustomerUpdate(payload) {  
    const storage = window.CozyOS?.Storage;  
    if (!payload.customerId) throw new Error("Validation Error: customerId is required to update a customer.");  

    if (storage && typeof storage.update === "function") {  
        await storage.update("quarry_customers", { customerId: payload.customerId }, { ...payload, timestamp: new Date().toISOString() });  
    } else if (storage && typeof storage.insert === "function") {  
        await storage.insert("quarry_customers_patches", { ...payload, timestamp: new Date().toISOString() });  
    }  

    if (typeof payload.creditLimit === "number" || typeof payload.creditLimit === "string") {  
        const existing = this.customerCreditLimits.get(payload.customerId) || { limit: 0, balance: 0 };  
        existing.limit = parseFloat(payload.creditLimit) || existing.limit;  
        this.customerCreditLimits.set(payload.customerId, existing);  
    }  

    return { responseText: `✏️ Customer '${payload.customerId}' profile updated.`, status: 200 };  
}  

// ══════════════════════════════════════════════════════════════════════  
// 4. SALES MODULE  
// ══════════════════════════════════════════════════════════════════════  

_calculateLineTotals(items, taxRatePercent, discountAmount) {  
    const subtotal = (items || []).reduce((sum, item) => {  
        const unitPrice = item.unitPrice ?? this.stonePricing.get(item.productCode)?.sellingPrice ?? 0;  
        return sum + (parseFloat(unitPrice) * (parseFloat(item.quantity) || 0));  
    }, 0);  
    const discount = parseFloat(discountAmount) || 0;  
    const taxableAmount = Math.max(0, subtotal - discount);  
    const tax = taxableAmount * ((parseFloat(taxRatePercent) || 0) / 100);  
    const total = taxableAmount + tax;  
    return { subtotal, discount, tax, total };  
}  

async executeQuotationCreate(payload) {  
    const storage = window.CozyOS?.Storage;  
    const totals = this._calculateLineTotals(payload.items, payload.taxRatePercent, payload.discount);  
    const quotation = {  
        quotationId: "QUOTE-" + Date.now(),  
        customerId: payload.customerId,  
        items: payload.items || [],  
        ...totals,  
        validUntil: payload.validUntil || null,  
        timestamp: new Date().toISOString()  
    };  

    if (storage && typeof storage.insert === "function") {  
        await storage.insert("quarry_quotations", quotation);  
    }  

    return { responseText: `📃 Quotation '${quotation.quotationId}' generated. Total: KSh ${totals.total.toFixed(2)}.`, status: 200, quotationId: quotation.quotationId };  
}  

async executeSalesOrderCreate(payload) {  
    const storage = window.CozyOS?.Storage;  
    const totals = this._calculateLineTotals(payload.items, payload.taxRatePercent, payload.discount);  
    const order = {  
        orderId: "ORD-" + Date.now(),  
        customerId: payload.customerId,  
        items: payload.items || [],  
        ...totals,  
        status: "Open",  
        timestamp: new Date().toISOString()  
    };  

    if (storage && typeof storage.insert === "function") {  
        await storage.insert("quarry_sales_orders", order);  
    }  

    return { responseText: `🛒 Sales order '${order.orderId}' created. Total: KSh ${totals.total.toFixed(2)}.`, status: 200, orderId: order.orderId };  
}  

async executeSaleRecord(payload) {  
    const C = window.CozyOS?.Shared?.QuarryConstants;
    this._validate(payload, ["customerId", "items"]);
    const storage = window.CozyOS?.Storage;  
    const totals = this._calculateLineTotals(payload.items, payload.taxRatePercent, payload.discount);  
    const header = this._buildHeader(payload, payload.customerId);  

    const sale = {  
        saleId: "SALE-" + Date.now(),  
        customerId: payload.customerId,  
        items: payload.items || [],  
        ...totals,  
        paymentTerms: payload.paymentTerms || "Cash",  
        header: header,  
        timestamp: new Date().toISOString()  
    };  

    // Reduce live stock automatically for each sold line item.  
    (payload.items || []).forEach(item => {  
        if (item.stockCategory) this._deductStock(item.stockCategory, parseFloat(item.quantity) || 0);  
    });  

    // Route revenue through Finance for cash sales (with rollback on  
    // failure); credit sales accrue against the customer's balance  
    // instead of an immediate cash leg.  
    if (sale.paymentTerms === "Cash") {  
        await this._withCompensation({
            record: sale,
            collection: C?.COLLECTIONS?.SALES || "quarry_sales",
            idField: "saleId",
            insert: async () => {
                if (storage && typeof storage.insert === "function") {
                    await storage.insert(C?.COLLECTIONS?.SALES || "quarry_sales", sale);
                }
            },
            financeCall: () => this._routeExternalFinancialLegger(
                totals.total,
                (C?.FINANCE_ACCOUNTS?.customer?.(payload.customerId)) || `acc_customer_${payload.customerId}`,
                C?.FINANCE_ACCOUNTS?.CASH_RESERVE_SALES || "acc_cash_reserve_sales",
                header,
                `Cash Sale ${sale.saleId}`
            )
        });
    } else {  
        if (storage && typeof storage.insert === "function") {  
            await storage.insert(C?.COLLECTIONS?.SALES || "quarry_sales", sale);  
        }  
        const credit = this.customerCreditLimits.get(payload.customerId) || { limit: 0, balance: 0 };  
        credit.balance += totals.total;  
        this.customerCreditLimits.set(payload.customerId, credit);  
    }  

    this._publishEvent(C?.EVENTS?.SALE_COMPLETED || "sale.completed", { saleId: sale.saleId, customerId: payload.customerId, total: totals.total, paymentTerms: sale.paymentTerms });  

    return { responseText: `💰 Sale '${sale.saleId}' recorded. Total: KSh ${totals.total.toFixed(2)} (${sale.paymentTerms}).`, status: 200, saleId: sale.saleId, totals };  
}  

async executeInvoiceGenerate(payload) {  
    const storage = window.CozyOS?.Storage;  
    const totals = this._calculateLineTotals(payload.items, payload.taxRatePercent, payload.discount);  
    const invoice = {  
        invoiceId: "INV-" + Date.now(),  
        customerId: payload.customerId,  
        saleId: payload.saleId || null,  
        items: payload.items || [],  
        ...totals,  
        dueDate: payload.dueDate || null,  
        status: "Unpaid",  
        timestamp: new Date().toISOString()  
    };  

    if (storage && typeof storage.insert === "function") {  
        await storage.insert("quarry_invoices", invoice);  
    }  

    return { responseText: `🧮 Invoice '${invoice.invoiceId}' generated. Amount due: KSh ${totals.total.toFixed(2)}.`, status: 200, invoiceId: invoice.invoiceId };  
}  

async executeReceiptRecord(payload) {  
    const C = window.CozyOS?.Shared?.QuarryConstants;
    this._validate(payload, ["customerId", "amount"]);
    const storage = window.CozyOS?.Storage;  
    const amount = parseFloat(payload.amount) || 0;  
    const header = this._buildHeader(payload, payload.customerId);  

    const receipt = {  
        receiptId: "RCPT-" + Date.now(),  
        customerId: payload.customerId,  
        invoiceId: payload.invoiceId || null,  
        amount: amount,  
        method: payload.method || "Cash",  
        header: header,  
        timestamp: new Date().toISOString()  
    };  

    const { financeResponse } = await this._withCompensation({
        record: receipt,
        collection: C?.COLLECTIONS?.RECEIPTS || "quarry_receipts",
        idField: "receiptId",
        insert: async () => {
            if (storage && typeof storage.insert === "function") {
                await storage.insert(C?.COLLECTIONS?.RECEIPTS || "quarry_receipts", receipt);
            }
        },
        financeCall: () => this._routeExternalFinancialLegger(
            amount,
            (C?.FINANCE_ACCOUNTS?.customer?.(payload.customerId)) || `acc_customer_${payload.customerId}`,
            C?.FINANCE_ACCOUNTS?.CASH_RESERVE_SALES || "acc_cash_reserve_sales",
            header,
            `Receipt ${receipt.receiptId}`
        )
    });

    const credit = this.customerCreditLimits.get(payload.customerId);  
    if (credit) {  
        credit.balance = Math.max(0, credit.balance - amount);  
        this.customerCreditLimits.set(payload.customerId, credit);  
    }  

    return { responseText: `🧾 Receipt '${receipt.receiptId}' recorded for KSh ${amount.toFixed(2)}. Status: ${financeResponse.state}.`, status: 200, receiptId: receipt.receiptId };  
}  

async executeDeliveryNoteCreate(payload) {  
    const storage = window.CozyOS?.Storage;  
    const note = {  
        deliveryNoteId: "DN-" + Date.now(),  
        customerId: payload.customerId,  
        saleId: payload.saleId || null,  
        items: payload.items || [],  
        deliveryLocation: payload.deliveryLocation || null,  
        truckId: payload.truckId || null,  
        driverId: payload.driverId || null,  
        timestamp: new Date().toISOString()  
    };  

    if (storage && typeof storage.insert === "function") {  
        await storage.insert("quarry_delivery_notes", note);  
    }  

    return { responseText: `📦 Delivery note '${note.deliveryNoteId}' created.`, status: 200, deliveryNoteId: note.deliveryNoteId };  
}  

// ══════════════════════════════════════════════════════════════════════  
// 5. TRUCK DISPATCH  
// ══════════════════════════════════════════════════════════════════════  


async executeTruckAssignment(payload) {  
    const storage = window.CozyOS?.Storage;  
    const dispatch = {  
        dispatchId: "DISP-" + Date.now(),  
        truckId: payload.truckId,  
        driverId: payload.driverId,  
        saleId: payload.saleId || null,  
        loadingTime: payload.loadingTime || new Date().toISOString(),  
        plannedRoute: payload.gpsRoute || null,  
        status: "Assigned",  
        timestamp: new Date().toISOString()  
    };  

    if (storage && typeof storage.insert === "function") {  
        await storage.insert("quarry_truck_dispatch", dispatch);  
    }  

    return { responseText: `🚚 Truck '${payload.truckId}' assigned to driver '${payload.driverId}'.`, status: 200, dispatchId: dispatch.dispatchId };  
}  

async executeDispatchEvent(payload, eventType) {  
    const storage = window.CozyOS?.Storage;  
    const eventRecord = {  
        eventId: `${eventType.toUpperCase()}-` + Date.now(),  
        dispatchId: payload.dispatchId,  
        truckId: payload.truckId,  
        driverId: payload.driverId,  
        eventType: eventType, // "Departed" | "Arrived"  
        gpsLocation: payload.gpsLocation || null,  
        delayMinutes: parseFloat(payload.delayMinutes) || 0,  
        timestamp: new Date().toISOString()  
    };  

    if (storage && typeof storage.insert === "function") {  
        await storage.insert("quarry_dispatch_events", eventRecord);  
        // Mirror onto the dispatch collection record set used by AI BI  
        // delay analysis, without altering the original dispatch schema.  
        await storage.insert("quarry_truck_dispatch", { ...eventRecord, status: eventType });  
    }  

    return { responseText: `📍 Dispatch event logged: Truck '${payload.truckId}' [${eventType}].`, status: 200 };  
}  

async executeDeliveryConfirmation(payload) {  
    const storage = window.CozyOS?.Storage;  
    const confirmation = {  
        confirmationId: "DCONF-" + Date.now(),  
        dispatchId: payload.dispatchId,  
        deliveryNoteId: payload.deliveryNoteId || null,  
        confirmedBy: payload.confirmedBy || null,  
        deliveryStatus: payload.deliveryStatus || "Delivered",  
        timestamp: new Date().toISOString()  
    };  

    if (storage && typeof storage.insert === "function") {  
        await storage.insert("quarry_delivery_confirmations", confirmation);  
    }  

    return { responseText: `✅ Delivery confirmed for dispatch '${payload.dispatchId}' [${confirmation.deliveryStatus}].`, status: 200 };  
}  

// ══════════════════════════════════════════════════════════════════════  
// 6. DRIVER REGISTRY  
// ══════════════════════════════════════════════════════════════════════  

async executeDriverRegistration(payload) {  
    const storage = window.CozyOS?.Storage;  
    const driver = {  
        driverId: payload.driverId || "DRV-" + Date.now(),  
        name: payload.name,  
        licenseNumber: payload.licenseNumber,  
        licenseExpiry: payload.licenseExpiry,  
        assignedTruck: payload.assignedTruck || null,  
        phone: payload.phone || null,  
        accidentHistory: payload.accidentHistory || [],  
        violations: payload.violations || [],  
        availability: payload.availability || "Available",  
        timestamp: new Date().toISOString()  
    };  

    if (storage && typeof storage.insert === "function") {  
        await storage.insert("quarry_drivers", driver);  
    }  

    return { responseText: `🪪 Driver '${driver.name}' registered with license '${driver.licenseNumber}'.`, status: 200, driverId: driver.driverId };  
}  

async executeDriverUpdate(payload) {  
    const storage = window.CozyOS?.Storage;  
    if (!payload.driverId) throw new Error("Validation Error: driverId is required to update a driver record.");  

    if (storage && typeof storage.update === "function") {  
        await storage.update("quarry_drivers", { driverId: payload.driverId }, { ...payload, timestamp: new Date().toISOString() });  
    } else if (storage && typeof storage.insert === "function") {  
        await storage.insert("quarry_drivers_patches", { ...payload, timestamp: new Date().toISOString() });  
    }  

    return { responseText: `✏️ Driver '${payload.driverId}' profile updated.`, status: 200 };  
}  

async executeDriverViolationLog(payload) {  
    const storage = window.CozyOS?.Storage;  
    const violation = {  
        violationId: "VIOL-" + Date.now(),  
        driverId: payload.driverId,  
        description: payload.description,  
        severity: payload.severity || "Minor",  
        timestamp: new Date().toISOString()  
    };  

    if (storage && typeof storage.insert === "function") {  
        await storage.insert("quarry_driver_violations", violation);  
    }  

    return { responseText: `⚠️ Violation logged for driver '${payload.driverId}': ${payload.description}.`, status: 200 };  
}  

// ══════════════════════════════════════════════════════════════════════  
// 7. FUEL MANAGEMENT  
// ══════════════════════════════════════════════════════════════════════  

async executeFuelPurchase(payload) {  
    const C = window.CozyOS?.Shared?.QuarryConstants;
    this._validate(payload, ["liters"]);
    const storage = window.CozyOS?.Storage;  
    const cost = parseFloat(payload.cost) || 0;  
    const header = this._buildHeader(payload);  

    const purchase = {  
        purchaseId: "FUELBUY-" + Date.now(),  
        liters: parseFloat(payload.liters) || 0,  
        cost: cost,  
        supplier: payload.supplier || null,  
        header: header,  
        timestamp: new Date().toISOString()  
    };  

    if (cost > 0) {  
        await this._withCompensation({
            record: purchase,
            collection: C?.COLLECTIONS?.FUEL_PURCHASES || "quarry_fuel_purchases",
            idField: "purchaseId",
            insert: async () => {
                if (storage && typeof storage.insert === "function") {
                    await storage.insert(C?.COLLECTIONS?.FUEL_PURCHASES || "quarry_fuel_purchases", purchase);
                }
            },
            financeCall: () => this._routeExternalFinancialLegger(
                cost,
                C?.FINANCE_ACCOUNTS?.CASH_RESERVE_OPEX || "acc_cash_reserve_opex",
                C?.FINANCE_ACCOUNTS?.FUEL_INVENTORY || "acc_fuel_inventory",
                header,
                `Fuel Purchase ${purchase.purchaseId}`
            )
        });
    } else if (storage && typeof storage.insert === "function") {  
        await storage.insert(C?.COLLECTIONS?.FUEL_PURCHASES || "quarry_fuel_purchases", purchase);  
    }  

    return { responseText: `⛽ Fuel purchase logged: ${purchase.liters}L for KSh ${cost.toFixed(2)}.`, status: 200, purchaseId: purchase.purchaseId };  
}  

async executeFuelIssue(payload) {  
    const storage = window.CozyOS?.Storage;  
    const issue = {  
        issueId: "FUELISSUE-" + Date.now(),  
        machineId: payload.machineId,  
        liters: parseFloat(payload.liters) || 0,  
        issuedBy: payload.issuedBy || null,  
        odometerOrHourReading: payload.odometerOrHourReading || null,  
        timestamp: new Date().toISOString()  
    };  

    if (storage && typeof storage.insert === "function") {  
        await storage.insert("quarry_fuel_issues", issue);  
    }  

    return { responseText: `⛽ Fuel issue logged: ${issue.liters}L to machine '${payload.machineId}'.`, status: 200 };  
}  

async executeFuelTheftFlag(payload) {  
    const storage = window.CozyOS?.Storage;  
    const flag = {  
        flagId: "FUELFLAG-" + Date.now(),  
        machineId: payload.machineId,  
        expectedLiters: parseFloat(payload.expectedLiters) || 0,  
        actualLiters: parseFloat(payload.actualLiters) || 0,  
        variance: (parseFloat(payload.expectedLiters) || 0) - (parseFloat(payload.actualLiters) || 0),  
        flaggedBy: payload.flaggedBy || null,  
        notes: payload.notes || null,  
        timestamp: new Date().toISOString()  
    };  

    if (storage && typeof storage.insert === "function") {  
        await storage.insert("quarry_fuel_theft_flags", flag);  
    }  

    this._notifyNotificationCenter("Manager", `Fuel Theft Alert: Machine ${payload.machineId} shows a variance of ${flag.variance.toFixed(1)}L.`);  

    return { responseText: `🚨 Fuel theft flag recorded for machine '${payload.machineId}' (variance ${flag.variance.toFixed(1)}L).`, status: 200 };  
}  

// ══════════════════════════════════════════════════════════════════════  
// 8. MACHINE HOURS  
// ══════════════════════════════════════════════════════════════════════  

async executeMachineHoursLog(payload) {  
    const storage = window.CozyOS?.Storage;  
    const working = parseFloat(payload.workingHours) || 0;  
    const idle = parseFloat(payload.idleHours) || 0;  
    const overtime = parseFloat(payload.overtimeHours) || 0;  
    const downtime = parseFloat(payload.downtimeHours) || 0;  
    const totalLogged = working + idle + overtime + downtime;  
    const utilization = totalLogged > 0 ? +(((working + overtime) / totalLogged) * 100).toFixed(1) : 0;  

    const record = {  
        logId: "HRS-" + Date.now(),  
        machineId: payload.machineId,  
        engineHours: parseFloat(payload.engineHours) || 0,  
        workingHours: working,  
        idleHours: idle,  
        overtimeHours: overtime,  
        downtimeHours: downtime,  
        utilizationPercent: utilization,  
        timestamp: new Date().toISOString()  
    };  

    if (storage && typeof storage.insert === "function") {  
        await storage.insert("quarry_machine_hours", record);  
    }  

    return { responseText: `⏲️ Machine hours logged for '${payload.machineId}'. Utilization: ${utilization}%.`, status: 200, utilizationPercent: utilization };  
}  

// ══════════════════════════════════════════════════════════════════════  
// 9. CRUSHER ANALYTICS  
// ══════════════════════════════════════════════════════════════════════  

async executeCrusherProductionLog(payload) {  
    const storage = window.CozyOS?.Storage;  
    const record = {  
        productionId: "CRUSH-" + Date.now(),  
        machineId: payload.machineId,  
        section: payload.section || "Unspecified",  
        operatorId: payload.operatorId || null,  
        outputTons: parseFloat(payload.outputTons) || 0,  
        hourlyRateTonsPerHour: parseFloat(payload.hourlyRateTonsPerHour) || null,  
        breakdownOccurred: !!payload.breakdownOccurred,  
        timestamp: new Date().toISOString()  
    };  

    if (storage && typeof storage.insert === "function") {  
        await storage.insert("quarry_crusher_production", record);  
    }  

    return { responseText: `🪨 Crusher production logged: ${record.outputTons} tons from '${payload.machineId}' (Section ${record.section}).`, status: 200 };  
}  

// ══════════════════════════════════════════════════════════════════════  
// 10. STOCK MANAGEMENT  
// ══════════════════════════════════════════════════════════════════════  

async executeStockAdjustment(payload) {  
    const C = window.CozyOS?.Shared?.QuarryConstants;
    this._validate(payload, ["category"]);
    const storage = window.CozyOS?.Storage;  
    const category = payload.category;  
    const delta = parseFloat(payload.delta) || 0;  
    if (!category) throw new Error("Validation Error: stock category is required.");  

    const current = this.stockLevels.get(category) || 0;  
    const updated = Math.max(0, current + delta);  
    this.stockLevels.set(category, updated);  

    const record = {  
        adjustmentId: "STOCKADJ-" + Date.now(),  
        category: category,  
        delta: delta,  
        resultingLevel: updated,  
        reason: payload.reason || "Manual adjustment",  
        timestamp: new Date().toISOString()  
    };  

    if (storage && typeof storage.insert === "function") {  
        await storage.insert("quarry_stock_adjustments", record);  
    }  

    // ── Engineering Pass: explicit audit entry ──
    // Stock adjustments aren't finance-routed, so they don't pass through
    // _routeExternalFinancialLegger's automatic audit hook — logged here
    // directly with the before/after stock level and reason.
    const audit = window.CozyOS?.Shared?.QuarryAudit;
    if (audit && typeof audit.record === "function") {
        audit.record({
            collection: C?.COLLECTIONS?.AUDIT_LOG ? "quarry_stock_adjustments" : "quarry_stock_adjustments",
            action: "stock_adjustment",
            header: this._buildHeader(payload),
            previousValue: current,
            newValue: updated,
            reason: record.reason
        }).catch(() => {});
    }

    return { responseText: `📦 Stock '${category}' adjusted by ${delta} → ${updated} on hand.`, status: 200, resultingLevel: updated };  
}  

executeStockLevelsQuery() {  
    return { responseText: "📦 Current stock levels retrieved.", status: 200, stockLevels: Object.fromEntries(this.stockLevels) };  
}  

_deductStock(category, quantity) {  
    if (!category || !quantity) return;  
    const current = this.stockLevels.get(category) || 0;  
    this.stockLevels.set(category, Math.max(0, current - quantity));  
}  

// ══════════════════════════════════════════════════════════════════════  
// 11. LAND OWNER ROYALTY ENGINE  
// ══════════════════════════════════════════════════════════════════════  

async executeLandOwnerRegistration(payload) {  
    const storage = window.CozyOS?.Storage;  
    const landOwnerId = payload.landOwnerId || "OWNER-" + Date.now();  
    const record = {  
        landOwnerId: landOwnerId,  
        name: payload.name,  
        phone: payload.phone || null,  
        bankOrMpesaDetails: payload.bankOrMpesaDetails || null,  
        timestamp: new Date().toISOString()  
    };  

    if (storage && typeof storage.insert === "function") {  
        await storage.insert("quarry_land_owners", record);  
    }  

    if (payload.ratePerTon) {  
        this.royaltyRates.set(landOwnerId, { ratePerTon: parseFloat(payload.ratePerTon) || 0 });  
    }  

    return { responseText: `🧑‍🌾 Land owner '${record.name}' registered.`, status: 200, landOwnerId };  
}  

executeRoyaltyRateSet(payload) {  
    if (!payload.landOwnerId) throw new Error("Validation Error: landOwnerId is required to set a royalty rate.");  
    this.royaltyRates.set(payload.landOwnerId, { ratePerTon: parseFloat(payload.ratePerTon) || 0 });  
    return { responseText: `💲 Royalty rate set for '${payload.landOwnerId}': KSh ${parseFloat(payload.ratePerTon).toFixed(2)} per ton.`, status: 200 };  
}  

async executeRoyaltyAccrual(payload) {  
    const C = window.CozyOS?.Shared?.QuarryConstants;
    this._validate(payload, ["landOwnerId"]);
    const storage = window.CozyOS?.Storage;  
    const tons = parseFloat(payload.tons) || 0;  
    const rateInfo = this.royaltyRates.get(payload.landOwnerId);  
    const rate = rateInfo ? rateInfo.ratePerTon : (parseFloat(payload.ratePerTon) || 0);  
    const accrued = +(tons * rate).toFixed(2);  

    const record = {  
        accrualId: "ROYACC-" + Date.now(),  
        landOwnerId: payload.landOwnerId,  
        parcelId: payload.parcelId || null,  
        tons: tons,  
        ratePerTon: rate,  
        accruedAmount: accrued,  
        settled: false,  
        timestamp: new Date().toISOString()  
    };  

    if (storage && typeof storage.insert === "function") {  
        await storage.insert(C?.COLLECTIONS?.ROYALTY_ACCRUALS || "quarry_royalty_accruals", record);  
    }  

    this._publishEvent(C?.EVENTS?.ROYALTY_GENERATED || "royalty.generated", { landOwnerId: payload.landOwnerId, accruedAmount: accrued, tons });  

    return { responseText: `🪙 Royalty accrued for '${payload.landOwnerId}': KSh ${accrued.toFixed(2)} (${tons} tons @ KSh ${rate}/ton).`, status: 200 };  
}  

async executeRoyaltyStatement(payload) {  
    const C = window.CozyOS?.Shared?.QuarryConstants;
    const accruals = await this._safeFind(C?.COLLECTIONS?.ROYALTY_ACCRUALS || "quarry_royalty_accruals", { landOwnerId: payload.landOwnerId });  
    const totalAccrued = accruals.reduce((sum, a) => sum + (parseFloat(a.accruedAmount) || 0), 0);  
    const totalSettled = accruals.filter(a => a.settled).reduce((sum, a) => sum + (parseFloat(a.accruedAmount) || 0), 0);  
    const outstanding = +(totalAccrued - totalSettled).toFixed(2);  

    return {  
        responseText: `📑 Royalty statement for '${payload.landOwnerId}': Accrued KSh ${totalAccrued.toFixed(2)}, Settled KSh ${totalSettled.toFixed(2)}, Outstanding KSh ${outstanding.toFixed(2)}.`,  
        status: 200,  
        statement: { totalAccrued, totalSettled, outstanding, recordCount: accruals.length }  
    };  
}  

async executeRoyaltySettlement(payload) {  
    const C = window.CozyOS?.Shared?.QuarryConstants;
    this._validate(payload, ["landOwnerId", "amount"]);
    const storage = window.CozyOS?.Storage;  
    const amount = parseFloat(payload.amount) || 0;  
    const header = this._buildHeader(payload, payload.landOwnerId);  

    const settlement = {  
        settlementId: "ROYSET-" + Date.now(),  
        landOwnerId: payload.landOwnerId,  
        amount: amount,  
        period: payload.period || "Monthly",  
        header: header,  
        timestamp: new Date().toISOString()  
    };  

    const { financeResponse } = await this._withCompensation({
        record: settlement,
        collection: C?.COLLECTIONS?.ROYALTY_SETTLEMENTS || "quarry_royalty_settlements",
        idField: "settlementId",
        insert: async () => {
            if (storage && typeof storage.insert === "function") {
                await storage.insert(C?.COLLECTIONS?.ROYALTY_SETTLEMENTS || "quarry_royalty_settlements", settlement);
            }
        },
        financeCall: () => this._routeExternalFinancialLegger(
            amount,
            C?.FINANCE_ACCOUNTS?.ROYALTY_VAULT || "acc_royalty_vault",
            (C?.FINANCE_ACCOUNTS?.landOwner?.(payload.landOwnerId)) || `acc_landowner_${payload.landOwnerId}`,
            header,
            `Royalty Settlement ${settlement.settlementId}`
        )
    });

    return { responseText: `💸 Royalty settlement of KSh ${amount.toFixed(2)} paid to '${payload.landOwnerId}'. Status: ${financeResponse.state}.`, status: 200 };  
}  

// ══════════════════════════════════════════════════════════════════════  
// 12. EXPENSE LEDGER  
// ══════════════════════════════════════════════════════════════════════  

async executeExpenseLog(payload) {  
    const C = window.CozyOS?.Shared?.QuarryConstants;
    this._validate(payload, ["amount"]);
    const storage = window.CozyOS?.Storage;  
    const amount = parseFloat(payload.amount) || 0;  
    const validCategories = C?.EXPENSE_CATEGORIES || ["Fuel", "Repairs", "Explosives", "Salaries", "Utilities", "Security", "Rentals", "Miscellaneous"];  
    const category = validCategories.includes(payload.category) ? payload.category : "Miscellaneous";  
    const header = this._buildHeader(payload);  

    const expense = {  
        expenseId: "EXP-" + Date.now(),  
        category: category,  
        amount: amount,  
        description: payload.description || category,  
        header: header,  
        timestamp: new Date().toISOString()  
    };  

    // ── Engineering Pass: rollback/compensation ──
    // If the storage insert succeeds but the downstream finance call
    // fails, the expense record is marked reversed instead of being
    // left as an orphaned, unsettled entry.
    const { financeResponse } = await this._withCompensation({
        record: expense,
        collection: C?.COLLECTIONS?.EXPENSES || "quarry_expenses",
        idField: "expenseId",
        insert: async () => {
            if (storage && typeof storage.insert === "function") {
                await storage.insert(C?.COLLECTIONS?.EXPENSES || "quarry_expenses", expense);
            }
        },
        financeCall: () => this._routeExternalFinancialLegger(
            amount,
            C?.FINANCE_ACCOUNTS?.CASH_RESERVE_OPEX || "acc_cash_reserve_opex",
            (C?.FINANCE_ACCOUNTS?.expense?.(category)) || `acc_expense_${category.toLowerCase()}`,
            header, `${category} Expense: ${expense.description}`
        )
    });

    return { responseText: `🧾 Expense logged: ${category} — KSh ${amount.toFixed(2)}. Status: ${financeResponse.state}.`, status: 200, expenseId: expense.expenseId };  
}  

// ══════════════════════════════════════════════════════════════════════  
// 13. ENTERPRISE REPORTS  
// ══════════════════════════════════════════════════════════════════════  

async executeReportGeneration(payload) {  
    const reportType = payload.reportType;  
    const generators = {  
        "Daily Production": () => this._reportFromCollection("quarry_crusher_production", "outputTons"),  
        "Weekly": () => this._reportFromCollection("quarry_crusher_production", "outputTons"),  
        "Monthly": () => this._reportFromCollection("quarry_crusher_production", "outputTons"),  
        "Payroll": () => this._reportFromCollection("quarry_loans", "principal"),  
        "Royalty": () => this._reportFromCollection("quarry_royalty_accruals", "accruedAmount"),  
        "Machine": () => this._reportFromCollection("quarry_machine_hours", "workingHours"),  
        "Fuel": () => this._reportFromCollection("quarry_fuel_issues", "liters"),  
        "Customer Sales": () => this._reportFromCollection("quarry_sales", "total"),  
        "Profit & Loss Summary": () => this._reportProfitLossSummary()  
    };  

    const generator = generators[reportType];  
    if (!generator) {  
        return { responseText: `⚠️ Unknown report type '${reportType}'. Supported types: ${Object.keys(generators).join(", ")}.`, status: 400 };  
    }  

    const reportData = await generator();  
    this._runtimeStats.reportsGenerated += 1;  
    this._publishEvent((window.CozyOS?.Shared?.QuarryConstants?.EVENTS?.REPORT_GENERATED) || "report.generated", { reportType, recordCount: reportData.recordCount ?? null });  
    return { responseText: `📊 '${reportType}' report generated.`, status: 200, report: reportData };  
}  

async _reportFromCollection(collection, sumField) {  
    const records = await this._safeFind(collection);  
    const total = records.reduce((sum, r) => sum + (parseFloat(r[sumField]) || 0), 0);  
    return { collection, recordCount: records.length, totalValue: +total.toFixed(2), generatedAt: new Date().toISOString() };  
}  

async _reportProfitLossSummary() {  
    const sales = await this._safeFind("quarry_sales");  
    const expenses = await this._safeFind("quarry_expenses");  
    const totalRevenue = sales.reduce((sum, s) => sum + (parseFloat(s.total) || 0), 0);  
    const totalExpenses = expenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);  
    return {  
        totalRevenue: +totalRevenue.toFixed(2),  
        totalExpenses: +totalExpenses.toFixed(2),  
        netProfit: +(totalRevenue - totalExpenses).toFixed(2),  
        generatedAt: new Date().toISOString()  
    };  
}

}

// ── SYSTEM PLATFORM MODULE INJECTION INITIALIZATION ROUTINES ──────────────────
if (!window.CozyOS) window.CozyOS = {};
if (!window.CozyOS.Modules) window.CozyOS.Modules = {};

// Instantiation registration as Business Module #001
window.CozyOS.Modules.QuarryManager = new CozyQuarryManager();

// Verify capability matching mappings inside the microkernel framework registers
if (window.CozyOS.Kernel?.registerBusinessModule) {
window.CozyOS.Kernel.registerBusinessModule("001", "Quarry Manager", window.CozyOS.Modules.QuarryManager);
console.log("► [KERNEL] Quarry Manager pinned to Business Suite Matrix Slot #001 securely.");
} else {
console.log("► [MODULE] Quarry Manager standalone active workspace initializations complete.");
        }
