import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Pill as PillIcon, 
  Trophy, 
  Timer, 
  RotateCcw, 
  Play, 
  ArrowRight, 
  Volume2, 
  VolumeX, 
  Sparkles, 
  ShieldCheck, 
  AlertCircle,
  Home,
  BarChart2,
  Zap,
  Share2,
  Settings2,
  Download,
  ArrowUp,
  ArrowDown,
  Trash2,
  RotateCcw as ResetIcon
} from 'lucide-react';
import { 
  doc, 
  getDoc, 
  updateDoc, 
  increment, 
  setDoc, 
  onSnapshot, 
  collection, 
  addDoc, 
  serverTimestamp, 
  query, 
  orderBy, 
  limit, 
  getDocs
} from 'firebase/firestore';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User } from 'firebase/auth';
import { db } from './lib/firebase';

// ==========================================
// 1. 상수 및 설정
// ==========================================
const OPENING_BG_IMAGE_PC = "https://raw.githubusercontent.com/alt9874/game/main/main_pc.jpg";
const OPENING_BG_IMAGE_MO = "https://raw.githubusercontent.com/alt9874/game/main/main_mo.jpg";
const PLAY_BG_IMAGE_PC = "https://raw.githubusercontent.com/alt9874/game/main/play_bg.png";
const PLAY_BG_IMAGE_MO = "https://raw.githubusercontent.com/alt9874/game/main/play_bg_mo.png";
const START_BUTTON_IMAGE = "https://raw.githubusercontent.com/alt9874/game/main/start_bt.png";
const BGM_URL = "https://cdn.jsdelivr.net/gh/alt9874/game@main/opening.mp3"; 

const DEFAULT_PILLS = [
  { id: 1, label: '올슨', score: 30, color: '#2ecc71', type: 'good', freq: 1.0, image: 'https://raw.githubusercontent.com/alt9874/game/main/ow.gif' },
  { id: 2, label: '디디', score: 15, color: '#27ae60', type: 'good', freq: 1.0, image: 'https://raw.githubusercontent.com/alt9874/game/main/didi.gif' },
  { id: 3, label: '정량 복용', score: 10, color: '#16a085', type: 'good', freq: 1.0, image: '' },
  { id: 8, label: '유통기한 지킴', score: 10, color: '#3498db', type: 'good', freq: 0.8, image: '' },
  { id: 4, label: '유효기간 경과', score: -10, color: '#f1c40f', type: 'bad', freq: 0.7, image: '' },
  { id: 5, label: '보관 불량', score: -20, color: '#f39c12', type: 'bad', freq: 0.6, image: '' },
  { id: 6, label: '의약품 오남용', score: -25, color: '#e74c3c', type: 'bad', freq: 0.5, image: 'https://raw.githubusercontent.com/alt9874/game/main/item_01.png' },
  { id: 7, label: '중복 복용', score: -30, color: '#c0392b', type: 'bad', freq: 0.4, image: '' },
];

type GameState = 'start' | 'how-to' | 'playing' | 'result' | 'admin';

interface AudioSettings {
  opening: string;
  gameplay: string;
  ending: string;
  hitPositive: string;
  hitNegative: string;
  volume: number;
}

interface Pill {
  id: number;
  configId: number;
  label: string;
  score: number;
  color: string;
  type: string;
  image?: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  width: number;
  height: number;
  angle: number;
  angularVelocity: number;
}

interface ScorePopup {
  id: number;
  x: number;
  y: number;
  score: number;
}

const safeUrl = (url: string) => {
  if (!url || url === 'undefined' || url.trim() === '') return '';
  return url;
};

// ==========================================
// 2. 게임 플레이 엔진
// ==========================================
const GamePlay = ({ 
  playBgImage, 
  gameSpeed, 
  pillConfigs, 
  finishGame, 
  onHit,
  onHome,
  isMuted,
  audioSettings,
  toggleMute,
  score
}: { 
  playBgImage: string, 
  gameSpeed: any, 
  pillConfigs: any[], 
  finishGame: () => void,
  onHit: (score: number, isGood: boolean, x: number, y: number) => void,
  onHome: () => void,
  isMuted: boolean,
  audioSettings: AudioSettings | null,
  toggleMute: () => void,
  score: number
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pillsRef = useRef<Pill[]>([]);
  const popupsRef = useRef<ScorePopup[]>([]);
  const imagesCachedRef = useRef<Record<string, HTMLImageElement>>({});
  const localTimerRef = useRef<number>(gameSpeed.duration || 30);
  const [displayTime, setDisplayTime] = useState(gameSpeed.duration || 30);

  const spawnPill = useCallback(() => {
    const enabledConfigs = pillConfigs.filter(p => !p.disabled);
    if (enabledConfigs.length === 0) return;
    
    const totalFreq = enabledConfigs.reduce((sum, p) => sum + (p.freq || 1), 0);
    let rand = Math.random() * totalFreq;
    let selectedConfig = enabledConfigs[0];
    for (const config of enabledConfigs) {
      const freq = config.freq || 1;
      if (rand < freq) { selectedConfig = config; break; }
      rand -= freq;
    }

    const size = window.innerWidth < 640 ? 75 : 100;
    const x = Math.random() * (window.innerWidth - size);
    const newPill: Pill = {
      id: Date.now() + Math.random(),
      configId: selectedConfig.id,
      label: selectedConfig.label,
      score: selectedConfig.score,
      color: selectedConfig.color,
      type: selectedConfig.type,
      image: selectedConfig.image ? safeUrl(selectedConfig.image) : '',
      x, y: -size, vx: (Math.random() - 0.5) * 2, vy: 2.5 + Math.random() * 2.5,
      width: size, height: size, angle: Math.random() * 360, angularVelocity: (Math.random() - 0.5) * 10
    };
    pillsRef.current.push(newPill);
    
    const imgUrl = safeUrl(newPill.image);
    if (imgUrl && !imagesCachedRef.current[imgUrl]) {
      const img = new Image();
      img.referrerPolicy = "no-referrer";
      img.src = imgUrl;
      imagesCachedRef.current[imgUrl] = img;
    }
  }, [pillConfigs]);

  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    window.addEventListener('resize', resize);

    const timer = setInterval(() => {
      localTimerRef.current -= 1;
      if (localTimerRef.current <= 0) { clearInterval(timer); finishGame(); }
      else setDisplayTime(localTimerRef.current);
    }, 1000);

    const spawnInterval = setInterval(spawnPill, gameSpeed.spawnInterval || 800);

    let lastTime = performance.now();
    let frameId: number;
    const loop = (time: number) => {
      const dt = Math.min((time - lastTime) / 16.67, 3);
      lastTime = time;

      pillsRef.current.forEach(p => { 
        p.x += p.vx * dt; 
        p.y += p.vy * dt; 
        p.angle += p.angularVelocity * dt; 
      });
      pillsRef.current = pillsRef.current.filter(p => p.y < canvas.height + 150);
      popupsRef.current = popupsRef.current.filter(pop => (performance.now() - pop.id) < 800);

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      pillsRef.current.forEach(p => {
        ctx.save();
        ctx.translate(p.x + p.width/2, p.y + p.height/2);
        ctx.rotate(p.angle * Math.PI / 180);
        const imgUrl = safeUrl(p.image);
        if (imgUrl && imagesCachedRef.current[imgUrl]?.complete) {
          ctx.drawImage(imagesCachedRef.current[imgUrl], -p.width/2, -p.height/2, p.width, p.height);
        } else {
          ctx.fillStyle = p.color; 
          ctx.beginPath();
          const r = (p.type === 'good' || p.label === '중복 복용') ? 25 : p.width/2;
          ctx.roundRect(-p.width/2, -p.height/2, p.width, p.height, r);
          ctx.fill(); 
          ctx.strokeStyle = 'rgba(255,255,255,0.4)'; 
          ctx.lineWidth = 2; ctx.stroke();
          ctx.fillStyle = '#ffffff'; 
          ctx.font = `bold ${window.innerWidth < 640 ? '12px' : '16px'} sans-serif`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; 
          ctx.fillText(p.label, 0, 0);
        }
        ctx.restore();
      });

      popupsRef.current.forEach(pop => {
        const elapsed = performance.now() - pop.id;
        const alpha = 1 - (elapsed / 800);
        ctx.save(); 
        ctx.font = 'bold 12px sans-serif'; 
        ctx.shadowBlur = 10; ctx.shadowColor = 'rgba(0,0,0,0.3)';
        ctx.fillStyle = `rgba(${pop.score > 0 ? '52, 211, 153' : '239, 68, 68'}, ${alpha})`;
        ctx.textAlign = 'center'; 
        ctx.fillText(pop.score > 0 ? `+${pop.score}` : `${pop.score}`, pop.x, pop.y - (elapsed / 4));
        ctx.restore();
      });

      frameId = requestAnimationFrame(loop);
    };
    frameId = requestAnimationFrame(loop);

    return () => { 
      window.removeEventListener('resize', resize); 
      clearInterval(timer); 
      clearInterval(spawnInterval); 
      cancelAnimationFrame(frameId); 
    };
  }, [spawnPill, gameSpeed, finishGame]);

  const handleClick = (e: React.MouseEvent | React.TouchEvent) => {
    const pageX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const pageY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    
    for (let i = pillsRef.current.length - 1; i >= 0; i--) {
      const p = pillsRef.current[i];
      const dx = pageX - (p.x + p.width/2);
      const dy = pageY - (p.y + p.height/2);
      const dist = Math.sqrt(dx*dx + dy*dy);
      const hit = (p.type === 'good' || p.label === '중복 복용') 
        ? (pageX >= p.x && pageX <= p.x + p.width && pageY >= p.y && pageY <= p.y + p.height)
        : (dist <= p.width / 2);
      
      if (hit) {
        onHit(p.score, p.type === 'good', pageX, pageY);
        popupsRef.current.push({ id: performance.now(), x: pageX, y: pageY, score: p.score });
        pillsRef.current.splice(i, 1); 
        return;
      }
    }
  };

  return (
    <div className="relative w-full h-full overflow-hidden" onMouseDown={handleClick} onTouchStart={handleClick}>
      <div className="absolute inset-0 bg-cover bg-center z-0" style={{ backgroundImage: `url("${safeUrl(playBgImage)}")`, backgroundColor: '#f0f7ff' }} />
      <canvas ref={canvasRef} className="absolute inset-0 z-10 touch-none pointer-events-none" />
      <div className="fixed top-[calc(1rem+env(safe-area-inset-top))] left-4 right-4 z-50 flex justify-between items-center pointer-events-none">
        <div className="flex items-center gap-2 pointer-events-auto">
          <button onClick={onHome} className="bg-white/90 backdrop-blur w-10 h-10 sm:w-14 sm:h-14 rounded-full shadow-xl border border-white flex items-center justify-center hover:bg-white transition-all"><Home className="w-5 h-5 sm:w-7 sm:h-7 text-gray-700"/></button>
          <div className="bg-white/90 backdrop-blur px-3 py-1.5 sm:px-6 sm:py-3 rounded-full shadow-xl border border-white flex items-center gap-2">
            <Trophy className="w-5 h-5 sm:w-6 sm:h-6 text-yellow-500"/>
            <span className="text-xl sm:text-2xl font-black text-gray-800 tabular-nums">{score}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 pointer-events-auto">
          <div className="bg-white/90 backdrop-blur px-3 py-1.5 sm:px-6 sm:py-3 rounded-full shadow-xl border-2 border-primary flex items-center gap-2">
            <Timer className="w-5 h-5 sm:w-6 sm:h-6 text-primary"/>
            <span className="text-xl sm:text-2xl font-black text-primary tabular-nums">{displayTime}</span>
          </div>
          <button onClick={toggleMute} className="w-10 h-10 sm:w-14 sm:h-14 bg-white/90 backdrop-blur text-gray-700 rounded-full shadow-xl flex items-center justify-center hover:bg-white transition-all border border-white">
            {isMuted ? <VolumeX className="w-5 h-5 sm:w-7 sm:h-7" /> : <Volume2 className="w-5 h-5 sm:w-7 sm:h-7" />}
          </button>
        </div>
      </div>
    </div>
  );
};

// ==========================================
// 3. 앱 메인 컴포넌트
// ==========================================
export default function App() {
  const [gameState, setGameState] = useState<GameState>('start');
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [isMuted, setIsMuted] = useState(() => localStorage.getItem('pill_game_muted') === 'true');
  const [audioBlocked, setAudioBlocked] = useState(true);
  const [totalVisits, setTotalVisits] = useState(0);
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);

  const [pillConfigs, setPillConfigs] = useState(DEFAULT_PILLS);
  const [gameSpeed, setGameSpeed] = useState({ duration: 30, spawnInterval: 800 });
  const [openingBgImage, setOpeningBgImage] = useState<string>(OPENING_BG_IMAGE_PC);
  const [playBgImage, setPlayBgImage] = useState<string>(PLAY_BG_IMAGE_PC);
  const [startButtonImage, setStartButtonImage] = useState(START_BUTTON_IMAGE);
  const [audioSettings, setAudioSettings] = useState<AudioSettings | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<MediaElementAudioSourceNode | null>(null);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const audioBufferCache = useRef<Record<string, AudioBuffer>>({});
  const bgmSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const bgmGainNodeRef = useRef<GainNode | null>(null);

  const initAudioCtx = useCallback(() => {
    if (!audioCtxRef.current && (window.AudioContext || (window as any).webkitAudioContext)) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      audioCtxRef.current = new AudioCtx();
    }
    if (audioCtxRef.current?.state === 'suspended') {
      audioCtxRef.current.resume();
    }
  }, []);

  const loadAudioBuffer = async (url: string): Promise<AudioBuffer | null> => {
    if (audioBufferCache.current[url]) return audioBufferCache.current[url];
    try {
      initAudioCtx();
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await audioCtxRef.current!.decodeAudioData(arrayBuffer);
      audioBufferCache.current[url] = audioBuffer;
      return audioBuffer;
    } catch (e) {
      console.error("Audio Load Error:", e);
      return null;
    }
  };

  const stopBgm = useCallback(() => {
    if (bgmSourceRef.current) {
      try { bgmSourceRef.current.stop(); } catch(e) {}
      bgmSourceRef.current = null;
    }
  }, []);

  const playBgm = useCallback(async (type: 'opening' | 'gameplay' | 'ending') => {
    initAudioCtx();
    if (isMuted) {
      stopBgm();
      return;
    }

    let url = audioSettings ? (audioSettings as any)[type] : null;
    if (!url && type === 'opening') url = BGM_URL;
    if (!url) return;

    const buffer = await loadAudioBuffer(url);
    if (!buffer || !audioCtxRef.current) return;

    stopBgm();

    const source = audioCtxRef.current.createBufferSource();
    const gainNode = audioCtxRef.current.createGain();
    
    source.buffer = buffer;
    source.loop = true;
    gainNode.gain.value = audioSettings?.volume || 0.5;
    
    source.connect(gainNode);
    gainNode.connect(audioCtxRef.current.destination);
    
    source.start(0);
    bgmSourceRef.current = source;
    bgmGainNodeRef.current = gainNode;
  }, [isMuted, audioSettings, stopBgm]);

  const playSfx = useCallback(async (type: 'hitPositive' | 'hitNegative') => {
    initAudioCtx();
    if (!audioSettings || isMuted) return;
    const url = audioSettings[type];
    if (!url) return;
    
    const buffer = await loadAudioBuffer(url);
    if (!buffer || !audioCtxRef.current) return;

    const source = audioCtxRef.current.createBufferSource();
    const gainNode = audioCtxRef.current.createGain();
    
    source.buffer = buffer;
    gainNode.gain.value = (audioSettings.volume || 0.5) * 0.7;
    
    source.connect(gainNode);
    gainNode.connect(audioCtxRef.current.destination);
    
    source.start(0);
  }, [isMuted, audioSettings]);

  const toggleMute = useCallback(() => {
    const nextMute = !isMuted;
    setIsMuted(nextMute);
    localStorage.setItem('pill_game_muted', nextMute.toString());
    if (nextMute) {
      stopBgm();
    } else {
      const currentType = gameState === 'playing' ? 'gameplay' : (gameState === 'result' ? 'ending' : 'opening');
      playBgm(currentType);
    }
  }, [isMuted, gameState, playBgm, stopBgm]);

  // --- 오디오 동기화 (화면 레이어별 자동 재생/정지) ---
  useEffect(() => {
    if (audioBlocked) return;
    
    const syncAudio = async () => {
      // 1. 상태에 맞는 오디오 타입 결정
      let targetType: 'opening' | 'gameplay' | 'ending' | null = null;
      if (gameState === 'start' || gameState === 'how-to') targetType = 'opening';
      else if (gameState === 'playing') targetType = 'gameplay';
      else if (gameState === 'result') targetType = 'ending';

      // 2. 재생 시도
      if (targetType) {
        await playBgm(targetType);
      } else {
        stopBgm();
      }
    };

    syncAudio();
    
    // Cleanup: 컴포넌트 언마운트 시 정지
    return () => stopBgm();
  }, [gameState, audioBlocked, playBgm, stopBgm]);

  useEffect(() => {
    const auth = getAuth();
    const unsubscribeAuth = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAdmin(u?.email === "jsj20210104@gmail.com");
    });

    const statsRef = doc(db, 'stats', 'global');
    const configRef = doc(db, 'settings', 'gameConfig');

    const logVisit = async () => {
      try {
        const ipRes = await fetch('https://api.ipify.org?format=json');
        const ipData = await ipRes.json();
        await addDoc(collection(db, 'visit_logs'), {
          ip: ipData.ip,
          userAgent: navigator.userAgent,
          timestamp: serverTimestamp()
        });
        await setDoc(statsRef, { totalVisits: increment(1) }, { merge: true });
      } catch (err) {}
    };

    const sessionKey = `pill_vlog_${new Date().toISOString().split('T')[0]}`;
    if (!sessionStorage.getItem(sessionKey)) {
      logVisit();
      sessionStorage.setItem(sessionKey, 'true');
    }

    const unsubStats = onSnapshot(statsRef, (snap) => {
      if (snap.exists()) setTotalVisits(snap.data().totalVisits || 0);
    });

    const unsubConfig = onSnapshot(configRef, (snap) => {
      if (snap.exists()) {
        const d = snap.data();
        if (d.pillConfigs?.length > 0) setPillConfigs(d.pillConfigs);
        if (d.openingBgImage?.trim()) setOpeningBgImage(d.openingBgImage);
        if (d.playBgImage?.trim()) setPlayBgImage(d.playBgImage);
        if (d.startButtonImage?.trim()) setStartButtonImage(d.startButtonImage);
        if (d.gameSpeed) setGameSpeed(d.gameSpeed);
        if (d.audioSettings) setAudioSettings(d.audioSettings);
      }
    });

    const savedHighScore = localStorage.getItem('pill_game_high_score');
    if (savedHighScore) setHighScore(parseInt(savedHighScore));

    return () => { unsubscribeAuth(); unsubStats(); unsubConfig(); };
  }, []);

  const startGame = () => { setScore(0); setCombo(0); setGameState('playing'); };
  const finishGame = useCallback(() => {
    setGameState('result');
    if (score > highScore) { setHighScore(score); localStorage.setItem('pill_game_high_score', score.toString()); }
  }, [score, highScore]);

  const handleHitResult = useCallback((point: number, isGood: boolean) => {
    if (isGood) {
      const bonus = Math.floor(combo / 5) * 2;
      setScore(prev => prev + point + bonus);
      setCombo(prev => prev + 1);
      playSfx('hitPositive');
    } else {
      setScore(prev => Math.max(0, prev + point));
      setCombo(0);
      playSfx('hitNegative');
    }
  }, [combo, playSfx]);

  const OpeningBg = useCallback(() => {
    const isMo = windowWidth < 640;
    const defaultImg = isMo ? OPENING_BG_IMAGE_MO : OPENING_BG_IMAGE_PC;
    const url = openingBgImage && openingBgImage.trim() !== "" ? openingBgImage : defaultImg;
    return `url(${url})`;
  }, [openingBgImage, windowWidth]);

  return (
    <div className="fixed inset-0 w-full h-full bg-[#f0f7ff] overflow-hidden font-sans touch-none select-none">
      <AnimatePresence mode="wait">
        {gameState === 'start' && (
          <motion.div key="start" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} 
            className="fixed inset-0 z-[200] overflow-hidden"
          >
            {/* 고정 배경 레이어: 절대 사라지지 않도록 구조 변경 */}
            <div className="absolute inset-0 z-0 bg-[#f0f7ff]">
              <div className="w-full h-full bg-cover bg-center transition-opacity duration-1000" 
                style={{ backgroundImage: OpeningBg() }} 
                onClick={() => { if (audioBlocked) { playBgm('opening'); setAudioBlocked(false); } }}
              />
            </div>

            {/* Admin Portal UI */}
            <div className="absolute top-4 right-4 z-50 flex items-center gap-3">
              {isAdmin && (
                <motion.div initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} className="flex items-center bg-black/20 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 text-[9px] font-bold text-white/50 tracking-tighter shadow-sm">
                  <ShieldCheck size={12} className="mr-1.5"/> 관리자 로그인됨
                </motion.div>
              )}
              <button onClick={() => {
                if (isAdmin) setGameState('admin');
                else signInWithPopup(getAuth(), new GoogleAuthProvider()).then((res) => {
                  if (res.user.email !== "jsj20210104@gmail.com") {
                    alert("관리자만 접근 가능합니다.");
                    getAuth().signOut();
                  }
                }).catch(() => {});
              }} className="p-4 text-white opacity-[0.03] hover:opacity-100 transition-all">
                <Settings2 size={20}/>
              </button>
            </div>
            
            {/* Main Action Hub */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-6 z-20">
              <motion.button onClick={() => setGameState('how-to')} animate={{ scale: [1, 1.05, 1] }} transition={{ repeat: Infinity, duration: 2 }}>
                <img src={safeUrl(startButtonImage) || START_BUTTON_IMAGE} alt="시작" className="w-[40vw] sm:w-[10vw] h-auto drop-shadow-[0_20px_50px_rgba(0,0,0,0.5)] hover:scale-110 transition-all active:scale-95" referrerPolicy="no-referrer" />
              </motion.button>
            </div>

            {/* Counter Node - Repositioned to Bottom Central */}
            <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
              <div className="bg-black/30 backdrop-blur-xl px-6 py-2.5 rounded-full border border-white/5 shadow-2xl flex items-center gap-3">
                <span className="text-white/30 text-[10px] font-bold tracking-tight">누적 방문자</span>
                <span className="text-white/80 font-black font-mono text-base tabular-nums">{totalVisits.toLocaleString()}</span>
              </div>
            </div>
          </motion.div>
        )}

        {gameState === 'how-to' && (
          <motion.div key="how-to" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 bg-slate-900/60 backdrop-blur z-[210] flex items-center justify-center p-4">
            <div className="max-w-4xl w-full bg-white rounded-[2.5rem] p-6 sm:p-12 shadow-2xl flex flex-col gap-6 max-h-[95vh]">
              <h2 className="text-2xl sm:text-4xl font-black text-center text-slate-800 border-b pb-4">게임 방법</h2>
              <div className="flex-1 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-4 pr-2 custom-scrollbar">
                {pillConfigs.filter(p => !p.disabled).map(p => (
                  <div key={p.id} className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <div className="w-16 h-16 sm:w-24 sm:h-24 bg-white rounded-xl shadow-sm flex items-center justify-center">
                      {p.image ? <img src={safeUrl(p.image)} alt="" className="w-12 h-12 sm:w-20 sm:h-20" referrerPolicy="no-referrer"/> : <div className="w-10 h-10 rounded-full" style={{backgroundColor: p.color}}/>}
                    </div>
                    <div>
                      <div className="font-black text-slate-800 text-sm sm:text-xl">{p.label}</div>
                      <div className={`font-black text-lg sm:text-3xl ${p.score > 0 ? 'text-emerald-500' : 'text-rose-500'}`}>{p.score > 0 ? `+${p.score}` : p.score} <span className="text-xs opacity-50 font-bold">점</span></div>
                    </div>
                  </div>
                ))}
              </div>
              <button onClick={startGame} className="w-full py-4 sm:py-6 bg-slate-900 text-white text-xl sm:text-3xl font-black rounded-2xl hover:bg-emerald-600 transition-all flex items-center justify-center gap-2">시작하기 <ArrowRight/></button>
            </div>
          </motion.div>
        )}

        {gameState === 'playing' && (
          <GamePlay playBgImage={playBgImage} gameSpeed={gameSpeed} pillConfigs={pillConfigs} finishGame={finishGame} onHit={handleHitResult} onHome={() => setGameState('start')} isMuted={isMuted} audioSettings={audioSettings} toggleMute={toggleMute} score={score} />
        )}

        {gameState === 'result' && (
          <motion.div key="result" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} 
            className="fixed inset-0 z-[300] bg-white grid grid-cols-1 md:grid-cols-2"
          >
            {/* Left Page: Score and Branding */}
            <div className="flex flex-col items-center justify-center p-8 sm:p-20 relative overflow-hidden">
               <div className="absolute top-0 left-0 w-full h-1 bg-slate-900" />
               <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.2 }} className="text-center z-10 w-full max-w-sm">
                 <Trophy className="w-20 h-20 text-yellow-500 mx-auto mb-6 drop-shadow-xl"/>
                 <h2 className="text-4xl sm:text-6xl font-black text-slate-900 leading-none mb-4 uppercase">Game<br/>Over</h2>
                 <p className="text-slate-500 font-bold tracking-widest uppercase text-xs mb-10">Analysis Result</p>
                 
                 <div className="bg-slate-900 text-white p-10 rounded-[3rem] shadow-2xl mb-12">
                   <div className="text-8xl font-black leading-none mb-2">{score}</div>
                   <div className="text-xs uppercase tracking-widest opacity-50">Total Score</div>
                 </div>

                 <div className="flex justify-between items-center text-slate-400 font-mono text-xs border-t border-slate-100 pt-6">
                   <span>BEST RECORD</span>
                   <span className="font-bold text-slate-900 underline underline-offset-4">{highScore}</span>
                 </div>
               </motion.div>
               
               {/* Background Decorative */}
               <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 40, ease: "linear" }} className="absolute -bottom-40 -left-40 pointer-events-none opacity-5">
                 <Sparkles className="w-96 h-96 text-slate-900" />
               </motion.div>
            </div>

            {/* Right Page: Action and Feedback */}
            <div className="bg-slate-900 flex flex-col items-center justify-center p-12 sm:p-20 text-white relative">
               <div className="absolute top-10 right-10 text-[10px] font-mono text-slate-500 uppercase tracking-widest">Safe Touch v2.0</div>
               
               <div className="w-full max-w-sm space-y-6">
                 <div className="text-3xl font-black mb-10 italic">Your safety reflex is improving.</div>
                 
                 <button onClick={startGame} className="w-full py-6 bg-white text-slate-900 text-2xl font-black rounded-2xl hover:bg-emerald-400 transition-all flex items-center justify-center gap-4 group">
                   <RotateCcw className="group-hover:rotate-180 transition-transform duration-500"/> 
                   AGAIN
                 </button>
                 
                 <button onClick={() => setGameState('start')} className="w-full py-6 border-2 border-slate-700 text-white text-2xl font-black rounded-2xl hover:bg-slate-800 transition-all">
                   MAIN MENU
                 </button>
               </div>

               <div className="absolute bottom-10 left-10 flex gap-4 opacity-30">
                 <ShieldCheck size={20}/>
                 <BarChart2 size={20}/>
                 <Zap size={20}/>
               </div>
            </div>
          </motion.div>
        )}

        {gameState === 'admin' && isAdmin && (
          <AdminPage pillConfigs={pillConfigs} gameSpeed={gameSpeed} openingBgImage={openingBgImage} playBgImage={playBgImage} startButtonImage={startButtonImage} audioSettings={audioSettings} totalVisits={totalVisits} onClose={() => setGameState('start')} onSave={async (d) => {
            try { await updateDoc(doc(db, 'settings', 'gameConfig'), { ...d, updatedAt: serverTimestamp() }); alert("저장 완료"); } catch(e) { alert("오류 발생"); }
          }} />
        )}
      </AnimatePresence>
    </div>
  );
}

// ==========================================
// 4. 관리자 인터페이스
// ==========================================
interface AdminPageProps {
  pillConfigs: any[];
  gameSpeed: any;
  openingBgImage: string;
  playBgImage: string;
  startButtonImage: string;
  audioSettings: AudioSettings | null;
  onClose: () => void;
  onSave: (data: any) => Promise<void>;
  totalVisits: number;
}

function AdminPage({ pillConfigs, gameSpeed, openingBgImage, playBgImage, startButtonImage, audioSettings, onClose, onSave, totalVisits }: AdminPageProps) {
  const [activeTab, setActiveTab] = useState<'settings' | 'items' | 'analytics'>('settings');
  const [localPills, setLocalPills] = useState([...pillConfigs]);
  const [localSpeed, setLocalSpeed] = useState({ ...gameSpeed });
  const [localOpeningBg, setLocalOpeningBg] = useState(openingBgImage);
  const [localPlayBg, setLocalPlayBg] = useState(playBgImage);
  const [localStartBtn, setLocalStartBtn] = useState(startButtonImage);
  const [localAudio, setLocalAudio] = useState(audioSettings || { opening: '', gameplay: '', ending: '', hitPositive: '', hitNegative: '', volume: 0.5 });
  const [logs, setLogs] = useState<any[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  useEffect(() => { if (activeTab === 'analytics') fetchLogs(); }, [activeTab]);

  const fetchLogs = async () => {
    setIsLoadingLogs(true);
    try {
      const snap = await getDocs(query(collection(db, 'visit_logs'), orderBy('timestamp', 'desc'), limit(100)));
      setLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {} finally { setIsLoadingLogs(false); }
  };

  const moveItem = (i: number, d: 'up' | 'down') => {
    const next = [...localPills];
    const target = d === 'up' ? i - 1 : i + 1;
    if (target < 0 || target >= next.length) return;
    [next[i], next[target]] = [next[target], next[i]];
    setLocalPills(next);
  };

  const exportCSV = () => {
    const csv = ["ID,IP,Time,UserAgent", ...logs.map(l => `${l.id},${l.ip},${l.timestamp?.toDate().toLocaleString()},"${l.userAgent?.replace(/"/g, '""')}"`)].join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: 'text/csv' });
    const u = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = u; a.download = `logs_${Date.now()}.csv`; a.click();
  };

  const resetVisits = async () => {
    if (window.confirm("카운터를 리셋하시겠습니까?")) {
      await updateDoc(doc(db, 'stats', 'global'), { totalVisits: 0 });
      alert("리셋되었습니다.");
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-[1000] bg-[#E4E3E0] overflow-y-auto p-4 sm:p-10 text-slate-900 font-sans">
      <div className="max-w-6xl mx-auto border-2 border-slate-900 bg-white overflow-hidden shadow-[12px_12px_0px_#141414] flex flex-col min-h-[85vh]">
        <div className="flex justify-between items-center p-6 border-b-2 border-slate-900">
          <h2 className="text-2xl font-black italic">CONTROL CENTER</h2>
          <div className="flex gap-4">
            <button onClick={() => onSave({ pillConfigs: localPills, gameSpeed: localSpeed, openingBgImage: localOpeningBg, playBgImage: localPlayBg, startButtonImage: localStartBtn, audioSettings: localAudio })} className="px-8 py-2 bg-slate-900 text-white font-bold hover:bg-emerald-500 hover:text-slate-900 transition-all border-2 border-slate-900">COMMIT CHANGES</button>
            <button onClick={onClose} className="p-2 hover:bg-slate-100 transition-colors">CLOSE</button>
          </div>
        </div>

        <div className="flex border-b-2 border-slate-900 bg-slate-50 font-mono text-[10px] uppercase font-black">
          <button onClick={() => setActiveTab('settings')} className={`flex-1 py-3 px-4 text-center border-r-2 border-slate-900 last:border-r-0 ${activeTab === 'settings' ? 'bg-slate-900 text-white' : 'hover:bg-slate-200'}`}>01. CORE CONFIG</button>
          <button onClick={() => setActiveTab('items')} className={`flex-1 py-3 px-4 text-center border-r-2 border-slate-900 last:border-r-0 ${activeTab === 'items' ? 'bg-slate-900 text-white' : 'hover:bg-slate-200'}`}>02. ENTITY LIST</button>
          <button onClick={() => setActiveTab('analytics')} className={`flex-1 py-3 px-4 text-center border-r-2 border-slate-900 last:border-r-0 ${activeTab === 'analytics' ? 'bg-slate-900 text-white' : 'hover:bg-slate-200'}`}>03. SYSTEM LOGS</button>
        </div>

        <div className="p-6 sm:p-10 flex-1 overflow-y-auto">
          {activeTab === 'settings' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12 animate-in fade-in duration-500">
              <div className="space-y-10">
                <div>
                  <label className="block font-mono text-[10px] uppercase font-black text-slate-400 mb-4 italic">Asset Endpoints</label>
                  <div className="space-y-4">
                    <div className="group">
                      <div className="text-[9px] font-mono mb-1 opacity-50 group-hover:opacity-100 transition-opacity">OPENING_IMAGE</div>
                      <input type="text" value={localOpeningBg} onChange={e => setLocalOpeningBg(e.target.value)} className="w-full bg-slate-50 border-2 border-slate-200 focus:border-slate-900 rounded-none p-3 font-mono text-xs outline-none transition-all" />
                    </div>
                    <div className="group">
                        <div className="text-[9px] font-mono mb-1 opacity-50">GAMEPLAY_IMAGE</div>
                        <input type="text" value={localPlayBg} onChange={e => setLocalPlayBg(e.target.value)} className="w-full bg-slate-50 border-2 border-slate-200 focus:border-slate-900 rounded-none p-3 font-mono text-xs outline-none" />
                    </div>
                    <div className="group">
                        <div className="text-[9px] font-mono mb-1 opacity-50">START_BT_IMAGE</div>
                        <input type="text" value={localStartBtn} onChange={e => setLocalStartBtn(e.target.value)} className="w-full bg-slate-50 border-2 border-slate-200 focus:border-slate-900 rounded-none p-3 font-mono text-xs outline-none" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-10">
                  <div>
                    <label className="block font-mono text-[10px] uppercase font-black text-slate-400 mb-4 italic">Audio Metrics</label>
                    <div className="space-y-4">
                        <div className="group">
                            <div className="text-[9px] font-mono mb-1 opacity-50">MASTER_VOLUME</div>
                            <input type="number" step="0.1" value={localAudio.volume} onChange={e => setLocalAudio({...localAudio, volume: parseFloat(e.target.value)})} className="w-full bg-slate-50 border-2 border-slate-200 focus:border-slate-900 rounded-none p-3 font-mono text-xs outline-none" />
                        </div>
                    </div>
                  </div>
                  <div>
                    <label className="block font-mono text-[10px] uppercase font-black text-slate-400 mb-4 italic">Engine Balance</label>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <div className="text-[9px] font-mono mb-1 opacity-50">SESSION_DUR</div>
                            <input type="number" value={localSpeed.duration} onChange={e => setLocalSpeed({...localSpeed, duration: parseInt(e.target.value)})} className="w-full bg-slate-50 border-2 border-slate-200 focus:border-slate-900 rounded-none p-3 font-mono text-xs outline-none" />
                        </div>
                        <div>
                            <div className="text-[9px] font-mono mb-1 opacity-50">SPAWN_HZ_MS</div>
                            <input type="number" value={localSpeed.spawnInterval} onChange={e => setLocalSpeed({...localSpeed, spawnInterval: parseInt(e.target.value)})} className="w-full bg-slate-50 border-2 border-slate-200 focus:border-slate-900 rounded-none p-3 font-mono text-xs outline-none" />
                        </div>
                    </div>
                  </div>
              </div>
            </div>
          )}

          {activeTab === 'items' && (
            <div className="animate-in fade-in duration-500">
              <div className="flex justify-between items-end mb-8 border-b-2 border-slate-900 pb-4">
                <h3 className="font-mono text-[10px] uppercase font-black text-slate-400 italic">Entity Definition Map</h3>
                <button onClick={() => setLocalPills([...localPills, { id: Date.now(), label: 'NEW_ENTITY', score: 10, color: '#141414', type: 'good', freq: 1.0, image: '' }])} className="px-4 py-1 bg-slate-900 text-white text-[10px] font-black uppercase tracking-tighter hover:bg-emerald-500 hover:text-slate-900 transition-all">0+ ADD_NEW</button>
              </div>

              <div className="border-t-2 border-slate-900">
                {localPills.map((p, idx) => (
                  <div key={idx} className="grid grid-cols-[40px_1fr_60px_2fr_100px_40px] border-b border-slate-100 hover:bg-slate-900 hover:text-white transition-all group items-center">
                    <div className="p-4 font-mono text-[10px] border-r border-slate-100 group-hover:border-slate-800 flex flex-col gap-1 items-center">
                      <button onClick={() => moveItem(idx, 'up')} className="hover:text-emerald-400 focus:outline-none"><ArrowUp size={10}/></button>
                      <button onClick={() => moveItem(idx, 'down')} className="hover:text-emerald-400 focus:outline-none"><ArrowDown size={10}/></button>
                    </div>
                    <div className="p-4 border-r border-slate-100 group-hover:border-slate-800">
                      <input type="text" value={p.label} onChange={e => { const n = [...localPills]; n[idx].label = e.target.value; setLocalPills(n); }} className="w-full bg-transparent font-black tracking-tight outline-none" />
                    </div>
                    <div className="p-4 border-r border-slate-100 group-hover:border-slate-800 font-mono text-xs text-center italic">
                        <input type="number" value={p.score} onChange={e => { const n = [...localPills]; n[idx].score = parseInt(e.target.value); setLocalPills(n); }} className="w-full bg-transparent text-center outline-none" />
                    </div>
                    <div className="p-4 border-r border-slate-100 group-hover:border-slate-800 overflow-hidden">
                        <input type="text" value={p.image} placeholder="NULL" onChange={e => { const n = [...localPills]; n[idx].image = e.target.value; setLocalPills(n); }} className="w-full bg-transparent text-[9px] font-mono outline-none group-hover:text-emerald-200" />
                    </div>
                    <div className="p-4 border-r border-slate-100 group-hover:border-slate-800 flex justify-center">
                        <select value={p.type} onChange={e => { const n = [...localPills]; n[idx].type = e.target.value; setLocalPills(n); }} className="bg-transparent font-mono text-[9px] uppercase font-black outline-none cursor-pointer">
                            <option value="good">01. POS</option>
                            <option value="bad">02. NEG</option>
                        </select>
                    </div>
                    <div className="p-4 flex justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => setLocalPills(localPills.filter((_, i) => i !== idx))} className="text-rose-400 hover:text-rose-600"><Trash2 size={14}/></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'analytics' && (
            <div className="animate-in fade-in duration-500 space-y-12">
               <div className="grid grid-cols-1 sm:grid-cols-3 border-2 border-slate-900 bg-white">
                  <div className="p-8 border-b sm:border-b-0 sm:border-r-2 border-slate-900">
                    <div className="font-mono text-[10px] uppercase font-black text-slate-400 mb-2 italic">Session Count</div>
                    <div className="text-4xl font-black italic">{totalVisits.toLocaleString()}</div>
                  </div>
                  <div className="p-8 border-b sm:border-b-0 sm:border-r-2 border-slate-900 cursor-pointer hover:bg-slate-900 hover:text-white transition-all" onClick={exportCSV}>
                    <div className="font-mono text-[10px] uppercase font-black text-slate-400 mb-2 italic">Export Node</div>
                    <div className="text-lg font-black flex items-center gap-3">CSV DOWNLOAD <Download size={20}/></div>
                  </div>
                  <div className="p-8 cursor-pointer hover:bg-rose-500 hover:text-white transition-all" onClick={resetVisits}>
                    <div className="font-mono text-[10px] uppercase font-black text-slate-400 mb-2 italic">Purge Data</div>
                    <div className="text-lg font-black flex items-center gap-3">FACTORY RESET <ResetIcon size={20}/></div>
                  </div>
               </div>

               <div className="border-2 border-slate-900">
                  <div className="bg-slate-900 p-2 font-mono text-[8px] text-slate-500 uppercase tracking-widest font-black italic">Live Traffic Stream // Limit 100</div>
                  <div className="max-h-[300px] overflow-y-auto">
                    <table className="w-full text-left text-[10px] border-collapse">
                        <thead className="sticky top-0 bg-white border-b-2 border-slate-900 font-mono text-[9px] italic">
                            <tr><th className="px-4 py-3 border-r-2 border-slate-900">TIMESTAMP</th><th className="px-4 py-3 border-r-2 border-slate-900">NODE_IP</th><th className="px-4 py-3">USER_AGENT_STRING</th></tr>
                        </thead>
                        <tbody className="divide-y border-slate-200">
                             {isLoadingLogs ? <tr><td colSpan={3} className="p-10 text-center animate-pulse font-mono">CONNECTING...</td></tr> : 
                              logs.map((l, i) => (
                                <tr key={i} className="hover:bg-slate-50 transition-colors font-mono uppercase">
                                  <td className="px-4 py-3 border-r border-slate-100">{l.timestamp?.toDate().toLocaleString()}</td>
                                  <td className="px-4 py-3 border-r border-slate-100 font-black">{l.ip}</td>
                                  <td className="px-4 py-3 text-slate-400 leading-tight">{l.userAgent}</td>
                                </tr>
                              ))
                             }
                        </tbody>
                    </table>
                  </div>
               </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
