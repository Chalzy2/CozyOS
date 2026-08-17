/**
 * CozyOS Shell — Sidebar Behavior
 * File Reference: core/ui/cozy-sidebar.js
 *
 * Owns: collapse/expand toggle, accordion nav groups (one open at a time),
 * remembering last collapsed state + open group + active section across
 * reloads, and mobile slide-in/out. Attaches via event delegation on
 * #cozy-sidebar — never rebuilds the static nav markup (Rule: Shell-owned
 * Left Navigation stays as static markup; this file only adds behavior).
 *
 * No existing owner for this behavior was found in the repo (Rule 48) —
 * created new, in core/ui/ alongside the rest of the shell chrome it
 * belongs to.
 */
(function () {
    "use strict";

    const STORAGE_COLLAPSED = "cozy.sidebar.collapsed";
    const STORAGE_OPEN_GROUP = "cozy.sidebar.openGroup";

    function safeGet(key) {
        try { return window.localStorage.getItem(key); } catch (e) { return null; }
    }
    function safeSet(key, value) {
        try { window.localStorage.setItem(key, value); } catch (e) { /* ignore */ }
    }

    function init() {
        const sidebar = document.getElementById("cozy-sidebar");
        if (!sidebar) return;

        const body = document.body;
        const isMobile = () => window.matchMedia("(max-width: 720px)").matches;

        // ---------- Collapse / Expand ----------
        let toggleBtn = document.getElementById("cozy-sidebar-toggle");
        if (!toggleBtn) {
            toggleBtn = document.createElement("button");
            toggleBtn.id = "cozy-sidebar-toggle";
            toggleBtn.className = "cozy-sidebar-toggle";
            toggleBtn.setAttribute("aria-label", "Toggle sidebar");
            toggleBtn.textContent = "☰";
            sidebar.prepend(toggleBtn);
        }

        function applyCollapsed(collapsed) {
            body.classList.toggle("cozy-sidebar-collapsed", collapsed);
            toggleBtn.textContent = collapsed ? "▶" : "◀";
            safeSet(STORAGE_COLLAPSED, collapsed ? "1" : "0");
        }

        toggleBtn.addEventListener("click", () => {
            if (isMobile()) {
                body.classList.toggle("cozy-sidebar-mobile-open");
                return;
            }
            applyCollapsed(!body.classList.contains("cozy-sidebar-collapsed"));
        });

        applyCollapsed(!isMobile() && safeGet(STORAGE_COLLAPSED) === "1");

        // Mobile overlay to close the slide-in sidebar
        let overlay = document.querySelector(".cozy-mobile-overlay");
        if (!overlay) {
            overlay = document.createElement("div");
            overlay.className = "cozy-mobile-overlay";
            document.body.appendChild(overlay);
        }
        overlay.addEventListener("click", () => body.classList.remove("cozy-sidebar-mobile-open"));

        // ---------- Accordion Groups ----------
        const groups = Array.from(sidebar.querySelectorAll(".cozy-nav-group"));

        function openGroup(groupEl, persist) {
            groups.forEach((g) => g.classList.toggle("open", g === groupEl));
            if (persist && groupEl) safeSet(STORAGE_OPEN_GROUP, groupEl.getAttribute("data-group") || "");
        }

        groups.forEach((groupEl) => {
            const header = groupEl.querySelector(".cozy-nav-group-header");
            if (!header) return;
            header.addEventListener("click", () => {
                const alreadyOpen = groupEl.classList.contains("open");
                openGroup(alreadyOpen ? null : groupEl, true);
            });
        });

        // Open the group containing the active section, else the last
        // remembered group, else the first group.
        const activeItem = sidebar.querySelector(".cozy-nav-item.active");
        const activeGroup = activeItem ? activeItem.closest(".cozy-nav-group") : null;
        const rememberedGroupId = safeGet(STORAGE_OPEN_GROUP);
        const rememberedGroup = rememberedGroupId
            ? groups.find((g) => g.getAttribute("data-group") === rememberedGroupId)
            : null;
        openGroup(activeGroup || rememberedGroup || groups[0] || null, false);

        // When another part of the app changes the active section (e.g.
        // clicking a "hub-goto-section" button elsewhere), keep the
        // correct group expanded and remember it.
        document.addEventListener("click", (evt) => {
            const navEl = evt.target.closest(".cozy-nav-item[data-section]");
            if (!navEl) return;
            const groupEl = navEl.closest(".cozy-nav-group");
            if (groupEl) openGroup(groupEl, true);
            if (isMobile()) body.classList.remove("cozy-sidebar-mobile-open");
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
