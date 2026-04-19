
import { initializeApp } from 'firebase/app';
import { getFirestore, collectionGroup, getDocs } from 'firebase/firestore';
import firebaseConfig from './src/firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function deepSearch() {
  const collections = ['settings', 'game', 'config', 'gameConfig', 'admin'];
  for (const col of collections) {
    try {
      const snap = await getDocs(collectionGroup(db, col));
      console.log(`--- SEARCHING COLLECTION GROUP: ${col} ---`);
      snap.forEach(doc => {
        console.log(`PATH: ${doc.ref.path}`);
        console.log(JSON.stringify(doc.data(), null, 2));
      });
    } catch (e) {
      console.log(`ERROR SEARCHING ${col}:`, e.message);
    }
  }
}
deepSearch();
