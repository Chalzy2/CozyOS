// ============================================================
//  cozy-kids.js — OurCozy Child Safety System
//  Children are protected. Always. No exceptions.
// ============================================================

import { db, doc, getDoc, updateDoc, serverTimestamp } from './firebase.js';
import { getAgeGroup, AGE_RULES, canAccess } from './cozy-security.js';

// ── Set user age (stored encrypted-safe — only age group) ─
export async function setUserAge(uid, age) {
  const group = getAgeGroup(age);
  await updateDoc(doc(db,'cozyUsers',uid), {
    ageGroup: group,
    ageSet:   true,
    updatedAt: serverTimestamp()
  });
  return group;
}

// ── Get age group for current user ───────────────────────
export async function getUserAgeGroup(uid) {
  const snap = await getDoc(doc(db,'cozyUsers',uid));
  if (!snap.exists()) return 'adult';
  return snap.data().ageGroup || 'adult';
}

// ── Page-level access guard ───────────────────────────────
// Call on every page load for any user with ageGroup set
export function enforceAgeGate(ageGroup, pageName) {
  const rules = AGE_RULES[ageGroup];
  if (!rules) return true; // unknown group = allow

  const BLOCKED_PAGES = {
    child: ['wallet','rentals','affiliate','services','mobility','contacts','chat','dashboard','index','main'],
    teen:  ['wallet','affiliate'],
  };

  const blocked = BLOCKED_PAGES[ageGroup] || [];
  const page    = pageName.replace('.html','').toLowerCase();
  if (blocked.some(b => page.includes(b))) {
    location.href = 'kids.html';
    return false;
  }
  return true;
}

// ── Kids content categories ───────────────────────────────
export const KIDS_SUBJECTS = [
  { id:'maths',    icon:'📐', label:'Maths',      color:'#1565C0', bg:'#E8F5E9', ages:[6,17] },
  { id:'english',  icon:'🇬🇧', label:'English',    color:'#1B5E20', bg:'#F5F5F5', ages:[4,17] },
  { id:'kiswahili',icon:'🇰🇪', label:'Kiswahili',  color:'#16a34a', bg:'#E8F5E9', ages:[4,17] },
  { id:'arabic',   icon:'🇸🇦', label:'Arabic',     color:'#d97706', bg:'#fffbeb', ages:[4,17] },
  { id:'science',  icon:'🔬', label:'Science',    color:'#1565C0', bg:'#E8F5E9', ages:[7,17] },
  { id:'coding',   icon:'💻', label:'Coding',     color:'#1B5E20', bg:'#E8F5E9', ages:[9,17] },
  { id:'stories',  icon:'📖', label:'Stories',    color:'#2E7D32', bg:'#F5F5F5', ages:[3,12] },
  { id:'drawing',  icon:'🎨', label:'Drawing',    color:'#2E7D32', bg:'#F5F5F5', ages:[3,17] },
  { id:'music',    icon:'🎵', label:'Music',      color:'#0ea5e9', bg:'#E8F5E9', ages:[3,17] },
  { id:'animals',  icon:'🦁', label:'Animals',    color:'#F9A825', bg:'#FFF8E1', ages:[3,10] },
  { id:'farming',  icon:'🌱', label:'Farming',    color:'#1B5E20', bg:'#E8F5E9', ages:[8,17] },
  { id:'crafts',   icon:'✂️', label:'Crafts',     color:'#1B5E20', bg:'#F5F5F5', ages:[6,17] },
];

// ── Safe AI tutor response for kids ──────────────────────
export function safeKidsResponse(text, ageGroup) {
  // Strip any financial, adult, or marketplace content
  const unsafe = /wallet|money|sell|buy|rent|affiliate|commission|pesa|uza|nunua|nyumba/i;
  if (unsafe.test(text)) {
    return ageGroup === 'child'
      ? "Let's focus on learning! 📚 Ask me about Maths, Science, English or Kiswahili!"
      : "That topic is available when you're older. Let's keep learning! 🎓";
  }
  return text;
}

// ── Parent PIN system ─────────────────────────────────────
export async function setParentPin(uid, pin) {
  // Store hashed (simple hash for demo — in production use bcrypt server-side)
  const hashed = btoa(pin + uid).slice(0, 16);
  await updateDoc(doc(db,'cozyUsers',uid), {
    parentPin: hashed, updatedAt: serverTimestamp()
  });
}

export async function verifyParentPin(uid, pin) {
  const snap = await getDoc(doc(db,'cozyUsers',uid));
  if (!snap.exists()) return false;
  const stored = snap.data().parentPin;
  const check  = btoa(pin + uid).slice(0, 16);
  return stored === check;
}

window.CozyKids = {
  setUserAge, getUserAgeGroup, enforceAgeGate,
  KIDS_SUBJECTS, safeKidsResponse,
  setParentPin, verifyParentPin,
  getAgeGroup, canAccess
};
