// ============================================================
//  cozy-chat.js — Cozycabin Chat System
// ============================================================

import {
  db, collection, doc, addDoc, getDocs, getDoc,
  updateDoc, query, where, orderBy, onSnapshot,
  serverTimestamp
} from './firebase.js';

// ── Create or get conversation ────────────────────────────
function convId(uidA, uidB) {
  return [uidA, uidB].sort().join('_');
}

async function getOrCreateConversation(myUid, myCozyId, myName, otherUid, otherCozyId, otherName) {
  const id  = convId(myUid, otherUid);
  const ref = doc(db, 'cozyChats', id);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await updateDoc(ref, {}).catch(async () => {
      const { setDoc } = await import('./firebase.js');
      await setDoc(ref, {
        participants:   [myUid, otherUid],
        cozyIds:        [myCozyId, otherCozyId],
        names:          { [myUid]: myName, [otherUid]: otherName },
        lastMessage:    '',
        lastAt:         serverTimestamp(),
        unread:         { [myUid]: 0, [otherUid]: 0 },
        createdAt:      serverTimestamp(),
      });
    });
  }
  return id;
}

// ── Send message ──────────────────────────────────────────
async function sendMessage(convId, senderUid, text, imageUrl = '') {
  await addDoc(collection(db, 'cozyChats', convId, 'messages'), {
    senderUid, text: text.trim(), imageUrl,
    read:      false,
    createdAt: serverTimestamp(),
  });
  await updateDoc(doc(db, 'cozyChats', convId), {
    lastMessage: text.trim() || '📷 Image',
    lastAt:      serverTimestamp(),
  });
}

// ── Listen to messages (real-time) ────────────────────────
function listenMessages(convId, callback) {
  const q = query(
    collection(db, 'cozyChats', convId, 'messages'),
    orderBy('createdAt', 'asc')
  );
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

// ── Get all conversations for a user ─────────────────────
function listenConversations(uid, callback) {
  const q = query(
    collection(db, 'cozyChats'),
    where('participants', 'array-contains', uid)
  );
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

// ── Mark messages as read ─────────────────────────────────
async function markRead(convId, uid) {
  await updateDoc(doc(db, 'cozyChats', convId), {
    [`unread.${uid}`]: 0
  });
}

window.CozyChat = { getOrCreateConversation, sendMessage, listenMessages, listenConversations, markRead, convId };
export { getOrCreateConversation, sendMessage, listenMessages, listenConversations, markRead, convId };
