// ============================================================
//  cozy-suppliers.js — OurCozy AI Supplier Search
//  On-demand matching: Customer need → Best supplier
//  Supplier protection built-in. Privacy respected.
// ============================================================

import {
  db, collection, addDoc, getDocs,
  query, where, orderBy, limit, serverTimestamp
} from './firebase.js';

// ── Keyword → Category map ────────────────────────────────
const CATEGORY_KEYWORDS = {
  'Perfumes & Cosmetics': ['perfume','cosmetic','beauty','fragrance','lotion','cream','makeup','vanilla','rose','oud'],
  'Fashion & Clothing':   ['fashion','cloth','shoes','wear','shirt','dress','trouser','jean','bag','accessories'],
  'Electronics & Phones': ['phone','electronic','laptop','computer','tablet','tv','speaker','cable','charger','earphone'],
  'Solar & Energy':       ['solar','panel','inverter','battery','energy','generator','power','electricity','umeme'],
  'Furniture & Decor':    ['furniture','sofa','bed','table','chair','decor','curtain','carpet','mattress'],
  'Agriculture & Farm':   ['farm','agriculture','seed','crop','maize','fertilizer','animal','poultry','fish','mkulima'],
  'Food & Beverages':     ['food','drink','juice','water','grain','rice','flour','sugar','salt','unga','mchele'],
  'Building Materials':   ['building','cement','iron','steel','tile','paint','wire','pipe','sand','gravel'],
  'Health & Medicine':    ['medicine','health','hospital','drug','supplement','vitamin','pharmacy','dawa'],
  'Automotive Parts':     ['car','vehicle','spare','tyre','oil','engine','battery','motor'],
};

// ── Detect supplier category from natural text ────────────
export function detectCategory(text) {
  const lower = text.toLowerCase();
  let best = { cat: '', score: 0 };
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    const score = keywords.filter(k => lower.includes(k)).length;
    if (score > best.score) best = { cat, score };
  }
  return best.cat;
}

// ── Detect county/location from text ─────────────────────
export function detectLocation(text) {
  const towns = ['kilifi','mombasa','nairobi','malindi','kisumu','nakuru',
                 'eldoret','lamu','kwale','machakos','thika','nyeri','meru'];
  const lower = text.toLowerCase();
  return towns.find(t => lower.includes(t)) || '';
}

// ── AI-powered supplier search ────────────────────────────
export async function searchSuppliers(naturalQuery) {
  const category = detectCategory(naturalQuery);
  const location  = detectLocation(naturalQuery);
  const lower     = naturalQuery.toLowerCase();

  let results = [];
  try {
    // Primary: search by detected category
    if (category) {
      const q = query(
        collection(db,'cozyWholesalers'),
        where('category','==',category),
        where('status','==','active'),
        where('visibility','==','public'),
        orderBy('trustScore','desc'),
        limit(20)
      );
      const snap = await getDocs(q);
      results = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }

    // Fallback: get all active public suppliers
    if (!results.length) {
      const snap = await getDocs(query(
        collection(db,'cozyWholesalers'),
        where('status','==','active'),
        where('visibility','==','public'),
        limit(30)
      ));
      results = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }

    // Filter by location if detected
    if (location) {
      const nearby = results.filter(r =>
        (r.county||'').toLowerCase().includes(location) ||
        (r.location||'').toLowerCase().includes(location) ||
        (r.deliveryAreas||[]).some(a => a.toLowerCase().includes(location))
      );
      if (nearby.length) results = nearby;
    }

    // Score & sort
    results = results
      .map(r => ({
        ...r,
        matchScore: _matchScore(r, lower, category, location)
      }))
      .sort((a,b) => b.matchScore - a.matchScore)
      .slice(0, 10);

  } catch(_) { results = []; }

  return {
    results,
    category,
    location,
    count: results.length,
    verified: results.filter(r => r.verificationStatus === 'verified').length,
  };
}

function _matchScore(supplier, query, category, location) {
  let score = supplier.trustScore || 50;
  if (supplier.verificationStatus === 'verified') score += 20;
  if (supplier.category === category) score += 15;
  const loc = (supplier.county||'').toLowerCase();
  if (location && loc.includes(location)) score += 10;
  const desc = (supplier.description||'').toLowerCase();
  const words = query.split(' ').filter(w => w.length > 3);
  score += words.filter(w => desc.includes(w)).length * 5;
  return score;
}

// ── Log supplier request (AI learns demand patterns) ──────
export async function logSupplierRequest(query, category, location, userCozyId) {
  try {
    await addDoc(collection(db,'cozySupplierRequests'), {
      query, category, location, userCozyId,
      timestamp: serverTimestamp()
    });
  } catch(_) {}
}

// ── Build AI reply for supplier search ───────────────────
export function buildAIReply(searchResult, lang = 'en') {
  const { results, category, location, count, verified } = searchResult;
  const sw = lang === 'sw';

  if (!count) {
    return sw
      ? `🤖 Samahani, sikupata wasambazaji wa ${category||'bidhaa hiyo'} ${location?'katika '+location:''}. Jaribu maneno mengine au tuma ombi lako.`
      : `🤖 No suppliers found for ${category||'that product'} ${location?'in '+location:''}. Try different keywords or post a request.`;
  }

  const lines = sw
    ? [`🤖 Nimepata wasambazaji ${count}!`,
       category ? `📦 Bidhaa: ${category}` : '',
       location ? `📍 Eneo: ${location}` : '',
       `✅ Waliothibitishwa: ${verified}`,
       `\nUnataka kuzungumza, kupiga simu au kulinganisha bei?`]
    : [`🤖 Found ${count} supplier${count>1?'s':''}!`,
       category ? `📦 Category: ${category}` : '',
       location ? `📍 Near: ${location}` : '',
       `✅ Verified: ${verified}`,
       `\nWould you like to Chat, Call or Compare prices?`];

  return lines.filter(Boolean).join('\n');
}

window.CozySupplierSearch = {
  searchSuppliers, detectCategory, detectLocation,
  logSupplierRequest, buildAIReply
};

export default { searchSuppliers, detectCategory, detectLocation, logSupplierRequest, buildAIReply };
