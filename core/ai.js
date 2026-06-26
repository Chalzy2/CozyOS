// Append clean plugin imports to your central core gateway logic
import { processAgritechVoiceIntent } from './ai/agritechHandler.js';
import { processSaccoVoiceIntent } from './ai/saccoHandler.js';

// Inside your core window.CozyOS.AI.execute(inputPayload) distribution loop:
const sectorContext = session.industry.toLowerCase();

if (sectorContext === "agritech" || sectorContext === "agrovet") {
    result = await processAgritechVoiceIntent(cleanTextPrompt, session);
} else if (sectorContext === "sacco" || sectorContext === "chama") {
    result = await processSaccoVoiceIntent(cleanTextPrompt, session);
}
