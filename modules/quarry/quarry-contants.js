/**

CozyOS Quarry ERP — Shared Constants

File Reference: /core/modules/quarry/quarry-constants.js

Layer: Application (shared reference data, no logic)

Single source of truth for QuarryManager route names and other

cross-screen constants, so individual screens never hardcode route

strings. This file is additive — it does not modify QuarryManager,

QuarryLinker, or any frozen module. It only documents/names the

contract screens use to talk to them.

IMPORTANT: The route names below for the Executive Dashboard

(GET_DASHBOARD_SUMMARY, GET_RECENT_ACTIVITY_LOG), the sync-queue

status lookup (GET_SYNC_QUEUE_STATUS), and the entries merged in from

the former Actions table (COMMIT_PRODUCTION, GET_WORKERS,

GET_MACHINES, GET_LANDOWNERS, GET_PAYROLL, GET_LOANS, GET_SALES,

PROCESS_AI_ADVISOR_QUERY) are PROPOSED names carried over from

executive-dashboard.js and the prior Actions block. They are NOT

confirmed against the real QuarryManager v1.4.x source. If

QuarryManager already exposes these under different names, update

only the string values here — no screen code needs to change.

Architectural note: Routes is the single source of truth for every

QuarryManager endpoint name. Actions is a DEPRECATED, read-only

alias kept temporarily for backward compatibility — every value in

Actions is a direct reference to the matching Routes constant

(never a duplicated string), so the two can never drift out of sync.

New screens must call QuarryConstants.Routes.*. Existing screens

calling QuarryConstants.Actions.* continue to work unmodified.

Actions should be removed once all screens have migrated to

Routes. No QuarryManager-side behavior changes as a result.

Compatibility principle: once a constant here is consumed by a screen

as a primitive (string/number/boolean), it is never converted into an

object — that would silently break any existing === "value" or

string-interpolation usage. Where richer metadata is needed later

(e.g. Languages), it is added as a sibling Meta/Info map keyed by

the same value, never as a replacement for the original primitive.

Languages.EN therefore stays "en"; richer data lives at

Languages.Meta.en.

STATUS: PERMANENTLY FROZEN as of v2.4.0. This file's public API

(every key documented below) is the final contract for the Quarry

ERP module. Future modules build ON this file — new constants may

still be added additively, but no existing key, value shape, or

primitive-vs-object type may change again. See "Compatibility

principle" below for how additions must be made.

This file is the master reference for the entire Quarry ERP module.

All additions below (Routes additions, Events, Collections,

Languages, StoneTypes) are purely reference data — no calculations,

no business rules, no permission logic. QuarryManager remains the

only place StoneTypes pricing/royalty figures are actually applied;

this object exists so every screen reads the same numbers instead of

duplicating them. Existing exported members (Roles, AIModule) are

unchanged from the prior version of this file.
*/


// Routes is the single source of truth for every QuarryManager
// endpoint name. Built as a standalone constant (before the rest of
// QuarryConstants) so the deprecated Actions alias below can point
// directly at these same values without any duplication.
const Routes = Object.freeze({
// Executive Dashboard
GET_DASHBOARD_SUMMARY: "get_dashboard_summary",
GET_RECENT_ACTIVITY_LOG: "get_recent_activity_log",

// Offline sync / connectivity (proposed — confirm against Storage/engine)  
GET_SYNC_QUEUE_STATUS: "get_sync_queue_status",  

// Inherited from CozyBaseLinker — referenced here only for visibility,  
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
// Routes (above) is the single source of truth; this alias exists
// only so existing screens still calling QuarryConstants.Actions.X
// keep working unmodified. New screens must use
// QuarryConstants.Routes.*. Remove once all screens have migrated
// off Actions. Every value here is a direct reference to the
// matching Routes constant — never a duplicated string — so the two
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
    ACTIVITY: "quarry_activity_log",  
    DASHBOARD_METRICS: "quarry_dashboard_metrics"  
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
// QuarryManager looks up/verify price and royalty server-side.  
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

// Expose cleanly to both module scopes and traditional layouts
window.QuarryConstants = QuarryConstants;
window.CozyOS = window.CozyOS || {};
window.CozyOS.Quarry = window.CozyOS.Quarry || {};
window.CozyOS.Quarry.Constants = QuarryConstants;    // Merged in from the former `Actions` table — core write/read
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
window.CozyOS = window.CozyOS || {};
window.CozyOS.Quarry = window.CozyOS.Quarry || {};
window.CozyOS.Quarry.Constants = QuarryConstants;
