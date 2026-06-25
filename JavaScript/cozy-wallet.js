// ============================================================
//  cozy-wallet.js — Cozycabin Wallet & Earnings System
// ============================================================

import {
  db, collection, doc, addDoc, getDoc, getDocs,
  updateDoc, query, where, orderBy, serverTimestamp, increment
} from './firebase.js';

// ── Earning types ─────────────────────────────────────────
export const EARNING_TYPES = {
  affiliate:  { label: 'Affiliate Commission', icon: '💰', color: '#ffd700' },
  rental:     { label: 'Rental Commission',    icon: '🏠', color: '#EF6C00' },
  service:    { label: 'Service Commission',   icon: '🔧', color: '#a78bfa' },
  mobility:   { label: 'Mobility Commission',  icon: '⚡', color: '#4ade80' },
  craft:      { label: 'Craft Sale',           icon: '🎨', color: '#2E7D32' },
  digital:    { label: 'Digital Sale',         icon: '💻', color: '#38bdf8' },
  referral:   { label: 'Referral Bonus',       icon: '🎁', color: '#2E7D32' },
};

// ── Add earning transaction ───────────────────────────────
async function addEarning(cozyId, uid, type, amount, description, meta = {}) {
  const txn = {
    cozyId, uid, type, amount,
    description,
    status:    'pending', // pending | confirmed | paid
    createdAt: serverTimestamp(),
    ...meta
  };
  const ref = await addDoc(collection(db, 'cozyWallet'), txn);

  // Increment wallet totals
  const walletRef = doc(db, 'cozyWalletTotals', cozyId);
  const snap      = await getDoc(walletRef);
  if (snap.exists()) {
    await updateDoc(walletRef, {
      pending:  increment(amount),
      lifetime: increment(amount),
      updatedAt: serverTimestamp(),
    });
  } else {
    await doc(db, 'cozyWalletTotals', cozyId);
    await updateDoc(walletRef, {}).catch(async () => {
      const { setDoc } = await import('./firebase.js');
      await setDoc(walletRef, {
        cozyId, uid,
        balance:  0, pending: amount,
        lifetime: amount, withdrawn: 0,
        updatedAt: serverTimestamp()
      });
    });
  }
  return ref.id;
}

// ── Get wallet totals ─────────────────────────────────────
async function getWalletTotals(cozyId) {
  const snap = await getDoc(doc(db, 'cozyWalletTotals', cozyId));
  if (snap.exists()) return snap.data();
  return { balance: 0, pending: 0, lifetime: 0, withdrawn: 0 };
}

// ── Get transactions ──────────────────────────────────────
async function getTransactions(cozyId, limitCount = 50) {
  const q    = query(
    collection(db, 'cozyWallet'),
    where('cozyId', '==', cozyId),
    orderBy('createdAt', 'desc'),
    ...(limitCount ? [{ _limit: limitCount }] : [])
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ── Request withdrawal ────────────────────────────────────
async function requestWithdrawal(cozyId, uid, amount, mpesaPhone, name) {
  const totals = await getWalletTotals(cozyId);
  if ((totals.balance || 0) < amount) throw new Error('Insufficient confirmed balance.');
  await addDoc(collection(db, 'cozyWithdrawals'), {
    cozyId, uid, amount, mpesaPhone, name,
    status:    'pending',
    createdAt: serverTimestamp(),
  });
  await updateDoc(doc(db, 'cozyWalletTotals', cozyId), {
    balance:   increment(-amount),
    withdrawn: increment(amount),
    updatedAt: serverTimestamp(),
  });
}

// ── Confirm earning (admin) ───────────────────────────────
async function confirmEarning(txnId, cozyId, amount) {
  await updateDoc(doc(db, 'cozyWallet', txnId), { status: 'confirmed', confirmedAt: serverTimestamp() });
  await updateDoc(doc(db, 'cozyWalletTotals', cozyId), {
    pending:   increment(-amount),
    balance:   increment(amount),
    updatedAt: serverTimestamp(),
  });
}

window.CozyWallet = { addEarning, getWalletTotals, getTransactions, requestWithdrawal, confirmEarning, EARNING_TYPES };
export { addEarning, getWalletTotals, getTransactions, requestWithdrawal, confirmEarning, EARNING_TYPES };
