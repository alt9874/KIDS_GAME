import fs from 'fs';

const filePath = 'src/App.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// Fix 1: Audio useEffect corruption
const corruptedAudio = content.match(/const handleResize = \(\) => setWin\s+return \(\) => \{/);
if (corruptedAudio) {
  content = content.replace(corruptedAudio[0], `const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    
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

    return () => {`);
}

// Fix 2: Duplicated and corrupted game logic
// We'll replace the whole messy middle section by finding the stable markers
const startMarker = "unsubConfig\\(\\); };\\r?\\n\\s*}, \\[\\]\\);";
const endMarker = "const handleHitResult = useCallback\\(\\(point: number, isGood: boolean\\) => \\{";

// Instead of complex regex, let's just do sequential replacements of known bad chunks
content = content.replace(/const startGame = \(\) =  \}, \[combo, playSfx\]\);\\tats\(\); unsubConfig\(\); \};/g, "");

// Specifically target the doubled up startGame/finishGame
const doublePattern = /const startGame = \(\) => \{ setScore\(0\); setCombo\(0\); setGameState\('playing'\); \};\s*const finishGame = useCallback\(\(\) => \{\s*setGameState\('result'\);\s*\}, \[\]\);\s*\/\/ 게임 종료 시 고득점 체크\s*useEffect\(\(\) => \{\s*if \(gameState === 'result' && score > highScore\) \{\s*setHighScore\(score\);\s*localStorage\.setItem\('pill_game_high_score', score\.toString\(\)\);\s*\}\s*\}, \[gameState, score, highScore\]\);/g;

// Fix finishGame logic to be stable (removing score dependency)
content = content.replace(/const finishGame = useCallback\(\(\) => \{\s*setGameState\('result'\);\s*if \(score > highScore\) \{ setHighScore\(score\); localStorage\.setItem\('pill_game_high_score', score\.toString\(\)\); \}\s*\}, \[score, highScore\]\);/g, `const finishGame = useCallback(() => {
    setGameState('result');
  }, []);

  useEffect(() => {
    if (gameState === 'result' && score > highScore) {
      setHighScore(score);
      localStorage.setItem('pill_game_high_score', score.toString());
    }
  }, [gameState, score, highScore]);`);

// Remove any remaining residue of the corrupted line
content = content.replace(/\\rim\(\)\) setPlayBgImageMo\(d\.playBgImageMo\);/g, "");

// Specifically remove the redundant extra callback closing at lines 602-603 area
content = content.replace(/\s+\},\s+\[\]\);\s+\},\s+\[\]\);/g, "\n  }, []);");

fs.writeFileSync(filePath, content);
console.log('File fixed successfully');
