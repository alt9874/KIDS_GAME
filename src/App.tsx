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
const PLAY_BG_IMAGE_PC = "https://raw.githubusercontent.com/alt9874/game/main/game_play_pc.gif";
const PLAY_BG_IMAGE_MO = "https://raw.githubusercontent.com/alt9874/game/main/game_play_mo.gif";
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
        
        // p.image는 생성 시 이미 safeUrl이 적용되어 있으므로 직접 사용
        if (p.image && imagesCachedRef.current[p.image]?.complete) {
          ctx.drawImage(imagesCachedRef.current[p.image], -p.width/2, -p.height/2, p.width, p.height);
        } else {
          ctx.fillStyle = p.color; 
          ctx.beginPath();
          // roundRect 대신 간단한 rect로 대체하거나 r값 최적화
          const r = (p.type === 'good' || p.label === '중복 복용') ? 10 : p.width/2;
          ctx.roundRect(-p.width/2, -p.height/2, p.width, p.height, r);
          ctx.fill(); 
          ctx.strokeStyle = 'rgba(255,255,255,0.4)'; 
          ctx.lineWidth = 2; ctx.stroke();
          ctx.fillStyle = '#ffffff'; 
          ctx.font = `bold ${window.innerWidth < 640 ? '12px' : '16px'} sans-serif`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; 
          ctx.fillText(p.label, 0, 1);
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
  const [openingBgImageMo, setOpeningBgImageMo] = useState<string>(OPENING_BG_IMAGE_MO);
  const [playBgImage, setPlayBgImage] = useState<string>(PLAY_BG_IMAGE_PC);
  const [playBgImageMo, setPlayBgImageMo] = useState<string>(PLAY_BG_IMAGE_MO);
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
          referrer: document.referrer || '직접 접속',
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
        if (d.openingBgImageMo?.trim()) setOpeningBgImageMo(d.openingBgImageMo);
        if (d.playBgImage?.trim()) setPlayBgImage(d.playBgImage);
        if (d.playBgImageMo?.trim()) setPlayBgImageMo(d.playBgImageMo);
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
    const activeUrl = isMo ? openingBgImageMo : openingBgImage;
    const url = (activeUrl && activeUrl.trim() !== "") ? activeUrl : defaultImg;
    return `url("${url}")`;
  }, [openingBgImage, openingBgImageMo, windowWidth]);

  const CurrentPlayBg = useCallback(() => {
    const isMo = windowWidth < 640;
    const defaultImg = isMo ? PLAY_BG_IMAGE_MO : PLAY_BG_IMAGE_PC;
    const activeUrl = isMo ? playBgImageMo : playBgImage;
    const url = (activeUrl && activeUrl.trim() !== "") ? activeUrl : defaultImg;
    return url;
  }, [playBgImage, playBgImageMo, windowWidth]);

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
            <div className="absolute top-2 right-2 z-50 flex items-center gap-2">
              {isAdmin && (
                <motion.div initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} className="flex items-center bg-black/20 backdrop-blur-md px-2 py-1 rounded-full border border-white/10 text-[8px] font-bold text-white/40 tracking-tighter shadow-sm">
                  <ShieldCheck size={10} className="mr-1"/> 관리자 인증됨
                </motion.div>
              )}
              <button 
                onClick={() => {
                  if (isAdmin) setGameState('admin');
                  else signInWithPopup(getAuth(), new GoogleAuthProvider()).then((res) => {
                    if (res.user.email !== "jsj20210104@gmail.com") {
                      alert("관리자 전용 계정만 접근 가능합니다.");
                      getAuth().signOut();
                    }
                  }).catch(() => {});
                }} 
                className="p-2 text-white opacity-30 hover:opacity-100 transition-opacity"
                aria-label="관리자 설정"
              >
                <Settings2 size={16}/>
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
          <motion.div key="how-to" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[210] flex items-center justify-center p-3 sm:p-4">
            <div className="max-w-4xl w-full bg-white rounded-[2rem] sm:rounded-[2.5rem] p-5 sm:p-10 shadow-2xl flex flex-col gap-4 sm:gap-6 max-h-[98vh] sm:max-h-[95vh] overflow-hidden">
              <h2 className="text-xl sm:text-4xl font-black text-center text-slate-800 border-b pb-3 sm:pb-4 shrink-0">게임 방법</h2>
              <div className="flex-1 overflow-y-auto grid grid-cols-2 gap-2 sm:gap-4 pr-1 custom-scrollbar overflow-x-hidden">
                {pillConfigs.filter(p => !p.disabled).map(p => (
                  <div key={p.id} className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4 p-2 sm:p-4 bg-slate-50 rounded-xl sm:rounded-2xl border border-slate-100 text-center sm:text-left">
                    <div className="w-10 h-10 sm:w-20 sm:h-20 bg-white rounded-lg sm:rounded-xl shadow-sm flex items-center justify-center shrink-0 overflow-hidden">
                      {p.image ? (
                        <img 
                          src={safeUrl(p.image)} 
                          alt="" 
                          className="w-full h-full object-contain" 
                          referrerPolicy="no-referrer"
                          key={`img-${p.id}`} // GIF 리로딩 강제
                        />
                      ) : (
                        <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full" style={{backgroundColor: p.color}}/>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-black text-slate-800 text-[9px] sm:text-lg truncate">{p.label}</div>
                      <div className={`font-black text-[10px] sm:text-2xl ${p.score > 0 ? 'text-emerald-500' : 'text-rose-500'}`}>{p.score > 0 ? `+${p.score}` : p.score} <span className="text-[7px] sm:text-xs opacity-50 font-bold">점</span></div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="text-center py-1 sm:py-2 shrink-0">
                <p className="text-slate-600 font-black text-xs sm:text-xl animate-bounce">안전한 의약품 정보만 클릭하세요!</p>
              </div>
              <button onClick={startGame} className="w-full py-3 sm:py-5 bg-slate-900 text-white text-lg sm:text-2xl font-black rounded-xl sm:rounded-2xl hover:bg-emerald-600 transition-all flex items-center justify-center gap-2 shrink-0">시작하기 <ArrowRight size={20}/></button>
            </div>
          </motion.div>
        )}

        {gameState === 'playing' && (
          <GamePlay 
            playBgImage={window.innerWidth > 768 ? playBgImage : playBgImageMo} 
            gameSpeed={gameSpeed} 
            pillConfigs={pillConfigs} 
            finishGame={finishGame} 
            onHit={handleHitResult} 
            onHome={() => setGameState('start')} 
            isMuted={isMuted} 
            audioSettings={audioSettings} 
            toggleMute={toggleMute} 
            score={score} 
          />
        )}

        {/* 결과 화면 (gameState === 'result') */}
        {gameState === 'result' && (
          <motion.div key="result" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} 
            className="fixed inset-0 z-[300] bg-blue-50 flex items-center justify-center p-3 sm:p-4 overflow-hidden"
          >
            <div className="w-full max-w-4xl bg-white rounded-[2rem] sm:rounded-[3rem] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.1)] border border-blue-100 overflow-y-auto max-h-[98vh] flex flex-col md:flex-row custom-scrollbar">
              {/* 좌측: 점수 정보 - 밝은 하늘색 톤 */}
              <div className="flex-1 p-6 sm:p-12 flex flex-col items-center justify-center text-center bg-sky-50/50 relative overflow-hidden shrink-0">
                <div className="absolute top-0 left-0 w-full h-full opacity-[0.03] pointer-events-none">
                  <Sparkles className="w-full h-full text-sky-500" />
                </div>
                
                <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="space-y-4 sm:space-y-6 z-10">
                  <div className="inline-block p-3 sm:p-4 bg-gradient-to-br from-amber-300 to-yellow-500 rounded-[2rem] sm:rounded-[2.5rem] shadow-xl shadow-yellow-200/50">
                    <Trophy className="w-8 h-8 sm:w-12 sm:h-12 text-white" />
                  </div>
                  
                  <div>
                    <h2 className="text-2xl sm:text-4xl font-black text-sky-900 tracking-tight">게임 완료!</h2>
                    <p className="text-sky-400 font-bold text-[8px] sm:text-[10px] uppercase tracking-[0.2em] mt-1 sm:mt-2">Pill Safety Analysis</p>
                  </div>

                  <div className="py-2 sm:py-6">
                    <div className="text-6xl sm:text-9xl font-black text-sky-600 leading-none tracking-tighter tabular-nums drop-shadow-md">
                      {score}
                    </div>
                    <div className="text-sky-400/60 font-black text-[10px] sm:text-sm mt-3 sm:mt-6 uppercase tracking-widest">Score Details</div>
                  </div>

                  <div className="flex items-center justify-center gap-6 sm:gap-10 bg-white/60 backdrop-blur-sm px-5 sm:px-8 py-3 sm:py-5 rounded-2xl sm:rounded-3xl border border-sky-100">
                    <div className="text-center">
                      <div className="text-[8px] sm:text-[9px] font-black text-sky-300 uppercase tracking-widest mb-0.5 sm:mb-1">최고 기록</div>
                      <div className="text-lg sm:text-xl font-black text-sky-900">{highScore}</div>
                    </div>
                    <div className="w-px h-6 sm:h-8 bg-sky-100" />
                    <div className="text-center">
                      <div className="text-[8px] sm:text-[9px] font-black text-sky-300 uppercase tracking-widest mb-0.5 sm:mb-1">콤보 보너스</div>
                      <div className="text-lg sm:text-xl font-black text-emerald-500">+{Math.floor(score / 10)}</div>
                    </div>
                  </div>
                </motion.div>
              </div>

              {/* 우측: 등급 및 행동 - 경쾌한 그린/블루 톤 */}
              <div className="flex-1 p-6 sm:p-12 flex flex-col items-center justify-between bg-white shrink-0">
                <div className="w-full space-y-6 sm:space-y-10 text-center sm:text-left">
                  {/* 등급 시스템 */}
                  <div className="space-y-3 sm:space-y-5">
                    <div className="inline-flex items-center gap-2 px-3 sm:px-4 py-1 sm:py-1.5 bg-sky-600 text-white text-[9px] sm:text-[11px] font-black rounded-full uppercase tracking-widest shadow-lg shadow-sky-200">
                      Level {score >= 601 ? '5' : score >= 401 ? '4' : score >= 251 ? '3' : score >= 101 ? '2' : '1'} 숙련도
                    </div>
                    <h3 className="text-2xl sm:text-5xl font-black text-slate-900 leading-tight">
                      {score >= 601 ? '안전 전문가' : score >= 401 ? '안전 실천가' : score >= 251 ? '올바른 선택' : score >= 101 ? '기초 이해' : '주의 필요'}
                    </h3>
                    <p className="text-slate-500 font-bold text-sm sm:text-xl leading-relaxed max-w-xs mx-auto sm:mx-0">
                      {score >= 601 ? '“의약품 안전 정보를 정확히 이해하고 있어요”' : 
                       score >= 401 ? '“의약품 안전 사용을 잘 실천하고 있어요”' : 
                       score >= 251 ? '“의약품 안전 정보를 올바르게 선택하고 있어요”' : 
                       score >= 101 ? '“기본적인 의약품 안전 정보를 알고 있어요”' : 
                       '“의약품 정보를 구분하는 데 주의가 필요해요”'}
                    </p>
                  </div>

                  <div className="space-y-3 sm:space-y-4 pt-2">
                    <button onClick={startGame} className="w-full py-4 sm:py-5 bg-sky-500 text-white text-lg sm:text-xl font-black rounded-xl sm:rounded-2xl hover:bg-sky-400 hover:shadow-2xl hover:-translate-y-0.5 transition-all shadow-xl shadow-sky-100 active:scale-95 flex items-center justify-center gap-3">
                      <RotateCcw size={20} className="animate-spin-slow"/> 다시 도전하기
                    </button>
                    <button onClick={() => setGameState('start')} className="w-full py-4 sm:py-5 bg-white text-sky-600 border-2 border-sky-50 text-lg sm:text-xl font-black rounded-xl sm:rounded-2xl hover:bg-sky-50 transition-all active:scale-95">
                      홈으로 가기
                    </button>
                  </div>
                </div>

                {/* 하단 로고 - 텍스트 삭제 및 깔끔한 배치 */}
                <div className="pt-8 sm:pt-12 w-full flex flex-col items-center">
                  <a href="https://www.drugsafe.or.kr" target="_blank" rel="noopener noreferrer" className="hover:scale-105 transition-transform">
                    <img src="https://raw.githubusercontent.com/alt9874/game/main/logo.png" alt="한국의약품안전관리원" className="h-8 sm:h-12 object-contain" referrerPolicy="no-referrer" />
                  </a>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {gameState === 'admin' && isAdmin && (
          <AdminPage 
            pillConfigs={pillConfigs} 
            gameSpeed={gameSpeed} 
            openingBgImage={openingBgImage} 
            openingBgImageMo={openingBgImageMo}
            playBgImage={playBgImage} 
            playBgImageMo={playBgImageMo}
            startButtonImage={startButtonImage} 
            audioSettings={audioSettings} 
            totalVisits={totalVisits} 
            onClose={() => setGameState('start')} 
            onSave={async (d) => {
              try { await updateDoc(doc(db, 'settings', 'gameConfig'), { ...d, updatedAt: serverTimestamp() }); alert("저장 완료"); } catch(e) { alert("오류 발생"); }
            }} 
          />
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
  openingBgImageMo: string;
  playBgImage: string;
  playBgImageMo: string;
  startButtonImage: string;
  audioSettings: AudioSettings | null;
  onClose: () => void;
  onSave: (data: any) => Promise<void>;
  totalVisits: number;
}

function AdminPage({ 
  pillConfigs, 
  gameSpeed, 
  openingBgImage, 
  openingBgImageMo,
  playBgImage, 
  playBgImageMo,
  startButtonImage, 
  audioSettings, 
  onClose, 
  onSave, 
  totalVisits 
}: AdminPageProps) {
  const [activeTab, setActiveTab] = useState<'settings' | 'items' | 'analytics'>('settings');
  const [localPills, setLocalPills] = useState([...pillConfigs]);
  const [localSpeed, setLocalSpeed] = useState({ ...gameSpeed });
  const [localOpeningBg, setLocalOpeningBg] = useState(openingBgImage);
  const [localOpeningBgMo, setLocalOpeningBgMo] = useState(openingBgImageMo);
  const [localPlayBg, setLocalPlayBg] = useState(playBgImage);
  const [localPlayBgMo, setLocalPlayBgMo] = useState(playBgImageMo);
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
    const csv = ["아이디,아이피,접속시간,유입경로,디바이스정보", ...logs.map(l => `${l.id},${l.ip},${l.timestamp?.toDate().toLocaleString()},"${(l.referrer || '').replace(/"/g, '""')}","${(l.userAgent || '').replace(/"/g, '""')}"`)].join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: 'text/csv' });
    const u = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = u; a.download = `로그_${Date.now()}.csv`; a.click();
  };

  const resetVisits = async () => {
    if (window.confirm("누적 방문자 수를 리셋하시겠습니까?")) {
      await updateDoc(doc(db, 'stats', 'global'), { totalVisits: 0 });
      alert("초기화 완료");
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-[1000] bg-slate-100 overflow-y-auto p-4 sm:p-10 text-slate-900 font-sans">
      <div className="max-w-6xl mx-auto bg-white rounded-3xl overflow-hidden shadow-2xl border border-slate-200 flex flex-col min-h-[85vh]">
        <div className="flex justify-between items-center p-6 border-b border-slate-100 bg-slate-50/50 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center text-white"><Settings2 size={24}/></div>
            <h2 className="text-xl font-black tracking-tight">관리자 제어 센터</h2>
          </div>
          <div className="flex gap-3">
            <button onClick={() => onSave({ 
              pillConfigs: localPills, 
              gameSpeed: localSpeed, 
              openingBgImage: localOpeningBg, 
              openingBgImageMo: localOpeningBgMo,
              playBgImage: localPlayBg, 
              playBgImageMo: localPlayBgMo,
              startButtonImage: localStartBtn, 
              audioSettings: localAudio 
            })} className="px-6 py-2.5 bg-emerald-500 text-slate-900 font-black rounded-xl hover:bg-emerald-400 transition-all shadow-md active:scale-95 text-sm">변경사항 저장</button>
            <button onClick={onClose} className="px-6 py-2.5 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-all text-sm">닫기</button>
          </div>
        </div>

        <div className="flex border-b border-slate-100 p-2 bg-slate-50/30">
          <button onClick={() => setActiveTab('settings')} className={`flex-1 py-3 px-4 rounded-xl text-center text-xs font-black transition-all ${activeTab === 'settings' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}>01. 기본 설정</button>
          <button onClick={() => setActiveTab('items')} className={`flex-1 py-3 px-4 rounded-xl text-center text-xs font-black transition-all ${activeTab === 'items' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}>02. 아이템 정보</button>
          <button onClick={() => setActiveTab('analytics')} className={`flex-1 py-3 px-4 rounded-xl text-center text-xs font-black transition-all ${activeTab === 'analytics' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}>03. 통계 및 로그</button>
        </div>

        <div className="p-6 sm:p-10 flex-1 overflow-y-auto bg-white">
          {activeTab === 'settings' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10 animate-in fade-in duration-500">
              <div className="space-y-8">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 mb-4 uppercase tracking-widest">배경 및 리소스 설정</label>
                  <div className="space-y-5">
                    <div className="space-y-1.5">
                      <div className="text-[10px] font-bold text-slate-500 px-1">오프닝 이미지 (PC)</div>
                      <input type="text" value={localOpeningBg} onChange={e => setLocalOpeningBg(e.target.value)} className="w-full bg-slate-50 border border-slate-200 focus:border-emerald-500 rounded-xl p-3.5 text-xs outline-none transition-all font-mono" />
                    </div>
                    <div className="space-y-1.5">
                      <div className="text-[10px] font-bold text-slate-500 px-1">오프닝 이미지 (모바일)</div>
                      <input type="text" value={localOpeningBgMo} onChange={e => setLocalOpeningBgMo(e.target.value)} className="w-full bg-slate-50 border border-slate-200 focus:border-emerald-500 rounded-xl p-3.5 text-xs outline-none transition-all font-mono" />
                    </div>
                    <div className="space-y-1.5">
                      <div className="text-[10px] font-bold text-slate-500 px-1">게임플레이 배경 (PC)</div>
                      <input type="text" value={localPlayBg} onChange={e => setLocalPlayBg(e.target.value)} className="w-full bg-slate-50 border border-slate-200 focus:border-emerald-500 rounded-xl p-3.5 text-xs outline-none transition-all font-mono" />
                    </div>
                    <div className="space-y-1.5">
                      <div className="text-[10px] font-bold text-slate-500 px-1">게임플레이 배경 (모바일)</div>
                      <input type="text" value={localPlayBgMo} onChange={e => setLocalPlayBgMo(e.target.value)} className="w-full bg-slate-50 border border-slate-200 focus:border-emerald-500 rounded-xl p-3.5 text-xs outline-none transition-all font-mono" />
                    </div>
                    <div className="space-y-1.5">
                      <div className="text-[10px] font-bold text-slate-500 px-1">시작 버튼 이미지 주소</div>
                      <input type="text" value={localStartBtn} onChange={e => setLocalStartBtn(e.target.value)} className="w-full bg-slate-50 border border-slate-200 focus:border-emerald-500 rounded-xl p-3.5 text-xs outline-none transition-all font-mono" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-8">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 mb-4 uppercase tracking-widest">오디오 및 밸런스</label>
                    <div className="space-y-5">
                        <div className="space-y-1.5">
                            <div className="text-[10px] font-bold text-slate-500 px-1">전체 볼륨 (0.0 ~ 1.0)</div>
                            <input type="number" step="0.1" value={localAudio.volume} onChange={e => setLocalAudio({...localAudio, volume: parseFloat(e.target.value)})} className="w-full bg-slate-50 border border-slate-200 focus:border-emerald-500 rounded-xl p-3.5 text-xs outline-none transition-all" />
                        </div>
                        <div className="grid grid-cols-2 gap-4 pt-4">
                            <div className="space-y-1.5">
                                <div className="text-[10px] font-bold text-slate-500 px-1">게임 시간 (초)</div>
                                <input type="number" value={localSpeed.duration} onChange={e => setLocalSpeed({...localSpeed, duration: parseInt(e.target.value)})} className="w-full bg-slate-50 border border-slate-200 focus:border-emerald-500 rounded-xl p-3.5 text-xs outline-none transition-all" />
                            </div>
                            <div className="space-y-1.5">
                                <div className="text-[10px] font-bold text-slate-500 px-1">생성 간격 (ms)</div>
                                <input type="number" value={localSpeed.spawnInterval} onChange={e => setLocalSpeed({...localSpeed, spawnInterval: parseInt(e.target.value)})} className="w-full bg-slate-50 border border-slate-200 focus:border-emerald-500 rounded-xl p-3.5 text-xs outline-none transition-all" />
                            </div>
                        </div>
                    </div>
                  </div>
              </div>
            </div>
          )}

          {activeTab === 'items' && (
            <div className="animate-in fade-in duration-500">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-sm font-black text-slate-800">아이템 구성 정보</h3>
                <button onClick={() => setLocalPills([...localPills, { id: Date.now(), label: '새 아이템', score: 10, color: '#141414', type: 'good', freq: 1.0, image: '' }])} className="px-4 py-2 bg-slate-900 text-white text-xs font-black rounded-lg hover:bg-emerald-500 hover:text-slate-900 transition-all flex items-center gap-2 tracking-tighter">추가하기 <ArrowRight size={14}/></button>
              </div>

              <div className="border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
                <div className="grid grid-cols-[50px_1.5fr_0.8fr_2fr_1fr_50px] bg-slate-50 border-b border-slate-100 text-[10px] font-black text-slate-400 py-3 px-2">
                  <div className="text-center italic">정렬</div>
                  <div className="px-2">아이템 이름</div>
                  <div className="text-center">점수</div>
                  <div className="px-2">이미지 주소</div>
                  <div className="text-center">분류</div>
                  <div className="text-center">삭제</div>
                </div>
                {localPills.map((p, idx) => (
                  <div key={idx} className="grid grid-cols-[50px_1.5fr_0.8fr_2fr_1fr_50px] border-b border-slate-50 hover:bg-slate-50 transition-all items-center">
                    <div className="p-2 border-r border-slate-50 flex flex-col gap-1 items-center">
                      <button onClick={() => moveItem(idx, 'up')} className="p-1 hover:bg-slate-200 rounded text-slate-400 hover:text-slate-900"><ArrowUp size={12}/></button>
                      <button onClick={() => moveItem(idx, 'down')} className="p-1 hover:bg-slate-200 rounded text-slate-400 hover:text-slate-900"><ArrowDown size={12}/></button>
                    </div>
                    <div className="p-3 border-r border-slate-50">
                      <input type="text" value={p.label} onChange={e => { const n = [...localPills]; n[idx].label = e.target.value; setLocalPills(n); }} className="w-full bg-transparent font-bold text-sm text-slate-800 outline-none" />
                    </div>
                    <div className="p-3 border-r border-slate-50 font-mono text-sm text-center">
                        <input type="number" value={p.score} onChange={e => { const n = [...localPills]; n[idx].score = parseInt(e.target.value); setLocalPills(n); }} className="w-full bg-transparent text-center outline-none font-bold text-emerald-600" />
                    </div>
                    <div className="p-3 border-r border-slate-50">
                        <input type="text" value={p.image} placeholder="이미지 주소 (없으면 점/텍스트)" onChange={e => { const n = [...localPills]; n[idx].image = e.target.value; setLocalPills(n); }} className="w-full bg-transparent text-[10px] font-mono outline-none text-slate-400 focus:text-slate-900" />
                    </div>
                    <div className="p-3 border-r border-slate-50 flex justify-center">
                        <select value={p.type} onChange={e => { const n = [...localPills]; n[idx].type = e.target.value; setLocalPills(n); }} className="bg-white border border-slate-200 rounded-md px-2 py-1 text-[10px] font-black outline-none cursor-pointer">
                            <option value="good">올바른 습관 (긍정)</option>
                            <option value="bad">위험한 습관 (부정)</option>
                        </select>
                    </div>
                    <div className="p-3 flex justify-center">
                        <button onClick={() => setLocalPills(localPills.filter((_, i) => i !== idx))} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-rose-50 text-rose-300 hover:text-rose-500 transition-all"><Trash2 size={16}/></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'analytics' && (
            <div className="animate-in fade-in duration-500 space-y-10">
               <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                  <div className="bg-slate-50 p-7 rounded-[2rem] border border-slate-100 flex flex-col justify-between h-44">
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">누적 방문자</div>
                    <div className="text-4xl font-black text-slate-900 tabular-nums">{totalVisits.toLocaleString()}<span className="text-sm ml-1.5 opacity-30">명</span></div>
                  </div>
                  <div className="bg-slate-900 p-7 rounded-[2rem] text-white flex flex-col justify-between h-44 group cursor-pointer active:scale-95 transition-all shadow-xl shadow-slate-900/10" onClick={exportCSV}>
                    <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">데이터 리포트</div>
                    <div className="text-lg font-black flex items-center justify-between">
                      엑셀 내보내기 (CSV)
                      <div className="p-2 transition-transform group-hover:-translate-y-1"><Download size={24}/></div>
                    </div>
                  </div>
                  <div className="bg-white p-7 rounded-[2rem] border-2 border-rose-100 text-rose-500 flex flex-col justify-between h-44 group cursor-pointer active:scale-95 transition-all outline-none" onClick={resetVisits}>
                    <div className="text-[10px] font-black text-rose-200 uppercase tracking-widest italic">위험 구역</div>
                    <div className="text-lg font-black flex items-center justify-between">
                      카운터 초기화
                      <div className="p-2 transition-transform group-hover:rotate-12"><ResetIcon size={24} className="opacity-30"/></div>
                    </div>
                  </div>
               </div>

               <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                  <div className="p-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">최근 100건 접속 기록</span>
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"/>
                  </div>
                  <div className="max-h-[350px] overflow-y-auto">
                    <table className="w-full text-left text-xs">
                        <thead className="sticky top-0 bg-white border-b border-slate-100 text-[10px] font-black text-slate-400">
                            <tr><th className="px-6 py-4">시간</th><th className="px-6 py-4">아이피 (IP)</th><th className="px-6 py-4">유입 경로</th><th className="px-6 py-4">기기 정보</th></tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                             {isLoadingLogs ? <tr><td colSpan={4} className="p-20 text-center animate-pulse font-bold text-slate-300">로그 데이터를 불러오는 중입니다...</td></tr> : 
                              logs.map((l, i) => (
                                <tr key={i} className="hover:bg-slate-50 transition-colors">
                                  <td className="px-6 py-4 text-slate-500 whitespace-nowrap">{l.timestamp?.toDate().toLocaleString()}</td>
                                  <td className="px-6 py-4 font-black text-slate-700">{l.ip}</td>
                                  <td className="px-6 py-4 text-slate-400 truncate max-w-[150px]">{l.referrer || '직접'}</td>
                                  <td className="px-6 py-4 text-slate-300 truncate max-w-[150px] hover:max-w-none transition-all">{l.userAgent}</td>
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
