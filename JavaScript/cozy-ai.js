// ============================================================
//  cozy-ai.js — OurCozy AI Brain · Cozy AI
//  Personality: Warm · Friendly · Patient · Humble · African
//  "People speak naturally. AI understands carefully."
//  "AI asks when unsure. AI learns humbly."
//  "Africa teaches AI. AI helps Africa grow."
//  Privacy: AI remembers only with permission.
//  Children are protected. Suppliers are protected.
// ============================================================

import { db, collection, doc, addDoc, getDocs, getDoc,
  updateDoc, query, where, orderBy, limit,
  serverTimestamp } from './firebase.js';

// ── Cozy AI Personality ───────────────────────────────────
export const PERSONALITY = {
  name:     'Cozy AI',
  traits:   ['warm','friendly','respectful','patient','curious','humble'],
  mission:  'Africa teaches AI. AI helps Africa grow.',
  rules: [
    'Always ask when unsure — never guess about important things',
    'Learn slowly and humbly from users',
    'Ask permission before storing personal information',
    'Protect children — never share adult content',
    'Protect suppliers — never expose private business info',
    'Speak the user\'s language — Kiswahili, Luo, Kikuyu, English',
    'Celebrate African knowledge and culture',
    'Never pretend to know what it does not know',
  ],
};

// ── Intent categories ─────────────────────────────────────

const INTENTS = {
  // Kiswahili + English — Search / Need
  need_rental:     /natafuta nyumba|need.*house|need.*room|looking.*rental|rent.*room|nyumba.*nataka/i,
  need_service:    /need.*electrician|need.*plumber|need.*fundi|nataka fundi|ninahitaji fundi|hire.*tech/i,
  need_product:    /buy|nunua|nataka kununua|ninahitaji|looking for.*product|find me/i,
  need_mobility:   /electric.*bike|e-bike|scooter|delivery.*bike|bodaboda.*electric/i,
  need_craft:      /hand.*made|craft|sanaa|mkono.*bidhaa|wall art/i,

  // Offer / Sell
  sell_product:    /nauza|i sell|i have.*for sale|nina.*uza|bidhaa zangu/i,
  sell_rental:     /i have.*rental|nina nyumba|nyumba zangu|i have rooms|nina bedsitter/i,
  sell_service:    /i offer|ninaweza|i am.*electrician|mimi ni fundi|i provide/i,
  sell_mobility:   /sell.*bike|uza.*baiskeli|nina.*scooter|nina.*e-bike/i,
  sell_craft:      /ninafanya|i make|i create|nina.*sanaa|craft.*creator/i,

  // Community / People
  invite_friend:   /invite|alika rafiki|share.*link|referral/i,
  find_person:     /find.*person|search.*person|who.*is|tafuta mtu/i,

  // Wallet / Earnings
  check_wallet:    /wallet|pesa zangu|my money|earnings|balance|niko na pesa|withdraw/i,

  // Learn
  learn:           /learn|jifunza|teach me|fundisha|lesson|course/i,

  // Chat
  chat:            /chat|zungumza|send.*message|talk.*to/i,

  // Greeting
  greeting:        /^(hi|hello|hujambo|habari|sasa|mambo|niaje|howdy|hey)/i,
};

// ── Language detection ─────────────────────────────────────
const SW_WORDS = ['natafuta','ninahitaji','nina','nauza','habari','hujambo','sawa','ndiyo','hapana','asante','karibu','fundi','nyumba','pesa','kazi','bidhaa','uza','nunua','sasa','mambo'];
function detectLang(text) {
  const lower = text.toLowerCase();
  const swScore = SW_WORDS.filter(w => lower.includes(w)).length;
  return swScore >= 2 ? 'sw' : swScore === 1 ? 'mixed' : 'en';
}

// ── Greetings per language ────────────────────────────────
function greeting(lang, name) {
  const n = name ? `, ${name}` : '';
  if (lang === 'sw') return `Habari${n}! 👋 Ninaweza kukusaidia vipi leo?`;
  return `Hello${n}! 👋 How can I help you today?`;
}

// ── Core ask function — humble & warm ─────────────────────
async function ask(text, user = {}) {
  const lang   = detectLang(text);
  const lower  = text.toLowerCase().trim();
  const sw     = lang === 'sw' || lang === 'mixed';
  const name   = user.name ? user.name.split(' ')[0] : '';

  // Supplier protection check first
  if (supplierProtectionCheck(text)) {
    return {
      type: 'supplier_protected', lang,
      reply: sw
        ? `🔒 Samahani ${name||''}. Taarifa za wasambazaji zinalindwa.\n\nOurCozy inaheshimu mahusiano ya biashara.\nUnaweza kuwasiliana na muuzaji moja kwa moja kupitia orodha zao.`
        : `🔒 Sorry ${name||''}. Supplier information is protected.\n\nOurCozy respects business relationships.\nYou can contact suppliers directly through their listings.`,
      action: null
    };
  }

  // Greeting — warm response
  if (INTENTS.greeting.test(lower)) {
    return {
      type: 'greeting', lang,
      reply: greeting(lang, name),
      action: null
    };
  }

  // Vault / save intent
  if (/save|store|remember|kumbuka|hifadhi|vault/i.test(lower)) {
    return {
      type: 'vault', lang,
      reply: sw
        ? `🏠 Sawa ${name||''}! Ninahifadhi kwenye Cozy Vault yako.\nKumbuka — unaweza kuniambia kuhifadhi na ruhusa yako tu.`
        : `🏠 Sure ${name||''}! Saving to your Cozy Vault.\nRemember — I only store things with your permission.`,
      action: 'open', dest: 'vault.html'
    };
  }

  // Coach intent
  if (/coach|help me|guide|advice|plan|biashara|akiba|lengo/i.test(lower)) {
    return {
      type: 'coach', lang,
      reply: sw
        ? `🤖 Cozy Coach yuko hapa ${name||''}!\nNinaweza kukusaidia na biashara, akiba, malengo, masomo na kilimo.`
        : `🤖 Cozy Coach is here ${name||''}!\nI can help with business, savings, goals, studies and farming.`,
      action: 'open', dest: 'vault.html#coach'
    };
  }

  // Match intent
  for (const [intent, pattern] of Object.entries(INTENTS)) {
    if (pattern.test(lower)) {
      const result = await handleIntent(intent, text, lang, user);
      // Log for AI learning (humble — only summaries, no private data)
      _logInteraction({ text: text.slice(0, 50), intent, lang, uid: user.uid || '' }).catch(() => {});
      return result;
    }
  }

  // Unknown — ask humbly, never guess
  const unclear = sw
    ? `Samahani ${name||''}! 🤖 Sijaelewea vizuri.\n\nNinajifunza polepole — AI inauliza ili isaidie vizuri.\n\nUnasema unataka:\n• 🛒 Kununua kitu?\n• 🏪 Kuuza kitu?\n• 🏠 Kutafuta nyumba?\n• 🔧 Kupata huduma?\n• 🚐 Usafiri?\n• 💰 Msaada wa biashara?\n\nNiambie zaidi!`
    : `Sorry ${name||''}! 🤖 I'm not sure I understood.\n\nI'm still learning — I ask so I can help you better.\n\nAre you looking to:\n• 🛒 Buy something?\n• 🏪 Sell something?\n• 🏠 Find a rental?\n• 🔧 Find a service?\n• 🚐 Find transport?\n• 💰 Business advice?\n\nTell me more!`;

  return { type: 'unclear', lang, reply: unclear, action: 'clarify' };
}

// ── Intent handlers ───────────────────────────────────────
async function handleIntent(intent, text, lang, user) {
  const sw = lang === 'sw' || lang === 'mixed';

  const RESPONSES = {
    need_rental:   { reply: sw ? 'Unajua! Ninaangalia nyumba zinazopatikana... 🏠' : 'Got it! Let me find available rentals for you 🏠', action: 'open', dest: 'rentals.html' },
    need_service:  { reply: sw ? 'Sawa! Ninatafuta watoa huduma karibu nawe... 🔧' : 'Sure! Finding service providers near you 🔧', action: 'open', dest: 'services.html' },
    need_product:  { reply: sw ? 'Sawa! Angalia bidhaa hapa... 🛒' : 'Let me show you available products 🛒', action: 'open', dest: 'index.html' },
    need_mobility: { reply: sw ? 'Sawa! Angalia baiskeli za umeme... ⚡' : 'Checking electric mobility options ⚡', action: 'open', dest: 'mobility.html' },
    need_craft:    { reply: sw ? 'Poa! Angalia sanaa na bidhaa za mkono... 🎨' : 'Showing handmade crafts and creative items 🎨', action: 'open', dest: 'crafts.html' },
    sell_product:  { reply: sw ? 'Vizuri! Ongeza bidhaa yako hapa... 🏪' : 'Great! List your product here 🏪', action: 'open', dest: 'index.html' },
    sell_rental:   { reply: sw ? 'Sawa! Ongeza nyumba yako hapa... 🏠' : 'Perfect! List your rental property 🏠', action: 'open', dest: 'rentals.html' },
    sell_service:  { reply: sw ? 'Vizuri! Ongeza huduma yako... 🔧' : 'Excellent! Add your service listing 🔧', action: 'open', dest: 'services.html' },
    sell_mobility: { reply: sw ? 'Sawa! Ongeza baiskeli yako... ⚡' : 'Let\'s list your e-vehicle ⚡', action: 'open', dest: 'mobility.html' },
    sell_craft:    { reply: sw ? 'Vizuri! Uza sanaa yako... 🎨' : 'Great! Sell your creative work 🎨', action: 'open', dest: 'crafts.html' },
    invite_friend: { reply: sw ? 'Nzuri! Shiriki kiungo chako cha CozyID... 📤' : 'Share your Cozy ID referral link and earn! 📤', action: 'share' },
    check_wallet:  { reply: sw ? 'Hapa kona ya pesa yako... 💳' : 'Opening your wallet 💳', action: 'open', dest: 'wallet.html' },
    learn:         { reply: sw ? 'Jifunza na Cozy Learn! 📚' : 'Welcome to Cozy Learn! 📚', action: 'open', dest: 'learn.html' },
    chat:          { reply: sw ? 'Fungua mazungumzo yako... 💬' : 'Opening your chats 💬', action: 'open', dest: 'chat.html' },
    find_person:   { reply: sw ? 'Ninatafuta mtu... 👤' : 'Searching for that person 👤', action: 'search' },
  };

  const r = RESPONSES[intent] || { reply: 'I found something that might help!', action: null };
  return { type: intent, lang, ...r };
}

// ── Daily summary — warm, humble, African ────────────────
async function getDailySummary(cozyId, name, lang = 'en') {
  const sw   = lang === 'sw';
  const hour = new Date().getHours();
  const n    = name ? name.split(' ')[0] : '';
  const greet = hour < 12
    ? (sw ? 'Habari za asubuhi' : 'Good morning')
    : hour < 17
    ? (sw ? 'Habari za mchana'  : 'Good afternoon')
    : (sw ? 'Habari za jioni'   : 'Good evening');
  const lines = [`${greet}${n ? ', ' + n : ''}! 🌟`];
  let hasData = false;

  try {
    const ls = await getDocs(query(collection(db,'cozyLeads'),
      where('addedBy','==',cozyId||''), where('status','==','new')));
    if (ls.size > 0) {
      lines.push(sw ? `📋 Maombi ${ls.size} mapya yanakusubiri.` : `📋 ${ls.size} new lead${ls.size>1?'s':''} waiting.`);
      hasData = true;
    }
  } catch(_) {}

  try {
    const ws = await getDoc(doc(db,'cozyWalletTotals',cozyId||'x'));
    if (ws.exists()) {
      const w = ws.data();
      if ((w.pending||0) > 0) {
        lines.push(sw ? `💰 KES ${Number(w.pending).toLocaleString()} inasubiri uthibitisho.` : `💰 KES ${Number(w.pending).toLocaleString()} pending in wallet.`);
        hasData = true;
      }
      if ((w.balance||0) > 0) lines.push(sw ? `✅ Salio: KES ${Number(w.balance).toLocaleString()}.` : `✅ Balance: KES ${Number(w.balance).toLocaleString()}.`);
    }
  } catch(_) {}

  try {
    const cs = await getDocs(query(collection(db,'cozyContacts'), where('addedBy','==',cozyId||'')));
    if (cs.size > 0) lines.push(sw ? `👥 Una anwani ${cs.size} kwenye mtandao wako.` : `👥 ${cs.size} contact${cs.size>1?'s':''} in your network.`);
  } catch(_) {}

  if (!hasData) lines.push(sw ? 'Kila kitu kipo sawa leo. ✅' : 'Everything looks good today. ✅');

  // Daily wisdom from the CozyID Constitution
  const wisdom_en = [
    '🌍 Africa teaches AI. Your words and knowledge have power.',
    '🤝 Communities grow when everyone benefits.',
    '🌱 Small steps every day build a big future.',
    '🏪 Small businesses are the heart of Africa.',
    '💡 People speak naturally. AI listens carefully.',
    '🛡️ Trust is earned through actions, not words.',
    '❤️ Children are protected. Always.',
  ];
  const wisdom_sw = [
    '🌍 Afrika inafundisha AI. Maneno yako yana nguvu.',
    '🤝 Jamii inakua wakati kila mtu ananufaika.',
    '🌱 Hatua ndogo kila siku zinajenga mustakabali mkubwa.',
    '🏪 Biashara ndogo ndogo ni moyo wa Afrika.',
    '💡 Watu wanazungumza asili. AI inasikia kwa makini.',
    '🛡️ Imani hujengwa kwa vitendo, si maneno.',
    '❤️ Watoto wanalindwa. Daima.',
  ];
  const wisdom = (sw ? wisdom_sw : wisdom_en);
  lines.push('\n💬 ' + wisdom[new Date().getDay() % wisdom.length]);
  lines.push(sw ? '\nNinaweza kukusaidia na nini leo?' : '\nWhat would you like to do today?');
  return lines.join('\n');
}

// ── Log interaction (AI learning) ────────────────────────
async function _logInteraction(data) {
  await addDoc(collection(db, 'cozyAILogs'), {
    ...data, timestamp: serverTimestamp()
  });
}

// ── Teach AI unknown word ─────────────────────────────────
async function teachWord(word, meaning, language, category, region, suggestedBy) {
  // Check if word already exists
  const existing = await getDocs(query(
    collection(db, 'cozyLanguage'),
    where('word', '==', word.toLowerCase())
  ));
  if (!existing.empty) {
    // Upvote existing
    const ref = existing.docs[0].ref;
    const data = existing.docs[0].data();
    const votes = (data.votes || 1) + 1;
    const confidence = Math.min(99, Math.round((votes / (votes + 1)) * 100));
    await updateDoc(ref, { votes, confidence, updatedAt: serverTimestamp() });
    return { action: 'upvoted', confidence };
  }
  // New word
  await addDoc(collection(db, 'cozyLanguage'), {
    word:        word.toLowerCase().trim(),
    meaning:     meaning.trim(),
    language:    language || 'unknown',
    category:    category || 'general',
    region:      region || '',
    suggestedBy, confirmedBy: [], votes: 1,
    confidence:  50, verified: false,
    createdAt:   serverTimestamp(), updatedAt: serverTimestamp()
  });
  return { action: 'added', confidence: 50 };
}

// ── Supplier protection check ─────────────────────────────
function supplierProtectionCheck(text) {
  const patterns = [
    /who.*supplier|supplier.*number|where.*buy.*wholesale|give.*supplier|supplier.*contact/i,
    /nani.*anakuuzia|nunua wapi|supplier.*yako|unanunua wapi/i
  ];
  return patterns.some(p => p.test(text));
}

// ── Age-appropriate content check ─────────────────────────
function isAgeAppropriate(content, userAge) {
  if (!userAge || userAge >= 18) return true;
  const blocked12 = ['wallet','rental','affiliate','marketplace','stranger'];
  const blocked17 = ['wallet','affiliate'];
  const age = Number(userAge);
  const lower = content.toLowerCase();
  if (age <= 12) return !blocked12.some(b => lower.includes(b));
  if (age <= 17) return !blocked17.some(b => lower.includes(b));
  return true;
}

// ── Export ───────────────────────────────────────────────
window.CozyAI = {
  ask, getDailySummary, teachWord,
  detectLang, supplierProtectionCheck,
  isAgeAppropriate, greeting, PERSONALITY
};
export { ask, getDailySummary, teachWord, detectLang, supplierProtectionCheck, isAgeAppropriate, greeting, PERSONALITY };
