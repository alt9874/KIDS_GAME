
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import firebaseConfig from './src/firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function dump() {
  const configRef = doc(db, 'settings', 'gameConfig');
  const snap = await getDoc(configRef);
  if (snap.exists()) {
    console.log("=== GAME CONFIG ===");
    console.log(JSON.stringify(snap.data(), null, 2));
  } else {
    console.log("GAME CONFIG NOT FOUND");
  }

  const globalRef = doc(db, 'stats', 'global');
  const snapGlobal = await getDoc(globalRef);
  if (snapGlobal.exists()) {
    console.log("=== GLOBAL STATS ===");
    console.log(JSON.stringify(snapGlobal.data(), null, 2));
  }
}
dump();
