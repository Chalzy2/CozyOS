// ============================================================
//  cozy-vault.js — Cozy Vault · Your Digital Home
//  Store: photos, documents, goals, ideas, AI notes, learning
//  Privacy: Users own their data. AI remembers with permission.
//  Africa teaches AI. AI helps Africa grow.
// ============================================================

import {
  db, collection, doc, addDoc, getDoc, getDocs,
  updateDoc, deleteDoc, query, where, orderBy,
  limit, serverTimestamp
} from './firebase.js';

// ── Vault item types ──────────────────────────────────────
export const VAULT_TYPES = {
  photo:      { label: 'Photo',          icon: '📷', color: '#1B5E20', bg: '#E8F5E9' },
  document:   { label: 'Document',       icon: '📄', color: '#1565C0', bg: '#E3F2FD' },
  goal:       { label: 'Goal',           icon: '🎯', color: '#F9A825', bg: '#FFF8E1' },
  idea:       { label: 'Idea',           icon: '💡', color: '#EF6C00', bg: '#FBE9E7' },
  ai_note:    { label: 'AI Note',        icon: '🤖', color: '#00A86B', bg: '#E0F7EF' },
  voice:      { label: 'Voice Note',     icon: '🎙️', color: '#6A1B9A', bg: '#F3E5F5' },
  lesson:     { label: 'Lesson',         icon: '📚', color: '#1565C0', bg: '#E3F2FD' },
  memory:     { label: 'Memory',         icon: '🌟', color: '#F9A825', bg: '#FFF8E1' },
  business:   { label: 'Business Note',  icon: '🏪', color: '#2E7D32', bg: '#E8F5E9' },
  contact:    { label: 'Saved Contact',  icon: '👤', color: '#1B5E20', bg: '#E8F5E9' },
};

// ── Default vault item ────────────────────────────────────
function blankVaultItem(cozyId, uid) {
  return {
    cozyId, uid,
    type:        'idea',
    title:       '',
    content:     '',
    tags:        [],
    isPrivate:   true,
    aiGenerated: false,
    language:    'en',
    mediaUrl:    '',
    relatedId:   '',
    pinned:      false,
    archived:    false,
    createdAt:   serverTimestamp(),
    updatedAt:   serverTimestamp(),
  };
}

// ── Save item to vault ────────────────────────────────────
export async function saveToVault(cozyId, uid, data) {
  const item = {
    ...blankVaultItem(cozyId, uid),
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  const ref = await addDoc(collection(db, 'cozyVault'), item);
  return ref.id;
}

// ── Get all vault items ───────────────────────────────────
export async function getVaultItems(cozyId, type = '') {
  try {
    let q;
    if (type) {
      q = query(
        collection(db, 'cozyVault'),
        where('cozyId', '==', cozyId),
        where('type', '==', type),
        where('archived', '==', false),
        orderBy('createdAt', 'desc'),
        limit(100)
      );
    } else {
      q = query(
        collection(db, 'cozyVault'),
        where('cozyId', '==', cozyId),
        where('archived', '==', false),
        orderBy('createdAt', 'desc'),
        limit(100)
      );
    }
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (_) {
    const snap = await getDocs(
      query(collection(db, 'cozyVault'), where('cozyId', '==', cozyId))
    );
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(i => !i.archived && (!type || i.type === type));
  }
}

// ── Get pinned items ──────────────────────────────────────
export async function getPinnedItems(cozyId) {
  const all = await getVaultItems(cozyId);
  return all.filter(i => i.pinned);
}

// ── Update vault item ─────────────────────────────────────
export async function updateVaultItem(id, fields) {
  await updateDoc(doc(db, 'cozyVault', id), {
    ...fields,
    updatedAt: serverTimestamp()
  });
}

// ── Delete (archive) vault item ───────────────────────────
export async function archiveVaultItem(id) {
  await updateDoc(doc(db, 'cozyVault', id), {
    archived: true,
    updatedAt: serverTimestamp()
  });
}

// ── Pin / unpin ───────────────────────────────────────────
export async function togglePin(id, current) {
  await updateDoc(doc(db, 'cozyVault', id), {
    pinned: !current,
    updatedAt: serverTimestamp()
  });
}

// ── Search vault ──────────────────────────────────────────
export async function searchVault(cozyId, searchText) {
  const all = await getVaultItems(cozyId);
  const s   = searchText.toLowerCase();
  return all.filter(i =>
    (i.title   || '').toLowerCase().includes(s) ||
    (i.content || '').toLowerCase().includes(s) ||
    (i.tags    || []).some(t => t.toLowerCase().includes(s))
  );
}

// ── Save AI note to vault (with permission) ───────────────
export async function saveAINote(cozyId, uid, content, language = 'en', hasPermission = false) {
  if (!hasPermission) {
    return { saved: false, reason: 'AI notes require user permission.' };
  }
  const id = await saveToVault(cozyId, uid, {
    type:        'ai_note',
    title:       'Cozy AI Note — ' + new Date().toLocaleDateString('en-GB'),
    content,
    language,
    aiGenerated: true,
    isPrivate:   true,
  });
  return { saved: true, id };
}

// ── Get vault summary (counts by type) ───────────────────
export async function getVaultSummary(cozyId) {
  const all    = await getVaultItems(cozyId);
  const summary = { total: all.length };
  for (const type of Object.keys(VAULT_TYPES)) {
    summary[type] = all.filter(i => i.type === type).length;
  }
  return summary;
}

// ── Format date helper ────────────────────────────────────
export function formatVaultDate(ts) {
  if (!ts?.seconds) return '—';
  return new Date(ts.seconds * 1000).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric'
  });
}

window.CozyVault = {
  saveToVault, getVaultItems, getPinnedItems,
  updateVaultItem, archiveVaultItem, togglePin,
  searchVault, saveAINote, getVaultSummary,
  formatVaultDate, VAULT_TYPES
};

export default {
  saveToVault, getVaultItems, getPinnedItems,
  updateVaultItem, archiveVaultItem, togglePin,
  searchVault, saveAINote, getVaultSummary,
  formatVaultDate, VAULT_TYPES
};
