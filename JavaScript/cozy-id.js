// ============================================================
//  cozy-id.js — Cozycabin Universal Identity System
//  Handles: signup, login, CozyID generation, roles, profile
// ============================================================

import {
  auth, db, ADMIN_EMAILS,
  GoogleAuthProvider, signInWithPopup,
  signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendPasswordResetEmail, signOut, onAuthStateChanged,
  collection, doc, setDoc, getDoc, getDocs,
  updateDoc, query, where, serverTimestamp
} from './firebase.js';

// ── Generate unique CZ-XXXXX ID ──────────────────────────
function genCozyId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = 'CZ-';
  for (let i = 0; i < 5; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

async function uniqueCozyId() {
  let id, exists = true;
  while (exists) {
    id = genCozyId();
    const snap = await getDocs(query(collection(db, 'cozyUsers'), where('cozyId', '==', id)));
    exists = !snap.empty;
  }
  return id;
}

// ── Default user structure ────────────────────────────────
function defaultProfile(uid, email, cozyId, extra = {}) {
  return {
    uid,
    cozyId,
    name:          extra.name  || '',
    phone:         extra.phone || '',
    email:         email || '',
    photo:         extra.photo || '',
    location:      '',
    county:        '',
    joinedDate:    new Date().toISOString(),
    roles:         ['customer'],
    verified:      ADMIN_EMAILS.includes(email),
    isAdmin:       ADMIN_EMAILS.includes(email),
    createdAt:     serverTimestamp(),
    updatedAt:     serverTimestamp(),
  };
}

// ── Create or fetch Cozy profile ─────────────────────────
async function ensureProfile(user) {
  const ref  = doc(db, 'cozyUsers', user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return snap.data();

  const cozyId  = await uniqueCozyId();
  const profile = defaultProfile(user.uid, user.email, cozyId, {
    name:  user.displayName || '',
    photo: user.photoURL    || '',
  });
  await setDoc(ref, profile);
  return profile;
}

// ── Get current user profile ──────────────────────────────
async function getProfile(uid) {
  const snap = await getDoc(doc(db, 'cozyUsers', uid));
  return snap.exists() ? snap.data() : null;
}

// ── Update profile fields ─────────────────────────────────
async function updateProfile(uid, fields) {
  await updateDoc(doc(db, 'cozyUsers', uid), {
    ...fields,
    updatedAt: serverTimestamp()
  });
}

// ── Add role to user ──────────────────────────────────────
async function addRole(uid, role) {
  const profile = await getProfile(uid);
  if (!profile) return;
  const roles = profile.roles || [];
  if (roles.includes(role)) return;
  await updateDoc(doc(db, 'cozyUsers', uid), {
    roles:     [...roles, role],
    updatedAt: serverTimestamp()
  });
}

// ── Email + Password signup ───────────────────────────────
async function signUpEmail(name, email, phone, password) {
  const existing = await getDocs(query(collection(db, 'cozyUsers'), where('phone', '==', phone)));
  if (!existing.empty) throw new Error('Phone number already registered.');

  const cred    = await createUserWithEmailAndPassword(auth, email, password);
  const cozyId  = await uniqueCozyId();
  const profile = defaultProfile(cred.user.uid, email, cozyId, { name, phone });
  await setDoc(doc(db, 'cozyUsers', cred.user.uid), profile);
  return { user: cred.user, profile };
}

// ── Email login ───────────────────────────────────────────
async function loginEmail(email, password) {
  const cred    = await signInWithEmailAndPassword(auth, email, password);
  const profile = await ensureProfile(cred.user);
  return { user: cred.user, profile };
}

// ── Google sign in ────────────────────────────────────────
async function loginGoogle() {
  const provider = new GoogleAuthProvider();
  const cred     = await signInWithPopup(auth, provider);
  const profile  = await ensureProfile(cred.user);
  return { user: cred.user, profile };
}

// ── Password reset ────────────────────────────────────────
async function resetPassword(email) {
  await sendPasswordResetEmail(auth, email);
}

// ── Sign out ──────────────────────────────────────────────
async function logout() {
  await signOut(auth);
}

// ── Role label map ────────────────────────────────────────
const ROLE_LABELS = {
  customer:          { label: 'Customer',          icon: '🛒', color: '#1565C0' },
  affiliate:         { label: 'Affiliate',          icon: '💰', color: '#ffd700' },
  seller:            { label: 'Seller',             icon: '🏪', color: '#2E7D32' },
  landlord:          { label: 'Landlord',           icon: '🏠', color: '#EF6C00' },
  service_provider:  { label: 'Service Provider',   icon: '🔧', color: '#a78bfa' },
  craft_creator:     { label: 'Craft Creator',      icon: '🎨', color: '#2E7D32' },
  mobility_partner:  { label: 'Mobility Partner',   icon: '⚡', color: '#4ade80' },
  digital_creator:   { label: 'Digital Creator',    icon: '💻', color: '#38bdf8' },
};

// ── Expose globally ───────────────────────────────────────
window.CozyID = {
  auth, db,
  signUpEmail, loginEmail, loginGoogle,
  resetPassword, logout,
  ensureProfile, getProfile, updateProfile,
  addRole, genCozyId, uniqueCozyId,
  ROLE_LABELS,
  onAuthStateChanged,
};

export {
  signUpEmail, loginEmail, loginGoogle, resetPassword, logout,
  ensureProfile, getProfile, updateProfile, addRole,
  ROLE_LABELS, genCozyId, uniqueCozyId,
};
