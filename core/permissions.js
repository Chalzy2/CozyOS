/**
 * ── COZYOS RBAC AND SYSTEM LOCALIZATION INTERACTION MATRIX ──
 * FILE: core/permissions.js
 */

import AuditLogger from './audit.js';

// 2.2 ROLES ACCESS DICTIONARY PERMISSION SCHEMAS
const ROLE_PERMISSIONS = {
    "Principal": ["dashboard", "finance", "students", "teachers", "reports", "billing", "settings", "wellbeing_admin"],
    "Accountant": ["finance", "fees", "receipts", "reports"],
    "Teacher": ["students", "attendance", "exams", "report_cards", "wellbeing_write"],
    "Parent": ["children_view", "fee_balance", "report_cards_view", "announcements", "wellbeing_view"],
    "Student": ["homework", "results", "timetable", "wellbeing_self"]
};

// 2.4 DYNAMIC SYSTEM MULTI-LANGUAGE TRANSLATION DICTIONARY
export const LOCALIZATION_ENGINE = {
    en: { dashboard: "Control Dashboard", finance: "Finance", balance: "Fee Balance", alerts: "Wellbeing Alerts" },
    sw: { dashboard: "Mawasiliano ya Dashibodi", finance: "Uhasibu", balance: "Salio la Karo", alerts: "Taarifa za Ustawi" },
    luo: { dashboard: "Malo weche Dashboard", finance: "Pesa", balance: "Gowi mar Karo", alerts: "Weche Maendeleo" },
    ki: { dashboard: "Metha ya Utongoria", finance: "Mbeca", balance: "Thiiri wa Thuruuru", alerts: "Ustawi wa Ciana" },
    km: { dashboard: "Kavuku ka Utongoria", finance: "Mbesa", balance: "Thiri wa Usulu", alerts: "Uima wa Kana" }
};

export default {
    /**
     * VERIFY RESOURCE ROUTE ACCESS PRIVILEGES
     */
    check(requiredPermission) {
        const session = window.CozyOS?.Session;
        if (!session) return false;

        const userRole = session.profile?.role;
        const permittedScopes = ROLE_PERMISSIONS[userRole] || [];

        return permittedScopes.includes(requiredPermission);
    },

    /**
     * 2.3 & 2.4 DYNAMIC SIDEBAR RENDERER
     * Automatically translates labels and strips unauthorized modules completely from the DOM
     */
    compileAccessibleSidebar(targetElementId) {
        const session = window.CozyOS?.Session;
        const el = document.getElementById(targetElementId);
        if (!session || !el) return;

        const lang = session.profile?.language || "en";
        const dictionary = LOCALIZATION_ENGINE[lang] || LOCALIZATION_ENGINE.en;
        const permittedScopes = ROLE_PERMISSIONS[session.profile.role] || [];

        let sidebarHtml = "";

        // Conditionally compile DOM nodes only if the role profile possesses explicit clearance
        if (permittedScopes.includes("dashboard")) {
            sidebarHtml += `<li><a href="#dash">📊 ${dictionary.dashboard}</a></li>`;
        }
        if (permittedScopes.includes("finance")) {
            sidebarHtml += `<li><a href="#fin">💰 ${dictionary.finance}</a></li>`;
        }
        if (permittedScopes.includes("wellbeing_view") || permittedScopes.includes("wellbeing_write") || permittedScopes.includes("wellbeing_admin")) {
            sidebarHtml += `<li><a href="#well">🌱 ${dictionary.alerts}</a></li>`;
        }

        el.innerHTML = sidebarHtml;
    }
};

window.CozyOS = window.CozyOS || {};
window.CozyOS.Permissions = module.exports.default;
