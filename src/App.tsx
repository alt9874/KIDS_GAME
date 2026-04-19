import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
  Info
} from 'lucide-react';
import { doc, getDoc, updateDoc, increment, setDoc, onSnapshot } from 'firebase/firestore';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut, User } from 'firebase/auth';
import { db } from './lib/firebase';

// ==========================================
// 1. 상수 및 설정 (DB 연동 및 기본값)
// ==========================================

// [기본 자산 정보] - Firestore 데이터가 없을 경우 사용됩니다.
const OPENING_BG_IMAGE_PC = "https://raw.githubusercontent.com/alt9874/game/main/main_pc.jpg";
const OPENING_BG_IMAGE_MO = "https://raw.githubusercontent.com/alt9874/game/main/main_mo.jpg";
const PLAY_BG_IMAGE_PC = "https://raw.githubusercontent.com/alt9874/game/main/play_bg.png";
const PLAY_BG_IMAGE_MO = "https://raw.githubusercontent.com/alt9874/game/main/play_bg_mo.png";
const START_BUTTON_IMAGE = "https://raw.githubusercontent.com/alt9874/game/main/start_bt.png";
const BGM_URL = "https://cdn.jsdelivr.net/gh/alt9874/game@main/opening.mp3"; 

const PILL_CONFIGS = [
  { id: 1, label: '올슨', score: 30, color: '#2ecc71', type: 'good', freq: 1.0, image: 'https://raw.githubusercontent.com/alt9874/game/main/ow.gif' },
  { id: 2, label: '디디', score: 15, color: '#27ae60', type: 'good', freq: 1.0, image: 'https://raw.githubusercontent.com/alt9874/game/main/didi.gif' },
  { id: 3, label: '정량 복용', score: 10, color: '#16a085', type: 'good', freq: 1.0, image: '' },
  { id: 8, label: '유통기한 지킴', score: 10, color: '#3498db', type: 'good', freq: 0.8, image: '' },
  { id: 4, label: '유효기간 경과', score: -10, color: '#f1c40f', type: 'bad', freq: 0.7, image: '' },
  { id: 5, label: '보관 불량', score: -20, color: '#f39c12', type: 'bad', freq: 0.6, image: '' },
  { id: 6, label: '의약품 오남용', score: -25, color: '#e74c3c', type: 'bad', freq: 0.5, image: 'https://raw.githubusercontent.com/alt9874/game/main/item_01.png' },
  { id: 7, label: '중복 복용', score: -30, color: '#c0392b', type: 'bad', freq: 0.4, image: '' },
];

// ==========================================
// 2. 타입 정의
// ==========================================
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

// ==========================================
// 3. 헬퍼 및 서브 컴포넌트
// ==========================================

// URL 처리 헬퍼 (Bitly 등 리퍼러 차단 방지)
const safeUrl = (url: string) => {
  if (!url || url === 'undefined' || url.trim() === '') return '';
  return url;
};

// [게임 플레이 컴포넌트] - App 외부 선언으로 성능 최적화 및 상태 유지
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
    const enabledConfigs = pillConfigs.filter(p => (p as any).enabled !== false);
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
      pillsRef.current.forEach(p => { p.x += p.vx * dt; p.y += p.vy * dt; p.angle += p.angularVelocity * dt; });
      pillsRef.current = pillsRef.current.filter(p => p.y < canvas.height + 150);
      popupsRef.current = popupsRef.current.filter(pop => (performance.now() - pop.id) < 800);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      pillsRef.current.forEach(p => {
        ctx.save();
        ctx.translate(p.x + p.width/2, p.y + p.height/2);
        ctx.rotate(p.angle * Math.PI / 180);
        const imgUrl = safeUrl(p.image);
        if (imgUrl && imagesCachedRef.current[imgUrl] && imagesCachedRef.current[imgUrl].complete) {
          ctx.drawImage(imagesCachedRef.current[imgUrl], -p.width/2, -p.height/2, p.width, p.height);
        } else {
          ctx.fillStyle = p.color; ctx.beginPath();
          const r = (p.type === 'good' || p.label === '중복 복용') ? 25 : p.width/2;
          ctx.roundRect(-p.width/2, -p.height/2, p.width, p.height, r);
          ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 2; ctx.stroke();
          ctx.fillStyle = '#ffffff'; ctx.font = `bold ${window.innerWidth < 640 ? '12px' : '16px'} sans-serif`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(p.label, 0, 0);
        }
        ctx.restore();
      });
      popupsRef.current.forEach(pop => {
        const elapsed = performance.now() - pop.id;
        const alpha = 1 - (elapsed / 800);
        ctx.save(); ctx.font = 'bold 12px sans-serif'; ctx.shadowBlur = 10; ctx.shadowColor = 'rgba(0,0,0,0.3)';
        ctx.fillStyle = `rgba(${pop.score > 0 ? '52, 211, 153' : '239, 68, 68'}, ${alpha})`;
        ctx.textAlign = 'center'; ctx.fillText(pop.score > 0 ? `+${pop.score}` : `${pop.score}`, pop.x, pop.y - (elapsed / 4));
        ctx.restore();
      });
      frameId = requestAnimationFrame(loop);
    };
    frameId = requestAnimationFrame(loop);
    return () => { window.removeEventListener('resize', resize); clearInterval(timer); clearInterval(spawnInterval); cancelAnimationFrame(frameId); };
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
        pillsRef.current.splice(i, 1); return;
      }
    }
  };

  return (
    <div className="relative w-full h-full overflow-hidden" onMouseDown={handleClick} onTouchStart={handleClick}>
      <div className="absolute inset-0 bg-cover bg-center z-0" style={{ backgroundImage: `url(${safeUrl(playBgImage)})`, backgroundColor: '#f0f7ff' }} />
      <canvas ref={canvasRef} className="absolute inset-0 z-10 touch-none pointer-events-none" />
      <div className="fixed top-[calc(1rem+env(safe-area-inset-top))] left-4 right-4 sm:top-[calc(1.5rem+env(safe-area-inset-top))] sm:left-6 sm:right-6 z-50 flex justify-between items-center pointer-events-none">
        <div className="flex items-center gap-2 sm:gap-4 pointer-events-auto">
          <button onClick={onHome} className="bg-white/90 backdrop-blur w-10 h-10 sm:w-14 sm:h-14 rounded-full shadow-xl border border-white flex items-center justify-center hover:bg-white transition-all"><Home className="w-5 h-5 sm:w-7 sm:h-7 text-gray-700"/></button>
          <div className="bg-white/90 backdrop-blur px-3 py-1.5 sm:px-6 sm:py-3 rounded-full shadow-xl border border-white flex items-center gap-2"><Trophy className="w-5 h-5 sm:w-6 sm:h-6 text-yellow-500"/><span className="text-xl sm:text-2xl font-black text-gray-800 tabular-nums">{score}</span></div>
        </div>
        <div className="flex items-center gap-2 sm:gap-4 pointer-events-auto">
          <div className="bg-white/90 backdrop-blur px-3 py-1.5 sm:px-6 sm:py-3 rounded-full shadow-xl border-2 border-primary flex items-center gap-2"><Timer className="w-5 h-5 sm:w-6 sm:h-6 text-primary"/><span className="text-xl sm:text-2xl font-black text-primary tabular-nums">{displayTime}</span></div>
          <button onClick={toggleMute} className="w-10 h-10 sm:w-14 sm:h-14 bg-white/90 backdrop-blur text-gray-700 rounded-full shadow-xl flex items-center justify-center hover:bg-white transition-all border border-white">{isMuted ? <VolumeX className="w-5 h-5 sm:w-7 sm:h-7" /> : <Volume2 className="w-5 h-5 sm:w-7 sm:h-7" />}</button>
        </div>
      </div>
    </div>
  );
};

// ==========================================
// 4. 메인 컴포넌트
// ==========================================
export default function App() {
  // --- 상태 관리 ---
  const [gameState, setGameState] = useState<GameState>('start');
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(30);
  const [combo, setCombo] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [isMuted, setIsMuted] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('pill_game_muted') === 'true';
    }
    return false;
  });
  const [audioBlocked, setAudioBlocked] = useState(true);
  const [totalVisits, setTotalVisits] = useState(0);
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [btnImageError, setBtnImageError] = useState(false);
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);

  // --- 화면 리사이즈 감지 ---
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  // --- DB 설정 상태 (Firebase) ---
  const [pillConfigs, setPillConfigs] = useState(PILL_CONFIGS);
  const [gameSpeed, setGameSpeed] = useState({ duration: 30, spawnInterval: 800 });
  const [openingBgImage, setOpeningBgImage] = useState(OPENING_BG_IMAGE_PC);
  const [playBgImage, setPlayBgImage] = useState(PLAY_BG_IMAGE_PC);
  const [startButtonImage, setStartButtonImage] = useState(START_BUTTON_IMAGE);
  const [audioSettings, setAudioSettings] = useState<AudioSettings | null>(null);

  // --- Refs ---
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pillsRef = useRef<Pill[]>([]);
  const popupsRef = useRef<ScorePopup[]>([]);
  const imagesCachedRef = useRef<Record<string, HTMLImageElement>>({});
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const gameLoopRef = useRef<number | null>(null);
  const spawnTimerRef = useRef<any>(null);
  const lastTimeRef = useRef<number>(0);

  // --- 오디오 제어 헬퍼 (음소거 상태 철저히 반영) ---
  const playBgm = useCallback((type: 'opening' | 'gameplay' | 'ending') => {
    if (isMuted) {
      if (audioRef.current) audioRef.current.pause();
      return;
    }
    
    let url = audioSettings ? (audioSettings as any)[type] : null;
    if (!url && type === 'opening') url = BGM_URL;
    if (!url) return;

    if (!audioRef.current) {
      audioRef.current = new Audio();
    }
    
    const audio = audioRef.current;
    
    // 오디오 컨텍스트를 통한 기기 무음 버튼 존중 (iOS/Safari 핵심 해결책)
    if (!audioCtxRef.current && (window.AudioContext || (window as any).webkitAudioContext)) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      audioCtxRef.current = new AudioCtx();
    }

    if (audioCtxRef.current && audio.src !== url) {
      audio.pause();
      audio.src = url;
      audio.loop = true;
      audio.crossOrigin = "anonymous";
      
      try {
        if (!audioSourceRef.current) {
          audioSourceRef.current = audioCtxRef.current.createMediaElementSource(audio);
          audioSourceRef.current.connect(audioCtxRef.current.destination);
        }
      } catch (e) {
        console.error("Audio Context Connection Error:", e);
      }
    } else if (audio.src !== url) {
      audio.src = url;
    }

    audio.loop = true;
    audio.muted = isMuted;
    audio.volume = isMuted ? 0 : (audioSettings?.volume || 0.5);
    
    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }

    audio.play().catch(() => {
      setAudioBlocked(true);
    });
  }, [isMuted, audioSettings]);

  const playSfx = useCallback((type: 'hitPositive' | 'hitNegative') => {
    if (!audioSettings || isMuted) return;
    const url = audioSettings[type];
    if (!url) return;
    
    // SFX도 오디오 컨텍스트를 통해 재생하여 기기 무음 설정을 준수하게 함
    if (audioCtxRef.current) {
      const sfx = new Audio(url);
      sfx.muted = isMuted;
      sfx.volume = isMuted ? 0 : (audioSettings.volume || 0.5) * 0.7;
      
      try {
        const source = audioCtxRef.current.createMediaElementSource(sfx);
        source.connect(audioCtxRef.current.destination);
        if (audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume();
        sfx.play().catch(() => {});
      } catch (e) {
        // 이미 생성된 소스 노드 에러 시 일반 재생 폴백
        sfx.play().catch(() => {});
      }
    } else {
      const sfx = new Audio(url);
      sfx.muted = isMuted;
      sfx.volume = (audioSettings.volume || 0.5) * 0.7;
      sfx.play().catch(() => {});
    }
  }, [isMuted, audioSettings]);

  const toggleMute = useCallback(() => {
    const nextMute = !isMuted;
    setIsMuted(nextMute);
    localStorage.setItem('pill_game_muted', nextMute.toString());
    if (audioRef.current) {
      audioRef.current.muted = nextMute;
      audioRef.current.volume = nextMute ? 0 : (audioSettings?.volume || 0.5);
      if (nextMute) {
        audioRef.current.pause();
      } else {
        if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
          audioCtxRef.current.resume();
        }
        audioRef.current.play().catch(() => setAudioBlocked(true));
      }
    }
  }, [isMuted, audioSettings]);


  useEffect(() => {
    const auth = getAuth();
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAdmin(currentUser?.email === "jsj20210104@gmail.com");
    });

    const statsRef = doc(db, 'stats', 'global');
    const configRef = doc(db, 'settings', 'gameConfig');

    getDoc(statsRef).then(snap => {
      if (snap.exists()) setTotalVisits(snap.data().totalVisits || 0);
    });

    const unsubscribeConfig = onSnapshot(configRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.pillConfigs) setPillConfigs(data.pillConfigs);
        if (data.openingBgImage) setOpeningBgImage(data.openingBgImage);
        if (data.playBgImage) setPlayBgImage(data.playBgImage);
        if (data.startButtonImage) setStartButtonImage(data.startButtonImage);
        
        // 데이터 구조 호환성 처리 (4월 19일 22시 12분 기준 구조 대응)
        if (data.gameSpeed) {
          const speed = data.gameSpeed;
          setGameSpeed({
            duration: speed.duration || 30,
            spawnInterval: speed.spawnInterval || 800
          });
        }
        if (data.audioSettings) setAudioSettings(data.audioSettings);
      }
    });

    const savedHighScore = localStorage.getItem('pill_game_high_score');
    if (savedHighScore) setHighScore(parseInt(savedHighScore));

    return () => {
      unsubscribeAuth();
      unsubscribeConfig();
    };
  }, []);

  // ==========================================
  // 5. 게임 로직
  // ==========================================
  const startGame = () => {
    setScore(0);
    setCombo(0);
    setGameState('playing');
    playBgm('gameplay');
  };

  const finishGame = useCallback(() => {
    setGameState('result');
    playBgm('ending');
    if (score > highScore) {
      setHighScore(score);
      localStorage.setItem('pill_game_high_score', score.toString());
    }
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

  // ==========================================
  // 5. 게임 로직 및 렌더링 (Canvas 고성능 60FPS)
  // ==========================================

  // ==========================================
  // 6. UI 렌더링
  // ==========================================
  
  return (
    <div ref={containerRef} className="fixed inset-0 w-full h-full bg-[#f0f7ff] overflow-hidden font-sans touch-none select-none">
      
      {/* --- 배경 장식 --- */}
      <div className="absolute inset-0 z-0 opacity-40 pointer-events-none">
        <div className="bg-circle w-[400px] h-[400px] top-[-100px] left-[-100px] blur-[100px] bg-blue-200" />
        <div className="bg-circle w-[300px] h-[300px] bottom-[-50px] right-[-50px] blur-[80px] bg-emerald-100" />
      </div>

      <AnimatePresence mode="wait">
        
        {/* 1. 오프닝 화면 */}
        {gameState === 'start' && (
          <motion.div key="start" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} 
            className="fixed inset-0 flex flex-col items-center justify-between z-[200] text-center p-6 sm:p-12 overflow-hidden pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
          >
            {/* Responsive Background Images */}
            <div 
              className="absolute inset-0 bg-cover bg-center z-[-1]" 
              style={{ 
                backgroundImage: (safeUrl(openingBgImage) !== "") 
                  ? `url(${safeUrl(openingBgImage)})` 
                  : (windowWidth < 640 ? `url(${OPENING_BG_IMAGE_MO})` : `url(${OPENING_BG_IMAGE_PC})`)
              }} 
              onClick={() => {
                if (audioBlocked) {
                  playBgm('opening');
                  setAudioBlocked(false);
                }
              }}
            />

            <div className="absolute top-4 right-4 z-50">
              <button 
                onClick={() => {
                  if (isAdmin) {
                    setGameState('admin');
                  } else {
                    const auth = getAuth();
                    const provider = new GoogleAuthProvider();
                    signInWithPopup(auth, provider).catch(err => console.error("Admin login failed:", err));
                  }
                }}
                className="w-12 h-12 flex items-center justify-center text-white opacity-[0.05] hover:opacity-100 transition-all active:scale-95"
              >
                <Settings2 className="w-6 h-6 sm:w-8 sm:h-8" />
              </button>
            </div>
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
                    {(!btnImageError) ? (
                      <img 
                        src={(safeUrl(startButtonImage) !== '') ? safeUrl(startButtonImage) : START_BUTTON_IMAGE} 
                        alt="시작" 
                        className="w-[35vw] sm:w-[9vw] h-auto mx-auto hover:scale-110 transition-transform active:scale-95 drop-shadow-2xl" 
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          const url = safeUrl(startButtonImage);
                          if (url !== '' && e.currentTarget.src !== START_BUTTON_IMAGE) {
                            e.currentTarget.src = START_BUTTON_IMAGE;
                          } else {
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
                
                {/* 안내 메시지 */}
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
            <div className="max-w-xl sm:max-w-5xl w-full bg-white rounded-[2.5rem] p-6 sm:p-12 shadow-[0_20px_60px_rgba(0,0,0,0.25)] flex flex-col gap-4 sm:gap-10 max-h-[96vh] overflow-hidden border border-white/20">
              {/* Header section */}
              <div className="text-center pb-2 sm:pb-4 border-b border-slate-100">
                <h2 className="text-xl sm:text-3xl font-black text-slate-800 tracking-tight">
                  게임 방법
                </h2>
              </div>

              {/* Items List Wrapper with internal scroll */}
              <div className="flex-1 overflow-y-auto pr-3 -mr-1 custom-scrollbar">
                <div className="grid grid-cols-2 gap-x-6 sm:gap-x-16">
                  {pillConfigs.filter(p => (p as any).enabled !== false).map((p) => (
                    <div key={p.id} className="flex items-center gap-3 sm:gap-10 py-4 sm:py-8 border-b border-slate-50 transition-all hover:bg-slate-50/50 group">
                      <div className="w-14 h-14 sm:w-36 sm:h-36 flex items-center justify-center shrink-0 bg-white rounded-xl sm:rounded-3xl shadow-sm border border-slate-100 transition-transform group-hover:scale-105">
                        {safeUrl(p.image) ? (
                          <img src={safeUrl(p.image)} alt={p.label} className="w-11 h-11 sm:w-32 sm:h-32 object-contain" referrerPolicy="no-referrer" />
                        ) : (
                          <div className="w-8 h-8 sm:w-20 sm:h-20 rounded-full shadow-sm" style={{ backgroundColor: p.color }} />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[14px] sm:text-2xl font-black text-slate-800 leading-tight mb-1 sm:mb-3 truncate">{p.label}</div>
                        <div className={`text-[15px] sm:text-4xl font-black ${p.score > 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                          {p.score > 0 ? `+${p.score}` : p.score} <span className="text-[10px] sm:text-xl font-bold opacity-80">점</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Footer section with Instruction and Button */}
              <div className="flex flex-col gap-3 sm:gap-6 border-t border-slate-100 pt-3 sm:pt-6">
                <div className="text-center">
                  <p className="text-slate-800 text-[16px] sm:text-3xl font-black leading-relaxed break-keep">
                    <span className="text-emerald-700">올바른 의약품 안전정보</span>만 {gameSpeed.duration}초 안에 클릭하세요!
                  </p>
                </div>

                {/* TODO: 시작 버튼 이미지로 교체 예정 
                    권장 사이즈: 1000x200px (5:1 비율) 
                */}
                <button 
                  onClick={startGame} 
                  className="w-full py-3 sm:py-6 bg-slate-900 text-base sm:text-3xl text-white font-black rounded-2xl sm:rounded-4xl hover:bg-emerald-600 transition-all shadow-xl active:translate-y-1 active:shadow-lg flex items-center justify-center gap-2.5 shrink-0"
                >
                  시작하기 <ArrowRight className="w-4 h-4 sm:w-9 sm:h-9" />
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* 3. 게임 화면 (고성능 Canvas 60FPS) */}
        {gameState === 'playing' && (
          <GamePlay 
            playBgImage={playBgImage}
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

        {/* 4. 결과 화면 */}
        {gameState === 'result' && (
          <motion.div key="result" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} 
            className="fixed inset-0 z-[300] flex flex-col items-center justify-center p-6 bg-slate-900/60 backdrop-blur-xl"
          >
            {/* Background for Ending Screen */}
            <div 
              className="absolute inset-0 bg-cover bg-center z-[-1] opacity-50" 
              style={{ backgroundImage: `url(${playBgImage})` }} 
            />
            <div className="max-w-md w-full bg-white rounded-[3rem] p-10 sm:p-12 shadow-[0_30px_70px_rgba(0,0,0,0.3)] text-center relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-emerald-400 via-primary to-blue-500" />
              
              <div className="relative z-10">
                <div className="w-24 h-24 sm:w-32 sm:h-32 bg-yellow-50 rounded-full flex items-center justify-center mx-auto mb-8 shadow-inner">
                  <Trophy className="w-12 h-12 sm:w-16 sm:h-16 text-yellow-500 drop-shadow-md" />
                </div>
                
                <h2 className="text-2xl sm:text-3xl font-black text-gray-800 mb-2">게임 종료!</h2>
                <p className="text-gray-500 font-medium mb-10">당신의 의약품 안전 점수는?</p>
                
                <div className="mb-10">
                  <div className="text-7xl sm:text-8xl font-black text-primary tracking-tighter mb-2">{score}</div>
                  <div className="text-lg font-bold text-gray-400">BEST: {highScore}</div>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  <button onClick={startGame} className="w-full py-5 bg-primary text-white text-xl font-bold rounded-2xl shadow-xl hover:bg-blue-600 transition-all flex items-center justify-center gap-3 active:scale-95">
                    <RotateCcw className="w-6 h-6" /> 다시 도전하기
                  </button>
                  <button onClick={() => setGameState('start')} className="w-full py-5 bg-gray-100 text-gray-600 text-xl font-bold rounded-2xl hover:bg-gray-200 transition-all active:scale-95">
                    메인으로 이동
                  </button>
                </div>
              </div>

              {/* 데코레이션 */}
              <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 10, ease: "linear" }} className="absolute -top-20 -right-20 pointer-events-none opacity-10">
                <Sparkles className="w-64 h-64 text-primary" />
              </motion.div>
            </div>
          </motion.div>
        )}

        {/* 5. 관리자 설정 화면 */}
        {gameState === 'admin' && isAdmin && (
          <AdminPage 
            pillConfigs={pillConfigs}
            gameSpeed={gameSpeed}
            openingBgImage={openingBgImage}
            playBgImage={playBgImage}
            startButtonImage={startButtonImage}
            audioSettings={audioSettings}
            onClose={() => setGameState('start')}
            onSave={async (newData) => {
              try {
                const configRef = doc(db, 'settings', 'gameConfig');
                await updateDoc(configRef, { ...newData, updatedAt: new Date() });
                alert("설정이 저장되었습니다.");
              } catch (err) {
                console.error("저장 실패:", err);
                alert("저장 중 오류가 발생했습니다.");
              }
            }}
          />
        )}

      </AnimatePresence>
    </div>
  );
}

// ==========================================
// 4. 관리자 페이지 컴포넌트
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
}

function AdminPage({ pillConfigs, gameSpeed, openingBgImage, playBgImage, startButtonImage, audioSettings, onClose, onSave }: AdminPageProps) {
  const [localPills, setLocalPills] = useState([...pillConfigs]);
  const [localSpeed, setLocalSpeed] = useState({ ...gameSpeed });
  const [localOpeningBg, setLocalOpeningBg] = useState(openingBgImage);
  const [localPlayBg, setLocalPlayBg] = useState(playBgImage);
  const [localStartBtn, setLocalStartBtn] = useState(startButtonImage);
  const [localAudio, setLocalAudio] = useState(audioSettings || {
    opening: '', gameplay: '', ending: '', hitPositive: '', hitNegative: '', volume: 0.5
  });

  const handleSave = () => {
    onSave({
      pillConfigs: localPills,
      gameSpeed: localSpeed,
      openingBgImage: localOpeningBg,
      playBgImage: localPlayBg,
      startButtonImage: localStartBtn,
      audioSettings: localAudio
    });
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[1000] bg-slate-900 overflow-y-auto p-4 sm:p-10 text-white">
      <div className="max-w-4xl mx-auto bg-slate-800 rounded-3xl p-6 sm:p-10 shadow-2xl">
        <div className="flex justify-between items-center mb-10 border-b border-slate-700 pb-6">
          <h2 className="text-3xl font-black flex items-center gap-3">
            <Settings2 className="w-8 h-8 text-primary" /> 관리자 설정
          </h2>
          <button onClick={onClose} className="p-3 hover:bg-slate-700 rounded-xl transition-colors">닫기</button>
        </div>

        <div className="space-y-12">
          {/* 배경 및 이미지 설정 */}
          <section>
            <h3 className="text-xl font-bold mb-6 text-slate-400">배경 및 이미지 설정</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium mb-2">오프닝 배경 이미지 URL</label>
                <input type="text" value={localOpeningBg} onChange={e => setLocalOpeningBg(e.target.value)} className="w-full bg-slate-700 border-none rounded-xl p-3" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">게임 배경 이미지 URL</label>
                <input type="text" value={localPlayBg} onChange={e => setLocalPlayBg(e.target.value)} className="w-full bg-slate-700 border-none rounded-xl p-3" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium mb-2">시작 버튼 이미지 URL</label>
                <input type="text" value={localStartBtn} onChange={e => setLocalStartBtn(e.target.value)} className="w-full bg-slate-700 border-none rounded-xl p-3" />
              </div>
            </div>
          </section>

          {/* 오디오 설정 */}
          <section>
            <h3 className="text-xl font-bold mb-6 text-slate-400">오디오 설정</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {Object.keys(localAudio).map((key) => (
                <div key={key}>
                  <label className="block text-sm font-medium mb-2 capitalize">{key} {key === 'volume' ? '(0.0 ~ 1.0)' : 'URL'}</label>
                  <input 
                    type={key === 'volume' ? 'number' : 'text'} 
                    step="0.1"
                    value={(localAudio as any)[key]} 
                    onChange={e => setLocalAudio({...localAudio, [key]: key === 'volume' ? parseFloat(e.target.value) : e.target.value})} 
                    className="w-full bg-slate-700 border-none rounded-xl p-3" 
                  />
                </div>
              ))}
            </div>
          </section>

          {/* 게임 속도 설정 */}
          <section>
            <h3 className="text-xl font-bold mb-6 text-slate-400">게임 밸런스</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium mb-2">총 게임 시간 (초)</label>
                <input type="number" value={localSpeed.duration} onChange={e => setLocalSpeed({...localSpeed, duration: parseInt(e.target.value)})} className="w-full bg-slate-700 border-none rounded-xl p-3" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">아이템 생성 간격 (ms)</label>
                <input type="number" value={localSpeed.spawnInterval} onChange={e => setLocalSpeed({...localSpeed, spawnInterval: parseInt(e.target.value)})} className="w-full bg-slate-700 border-none rounded-xl p-3" />
              </div>
            </div>
          </section>

          {/* 아이템 설정 */}
          <section>
            <h3 className="text-xl font-bold mb-6 text-slate-400">아이템 구성</h3>
            <div className="space-y-4">
              {localPills.map((pill, idx) => (
                <div key={pill.id} className="bg-slate-700/50 p-4 rounded-2xl flex flex-wrap gap-4 items-end">
                  <div className="w-24">
                    <label className="block text-[10px] mb-1">라벨</label>
                    <input type="text" value={pill.label} onChange={e => {
                      const next = [...localPills];
                      next[idx].label = e.target.value;
                      setLocalPills(next);
                    }} className="w-full bg-slate-800 border-none rounded-lg p-2 text-xs" />
                  </div>
                  <div className="w-16">
                    <label className="block text-[10px] mb-1">점수</label>
                    <input type="number" value={pill.score} onChange={e => {
                      const next = [...localPills];
                      next[idx].score = parseInt(e.target.value);
                      setLocalPills(next);
                    }} className="w-full bg-slate-800 border-none rounded-lg p-2 text-xs" />
                  </div>
                  <div className="flex-1 min-w-[200px]">
                    <label className="block text-[10px] mb-1">이미지 URL</label>
                    <input type="text" value={pill.image || ''} onChange={e => {
                      const next = [...localPills];
                      next[idx].image = e.target.value;
                      setLocalPills(next);
                    }} className="w-full bg-slate-800 border-none rounded-lg p-2 text-xs" />
                  </div>
                  <div className="flex items-center gap-2 pb-2">
                    <input type="checkbox" checked={pill.enabled !== false} onChange={e => {
                      const next = [...localPills];
                      next[idx].enabled = e.target.checked;
                      setLocalPills(next);
                    }} />
                    <span className="text-xs">활성</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t border-slate-700 flex justify-end gap-4">
          <button onClick={onClose} className="px-8 py-3 bg-slate-700 rounded-xl font-bold hover:bg-slate-600">취소</button>
          <button onClick={handleSave} className="px-8 py-3 bg-primary rounded-xl font-bold hover:bg-blue-600 shadow-lg shadow-primary/20">저장하기</button>
        </div>
      </div>
    </motion.div>
  );
}
