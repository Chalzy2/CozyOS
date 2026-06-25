// ============================================================
//  cozy-items.js — Universal Cozy Items System
//  One collection, every item type
// ============================================================

import {
  db, collection, doc, addDoc, getDoc, getDocs,
  updateDoc, deleteDoc, query, where, orderBy,
  limit, serverTimestamp
} from './firebase.js';

// ── Item types ────────────────────────────────────────────
export const ITEM_TYPES = {
  product:  { label: 'Product',          icon: '📦', color: '#ffd700'  },
  rental:   { label: 'Rental',           icon: '🏠', color: '#EF6C00'  },
  service:  { label: 'Service',          icon: '🔧', color: '#a78bfa'  },
  craft:    { label: 'Craft',            icon: '🎨', color: '#2E7D32'  },
  mobility: { label: 'Electric Mobility',icon: '⚡', color: '#4ade80'  },
  digital:  { label: 'Digital Asset',    icon: '💻', color: '#38bdf8'  },
  affiliate:{ label: 'Affiliate Link',   icon: '💰', color: '#fbbf24'  },
};

// ── Default item schema ───────────────────────────────────
function blankItem(owner, itemType = 'product') {
  return {
    owner,          // CozyID e.g. CZ-62TFF
    ownerUid:  '',
    itemType,
    category:  '',
    subcategory: '',
    title:     '',
    description: '',
    price:     0,
    commission: 0,
    location:  '',
    county:    '',
    status:    'active', // active | inactive | pending | sold
    images:    [],
    tags:      [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    // rental extras
    deposit:    0,
    rentPeriod: 'monthly',
    bedrooms:   0,
    // service extras
    availability: 'weekdays',
    // mobility extras
    range: '', battery: '', speed: '',
    // digital extras
    downloadUrl: '',
    // rental occupancy
    occupied: false,
  };
}

// ── CRUD ──────────────────────────────────────────────────
async function addItem(ownerCozyId, ownerUid, itemType, fields) {
  const item = { ...blankItem(ownerCozyId, itemType), ownerUid, ...fields };
  const ref  = await addDoc(collection(db, 'cozyItems'), item);
  return ref.id;
}

async function getItem(id) {
  const snap = await getDoc(doc(db, 'cozyItems', id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

async function updateItem(id, fields) {
  await updateDoc(doc(db, 'cozyItems', id), { ...fields, updatedAt: serverTimestamp() });
}

async function deleteItem(id) {
  await deleteDoc(doc(db, 'cozyItems', id));
}

// ── Query helpers ─────────────────────────────────────────
async function getItemsByType(itemType, county = '') {
  let q = query(
    collection(db, 'cozyItems'),
    where('itemType', '==', itemType),
    where('status', '==', 'active'),
    orderBy('createdAt', 'desc'),
    limit(100)
  );
  const snap = await getDocs(q);
  let items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (county) items = items.filter(i => i.county === county);
  return items;
}

async function getItemsByOwner(ownerCozyId) {
  const q    = query(collection(db, 'cozyItems'), where('owner', '==', ownerCozyId), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function getItemsByCategory(itemType, category) {
  const q    = query(
    collection(db, 'cozyItems'),
    where('itemType', '==', itemType),
    where('category', '==', category),
    where('status', '==', 'active'),
    orderBy('createdAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ── Item categories by type ───────────────────────────────
export const CATEGORIES = {
  product:  ['Kitchen','Solar','Decor','Bedding','Security','Electronics','Tech','Fashion','Appliances'],
  rental:   ['Bedsitter','Single Room','1 Bedroom','2 Bedroom','3 Bedroom','4+ Bedroom','Commercial'],
  service:  ['Electrician','Plumber','Solar Installer','CCTV Installer','Delivery Rider','Graphic Designer','Web Developer','Cleaner','Carpenter','Phone Repair','Other'],
  craft:    ['Wall Art','Frames','Wooden Crafts','AI Art','Home Decor','Gift Items','Jewelry','Handmade','Other'],
  mobility: ['Electric Bike','Electric Scooter','Delivery Bike','Battery','Charger','Accessories'],
  digital:  ['Video Course','E-Book','Template','Software','AI Prompt','Crypto Guide','Other'],
  affiliate:['Cozycabin Shop','External Product','Course Referral','Service Referral'],
};

window.CozyItems = { addItem, getItem, updateItem, deleteItem, getItemsByType, getItemsByOwner, getItemsByCategory, ITEM_TYPES, CATEGORIES, blankItem };

export { addItem, getItem, updateItem, deleteItem, getItemsByType, getItemsByOwner, getItemsByCategory, blankItem };
