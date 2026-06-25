// ============================================================
//  cozy-coach.js — Cozy Coach AI
//  Helps with: business, savings, studies, goals, life planning
//  Personality: Warm · Friendly · Patient · Humble · African
//  "People speak naturally. AI understands carefully."
// ============================================================

import {
  db, collection, doc, addDoc, getDoc, getDocs,
  updateDoc, query, where, orderBy, serverTimestamp
} from './firebase.js';

// ── Coach categories ──────────────────────────────────────
export const COACH_TOPICS = {
  business:  { label: 'Business',    icon: '🏪', color: '#1B5E20', desc: 'Start, grow, manage your business' },
  savings:   { label: 'Savings',     icon: '💰', color: '#F9A825', desc: 'Save money and plan finances'     },
  goals:     { label: 'Goals',       icon: '🎯', color: '#EF6C00', desc: 'Set and achieve your goals'       },
  studies:   { label: 'Studies',     icon: '📚', color: '#1565C0', desc: 'Learn and grow your skills'       },
  farming:   { label: 'Farming',     icon: '🌱', color: '#2E7D32', desc: 'Agriculture and food business'    },
  health:    { label: 'Health',      icon: '❤️', color: '#D32F2F', desc: 'Wellness and healthy habits'      },
  family:    { label: 'Family',      icon: '👨‍👩‍👧', color: '#6A1B9A', desc: 'Family planning and support'      },
  community: { label: 'Community',   icon: '🌍', color: '#00A86B', desc: 'Build and help your community'    },
};

// ── Goal structure ────────────────────────────────────────
function blankGoal(cozyId, uid) {
  return {
    cozyId, uid,
    title:        '',
    description:  '',
    category:     'goals',
    targetAmount: 0,
    savedAmount:  0,
    targetDate:   '',
    steps:        [],
    progress:     0,
    status:       'active',   // active | paused | achieved | cancelled
    reminderDays: 7,
    language:     'en',
    createdAt:    serverTimestamp(),
    updatedAt:    serverTimestamp(),
  };
}

// ── Save goal ─────────────────────────────────────────────
export async function saveGoal(cozyId, uid, data) {
  const goal = { ...blankGoal(cozyId, uid), ...data };
  const ref  = await addDoc(collection(db, 'cozyGoals'), goal);
  return ref.id;
}

// ── Get goals ─────────────────────────────────────────────
export async function getGoals(cozyId) {
  try {
    const q    = query(
      collection(db, 'cozyGoals'),
      where('cozyId', '==', cozyId),
      where('status', '==', 'active'),
      orderBy('createdAt', 'desc')
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (_) {
    const snap = await getDocs(
      query(collection(db, 'cozyGoals'), where('cozyId', '==', cozyId))
    );
    return snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .filter(g => g.status === 'active');
  }
}

// ── Update goal progress ──────────────────────────────────
export async function updateGoalProgress(id, savedAmount) {
  const snap  = await getDoc(doc(db, 'cozyGoals', id));
  if (!snap.exists()) return;
  const goal  = snap.data();
  const progress = goal.targetAmount > 0
    ? Math.min(100, Math.round((savedAmount / goal.targetAmount) * 100))
    : 0;
  const status = progress >= 100 ? 'achieved' : 'active';
  await updateDoc(doc(db, 'cozyGoals', id), {
    savedAmount, progress, status,
    updatedAt: serverTimestamp()
  });
  return { progress, status };
}

// ── Mark goal achieved ────────────────────────────────────
export async function achieveGoal(id) {
  await updateDoc(doc(db, 'cozyGoals', id), {
    status: 'achieved', progress: 100,
    achievedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

// ── Coach response engine (humble AI) ────────────────────
export function coachReply(topic, message, lang = 'en', userName = '') {
  const sw  = lang === 'sw';
  const name = userName ? `, ${userName.split(' ')[0]}` : '';
  const lower = message.toLowerCase();

  // Business advice
  if (topic === 'business' || /biashara|business|sell|uza|shop|stock/i.test(message)) {
    if (/start|anza|begin|new/i.test(lower)) {
      return sw
        ? `Habari${name}! 🏪 Kuanza biashara ni hatua nzuri. Niambie zaidi:\n\n• Una mtaji kiasi gani?\n• Unataka kuuza nini?\n• Uko wapi?\n\nNitakusaidia kupanga hatua za kwanza. Cozy AI inajifunza polepole — nakuuliza ili nikusaidie vizuri.`
        : `Hello${name}! 🏪 Starting a business is a great step. Tell me more:\n\n• How much capital do you have?\n• What do you want to sell?\n• Where are you located?\n\nI'll help you plan your first steps. Cozy AI learns slowly — I ask so I can help you better.`;
    }
    if (/profit|faida|income|pesa/i.test(lower)) {
      return sw
        ? `Vizuri${name}! 💰 Kuhesabu faida:\n\n1️⃣ Hesabu gharama zako (stock, rent, usafiri)\n2️⃣ Hesabu mapato yako\n3️⃣ Faida = Mapato minus Gharama\n\nUnataka nikusaidie kuhesabu hii?`
        : `Great${name}! 💰 To calculate profit:\n\n1️⃣ Add up your costs (stock, rent, transport)\n2️⃣ Add up your income\n3️⃣ Profit = Income minus Costs\n\nWould you like me to help you calculate this?`;
    }
    return sw
      ? `Sawa${name}! 🏪 Ninaweza kukusaidia na biashara yako. Niambie — una swali gani hasa leo?`
      : `Sure${name}! 🏪 I can help with your business. Tell me — what specific question do you have today?`;
  }

  // Savings advice
  if (topic === 'savings' || /save|akiba|saving|pesa|money|deposit/i.test(message)) {
    return sw
      ? `Vizuri sana${name}! 💰 Kuweka akiba ni jambo zuri sana.\n\nSheria rahisi ya akiba:\n\n🟢 Pata pesa → Weka akiba KWANZA\n🟢 Kisha tumia iliyobaki\n\nUnaweza kuanza na kiasi kidogo — hata KES 50 kwa siku.\n\nUna lengo gani la akiba?`
      : `Well done${name}! 💰 Saving is a great habit.\n\nSimple saving rule:\n\n🟢 Earn money → Save FIRST\n🟢 Then spend what's left\n\nYou can start small — even KES 50 a day.\n\nWhat is your savings goal?`;
  }

  // Goals
  if (topic === 'goals' || /goal|lengo|plan|dream|ndoto/i.test(message)) {
    return sw
      ? `Poa${name}! 🎯 Kuweka malengo kunakusaidia kufanikiwa.\n\nHebu ufuate hatua hizi:\n\n1️⃣ Andika lengo lako kwa uwazi\n2️⃣ Weka tarehe ya kukamilisha\n3️⃣ Gawanya katika hatua ndogo ndogo\n4️⃣ Angalia maendeleo yako kila wiki\n\nLengo lako ni nini${name}?`
      : `Nice${name}! 🎯 Setting goals helps you succeed.\n\nFollow these steps:\n\n1️⃣ Write your goal clearly\n2️⃣ Set a deadline\n3️⃣ Break it into small steps\n4️⃣ Check progress every week\n\nWhat is your goal${name}?`;
  }

  // Studies
  if (topic === 'studies' || /study|learn|school|jifunza|shule|exam/i.test(message)) {
    return sw
      ? `Vizuri${name}! 📚 Kujifunza ni nguvu yako.\n\nVidokezo vya kusoma vizuri:\n\n📖 Soma kidogo kila siku — si saa nyingi mara moja\n✏️ Andika notes kwa mkono wako\n🔄 Jiulize maswali baada ya kusoma\n😴 Lala vizuri — ubongo hukua usiku\n\nUnasoma nini sasa hivi?`
      : `Great${name}! 📚 Learning is your power.\n\nStudy tips:\n\n📖 Study a little every day — not many hours at once\n✏️ Write notes by hand\n🔄 Ask yourself questions after reading\n😴 Sleep well — your brain grows at night\n\nWhat are you studying right now?`;
  }

  // Default warm response
  return sw
    ? `Habari${name}! 🤖 Mimi ni Cozy Coach — msaidizi wako wa maisha.\n\nNinaweza kukusaidia na:\n🏪 Biashara · 💰 Akiba · 🎯 Malengo · 📚 Masomo · 🌱 Kilimo\n\nUnahitaji msaada na nini leo?`
    : `Hello${name}! 🤖 I'm Cozy Coach — your life assistant.\n\nI can help with:\n🏪 Business · 💰 Savings · 🎯 Goals · 📚 Studies · 🌱 Farming\n\nWhat do you need help with today?`;
}

// ── Save coaching session ─────────────────────────────────
export async function saveSession(cozyId, uid, topic, userMsg, aiReply, lang) {
  await addDoc(collection(db, 'cozyCoachSessions'), {
    cozyId, uid, topic, userMsg, aiReply, lang,
    createdAt: serverTimestamp()
  });
}

// ── Get past sessions ─────────────────────────────────────
export async function getSessions(cozyId, limit_ = 20) {
  try {
    const q    = query(
      collection(db, 'cozyCoachSessions'),
      where('cozyId', '==', cozyId),
      orderBy('createdAt', 'desc')
    );
    const snap = await getDocs(q);
    return snap.docs.slice(0, limit_).map(d => ({ id: d.id, ...d.data() }));
  } catch (_) { return []; }
}

// ── Weekly tip (motivational) ─────────────────────────────
export function getWeeklyTip(lang = 'en') {
  const tips_en = [
    '🌱 Small steps every day build a big future.',
    '💰 Save before you spend. Always.',
    '🏪 Know your customers. They are your business.',
    '📚 Learning never stops. Africa needs your skills.',
    '🤝 Help others grow. Your community is your strength.',
    '🎯 A goal without a plan is just a wish.',
    '🌍 Africa teaches AI. Your words have power.',
  ];
  const tips_sw = [
    '🌱 Hatua ndogo kila siku zinajenga mustakabali mkubwa.',
    '💰 Weka akiba kabla ya kutumia. Daima.',
    '🏪 Jua wateja wako. Wao ni biashara yako.',
    '📚 Kujifunza hakukomi. Afrika inahitaji ujuzi wako.',
    '🤝 Saidia wengine kukua. Jamii yako ni nguvu yako.',
    '🎯 Lengo bila mpango ni ndoto tu.',
    '🌍 Afrika inafundisha AI. Maneno yako yana nguvu.',
  ];
  const tips  = lang === 'sw' ? tips_sw : tips_en;
  const day   = new Date().getDay();
  return tips[day % tips.length];
}

window.CozyCoach = {
  saveGoal, getGoals, updateGoalProgress, achieveGoal,
  coachReply, saveSession, getSessions,
  getWeeklyTip, COACH_TOPICS
};

export default {
  saveGoal, getGoals, updateGoalProgress, achieveGoal,
  coachReply, saveSession, getSessions,
  getWeeklyTip, COACH_TOPICS
};
