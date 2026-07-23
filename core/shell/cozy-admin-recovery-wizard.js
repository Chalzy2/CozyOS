/**
 * CozyOS — Administrator Recovery Wizard
 * File Reference: core/shell/cozy-admin-recovery-wizard.js
 * Layer: Core / Shell UI
 * Version: 1.0.0-ENTERPRISE
 * Milestone: 130
 *
 * CANONICAL OWNERSHIP
 *   Owns: the recovery wizard FORM and its step flow (identify user →
 *   choose an enabled, real method → verify it → set a new password).
 *   Nothing else.
 *
 *   Does NOT own — and never re-implements:
 *     ✗ Which recovery methods are enabled — reads AuthPolicyEngine's
 *       real "administrator-recovery-wizard" policy tree; never hides
 *       or reveals a method by its own separate rule.
 *     ✗ Verifying any method — calls the real, single
 *       AuthFactorRegistry provider for whichever one method the
 *       administrator chose. Deliberately does NOT use
 *       AuthPolicyEngine.evaluate() here: that method calls every
 *       factor in the tree with one shared context, which would
 *       silently trigger a real WebAuthn browser prompt on every
 *       attempt regardless of which method was chosen. Calling the one
 *       chosen provider directly avoids that real, confirmed problem.
 *     ✗ Resetting the password — calls only
 *       `IdentityEngine.resetPassword(username, newPassword)`, exactly
 *       as specified. Never touches password hashing itself.
 *
 * RULES HONORED
 *   Never bypasses IdentityEngine. Never uses Firebase. Never sends an
 *   email reset link (no such capability exists in this codebase).
 *   Fails closed: an unloaded engine, an unknown username, a disabled/
 *   fake method, or a failed verification all end in a real, stated
 *   refusal — never a fabricated success.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const WIZARD_VERSION = "1.0.0-ENTERPRISE";

    const METHOD_LABELS = {
        "trusted-device": "Trusted Device",
        "recovery-phrase": "Recovery Phrase",
        "recovery-questions": "Recovery Questions",
        "recovery-key": "Recovery Key",
        "emergency-recovery-code": "Emergency Recovery Code",
        "security-key": "Platform Authenticator (WebAuthn)"
    };

    function escapeHtml(v) {
        return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    }

    class CozyAdminRecoveryWizard {
        #overlay = null;
        #userId = null;
        #username = null;

        getVersion() { return WIZARD_VERSION; }

        /** open() — real, self-contained modal; does not depend on any caller-supplied container. */
        open() {
            if (this.#overlay) return;
            this.#userId = null; this.#username = null;
            const overlay = document.createElement("div");
            overlay.id = "cozy-recovery-wizard-overlay";
            overlay.style.cssText = "position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;";
            overlay.innerHTML = `<div id="cozy-recovery-wizard-panel" style="max-width:420px;width:92%;max-height:85vh;overflow:auto;padding:28px;border-radius:12px;background:#fff;box-shadow:0 10px 40px rgba(0,0,0,0.25);"></div>`;
            document.body.appendChild(overlay);
            this.#overlay = overlay;
            this.#renderIdentifyStep();
        }

        close() {
            if (this.#overlay) { this.#overlay.remove(); this.#overlay = null; }
        }

        #panel() { return this.#overlay.querySelector("#cozy-recovery-wizard-panel"); }

        #renderIdentifyStep() {
            this.#panel().innerHTML = `
                <h2 style="margin:0 0 4px 0;font-size:18px;">Administrator Account Recovery</h2>
                <p style="margin:0 0 16px 0;color:#666;font-size:13px;">Enter your username to begin.</p>
                <input id="cz-recovery-username" type="text" placeholder="Username" style="display:block;width:100%;box-sizing:border-box;padding:8px;margin-bottom:10px;border:1px solid #ccc;border-radius:6px;">
                <div id="cz-recovery-error" style="display:none;margin-bottom:10px;padding:8px;border-radius:6px;background:#fef2f2;color:#b91c1c;font-size:12px;"></div>
                <div style="display:flex;gap:8px;">
                    <button id="cz-recovery-continue" style="flex:1;padding:9px;border:none;border-radius:6px;background:#2563eb;color:#fff;font-weight:600;cursor:pointer;">Continue</button>
                    <button id="cz-recovery-cancel" style="padding:9px 14px;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer;">Cancel</button>
                </div>`;
            this.#panel().querySelector("#cz-recovery-cancel").addEventListener("click", () => this.close());
            this.#panel().querySelector("#cz-recovery-continue").addEventListener("click", () => this.#handleIdentify());
        }

        #showError(message) {
            const el = this.#panel().querySelector("#cz-recovery-error, #cz-method-error");
            if (!el) return;
            el.textContent = message;
            el.style.display = "block";
        }

        #handleIdentify() {
            const username = this.#panel().querySelector("#cz-recovery-username").value.trim();
            const identity = window.CozyOS.IdentityEngine;
            if (!identity || typeof identity.listUsers !== "function") { this.#showError("IdentityEngine is not loaded — cannot look up any real account."); return; }
            if (!username) { this.#showError("Username is required."); return; }
            const user = identity.listUsers().find(u => u.username === username);
            if (!user) { this.#showError(`No real administrator account found for "${username}".`); return; }
            this.#userId = user.id; this.#username = username;
            this.#renderMethodSelectStep();
        }

        /**
         * #enabledMethods()
         *   Real — reads AuthPolicyEngine's own "administrator-recovery-
         *   wizard" policy tree for which method NAMES an administrator
         *   has enabled, then asks AuthFactorRegistry whether each one
         *   currently has a real (isReal:true) provider. A method must
         *   be BOTH admin-enabled AND genuinely functional to be
         *   offered — never one without the other.
         */
        #enabledMethods() {
            const policyEngine = window.CozyOS.AuthPolicyEngine;
            const registry = window.CozyOS.AuthFactorRegistry;
            if (!policyEngine || !registry) return [];
            const policy = policyEngine.getPolicy("administrator-recovery-wizard");
            const names = (policy && Array.isArray(policy.any)) ? policy.any.filter(n => typeof n === "string") : [];
            return names.map(name => {
                const provider = registry.getProvider(name);
                return { name, label: METHOD_LABELS[name] || name, isReal: !!(provider && provider.isReal), note: provider ? provider.note : "Not registered in AuthFactorRegistry." };
            });
        }

        #renderMethodSelectStep() {
            const policyEngine = window.CozyOS.AuthPolicyEngine;
            const registry = window.CozyOS.AuthFactorRegistry;
            if (!policyEngine || !registry) {
                this.#panel().innerHTML = `<p style="color:#b91c1c;font-size:13px;">AuthPolicyEngine or AuthFactorRegistry is not loaded — cannot determine any real recovery method. Failing closed.</p>
                    <button id="cz-recovery-cancel2" style="margin-top:10px;padding:8px 14px;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer;">Close</button>`;
                this.#panel().querySelector("#cz-recovery-cancel2").addEventListener("click", () => this.close());
                return;
            }
            const methods = this.#enabledMethods();
            const rows = methods.map(m => `
                <div style="display:flex;align-items:center;justify-content:space-between;padding:10px;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:8px;">
                    <div>
                        <div style="font-size:13px;font-weight:600;">${escapeHtml(m.label)}</div>
                        ${!m.isReal ? `<div style="font-size:11px;color:#999;">Unavailable — ${escapeHtml(m.note)}</div>` : ""}
                    </div>
                    <button data-method="${escapeHtml(m.name)}" ${m.isReal ? "" : "disabled"} class="cz-recovery-method-btn"
                        style="padding:6px 12px;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:${m.isReal ? "pointer" : "not-allowed"};background:${m.isReal ? "#2563eb" : "#e5e7eb"};color:${m.isReal ? "#fff" : "#999"};">
                        Try
                    </button>
                </div>`).join("");
            this.#panel().innerHTML = `
                <h2 style="margin:0 0 4px 0;font-size:18px;">Choose a Recovery Method</h2>
                <p style="margin:0 0 14px 0;color:#666;font-size:13px;">At least one method must succeed. Only methods your administrator policy has enabled and that genuinely work are shown as available.</p>
                ${rows || `<p style="font-size:13px;color:#b91c1c;">No recovery methods are currently enabled.</p>`}
                <button id="cz-recovery-cancel3" style="margin-top:6px;padding:8px 14px;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer;">Cancel</button>`;
            this.#panel().querySelector("#cz-recovery-cancel3").addEventListener("click", () => this.close());
            this.#panel().querySelectorAll(".cz-recovery-method-btn").forEach(btn => {
                btn.addEventListener("click", () => this.#renderMethodFormStep(btn.getAttribute("data-method")));
            });
        }

        #methodFormHtml(method) {
            switch (method) {
                case "trusted-device":
                    return `<input id="cz-method-input" type="text" placeholder="Device ID" style="display:block;width:100%;box-sizing:border-box;padding:8px;margin-bottom:10px;border:1px solid #ccc;border-radius:6px;">`;
                case "recovery-phrase":
                    return `<input id="cz-method-input" type="text" placeholder="Recovery phrase (word-word-word...)" style="display:block;width:100%;box-sizing:border-box;padding:8px;margin-bottom:10px;border:1px solid #ccc;border-radius:6px;">`;
                case "recovery-key":
                    return `<input id="cz-method-input" type="file" accept=".json,application/json" style="display:block;width:100%;margin-bottom:10px;">`;
                case "emergency-recovery-code":
                    return `<input id="cz-method-input" type="text" placeholder="Emergency Recovery Code" style="display:block;width:100%;box-sizing:border-box;padding:8px;margin-bottom:10px;border:1px solid #ccc;border-radius:6px;text-transform:uppercase;">`;
                case "security-key":
                    return `<p style="font-size:13px;color:#666;margin:0 0 10px 0;">Clicking Verify will prompt your browser's Platform Authenticator (fingerprint, face, or PIN).</p>`;
                case "recovery-questions": {
                    const rqm = window.CozyOS.RecoveryQuestionManager;
                    const questions = rqm ? rqm.listQuestions(this.#userId).filter(q => q.enabled) : [];
                    if (questions.length === 0) return `<p style="font-size:13px;color:#b91c1c;">No recovery questions are configured for this account.</p>`;
                    return questions.map(q => `
                        <label style="font-size:12px;color:#444;display:block;margin-bottom:8px;">${escapeHtml(q.question)}
                            <input type="text" class="cz-recovery-answer" data-question-id="${escapeHtml(q.questionId)}" style="display:block;width:100%;box-sizing:border-box;padding:8px;margin-top:4px;border:1px solid #ccc;border-radius:6px;">
                        </label>`).join("");
                }
                default:
                    return "";
            }
        }

        async #collectMethodContext(method) {
            const base = { userId: this.#userId };
            if (method === "recovery-questions") {
                const answers = [...this.#panel().querySelectorAll(".cz-recovery-answer")].map(el => ({ questionId: el.getAttribute("data-question-id"), answer: el.value }));
                return { ...base, answers };
            }
            if (method === "recovery-key") {
                const fileInput = this.#panel().querySelector("#cz-method-input");
                const file = fileInput && fileInput.files && fileInput.files[0];
                if (!file) return { ...base, keyFileContent: "" };
                const text = await file.text();
                return { ...base, keyFileContent: text };
            }
            if (method === "security-key") return base;
            const value = this.#panel().querySelector("#cz-method-input")?.value || "";
            if (method === "trusted-device") return { ...base, deviceId: value };
            if (method === "recovery-phrase") return { ...base, phrase: value };
            if (method === "emergency-recovery-code") return { ...base, code: value };
            return base;
        }

        #renderMethodFormStep(method) {
            this.#panel().innerHTML = `
                <h2 style="margin:0 0 4px 0;font-size:18px;">${escapeHtml(METHOD_LABELS[method] || method)}</h2>
                <div id="cz-method-body">${this.#methodFormHtml(method)}</div>
                <div id="cz-method-error" style="display:none;margin:10px 0;padding:8px;border-radius:6px;background:#fef2f2;color:#b91c1c;font-size:12px;"></div>
                <div style="display:flex;gap:8px;">
                    <button id="cz-method-verify" style="flex:1;padding:9px;border:none;border-radius:6px;background:#2563eb;color:#fff;font-weight:600;cursor:pointer;">Verify</button>
                    <button id="cz-method-back" style="padding:9px 14px;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer;">Back</button>
                </div>`;
            this.#panel().querySelector("#cz-method-back").addEventListener("click", () => this.#renderMethodSelectStep());
            this.#panel().querySelector("#cz-method-verify").addEventListener("click", async () => {
                const registry = window.CozyOS.AuthFactorRegistry;
                const provider = registry && registry.getProvider(method);
                if (!provider) { this.#showError("This method is no longer registered — failing closed."); return; }
                const context = await this.#collectMethodContext(method);
                let result;
                try { result = await provider.verify(context); }
                catch (err) { this.#showError(`Verification threw an error: ${err.message}`); return; }
                if (!result || result.verified !== true) { this.#showError((result && result.reason) || "Verification failed."); return; }
                this.#renderNewPasswordStep();
            });
        }

        #renderNewPasswordStep() {
            this.#panel().innerHTML = `
                <h2 style="margin:0 0 4px 0;font-size:18px;">Create New Password</h2>
                <p style="margin:0 0 14px 0;color:#666;font-size:13px;">Recovery verified. Choose a new password for "${escapeHtml(this.#username)}".</p>
                <input id="cz-new-password" type="password" placeholder="New Password" style="display:block;width:100%;box-sizing:border-box;padding:8px;margin-bottom:10px;border:1px solid #ccc;border-radius:6px;">
                <input id="cz-new-password-confirm" type="password" placeholder="Confirm New Password" style="display:block;width:100%;box-sizing:border-box;padding:8px;margin-bottom:10px;border:1px solid #ccc;border-radius:6px;">
                <div id="cz-method-error" style="display:none;margin-bottom:10px;padding:8px;border-radius:6px;background:#fef2f2;color:#b91c1c;font-size:12px;"></div>
                <div id="cz-recovery-success" style="display:none;margin-bottom:10px;padding:8px;border-radius:6px;background:#f0fdf4;color:#15803d;font-size:12px;"></div>
                <button id="cz-recovery-set-password" style="width:100%;padding:9px;border:none;border-radius:6px;background:#2563eb;color:#fff;font-weight:600;cursor:pointer;">Set New Password</button>`;
            this.#panel().querySelector("#cz-recovery-set-password").addEventListener("click", async () => {
                const password = this.#panel().querySelector("#cz-new-password").value;
                const confirm = this.#panel().querySelector("#cz-new-password-confirm").value;
                if (!password || password !== confirm) { this.#showError("Passwords must match and cannot be empty."); return; }
                const identity = window.CozyOS.IdentityEngine;
                if (!identity || typeof identity.resetPassword !== "function") { this.#showError("IdentityEngine is not loaded — cannot reset the password."); return; }
                const result = await identity.resetPassword(this.#username, password);
                if (!result.available) { this.#showError(result.reason); return; }
                const successEl = this.#panel().querySelector("#cz-recovery-success");
                successEl.textContent = "Password reset. You can now sign in with your new password.";
                successEl.style.display = "block";
                setTimeout(() => this.close(), 2000);
            });
        }
    }

    if (window.CozyOS.AdminRecoveryWizard && typeof window.CozyOS.AdminRecoveryWizard.getVersion === "function") {
        if (window.CozyOS.AdminRecoveryWizard.getVersion() !== WIZARD_VERSION) {
            throw new Error("[CozyOS Framework Execution Error] VERSION_CONFLICT: AdminRecoveryWizard.");
        }
        return;
    }
    window.CozyOS.AdminRecoveryWizard = new CozyAdminRecoveryWizard();
})();
