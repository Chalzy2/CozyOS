// ============================================================
//  cozy-language.js — OurCozy African Language Memory
//  Africa teaches AI. AI helps Africa grow.
// ============================================================

import { db, collection, doc, addDoc, getDocs, getDoc,
  updateDoc, query, where, orderBy, limit,
  serverTimestamp } from './firebase.js';

// ── Supported languages ───────────────────────────────────
export const LANGUAGES = {
  sw:  { name: 'Kiswahili', flag: '🇰🇪', region: 'East Africa' },
  en:  { name: 'English',   flag: '🇬🇧', region: 'Global'      },
  luo: { name: 'Luo',       flag: '🇰🇪', region: 'Nyanza'      },
  kik: { name: 'Kikuyu',    flag: '🇰🇪', region: 'Central'     },
  kam: { name: 'Kamba',     flag: '🇰🇪', region: 'Eastern'     },
  kal: { name: 'Kalenjin',  flag: '🇰🇪', region: 'Rift Valley' },
  ar:  { name: 'Arabic',    flag: '🇸🇦', region: 'Global'      },
  other:{ name: 'Other',    flag: '🌍', region: 'Africa'       },
};

// ── Badge thresholds ──────────────────────────────────────
export const TEACHER_BADGES = [
  { id: 'helper',   min: 1,   icon: '🥉', label: 'Language Helper'         },
  { id: 'teacher',  min: 10,  icon: '🥈', label: 'Community Teacher'       },
  { id: 'trainer',  min: 50,  icon: '🥇', label: 'Cozy AI Trainer'         },
  { id: 'champion', min: 100, icon: '🏆', label: 'African Language Champion'},
];

// ── Add / upvote a word ───────────────────────────────────
export async function addWord({ word, meaning, language, category, region, suggestedBy }) {
  if (!word || !meaning || !suggestedBy) throw new Error('word, meaning and suggestedBy required');
  const key = word.toLowerCase().trim();

  const existing = await getDocs(query(
    collection(db, 'cozyLanguage'), where('word', '==', key)
  ));

  if (!existing.empty) {
    const ref  = existing.docs[0].ref;
    const data = existing.docs[0].data();
    const votes = (data.votes || 1) + 1;
    const confirmedBy = [...new Set([...(data.confirmedBy || []), suggestedBy])];
    const confidence  = Math.min(99, Math.round((votes / Math.max(votes, 10)) * 100));
    await updateDoc(ref, { votes, confirmedBy, confidence, updatedAt: serverTimestamp() });
    // Reward if threshold crossed
    const reward = confidence >= 75 ? 0.01 : 0;
    if (reward) await _rewardUser(suggestedBy, reward, key);
    return { action: 'upvoted', confidence, reward };
  }

  // New word
  await addDoc(collection(db, 'cozyLanguage'), {
    word: key, meaning: meaning.trim(),
    language: language || 'sw',
    category: category || 'general',
    region:   region   || '',
    suggestedBy, confirmedBy: [suggestedBy],
    votes: 1, confidence: 50, verified: false,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp()
  });
  return { action: 'added', confidence: 50, reward: 0 };
}

// ── Look up a word ────────────────────────────────────────
export async function lookupWord(word) {
  const key  = word.toLowerCase().trim();
  const snap = await getDocs(query(
    collection(db, 'cozyLanguage'), where('word', '==', key)
  ));
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() };
}

// ── Search words ──────────────────────────────────────────
export async function searchWords(q, lang = '') {
  let snap;
  try {
    snap = lang
      ? await getDocs(query(collection(db,'cozyLanguage'), where('language','==',lang), orderBy('confidence','desc'), limit(30)))
      : await getDocs(query(collection(db,'cozyLanguage'), orderBy('confidence','desc'), limit(50)));
  } catch (_) {
    snap = await getDocs(collection(db, 'cozyLanguage'));
  }
  const lower = q.toLowerCase();
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(w => w.word.includes(lower) || (w.meaning||'').toLowerCase().includes(lower));
}

// ── Get words that need teaching (AI unknown) ─────────────
export async function getUnknownWords(limit_ = 5) {
  try {
    const snap = await getDocs(query(
      collection(db,'cozyLanguage'),
      where('verified','==',false),
      where('confidence','<',75),
      orderBy('confidence','asc'),
      limit(limit_)
    ));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (_) { return []; }
}

// ── Get teacher leaderboard ───────────────────────────────
export async function getTeacherStats(uid) {
  const snap = await getDocs(query(
    collection(db,'cozyLanguage'),
    where('suggestedBy','==',uid)
  ));
  const count = snap.size;
  const badge = [...TEACHER_BADGES].reverse().find(b => count >= b.min) || null;
  return { count, badge };
}

// ── Reward user for teaching ──────────────────────────────
async function _rewardUser(uid, points, word) {
  try {
    await addDoc(collection(db,'cozyTeacherRewards'), {
      uid, points, word,
      reason: 'language_teach',
      createdAt: serverTimestamp()
    });
  } catch (_) {}
}

// ── Seed common words (call once) ────────────────────────
export const SEED_WORDS = [
  { word:'habari',    meaning:'News / How are you',    language:'sw',  category:'greeting',  region:'Kenya',   confidence:99, verified:true },
  { word:'nyumba',    meaning:'House / Home',           language:'sw',  category:'property',  region:'Kenya',   confidence:99, verified:true },
  { word:'pesa',      meaning:'Money',                  language:'sw',  category:'finance',   region:'Kenya',   confidence:99, verified:true },
  { word:'kazi',      meaning:'Work / Job',             language:'sw',  category:'work',      region:'Kenya',   confidence:99, verified:true },
  { word:'fundi',     meaning:'Skilled technician / artisan', language:'sw', category:'service', region:'Kenya', confidence:99, verified:true },
  { word:'bidhaa',    meaning:'Products / Goods',       language:'sw',  category:'market',    region:'Kenya',   confidence:99, verified:true },
  { word:'natafuta',  meaning:'I am looking for',       language:'sw',  category:'search',    region:'Kenya',   confidence:99, verified:true },
  { word:'ninahitaji',meaning:'I need',                 language:'sw',  category:'need',      region:'Kenya',   confidence:99, verified:true },
  { word:'nauza',     meaning:'I am selling',           language:'sw',  category:'commerce',  region:'Kenya',   confidence:99, verified:true },
  { word:'mukate',    meaning:'Bread',                  language:'sw',  category:'food',      region:'Kilifi',  confidence:98, verified:true },
  { word:'dhiang',    meaning:'Cow',                    language:'luo', category:'animal',    region:'Nyanza',  confidence:92, verified:true },
  { word:'ninjega mnomno', meaning:'I am very fine',   language:'kik', category:'greeting',  region:'Central', confidence:90, verified:true },
  { word:'sawa',      meaning:'OK / Alright / Fine',    language:'sw',  category:'general',   region:'Kenya',   confidence:99, verified:true },
  { word:'asante',    meaning:'Thank you',              language:'sw',  category:'greeting',  region:'Kenya',   confidence:99, verified:true },
  { word:'karibu',    meaning:'Welcome / Come in',      language:'sw',  category:'greeting',  region:'Kenya',   confidence:99, verified:true },
  { word:'mambo',     meaning:'Things / Whats up (slang)', language:'sw', category:'greeting', region:'Kenya',  confidence:97, verified:true },
  { word:'shamba',    meaning:'Farm / Garden',          language:'sw',  category:'agriculture',region:'Kenya',  confidence:99, verified:true },
  { word:'mkulima',   meaning:'Farmer',                 language:'sw',  category:'agriculture',region:'Kenya',  confidence:99, verified:true },
  { word:'baiskeli',  meaning:'Bicycle',                language:'sw',  category:'mobility',  region:'Kenya',   confidence:99, verified:true },
  { word:'umeme',     meaning:'Electricity',            language:'sw',  category:'energy',    region:'Kenya',   confidence:99, verified:true },
];

window.CozyLanguage = { addWord, lookupWord, searchWords, getUnknownWords, getTeacherStats, LANGUAGES, TEACHER_BADGES, SEED_WORDS };
