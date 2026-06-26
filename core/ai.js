import { processSchoolVoiceIntent } from './ai/schoolHandler.js';
import { processBusinessVoiceIntent } from './ai/businessHandler.js';
import { processMpesaVoiceIntent } from './ai/mpesaHandler.js';
import { processHospitalVoiceIntent } from './ai/hospitalHandler.js';
import { processChurchVoiceIntent } from './ai/churchHandler.js';
import { processHotelVoiceIntent } from './ai/hotelHandler.js';

// Inside your window.CozyOS.AI.execute(inputPayload) method loop block:
const industry = session.industry.toLowerCase();
let result = null;

if (industry === "school") result = await processSchoolVoiceIntent(cleanTextPrompt, context);
else if (industry === "retail" || industry === "shop") result = await processBusinessVoiceIntent(cleanTextPrompt, context);
else if (industry === "agent") result = await processMpesaVoiceIntent(cleanTextPrompt, context);
else if (industry === "hospital") result = await processHospitalVoiceIntent(cleanTextPrompt, context);
else if (industry === "church") result = await processChurchVoiceIntent(cleanTextPrompt, context);
else if (industry === "hotel" || industry === "restaurant") result = await processHotelVoiceIntent(cleanTextPrompt, context);

if (result) return result;
