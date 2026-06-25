// ============================================================
//  firebase.js — Cozycabin Shared Firebase Config
//  Used by: cozy-id.js, cozy-items.js, cozy-wallet.js,
//           cozy-leads.js, cozy-contacts.js, cozy-chat.js
// ============================================================

import { initializeApp }                          from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getAuth, GoogleAuthProvider,
         signInWithPopup, signInWithEmailAndPassword,
         createUserWithEmailAndPassword,
         sendPasswordResetEmail, signOut,
         onAuthStateChanged,
         browserLocalPersistence, setPersistence }from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { getFirestore, collection, doc, addDoc,
         setDoc, getDoc, getDocs, updateDoc,
         deleteDoc, query, where, orderBy,
         limit, onSnapshot, serverTimestamp,
         increment }                              from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

export const firebaseConfig = {
  apiKey:            "AIzaSyDToZQ-f31ZA2RmPWNKZ4DTtVjyj-toMW0",
  authDomain:        "cozycabin-affiliate.firebaseapp.com",
  projectId:         "cozycabin-affiliate",
  storageBucket:     "cozycabin-affiliate.firebasestorage.app",
  messagingSenderId: "765281276271",
  appId:             "1:765281276271:web:1368fb340b1fb68a01189a",
  measurementId:     "G-NFYX4TH0H7"
};

export const app  = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db   = getFirestore(app);

export const ADMIN_EMAILS = ['cozycabincoke@gmail.com','chalzowuor516@gmail.com'];
export const WA_NUMBER    = '254702468460';
export const SITE_URL     = 'https://cozycabin.co.ke';

// ── Persistence (survives page refresh) ──
setPersistence(auth, browserLocalPersistence).catch(() => {});

// ── Re-export Firebase helpers so consumers import from one place ──
export {
  GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, sendPasswordResetEmail,
  signOut, onAuthStateChanged,
  collection, doc, addDoc, setDoc, getDoc, getDocs,
  updateDoc, deleteDoc, query, where, orderBy, limit,
  onSnapshot, serverTimestamp, increment
};
