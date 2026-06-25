// ============================================================
//  cozy-wholesalers.js — OurCozy Wholesale Network
//  Connects wholesalers → customers, resellers, retailers
//  Supplier protection built-in. Privacy respected.
// ============================================================

import {
  db, collection, doc, addDoc, getDoc, getDocs,
  updateDoc, deleteDoc, query, where, orderBy,
  limit, serverTimestamp, increment
} from './firebase.js';

// ── Visibility levels ─────────────────────────────────────
export const VISIBILITY = {
  public:          { label: 'Public',           icon: '🌍', desc: 'Anyone can find you'            },
  business_only:   { label: 'Business Only',    icon: '🏪', desc: 'Verified businesses only'       },
  verified_buyers: { label: 'Verified Buyers',  icon: '✅', desc: 'Verified buyers only'           },
  invite_only:     { label: 'Invite Only',      icon: '🔐', desc: 'By invitation only'             },
};

// ── Supplier categories ───────────────────────────────────
export const SUPPLIER_CATEGORIES = [
  'Perfumes & Cosmetics', 'Fashion & Clothing', 'Electronics & Phones',
  'Solar & Energy',       'Furniture & Decor',  'Agriculture & Farm',
  'Food & Beverages',     'Building Materials', 'Stationery & Office',
  'Health & Medicine',    'Automotive Parts',   'Tools & Hardware',
  'Toys & Baby',          'Sports & Fitness',   'Other',
];

// ── Default wholesaler schema ─────────────────────────────
function blankWholesaler(ownerUid, ownerCozyId) {
  return {
    ownerUid, ownerCozyId,
    businessName:     '',
    ownerName:        '',
    logo:             '',
    coverPhoto:       '',
    phone:            '',
    whatsapp:         '',
    email:            '',
    location:         '',
    county:           '',
    country:          'Kenya',
    category:         '',
    subcategory:      '',
    description:      '',
    yearsActive:      0,
    deliveryAreas:    [],
    minimumOrder:     0,
    minimumOrderUnit: 'KES',
    followers:        0,
    trustScore:       50,
    verificationStatus: 'pending',   // pending | verified | suspended
    visibility:       'public',
    joinedDate:       new Date().toISOString(),
    status:           'active',
    businessHours:    '',
    // What supplier CHOOSES to show
    showCatalog:      true,
    showPhotos:       true,
    showVideos:       true,
    showDeliveryAreas:true,
    showBusinessHours:true,
    showPromotions:   true,
    // What supplier HIDES (enforced server-side)
    hideCustomerList:    true,
    hideInternalSuppliers:true,
    hideWholesalePrices: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

// ── CRUD ──────────────────────────────────────────────────
export async function createWholesaler(ownerUid, ownerCozyId, data) {
  const profile = { ...blankWholesaler(ownerUid, ownerCozyId), ...data };
  const ref = await addDoc(collection(db, 'cozyWholesalers'), profile);
  return ref.id;
}

export async function getWholesaler(id) {
  const snap = await getDoc(doc(db, 'cozyWholesalers', id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function updateWholesaler(id, fields) {
  await updateDoc(doc(db, 'cozyWholesalers', id), {
    ...fields, updatedAt: serverTimestamp()
  });
}

export async function getWholesalerByOwner(ownerCozyId) {
  const q    = query(collection(db,'cozyWholesalers'), where('ownerCozyId','==',ownerCozyId));
  const snap = await getDocs(q);
  return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
}

// ── Browse / Search ───────────────────────────────────────
export async function browseWholesalers({ category='', county='', search='', limitN=30 } = {}) {
  let q;
  try {
    if (category) {
      q = query(collection(db,'cozyWholesalers'),
        where('category','==',category), where('status','==','active'),
        where('visibility','==','public'), orderBy('trustScore','desc'), limit(limitN));
    } else {
      q = query(collection(db,'cozyWholesalers'),
        where('status','==','active'), where('visibility','==','public'),
        orderBy('trustScore','desc'), limit(limitN));
    }
    const snap = await getDocs(q);
    let results = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (county)  results = results.filter(w => w.county === county);
    if (search) {
      const s = search.toLowerCase();
      results = results.filter(w =>
        (w.businessName||'').toLowerCase().includes(s) ||
        (w.category||'').toLowerCase().includes(s) ||
        (w.description||'').toLowerCase().includes(s) ||
        (w.location||'').toLowerCase().includes(s)
      );
    }
    return results;
  } catch(_) {
    const snap = await getDocs(collection(db, 'cozyWholesalers'));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .filter(w => w.status === 'active' && w.visibility === 'public');
  }
}

// ── Follow / Unfollow ─────────────────────────────────────
export async function followWholesaler(wholesalerId, followerCozyId) {
  await addDoc(collection(db, 'cozyWholesalers', wholesalerId, 'followers'), {
    cozyId: followerCozyId, createdAt: serverTimestamp()
  });
  await updateDoc(doc(db,'cozyWholesalers',wholesalerId), { followers: increment(1) });
}

// ── Record view ───────────────────────────────────────────
export async function recordView(wholesalerId) {
  await updateDoc(doc(db,'cozyWholesalers',wholesalerId), {
    views: increment(1)
  }).catch(() => {});
}

// ── Supplier groups ───────────────────────────────────────
export const SUPPLIER_GROUPS = [
  { id:'perfume',     name:'Perfume Suppliers',     icon:'🌸', cat:'Perfumes & Cosmetics' },
  { id:'solar',       name:'Solar Suppliers',        icon:'☀️', cat:'Solar & Energy'       },
  { id:'furniture',   name:'Furniture Suppliers',    icon:'🪑', cat:'Furniture & Decor'    },
  { id:'electronics', name:'Electronics Suppliers',  icon:'📱', cat:'Electronics & Phones' },
  { id:'agriculture', name:'Agriculture Suppliers',  icon:'🌱', cat:'Agriculture & Farm'   },
  { id:'fashion',     name:'Fashion Suppliers',      icon:'👗', cat:'Fashion & Clothing'   },
  { id:'food',        name:'Food & Beverages',       icon:'🥬', cat:'Food & Beverages'     },
  { id:'building',    name:'Building Materials',     icon:'🧱', cat:'Building Materials'   },
];

// ── Supplier protection: never expose hidden info ─────────
export function safeWholesalerData(w, viewerVerified = false) {
  const safe = { ...w };
  // Always hide these regardless
  delete safe.hideCustomerList;
  delete safe.hideInternalSuppliers;
  delete safe.ownerUid;
  // Hide wholesale prices from unverified
  if (w.hideWholesalePrices && !viewerVerified) {
    safe.wholesalePrices = 'Contact supplier for pricing';
  }
  return safe;
}

window.CozyWholesalers = {
  createWholesaler, getWholesaler, updateWholesaler,
  getWholesalerByOwner, browseWholesalers,
  followWholesaler, recordView, safeWholesalerData,
  VISIBILITY, SUPPLIER_CATEGORIES, SUPPLIER_GROUPS
};

export default { createWholesaler, getWholesaler, updateWholesaler, getWholesalerByOwner, browseWholesalers, followWholesaler, recordView, safeWholesalerData, VISIBILITY, SUPPLIER_CATEGORIES, SUPPLIER_GROUPS };
