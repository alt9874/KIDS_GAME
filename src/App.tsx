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
  { id: 1, label: '올슨', description: '의약품안전관리원 캐릭터', score: 30, color: '#2ecc71', type: 'good', width: 110, freq: 1.0, image: 'https://raw.githubusercontent.com/alt9874/game/main/ow.gif' },
  { id: 2, label: '디디', description: '의약품안전관리원 캐릭터', score: 15, color: '#27ae60', type: 'good', width: 110, freq: 1.0, image: 'https://raw.githubusercontent.com/alt9874/game/main/didi.gif' },
  { id: 3, label: '정량 복용', description: '약은 정해진 양만 드세요', score: 10, color: '#16a085', type: 'good', width: 110, freq: 1.0, image: '' },
  { id: 8, label: '유통기한 지킴', description: '유통기한 확인은 필수!', score: 10, color: '#3498db', type: 'good', width: 110, freq: 0.8, image: '' },
  { id: 4, label: '유효기간 경과', description: '오래된 약은 버리세요', score: -10, color: '#f1c40f', type: 'bad', width: 110, freq: 0.7, image: '' },
  { id: 5, label: '보관 불량', description: '습한 곳은 피해주세요', score: -20, color: '#f39c12', type: 'bad', width: 110, freq: 0.6, image: '' },
  { id: 6, label: '의약품 오남용', description: '남용은 건강을 해칩니다', score: -25, color: '#e74c3c', type: 'bad', width: 110, freq: 0.5, image: 'https://raw.githubusercontent.com/alt9874/game/main/item_01.png' },
  { id: 7, label: '중복 복용', description: '같은 성분의 약을 주의하세요', score: -30, color: '#c0392b', type: 'bad', width: 110, freq: 0.4, image: '' },
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
  noRotation?: boolean;
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
  const [pills, setPills] = useState<Pill[]>([]);
  const popupsRef = useRef<ScorePopup[]>([]);
  const localTimerRef = useRef<number>(gameSpeed.duration || 30);
  const [displayTime, setDisplayTime] = useState(gameSpeed.duration || 30);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

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

    // 사용자가 설정한 고유 크기가 있으면 사용, 없으면 기본값 적용
    const baseSize = selectedConfig.width || (window.innerWidth < 640 ? 80 : 110);
    const x = Math.random() * (window.innerWidth - baseSize);
    const noRotation = selectedConfig.noRotation || false;
    const initialAngle = (selectedConfig.initialAngle !== undefined && selectedConfig.initialAngle !== null) 
      ? Number(selectedConfig.initialAngle) 
      : Math.random() * 360;

    const newPill: Pill = {
      id: Math.random(),
      configId: selectedConfig.id,
      label: selectedConfig.label,
      score: selectedConfig.score,
      color: selectedConfig.color,
      type: selectedConfig.type,
      image: selectedConfig.image ? safeUrl(selectedConfig.image) : '',
      x, y: -baseSize, vx: (Math.random() - 0.5) * 3, vy: 3 + Math.random() * 3,
      width: baseSize, height: baseSize, 
      angle: initialAngle, 
      angularVelocity: noRotation ? 0 : (Math.random() - 0.5) * 15,
      noRotation
    };
    
    setPills(prev => [...prev, newPill]);
  }, [pillConfigs]);

  useEffect(() => {
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

      setPills(prev => {
        const next = prev.map(p => {
          let nextX = p.x + p.vx * dt;
          let nextVx = p.vx;
          
          // 좌우 벽 충돌 감지 및 튕기기
          if (nextX < 0) {
            nextX = 0;
            nextVx = Math.abs(p.vx); // 오른쪽으로 튕김
          } else if (nextX > window.innerWidth - p.width) {
            nextX = window.innerWidth - p.width;
            nextVx = -Math.abs(p.vx); // 왼쪽으로 튕김
          }

          return {
            ...p,
            x: nextX,
            vx: nextVx,
            y: p.y + p.vy * dt,
            angle: p.noRotation ? p.angle : (p.angle + p.angularVelocity * dt)
          };
        }).filter(p => p.y < window.innerHeight + 150);
        return next;
      });

      // 팝업 처리를 위한 캔버스 유지
      if (canvasRef.current) {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          if (canvas.width !== window.innerWidth || canvas.height !== window.innerHeight) {
            canvas.width = window.innerWidth; canvas.height = window.innerHeight;
          }
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          popupsRef.current = popupsRef.current.filter(pop => (performance.now() - pop.id) < 800);
          popupsRef.current.forEach(pop => {
            const elapsed = performance.now() - pop.id;
            const alpha = 1 - (elapsed / 800);
            ctx.save(); 
            ctx.font = 'bold 16px sans-serif'; 
            ctx.shadowBlur = 10; ctx.shadowColor = 'rgba(0,0,0,0.3)';
            ctx.fillStyle = `rgba(${pop.score > 0 ? '52, 211, 153' : '239, 68, 68'}, ${alpha})`;
            ctx.textAlign = 'center'; 
            ctx.fillText(pop.score > 0 ? `+${pop.score}` : `${pop.score}`, pop.x, pop.y - (elapsed / 4));
            ctx.restore();
          });
        }
      }

      frameId = requestAnimationFrame(loop);
    };
    frameId = requestAnimationFrame(loop);

    return () => { 
      clearInterval(timer); 
      clearInterval(spawnInterval); 
      cancelAnimationFrame(frameId); 
    };
  }, [spawnPill, gameSpeed, finishGame]);

  const handleClick = (e: React.MouseEvent | React.TouchEvent) => {
    const pageX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const pageY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    
    // 알약 배열을 역순으로 확인 (가장 최근에 생성된/위에 있는 것부터)
    for (let i = pills.length - 1; i >= 0; i--) {
      const p = pills[i];
      const dx = pageX - (p.x + p.width/2);
      const dy = pageY - (p.y + p.height/2);
      const dist = Math.sqrt(dx*dx + dy*dy);
      const hit = (p.type === 'good' || p.label === '중복 복용') 
        ? (pageX >= p.x && pageX <= p.x + p.width && pageY >= p.y && pageY <= p.y + p.height)
        : (dist <= p.width / 2);
      
      if (hit) {
        onHit(p.score, p.type === 'good', pageX, pageY);
        popupsRef.current.push({ id: performance.now(), x: pageX, y: pageY, score: p.score });
        setPills(prev => prev.filter(pill => pill.id !== p.id));
        return;
      }
    }
  };

  return (
    <div ref={containerRef} className="relative w-full h-full overflow-hidden" onMouseDown={handleClick} onTouchStart={handleClick}>
      <div className="absolute inset-0 bg-cover bg-center z-0" style={{ backgroundImage: `url("${safeUrl(playBgImage)}")`, backgroundColor: '#f0f7ff' }} />
      
      {/* 알약들을 DOM 요소로 렌더링 (GIF 지원을 위함) */}
      <div className="absolute inset-0 z-10 pointer-events-none">
        {pills.map(p => (
          <div 
            key={p.id}
            className="absolute flex items-center justify-center overflow-hidden"
            style={{
              left: p.x,
              top: p.y,
              width: p.width,
              height: p.height,
              transform: `rotate(${p.angle}deg)`,
              backgroundColor: p.image ? 'transparent' : p.color,
              borderRadius: p.image ? '0' : ((p.type === 'good' || p.label === '중복 복용') ? '10px' : '50%'),
              border: p.image ? 'none' : '2px solid rgba(255,255,255,0.4)'
            }}
          >
            {p.image ? (
              <img 
                src={p.image} 
                alt="" 
                className="w-full h-full object-contain" 
                referrerPolicy="no-referrer"
              />
            ) : (
              <span className="font-black text-white text-center text-xs sm:text-base pointer-events-none select-none">
                {p.label}
              </span>
            )}
          </div>
        ))}
      </div>

      <canvas ref={canvasRef} className="absolute inset-0 z-20 touch-none pointer-events-none" />

      <div className="fixed top-[calc(1rem+env(safe-area-inset-top))] left-4 right-4 z-50 flex justify-between items-center pointer-events-none">
        <div className="flex items-center gap-2 pointer-events-auto">
          <button onClick={onHome} className="bg-white/90 backdrop-blur w-10 h-10 sm:w-14 sm:h-14 rounded-full shadow-xl border border-white flex items-center justify-center hover:bg-white transition-all"><Home className="w-5 h-5 sm:w-7 sm:h-7 text-gray-700"/></button>
          <div className="flex items-center gap-1 sm:gap-3 px-2 drop-shadow-xl">
            <Trophy className="w-6 h-6 sm:w-10 sm:h-10 text-yellow-400 fill-yellow-400"/>
            <span className="text-3xl sm:text-6xl font-black text-white tabular-nums">{score}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 pointer-events-auto">
          <div className="flex items-center gap-1 sm:gap-3 px-2 drop-shadow-xl">
            <Timer className="w-6 h-6 sm:w-10 sm:h-10 text-white"/>
            <span className="text-3xl sm:text-6xl font-black text-white tabular-nums">{displayTime}</span>
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
  const isMutedRef = useRef(isMuted);
  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);

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
  const audioBufferCache = useRef<Record<string, AudioBuffer>>({});
  const bgmSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const bgmGainNodeRef = useRef<GainNode | null>(null);
  const currentBgmTypeRef = useRef<'opening' | 'gameplay' | 'ending' | null>(null);
  const isLoadingBgmRef = useRef<string | null>(null);

  const initAudioCtx = useCallback(() => {
    if (!audioCtxRef.current && (window.AudioContext || (window as any).webkitAudioContext)) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      audioCtxRef.current = new AudioCtx();
    }
    if (audioCtxRef.current?.state === 'suspended') {
      audioCtxRef.current.resume().catch(() => {});
    }
  }, []);

  const stopBgm = useCallback(() => {
    if (bgmSourceRef.current) {
      try { bgmSourceRef.current.stop(); } catch(e) {}
      bgmSourceRef.current = null;
    }
    currentBgmTypeRef.current = null;
    isLoadingBgmRef.current = null;
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

  const playBgm = useCallback(async (type: 'opening' | 'gameplay' | 'ending') => {
    // 이미 같은 타입의 음악이 재생 중이거나 로딩 중이면 중복 실행 방지
    if (currentBgmTypeRef.current === type && bgmSourceRef.current) return;
    if (isLoadingBgmRef.current === type) return;
    
    initAudioCtx();
    
    // playBgm 자체는 소리를 낼지 말지 결정하지 않고, 일단 재생은 하되 볼륨을 ref 기준으로 설정
    let url = audioSettings ? (audioSettings as any)[type] : null;
    if (!url && (type === 'opening' || type === 'gameplay')) url = BGM_URL;
    if (!url) return;

    isLoadingBgmRef.current = type;

    try {
      const buffer = await loadAudioBuffer(url);
      if (!buffer || !audioCtxRef.current || isLoadingBgmRef.current !== type) {
        if (isLoadingBgmRef.current === type) isLoadingBgmRef.current = null;
        return;
      }

      stopBgm();

      const source = audioCtxRef.current.createBufferSource();
      const gainNode = audioCtxRef.current.createGain();
      
      source.buffer = buffer;
      source.loop = type !== 'ending';
      
      // 현재 음소거 상태에 따라 초기 볼륨 설정
      const initialVol = isMutedRef.current ? 0 : (audioSettings?.volume || 0.5);
      gainNode.gain.value = initialVol;
      
      source.connect(gainNode);
      gainNode.connect(audioCtxRef.current.destination);
      
      source.start(0);
      bgmSourceRef.current = source;
      bgmGainNodeRef.current = gainNode;
      currentBgmTypeRef.current = type;
    } finally {
      if (isLoadingBgmRef.current === type) isLoadingBgmRef.current = null;
    }
  }, [audioSettings, stopBgm]); // isMuted를 의존성에서 제거하여 함수 재생성 및 음악 재시작 방지

  const toggleMute = useCallback(() => {
    const nextMute = !isMuted;
    setIsMuted(nextMute);
    localStorage.setItem('pill_game_muted', nextMute.toString());
    
    if (nextMute) {
      if (bgmGainNodeRef.current) {
        bgmGainNodeRef.current.gain.setTargetAtTime(0, audioCtxRef.current?.currentTime || 0, 0.1);
      }
    } else {
      if (bgmGainNodeRef.current) {
        const targetVol = audioSettings?.volume || 0.5;
        bgmGainNodeRef.current.gain.setTargetAtTime(targetVol, audioCtxRef.current?.currentTime || 0, 0.1);
      } else {
        const currentType = gameState === 'playing' ? 'gameplay' : (gameState === 'result' ? 'ending' : 'opening');
        playBgm(currentType);
      }
    }
  }, [isMuted, gameState, playBgm, audioSettings]);

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

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    
    // 브라우저 오토플레이 방지 정책 대응: 첫 상호작용 시 오디오 잠금 해제 및 즉시 재생
    const unblockAudio = () => {
      if (!audioBlocked) return;
      
      initAudioCtx();
      setAudioBlocked(false);
      
      const currentType = gameState === 'playing' ? 'gameplay' : (gameState === 'result' ? 'ending' : 'opening');
      playBgm(currentType);

      window.removeEventListener('click', unblockAudio, true);
      window.removeEventListener('touchstart', unblockAudio, true);
    };
    
    if (audioBlocked) {
      window.addEventListener('click', unblockAudio, true);
      window.addEventListener('touchstart', unblockAudio, true);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('click', unblockAudio, true);
      window.removeEventListener('touchstart', unblockAudio, true);
    };
  }, [gameState, playBgm, initAudioCtx, audioBlocked]);
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

  const OpeningBgStyle = useCallback(() => {
    const isMo = windowWidth < 640;
    const defaultImg = isMo ? OPENING_BG_IMAGE_MO : OPENING_BG_IMAGE_PC;
    const activeUrl = isMo ? openingBgImageMo : openingBgImage;
    
    // 유효한 URL인지 확인 (공백이나 'undefined' 문자열 제외)
    const url = (activeUrl && activeUrl.trim() !== "" && activeUrl !== 'undefined') ? activeUrl : defaultImg;
    
    return {
      backgroundImage: `url("${url}")`,
      backgroundColor: '#f0f7ff',
      opacity: 1
    };
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
            {/* 고정 배경 레이어: 배경이 사라지지 않도록 구조 강화 */}
            <div className="absolute inset-0 z-0 bg-[#f0f7ff]">
              <div 
                className="w-full h-full bg-cover bg-center no-repeat" 
                style={OpeningBgStyle()} 
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
            
            {/* Main Action Hub - 유동적인 레이아웃을 위해 absolute와 비율 기반 높이(%) 및 너비(vw) 사용 */}
            <div className="absolute top-[45%] sm:top-[42%] left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-6 z-20">
              {/* motion.button으로 부드러운 애니메이션 효과 부여 */}
              <motion.button 
                onClick={() => {
                  if (audioBlocked) setAudioBlocked(false);
                  setGameState('how-to');
                }} 
                animate={{ scale: [1, 1.05, 1] }} 
                transition={{ repeat: Infinity, duration: 2 }}
              >
                {/* 
                  [시작 버튼 수정 가이드]
                  1. PC 크기: sm:w-[11.2vw] (기존 8vw에서 140% 확대)
                  2. PC 높이: sm:top-[35%] (기존 50%에서 위로 상향 조정)
                  3. 브라우저 크기 대응: vw(viewport width) 단위를 사용하여 창 크기에 따라 실시간 반영
                */}
                <img 
                  src={safeUrl(startButtonImage) || START_BUTTON_IMAGE} 
                  alt="시작" 
                  className="w-[32vw] sm:w-[11.2vw] h-auto drop-shadow-[0_20px_50px_rgba(0,0,0,0.5)] hover:scale-110 transition-all active:scale-95" 
                  referrerPolicy="no-referrer" 
                />
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
          <motion.div key="how-to" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[210] flex items-center justify-center p-0 sm:p-4">
            <div className="max-w-7xl w-full bg-transparent sm:bg-white/95 sm:backdrop-blur-xl sm:rounded-[2.5rem] p-4 sm:p-10 flex flex-col gap-3 sm:gap-6 max-h-screen sm:max-h-[98vh] sm:border sm:border-white/20 overflow-hidden">
              <div className="flex flex-col items-center sm:items-start sm:flex-row sm:justify-between gap-1 sm:gap-4 pb-2 sm:pb-4 border-b border-white/20 sm:border-slate-100 shrink-0">
                <h2 className="text-3xl sm:text-5xl font-black text-white sm:text-slate-800 tracking-tighter">게임 설명</h2>
                <div className="hidden sm:block text-right">
                  <p className="text-emerald-600 font-black text-xl">의약품 안전 상식 퀴즈</p>
                  <p className="text-slate-400 font-bold text-xs">올바른 의약품을 클릭하여 높은 점수를 획득하세요!</p>
                </div>
              </div>

              {/* PC 전용 레이아웃 (768px 이상) */}
              <div className="hidden sm:grid flex-1 overflow-y-auto grid-cols-2 gap-4 gap-y-6 pr-1 custom-scrollbar">
                {pillConfigs.filter(p => !p.disabled).map(p => (
                  <motion.div 
                    key={p.id} 
                    whileHover={{ scale: 1.01 }}
                    className="flex flex-row items-center text-left bg-slate-50/50 p-6 rounded-3xl border border-slate-100/50 hover:bg-white hover:shadow-lg transition-all gap-8"
                  >
                    <div className="w-32 h-32 flex items-center justify-center bg-white rounded-full shadow-inner p-4 shrink-0">
                      {p.image ? (
                        <img 
                          src={safeUrl(p.image)} 
                          alt="" 
                          className="w-full h-full object-contain filter drop-shadow-md" 
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-20 h-20 rounded-full" style={{backgroundColor: p.color}}/>
                      )}
                    </div>
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="font-black text-slate-800 text-3xl tracking-tight leading-tight">{p.label}</div>
                      {p.description && <div className="text-sm text-slate-500 font-bold leading-tight line-clamp-2">{p.description}</div>}
                      <div className={`mt-2 font-black text-3xl ${p.score > 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                        {p.score > 0 ? `+${p.score}` : p.score}
                        <span className="ml-1 text-base opacity-60 font-black">점</span>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* 모바일 전용 레이아웃 (768px 미만) */}
              <div className="grid sm:hidden flex-1 overflow-hidden grid-cols-2 gap-px bg-slate-100/20 rounded-2xl border border-slate-100/40">
                {pillConfigs.filter(p => !p.disabled).map(p => (
                  <motion.div 
                    key={p.id} 
                    className="flex flex-row items-center text-left bg-white p-3 gap-3 overflow-hidden"
                  >
                    <div className="w-20 h-20 flex items-center justify-center p-1 shrink-0">
                      {p.image ? (
                        <img 
                          src={safeUrl(p.image)} 
                          alt="" 
                          className="w-full h-full object-contain" 
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-14 h-14 rounded-full" style={{backgroundColor: p.color}}/>
                      )}
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col items-start space-y-1 overflow-visible py-1">
                      <div className="font-black text-slate-800 text-[16px] tracking-tight leading-[1.1] w-full whitespace-normal break-keep uppercase">{p.label}</div>
                      <div className={`font-black text-[14px] ${p.score > 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                        {p.score > 0 ? `+${p.score}` : p.score}
                        <span className="ml-1 text-[11px] opacity-60 font-black">점</span>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>

              <div className="flex flex-col items-center sm:flex-row sm:justify-between gap-3 sm:gap-4 pt-4 sm:pt-4 shrink-0 mb-2 sm:mb-0">
                <div className="text-center sm:text-left">
                  <p className="text-white sm:text-slate-500 font-black text-xl sm:text-2xl animate-pulse -mt-1 sm:mt-0">알맞은 의약품 정보만 클릭하세요!</p>
                  <p className="hidden sm:block text-slate-300 text-[10px] mt-0.5 font-bold">오답일 경우 점수가 감점되니 주의해 주세요.</p>
                </div>
                <button 
                  onClick={startGame} 
                  className="w-full sm:w-auto px-10 sm:px-16 py-3.5 sm:py-5 bg-gradient-to-r from-emerald-500 to-sky-500 text-white text-lg sm:text-3xl font-black rounded-2xl sm:rounded-3xl hover:from-emerald-600 hover:to-sky-600 transition-all shadow-2xl active:scale-95 flex items-center justify-center gap-4"
                >
                  시작하기 <ArrowRight className="w-5 h-5 sm:w-8 sm:h-8" />
                </button>
              </div>
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
                
                <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="space-y-8 z-10">
                  <div className="py-2 sm:py-10">
                    <div className="text-gray-400 font-black text-xl sm:text-2xl mb-4 tracking-widest uppercase">최종 점수</div>
                    <div className="text-8xl sm:text-[12rem] font-black text-sky-600 leading-none tracking-tighter tabular-nums drop-shadow-md">
                      {score}
                    </div>
                  </div>
                </motion.div>
              </div>

              {/* 우측: 등급 및 행동 - 경쾌한 그린/블루 톤 */}
              <div className="flex-1 p-6 sm:p-12 flex flex-col items-center justify-between bg-white shrink-0">
                <div className="w-full space-y-6 sm:space-y-10 text-center sm:text-left">
                  {/* 등급 시스템 */}
                  <div className="space-y-3 sm:space-y-5">
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

                {/* 하단 로고 */}
                <div className="pt-8 sm:pt-20 w-full flex flex-col items-center">
                  <a href="https://www.drugsafe.or.kr" target="_blank" rel="noopener noreferrer" className="hover:scale-110 transition-transform">
                    <img 
                      src="https://raw.githubusercontent.com/alt9874/game/main/logo.png" 
                      alt="한국의약품안전관리원" 
                      className="h-14 sm:h-24 object-contain" 
                      referrerPolicy="no-referrer" 
                    />
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
                <h3 className="text-sm font-black text-slate-800">아이템 구성 정보 (이름, 점수, 크기, 빈도, 이미지 등)</h3>
                <button onClick={() => setLocalPills([...localPills, { id: Date.now(), label: '새 아이템', score: 10, width: 100, freq: 1.0, color: '#141414', type: 'good', image: '' }])} className="px-4 py-2 bg-slate-900 text-white text-xs font-black rounded-lg hover:bg-emerald-500 hover:text-slate-900 transition-all flex items-center gap-2 tracking-tighter">추가하기 <ArrowRight size={14}/></button>
              </div>

              <div className="border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
                <div className="grid grid-cols-[50px_1fr_1.5fr_0.4fr_0.4fr_0.4fr_0.4fr_0.4fr_1fr_0.8fr_50px] bg-slate-50 border-b border-slate-100 text-[10px] font-black text-slate-400 py-3 px-2">
                  <div className="text-center italic">정렬</div>
                  <div className="px-2">이름</div>
                  <div className="px-2">설명(설명화면용)</div>
                  <div className="text-center">점수</div>
                  <div className="text-center">크기</div>
                  <div className="text-center">빈도</div>
                  <div className="text-center italic">회전X</div>
                  <div className="text-center italic">각도</div>
                  <div className="px-2">이미지 주소</div>
                  <div className="text-center">분류</div>
                  <div className="text-center">삭제</div>
                </div>
                {localPills.map((p, idx) => (
                  <div key={idx} className="grid grid-cols-[50px_1fr_1.5fr_0.4fr_0.4fr_0.4fr_0.4fr_0.4fr_1fr_0.8fr_50px] border-b border-slate-50 hover:bg-slate-50 transition-all items-center">
                    <div className="p-2 border-r border-slate-50 flex flex-col gap-1 items-center">
                      <button onClick={() => moveItem(idx, 'up')} className="p-1 hover:bg-slate-200 rounded text-slate-400 hover:text-slate-900"><ArrowUp size={12}/></button>
                      <button onClick={() => moveItem(idx, 'down')} className="p-1 hover:bg-slate-200 rounded text-slate-400 hover:text-slate-900"><ArrowDown size={12}/></button>
                    </div>
                    <div className="p-2 border-r border-slate-50">
                      <input type="text" value={p.label} onChange={e => { const n = [...localPills]; n[idx].label = e.target.value; setLocalPills(n); }} className="w-full bg-transparent font-bold text-xs text-slate-800 outline-none" />
                    </div>
                    <div className="p-2 border-r border-slate-50">
                      <input type="text" value={p.description || ''} placeholder="아이템 설명" onChange={e => { const n = [...localPills]; n[idx].description = e.target.value; setLocalPills(n); }} className="w-full bg-transparent text-[10px] text-slate-600 outline-none" />
                    </div>
                    <div className="p-1 border-r border-slate-50 font-mono text-xs text-center">
                        <input type="number" value={p.score} onChange={e => { const n = [...localPills]; n[idx].score = parseInt(e.target.value); setLocalPills(n); }} className="w-full bg-transparent text-center outline-none font-bold text-emerald-600" />
                    </div>
                    <div className="p-1 border-r border-slate-50 font-mono text-xs text-center">
                        <input type="number" value={p.width || 100} placeholder="크기" onChange={e => { const n = [...localPills]; n[idx].width = parseInt(e.target.value); setLocalPills(n); }} className="w-full bg-transparent text-center outline-none font-bold text-sky-600" />
                    </div>
                    <div className="p-1 border-r border-slate-50 font-mono text-xs text-center">
                        <input type="number" step="0.1" value={p.freq || 1.0} placeholder="빈도" onChange={e => { const n = [...localPills]; n[idx].freq = parseFloat(e.target.value); setLocalPills(n); }} className="w-full bg-transparent text-center outline-none font-bold text-amber-600" />
                    </div>
                    <div className="p-1 border-r border-slate-50 flex justify-center">
                        <input type="checkbox" checked={p.noRotation || false} onChange={e => { const n = [...localPills]; n[idx].noRotation = e.target.checked; setLocalPills(n); }} className="w-4 h-4 cursor-pointer" />
                    </div>
                    <div className="p-1 border-r border-slate-50 font-mono text-xs text-center">
                        <input type="number" value={p.initialAngle || 0} onChange={e => { const n = [...localPills]; n[idx].initialAngle = parseInt(e.target.value); setLocalPills(n); }} className="w-full bg-transparent text-center outline-none font-bold text-slate-500" />
                    </div>
                    <div className="p-2 border-r border-slate-50">
                        <input type="text" value={p.image || ''} placeholder="이미지 주소" onChange={e => { const n = [...localPills]; n[idx].image = e.target.value; setLocalPills(n); }} className="w-full bg-transparent text-[10px] font-mono outline-none text-slate-400 focus:text-slate-900" />
                    </div>
                    <div className="p-2 border-r border-slate-50 flex justify-center">
                        <select value={p.type} onChange={e => { const n = [...localPills]; n[idx].type = e.target.value; setLocalPills(n); }} className="bg-white border border-slate-200 rounded-md px-1 py-1 text-[9px] font-black outline-none cursor-pointer">
                            <option value="good">긍정</option>
                            <option value="bad">부정</option>
                        </select>
                    </div>
                    <div className="p-2 flex justify-center">
                        <button onClick={() => setLocalPills(localPills.filter((_, i) => i !== idx))} className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-rose-50 text-rose-300 hover:text-rose-500 transition-all"><Trash2 size={14}/></button>
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
