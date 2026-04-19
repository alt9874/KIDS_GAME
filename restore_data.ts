
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, updateDoc } from 'firebase/firestore';
import firebaseConfig from './src/firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

const ORIGINAL_PILL_CONFIGS = [
  { id: 1, label: '올슨', score: 30, color: '#2ecc71', type: 'good', freq: 1.0, image: 'https://raw.githubusercontent.com/alt9874/game/main/ow.gif', enabled: true },
  { id: 2, label: '디디', score: 15, color: '#27ae60', type: 'good', freq: 1.0, image: 'https://raw.githubusercontent.com/alt9874/game/main/didi.gif', enabled: true },
  { id: 3, label: '정량 복용', score: 10, color: '#16a085', type: 'good', freq: 1.0, image: '', enabled: true },
  { id: 8, label: '유통기한 지킴', score: 10, color: '#3498db', type: 'good', freq: 0.8, image: '', enabled: true },
  { id: 4, label: '유효기간 경과', score: -10, color: '#f1c40f', type: 'bad', freq: 0.7, image: '', enabled: true },
  { id: 5, label: '보관 불량', score: -20, color: '#f39c12', type: 'bad', freq: 0.6, image: '', enabled: true },
  { id: 6, label: '의약품 오남용', score: -25, color: '#e74c3c', type: 'bad', freq: 0.5, image: 'https://raw.githubusercontent.com/alt9874/game/main/item_01.png', enabled: true },
  { id: 7, label: '중복 복용', score: -30, color: '#c0392b', type: 'bad', freq: 0.4, image: '', enabled: true },
];

async function restore() {
  try {
    const configRef = doc(db, 'settings', 'gameConfig');
    await updateDoc(configRef, {
      pillConfigs: ORIGINAL_PILL_CONFIGS,
      openingBgImage: "https://raw.githubusercontent.com/alt9874/game/main/bg.png",
      playBgImage: "https://raw.githubusercontent.com/alt9874/game/main/play_bg.png",
      startButtonImage: "https://raw.githubusercontent.com/alt9874/game/main/start_bt.png",
      gameSpeed: { duration: 30, spawnInterval: 800 },
      updatedAt: new Date()
    });
    console.log("SUCCESS: Restored to original safety theme.");
  } catch (err) {
    console.error("FAILED:", err);
  }
}
restore();
