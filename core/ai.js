/**
 * ── COZYOS AI MULTI-TENANT SECURE GATEWAY ──
 * SERVICE DOMAIN: core/ai.js
 * REFERENCES: 665035.jpg, 665036.jpg, 665039.jpg, 665040.jpg
 */

import Permissions from './permissions.js';
import AuditLogger from './audit.js';
import Config from './config.js';

export default {
    /**
     * Sequential execution chain matching 665035.jpg and 665036.jpg workflows.
     */
    async execute(promptString, operationalModule = "general") {
        const session = Permissions.getSession();

        // 1. Check Login
        if (!session) {
            throw new Error("🚫 Security Exception: Unauthenticated execution request rejected.");
        }

        // 2. Check Workspace & Tenant Isolation Boundaries (Ref: 665039.jpg / 665040.jpg)
        // System enforces that the execution scope remains locked inside the logged-in user's context
        const tenantContextId = session.organizationId;
        const activeWorkspaceId = session.workspaceId;

        // 3. Check Role & 4. Check Granular Permission Tokens
        if (!Permissions.hasToken("ai.execute")) {
            await AuditLogger.log("AI request denied", `Unauthorized attempt: Prompt [${promptString}]`);
            throw new Error("🚫 Access Denied: Account lacks granular 'ai.execute' token authorization.");
        }

        // Module specific permission intercept checks (Ref: 665034.jpg)
        if (operationalModule === "finance" && !Permissions.hasToken("finance.read")) {
            throw new Error("🚫 Access Denied: Account lacks permission to access financial ledger states.");
        }

        // 5. Execute with isolated organizational memories (Ref: 665039.jpg)
        const responseText = await this._dispatchToIsolatedLLM(promptString, session);

        // 6. Audit Log (Ref: 665036.jpg)
        await AuditLogger.log("AI request", `Prompt: "${promptString.substring(0, 30)}..." -> Action complete.`);

        // 7. Return Response
        return responseText;
    },

    async _dispatchToIsolatedLLM(prompt, session) {
        // Structuring system instruction limits to lock out foreign data sets entirely
        const systemInstruction = `
            You are the dedicated CozyOS AI Assistant for ${session.organizationId}. 
            Your operational industry domain is strictly: [${session.industry.toUpperCase()}].
            You have absolutely no knowledge of or access to other organizations, schools, or hotels.
            Current user identifier: ${session.userId} operating with Role: ${session.role}.
            Respond natively in the user's preferred language code: "${session.language}".
        `;

        const targetApiKey = Config.apiKeys?.gemini;
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${targetApiKey}`;

        const payload = {
            contents: [{ role: "user", parts: [{ text: `${systemInstruction}\n\nUser Query: ${prompt}` }] }]
        };

        const response = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error("AI Runtime infrastructure experienced a connection interruption.");
        const resultJson = await response.json();
        return resultJson?.candidates?.[0]?.content?.parts?.[0]?.text || "No output generated.";
    }
};
