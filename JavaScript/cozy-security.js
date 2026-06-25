// ============================================================
//  cozy-security.js — OurCozy Security & Trust System
//  Trust is earned through actions. Privacy is respected.
// ============================================================

import { db, collection, doc, addDoc, getDoc,
  updateDoc, getDocs, query, where, orderBy,
  limit, serverTimestamp, increment } from './firebase.js';

// ── Trust score calculation ───────────────────────────────
export function calcTrustScore({
  phoneVerified = false, emailVerified = false,
  idVerified = false,    faceVerified = false,
  reviewCount = 0,       avgRating = 0,
  accountAge = 0,        flagCount = 0,
  dealsCount = 0,        inviteCount = 0,
}) {
  let score = 0;
  if (phoneVerified)  score += 20;
  if (emailVerified)  score += 15;
  if (idVerified)     score += 25;
  if (faceVerified)   score += 20;
  score += Math.min(10, reviewCount * 0.5);
  score += Math.min(5,  avgRating   * 1);
  score += Math.min(5,  Math.floor(accountAge / 30) * 0.5); // days
  score += Math.min(10, inviteCount * 0.4);
  score += Math.min(5,  dealsCount  * 0.2);
  score -= flagCount * 8;
  return Math.max(0, Math.min(100, Math.round(score)));
}

// ── Trust label ───────────────────────────────────────────
export function trustLabel(score) {
  if (score >= 85) return { label: 'Highly Trusted',  color: '#16a34a', icon: '🛡️' };
  if (score >= 65) return { label: 'Trusted',          color: '#2E7D32', icon: '✅' };
  if (score >= 40) return { label: 'Building Trust',   color: '#f59e0b', icon: '🔶' };
  if (score >= 20) return { label: 'New Member',       color: '#94a3b8', icon: '🆕' };
  return                  { label: 'Caution',          color: '#D32F2F', icon: '⚠️' };
}

// ── Risk detection ────────────────────────────────────────
export async function checkRisk(uid) {
  const flags = [];
  let riskLevel = 'low';

  try {
    // Multiple accounts same device/email pattern
    const snap = await getDoc(doc(db, 'cozyUsers', uid));
    if (!snap.exists()) return { riskLevel: 'unknown', flags: [], action: 'monitor' };
    const user = snap.data();

    // Flag: No phone verification
    if (!user.phoneVerified) flags.push({ code: 'no_phone', label: 'Phone not verified', severity: 'low' });

    // Flag: New account (< 7 days)
    const joined = user.joinedDate ? new Date(user.joinedDate) : new Date();
    const daysSince = (Date.now() - joined.getTime()) / 86400000;
    if (daysSince < 7) flags.push({ code: 'new_account', label: 'Account under 7 days old', severity: 'low' });

    // Flag: Many reports
    const reports = await getDocs(query(
      collection(db,'cozyReports'), where('reportedUid','==',uid)
    ));
    if (reports.size >= 3) flags.push({ code: 'reported', label: `${reports.size} reports received`, severity: 'high' });

    // Determine risk level
    const highFlags = flags.filter(f => f.severity === 'high').length;
    const medFlags  = flags.filter(f => f.severity === 'medium').length;
    if (highFlags >= 1 || medFlags >= 3) riskLevel = 'high';
    else if (medFlags >= 1 || flags.length >= 2) riskLevel = 'medium';

    const action = riskLevel === 'high' ? 'restrict' : riskLevel === 'medium' ? 'monitor' : 'allow';
    return { riskLevel, flags, action };
  } catch (_) {
    return { riskLevel: 'unknown', flags: [], action: 'allow' };
  }
}

// ── Report a user ─────────────────────────────────────────
export async function reportUser(reportedUid, reporterUid, reason, details = '') {
  await addDoc(collection(db, 'cozyReports'), {
    reportedUid, reporterUid, reason, details,
    status: 'pending',
    createdAt: serverTimestamp()
  });
}

// ── Report an item ────────────────────────────────────────
export async function reportItem(itemId, reporterUid, reason) {
  await addDoc(collection(db, 'cozyReports'), {
    itemId, reporterUid, reason, type: 'item',
    status: 'pending',
    createdAt: serverTimestamp()
  });
}

// ── Supplier protection ───────────────────────────────────
export function isSupplierQuery(text) {
  const patterns = [
    /who.*supplier|supplier.*number|where.*buy.*wholesale|give.*supplier/i,
    /supplier.*contact|source.*product|who.*supply|wholesale.*number/i,
    /nani.*anakuuzia|nunua wapi|supplier.*yako/i,
  ];
  return patterns.some(p => p.test(text));
}

export const SUPPLIER_RESPONSE = {
  en: `🔒 Supplier information is protected.\n\nAt OurCozy, we respect business relationships.\nWholesalers choose what to share:\n• Public listings\n• Business contacts only\n• Invite-only networks\n\nYou can connect with sellers directly via their listings.`,
  sw: `🔒 Taarifa za wasambazaji zinalindwa.\n\nKatika OurCozy, tunaheshimu mahusiano ya biashara.\nTunaweza kukuunganisha na wauza moja kwa moja kupitia orodha zao.`,
};

// ── Child age gate ────────────────────────────────────────
export const AGE_RULES = {
  child: {   // 0–12
    maxAge: 12,
    allowed:  ['learn','maths','kiswahili','english','arabic','science','stories','drawing'],
    blocked:  ['marketplace','rentals','wallet','affiliate','chat','mobility','services'],
    label: 'Kids Mode 🌟'
  },
  teen: {    // 13–17
    maxAge: 17,
    allowed:  ['learn','crafts','skills','browse'],
    restricted: ['marketplace','wallet','affiliate'],
    label: 'Teen Mode 🎓'
  },
  adult: {   // 18+
    maxAge: 999,
    allowed: ['all'],
    label: 'Full Access'
  }
};

export function getAgeGroup(age) {
  const n = Number(age);
  if (n <= 12)  return 'child';
  if (n <= 17)  return 'teen';
  return 'adult';
}

export function canAccess(age, feature) {
  const group = getAgeGroup(age);
  const rules = AGE_RULES[group];
  if (rules.allowed.includes('all')) return true;
  if (rules.blocked?.includes(feature)) return false;
  if (rules.restricted?.includes(feature)) return 'restricted';
  return rules.allowed.includes(feature) || true;
}

// ── Identity requirements per role ────────────────────────
export const IDENTITY_REQUIREMENTS = {
  basic:     ['phone'],
  seller:    ['phone', 'email'],
  affiliate: ['phone', 'email', 'id'],
  high_risk: ['phone', 'id', 'face'],
};

// ── Never expose rules (enforced in UI) ──────────────────
export const PRIVACY_RULES = {
  neverShowPublicly:  ['idNumber', 'password', 'faceData', 'privateChats', 'supplierPhone', 'wholesalePrices', 'customerLists'],
  neverStore:         ['passwords', 'rawIds'],
  neverSell:          ['userData', 'contactLists', 'behaviorData'],
};

// ── Community builder tracking ────────────────────────────
export async function recordInvite(inviterCozyId, invitedUid, category) {
  await addDoc(collection(db, 'cozyCommunityInvites'), {
    inviterCozyId, invitedUid, category,
    confirmed: false,
    createdAt: serverTimestamp()
  });
}

export async function getCommunityBuilderStats(cozyId) {
  try {
    const snap = await getDocs(query(
      collection(db,'cozyCommunityInvites'), where('inviterCozyId','==',cozyId)
    ));
    const total   = snap.size;
    const active  = snap.docs.filter(d=>d.data().confirmed).length;
    const trust   = total > 0 ? Math.round((active/total)*100) : 0;
    // Estimated commission (KES 500 per active invite)
    const commission = active * 500;
    return { total, active, trust, commission };
  } catch (_) {
    return { total: 0, active: 0, trust: 0, commission: 0 };
  }
}

window.CozySecurity = {
  calcTrustScore, trustLabel, checkRisk,
  reportUser, reportItem,
  isSupplierQuery, SUPPLIER_RESPONSE,
  AGE_RULES, getAgeGroup, canAccess,
  IDENTITY_REQUIREMENTS, PRIVACY_RULES,
  recordInvite, getCommunityBuilderStats
};

export default { calcTrustScore, trustLabel, checkRisk, reportUser, reportItem, isSupplierQuery, SUPPLIER_RESPONSE, AGE_RULES, getAgeGroup, canAccess, IDENTITY_REQUIREMENTS, PRIVACY_RULES, recordInvite, getCommunityBuilderStats };
