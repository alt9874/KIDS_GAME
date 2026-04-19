
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import firebaseConfig from './src/firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function check() {
  const snap = await getDoc(doc(db, 'settings', 'game'));
  if (snap.exists()) {
    console.log("--- SETTINGS/game ---");
    console.log(JSON.stringify(snap.data(), null, 2));
  } else {
    console.log("SETTINGS/game NOT FOUND");
  }
}
check();
