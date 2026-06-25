// ============================================================
//  cozy-transport.js — OurCozy Transport & Parcel System
//  Connects: Passengers · Drivers · Riders · Parcel Services
//  OurCozy connects people. Does NOT guarantee delivery/safety.
// ============================================================

import {
  db, collection, doc, addDoc, getDoc, getDocs,
  updateDoc, deleteDoc, query, where, orderBy,
  limit, serverTimestamp, increment
} from './firebase.js';

// ── Transport types ───────────────────────────────────────
export const TRANSPORT_TYPES = {
  matatu:    { label: 'Matatu',           icon: '🚐', color: '#EF6C00' },
  taxi:      { label: 'Taxi',             icon: '🚕', color: '#F9A825' },
  boda:      { label: 'Boda Boda',        icon: '🏍️', color: '#FF7043' },
  ebike:     { label: 'Electric Bike',    icon: '⚡', color: '#1B5E20' },
  escooter:  { label: 'Electric Scooter', icon: '🛴', color: '#2E7D32' },
  motorbike: { label: 'Motorbike',        icon: '🏍️', color: '#D32F2F' },
  bus:       { label: 'Bus',              icon: '🚌', color: '#1565C0' },
  shuttle:   { label: 'Shuttle',          icon: '🚐', color: '#7B1FA2' },
  tourvan:   { label: 'Tour Van',         icon: '🚌', color: '#00838F' },
  cargo:     { label: 'Cargo Delivery',   icon: '🚛', color: '#4E342E' },
  pickup:    { label: 'Pickup Truck',     icon: '🛻', color: '#37474F' },
  boat:      { label: 'Boat',             icon: '⛵', color: '#0277BD' },
  parcel:    { label: 'Parcel',           icon: '📦', color: '#6A1B9A' },
};

// ── Common routes ─────────────────────────────────────────
export const COMMON_ROUTES = [
  { from: 'Kilifi',    to: 'Mombasa',  distance: '56km',  popular: true  },
  { from: 'Kilifi',    to: 'Malindi',  distance: '65km',  popular: true  },
  { from: 'Mombasa',   to: 'Nairobi',  distance: '480km', popular: true  },
  { from: 'Nairobi',   to: 'Kisumu',   distance: '350km', popular: true  },
  { from: 'Mombasa',   to: 'Malindi',  distance: '120km', popular: false },
  { from: 'Nairobi',   to: 'Nakuru',   distance: '158km', popular: false },
  { from: 'Nairobi',   to: 'Eldoret',  distance: '310km', popular: false },
  { from: 'Kilifi',    to: 'Nairobi',  distance: '530km', popular: false },
];

// ── Parcel status ─────────────────────────────────────────
export const PARCEL_STATUS = {
  pending:    { label: 'Pending Pickup',   icon: '⏳', color: '#EF6C00' },
  collected:  { label: 'Collected',        icon: '📦', color: '#1565C0' },
  in_transit: { label: 'In Transit',       icon: '🚌', color: '#F9A825' },
  arrived:    { label: 'Arrived',          icon: '📍', color: '#2E7D32' },
  collected_receiver: { label: 'Delivered',icon: '✅', color: '#1B5E20' },
  cancelled:  { label: 'Cancelled',        icon: '❌', color: '#D32F2F' },
};

// ── Add transport listing (route/vehicle) ─────────────────
export async function addTransport(ownerCozyId, ownerUid, data) {
  const item = {
    ownerCozyId, ownerUid,
    type:          data.type || 'boda',
    from:          data.from || '',
    to:            data.to   || '',
    fare:          Number(data.fare) || 0,
    departureTime: data.departureTime || '',
    arrivalTime:   data.arrivalTime   || '',
    seats:         Number(data.seats) || 1,
    phone:         data.phone || '',
    whatsapp:      data.whatsapp || data.phone || '',
    driverName:    data.driverName || '',
    vehiclePlate:  data.vehiclePlate || '',
    county:        data.county || '',
    description:   data.description || '',
    status:        'active',
    trust:         50,
    verified:      false,
    tripsCompleted:0,
    createdAt:     serverTimestamp(),
    updatedAt:     serverTimestamp(),
  };
  const ref = await addDoc(collection(db, 'cozyTransport'), item);
  return ref.id;
}

export async function getTransportRoutes({ from='', to='', type='', county='' } = {}) {
  try {
    let q = query(collection(db,'cozyTransport'),
      where('status','==','active'), orderBy('createdAt','desc'), limit(50));
    const snap = await getDocs(q);
    let results = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (from)   results = results.filter(r => r.from?.toLowerCase().includes(from.toLowerCase()));
    if (to)     results = results.filter(r => r.to?.toLowerCase().includes(to.toLowerCase()));
    if (type)   results = results.filter(r => r.type === type);
    if (county) results = results.filter(r => r.county === county);
    return results;
  } catch(_) {
    const snap = await getDocs(collection(db,'cozyTransport'));
    return snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(r => r.status === 'active');
  }
}

export async function updateTransport(id, fields) {
  await updateDoc(doc(db,'cozyTransport',id), { ...fields, updatedAt: serverTimestamp() });
}

export async function deleteTransport(id) {
  await updateDoc(doc(db,'cozyTransport',id), { status: 'inactive', updatedAt: serverTimestamp() });
}

// ── Delivery riders ───────────────────────────────────────
export async function addRider(ownerCozyId, ownerUid, data) {
  const rider = {
    ownerCozyId, ownerUid,
    name:            data.name || '',
    photo:           data.photo || '',
    phone:           data.phone || '',
    whatsapp:        data.whatsapp || data.phone || '',
    bikeType:        data.bikeType || 'motorbike',
    isElectric:      data.isElectric || false,
    county:          data.county || '',
    location:        data.location || '',
    availability:    data.availability || 'anytime',
    priceMin:        Number(data.priceMin) || 0,
    priceMax:        Number(data.priceMax) || 0,
    deliveryRadius:  data.deliveryRadius || '',
    trustScore:      50,
    verified:        false,
    deliveriesCount: 0,
    status:          'active',
    createdAt:       serverTimestamp(),
    updatedAt:       serverTimestamp(),
  };
  const ref = await addDoc(collection(db,'cozyRiders'), rider);
  return ref.id;
}

export async function getRiders({ county='', isElectric=null } = {}) {
  try {
    let q = query(collection(db,'cozyRiders'), where('status','==','active'), orderBy('trustScore','desc'), limit(40));
    const snap = await getDocs(q);
    let results = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (county)     results = results.filter(r => r.county === county);
    if (isElectric !== null) results = results.filter(r => r.isElectric === isElectric);
    return results;
  } catch(_) {
    const snap = await getDocs(collection(db,'cozyRiders'));
    return snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(r => r.status === 'active');
  }
}

// ── Parcel system ─────────────────────────────────────────
export async function sendParcel(senderCozyId, data) {
  const tracking = 'CP' + Date.now().toString(36).toUpperCase();
  const parcel = {
    senderCozyId,
    senderName:     data.senderName || '',
    senderPhone:    data.senderPhone || '',
    receiverName:   data.receiverName || '',
    receiverPhone:  data.receiverPhone || '',
    from:           data.from || '',
    to:             data.to   || '',
    weight:         data.weight || '',
    description:    data.description || '',
    busCompany:     data.busCompany || '',
    pickupPoint:    data.pickupPoint || '',
    deliveryPoint:  data.deliveryPoint || '',
    estimatedCost:  Number(data.estimatedCost) || 0,
    estimatedDays:  data.estimatedDays || '',
    trackingNumber: tracking,
    status:         'pending',
    statusHistory:  [{ status:'pending', time: new Date().toISOString(), note:'Parcel registered' }],
    createdAt:      serverTimestamp(),
    updatedAt:      serverTimestamp(),
  };
  const ref = await addDoc(collection(db,'cozyCourier'), parcel);
  return { id: ref.id, tracking };
}

export async function getParcels(cozyId) {
  const snap = await getDocs(query(
    collection(db,'cozyCourier'),
    where('senderCozyId','==',cozyId),
    orderBy('createdAt','desc')
  ));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function updateParcelStatus(id, status, note='') {
  const snap = await getDoc(doc(db,'cozyCourier',id));
  if (!snap.exists()) return;
  const history = snap.data().statusHistory || [];
  history.push({ status, time: new Date().toISOString(), note });
  await updateDoc(doc(db,'cozyCourier',id), { status, statusHistory: history, updatedAt: serverTimestamp() });
}

export async function trackParcel(trackingNumber) {
  const snap = await getDocs(query(
    collection(db,'cozyCourier'),
    where('trackingNumber','==',trackingNumber)
  ));
  return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
}

// ── AI search understanding (natural language → params) ───
export function parseTransportQuery(text) {
  const lower = text.toLowerCase();
  const result = { type: '', from: '', to: '', action: 'search' };

  // Type detection
  if (/matatu/i.test(text))   result.type = 'matatu';
  if (/taxi/i.test(text))     result.type = 'taxi';
  if (/boda/i.test(text))     result.type = 'boda';
  if (/parcel|package|send/i.test(text)) { result.type = 'parcel'; result.action = 'parcel'; }
  if (/rider|delivery/i.test(text))      { result.type = 'boda'; result.action = 'rider'; }
  if (/electric.*bike|e-bike|ebike/i.test(text)) result.type = 'ebike';

  // Route detection — common towns
  const towns = ['kilifi','mombasa','nairobi','malindi','kisumu','nakuru','eldoret','lamu','kwale'];
  const foundTowns = towns.filter(t => lower.includes(t));
  if (foundTowns.length >= 2) { result.from = foundTowns[0]; result.to = foundTowns[1]; }
  else if (foundTowns.length === 1) { result.from = foundTowns[0]; }

  return result;
}

window.CozyTransport = {
  addTransport, getTransportRoutes, updateTransport, deleteTransport,
  addRider, getRiders, sendParcel, getParcels, updateParcelStatus, trackParcel,
  parseTransportQuery, TRANSPORT_TYPES, COMMON_ROUTES, PARCEL_STATUS
};
