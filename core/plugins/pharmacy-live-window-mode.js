/**
 * CozyOS — PharmacyOS Live Window Mode
 * File Reference: core/plugins/pharmacy-live-window-mode.js
 *
 * PURPOSE
 *   Registers "pharmacy" with the ONE universal window.CozyOS.LiveWindow
 *   (core/shell/live-window-controller.js), following the exact pattern
 *   ChurchOS's worship-live-window-mode.js established. Turns
 *   PharmacyOS from an application with ZERO Live Window presence into
 *   a real, switchable context.
 *
 * COMPOSED, NOT DUPLICATED (every method below already existed before
 * this file was written; none is modified by this file):
 *   - window.CozyOS.OrganizationRegistry.listOrganizations() (core/
 *     organization/organization-registry.js) — the real, single
 *     organization registry, used here only to find real organizations
 *     PharmacyOS's own setupPharmacy() previously created with
 *     type:"Pharmacy" — never a second organization store.
 *   - window.CozyOS.PharmacyOS.listMedicines({orgId, actorId})/
 *     getDiagnosticsReport() (core/plugins/pharmacyOS-core.js) — the
 *     real, Phase 1 medicine catalog. listMedicines() itself already
 *     honestly filters out controlled substances the current actor
 *     lacks permission for (delegated entirely to IdentityEngine — see
 *     that file's own header); this mode does not re-implement or
 *     bypass that check.
 *
 * HONEST SCOPE (disclosed, not fabricated)
 *   PharmacyOS's own file header states Phase 1 has no prescription
 *   dispensing, patient records, expiry/batch tracking, stock-quantity,
 *   or clinical decision support — this mode does not fabricate any of
 *   those. Without a real Pharmacy organization already created via
 *   setupPharmacy() (context.orgId, or the first real one found via
 *   OrganizationRegistry), this mode shows an honest "no pharmacy
 *   organization is set up yet" disclosure rather than a fabricated
 *   catalog.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const VERSION = "1.0.0";
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    if (window.CozyOS.Modules["pharmacy-live-window-mode"]) return;

    function escapeHtml(s) {
        return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    }

    function currentActorId() {
        const session = window.CozyOS && window.CozyOS.Session;
        if (session && typeof session.current === "function") {
            const snap = session.current();
            if (snap && snap.uid) return snap.uid;
        }
        return null;
    }

    /** resolveOrgId() — a caller may pass context.orgId directly; otherwise the first real, already-registered Pharmacy organization found via OrganizationRegistry, never invented. */
    function resolveOrgId(context) {
        if (context && context.orgId) return context.orgId;
        const registry = window.CozyOS && window.CozyOS.OrganizationRegistry;
        if (!registry || typeof registry.listOrganizations !== "function") return null;
        try {
            const orgs = registry.listOrganizations({}) || [];
            const pharmacy = orgs.find((o) => o.type === "Pharmacy");
            return pharmacy ? (pharmacy.orgId || pharmacy.id || null) : null;
        } catch (_err) { return null; }
    }

    function renderDiagnostics(container, engine) {
        const wrap = document.createElement("div");
        wrap.className = "cozy-living-card cozy-live-window-pharmacy-diagnostics";
        if (!engine) {
            wrap.innerHTML = `<h4>PharmacyOS</h4><p class="cozy-disclosure-note">PharmacyOS is not connected on this page.</p>`;
            container.appendChild(wrap);
            return;
        }
        try {
            const diag = engine.getDiagnosticsReport();
            wrap.innerHTML = `<h4>PharmacyOS (Phase 1)</h4><p class="cozy-disclosure-note">${diag.medicineCount} real medicine record(s) tracked. Prescription dispensing, patient records, expiry/batch tracking, and stock quantity are honestly not yet built.</p>`;
        } catch (err) {
            wrap.innerHTML = `<h4>PharmacyOS (Phase 1)</h4><p class="cozy-disclosure-note">Real diagnostics are not available right now.</p>`;
            console.warn("[PharmacyLiveWindowMode] getDiagnosticsReport() failed:", err && err.message);
        }
        container.appendChild(wrap);
    }

    function renderMedicineCatalog(container, engine, orgId, actorId) {
        const wrap = document.createElement("div");
        wrap.className = "cozy-living-card cozy-live-window-pharmacy-catalog";
        if (!engine) {
            wrap.innerHTML = `<h4>Medicine Catalog</h4><p class="cozy-disclosure-note">PharmacyOS is not connected on this page.</p>`;
            container.appendChild(wrap);
            return;
        }
        if (!orgId) {
            wrap.innerHTML = `<h4>Medicine Catalog</h4><p class="cozy-disclosure-note">No real pharmacy organization is set up yet.</p>`;
            container.appendChild(wrap);
            return;
        }
        wrap.innerHTML = `<h4>Medicine Catalog</h4><div id="cozy-live-window-pharmacy-catalog-list" class="cozy-disclosure-note">Loading real medicines…</div>`;
        container.appendChild(wrap);
        const listEl = wrap.querySelector("#cozy-live-window-pharmacy-catalog-list");
        try {
            const medicines = engine.listMedicines({ orgId, actorId });
            listEl.innerHTML = (medicines && medicines.length)
                ? medicines.slice(0, 5).map((m) => `<div>${escapeHtml(m.name)}${m.isControlledSubstance ? " (controlled)" : ""}</div>`).join("")
                : "No real medicines recorded for this organization yet.";
        } catch (err) {
            listEl.textContent = "Real medicine catalog is not available right now.";
            console.warn("[PharmacyLiveWindowMode] listMedicines() failed:", err && err.message);
        }
    }

    function activatePharmacy(container, context) {
        context = context || {};
        const engine = window.CozyOS.PharmacyOS;
        const orgId = resolveOrgId(context);
        const actorId = currentActorId();

        const header = document.createElement("div");
        header.className = "cozy-live-window-pharmacy-header";
        header.innerHTML = `<p class="cozy-disclosure-note"><strong>Context: PharmacyOS</strong></p>`;
        container.appendChild(header);

        renderDiagnostics(container, engine);
        renderMedicineCatalog(container, engine, orgId, actorId);

        const speakHint = document.createElement("p");
        speakHint.className = "cozy-disclosure-note";
        speakHint.textContent = "Speak, type, or reply using the CozyOS Live controls below.";
        container.appendChild(speakHint);
    }

    function deactivatePharmacy(container) {
        if (container) container.innerHTML = "";
    }

    function register() {
        const liveWindow = window.CozyOS && window.CozyOS.LiveWindow;
        if (!liveWindow || typeof liveWindow.registerMode !== "function") return false;
        liveWindow.registerMode("pharmacy", { label: "PharmacyOS", activate: activatePharmacy, deactivate: deactivatePharmacy });
        return true;
    }

    if (!register()) {
        let attempts = 0;
        const retry = () => { if (!register() && ++attempts < 40) setTimeout(retry, 250); };
        retry();
    }

    window.CozyOS.Modules["pharmacy-live-window-mode"] = Object.freeze({
        version: VERSION,
        description: "Registers PharmacyOS's 'pharmacy' mode with the universal window.CozyOS.LiveWindow — real diagnostics and medicine catalog (window.CozyOS.PharmacyOS), resolving a real orgId via OrganizationRegistry or context, with an honest disclosure when no real pharmacy organization is set up yet. Speak/Type/Reply reuses the Live Window's own existing chat form, never duplicated."
    });
})();
