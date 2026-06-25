// ============================================================
//  cozy-leads.js — Cozycabin Leads System
// ============================================================

import {
  db, collection, doc, addDoc, getDocs, getDoc,
  updateDoc, deleteDoc, query, where, orderBy,
  serverTimestamp
} from './firebase.js';

export const LEAD_STATUSES = {
  new:         { label: 'New',         color: '#1565C0', icon: '🆕' },
  contacted:   { label: 'Contacted',   color: '#fbbf24', icon: '📞' },
  negotiating: { label: 'Negotiating', color: '#EF6C00', icon: '🤝' },
  closed:      { label: 'Closed',      color: '#2E7D32', icon: '✅' },
  cancelled:   { label: 'Cancelled',   color: '#ef4444', icon: '❌' },
};

async function addLead(data) {
  const lead = {
    customerName:    data.customerName || '',
    customerPhone:   data.customerPhone || '',
    interestedIn:    data.interestedIn || '',
    connectedTo:     data.connectedTo || '',   // CozyID of contact
    connectedName:   data.connectedName || '',
    status:          'new',
    commissionAmount: Number(data.commissionAmount) || 0,
    notes:           data.notes || '',
    addedBy:         data.addedBy || '',       // admin CozyID
    createdAt:       serverTimestamp(),
    updatedAt:       serverTimestamp(),
  };
  const ref = await addDoc(collection(db, 'cozyLeads'), lead);
  return ref.id;
}

async function updateLead(id, fields) {
  await updateDoc(doc(db, 'cozyLeads', id), { ...fields, updatedAt: serverTimestamp() });
}

async function deleteLead(id) {
  await deleteDoc(doc(db, 'cozyLeads', id));
}

async function getLeads(filterStatus = '') {
  let q;
  try {
    q = filterStatus
      ? query(collection(db, 'cozyLeads'), where('status', '==', filterStatus), orderBy('createdAt', 'desc'))
      : query(collection(db, 'cozyLeads'), orderBy('createdAt', 'desc'));
  } catch (_) {
    q = collection(db, 'cozyLeads');
  }
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function getLeadsForContact(connectedTo) {
  const q    = query(collection(db, 'cozyLeads'), where('connectedTo', '==', connectedTo));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

window.CozyLeads = { addLead, updateLead, deleteLead, getLeads, getLeadsForContact, LEAD_STATUSES };
export { addLead, updateLead, deleteLead, getLeads, getLeadsForContact, LEAD_STATUSES };
