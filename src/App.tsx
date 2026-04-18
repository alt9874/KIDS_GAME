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
import { db } from './lib/firebase';

// ==========================================
// 1. 상수 및 설정 (DB 연동 및 기본값)
// ==========================================

// [설정 가이드]: 아래 이미지 URL들을 실제 사용하실 이미지 경로로 교체하세요.
const OPENING_BG_IMAGE_PC = "https://images.unsplash.com/photo-1542884748-2b87b36c6b90?q=80&w=2070&auto=format&fit=crop";
const OPENING_BG_IMAGE_MO = "https://images.unsplash.com/photo-1542884748-2b87b36c6b90?q=80&w=2070&auto=format&fit=crop";
const PLAY_BG_IMAGE_PC = "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?q=80&w=2070&auto=format&fit=crop";
const PLAY_BG_IMAGE_MO = "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?q=80&w=2070&auto=format&fit=crop";
const START_BUTTON_IMAGE = "https://placehold.co/400x120/4da6ff/ffffff?text=START+GAME";
const BGM_URL = "https://cdn.pixabay.com/audio/2022/01/18/audio_d0a13f69d2.mp3"; // 경쾌한 배경음악

// 의약품 및 건강 정보 설정 (아이템)
// type: 'good' (점수 가점), 'bad' (점수 감점)
const PILL_CONFIGS = [
  { id: 1, label: '식후 30분 복용', score: 10, color: '#2ecc71', type: 'good', freq: 1.0, image: 'https://cdn-icons-png.flaticon.com/512/822/822143.png' },
  { id: 2, label: '적정 용량 준수', score: 10, color: '#2ecc71', type: 'good', freq: 1.0, image: 'https://cdn-icons-png.flaticon.com/512/4320/4320350.png' },
  { id: 3, label: '유효기간 확인', score: 15, color: '#2ecc71', type: 'good', freq: 0.8, image: 'https://cdn-icons-png.flaticon.com/512/2693/2693510.png' },
  { id: 4, label: '물과 함께 복용', score: 15, color: '#2ecc71', type: 'good', freq: 0.8, image: 'https://cdn-icons-png.flaticon.com/512/3100/3100566.png' },
  { id: 5, label: '유통기한 경과', score: -10, color: '#e74c3c', type: 'bad', freq: 0.7, image: 'https://cdn-icons-png.flaticon.com/512/564/564619.png' },
  { id: 6, label: '임의 용량 조절', score: -20, color: '#e74c3c', type: 'bad', freq: 0.6, image: 'https://cdn-icons-png.flaticon.com/512/752/752630.png' },
  { id: 7, label: '탄산음료와 복용', score: -30, color: '#e74c3c', type: 'bad', freq: 0.5, image: 'https://cdn-icons-png.flaticon.com/512/2405/2405479.png' },
  { id: 8, label: '중복 복용', score: -50, color: '#e74c3c', type: 'bad', freq: 0.4, image: 'https://cdn-icons-png.flaticon.com/512/2966/2966455.png' },
];

// ==========================================
// 2. 타입 정의
// ==========================================
type GameState = 'start' | 'how-to' | 'playing' | 'result';

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
// 3. 메인 컴포넌트
// ==========================================
export default function App() {
  // --- 상태 관리 ---
  const [gameState, setGameState] = useState<GameState>('start');
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(30);
  const [pills, setPills] = useState<Pill[]>([]);
  const [popups, setPopups] = useState<ScorePopup[]>([]);
  const [combo, setCombo] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [totalVisits, setTotalVisits] = useState(0);

  // --- DB 설정 상태 (Firebase) ---
  const [pillConfigs, setPillConfigs] = useState(PILL_CONFIGS);
  const [gameSpeed, setGameSpeed] = useState({ duration: 30, spawnInterval: 800 });
  const [openingBgImage, setOpeningBgImage] = useState("");
  const [startButtonImage, setStartButtonImage] = useState("");
  const [btnImageError, setBtnImageError] = useState(false);

  // --- Refs ---
  const containerRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const gameLoopRef = useRef<number | null>(null);
  const spawnTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastTimeRef = useRef<number>(0);

  // ==========================================
  // 4. 데이터베이스 연동 (Firestore)
  // ==========================================
  
  // 4-1. 방문자 카운트 및 초기 설정 불러오기
  useEffect(() => {
    const initData = async () => {
      try {
        const statsRef = doc(db, 'stats', 'global');
        const statsSnap = await getDoc(statsRef);
        
        if (statsSnap.exists()) {
          setTotalVisits(statsSnap.data().totalVisits || 0);
          await updateDoc(statsRef, { totalVisits: increment(1) });
        } else {
          await setDoc(statsRef, { totalVisits: 1 });
        }

        // 설정 불러오기
        const configRef = doc(db, 'settings', 'game');
        const configSnap = await getDoc(configRef);
        if (configSnap.exists()) {
          const data = configSnap.data();
          if (data.pillConfigs) setPillConfigs(data.pillConfigs);
          if (data.duration) setTimeLeft(data.duration);
          if (data.gameSpeed) setGameSpeed(data.gameSpeed);
          if (data.openingBgImage) setOpeningBgImage(data.openingBgImage);
          if (data.startButtonImage) setStartButtonImage(data.startButtonImage);
        }
      } catch (err) {
        console.error("데이터 로딩 실패:", err);
      }
    };

    initData();
    
    // 로컬 최고 점수
    const saved = localStorage.getItem('pill_game_high_score');
    if (saved) setHighScore(parseInt(saved));

    // 배경음악 설정
    audioRef.current = new Audio(BGM_URL);
    audioRef.current.loop = true;
    
    return () => {
      stopGame();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // 오디오 재생 처리
  const playBgm = () => {
    if (audioRef.current && !isMuted) {
      audioRef.current.play().catch(() => {
        setAudioBlocked(true);
      });
    }
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
    if (audioRef.current) {
      audioRef.current.muted = !isMuted;
      if (!isMuted) audioRef.current.pause();
      else audioRef.current.play();
    }
  };

  // ==========================================
  // 5. 게임 로직
  // ==========================================

  const startGame = () => {
    setScore(0);
    setTimeLeft(gameSpeed.duration || 30);
    setPills([]);
    setPopups([]);
    setCombo(0);
    setGameState('playing');
    playBgm();
  };

  const stopGame = () => {
    if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
    if (spawnTimerRef.current) clearInterval(spawnTimerRef.current);
  };

  const finishGame = useCallback(() => {
    stopGame();
    setGameState('result');
    if (score > highScore) {
      setHighScore(score);
      localStorage.setItem('pill_game_high_score', score.toString());
    }
  }, [score, highScore]);

  // 아이템 생성
  const spawnPill = useCallback(() => {
    if (!containerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const enabledConfigs = pillConfigs.filter(p => (p as any).enabled !== false);
    
    // 빈도 가중치 기반 랜덤 선택
    const totalFreq = enabledConfigs.reduce((sum, p) => sum + (p.freq || 1), 0);
    let rand = Math.random() * totalFreq;
    let selectedConfig = enabledConfigs[0];
    
    for (const config of enabledConfigs) {
      if (rand < (config.freq || 1)) {
        selectedConfig = config;
        break;
      }
      rand -= (config.freq || 1);
    }

    const size = window.innerWidth < 640 ? 70 : 100; // 모바일 70px, PC 100px
    const x = Math.random() * (rect.width - size);
    
    const newPill: Pill = {
      id: Date.now() + Math.random(),
      configId: selectedConfig.id,
      label: selectedConfig.label,
      score: selectedConfig.score,
      color: selectedConfig.color,
      type: selectedConfig.type,
      image: selectedConfig.image,
      x,
      y: -size,
      vx: (Math.random() - 0.5) * 2,
      vy: 2 + Math.random() * 3,
      width: size,
      height: size,
      angle: Math.random() * 360,
      angularVelocity: (Math.random() - 0.5) * 10
    };

    setPills(prev => [...prev, newPill]);
  }, [pillConfigs]);

  // 게임 루프 및 타이머
  useEffect(() => {
    if (gameState === 'playing') {
      // 1초마다 타이머 감소
      const timer = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            finishGame();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      // 아이템 생성 주기
      spawnTimerRef.current = setInterval(() => {
        spawnPill();
      }, gameSpeed.spawnInterval || 800);

      // 물리 엔진 (애니메이션 루프)
      const loop = (time: number) => {
        const dt = time - lastTimeRef.current;
        lastTimeRef.current = time;

        setPills(prev => {
          return prev
            .map(p => ({
              ...p,
              x: p.x + p.vx,
              y: p.y + p.vy,
              angle: p.angle + p.angularVelocity
            }))
            .filter(p => {
              if (!containerRef.current) return false;
              const rect = containerRef.current.getBoundingClientRect();
              return p.y < rect.height + 100; // 화면 아래로 나가면 제거
            });
        });

        gameLoopRef.current = requestAnimationFrame(loop);
      };

      gameLoopRef.current = requestAnimationFrame(loop);

      return () => {
        clearInterval(timer);
        stopGame();
      };
    }
  }, [gameState, spawnPill, gameSpeed.spawnInterval, finishGame]);

  // 상호작용 (클릭/터치)
  const handleHit = (pill: Pill, e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    
    const pageX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const pageY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;

    // 점수 및 콤보 계산
    if (pill.type === 'good') {
      const bonus = Math.floor(combo / 5) * 2;
      setScore(prev => prev + pill.score + bonus);
      setCombo(prev => prev + 1);
    } else {
      setScore(prev => Math.max(0, prev + pill.score));
      setCombo(0);
    }

    // 팝업 안내
    const newPopup: ScorePopup = {
      id: Date.now(),
      x: pageX,
      y: pageY - 30,
      score: pill.score
    };
    setPopups(prev => [...prev, newPopup]);
    setTimeout(() => {
      setPopups(prev => prev.filter(p => p.id !== newPopup.id));
    }, 800);

    // 제거
    setPills(prev => prev.filter(p => p.id !== pill.id));
  };

  // ==========================================
  // 6. UI 렌더링
  // ==========================================
  
  return (
    <div ref={containerRef} className="fixed inset-0 w-full h-full bg-[#f0f7ff] overflow-hidden font-sans touch-none select-none">
      
      {/* --- 배경 장식 (파스텔 원형) --- */}
      <div className="absolute inset-0 z-0 opacity-40 pointer-events-none">
        <div className="bg-circle w-[400px] h-[400px] top-[-100px] left-[-100px] blur-[100px] bg-blue-200" />
        <div className="bg-circle w-[300px] h-[300px] bottom-[-50px] right-[-50px] blur-[80px] bg-emerald-100" />
      </div>

      <AnimatePresence mode="wait">
        
        {/* 1. 오프닝 화면 */}
        {gameState === 'start' && (
          <>
          {/* 모바일 하단 중앙 배치 등을 위한 컨테이너 */}
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
                    {(!btnImageError) ? (
                      <img 
                        src={(startButtonImage && startButtonImage.trim() !== "" && startButtonImage !== 'undefined') ? startButtonImage : START_BUTTON_IMAGE} 
                        alt="시작" 
                        className="w-[35vw] sm:w-[9vw] h-auto mx-auto hover:scale-110 transition-transform active:scale-95 drop-shadow-2xl" 
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          if (startButtonImage && e.currentTarget.src !== START_BUTTON_IMAGE) {
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
                        {p.image ? (
                          <img src={p.image} alt={p.label} className="w-11 h-11 sm:w-32 sm:h-32 object-contain" referrerPolicy="no-referrer" />
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
                <button onClick={() => setGameState('start')} className="bg-white/90 backdrop-blur px-3 py-2 sm:px-4 sm:py-3 rounded-xl sm:rounded-2xl shadow-xl border border-white hover:bg-white transition-all mb-1 sm:mb-2 flex items-center gap-2">
                  <Home className="w-5 h-5 sm:w-6 sm:h-6 text-gray-600" />
                  <span className="text-xs sm:text-sm font-bold text-gray-600">MAIN</span>
                </button>
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
                {pill.image ? (
                  <img src={pill.image} alt={pill.label} className="w-full h-full object-contain pointer-events-none drop-shadow-md" referrerPolicy="no-referrer" />
                ) : (
                  <span className="drop-shadow-sm break-keep leading-tight px-1">{pill.label}</span>
                )}
              </motion.div>
            ))}

            <AnimatePresence>
              {popups.map(popup => (
                <div key={popup.id} className={`score-popup ${popup.score > 0 ? 'text-emerald-500' : 'text-rose-500'}`} style={{ left: popup.x, top: popup.y }}>
                  {popup.score > 0 ? `+${popup.score}` : popup.score}
                </div>
              ))}
            </AnimatePresence>
            
            {/* 컨트롤러 패널 */}
            <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3">
              <button onClick={toggleMute} className="w-12 h-12 sm:w-14 sm:h-14 bg-white/90 backdrop-blur text-gray-700 rounded-full shadow-2xl flex items-center justify-center hover:bg-white transition-all border border-white">
                {isMuted ? <VolumeX className="w-6 h-6" /> : <Volume2 className="w-6 h-6" />}
              </button>
            </div>
          </div>
        )}

        {/* 4. 결과 화면 */}
        {gameState === 'result' && (
          <motion.div key="result" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} 
            className="fixed inset-0 z-[300] flex flex-col items-center justify-center p-6 bg-slate-900/60 backdrop-blur-xl"
          >
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

      </AnimatePresence>
    </div>
  );
}
