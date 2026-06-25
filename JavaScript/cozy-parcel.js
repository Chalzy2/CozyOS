// ============================================================
//  cozy-parcel.js — OurCozy Parcel & Courier System
//  OurCozy connects senders to bus companies.
//  Does NOT guarantee delivery. Does NOT take responsibility.
// ============================================================

import {
  db, collection, doc, addDoc, getDoc, getDocs,
  updateDoc, query, where, orderBy, serverTimestamp
} from './firebase.js';

// ── Status definitions ────────────────────────────────────
export const PARCEL_STATUS = {
  pending:           { label: 'Pending Pickup',   icon: '⏳', color: '#EF6C00', bg: '#FBE9E7' },
  collected:         { label: 'Collected',         icon: '📦', color: '#1565C0', bg: '#E3F2FD' },
  in_transit:        { label: 'In Transit',        icon: '🚌', color: '#F9A825', bg: '#FFF8E1' },
  arrived:           { label: 'Arrived at Dest.',  icon: '📍', color: '#2E7D32', bg: '#E8F5E9' },
  ready_collection:  { label: 'Ready to Collect',  icon: '✅', color: '#1B5E20', bg: '#E8F5E9' },
  delivered:         { label: 'Delivered',         icon: '🎉', color: '#1B5E20', bg: '#E8F5E9' },
  cancelled:         { label: 'Cancelled',         icon: '❌', color: '#D32F2F', bg: '#FFEBEE' },
  delayed:           { label: 'Delayed',           icon: '⚠️', color: '#EF6C00', bg: '#FBE9E7' },
};

// ── Bus companies (common Kenya routes) ───────────────────
export const BUS_COMPANIES = [
  { name: 'Tahmeed Bus',    routes: ['Mombasa-Nairobi','Kilifi-Nairobi'], phone: '' },
  { name: 'Mash Bus',       routes: ['Nairobi-Kisumu','Nairobi-Eldoret'], phone: '' },
  { name: 'Easy Coach',     routes: ['Nairobi-Kisumu','Nairobi-Kampala'], phone: '' },
  { name: 'Guardian Angel', routes: ['Mombasa-Nairobi','Kilifi-Mombasa'], phone: '' },
  { name: 'Simba Coach',    routes: ['Nairobi-Nakuru','Nairobi-Eldoret'], phone: '' },
  { name: 'Modern Coast',   routes: ['Mombasa-Nairobi','Mombasa-Malindi'],phone: '' },
  { name: 'Other/Custom',   routes: ['Custom Route'], phone: '' },
];

// ── Generate tracking number ──────────────────────────────
function genTracking() {
  return 'CP' + Date.now().toString(36).toUpperCase().slice(-5) +
         Math.random().toString(36).toUpperCase().slice(2,5);
}

// ── Send parcel ───────────────────────────────────────────
export async function sendParcel(senderCozyId, senderUid, data) {
  const tracking = genTracking();
  const parcel = {
    senderCozyId, senderUid,
    senderName:     data.senderName    || '',
    senderPhone:    data.senderPhone   || '',
    receiverName:   data.receiverName  || '',
    receiverPhone:  data.receiverPhone || '',
    from:           data.from          || '',
    to:             data.to            || '',
    weight:         data.weight        || '',
    contents:       data.contents      || '',
    busCompany:     data.busCompany    || '',
    pickupPoint:    data.pickupPoint   || '',
    deliveryPoint:  data.deliveryPoint || '',
    estimatedCost:  Number(data.estimatedCost)  || 0,
    estimatedDays:  data.estimatedDays  || '1-3 days',
    trackingNumber: tracking,
    status:         'pending',
    statusHistory:  [{
      status: 'pending',
      note:   'Parcel registered on OurCozy',
      time:   new Date().toISOString()
    }],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  const ref = await addDoc(collection(db, 'cozyCourier'), parcel);
  return { id: ref.id, tracking };
}

// ── Get sender's parcels ──────────────────────────────────
export async function getSentParcels(cozyId) {
  try {
    const q    = query(collection(db,'cozyCourier'),
      where('senderCozyId','==',cozyId), orderBy('createdAt','desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch(_) {
    const snap = await getDocs(query(
      collection(db,'cozyCourier'), where('senderCozyId','==',cozyId)
    ));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }
}

// ── Track by tracking number ──────────────────────────────
export async function trackParcel(trackingNumber) {
  const snap = await getDocs(query(
    collection(db,'cozyCourier'),
    where('trackingNumber','==',trackingNumber.toUpperCase().trim())
  ));
  return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
}

// ── Update parcel status ──────────────────────────────────
export async function updateStatus(id, status, note = '') {
  const ref  = doc(db, 'cozyCourier', id);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Parcel not found');
  const history = snap.data().statusHistory || [];
  history.push({ status, note, time: new Date().toISOString() });
  await updateDoc(ref, {
    status, statusHistory: history, updatedAt: serverTimestamp()
  });
}

// ── Estimate cost (simple formula) ───────────────────────
export function estimateCost(from, to, weightKg = 1) {
  const ROUTE_PRICES = {
    'kilifi-mombasa':  150, 'mombasa-kilifi':  150,
    'kilifi-nairobi':  400, 'nairobi-kilifi':  400,
    'mombasa-nairobi': 350, 'nairobi-mombasa': 350,
    'nairobi-kisumu':  400, 'kisumu-nairobi':  400,
    'kilifi-malindi':  120, 'malindi-kilifi':  120,
    'nairobi-eldoret': 350, 'eldoret-nairobi': 350,
  };
  const key = `${from}-${to}`.toLowerCase().replace(/\s/g,'');
  const base = ROUTE_PRICES[key] || 300;
  const weight_extra = Math.max(0, (weightKg - 1)) * 50;
  return base + weight_extra;
}

// ── Format status history for display ────────────────────
export function formatHistory(history = []) {
  return [...history].reverse().map(h => {
    const meta = PARCEL_STATUS[h.status] || { icon:'📦', label: h.status };
    const date = h.time ? new Date(h.time).toLocaleString('en-GB', {
      day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'
    }) : '—';
    return { ...h, ...meta, date };
  });
}

window.CozyParcel = {
  sendParcel, getSentParcels, trackParcel, updateStatus,
  estimateCost, formatHistory, BUS_COMPANIES, PARCEL_STATUS, genTracking
};

export default {
  sendParcel, getSentParcels, trackParcel, updateStatus,
  estimateCost, formatHistory, BUS_COMPANIES, PARCEL_STATUS
};
