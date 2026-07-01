CozyOS Enterprise Certification
Module Information
Field
Value
Module
Business Module #001 (Quarry Manager)
Module ID
quarry_manager_001
Version
1.4.1
Certification ID
CZ-QUARRY-001-1.4.1
Document Version
1.0
Certification Type
Engineering Hardening
Review Scope
Validation, Audit Coverage, Transaction Compensation, Event Coverage
Review Date
2026-07-01
Review Authority
CozyOS Engineering
Certification Summary
The module satisfies the stated review scope. No route, permission, storage schema, or finance path was changed; all prior architectural invariants are preserved.
Verified Checks
Verification Method: Automated static analysis (source-level pattern counts) plus node --check syntax execution. No runtime/unit-test execution was performed — no live CozyOS runtime (Storage, Finance, Shared adapters) is available in this session to exercise the code against.
Check
Result
Syntax validation (node --check)
PASS
execute* methods present
42
execute* methods calling _validate()
39 / 39 that accept a payload requiring validation†
Finance routes wrapped in _withCompensation
8 / 8
_auditLog() call sites
8
_publishEvent() call sites
13
† 3 of the 42 execute* methods do not call _validate() by design: executeStockLevelsQuery and executeIncrementalOfflineSync take no payload, and executeAIAdvisorQuery has no required fields (free-text query with a default).
Correction from the prior draft of this certification: that version stated 40/40 validation calls, 9/9 compensation-wrapped routes, 10 audit points, and 15 event points. Those figures came from an earlier grep pass that included the method definitions themselves in the count (e.g. _validate(payload, requiredFields) {) rather than only call sites. Re-run against the delivered file with call-site-only pattern matching, the accurate figures are the ones in the table above.
Changes Made
1. Validation
Before: 10 of 42 execute* methods called _validate().
After: 39 of 42 call _validate() on entry (see table above for the 3 exceptions and why).
Where a method already had a manual if (!x) throw ... guard, that guard was kept — it's the only enforcement guaranteed to run, since _validate() itself no-ops unless window.CozyOS.Shared.QuarryValidation is loaded. _validate() calls were added on top for consistency and forward-compatibility.
2. Audit Coverage
Audit logging already existed via window.CozyOS.Shared.QuarryAudit, wired into every financial mutation (through _routeExternalFinancialLegger) and into stock adjustments.
Added a shared _auditLog() helper and used it to close the remaining gaps: executeEmployeeUpdate, executeEmployeeStatusChange, executeEmployeeTransfer, executeDriverUpdate, executeParcelRegistration, executeMaintenanceUpdate, and stock deductions triggered from executeSaleRecord.
3. Transaction Compensation
Audited all 8 call sites of _routeExternalFinancialLegger. Every one was already wrapped in _withCompensation. No gap found; no change made.
4. Event Coverage
Added 6 previously-missing domain events via the existing _publishEvent()/CustomEvent mechanism: customer.registered, stock.adjusted (manual and sale-driven), fuel.issued, maintenance.logged, delivery.confirmed, expense.logged.
Issues Fixed
Dead ternary in the pre-existing stock-adjustment audit call, where the collection name resolved to the same value regardless of its condition. Now correctly targets C?.COLLECTIONS?.AUDIT_LOG || "quarry_audit_log".
File header comment began with ** instead of /** — a latent syntax error that would fail node --check. Fixed.
All internal version-history commentary (change notes, "ERP Expansion" annotations, "Engineering Pass" narration) stripped from the production file per the current CozyOS file-first standard.
Deferred Items
Out of scope for this certification pass — each requires a new subsystem or a broader change than an engineering hardening pass:
Universal collection-name constants migration (QuarryConstants.COLLECTIONS everywhere)
Localization / language engine (activeLanguage is set but unused; no language engine exists elsewhere in this file)
Offline sync scope expansion beyond quarry_production
Manifest auto-generation from a single route registry
Health diagnostics (storage/finance latency, queue size, memory)
Unit test suite
Architectural Invariants
Preserved without change: module ID (quarry_manager_001), public handle(context) surface, switch/case routing pattern, role permission model, Seven-Key header structure, finance adapter (_routeExternalFinancialLegger), offline sync architecture, AI Advisor interface, and kernel registration block.
Certification Decision
Status: CERTIFIED
Certification Level: Enterprise Production Ready    // Inherited from CozyBaseLinker — referenced here only for visibility,
    // not redefined or altered.
    EXECUTE_LOCAL_QUEUE_SYNC: "execute_local_queue_sync",
    LOG_SYSTEM_EXCEPTION: "log_system_exception",

    // Merged in from the former `Actions` table — core write/read
    // routes used across Quarry screens (Production Entry, Workers,
    // Machines, Land Owners, Payroll, Loans, Sales/Dispatch, AI
    // Advisor). Proposed names; confirm against the real
    // QuarryManager v1.4.x route table before screens go live.
    // String values are unchanged from the old Actions table.
    COMMIT_PRODUCTION: "commit_production_record",
    GET_WORKERS: "get_workers",
    GET_MACHINES: "get_machines",
    GET_LANDOWNERS: "get_landowners",
    GET_PAYROLL: "get_payroll",
    GET_LOANS: "get_loans",
    GET_SALES: "get_sales",
    PROCESS_AI_ADVISOR_QUERY: "process_ai_advisor_query"
});

// DEPRECATED — temporary read-only alias for backward compatibility.
// `Routes` (above) is the single source of truth; this alias exists
// only so existing screens still calling `QuarryConstants.Actions.X`
// keep working unmodified. New screens must use
// `QuarryConstants.Routes.*`. Remove once all screens have migrated
// off `Actions`. Every value here is a direct reference to the
// matching `Routes` constant — never a duplicated string — so the two
// can never drift out of sync.
const Actions = Object.freeze({
    COMMIT_PRODUCTION: Routes.COMMIT_PRODUCTION,
    GET_WORKERS: Routes.GET_WORKERS,
    GET_MACHINES: Routes.GET_MACHINES,
    GET_LANDOWNERS: Routes.GET_LANDOWNERS,
    GET_PAYROLL: Routes.GET_PAYROLL,
    GET_LOANS: Routes.GET_LOANS,
    GET_SALES: Routes.GET_SALES,
    PROCESS_AI_ADVISOR_QUERY: Routes.PROCESS_AI_ADVISOR_QUERY
});

const QuarryConstants = Object.freeze({
    Routes: Routes,

    // See DEPRECATED notice above where `Actions` is defined.
    Actions: Actions,

    Roles: Object.freeze({
        ADMINISTRATOR: "Administrator",
        ACCOUNTANT: "Accountant",
        SUPERVISOR: "Supervisor",
        OPERATOR: "Operator"
    }),

    AIModule: "quarry",

    // Additive — shared client-side event names for cross-screen
    // coordination. These are dispatched/listened to the same way
    // CozyBaseLinker's EVENTS.DATA_CHANGED already works; they do not
    // replace or alter that mechanism.
    Events: Object.freeze({
        DATA_CHANGED: "QUARRY_DATA_CHANGED",
        PRODUCTION_COMMITTED: "QUARRY_PRODUCTION_COMMITTED",
        SYNC_CHANGED: "QUARRY_SYNC_CHANGED",
        ACTIVITY_UPDATED: "QUARRY_ACTIVITY_UPDATED",
        DASHBOARD_REFRESH: "QUARRY_DASHBOARD_REFRESH"
    }),

    // Additive — Storage/collection names referenced by QuarryManager
    // and used by screens only to label cached data, never to read/write
    // storage directly outside of CozyOS.Storage.
    Collections: Object.freeze({
        WORKERS: "quarry_workers",
        LANDOWNERS: "quarry_landowners",
        PARCELS: "quarry_parcels",
        MACHINES: "quarry_machines",
        PRODUCTION: "quarry_production",
        SALES: "quarry_sales",
        PAYROLL: "quarry_payroll",
        LOANS: "quarry_loans",
        ATTENDANCE: "quarry_attendance",
        ACTIVITY: "quarry_activity_log"
    }),

    // Additive — supported language codes for CozyOS.Language, kept as
    // plain strings (EN/SW/LUO) exactly as before for backward
    // compatibility with any screen already doing
    // `QuarryConstants.Languages.EN`. Richer display metadata lives
    // alongside in `Meta`, keyed by the same lowercase code, so new
    // screens can do `QuarryConstants.Languages.Meta.en.name` without
    // breaking the original primitive-string API.
    Languages: Object.freeze({
        EN: "en",
        SW: "sw",
        LUO: "luo",

        Meta: Object.freeze({
            en: Object.freeze({
                code: "en",
                name: "English"
            }),
            sw: Object.freeze({
                code: "sw",
                name: "Kiswahili"
            }),
            luo: Object.freeze({
                code: "luo",
                name: "Dholuo"
            })
        })
    }),

    // Additive — canonical stone type reference, including the business
    // metadata needed throughout the Quarry ERP (display name, unit,
    // default pricing, royalty, and active flag for dropdowns). Screens
    // (e.g. Production Entry, Sales & Dispatch) read these values for
    // display and to populate form defaults only. QuarryManager performs
    // the authoritative calculation and validation on every commit; a
    // screen must never compute totals from this table and submit them
    // as fact — submitted payloads carry the stone type code, and
    // QuarryManager looks up/verifies price and royalty server-side.
    //
    // `price` and `royalty` are LEGACY compatibility aliases, kept so
    // any existing screen/module still referencing
    // `StoneTypes.LA13.price` / `.royalty` continues to work unmodified.
    // New development should use `defaultPrice` and `royaltyPerStone`
    // instead. In all cases, QuarryManager remains the only authority
    // for validation, pricing, royalties, payroll, and calculations —
    // these fields are display/default values only.
    StoneTypes: Object.freeze({
        LA13: Object.freeze({
            code: "LA-13",
            name: "LA-13",
            unit: "Stone",

            // Legacy (keep)
            price: 27,
            royalty: 2,

            // Preferred going forward
            defaultPrice: 27,
            royaltyPerStone: 2,

            active: true
        }),
        MB10: Object.freeze({
            code: "MB-10",
            name: "MB-10",
            unit: "Stone",

            // Legacy (keep)
            price: 20,
            royalty: 2,

            // Preferred going forward
            defaultPrice: 20,
            royaltyPerStone: 2,

            active: true
        }),
        SC4: Object.freeze({
            code: "SC-4",
            name: "SC-4",
            unit: "Stone",

            // Legacy (keep)
            price: 8.5,
            royalty: 2,

            // Preferred going forward
            defaultPrice: 8.5,
            royaltyPerStone: 2,

            active: true
        })
    }),

    // Additive — central business settings so currency, default
    // language, default royalty rate, and company display name are
    // never hardcoded in individual Quarry screens. Screens read these
    // for display and defaults only; QuarryManager remains the
    // authority on anything that affects calculations.
    Business: Object.freeze({
        CURRENCY: "KES",
        DEFAULT_LANGUAGE: "en",
        DEFAULT_ROYALTY_PER_STONE: 2,
        COMPANY_NAME: "CozyOS Quarry ERP"
    }),

    // Additive — canonical shift definitions. The quarry runs two
    // shifts; every future screen (Production, Attendance, Payroll,
    // Dashboard) reuses these codes/names instead of inventing its own.
    Shifts: Object.freeze({
        DAY: Object.freeze({
            code: "DAY",
            name: "Day Shift"
        }),
        NIGHT: Object.freeze({
            code: "NIGHT",
            name: "Night Shift"
        })
    }),

    // Additive — module/API versioning, used for diagnostics, support
    // requests, and future migration checks. Does not affect runtime
    // behavior of any screen or frozen module.
    Version: Object.freeze({
        MODULE: "Quarry ERP",
        VERSION: "2.4.0",
        API: "1.0"
    })
});

window.QuarryConstants = QuarryConstants;
