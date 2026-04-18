import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Pill as PillIcon, Timer, Trophy, Zap, Info, Settings, ArrowRight, Home, BarChart2, Volume2, VolumeX, Download, Plus, Trash2, ChevronUp, ChevronDown } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import * as XLSX from 'xlsx';
import { getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, increment, serverTimestamp, collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { getAuth, onAuthStateChanged, signInWithPopup, GoogleAuthProvider, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { Howl, Howler } from 'howler'; // 하드웨어 무음 스위치 대응을 위한 라이브러리

// --- [Firebase Configuration] ---
import firebaseConfig from './firebase-applet-config.json';
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
const auth = getAuth();

// Explicitly set persistence to help with iframe auth issues
setPersistence(auth, browserLocalPersistence).catch(err => console.error("Failed to set persistence:", err));

// --- [1. 약물 점수 및 이미지 제어 센터] ---
// 여기서 각 약물의 점수와 이미지를 직접 수정하세요.
const PILL_SETTINGS = [
  { id: 1, type: 'good' as const, label: "올바른 복용", score: 15, size: [80, 40], image: undefined, color: "#2ecc71", enabled: true, spawnChance: 20 },
  { id: 2, type: 'good' as const, label: "식후 30분", score: 10, size: [80, 40], image: undefined, color: "#27ae60", enabled: true, spawnChance: 20 },
  { id: 3, type: 'good' as const, label: "정량 복용", score: 10, size: [80, 40], image: undefined, color: "#16a085", enabled: true, spawnChance: 20 },
  { id: 4, type: 'good' as const, label: "충분한 물과 함께", score: 10, size: [80, 40], image: undefined, color: "#3498db", enabled: true, spawnChance: 20 },
  { id: 5, type: 'misuse' as const, label: "유효기간 경과", score: -15, size: [70, 70], image: undefined, color: "#f1c40f", enabled: true, spawnChance: 10 },
  { id: 6, type: 'misuse' as const, label: "약물 오남용", score: -25, size: [60, 60], image: undefined, color: "#e74c3c", enabled: true, spawnChance: 5 },
  { id: 7, type: 'misuse' as const, label: "중복 복용", score: -30, size: [90, 45], image: undefined, color: "#c0392b", enabled: true, spawnChance: 5 }
];

// --- [2. 오디오 파일 설정] ---
// 여기에 실제 오디오 파일 URL을 넣으세요.
const AUDIO_URLS = {
  OPENING: undefined, // 오프닝 배경음악
  HIT: undefined,     // 약물 터치 효과음
  ENDING: undefined   // 엔딩 배경음악
};

// --- [3. 이미지 설정] ---
const OPENING_BG_IMAGE_PC = "https://raw.githubusercontent.com/alt9874/game/main/main_pc.jpg"; 
const OPENING_BG_IMAGE_MO = "https://raw.githubusercontent.com/alt9874/game/main/main_mo.jpg"; 
const START_BUTTON_IMAGE = "https://raw.githubusercontent.com/alt9874/game/main/start_bt.png"; 
const PLAY_BG_IMAGE_PC = "https://raw.githubusercontent.com/alt9874/game/main/game_play_pc.gif"; // PC 버전 플레이 배경
const PLAY_BG_IMAGE_MO = "https://raw.githubusercontent.com/alt9874/game/main/game_play_mo.gif"; // 모바일 버전 플레이 배경
const ENDING_IMAGES = {
  LEVEL_1: undefined, // 100점 미만
  LEVEL_2: undefined, // 100~299점
  LEVEL_3: undefined, // 300~599점
  LEVEL_4: undefined, // 600~999점
  LEVEL_5: undefined  // 1000점 이상
};

interface PillInstance {
  id: number;
  configId: number;
  type: 'good' | 'bad' | 'misuse';
  label: string;
  color: string;
  image?: string;
  score: number;
  width: number;
  height: number;
  x: number;
  y: number;
  speed: number;
  angle: number;
  rotSpeed: number;
}

interface Popup {
  id: number;
  text: string;
  x: number;
  y: number;
  color: string;
}

interface VisitData {
  date: string;
  count: number;
  referrers: { [key: string]: number };
  ips?: { [key: string]: number };
  lastUpdated: any;
}

export default function App() {
  const [gameState, setGameState] = useState<'start' | 'how-to' | 'playing' | 'end' | 'admin'>('start');
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [timeLeft, setTimeLeft] = useState(60);
  const [pills, setPills] = useState<PillInstance[]>([]);
  const [popups, setPopups] = useState<Popup[]>([]);
  const [visitStats, setVisitStats] = useState<VisitData[]>([]);
  const [totalVisits, setTotalVisits] = useState<number>(0);
  const [pillConfigs, setPillConfigs] = useState(PILL_SETTINGS);
  const [gameSpeed, setGameSpeed] = useState({ base: 2.5, increment: 0.06, duration: 60 });
  const [openingBgImage, setOpeningBgImage] = useState<string | undefined>(undefined);
  const [startButtonImage, setStartButtonImage] = useState<string | undefined>(undefined);
  const [btnImageError, setBtnImageError] = useState(false);
  const [audioSettings, setAudioSettings] = useState({
    opening: 'https://cdn.jsdelivr.net/gh/alt9874/game@main/opening.mp3',
    gameplay: 'https://cdn.jsdelivr.net/gh/alt9874/game@main/main.mp3',
    hitPositive: 'https://cdn.jsdelivr.net/gh/alt9874/game@main/win.mp3',
    hitNegative: 'https://cdn.jsdelivr.net/gh/alt9874/game@main/error.mp3',
    ending: 'https://cdn.jsdelivr.net/gh/alt9874/game@main/ending.mp3',
    volume: 0.7
  });
  const [isMuted, setIsMuted] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const gameLoopRef = useRef<number | null>(null);
  const lastSpawnTime = useRef<number>(0);
  const pillIdCounter = useRef(0);
  const popupIdCounter = useRef(0);
  const currentBaseSpeed = useRef(2.5);

  // --- [하드웨어 무음 스위치 대응] Howler를 이용한 오디오 참조 객체 ---
  const openingAudioRef = useRef<Howl | null>(null);
  const gameplayAudioRef = useRef<Howl | null>(null);
  const hitPositiveAudioRef = useRef<Howl | null>(null);
  const hitNegativeAudioRef = useRef<Howl | null>(null);
  const endingAudioRef = useRef<Howl | null>(null);

  // --- [Firebase: Auth] ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    if (isLoggingIn) return;
    setIsLoggingIn(true);
    const provider = new GoogleAuthProvider();
    // Force account selection to prevent "invalid action" errors in some environments
    provider.setCustomParameters({ prompt: 'select_account' });
    
    try {
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      if (error.code === 'auth/popup-closed-by-user') {
        // User closed the popup, ignore this error
        return;
      }
      if (error.code === 'auth/popup-blocked') {
        alert("팝업이 차단되었습니다. 브라우저 설정에서 팝업을 허용해 주세요.");
      } else if (error.code === 'auth/cancelled-popup-request') {
        // This can happen if multiple requests are made, which we now prevent with isLoggingIn
        console.warn("Login request was cancelled by another request.");
      } else if (error.message?.includes('INTERNAL ASSERTION FAILED')) {
        // Handle the specific internal assertion error with a more helpful message or retry logic
        console.error("Firebase Internal Assertion Failed:", error);
        alert("로그인 중 내부 오류가 발생했습니다. 페이지를 새로고침한 후 다시 시도해 주세요.");
      } else if (error.code === 'auth/unauthorized-domain') {
        alert(`파이어베이스 설정에서 현재 도메인(${window.location.hostname})이 허용되지 않았습니다.\n\n해결 방법:\n1. 파이어베이스 콘솔 프로젝트 ID가 'gen-lang-client-0393263422'인지 확인해 주세요.\n2. Authorized domains에 '${window.location.hostname}'가 정확히 추가되어 있는지 확인해 주세요.`);
      } else {
        console.error("Login failed:", error);
        alert(`로그인 실패: ${error.message}`);
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  // --- [Firebase: Analytics & Settings] ---
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const configDoc = await getDoc(doc(db, 'settings', 'gameConfig'));
        if (configDoc.exists()) {
          const data = configDoc.data();
          if (data.pillConfigs) setPillConfigs(data.pillConfigs);
          if (data.gameSpeed) {
            setGameSpeed({
              base: data.gameSpeed.base || 2.5,
              increment: data.gameSpeed.increment || 0.06,
              duration: data.gameSpeed.duration || 60
            });
            currentBaseSpeed.current = data.gameSpeed.base;
          }
          if (data.openingBgImage && data.openingBgImage !== 'undefined' && data.openingBgImage !== 'null') {
            setOpeningBgImage(data.openingBgImage);
          }
          if (data.startButtonImage && data.startButtonImage !== 'undefined' && data.startButtonImage !== 'null') {
            setStartButtonImage(data.startButtonImage);
          }
          if (data.audioSettings) {
            setAudioSettings(prev => ({
              ...prev,
              ...data.audioSettings,
              // Ensure we don't overwrite with null/empty if we have a default
              opening: data.audioSettings.opening || prev.opening,
              gameplay: data.audioSettings.gameplay || prev.gameplay,
              hitPositive: data.audioSettings.hitPositive || data.audioSettings.hit || prev.hitPositive,
              hitNegative: data.audioSettings.hitNegative || data.audioSettings.hit || prev.hitNegative,
              ending: data.audioSettings.ending || prev.ending,
            }));
          }
        }
      } catch (error) {
        console.error("Failed to fetch settings:", error);
      }
    };
    fetchSettings();

    const trackVisit = async () => {
      try {
        const today = new Date().toISOString().split('T')[0];
        const referrer = document.referrer || 'Direct';
        const sanitizedReferrer = referrer.replace(/[^a-zA-Z0-9_-]/g, '_');
        
        // IP 주소 체크 (외부 API 사용)
        let userIp = 'Unknown';
        try {
          const ipResponse = await fetch('https://api.ipify.org?format=json');
          const ipData = await ipResponse.json();
          userIp = ipData.ip;
        } catch (ipError) {
          console.error("Failed to fetch IP:", ipError);
        }
        const sanitizedIp = userIp.replace(/\./g, '_');

        // Use localStorage to track if this user has visited today (simple client-side tracking)
        const lastVisitDate = localStorage.getItem('safe_touch_last_visit');
        
        if (lastVisitDate !== today) {
          const dailyVisitRef = doc(db, 'visits', today);
          const dailyDoc = await getDoc(dailyVisitRef);
          
          if (!dailyDoc.exists()) {
            await setDoc(dailyVisitRef, {
              date: today,
              count: 1,
              referrers: { [sanitizedReferrer]: 1 },
              ips: { [sanitizedIp]: 1 },
              lastUpdated: serverTimestamp()
            });
          } else {
            await updateDoc(dailyVisitRef, {
              count: increment(1),
              [`referrers.${sanitizedReferrer}`]: increment(1),
              [`ips.${sanitizedIp}`]: increment(1),
              lastUpdated: serverTimestamp()
            });
          }
          localStorage.setItem('safe_touch_last_visit', today);
        }

        // Fetch stats to show on start screen
        const q = query(collection(db, 'visits'), orderBy('date', 'desc'), limit(60));
        const querySnapshot = await getDocs(q);
        const stats = querySnapshot.docs.map(doc => doc.data() as VisitData);
        setVisitStats(stats);
        const total = stats.reduce((acc, curr) => acc + curr.count, 0);
        setTotalVisits(total);
      } catch (error) {
        console.error("Tracking or fetching stats failed:", error);
      }
    };
    trackVisit();

    // Check for /admin in URL
    if (window.location.pathname === '/admin') {
      // We'll check for admin status in a separate useEffect once user is loaded
    }
  }, []);

  // --- [Admin Access Control] ---
  useEffect(() => {
    const isAdmin = user?.email === 'jsj20210104@gmail.com';
    if (window.location.pathname === '/admin') {
      if (user === null) {
        // Wait for auth to load
        return;
      }
      if (isAdmin) {
        setGameState('admin');
        fetchAdminStats();
      } else {
        // Not an admin, redirect to home
        window.history.replaceState({}, '', '/');
        setGameState('start');
      }
    }
  }, [user]);

  const [audioBlocked, setAudioBlocked] = useState(false);

  // --- [하드웨어 무음 스위치 대응] 오디오 로드 및 초기 설정 ---
  useEffect(() => {
    // Stop and unload previous sounds
    openingAudioRef.current?.stop();
    hitPositiveAudioRef.current?.stop();
    hitNegativeAudioRef.current?.stop();
    endingAudioRef.current?.stop();

    const loadAudio = (url: string, isLoop: boolean, label: string) => {
      if (!url) return null;
      return new Howl({
        src: [url],
        loop: isLoop,
        autoplay: false, // 자동 재생은 updateAudio에서 제어
        volume: audioSettings.volume || 0.7,
        mute: isMuted,
        html5: false, // Web Audio API 사용
        onloaderror: (id, err) => console.warn(`Failed to load ${label} audio: ${url}. Error:`, err),
        onplayerror: (id, err) => {
          console.warn(`${label} play blocked by browser:`, err);
          if (label === 'opening') setAudioBlocked(true);
        },
        onplay: () => {
          if (label === 'opening') setAudioBlocked(false);
        }
      });
    };

    openingAudioRef.current = loadAudio(audioSettings.opening, true, "opening");
    gameplayAudioRef.current = loadAudio(audioSettings.gameplay, true, "gameplay");
    hitPositiveAudioRef.current = loadAudio(audioSettings.hitPositive, false, "hitPositive");
    hitNegativeAudioRef.current = loadAudio(audioSettings.hitNegative, false, "hitNegative");
    endingAudioRef.current = loadAudio(audioSettings.ending, false, "ending");

    return () => {
      openingAudioRef.current?.stop();
      gameplayAudioRef.current?.stop();
      hitPositiveAudioRef.current?.stop();
      hitNegativeAudioRef.current?.stop();
      endingAudioRef.current?.stop();
    };
  }, [audioSettings]);

  const prevGameStateRef = useRef<string>(gameState);

  // Audio initialization with user interaction check
  useEffect(() => {
    const updateAudio = () => {
      if (isMuted) {
        openingAudioRef.current?.stop();
        gameplayAudioRef.current?.stop();
        endingAudioRef.current?.stop();
        return;
      }

      // 1. Opening Music (Start & How-to)
      if (gameState === 'start' || gameState === 'how-to') {
        gameplayAudioRef.current?.stop();
        endingAudioRef.current?.stop();
        if (openingAudioRef.current && !openingAudioRef.current.playing()) {
          openingAudioRef.current.play();
        }
      } 
      // 2. Gameplay Music
      else if (gameState === 'playing') {
        openingAudioRef.current?.stop();
        endingAudioRef.current?.stop();
        if (gameplayAudioRef.current && !gameplayAudioRef.current.playing()) {
          gameplayAudioRef.current.play();
        }
      }
      // 3. Ending Music
      else if (gameState === 'end') {
        openingAudioRef.current?.stop();
        gameplayAudioRef.current?.stop();
        if (endingAudioRef.current && !endingAudioRef.current.playing()) {
          endingAudioRef.current.play();
        }
      }
      // 4. Admin or other
      else {
        openingAudioRef.current?.stop();
        gameplayAudioRef.current?.stop();
        endingAudioRef.current?.stop();
      }
    };

    updateAudio();
    
    // Add a one-time global click listener to unlock audio
    const unlockAudio = async () => {
      console.log("User interaction detected, unlocking audio...");
      // Resume AudioContext for browsers that require it
      if (Howler.ctx && (Howler.ctx.state === 'suspended')) {
        try {
          await Howler.ctx.resume();
        } catch (e) {
          console.error("AudioContext resume failed:", e);
        }
      }
      
      // Force track play check
      updateAudio();
      
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('touchstart', unlockAudio);
      window.removeEventListener('mousedown', unlockAudio);
    };
    
    window.addEventListener('click', unlockAudio);
    window.addEventListener('touchstart', unlockAudio);
    window.addEventListener('mousedown', unlockAudio);
    
    return () => {
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('touchstart', unlockAudio);
      window.removeEventListener('mousedown', unlockAudio);
    };
  }, [gameState, isMuted]);

  // --- [하드웨어 무음 스위치 대응] 브라우저 가시성 변화 및 무음 설정 동기화 ---
  useEffect(() => {
    // 1. 앱 내 무음 버튼과 Howler 글로벌 설정 동기화
    Howler.mute(isMuted);
  }, [isMuted]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        Howler.mute(true); // 화면이 가려지면 즉시 소리 차단
      } else {
        Howler.mute(isMuted); // 화면이 다시 보이면 버튼 상태에 따라 복구
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isMuted]);

  const playHitSound = (isPositive: boolean) => {
    if (isMuted) return;
    const sound = isPositive ? hitPositiveAudioRef.current : hitNegativeAudioRef.current;
    if (sound) {
      sound.play();
    }
  };

  // --- [Game Logic] ---
  const spawnPill = useCallback(() => {
    const activeConfigs = pillConfigs.filter(p => p.enabled !== false);
    if (activeConfigs.length === 0) return;
    
    // Weighted random selection based on spawnChance
    const totalChance = activeConfigs.reduce((sum, p) => sum + (p.spawnChance || 10), 0);
    let random = Math.random() * totalChance;
    let config = activeConfigs[0];
    
    for (const p of activeConfigs) {
      if (random < (p.spawnChance || 10)) {
        config = p;
        break;
      }
      random -= (p.spawnChance || 10);
    }

    const width = config.size?.[0] || (config.type === 'good' ? 80 : 70);
    const height = config.size?.[1] || (config.type === 'good' ? 40 : 70);

    // Calculate safe bounds considering rotation and screen width
    const containerWidth = containerRef.current?.clientWidth || window.innerWidth;
    const maxDim = Math.max(width, height);
    const safeMargin = 20; // Extra buffer
    
    // Ensure we don't have negative range if pill is too wide
    const availableWidth = containerWidth - width - (safeMargin * 2);
    let x;
    if (availableWidth > 0) {
      x = safeMargin + Math.random() * availableWidth;
    } else {
      // If pill is wider than screen (unlikely but safe), center it
      x = (containerWidth - width) / 2;
    }

    const newPill: PillInstance = {
      id: pillIdCounter.current++,
      configId: config.id,
      type: config.type,
      label: config.label,
      color: config.color,
      image: config.image,
      score: config.score,
      width,
      height,
      x,
      y: -maxDim, // Start just above the screen based on its size
      speed: Math.random() * 2 + currentBaseSpeed.current,
      angle: 0,
      rotSpeed: (Math.random() - 0.5) * 4,
    };
    setPills(prev => [...prev, newPill]);
  }, [pillConfigs]);

  const handleHit = useCallback((pill: PillInstance, e: React.MouseEvent | React.TouchEvent) => {
    let earned = pill.score;
    if (pill.type === 'good') {
      setCombo(prev => {
        const next = prev + 1;
        earned += Math.floor(next / 5) * 2;
        return next;
      });
    } else {
      setCombo(0);
    }

    playHitSound(earned >= 0); // 점수에 따라 다른 타격음 재생 (주석: 나중에 사운드 파일 교체 가능)
    
    let clientX, clientY;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    setScore(prev => prev + earned);
    
    const newPopup: Popup = {
      id: popupIdCounter.current++,
      text: earned > 0 ? `+${earned}` : `${earned}`,
      x: clientX,
      y: clientY,
      color: pill.color,
    };
    setPopups(prev => [...prev, newPopup]);
    setTimeout(() => setPopups(prev => prev.filter(p => p.id !== newPopup.id)), 800);
    setPills(prev => prev.filter(p => p.id !== pill.id));
  }, []);

  useEffect(() => {
    if (gameState !== 'playing') return;

    const update = (time: number) => {
      const spawnRate = Math.max(250, 900 - (gameSpeed.duration - timeLeft) * 12);
      if (time - lastSpawnTime.current > spawnRate) {
        spawnPill();
        lastSpawnTime.current = time;
      }

      setPills(prev => {
        const nextPills: PillInstance[] = [];
        prev.forEach(pill => {
          const nextY = pill.y + pill.speed;
          const containerHeight = containerRef.current?.clientHeight || window.innerHeight;
          if (nextY < containerHeight) {
            nextPills.push({ ...pill, y: nextY, angle: pill.angle + pill.rotSpeed });
          } else if (pill.type === 'good') {
            setCombo(0);
          }
        });
        return nextPills;
      });

      gameLoopRef.current = requestAnimationFrame(update);
    };

    gameLoopRef.current = requestAnimationFrame(update);
    return () => { if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current); };
  }, [gameState, timeLeft, spawnPill]);

  useEffect(() => {
    if (gameState !== 'playing') return;
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          setGameState('end');
          return 0;
        }
        currentBaseSpeed.current += gameSpeed.increment;
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [gameState, gameSpeed.increment]);

  const fetchAdminStats = async () => {
    if (!user || user.email !== 'jsj20210104@gmail.com') return;
    try {
      const q = query(collection(db, 'visits'), orderBy('date', 'desc'), limit(60));
      const querySnapshot = await getDocs(q);
      const stats = querySnapshot.docs.map(doc => doc.data() as VisitData);
      setVisitStats(stats);
    } catch (error) {
      console.error("Admin fetch failed:", error);
    }
  };

  const startGame = async () => {
    // Resume AudioContext on user gesture to "unlock" audio on mobile
    if (Howler.ctx && (Howler.ctx.state === 'suspended')) {
      try {
        await Howler.ctx.resume();
      } catch (e) {
        console.warn("AudioContext unlock failed:", e);
      }
    }

    setScore(0);
    setCombo(0);
    setTimeLeft(gameSpeed.duration); // 게임 총 시간 설정 (관리자 페이지에서 조절 가능)
    setPills([]);
    setPopups([]);
    currentBaseSpeed.current = gameSpeed.base;
    setGameState('playing');
  };

  const getEndingLevel = () => {
    if (score >= 1000) return { level: 5, text: "레전드👍 의약품 안전 마스터! 🏆", img: ENDING_IMAGES.LEVEL_5 };
    if (score >= 600) return { level: 4, text: "진정한 의약품 안전 관리 전문가! ✨", img: ENDING_IMAGES.LEVEL_4 };
    if (score >= 300) return { level: 3, text: "안전 수칙의 모범생! 👍", img: ENDING_IMAGES.LEVEL_3 };
    if (score >= 100) return { level: 2, text: "조금 더 주의가 필요해요! 😊", img: ENDING_IMAGES.LEVEL_2 };
    return { level: 1, text: "의약품 안전 공부가 시급합니다! ⚠️", img: ENDING_IMAGES.LEVEL_1 };
  };

  const saveGameSettings = async () => {
    if (!user || user.email !== 'jsj20210104@gmail.com') return;
    setIsSavingSettings(true);
    try {
      // Sanitize data to avoid undefined values which Firestore doesn't allow
      const configData = {
        pillConfigs: pillConfigs.map(p => ({
          ...p,
          image: p.image || null,
          spawnChance: p.spawnChance || 10
        })),
        gameSpeed: {
          base: gameSpeed.base || 2.5,
          increment: gameSpeed.increment || 0.06,
          duration: gameSpeed.duration || 60
        },
        openingBgImage: openingBgImage || null,
        startButtonImage: startButtonImage || null,
        audioSettings: {
          opening: audioSettings.opening || null,
          gameplay: audioSettings.gameplay || null,
          hitPositive: audioSettings.hitPositive || null,
          hitNegative: audioSettings.hitNegative || null,
          ending: audioSettings.ending || null,
          volume: audioSettings.volume || 0.7
        },
        updatedAt: serverTimestamp()
      };

      await setDoc(doc(db, 'settings', 'gameConfig'), configData);
      alert("설정이 저장되었습니다!");
    } catch (error) {
      console.error("Failed to save settings:", error);
      alert("저장에 실패했습니다.");
    } finally {
      setIsSavingSettings(false);
    }
  };

  const updatePillScore = (id: number, score: number) => {
    setPillConfigs(prev => prev.map(p => p.id === id ? { ...p, score } : p));
  };

  const updatePillLabel = (id: number, label: string) => {
    setPillConfigs(prev => prev.map(p => p.id === id ? { ...p, label } : p));
  };

  const updatePillSize = (id: number, width: number, height: number) => {
    setPillConfigs(prev => prev.map(p => p.id === id ? { ...p, size: [width, height] } : p));
  };

  const updatePillImage = (id: number, image: string) => {
    setPillConfigs(prev => prev.map(p => p.id === id ? { ...p, image: image || undefined } : p));
  };

  const updatePillChance = (id: number, spawnChance: number) => {
    setPillConfigs(prev => prev.map(p => p.id === id ? { ...p, spawnChance } : p));
  };

  const movePill = (id: number, direction: 'up' | 'down') => {
    setPillConfigs(prev => {
      const index = prev.findIndex(p => p.id === id);
      if (index === -1) return prev;
      if (direction === 'up' && index === 0) return prev;
      if (direction === 'down' && index === prev.length - 1) return prev;

      const newConfigs = [...prev];
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      [newConfigs[index], newConfigs[targetIndex]] = [newConfigs[targetIndex], newConfigs[index]];
      return newConfigs;
    });
  };

  const togglePillEnabled = (id: number) => {
    setPillConfigs(prev => prev.map(p => p.id === id ? { ...p, enabled: !p.enabled } : p));
  };

  const updatePillType = (id: number, type: 'good' | 'bad' | 'misuse') => {
    setPillConfigs(prev => prev.map(p => p.id === id ? { ...p, type } : p));
  };

  const updatePillColor = (id: number, color: string) => {
    setPillConfigs(prev => prev.map(p => p.id === id ? { ...p, color } : p));
  };

  const addPill = () => {
    const nextId = Math.max(0, ...pillConfigs.map(p => p.id)) + 1;
    const newPill = {
      id: nextId,
      type: 'good' as const,
      label: "새 약물",
      score: 10,
      size: [80, 40] as [number, number],
      image: undefined,
      color: "#3498db",
      enabled: true
    };
    setPillConfigs(prev => [...prev, newPill]);
  };

  const removePill = (id: number) => {
    if (pillConfigs.length <= 1) {
      alert("최소 한 개의 약물은 있어야 합니다.");
      return;
    }
    if (confirm("정말 이 약물을 삭제하시겠습니까?")) {
      setPillConfigs(prev => prev.filter(p => p.id !== id));
    }
  };

  const resetAudioSettings = () => {
    setAudioSettings({
      opening: 'https://cdn.jsdelivr.net/gh/alt9874/game@main/opening.mp3',
      gameplay: 'https://cdn.jsdelivr.net/gh/alt9874/game@main/main.mp3',
      hitPositive: 'https://cdn.jsdelivr.net/gh/alt9874/game@main/win.mp3',
      hitNegative: 'https://cdn.jsdelivr.net/gh/alt9874/game@main/error.mp3',
      ending: 'https://cdn.jsdelivr.net/gh/alt9874/game@main/ending.mp3',
      volume: 0.7
    });
  };

  const handleFileUpload = async (file: File, callback: (url: string) => void) => {
    // 파일 크기 제한 (Firestore 문서 크기 제한 1MB 고려하여 500KB로 제한)
    const MAX_FILE_SIZE = 500 * 1024; // 500KB
    if (file.size > MAX_FILE_SIZE) {
      alert("파일 크기가 너무 큽니다. 500KB 이하의 이미지만 업로드 가능합니다. 더 큰 이미지는 외부 URL을 사용해 주세요.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result;
      if (typeof result === 'string') {
        callback(result);
        alert("이미지가 성공적으로 로드되었습니다. '설정 저장' 버튼을 눌러야 최종 반영됩니다.");
      }
    };
    reader.onerror = () => {
      alert("파일을 읽는 중 오류가 발생했습니다.");
    };
    reader.readAsDataURL(file);
  };

  const resetVisitStats = async () => {
    if (!user || user.email !== 'jsj20210104@gmail.com') return;
    if (!confirm("정말 모든 방문자 데이터를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.")) return;

    try {
      const q = query(collection(db, 'visits'));
      const querySnapshot = await getDocs(q);
      
      const deletePromises = querySnapshot.docs.map(d => deleteDoc(doc(db, 'visits', d.id)));
      await Promise.all(deletePromises);
      
      setVisitStats([]);
      setTotalVisits(0);
      alert("모든 방문자 데이터가 리셋되었습니다.");
    } catch (error) {
      console.error("Failed to reset stats:", error);
      alert("데이터 리셋 중 오류가 발생했습니다.");
    }
  };

  const downloadStatsExcel = () => {
    if (visitStats.length === 0) return;
    
    const data = visitStats.map(stat => {
      const referrerDetails = Object.entries(stat.referrers)
        .map(([ref, count]) => `${ref.replace(/_/g, '.')}: ${count}`)
        .join(', ');
      
      const ipDetails = stat.ips 
        ? Object.entries(stat.ips)
            .map(([ip, count]) => `${ip.replace(/_/g, '.')}: ${count}`)
            .join(', ')
        : '기록 없음';
      
      return {
        '날짜': stat.date,
        '총 유입수': stat.count,
        '상세 유입 경로 (경로: 건수)': referrerDetails,
        '접속 IP 내역 (IP: 건수)': ipDetails
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "유입로그");
    
    // Generate buffer and trigger download
    XLSX.writeFile(workbook, `safe-touch-stats-${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const testSound = (url: string) => {
    if (!url) return;
    const sound = new Howl({
      src: [url],
      html5: false, // 하드웨어 무음 스위치 대응
      volume: audioSettings.volume || 0.7,
      mute: isMuted,
      onplayerror: () => {
        alert("소리 재생에 실패했습니다. 파일 형식을 확인해 주세요. (MP3 권장)");
      },
      onloaderror: () => {
        alert("소리 로딩에 실패했습니다. URL을 확인해 주세요.");
      }
    });
    sound.play();
  };

  return (
    <div ref={containerRef} className="relative w-full h-[100svh] overflow-hidden font-sans bg-[#f0f7ff]">
      <AnimatePresence mode="wait">
      {/* 1. 오프닝 화면 */}
      {gameState === 'start' && (
        <>
          {/* [나중에 이미지로 교체 예정: 오프닝 배경 이미지] */}
          {user ? (
            user.email === 'jsj20210104@gmail.com' && (
              <button onClick={() => { setGameState('admin'); fetchAdminStats(); }} className="fixed top-4 right-4 sm:top-6 sm:right-6 p-1.5 bg-black/5 backdrop-blur rounded-md text-gray-300 hover:text-primary transition-colors z-[310] mt-[env(safe-area-inset-top)] opacity-30">
                <Settings className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>
            )
          ) : (
            <button 
              onClick={handleLogin} 
              disabled={isLoggingIn}
              className={`fixed top-4 right-4 sm:top-6 sm:right-6 p-1.5 bg-black/5 backdrop-blur rounded-md text-gray-300 hover:text-primary transition-colors z-[310] mt-[env(safe-area-inset-top)] opacity-30 ${isLoggingIn ? 'animate-pulse cursor-not-allowed' : ''}`}
            >
              <Settings className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>
          )}
          {/* 
            [반응형 배경 이미지 설정 가이드]
            - PC 권장 사이즈: 1920 x 1080 (16:9 비율)
            - 모바일 권장 사이즈: 1080 x 1920 (9:16 비율)
            - 모든 기기 대응 전략: 'background-size: cover'를 사용하여 이미지가 화면을 꽉 채우도록 하고, 
              중요한 피사체는 이미지 중앙에 배치하는 것이 좋습니다.
          */}
          <motion.div key="start" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} 
            className="fixed inset-0 flex flex-col items-center justify-between z-[200] text-center p-6 sm:p-12 overflow-hidden pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
          >
            {/* Responsive Background Images */}
            <div 
              className="absolute inset-0 bg-cover bg-center z-[-1] hidden sm:block" 
              style={{ backgroundImage: (openingBgImage && openingBgImage.trim() !== "") ? `url(${openingBgImage})` : `url(${OPENING_BG_IMAGE_PC})` }} 
            />
            <div 
              className="absolute inset-0 bg-cover bg-center z-[-1] block sm:hidden" 
              style={{ backgroundImage: (openingBgImage && openingBgImage.trim() !== "") ? `url(${openingBgImage})` : `url(${OPENING_BG_IMAGE_MO})` }} 
            />
            {/* Overlay for readability if no image is set or as a fallback */}
            {(!(openingBgImage && openingBgImage.trim() !== "") && !OPENING_BG_IMAGE_PC) && <div className="absolute inset-0 bg-white/90 z-[-2]" />}
            
            {/* 1. 상단: 시작 버튼 (스케일 펄스 애니메이션) */}
            {/* [PC 버전 시작 버튼 위치 조정 주석]: 아래 top-[40%] 값을 조절하면 버튼의 높이가 변합니다. (예: top-[50%]) */}
            <div className="w-full flex justify-center pt-4 sm:pt-0 z-10 absolute top-[40%] -translate-y-1/2">
              <div className="flex flex-col items-center gap-4">
                <motion.button 
                  onClick={() => setGameState('how-to')} 
                  className="group relative"
                  animate={{ scale: [1, 1.05, 1] }}
                  transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                >
                    {/* 
                      이미지 로딩 전략:
                      1. DB에 저장된 커스텀 이미지가 있으면 그것을 먼저 시도.
                      2. 커스텀 이미지가 없거나 로딩에 실패하면 기본 상수(START_BUTTON_IMAGE)를 시도.
                      3. 둘 다 실패하면 텍스트 버튼으로 폴백.
                    */}
                    {(!btnImageError) ? (
                      <img 
                        src={(startButtonImage && startButtonImage.trim() !== "" && startButtonImage !== 'undefined') ? startButtonImage : START_BUTTON_IMAGE} 
                        alt="시작" 
                        className="w-[35vw] sm:w-[9vw] h-auto mx-auto hover:scale-110 transition-transform active:scale-95 drop-shadow-2xl" 
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          // 만약 커스텀 이미지가 실패한 거라면 기본 이미지로 교체 시도
                          if (startButtonImage && e.currentTarget.src !== START_BUTTON_IMAGE) {
                            e.currentTarget.src = START_BUTTON_IMAGE;
                          } else {
                            // 기본 이미지마저 실패하면 텍스트 버튼으로 전환
                            setBtnImageError(true);
                          }
                        }}
                      />
                    ) : (
                      <div className="px-8 py-3 sm:px-10 sm:py-4 bg-primary text-white text-lg sm:text-xl font-bold rounded-full shadow-2xl hover:bg-blue-600 transition-all flex items-center gap-3">
                        게임 시작 <ArrowRight className="w-5 h-5 sm:w-6 sm:h-6" />
                      </div>
                    )}
                </motion.button>
                
                {/* 브라우저 정책상 자동재생이 막혔을 때 보여주는 안내 메시지 */}
                {audioBlocked && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-2 px-3 py-1 bg-black/40 backdrop-blur-md rounded-full text-white text-[10px] sm:text-xs animate-bounce"
                  >
                    <Volume2 className="w-3 h-3" /> 화면을 클릭하면 배경음악이 시작됩니다
                  </motion.div>
                )}
              </div>
            </div>

            {/* 2. 중앙: 제목 및 로고 (배경 이미지가 없을 때만 표시) */}
            <div className="max-w-md w-full flex flex-col items-center justify-center z-10">
              {(!(openingBgImage && openingBgImage.trim() !== "") && !OPENING_BG_IMAGE_PC) && (
                <div className="mb-4">
                  <motion.div animate={{ y: [0, -10, 0] }} transition={{ repeat: Infinity, duration: 2 }}>
                    <PillIcon className="w-16 h-16 sm:w-24 sm:h-24 text-primary mx-auto mb-4" />
                  </motion.div>
                  <h1 className="text-3xl sm:text-6xl font-black text-gray-800 mb-2 sm:mb-4 tracking-tighter break-keep">안전한 손길</h1>
                  <p className="text-base sm:text-xl text-gray-500 font-medium break-keep">올바른 약 복용, 당신의 건강을 지킵니다.</p>
                </div>
              )}
            </div>

            {/* 3. 하단: 누적 방문자 카운터 */}
            <div className="w-full flex justify-center pb-8 sm:pb-12 z-10">
              <div className={`inline-flex items-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 rounded-full text-xs sm:text-sm font-bold shadow-lg ${(!(openingBgImage && openingBgImage.trim() !== "") && !OPENING_BG_IMAGE_PC) ? 'bg-gray-100 text-gray-500' : 'bg-black/50 text-white backdrop-blur-md border border-white/20'}`}>
                <BarChart2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> 누적 방문자: <span className="text-primary-foreground bg-primary px-2 py-0.5 rounded-full ml-1">{totalVisits.toLocaleString()}명</span>
              </div>
            </div>
          </motion.div>
          </>
        )}

        {/* 2. 게임 방법 설명 */}
        {gameState === 'how-to' && (
          <motion.div 
            key="how-to" 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }} 
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-[210] flex flex-col items-center justify-center p-3 sm:p-8 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
          >
            <div className="max-w-xl sm:max-w-5xl w-full bg-white rounded-[2.5rem] p-6 sm:p-10 shadow-[0_20px_60px_rgba(0,0,0,0.25)] flex flex-col gap-4 sm:gap-8 max-h-[95vh] overflow-hidden border border-white/20">
              {/* Header section */}
              <div className="text-center">
                <h2 className="text-xl sm:text-3xl font-black text-slate-800 tracking-tight">
                  게임 방법
                </h2>
              </div>

              {/* Items List Wrapper with internal scroll if needed */}
              <div className="flex-1 overflow-y-auto pr-1 -mr-1 custom-scrollbar">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 overflow-visible">
                  {pillConfigs.filter(p => p.enabled !== false).map((p) => (
                    <div key={p.id} className="flex items-center gap-2 sm:gap-4 p-2.5 sm:p-4 bg-slate-50/80 rounded-xl sm:rounded-2xl border border-slate-100 shadow-sm transition-all hover:bg-slate-100/50">
                      <div className="w-16 h-16 sm:w-28 sm:h-28 flex items-center justify-center shrink-0 bg-white rounded-lg sm:rounded-xl shadow-inner border border-slate-100">
                        {p.image ? (
                          <img src={p.image} alt={p.label} className="w-14 h-14 sm:w-24 sm:h-24 object-contain" referrerPolicy="no-referrer" />
                        ) : (
                          <div className="w-10 h-10 sm:w-16 sm:h-16 rounded-full shadow-sm" style={{ backgroundColor: p.color }} />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] sm:text-lg font-black text-slate-800 leading-tight truncate">{p.label}</div>
                        <div className={`text-[14px] sm:text-2xl font-black ${p.score > 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                          {p.score > 0 ? `+${p.score}` : p.score} <span className="text-[10px] sm:text-base font-bold opacity-80">점</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Footer section with Instruction and Button */}
              <div className="flex flex-col gap-4 sm:gap-6 border-t border-slate-100 pt-4 sm:pt-6">
                <div className="text-center">
                  <p className="text-slate-800 text-[13px] sm:text-3xl font-bold leading-relaxed break-keep">
                    <span className="text-emerald-700 font-black">올바른 의약품 안전정보</span>만 {gameSpeed.duration}초 안에 클릭하세요!
                  </p>
                </div>

                <button 
                  onClick={startGame} 
                  className="w-full py-4 sm:py-6 bg-slate-900 text-lg sm:text-3xl text-white font-black rounded-2xl sm:rounded-4xl hover:bg-emerald-600 transition-all shadow-xl active:translate-y-1 active:shadow-lg flex items-center justify-center gap-3 shrink-0"
                >
                  시작하기 <ArrowRight className="w-5 h-5 sm:w-9 sm:h-9" />
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* 3. 게임 화면 */}
        {gameState === 'playing' && (
          <div key="playing" className="relative w-full h-full">
            {/* Responsive Background Images for Gameplay */}
            <div 
              className="absolute inset-0 bg-cover bg-center z-0 hidden sm:block" 
              style={{ backgroundImage: `url(${PLAY_BG_IMAGE_PC})` }} 
            />
            <div 
              className="absolute inset-0 bg-cover bg-center z-0 block sm:hidden" 
              style={{ backgroundImage: `url(${PLAY_BG_IMAGE_MO})` }} 
            />
            
            <div className="fixed top-[calc(1rem+env(safe-area-inset-top))] left-4 right-4 sm:top-[calc(1.5rem+env(safe-area-inset-top))] sm:left-6 sm:right-6 z-50 flex justify-between items-start pointer-events-none">
              <div className="flex flex-col gap-2 pointer-events-auto">
                {/* [나중에 이미지로 교체 예정: 메인(홈) 버튼 이미지] */}
                <button onClick={() => setGameState('start')} className="bg-white/90 backdrop-blur px-3 py-2 sm:px-4 sm:py-3 rounded-xl sm:rounded-2xl shadow-xl border border-white hover:bg-white transition-all mb-1 sm:mb-2 flex items-center gap-2">
                  <Home className="w-5 h-5 sm:w-6 sm:h-6 text-gray-600" />
                  <span className="text-xs sm:text-sm font-bold text-gray-600">MAIN</span>
                </button>
                {/* [나중에 이미지로 교체 예정: 점수판 이미지] */}
                <div className="bg-white/90 backdrop-blur px-3 py-1.5 sm:px-6 sm:py-3 rounded-xl sm:rounded-2xl shadow-xl flex items-center border border-white w-[120px] sm:w-[180px]">
                  <Trophy className="w-5 h-5 sm:w-6 sm:h-6 text-yellow-500 shrink-0 mr-2 sm:mr-3" />
                  <span className="text-xl sm:text-2xl font-black text-gray-800 tabular-nums text-right flex-1">{score}</span>
                </div>
                <AnimatePresence>
                  {combo >= 2 && (
                    <motion.div initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -20, opacity: 0 }} className="text-orange-500 font-black text-lg sm:text-xl italic flex items-center gap-1">
                      <Zap className="w-4 h-4 sm:w-5 sm:h-5 fill-current" /> {combo} COMBO!
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              {/* [나중에 이미지로 교체 예정: 남은 시간(초) 판 이미지] */}
              <div className="bg-white/90 backdrop-blur px-3 py-1.5 sm:px-6 sm:py-3 rounded-xl sm:rounded-2xl shadow-xl flex items-center border border-white w-[100px] sm:w-[140px]">
                <Timer className="w-5 h-5 sm:w-6 sm:h-6 text-primary shrink-0 mr-2 sm:mr-3" />
                <span className="text-xl sm:text-2xl font-black text-primary tabular-nums text-right flex-1">{timeLeft}s</span>
              </div>
            </div>

            {pills.map(pill => (
              <motion.div key={pill.id} onMouseDown={(e) => handleHit(pill, e)} onTouchStart={(e) => handleHit(pill, e)}
                className={`absolute cursor-pointer flex items-center justify-center text-white font-bold text-xs text-center ${!pill.image ? 'p-2 shadow-lg border-2 border-white/30' : ''}`}
                style={{ 
                  left: pill.x, 
                  top: pill.y, 
                  width: pill.width, 
                  height: pill.height, 
                  backgroundColor: pill.image ? 'transparent' : pill.color, 
                  transform: `rotate(${pill.angle}deg)`, 
                  borderRadius: pill.image ? '0' : (pill.type === 'good' || pill.label === '중복 복용' ? '25px' : '50%') 
                }}>
                {/* [나중에 이미지로 교체 예정: 약물(Pill) 이미지] */}
                {pill.image ? <img src={pill.image} alt={pill.label} className="w-full h-full object-contain" referrerPolicy="no-referrer" /> : pill.label}
              </motion.div>
            ))}

            {popups.map(popup => (
              <div key={popup.id} className="score-popup" style={{ left: popup.x, top: popup.y, color: popup.color }}>{popup.text}</div>
            ))}
          </div>
        )}

        {/* 4. 엔딩 화면 */}
        {gameState === 'end' && (
          <motion.div key="end" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="fixed inset-0 bg-white z-[220] flex flex-col items-center justify-center p-4 sm:p-6 text-center overflow-y-auto pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
            <div className="max-w-md w-full py-8">
              {getEndingLevel().img ? (
                <img src={getEndingLevel().img} alt="결과" className="w-full h-40 sm:h-64 object-cover rounded-3xl mb-4 sm:mb-8 shadow-2xl" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-full h-32 sm:h-48 bg-gray-100 rounded-3xl flex items-center justify-center mb-4 sm:mb-8 border-4 border-dashed border-gray-200">
                  <span className="text-gray-300 font-bold">엔딩 이미지 (Level {getEndingLevel().level})</span>
                </div>
              )}
              <h3 className="text-lg sm:text-2xl font-bold text-gray-400 mb-1 sm:mb-2">당신의 등급</h3>
              <h2 className="text-2xl sm:text-4xl font-black text-gray-800 mb-4 sm:mb-6 break-keep">{getEndingLevel().text}</h2>
              <div className="bg-primary/10 p-4 sm:p-6 rounded-2xl mb-6 sm:mb-10">
                <p className="text-primary font-bold text-sm sm:text-lg mb-1">최종 점수</p>
                <p className="text-3xl sm:text-5xl font-black text-primary">{score}점</p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mb-6">
                {/* [나중에 이미지로 교체 예정: '처음으로' 버튼 이미지 / 권장 크기: 240x100px] */}
                <button onClick={() => setGameState('start')} className="flex-1 py-3 sm:py-4 bg-gray-100 text-gray-600 font-bold rounded-xl hover:bg-gray-200 transition-colors flex items-center justify-center gap-2 overflow-hidden">
                  {/* <img src="이미지_주소_입력" alt="처음으로" className="w-full h-full object-contain" /> */}
                  <Home className="w-5 h-5" /> 처음으로
                </button>

                {/* [나중에 이미지로 교체 예정: '다시 도전하기' 버튼 이미지 / 권장 크기: 480x100px] */}
                <button onClick={startGame} className="flex-1 py-3 sm:py-4 bg-primary text-white font-bold rounded-xl hover:bg-blue-600 shadow-lg transition-all overflow-hidden">
                  {/* <img src="이미지_주소_입력" alt="다시 도전하기" className="w-full h-full object-contain" /> */}
                  다시 도전하기
                </button>
              </div>

              <a 
                href="https://www.drugsafe.or.kr/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="w-full transition-all flex items-center justify-center group overflow-hidden"
              >
                <img src="https://raw.githubusercontent.com/alt9874/game/main/logo.png" alt="한국의약품안전관리원" className="w-full h-full object-contain" />
              </a>
            </div>
          </motion.div>
        )}

        {/* 5. 관리자 페이지 */}
        {gameState === 'admin' && (
          <motion.div key="admin" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 bg-gray-900 text-white z-[300] overflow-y-auto p-4 sm:p-8 pt-[calc(1rem+env(safe-area-inset-top))] pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <div className="max-w-4xl mx-auto">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8 sm:mb-12">
                <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-3"><BarChart2 className="w-6 h-6 sm:w-8 sm:h-8" /> 관리자 대시보드</h1>
                <button onClick={() => setGameState('start')} className="px-4 py-2 bg-white/10 rounded-lg hover:bg-white/20 text-sm">나가기</button>
              </div>
              
              {!user ? (
                <div className="flex flex-col items-center justify-center py-20 bg-white/5 rounded-3xl border border-white/10">
                  <Settings className="w-16 h-16 text-gray-600 mb-6" />
                  <h2 className="text-2xl font-bold mb-4">관리자 인증이 필요합니다</h2>
                  <button 
                    onClick={handleLogin} 
                    disabled={isLoggingIn}
                    className={`px-8 py-3 bg-primary text-white font-bold rounded-xl hover:bg-blue-600 transition-all ${isLoggingIn ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {isLoggingIn ? "로그인 중..." : "Google로 로그인"}
                  </button>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                    <div className="bg-white/5 p-6 rounded-2xl border border-white/10">
                      <p className="text-gray-400 text-sm mb-1">누적 방문자</p>
                      <p className="text-4xl font-bold">{visitStats.reduce((acc, curr) => acc + curr.count, 0)}</p>
                    </div>
                    <div className="bg-white/5 p-6 rounded-2xl border border-white/10">
                      <p className="text-gray-400 text-sm mb-1">오늘 방문자</p>
                      <p className="text-4xl font-bold">{visitStats[0]?.count || 0}</p>
                    </div>
                    <div className="bg-white/5 p-6 rounded-2xl border border-white/10">
                      <p className="text-gray-400 text-sm mb-1">기록된 일수</p>
                      <p className="text-4xl font-bold">{visitStats.length}일</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
                    {/* Speed Settings */}
                    <div className="bg-white/5 p-6 rounded-2xl border border-white/10">
                      <h2 className="text-xl font-bold mb-6 flex items-center gap-2"><Zap className="w-5 h-5 text-yellow-500" /> 게임 속도 설정</h2>
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm text-gray-400 mb-1">초기 속도 (기본: 2.5)</label>
                          <input type="number" step="0.1" value={isNaN(gameSpeed.base) ? '' : gameSpeed.base} onChange={(e) => setGameSpeed(prev => ({ ...prev, base: parseFloat(e.target.value) }))}
                            className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white" />
                        </div>
                        <div>
                          <label className="block text-sm text-gray-400 mb-1">초당 속도 증가량 (기본: 0.06)</label>
                          <input type="number" step="0.01" value={isNaN(gameSpeed.increment) ? '' : gameSpeed.increment} onChange={(e) => setGameSpeed(prev => ({ ...prev, increment: parseFloat(e.target.value) }))}
                            className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white" />
                        </div>
                      </div>
                    </div>

                    {/* Pill Score Settings */}
                    <div className="bg-white/5 p-6 rounded-2xl border border-white/10">
                      <div className="flex justify-between items-center mb-6">
                        <h2 className="text-xl font-bold flex items-center gap-2"><PillIcon className="w-5 h-5 text-primary" /> 약물 종류, 점수 및 이미지 설정</h2>
                        <button onClick={addPill} className="px-3 py-1 bg-primary/20 border border-primary/30 rounded-lg text-xs text-primary hover:bg-primary/30 transition-colors flex items-center gap-1">
                          <Plus className="w-3 h-3" /> 약물 추가
                        </button>
                      </div>

                      {/* GitHub Asset Guide */}
                      <div className="mb-6 bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
                        <h3 className="text-xs font-bold text-blue-400 mb-2 flex items-center gap-2">
                          <Info className="w-3.5 h-3.5" /> 깃허브(GitHub) 이미지 사용 가이드
                        </h3>
                        <p className="text-[10px] text-gray-400 leading-relaxed">
                          직접 깃허브에 올린 이미지를 사용하려면 <b>Raw 주소</b>를 입력해야 합니다.<br/>
                          예: <code className="text-blue-300">https://raw.githubusercontent.com/사용자/저장소/main/이미지.png</code><br/>
                          이미지 주소창에 주소를 직접 붙여넣고 <b>[설정 저장]</b>을 누르세요. (직접 업로드 버튼도 계속 사용 가능합니다.)
                        </p>
                      </div>

                      <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                        {pillConfigs.map((p, index) => (
                          <div key={p.id} className="bg-white/5 p-4 rounded-xl space-y-3 border border-white/5 relative group transition-all hover:bg-white/10">
                            {/* Reordering and Delete Controls */}
                            <div className="absolute top-3 right-3 flex items-center gap-2 bg-black/40 px-2 py-1 rounded-lg backdrop-blur-sm border border-white/10">
                              <div className="flex items-center border-r border-white/10 pr-1 mr-1">
                                <button 
                                  onClick={() => movePill(p.id, 'up')} 
                                  disabled={index === 0} 
                                  className="p-1.5 text-gray-400 hover:text-emerald-400 disabled:opacity-20 transition-all hover:scale-110"
                                  title="위로 이동"
                                >
                                  <ChevronUp className="w-5 h-5" />
                                </button>
                                <button 
                                  onClick={() => movePill(p.id, 'down')} 
                                  disabled={index === pillConfigs.length - 1} 
                                  className="p-1.5 text-gray-400 hover:text-emerald-400 disabled:opacity-20 transition-all hover:scale-110"
                                  title="아래로 이동"
                                >
                                  <ChevronDown className="w-5 h-5" />
                                </button>
                              </div>
                              <button 
                                onClick={() => removePill(p.id)} 
                                className="p-1.5 text-gray-500 hover:text-rose-500 transition-all hover:scale-110"
                                title="삭제"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-white/5 rounded-lg border border-white/10 flex items-center justify-center overflow-hidden">
                                  {p.image ? (
                                    <img src={p.image} alt="" className="max-w-full max-h-full object-contain" referrerPolicy="no-referrer" />
                                  ) : (
                                    <div className="w-4 h-4 rounded-full" style={{ backgroundColor: p.color }} />
                                  )}
                                </div>
                                <div className="flex flex-col">
                                  <div className="flex items-center gap-2 mb-1">
                                    <input type="checkbox" checked={p.enabled !== false} onChange={() => togglePillEnabled(p.id)}
                                      className="w-4 h-4 rounded accent-primary cursor-pointer" />
                                    <select 
                                      value={p.type} 
                                      onChange={(e) => updatePillType(p.id, e.target.value as any)}
                                      disabled={p.enabled === false}
                                      className="bg-white/10 border border-white/20 rounded px-1 py-0.5 text-[10px] text-white outline-none focus:border-primary/50 disabled:opacity-30"
                                    >
                                      <option value="good" className="bg-gray-800">긍정 (+)</option>
                                      <option value="bad" className="bg-gray-800">주의 (!)</option>
                                      <option value="misuse" className="bg-gray-800">부정 (-)</option>
                                    </select>
                                  </div>
                                  <input type="text" value={p.label} onChange={(e) => updatePillLabel(p.id, e.target.value)}
                                    disabled={p.enabled === false}
                                    className={`font-bold bg-transparent border-b border-transparent focus:border-primary/50 outline-none transition-all text-sm ${p.enabled === false ? 'text-gray-600 line-through' : 'text-white'}`} />
                                </div>
                              </div>
                              <div className="flex items-center gap-4">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-gray-500">크기(W/H):</span>
                                  <input type="number" value={isNaN(p.size?.[0] as number) ? '' : (p.size?.[0] || 80)} onChange={(e) => updatePillSize(p.id, parseInt(e.target.value), p.size?.[1] || 40)}
                                    disabled={p.enabled === false}
                                    className="w-12 bg-white/10 border border-white/20 rounded-lg px-2 py-1 text-right text-white disabled:opacity-30" />
                                  <span className="text-xs text-gray-500">x</span>
                                  <input type="number" value={isNaN(p.size?.[1] as number) ? '' : (p.size?.[1] || 40)} onChange={(e) => updatePillSize(p.id, p.size?.[0] || 80, parseInt(e.target.value))}
                                    disabled={p.enabled === false}
                                    className="w-12 bg-white/10 border border-white/20 rounded-lg px-2 py-1 text-right text-white disabled:opacity-30" />
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-gray-500">점수:</span>
                                  <input type="number" value={isNaN(p.score) ? '' : p.score} onChange={(e) => updatePillScore(p.id, parseInt(e.target.value))}
                                    disabled={p.enabled === false}
                                    className="w-16 bg-white/10 border border-white/20 rounded-lg px-2 py-1 text-right text-white disabled:opacity-30" />
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-gray-500">빈도:</span>
                                  <input type="number" value={isNaN(p.spawnChance as number) ? '' : (p.spawnChance || 10)} onChange={(e) => updatePillChance(p.id, parseInt(e.target.value))}
                                    disabled={p.enabled === false}
                                    className="w-12 bg-white/10 border border-white/20 rounded-lg px-2 py-1 text-right text-primary font-bold disabled:opacity-30" />
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-gray-500">색상:</span>
                                  <input type="color" value={p.color} onChange={(e) => updatePillColor(p.id, e.target.value)}
                                    disabled={p.enabled === false}
                                    className="w-8 h-8 bg-transparent border-none cursor-pointer disabled:opacity-30" />
                                </div>
                              </div>
                            </div>
                            <div className="flex flex-col gap-1">
                              <label className="text-[10px] text-gray-500 uppercase tracking-wider">이미지 설정 (URL 또는 파일 업로드)</label>
                              <div className="flex gap-2">
                                <input type="text" placeholder="https://..." value={p.image || ''} 
                                  onChange={(e) => updatePillImage(p.id, e.target.value)}
                                  disabled={p.enabled === false}
                                  className="flex-1 bg-white/10 border border-white/20 rounded-lg px-3 py-1.5 text-xs text-gray-300 placeholder:text-gray-700 disabled:opacity-30" />
                                <label className="cursor-pointer px-3 py-1.5 bg-white/10 border border-white/20 rounded-lg text-[10px] hover:bg-white/20 transition-colors flex items-center">
                                  업로드
                                  <input type="file" className="hidden" accept="image/*" onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) handleFileUpload(file, (url) => updatePillImage(p.id, url));
                                  }} />
                                </label>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      <p className="mt-4 text-xs text-gray-500">* 체크 해제된 약물은 게임에 등장하지 않습니다.</p>
                    </div>
                  </div>

                  {/* Game Speed & Duration Settings */}
                  <div className="bg-white/5 p-6 rounded-2xl border border-white/10 mb-12">
                    <h2 className="text-xl font-bold mb-6 flex items-center gap-2"><Zap className="w-5 h-5 text-yellow-500" /> 게임 속도 및 시간 설정</h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div>
                        <label className="block text-sm text-gray-400 mb-2">기본 속도 (시작 시 속도)</label>
                        <input type="number" step="0.1" value={isNaN(gameSpeed.base) ? '' : gameSpeed.base} onChange={(e) => setGameSpeed(prev => ({ ...prev, base: parseFloat(e.target.value) }))}
                          className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-sm text-white" />
                        <p className="mt-1 text-[10px] text-gray-500">* 숫자가 클수록 약물이 빠르게 떨어집니다. (기본값: 2.5)</p>
                      </div>
                      <div>
                        <label className="block text-sm text-gray-400 mb-2">속도 증가량 (초당 증가)</label>
                        <input type="number" step="0.01" value={isNaN(gameSpeed.increment) ? '' : gameSpeed.increment} onChange={(e) => setGameSpeed(prev => ({ ...prev, increment: parseFloat(e.target.value) }))}
                          className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-sm text-white" />
                        <p className="mt-1 text-[10px] text-gray-500">* 매초마다 기본 속도에 더해지는 값입니다. (기본값: 0.06)</p>
                      </div>
                      <div>
                        <label className="block text-sm text-gray-400 mb-2">총 게임 시간 (초)</label>
                        <input type="number" value={isNaN(gameSpeed.duration) ? '' : gameSpeed.duration} onChange={(e) => setGameSpeed(prev => ({ ...prev, duration: parseInt(e.target.value) }))}
                          className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-sm text-white" />
                        <p className="mt-1 text-[10px] text-gray-500">* 게임이 지속되는 총 시간입니다. (기본값: 60)</p>
                      </div>
                    </div>
                  </div>

                  {/* Background & Button Image Settings */}
                  <div className="bg-white/5 p-6 rounded-2xl border border-white/10 mb-12">
                    <h2 className="text-xl font-bold mb-6 flex items-center gap-2"><Settings className="w-5 h-5 text-purple-500" /> 배경 및 버튼 이미지 설정</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label className="block text-sm text-gray-400 mb-2">오프닝 배경 이미지</label>
                        <div className="flex gap-2">
                          <input type="text" placeholder="URL 입력" value={openingBgImage || ''} onChange={(e) => setOpeningBgImage(e.target.value || undefined)}
                            className="flex-1 bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-xs text-gray-300" />
                          <label className="cursor-pointer px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-xs hover:bg-white/20 transition-colors flex items-center">
                            업로드
                            <input type="file" className="hidden" accept="image/*" onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleFileUpload(file, (url) => setOpeningBgImage(url));
                            }} />
                          </label>
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm text-gray-400 mb-2">시작 버튼 이미지</label>
                        <div className="flex gap-2">
                          <input type="text" placeholder="URL 입력" value={startButtonImage || ''} onChange={(e) => setStartButtonImage(e.target.value || undefined)}
                            className="flex-1 bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-xs text-gray-300" />
                          <label className="cursor-pointer px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-xs hover:bg-white/20 transition-colors flex items-center">
                            업로드
                            <input type="file" className="hidden" accept="image/*" onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleFileUpload(file, (url) => setStartButtonImage(url));
                            }} />
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white/5 p-6 rounded-2xl border border-white/10 mb-12">
                    <div className="flex justify-between items-center mb-6">
                      <h2 className="text-xl font-bold flex items-center gap-2"><Volume2 className="w-5 h-5 text-green-500" /> 배경음악 및 효과음 설정</h2>
                      <button onClick={resetAudioSettings} className="px-3 py-1 bg-white/10 border border-white/20 rounded-lg text-[10px] hover:bg-white/20 transition-colors">
                        기본음으로 초기화
                      </button>
                    </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                        <div>
                          <label className="block text-sm text-gray-400 mb-1">오프닝 BGM (첫 화면)</label>
                          <div className="flex gap-2">
                            <input type="text" value={audioSettings.opening} onChange={(e) => setAudioSettings(prev => ({ ...prev, opening: e.target.value }))}
                              className="flex-1 bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-[10px] text-gray-300" />
                            <button onClick={() => testSound(audioSettings.opening)} className="px-2 py-1 bg-white/5 border border-white/10 rounded text-[10px] hover:bg-white/10">▶</button>
                            <label className="cursor-pointer px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-[10px] hover:bg-white/20 transition-colors flex items-center">
                              업로드
                              <input type="file" className="hidden" accept="audio/*" onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleFileUpload(file, (url) => setAudioSettings(prev => ({ ...prev, opening: url })));
                              }} />
                            </label>
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm text-gray-400 mb-1">게임 배경음 (플레이 중)</label>
                          <div className="flex gap-2">
                            <input type="text" value={audioSettings.gameplay} onChange={(e) => setAudioSettings(prev => ({ ...prev, gameplay: e.target.value }))}
                              className="flex-1 bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-[10px] text-gray-300" />
                            <button onClick={() => testSound(audioSettings.gameplay)} className="px-2 py-1 bg-white/5 border border-white/10 rounded text-[10px] hover:bg-white/10">▶</button>
                            <label className="cursor-pointer px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-[10px] hover:bg-white/20 transition-colors flex items-center">
                              업로드
                              <input type="file" className="hidden" accept="audio/*" onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleFileUpload(file, (url) => setAudioSettings(prev => ({ ...prev, gameplay: url })));
                              }} />
                            </label>
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm text-gray-400 mb-1">엔딩 BGM (결과 화면)</label>
                          <div className="flex gap-2">
                            <input type="text" value={audioSettings.ending} onChange={(e) => setAudioSettings(prev => ({ ...prev, ending: e.target.value }))}
                              className="flex-1 bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-[10px] text-gray-300" />
                            <button onClick={() => testSound(audioSettings.ending)} className="px-2 py-1 bg-white/5 border border-white/10 rounded text-[10px] hover:bg-white/10">▶</button>
                            <label className="cursor-pointer px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-[10px] hover:bg-white/20 transition-colors flex items-center">
                              업로드
                              <input type="file" className="hidden" accept="audio/*" onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleFileUpload(file, (url) => setAudioSettings(prev => ({ ...prev, ending: url })));
                              }} />
                            </label>
                          </div>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                      <div>
                        <label className="block text-sm text-gray-400 mb-1">약물 터치 효과음 (+점수)</label>
                        <div className="flex gap-2">
                          <input type="text" value={audioSettings.hitPositive} onChange={(e) => setAudioSettings(prev => ({ ...prev, hitPositive: e.target.value }))}
                            className="flex-1 bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-[10px] text-gray-300" />
                          <button onClick={() => testSound(audioSettings.hitPositive)} className="px-2 py-1 bg-white/5 border border-white/10 rounded text-[10px] hover:bg-white/10">▶</button>
                          <label className="cursor-pointer px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-[10px] hover:bg-white/20 transition-colors flex items-center">
                            업로드
                            <input type="file" className="hidden" accept="audio/*" onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleFileUpload(file, (url) => setAudioSettings(prev => ({ ...prev, hitPositive: url })));
                            }} />
                          </label>
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm text-gray-400 mb-1">약물 터치 효과음 (-점수)</label>
                        <div className="flex gap-2">
                          <input type="text" value={audioSettings.hitNegative} onChange={(e) => setAudioSettings(prev => ({ ...prev, hitNegative: e.target.value }))}
                            className="flex-1 bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-[10px] text-gray-300" />
                          <button onClick={() => testSound(audioSettings.hitNegative)} className="px-2 py-1 bg-white/5 border border-white/10 rounded text-[10px] hover:bg-white/10">▶</button>
                          <label className="cursor-pointer px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-[10px] hover:bg-white/20 transition-colors flex items-center">
                            업로드
                            <input type="file" className="hidden" accept="audio/*" onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleFileUpload(file, (url) => setAudioSettings(prev => ({ ...prev, hitNegative: url })));
                            }} />
                          </label>
                        </div>
                      </div>
                    </div>

                    <div className="bg-white/5 p-6 rounded-2xl border border-white/10 mb-4">
                      <div className="flex items-center justify-between mb-4">
                        <label className="text-sm font-bold text-gray-300 flex items-center gap-2">
                          <Volume2 className="w-4 h-4 text-primary" /> 전체 볼륨 조절
                        </label>
                        <span className="text-xs font-mono text-primary bg-primary/10 px-2 py-1 rounded-md border border-primary/20">
                          {Math.round((audioSettings.volume || 0.7) * 100)}%
                        </span>
                      </div>
                      
                      <div className="relative h-10 flex items-center px-2">
                        {/* Custom Track */}
                        <div className="absolute left-2 right-2 h-2 bg-white/10 rounded-full" />
                        <div 
                          className="absolute left-2 h-2 bg-gradient-to-r from-primary/50 to-primary rounded-full transition-all duration-75" 
                          style={{ width: `calc(${(audioSettings.volume || 0.7) * 100}% - 16px)` }}
                        />
                        
                        {/* Hidden Native Input */}
                        <input 
                          type="range" 
                          min="0" 
                          max="1" 
                          step="0.01" 
                          value={isNaN(audioSettings.volume) ? '' : (audioSettings.volume ?? 0.7)} 
                          onChange={(e) => setAudioSettings(prev => ({ ...prev, volume: parseFloat(e.target.value) }))}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                        />
                        
                        {/* Custom Thumb */}
                        <div 
                          className="absolute w-6 h-6 bg-white rounded-full shadow-[0_0_15px_rgba(52,152,219,0.5)] border-2 border-primary pointer-events-none transition-all duration-75 z-10"
                          style={{ left: `calc(${(audioSettings.volume || 0.7) * 100}% - 12px)` }}
                        />
                      </div>
                      
                      <div className="flex justify-between mt-2 px-2">
                        <span className="text-[10px] text-gray-600 font-bold">SILENT</span>
                        <span className="text-[10px] text-gray-600 font-bold">MAX</span>
                      </div>
                    </div>
                    <p className="text-[10px] text-gray-500">* 브라우저 호환성을 위해 MP3 또는 WAV 파일을 권장합니다. (MIDI 파일은 일부 브라우저에서 재생되지 않을 수 있습니다.)</p>
                  </div>

                  <div className="flex justify-center mb-12">
                    <button onClick={saveGameSettings} disabled={isSavingSettings}
                      className="px-12 py-4 bg-primary text-white font-bold rounded-xl hover:bg-blue-600 shadow-lg transition-all disabled:opacity-50">
                      {isSavingSettings ? "저장 중..." : "게임 설정 저장하기"}
                    </button>
                  </div>

                  <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold">일별 유입 로그 (최근 60일)</h2>
                    <div className="flex gap-3">
                      <button onClick={resetVisitStats} className="flex items-center gap-2 px-4 py-2 bg-red-600/20 border border-red-600/30 text-red-500 text-sm font-bold rounded-lg hover:bg-red-600/30 transition-all">
                        <Trash2 className="w-4 h-4" /> 데이터 리셋
                      </button>
                      <button onClick={downloadStatsExcel} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-bold rounded-lg hover:bg-green-700 transition-all shadow-lg">
                        <Download className="w-4 h-4" /> 엑셀 다운로드
                      </button>
                    </div>
                  </div>
                  <div className="space-y-4">
                    {visitStats.map((stat, idx) => (
                      <div key={idx} className="bg-white/5 p-6 rounded-2xl border border-white/10">
                        <div className="flex justify-between items-center mb-4 border-b border-white/10 pb-2">
                          <span className="font-mono text-primary">{stat.date}</span>
                          <span className="font-bold">{stat.count}명 유입</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <p className="text-[10px] text-gray-500 uppercase font-bold mb-2">유입 경로 (Referrer)</p>
                            <div className="space-y-1">
                              {Object.entries(stat.referrers).map(([ref, count]) => (
                                <div key={ref} className="flex justify-between text-xs bg-white/5 p-2 rounded">
                                  <span className="text-gray-400 truncate max-w-[150px]">{ref.replace(/_/g, '.')}</span>
                                  <span className="font-mono text-primary">{count}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                          <div>
                            <p className="text-[10px] text-gray-500 uppercase font-bold mb-2">접속 IP (IP Address)</p>
                            <div className="space-y-1">
                              {stat.ips && Object.entries(stat.ips).map(([ip, count]) => (
                                <div key={ip} className="flex justify-between text-xs bg-white/5 p-2 rounded">
                                  <span className="text-gray-400 font-mono">{ip.replace(/_/g, '.')}</span>
                                  <span className="font-mono text-green-500">{count}</span>
                                </div>
                              ))}
                              {!stat.ips && <p className="text-[10px] text-gray-600 italic">기록된 IP 없음</p>}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
