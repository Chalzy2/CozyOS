// Inside core/ai.js -> Intent Routing Execution Phase Block
const activeIndustry = session.industry?.toLowerCase();

const dynamicTargetHandler = window.CozyOS.KernelPlugins.get(activeIndustry);
const meta = window.CozyOS.PluginMetadata.get(activeIndustry);

if (dynamicTargetHandler && meta?.status === 'enabled') {
    try {
        // Safe Execution: Ensures the sub-handler runs without causing core-level faults
        outcome = await dynamicTargetHandler(normalizedQuery, context, SecurityGuard);
    } catch (pluginError) {
        // Automatically pushes an entry out to the Audit module we built earlier
        await AuditTrail.log(session, "AI_PLUGIN_EXECUTION_FAULT", `Error in ${activeIndustry}: ${pluginError.message}`);
        
        return {
            responseText: `🚨 Subsystem Error: An internal processing exception occurred within the [${activeIndustry.toUpperCase()}] application plugin layer.`,
            pipelineState: "fault"
        };
    }
} else {
    return {
        responseText: `⚠️ System Error: Subsystem [${activeIndustry.toUpperCase()}] is either disabled or not registered in this tenant cloud block.`,
        pipelineState: "unsupported"
    };
}
