// minigame_snake.js
// A Snake minigame prototype.
// Notes:
//  - Local-only singleplayer; state stored in localStorage.
//  - Access is gated by relax_prompt eligibility.
//  - Classic Snake gameplay with scoring.

// 2026/03/31 edited by Zikai Lu
// Changes:
//  - Add scheduled save strategy to reduce high-frequency localStorage writes.
//  - Persist only stable snake fields to shrink payload and keep save compatibility.

import { hasDiceBuildEligibility, consumeDiceBuildEligibility } from './relax_prompt.js';
import { closeMinigameSection, openMinigameHub, showMinigamePanel, showMinigameSection } from './minigame_hub.js';
import { getEnabledSkinForGame } from './collection_api.js';
import { showToast } from './utils.js';
import { LOCAL_STORAGE_KEYS, createScheduledSaver, readJsonSafe, writeJsonSafe } from './local_storage.js';
import { reportAchievementMax } from './achievement_events.js';

const SAVE_KEY = LOCAL_STORAGE_KEYS.snakeSave;
const HIST_KEY = LOCAL_STORAGE_KEYS.snakeHistory;
const DEFAULT_SKIN_ID = 'default';

const COLS = 20;
const ROWS = 20;
const EMPTY = 0;
const SNAKE = 1;
const FOOD = 2;

const SNAKE_SKINS = {
  default: {
    boardClass: '',
  },
  skin_snake_nebula: {
    boardClass: 'snake-skin-nebula',
  },
};

function defaultState() {
  return {
    version: 1,
    board: null,
    snake: [],
    direction: { x: 1, y: 0 },
    nextDirection: { x: 1, y: 0 },
    food: null,
    score: 0,
    highScore: 0,
    gameOver: false,
    paused: false,
    playing: false,
    gameLoop: null,
    lastMove: 0,
    speed: 150,
    skinId: DEFAULT_SKIN_ID,
  };
}

function toPersistedState(st) {
  return {
    version: 1,
    snake: Array.isArray(st?.snake) ? st.snake : [],
    direction: st?.direction || { x: 1, y: 0 },
    nextDirection: st?.nextDirection || { x: 1, y: 0 },
    food: st?.food || null,
    score: Number(st?.score) || 0,
    highScore: Number(st?.highScore) || 0,
    gameOver: !!st?.gameOver,
    paused: !!st?.paused,
    playing: !!st?.playing,
    speed: Number(st?.speed) || 150,
    skinId: typeof st?.skinId === 'string' ? st.skinId : DEFAULT_SKIN_ID,
  };
}

const saver = createScheduledSaver({
  key: SAVE_KEY,
  select: toPersistedState,
  minDelayMs: 900,
});

function normalizeLoadedState(raw) {
  if (!raw || raw.version !== 1) return null;
  const skinId = typeof raw.skinId === 'string' && raw.skinId in SNAKE_SKINS
    ? raw.skinId
    : DEFAULT_SKIN_ID;
  return { ...raw, skinId, paused: !!raw.paused };
}

async function syncSkinFromCollection(st) {
  if (!st) return;
  try {
    const skin = await getEnabledSkinForGame('snake');
    const nextSkinId = skin?.itemId && skin.itemId in SNAKE_SKINS ? skin.itemId : DEFAULT_SKIN_ID;
    st.skinId = nextSkinId;
    save(st);
  } catch {
    st.skinId = DEFAULT_SKIN_ID;
  }
}

function readJson(key, fallback) {
  return readJsonSafe(key, fallback);
}

function writeJson(key, value) {
  writeJsonSafe(key, value);
}

function save(st, { immediate = false } = {}) {
  if (immediate) {
    saver.saveNow(st);
    return;
  }
  saver.schedule(st);
}

function load() {
  const st = readJson(SAVE_KEY, null);
  return normalizeLoadedState(st);
}

function pushHistory(entry) {
  const list = readJson(HIST_KEY, []);
  list.push({ ...entry, ts: Date.now() });
  writeJson(HIST_KEY, list);
}

function createBoard() {
  return Array(ROWS).fill(null).map(() => Array(COLS).fill(EMPTY));
}

function copyBoard(board) {
  return board.map(row => [...row]);
}

function initGame(st) {
  st.board = createBoard();
  st.snake = [
    { x: 5, y: 10 },
    { x: 4, y: 10 },
    { x: 3, y: 10 },
  ];
  st.direction = { x: 1, y: 0 };
  st.nextDirection = { x: 1, y: 0 };
  st.food = spawnFood(st);
  st.score = 0;
  st.gameOver = false;
  st.paused = false;
  st.playing = true;
  st.lastMove = Date.now();
}

function spawnFood(st) {
  const emptyCells = [];
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const isSnake = st.snake.some(s => s.x === x && s.y === y);
      if (!isSnake) emptyCells.push({ x, y });
    }
  }
  if (emptyCells.length === 0) return null;
  return emptyCells[Math.floor(Math.random() * emptyCells.length)];
}

function startGame(st) {
  const saved = load();
  if (saved && saved.highScore) {
    st.highScore = saved.highScore;
    reportAchievementMax('snake_best_score', st.highScore);
  }
  initGame(st);
  save(st, { immediate: true });
}

function changeDirection(st, dx, dy) {
  const curr = st.direction;
  if (curr.x === -dx && curr.y === -dy) return;
  st.nextDirection = { x: dx, y: dy };
}

function moveSnake(st, els) {
  if (st.gameOver || !st.playing || st.paused) return;

  st.direction = { ...st.nextDirection };

  const head = st.snake[0];
  const newHead = {
    x: head.x + st.direction.x,
    y: head.y + st.direction.y,
  };

  if (newHead.x < 0 || newHead.x >= COLS || newHead.y < 0 || newHead.y >= ROWS) {
    endGame(st, els, 'lose');
    return;
  }

  if (st.snake.some(s => s.x === newHead.x && s.y === newHead.y)) {
    endGame(st, els, 'lose');
    return;
  }

  st.snake.unshift(newHead);

  if (newHead.x === st.food.x && newHead.y === st.food.y) {
    st.score += 10;
    if (st.score > st.highScore) {
      st.highScore = st.score;
      reportAchievementMax('snake_best_score', st.highScore);
    }
    st.food = spawnFood(st);
    if (!st.food) {
      endGame(st, els, 'win');
      return;
    }
  } else {
    st.snake.pop();
  }

  save(st, { immediate: true });
}

function endGame(st, els, result = 'lose') {
  st.gameOver = true;
  st.playing = false;
  if (st.gameLoop) {
    clearInterval(st.gameLoop);
    st.gameLoop = null;
  }
  st.paused = false;
  consumeDiceBuildEligibility();
  save(st);
  pushHistory({ result, score: st.score });
  if (els?.toastEl) showToast(els.toastEl, `Snake over - score ${st.score}`);
  if (els) openMinigameHub(els, { bypassGate: true, reason: 'hub' });
}

function render(els, st) {
  if (!els || !st) return;

  if (els.snakeRoot) {
    const skin = SNAKE_SKINS[st.skinId] || SNAKE_SKINS[DEFAULT_SKIN_ID];
    for (const entry of Object.values(SNAKE_SKINS)) {
      if (entry.boardClass) els.snakeRoot.classList.remove(entry.boardClass);
    }
    els.snakeRoot.dataset.snakeSkin = st.skinId;
    if (skin.boardClass) els.snakeRoot.classList.add(skin.boardClass);
  }

  if (els.snakeScore) els.snakeScore.textContent = st.score;
  if (els.snakeHighScore) els.snakeHighScore.textContent = st.highScore;

  if (els.snakeStatus) {
    if (st.gameOver) els.snakeStatus.textContent = 'Game Over';
    else if (st.paused) els.snakeStatus.textContent = 'Paused';
    else if (st.playing) els.snakeStatus.textContent = 'Playing';
    else els.snakeStatus.textContent = 'Ready';
  }

  if (els.snakeStartBtn) {
    els.snakeStartBtn.disabled = false;
    els.snakeStartBtn.textContent = (st.playing && st.paused) ? 'Resume' : 'Start';
    els.snakeStartBtn.style.display = 'none';
  }

  if (els.snakePauseBtn) {
    els.snakePauseBtn.disabled = !st.playing || st.gameOver;
    els.snakePauseBtn.textContent = st.paused ? 'Resume' : 'Pause';
    els.snakePauseBtn.style.display = st.playing && !st.gameOver ? 'inline-block' : 'none';
  }

  if (els.snakeScreen && els.snakeScreenTitle && els.snakeScreenBtn) {
    const show = !st.playing || st.paused || st.gameOver;
    els.snakeScreen.classList.toggle('mg-hidden', !show);
    if (st.gameOver) {
      els.snakeScreenTitle.textContent = 'Game Over';
      els.snakeScreenBtn.textContent = 'Restart';
    } else if (st.playing && st.paused) {
      els.snakeScreenTitle.textContent = 'Paused';
      els.snakeScreenBtn.textContent = 'Resume';
    } else {
      els.snakeScreenTitle.textContent = '';
      els.snakeScreenBtn.textContent = 'Start';
    }
  }

  renderBoard(els, st);
}

function renderBoard(els, st) {
  if (!els.snakeBoard) return;

  const display = els.snakeBoard;
  display.innerHTML = '';

  const cellSize = 16;
  display.style.gridTemplateColumns = `repeat(${COLS}, ${cellSize}px)`;
  display.style.gridTemplateRows = `repeat(${ROWS}, ${cellSize}px)`;

  const tempBoard = createBoard();

  if (st.food) {
    tempBoard[st.food.y][st.food.x] = FOOD;
  }

  st.snake.forEach((segment, idx) => {
    if (segment.y >= 0 && segment.y < ROWS && segment.x >= 0 && segment.x < COLS) {
      tempBoard[segment.y][segment.x] = idx === 0 ? SNAKE + 10 : SNAKE;
    }
  });

  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const cell = document.createElement('div');
      cell.className = 'snake-cell';
      const val = tempBoard[y][x];
      if (val === FOOD) {
        cell.classList.add('snake-food');
      } else if (val === SNAKE + 10) {
        cell.classList.add('snake-head');
      } else if (val === SNAKE) {
        cell.classList.add('snake-body');
        const depth = Math.min(st.snake.findIndex((segment) => segment.x === x && segment.y === y), 9);
        cell.style.setProperty('--snake-depth', String(depth < 0 ? 0 : depth));
      }
      display.appendChild(cell);
    }
  }
}

function showSnakeView(els) {
  showMinigamePanel(els, 'snake');
  if (els?.snakeHint) els.snakeHint.textContent = '';
}

function attachHandlers(els, stRef) {
  const ui = els;

  const pauseSnake = (st) => {
    if (!st || !st.playing || st.gameOver) return;
    st.paused = true;
    save(st);
    render(ui, st);
  };

  const resumeSnake = (st) => {
    if (!st || !st.playing || st.gameOver) return;
    st.paused = false;
    st.lastMove = Date.now();
    save(st);
    render(ui, st);
  };

  const startOrResumeSnake = () => {
    const st = stRef.current;
    if (!st) return;
    if (!st.playing || st.gameOver) {
      startGame(st);
      startGameLoop(st, ui);
      render(ui, st);
      return;
    }
    if (st.paused) {
      resumeSnake(st);
    }
  };

  const stopSnakeLoop = () => {
    const st = stRef.current;
    if (!st) return;
    if (st.gameLoop) {
      clearInterval(st.gameLoop);
      st.gameLoop = null;
    }
    st.playing = false;
    st.paused = false;
    save(st);
  };

  ui.snakeExitBtn?.addEventListener('click', () => {
    stopSnakeLoop();
    openMinigameHub(ui, { bypassGate: true, reason: 'hub' });
  });

  ui.snakeStartBtn?.addEventListener('click', startOrResumeSnake);
  ui.snakeScreenBtn?.addEventListener('click', startOrResumeSnake);

  ui.snakePauseBtn?.addEventListener('click', () => {
    const st = stRef.current;
    if (!st || !st.playing || st.gameOver) return;
    if (st.paused) resumeSnake(st);
    else pauseSnake(st);
  });

  window.addEventListener('keydown', (ev) => {
    const st = stRef.current;
    if (!st || !st.playing || st.gameOver) return;

    switch (ev.key) {
      case 'ArrowUp':
        changeDirection(st, 0, -1);
        ev.preventDefault();
        break;
      case 'ArrowDown':
        changeDirection(st, 0, 1);
        ev.preventDefault();
        break;
      case 'ArrowLeft':
        changeDirection(st, -1, 0);
        ev.preventDefault();
        break;
      case 'ArrowRight':
        changeDirection(st, 1, 0);
        ev.preventDefault();
        break;
      default:
        return;
    }
  });
}

function startGameLoop(st, ui) {
  if (st.gameLoop) clearInterval(st.gameLoop);

  st.lastMove = Date.now();

  st.gameLoop = setInterval(() => {
    const minigameHidden = ui?.viewMinigame?.style.display === 'none' || ui?.snakeRoot?.style.display === 'none';
    if (minigameHidden) {
      clearInterval(st.gameLoop);
      st.gameLoop = null;
      st.playing = false;
      st.paused = false;
      save(st);
      return;
    }

    if (!st.playing || st.gameOver) {
      clearInterval(st.gameLoop);
      st.gameLoop = null;
      return;
    }

    const now = Date.now();
    const elapsed = now - st.lastMove;

    if (elapsed >= st.speed) {
      moveSnake(st, ui);
      st.lastMove = now;

      if (st.gameOver) {
        clearInterval(st.gameLoop);
        st.gameLoop = null;
      }
      render(ui, st);
    }
  }, 50);
}

function enableGateHint(els, ok) {
  if (!els?.snakeHint) return;
  els.snakeHint.textContent = ok ? '' : 'Only available right after a focus session.';
}

export function mountSnake(els) {
  if (!els?.snakeRoot) return;

  const stRef = { current: null };
  els.__snake = stRef;

  attachHandlers(els, stRef);

  const loaded = load();
  const st = defaultState();
  if (loaded && Number.isFinite(Number(loaded.highScore))) {
    st.highScore = Math.max(0, Number(loaded.highScore) || 0);
  }
  if (loaded && typeof loaded.skinId === 'string' && loaded.skinId in SNAKE_SKINS) {
    st.skinId = loaded.skinId;
  }
  st.playing = false;
  st.paused = false;
  st.gameLoop = null;
  stRef.current = st;
  save(st);
  syncSkinFromCollection(st).then(() => render(els, st));
  render(els, st);

  window.addEventListener('collection:skin-changed', () => {
    const cur = stRef.current;
    if (!cur) return;
    syncSkinFromCollection(cur).then(() => render(els, cur));
  });

  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => {
      saver.saveNow(stRef.current || null);
    });
    window.snakeOpen = () => openSnake(els, { reason: 'dev' });
  }
}

export function openSnake(els, meta) {
  if (!els?.viewMinigame) return;

  const bypass = meta?.bypassGate === true;
  const ok = bypass || hasDiceBuildEligibility() || meta?.reason === 'dev';
  if (!ok) {
    enableGateHint(els, false);
    showToast(els.toastEl, 'Minigame is only available after focus completion.');
    return;
  }

  showMinigameSection(els);
  showSnakeView(els);
  enableGateHint(els, true);

  const stRef = els.__snake;
  if (!stRef?.current) {
    stRef.current = defaultState();
  }
  syncSkinFromCollection(stRef.current).finally(() => {
    render(els, stRef.current);
  });
}

export function closeSnake(els) {
  const stRef = els?.__snake;
  const st = stRef?.current;
  if (st?.gameLoop) {
    clearInterval(st.gameLoop);
    st.gameLoop = null;
  }
  if (st) {
    st.playing = false;
    st.paused = false;
    save(st, { immediate: true });
  }
  saver.cancel();
  closeMinigameSection(els);
}
