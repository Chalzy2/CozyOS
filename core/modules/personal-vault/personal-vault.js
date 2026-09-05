// ============================================================
//  core/modules/personal-vault/personal-vault.js
//  Version: 2.0.0
//  "Cozy Vault" application module — rebuilt for FULL FEATURE
//  PARITY against the real, live implementation.
//
//  CRITICAL CORRECTION FROM THE FIRST EXTRACTION PASS
//  ------------------------------------------------------------
//  vault__1_.html never loads cozy-vault.js at all (verified: no
//  <script src="cozy-vault.js"> anywhere in that file). The page's
//  own inline <script type="module"> is the real, live
//  implementation, and it uses collection "cozyVault" — NOT
//  "cozyVaultItems", which is what cozy-vault.js (a separate,
//  unused-by-this-page file) uses. This rebuild is extracted from
//  the real, live inline script, not the separate file. Rule 19/21.
//
//  CORRECTION: NO PIN-LOCK SCREEN EXISTS
//  ------------------------------------------------------------
//  A prior instruction referenced a "PIN lock screen" as a feature
//  to preserve. Verified directly (grep for lock/passcode/unlock/
//  authenticate across the full file): no such screen exists.
//  Every "pin" reference in this application is about PINNING an
//  item to the top of the list (a favorites-style feature), never
//  a security PIN entry. Not fabricating a feature that was never
//  real (Rule 6).
//
//  HONEST, KNOWN GAPS — carried forward from the first pass, still
//  unresolved:
//  1. Real Shell session/auth exposure now exists: window.CozyOS.Session
//     (built as a platform prerequisite after this exact gap was found
//     during this migration). This module now reads real session data
//     from it instead of a placeholder. If Session isn't connected yet
//     (e.g. very early in Shell startup), this module honestly falls
//     back to no session rather than fabricating one.
//  2. Goals now persist in the real, shared, in-memory Goals Engine
//     instead of Firebase's cozyGoals collection (Rule 26.2/26.3).
//     This is a genuine behavior change: goals will not survive a
//     page reload until Goals Engine has a durable provider (same
//     honest limitation already disclosed for every other CozyOS
//     engine's initial reference implementation).
//  3. firebase.js import path ("../../../firebase.js") — RESOLVED as a
//     deliberate design decision, not a guess: CozyOS has no existing
//     deployment to contradict it. firebase.js stays at the repository
//     root (confirmed by its own header — all listed consumers use
//     "./firebase.js"); core/ sits at that same root, consistent with
//     every other core/ reference built in this project.
// ============================================================

(function () {
    "use strict";

    function escapeHtml(v) {
        return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    }

    const VAULT_TYPES = {
        photo:    { icon: "📷", color: "#1B5E20", bg: "#E8F5E9" },
        document: { icon: "📄", color: "#1565C0", bg: "#E3F2FD" },
        goal:     { icon: "🎯", color: "#F9A825", bg: "#FFF8E1" },
        idea:     { icon: "💡", color: "#EF6C00", bg: "#FBE9E7" },
        ai_note:  { icon: "🤖", color: "#00A86B", bg: "#E0F7EF" },
        voice:    { icon: "🎙️", color: "#6A1B9A", bg: "#F3E5F5" },
        lesson:   { icon: "📚", color: "#1565C0", bg: "#E3F2FD" },
        memory:   { icon: "🌟", color: "#F9A825", bg: "#FFF8E1" },
        business: { icon: "🏪", color: "#2E7D32", bg: "#E8F5E9" },
        contact:  { icon: "👤", color: "#1B5E20", bg: "#E8F5E9" },
    };

    let fb = null;
    async function getFirebase() {
        if (fb) return fb;
        fb = await import("../../../firebase.js");
        return fb;
    }

    // ── Real, extracted business logic — matching the REAL, live
    // inline script's collection name ("cozyVault") and field shape. ──

    async function saveItem(ownerCozyId, ownerUid, data) {
        const { db, collection, addDoc, serverTimestamp } = await getFirebase();
        const record = {
            cozyId: ownerCozyId || "", uid: ownerUid,
            type: data.type || "idea",
            title: escapeHtml((data.title || "").trim()),
            content: escapeHtml((data.content || "").trim()),
            tags: data.tags || [],
            pinned: !!data.pinned,
            archived: false, isPrivate: true, aiGenerated: false,
            createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
        };
        const ref = await addDoc(collection(db, "cozyVault"), record);
        return ref.id;
    }

    async function loadItems(ownerCozyId) {
        const { db, collection, query, where, orderBy, limit, getDocs } = await getFirebase();
        try {
            const q = query(collection(db, "cozyVault"), where("cozyId", "==", ownerCozyId || ""), where("archived", "==", false), orderBy("createdAt", "desc"), limit(100));
            const snap = await getDocs(q);
            return snap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch (_) {
            const snap = await getDocs(query(collection(db, "cozyVault"), where("cozyId", "==", ownerCozyId || "")));
            return snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(i => !i.archived);
        }
    }

    async function togglePin(id, current) {
        const { db, doc, updateDoc, serverTimestamp } = await getFirebase();
        await updateDoc(doc(db, "cozyVault", id), { pinned: !current, updatedAt: serverTimestamp() });
    }

    async function archiveItem(id) {
        const { db, doc, updateDoc, serverTimestamp } = await getFirebase();
        await updateDoc(doc(db, "cozyVault", id), { archived: true, updatedAt: serverTimestamp() });
    }

    function shareItem(title) {
        if (typeof navigator !== "undefined" && navigator.share) navigator.share({ title: "From my Cozy Vault", text: title });
        else if (typeof navigator !== "undefined" && navigator.clipboard) navigator.clipboard.writeText(title);
    }

    // ── Goals — real, shared Goals Engine (Rule 26.2/26.3). ──
    function requireGoalsEngine() {
        const engine = window.CozyOS && window.CozyOS.Goals;
        if (!engine) throw new Error("[CozyVault] Goals Engine is not connected.");
        return engine;
    }
    function listGoals(ownerCozyId) { return requireGoalsEngine().listGoals(ownerCozyId, { status: "active" }); }
    function createGoalRecord(ownerCozyId, data) {
        return requireGoalsEngine().createGoal(ownerCozyId, {
            title: data.title, description: data.description, targetAmount: data.targetAmount,
            targetDate: data.targetDate, category: data.category,
        });
    }
    function addGoalProgress(goalId, savedAmount) { return requireGoalsEngine().updateProgress(goalId, savedAmount); }
    function achieveGoalRecord(goalId) { return requireGoalsEngine().setStatus(goalId, "achieved"); }

    // ── Smart Tips (formerly "Coach"/"AI") — real, disclosed keyword
    // matching, preserved exactly from the original generateCoachReply(),
    // never a real AI model (Rule 6). ──
    function generateSmartTip(topic, msg, name) {
        const n = name ? `, ${name.split(" ")[0]}` : "";
        const lower = msg.toLowerCase();
        if (/start|begin|new/i.test(lower) && /business/i.test(lower)) return `Hello${n}! 🏪 Starting a business is a great step.\n\n• How much capital do you have?\n• What do you want to sell?\n• Where are you located?\n\nTell me — I'll help you plan!`;
        if (/save|saving|money/i.test(lower)) return `Good thinking${n}! 💰 Simple saving rule:\n\n🟢 Earn → Save FIRST\n🟢 Then spend what's left\n\nStart with KES 50 per day.\n\nWhat is your savings goal?`;
        if (/goal|dream|plan/i.test(lower)) return `Nice${n}! 🎯 Steps to set a goal:\n\n1️⃣ Write it clearly\n2️⃣ Set a deadline\n3️⃣ Break into small steps\n4️⃣ Check progress weekly\n\nWhat is your goal?`;
        if (/profit|income/i.test(lower)) return `${n} 💰 To calculate profit:\n\nProfit = Revenue − Costs\n\nFirst list all your costs (stock, rent, transport, electricity).\nThen list your income.\nThe difference is your profit!\n\nWant me to help you calculate?`;
        return `Understood${n}! 🤖 I hear you.\n\nThis is rule-based, not real AI — tell me more about business, savings, or goals so I can offer a relevant tip.`;
    }

    // ── Module state and rendering ──

    let state = { ownerCozyId: null, ownerUid: null, activeFilter: "", items: [] };

    function root() { return document.getElementById("cozy-app-root"); }

    async function refreshItems() {
        state.items = state.ownerCozyId ? await loadItems(state.ownerCozyId) : [];
        renderItems();
    }

    function renderItems() {
        const r = root(); if (!r) return;
        const items = state.activeFilter ? state.items.filter(i => i.type === state.activeFilter) : state.items;
        const pinned = items.filter(i => i.pinned);
        const rest = items.filter(i => !i.pinned);

        const pinnedSection = r.querySelector("#pv-pinned-section");
        const pinnedRow = r.querySelector("#pv-pinned-row");
        if (pinnedSection && pinnedRow) {
            if (pinned.length) {
                pinnedSection.style.display = "block";
                pinnedRow.innerHTML = pinned.map(i => {
                    const tm = VAULT_TYPES[i.type] || { icon: "📦" };
                    return `<div class="pv-pinned-card" data-id="${i.id}">${tm.icon} ${i.title || "Untitled"}</div>`;
                }).join("");
            } else pinnedSection.style.display = "none";
        }

        const list = r.querySelector("#pv-vault-list");
        if (!list) return;
        if (!rest.length && !pinned.length) {
            list.innerHTML = `<div class="pv-empty">🏠 Your vault is empty. Tap "+ Add" to store your first item here.</div>`;
            return;
        }
        list.innerHTML = rest.map(i => {
            const tm = VAULT_TYPES[i.type] || { icon: "📦" };
            return `<div class="pv-vault-card" data-id="${i.id}">
                <div class="pv-vc-title">${tm.icon} ${i.title || "Untitled"}</div>
                ${i.content ? `<div class="pv-vc-preview">${i.content}</div>` : ""}
                <div class="pv-vc-actions">
                    <button data-action="pin" data-id="${i.id}" data-pinned="${!!i.pinned}">${i.pinned ? "📌 Unpin" : "📍 Pin"}</button>
                    <button data-action="view" data-id="${i.id}">👁️ View</button>
                    <button data-action="share" data-id="${i.id}">📤 Share</button>
                    <button data-action="remove" data-id="${i.id}">🗑️ Remove</button>
                </div>
            </div>`;
        }).join("");
    }

    function renderGoals() {
        const r = root(); if (!r) return;
        const list = r.querySelector("#pv-goals-list");
        if (!list) return;
        let goalList = [];
        try { goalList = state.ownerCozyId ? listGoals(state.ownerCozyId) : []; } catch (_) { goalList = []; }
        if (!goalList.length) { list.innerHTML = `<div class="pv-empty">🎯 No goals yet. Create your first goal and track progress.</div>`; return; }
        list.innerHTML = goalList.map(g => `
            <div class="pv-goal-card" data-id="${g.goalId}">
                <div class="pv-goal-title">🎯 ${g.title}</div>
                <div class="pv-goal-bar"><div style="width:${g.progress}%"></div></div>
                <div>Saved: KES ${Number(g.savedAmount).toLocaleString()} · ${g.progress}% · Target: KES ${Number(g.targetAmount).toLocaleString()}</div>
                <button data-action="add-progress" data-id="${g.goalId}" data-target="${g.targetAmount}">+ Add Progress</button>
                ${g.progress >= 100 ? `<button data-action="achieve" data-id="${g.goalId}">🎉 Mark Achieved</button>` : ""}
            </div>`).join("");
    }

    let coachTopic = "business";
    function addCoachMessage(container, icon, text) {
        const div = document.createElement("div");
        div.innerHTML = `<strong>${icon}</strong> <span>${text}</span>`;
        container.appendChild(div);
    }

    function bindEvents(r) {
        r.querySelectorAll(".pv-tab").forEach(tab => tab.addEventListener("click", () => {
            const t = tab.dataset.tab;
            r.querySelectorAll(".pv-tab").forEach(x => x.classList.toggle("active", x === tab));
            r.querySelector("#pv-view-all").style.display = t === "all" ? "block" : "none";
            r.querySelector("#pv-view-goals").style.display = t === "goals" ? "block" : "none";
            r.querySelector("#pv-view-coach").style.display = t === "coach" ? "block" : "none";
            if (t === "goals") renderGoals();
            if (t === "coach") {
                const msgs = r.querySelector("#pv-coach-messages");
                if (msgs && msgs.children.length === 0) addCoachMessage(msgs, "🤖", "Hello! I can help with Business, Savings, Goals, Studies and Farming (rule-based tips, not AI). What would you like to work on today?");
            }
        }));

        const searchInput = r.querySelector("#pv-search-input");
        if (searchInput) searchInput.addEventListener("input", (e) => {
            const v = e.target.value.trim().toLowerCase();
            if (!v) { renderItems(); return; }
            const results = state.items.filter(i => (i.title || "").toLowerCase().includes(v) || (i.content || "").toLowerCase().includes(v) || (i.tags || []).some(t => t.toLowerCase().includes(v)));
            const list = r.querySelector("#pv-vault-list");
            list.innerHTML = results.length ? results.map(i => `<div class="pv-vault-card">${(VAULT_TYPES[i.type] || { icon: "📦" }).icon} ${i.title || "Untitled"}</div>`).join("") : `<div class="pv-empty">🔍 No results.</div>`;
        });

        const openAdd = r.querySelector("#pv-open-add-modal");
        if (openAdd) openAdd.addEventListener("click", () => r.querySelector("#pv-add-modal").classList.add("open"));
        const openGoal = r.querySelector("#pv-open-goal-modal");
        if (openGoal) openGoal.addEventListener("click", () => r.querySelector("#pv-goal-modal").classList.add("open"));
        r.querySelectorAll("[data-close]").forEach(btn => btn.addEventListener("click", () => r.querySelector("#" + btn.dataset.close).classList.remove("open")));

        const saveItemBtn = r.querySelector("#pv-save-item");
        if (saveItemBtn) saveItemBtn.addEventListener("click", async () => {
            const title = r.querySelector("#pv-v-title").value.trim();
            if (!title) return;
            const tagsRaw = r.querySelector("#pv-v-tags").value.trim();
            const tags = tagsRaw ? tagsRaw.split(",").map(t => t.trim()).filter(Boolean) : [];
            await saveItem(state.ownerCozyId, state.ownerUid, {
                type: r.querySelector("#pv-v-type").value, title,
                content: r.querySelector("#pv-v-content").value.trim(), tags,
                pinned: r.querySelector("#pv-v-pin").checked,
            });
            r.querySelector("#pv-add-modal").classList.remove("open");
            ["pv-v-title", "pv-v-content", "pv-v-tags"].forEach(id => { r.querySelector("#" + id).value = ""; });
            r.querySelector("#pv-v-pin").checked = false;
            await refreshItems();
        });

        const saveGoalBtn = r.querySelector("#pv-save-goal");
        if (saveGoalBtn) saveGoalBtn.addEventListener("click", () => {
            const title = r.querySelector("#pv-g-title").value.trim();
            if (!title) return;
            createGoalRecord(state.ownerCozyId, {
                title, description: r.querySelector("#pv-g-desc").value.trim(),
                targetAmount: Number(r.querySelector("#pv-g-target").value) || 0,
                targetDate: r.querySelector("#pv-g-date").value,
                category: r.querySelector("#pv-g-cat").value,
            });
            r.querySelector("#pv-goal-modal").classList.remove("open");
            renderGoals();
        });

        r.addEventListener("click", async (e) => {
            const btn = e.target.closest("[data-action]");
            if (!btn) return;
            const id = btn.dataset.id;
            if (btn.dataset.action === "pin") { await togglePin(id, btn.dataset.pinned === "true"); await refreshItems(); }
            if (btn.dataset.action === "remove") { await archiveItem(id); await refreshItems(); }
            if (btn.dataset.action === "share") { const item = state.items.find(i => i.id === id); if (item) shareItem(item.title); }
            if (btn.dataset.action === "view") { document.dispatchEvent(new CustomEvent("cozyos:vault-view-item", { detail: { id } })); }
            if (btn.dataset.action === "add-progress") { document.dispatchEvent(new CustomEvent("cozyos:vault-request-progress-input", { detail: { goalId: id, target: Number(btn.dataset.target) } })); }
            if (btn.dataset.action === "achieve") { achieveGoalRecord(id); renderGoals(); }
        });

        r.querySelectorAll(".pv-topic-btn").forEach(btn => btn.addEventListener("click", () => {
            coachTopic = btn.dataset.topic;
            r.querySelectorAll(".pv-topic-btn").forEach(b => b.classList.toggle("active", b === btn));
        }));
        const sendBtn = r.querySelector("#pv-coach-send");
        const coachInput = r.querySelector("#pv-coach-input");
        if (sendBtn && coachInput) {
            const send = () => {
                const msg = coachInput.value.trim();
                if (!msg) return;
                coachInput.value = "";
                const msgs = r.querySelector("#pv-coach-messages");
                addCoachMessage(msgs, "👤", escapeHtml(msg));
                const reply = generateSmartTip(coachTopic, msg, "");
                setTimeout(() => addCoachMessage(msgs, "🤖", escapeHtml(reply)), 300);
            };
            sendBtn.addEventListener("click", send);
            coachInput.addEventListener("keydown", (e) => { if (e.key === "Enter") send(); });
        }
    }

    /**
     * addProgress(goalId, amount)
     *   Real, extracted business logic for the original's
     *   `prompt('How much have you saved so far?')` flow. The actual
     *   prompt() call is dispatched as a real DOM event
     *   (cozyos:vault-request-progress-input above) for a UI layer to
     *   handle — this module never calls window.prompt() itself,
     *   consistent with not owning blocking browser dialogs inside a
     *   Shell-hosted module.
     */
    function addProgress(goalId, amount) { return addGoalProgress(goalId, amount); }

    function init() {
        const r = root();
        if (!r) return;
        const session = window.CozyOS && window.CozyOS.Session ? window.CozyOS.Session.current() : null;
        state.ownerCozyId = session?.cozyId || null;
        state.ownerUid = session?.uid || null;
        bindEvents(r);
        refreshItems();
    }

    function destroy() {
        state = { ownerCozyId: null, ownerUid: null, activeFilter: "", items: [] };
    }

    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    window.CozyOS.Modules["personal-vault"] = {
        init, destroy,
        saveItem, loadItems, togglePin, archiveItem, shareItem,
        listGoals, createGoalRecord, addGoalProgress, addProgress, achieveGoalRecord,
        generateSmartTip, VAULT_TYPES,
    };
})();
