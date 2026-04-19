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
      <div className="absolute inset-0 bg-cover bg-center z-0" style={{ backgroundImage: `url(${safeUrl(playBgImage)})`, backgroundColor: '#f0f7ff' }} />
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
  const [openingBgImage, setOpeningBgImage] = useState(OPENING_BG_IMAGE_PC);
  const [playBgImage, setPlayBgImage] = useState(PLAY_BG_IMAGE_PC);
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

  const playBgm = useCallback((type: 'opening' | 'gameplay' | 'ending') => {
    if (isMuted) return;
    let url = audioSettings ? (audioSettings as any)[type] : null;
    if (!url && type === 'opening') url = BGM_URL;
    if (!url) return;

    if (!audioRef.current) audioRef.current = new Audio();
    const audio = audioRef.current;
    
    if (!audioCtxRef.current && (window.AudioContext || (window as any).webkitAudioContext)) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      audioCtxRef.current = new AudioCtx();
    }

    if (audio.src !== url) {
      audio.pause();
      audio.src = url;
      audio.loop = true;
      audio.crossOrigin = "anonymous";
      
      if (audioCtxRef.current && !audioSourceRef.current) {
        audioSourceRef.current = audioCtxRef.current.createMediaElementSource(audio);
        audioSourceRef.current.connect(audioCtxRef.current.destination);
      }
    }

    audio.volume = audioSettings?.volume || 0.5;
    if (audioCtxRef.current?.state === 'suspended') audioCtxRef.current.resume();
    audio.play().catch(() => setAudioBlocked(true));
  }, [isMuted, audioSettings]);

  const playSfx = useCallback((type: 'hitPositive' | 'hitNegative') => {
    if (!audioSettings || isMuted) return;
    const url = audioSettings[type];
    if (!url) return;
    
    const sfx = new Audio(url);
    sfx.volume = (audioSettings.volume || 0.5) * 0.7;
    
    if (audioCtxRef.current) {
      try {
        const source = audioCtxRef.current.createMediaElementSource(sfx);
        source.connect(audioCtxRef.current.destination);
        if (audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume();
      } catch (e) {}
    }
    sfx.play().catch(() => {});
  }, [isMuted, audioSettings]);

  const toggleMute = useCallback(() => {
    const nextMute = !isMuted;
    setIsMuted(nextMute);
    localStorage.setItem('pill_game_muted', nextMute.toString());
    if (audioRef.current) {
      if (nextMute) audioRef.current.pause();
      else playBgm(gameState === 'playing' ? 'gameplay' : gameState === 'result' ? 'ending' : 'opening');
    }
  }, [isMuted, gameState, playBgm]);

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

  const startGame = () => { setScore(0); setCombo(0); setGameState('playing'); playBgm('gameplay'); };
  const finishGame = useCallback(() => {
    setGameState('result');
    playBgm('ending');
    if (score > highScore) { setHighScore(score); localStorage.setItem('pill_game_high_score', score.toString()); }
  }, [score, highScore, playBgm]);

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

  return (
    <div className="fixed inset-0 w-full h-full bg-[#f0f7ff] overflow-hidden font-sans touch-none select-none">
      <AnimatePresence mode="wait">
        {gameState === 'start' && (
          <motion.div key="start" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} 
            className="fixed inset-0 flex flex-col items-center justify-between z-[200] p-6 text-center"
          >
            <div className="absolute inset-0 bg-cover bg-center z-[-1]" 
              style={{ backgroundImage: `url(${safeUrl(openingBgImage) || (windowWidth < 640 ? OPENING_BG_IMAGE_MO : OPENING_BG_IMAGE_PC)})` }} 
              onClick={() => { if (audioBlocked) { playBgm('opening'); setAudioBlocked(false); } }}
            />
            <div className="absolute top-4 right-4 z-50">
              <button onClick={() => {
                if (isAdmin) setGameState('admin');
                else signInWithPopup(getAuth(), new GoogleAuthProvider()).catch(() => {});
              }} className="p-3 text-white opacity-5 hover:opacity-100 transition-all"><Settings2/></button>
            </div>
            
            <div className="absolute top-[40%] -translate-y-1/2 w-full flex flex-col items-center gap-4">
              <motion.button onClick={() => setGameState('how-to')} animate={{ scale: [1, 1.05, 1] }} transition={{ repeat: Infinity, duration: 2 }}>
                <img src={safeUrl(startButtonImage) || START_BUTTON_IMAGE} alt="시작" className="w-[35vw] sm:w-[9vw] h-auto drop-shadow-2xl hover:scale-110 transition-transform" referrerPolicy="no-referrer" />
              </motion.button>
              {audioBlocked && <div className="px-3 py-1 bg-black/40 text-white text-[10px] rounded-full animate-bounce">화면 클릭 시 배경음악 재생</div>}
            </div>

            <div className="pb-12 text-white/70 text-xs font-bold drop-shadow-lg">
              <div className="bg-black/30 backdrop-blur px-4 py-2 rounded-full border border-white/20">
                누적 방문자: <span className="text-primary font-black ml-1 font-mono">{totalVisits.toLocaleString()}</span> 명
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
          <motion.div key="result" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="fixed inset-0 z-[300] flex flex-col items-center justify-center p-6 bg-slate-900/40 backdrop-blur-xl">
             <div className="max-w-md w-full bg-white rounded-[3rem] p-10 shadow-2xl text-center border-t-8 border-primary">
                <Trophy className="w-20 h-20 text-yellow-500 mx-auto mb-6 drop-shadow-lg"/>
                <h2 className="text-3xl font-black text-gray-800 mb-2">게임 종료!</h2>
                <div className="text-7xl font-black text-primary my-6">{score}</div>
                <div className="text-lg font-bold text-gray-400 mb-10">최고 기록: {highScore}</div>
                <div className="space-y-3">
                  <button onClick={startGame} className="w-full py-4 bg-primary text-white text-xl font-bold rounded-2xl hover:bg-blue-600 transition-all flex items-center justify-center gap-2"><RotateCcw/> 다시 하기</button>
                  <button onClick={() => setGameState('start')} className="w-full py-4 bg-gray-100 text-gray-500 text-xl font-bold rounded-2xl hover:bg-gray-200 transition-all">메인으로</button>
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
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-[1000] bg-slate-900 overflow-y-auto p-4 sm:p-10 text-white font-sans">
      <div className="max-w-6xl mx-auto bg-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col min-h-[85vh]">
        <div className="flex justify-between items-center p-6 border-b border-slate-700">
          <h2 className="text-2xl font-black">관리 포인트</h2>
          <div className="flex gap-2">
            <button onClick={() => onSave({ pillConfigs: localPills, gameSpeed: localSpeed, openingBgImage: localOpeningBg, playBgImage: localPlayBg, startButtonImage: localStartBtn, audioSettings: localAudio })} className="px-6 py-2 bg-primary rounded-xl font-bold">설정 저장</button>
            <button onClick={onClose} className="p-2 hover:bg-slate-700 rounded-xl transition-colors">닫기</button>
          </div>
        </div>

        <div className="flex bg-slate-900/50 p-2 gap-2 border-b border-slate-700">
          <button onClick={() => setActiveTab('settings')} className={`flex-1 py-3 font-bold rounded-xl ${activeTab === 'settings' ? 'bg-slate-700 text-primary' : 'text-slate-500'}`}>기본 설정</button>
          <button onClick={() => setActiveTab('items')} className={`flex-1 py-3 font-bold rounded-xl ${activeTab === 'items' ? 'bg-slate-700 text-primary' : 'text-slate-500'}`}>약물 관리</button>
          <button onClick={() => setActiveTab('analytics')} className={`flex-1 py-3 font-bold rounded-xl ${activeTab === 'analytics' ? 'bg-slate-700 text-primary' : 'text-slate-500'}`}>분석 로그</button>
        </div>

        <div className="p-6 sm:p-8 flex-1">
          {activeTab === 'settings' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 animate-in slide-in-from-bottom-2 duration-300">
              <div className="space-y-4">
                <h3 className="font-bold text-slate-400 uppercase text-xs">이미지 자산</h3>
                <input placeholder="오프닝 배경" type="text" value={localOpeningBg} onChange={e => setLocalOpeningBg(e.target.value)} className="w-full bg-slate-700 rounded-xl p-3 border border-slate-600 outline-none focus:border-primary" />
                <input placeholder="게임 배경" type="text" value={localPlayBg} onChange={e => setLocalPlayBg(e.target.value)} className="w-full bg-slate-700 rounded-xl p-3 border border-slate-600 outline-none focus:border-primary" />
                <input placeholder="시작 버튼" type="text" value={localStartBtn} onChange={e => setLocalStartBtn(e.target.value)} className="w-full bg-slate-700 rounded-xl p-3 border border-slate-600 outline-none focus:border-primary" />
              </div>
              <div className="space-y-4">
                <h3 className="font-bold text-slate-400 uppercase text-xs">오디오 볼륨</h3>
                <input type="number" step="0.1" value={localAudio.volume} onChange={e => setLocalAudio({...localAudio, volume: parseFloat(e.target.value)})} className="w-full bg-slate-700 rounded-xl p-3 border border-slate-600 outline-none focus:border-primary" />
                <h3 className="font-bold text-slate-400 uppercase text-xs pt-4">밸런스</h3>
                <input placeholder="시간(초)" type="number" value={localSpeed.duration} onChange={e => setLocalSpeed({...localSpeed, duration: parseInt(e.target.value)})} className="w-full bg-slate-700 rounded-xl p-3 border border-slate-600 outline-none focus:border-primary" />
                <input placeholder="간격(ms)" type="number" value={localSpeed.spawnInterval} onChange={e => setLocalSpeed({...localSpeed, spawnInterval: parseInt(e.target.value)})} className="w-full bg-slate-700 rounded-xl p-3 border border-slate-600 outline-none focus:border-primary" />
              </div>
            </div>
          )}

          {activeTab === 'items' && (
            <div className="animate-in slide-in-from-bottom-2 duration-300">
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-bold text-slate-400">약물 구성</h3>
                <button onClick={() => setLocalPills([...localPills, { id: Date.now(), label: '새 아이템', score: 10, color: '#3498db', type: 'good', freq: 1.0, image: '' }])} className="px-4 py-2 bg-emerald-600 text-sm font-bold rounded-lg">+ 추가</button>
              </div>
              <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-2 custom-scrollbar">
                {localPills.map((p, idx) => (
                  <div key={idx} className="bg-slate-700/30 p-4 rounded-2xl flex flex-wrap gap-4 items-center group">
                    <div className="flex flex-col gap-1">
                      <button onClick={() => moveItem(idx, 'up')} className="p-1 hover:text-primary"><ArrowUp size={16}/></button>
                      <button onClick={() => moveItem(idx, 'down')} className="p-1 hover:text-primary"><ArrowDown size={16}/></button>
                    </div>
                    <input type="text" value={p.label} onChange={e => { const n = [...localPills]; n[idx].label = e.target.value; setLocalPills(n); }} className="w-24 bg-transparent border-b border-slate-600 focus:border-primary outline-none" />
                    <input type="number" value={p.score} onChange={e => { const n = [...localPills]; n[idx].score = parseInt(e.target.value); setLocalPills(n); }} className="w-16 bg-transparent border-b border-slate-600 focus:border-primary outline-none" />
                    <input type="text" placeholder="이미지 URL" value={p.image} onChange={e => { const n = [...localPills]; n[idx].image = e.target.value; setLocalPills(n); }} className="flex-1 min-w-[150px] bg-transparent border-b border-slate-600 focus:border-primary outline-none text-xs" />
                    <select value={p.type} onChange={e => { const n = [...localPills]; n[idx].type = e.target.value; setLocalPills(n); }} className="bg-slate-700 rounded p-1 text-xs">
                       <option value="good">Good</option>
                       <option value="bad">Bad</option>
                    </select>
                    <input type="checkbox" checked={!p.disabled} onChange={e => { const n = [...localPills]; n[idx].disabled = !e.target.checked; setLocalPills(n); }} />
                    <button onClick={() => setLocalPills(localPills.filter((_, i) => i !== idx))} className="text-slate-500 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100"><Trash2 size={18}/></button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'analytics' && (
            <div className="animate-in slide-in-from-bottom-2 duration-300">
               <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
                  <div className="bg-slate-700/50 p-6 rounded-2xl border border-slate-700">
                    <div className="text-slate-500 text-xs font-bold uppercase mb-1">총 누적 방문자</div>
                    <div className="text-4xl font-black text-primary">{totalVisits.toLocaleString()} 명</div>
                  </div>
                  <button onClick={exportCSV} className="bg-emerald-600 hover:bg-emerald-700 rounded-2xl p-6 flex items-center justify-center gap-2 font-bold transition-all"><Download/> 엑셀(CSV) 추출</button>
                  <button onClick={resetVisits} className="bg-rose-600 hover:bg-rose-700 rounded-2xl p-6 flex items-center justify-center gap-2 font-bold transition-all"><ResetIcon/> 카운터 초기화</button>
               </div>
               <div className="bg-slate-900/50 rounded-2xl overflow-hidden border border-slate-700">
                 <table className="w-full text-left text-xs">
                   <thead className="bg-slate-800 text-slate-500 uppercase font-black uppercase">
                     <tr><th className="p-4">시간</th><th className="p-4">IP</th><th className="p-4">브라우저</th></tr>
                   </thead>
                   <tbody className="divide-y divide-slate-800">
                     {isLoadingLogs ? <tr><td colSpan={3} className="p-10 text-center animate-pulse">로딩 중...</td></tr> : 
                      logs.map((l, i) => (
                        <tr key={i} className="hover:bg-slate-800/50 transition-colors">
                          <td className="p-4 text-slate-400">{l.timestamp?.toDate().toLocaleString()}</td>
                          <td className="p-4 font-bold text-primary">{l.ip}</td>
                          <td className="p-4 text-slate-600 truncate max-w-xs">{l.userAgent}</td>
                        </tr>
                      ))
                     }
                   </tbody>
                 </table>
               </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
