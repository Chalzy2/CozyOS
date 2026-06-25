// ============================================================
//  cozy-contacts.js — Cozycabin Contacts & Mini CRM
// ============================================================

import {
  db, collection, doc, addDoc, getDoc, getDocs,
  updateDoc, deleteDoc, query, where, orderBy,
  serverTimestamp
} from './firebase.js';

export const CONTACT_CATEGORIES = [
  'Rentals','Electric Mobility','Solar Installer','CCTV Installer',
  'Electrician','Plumber','Delivery Rider','Graphic Designer',
  'Web Developer','Crafts & Creative','Local Business','Other Services'
];

export const CONTACT_STATUSES = {
  active:    { label: 'Active',    color: '#2E7D32' },
  inactive:  { label: 'Inactive',  color: '#64748b' },
  pending:   { label: 'Pending',   color: '#fbbf24' },
  suspended: { label: 'Suspended', color: '#ef4444' },
};

// ── Add contact ───────────────────────────────────────────
async function addContact(data) {
  const contact = {
    name:               data.name        || '',
    phone:              data.phone       || '',
    whatsapp:           data.whatsapp    || data.phone || '',
    email:              data.email       || '',
    category:           data.category    || '',
    service:            data.service     || '',
    location:           data.location    || '',
    county:             data.county      || '',
    description:        data.description || '',
    commissionAgreement:data.commissionAgreement || '',
    photo:              data.photo       || '',
    status:             data.status      || 'active',
    isFavorite:         false,
    isArchived:         false,
    addedBy:            data.addedBy     || '',
    cozyId:             data.cozyId      || '',   // if they signed up
    leadsCount:         0,
    dealsCount:         0,
    earningsGenerated:  0,
    createdAt:          serverTimestamp(),
    updatedAt:          serverTimestamp(),
  };
  const ref = await addDoc(collection(db, 'cozyContacts'), contact);
  return ref.id;
}

async function getContact(id) {
  const snap = await getDoc(doc(db, 'cozyContacts', id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

async function getContacts(filter = {}) {
  let q;
  try {
    if (filter.status) {
      q = query(collection(db, 'cozyContacts'), where('status', '==', filter.status), orderBy('createdAt', 'desc'));
    } else if (filter.category) {
      q = query(collection(db, 'cozyContacts'), where('category', '==', filter.category), orderBy('createdAt', 'desc'));
    } else {
      q = query(collection(db, 'cozyContacts'), orderBy('createdAt', 'desc'));
    }
  } catch (_) {
    q = collection(db, 'cozyContacts');
  }
  const snap = await getDocs(q);
  let contacts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (filter.search) {
    const s = filter.search.toLowerCase();
    contacts = contacts.filter(c =>
      (c.name||'').toLowerCase().includes(s) ||
      (c.phone||'').includes(s) ||
      (c.service||'').toLowerCase().includes(s) ||
      (c.location||'').toLowerCase().includes(s)
    );
  }
  return contacts;
}

async function updateContact(id, fields) {
  await updateDoc(doc(db, 'cozyContacts', id), { ...fields, updatedAt: serverTimestamp() });
}

async function deleteContact(id) {
  await deleteDoc(doc(db, 'cozyContacts', id));
}

async function archiveContact(id) {
  await updateContact(id, { isArchived: true, status: 'inactive' });
}

async function toggleFavorite(id, current) {
  await updateContact(id, { isFavorite: !current });
}

// ── Notes timeline ────────────────────────────────────────
async function addNote(contactId, note, addedBy) {
  await addDoc(collection(db, 'cozyContacts', contactId, 'notes'), {
    note, addedBy,
    createdAt: serverTimestamp()
  });
}

async function getNotes(contactId) {
  const q    = query(
    collection(db, 'cozyContacts', contactId, 'notes'),
    orderBy('createdAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

window.CozyContacts = { addContact, getContact, getContacts, updateContact, deleteContact, archiveContact, toggleFavorite, addNote, getNotes, CONTACT_CATEGORIES, CONTACT_STATUSES };
export { addContact, getContact, getContacts, updateContact, deleteContact, archiveContact, toggleFavorite, addNote, getNotes, CONTACT_CATEGORIES, CONTACT_STATUSES };
