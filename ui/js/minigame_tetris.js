// 2026/03/23 edited by Zikai Lu
// Changes:
//  - Add and keep the starlit Tetris skin (starfield visible only through filled blocks).
//  - Restore classic Tetris visuals as the default skin for normal gameplay.
//  - Keep skin state structure in save data for future skin switching integration.
// =============================================================
// File: minigame_tetris.js
// Purpose: local Tetris gameplay loop, rendering, and persisted state.
// =============================================================

// 2026/03/31 edited by Zikai Lu
// Changes:
//  - Add scheduled save strategy to reduce high-frequency localStorage writes.
//  - Persist only stable game fields to shrink save payload and avoid runtime-only data.

import { hasDiceBuildEligibility, consumeDiceBuildEligibility } from './relax_prompt.js';
import { closeMinigameSection, openMinigameHub, showMinigamePanel, showMinigameSection } from './minigame_hub.js';
import { getEnabledSkinForGame } from './collection_api.js';
import { showToast } from './utils.js';
import { LOCAL_STORAGE_KEYS, createScheduledSaver, readJsonSafe, writeJsonSafe } from './local_storage.js';

const SAVE_KEY = LOCAL_STORAGE_KEYS.tetrisSave;
const HIST_KEY = LOCAL_STORAGE_KEYS.tetrisHistory;
const DEFAULT_SKIN_ID = 'default';

const COLS = 10;
const ROWS = 20;
const EMPTY = 0;

const TETROMINOES = {
  I: { shape: [[1,1,1,1]], color: '#6de6ff', accent: '#dffbff' },
  O: { shape: [[1,1],[1,1]], color: '#ffd76a', accent: '#fff4c2' },
  T: { shape: [[0,1,0],[1,1,1]], color: '#bd8cff', accent: '#f2e3ff' },
  S: { shape: [[0,1,1],[1,1,0]], color: '#7ef0b5', accent: '#e0fff1' },
  Z: { shape: [[1,1,0],[0,1,1]], color: '#ff7d9d', accent: '#ffe0e8' },
  J: { shape: [[1,0,0],[1,1,1]], color: '#7db8ff', accent: '#dfefff' },
  L: { shape: [[0,0,1],[1,1,1]], color: '#ffb36b', accent: '#fff0df' },
};

const LEVEL_SPEED = [800, 711, 633, 564, 502, 447, 398, 354, 315, 281, 250, 222, 198, 175, 155, 138, 122, 108, 96, 85];

const TETRIS_SKINS = {
  default: {
    boardClass: '',
  },
  skin_tetris_starlit: {
    boardClass: 'tetris-skin-starlit',
  },
};

function endGame(st, els) {
  st.gameOver = true;
  st.playing = false;
  st.paused = false;
  if (st.dropInterval) {
    clearInterval(st.dropInterval);
    st.dropInterval = null;
  }
  consumeDiceBuildEligibility();
  save(st, { immediate: true });
  pushHistory({ result: 'lose', score: st.score, level: st.level, lines: st.lines });
  if (els?.toastEl) showToast(els.toastEl, `Tetris over - score ${st.score}`);
  if (els) openMinigameHub(els, { bypassGate: true, reason: 'hub' });
}

function defaultState() {
  return {
    version: 1,
    board: Array(ROWS).fill(null).map(() => Array(COLS).fill(EMPTY)),
    score: 0,
    lines: 0,
    level: 1,
    gameOver: false,
    paused: false,
    playing: false,
    nextPiece: null,
    currentPiece: null,
    currentX: 0,
    currentY: 0,
    dropInterval: null,
    lastDrop: 0,
    skinId: DEFAULT_SKIN_ID,
  };
}

function toPersistedState(st) {
  return {
    version: 1,
    board: Array.isArray(st?.board) ? st.board : Array(ROWS).fill(null).map(() => Array(COLS).fill(EMPTY)),
    score: Number(st?.score) || 0,
    lines: Number(st?.lines) || 0,
    level: Number(st?.level) || 1,
    gameOver: !!st?.gameOver,
    paused: !!st?.paused,
    playing: !!st?.playing,
    nextPiece: st?.nextPiece || null,
    currentPiece: st?.currentPiece || null,
    currentX: Number(st?.currentX) || 0,
    currentY: Number(st?.currentY) || 0,
    lastDrop: Number(st?.lastDrop) || 0,
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
  const skinId = typeof raw.skinId === 'string' && raw.skinId in TETRIS_SKINS
    ? raw.skinId
    : DEFAULT_SKIN_ID;
  return { ...raw, skinId };
}

async function syncSkinFromCollection(st) {
  if (!st) return;
  try {
    const skin = await getEnabledSkinForGame('tetris');
    const nextSkinId = skin?.itemId && skin.itemId in TETRIS_SKINS ? skin.itemId : DEFAULT_SKIN_ID;
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

function getRandomPiece() {
  const keys = Object.keys(TETROMINOES);
  const key = keys[Math.floor(Math.random() * keys.length)];
  return { type: key, ...TETROMINOES[key] };
}

function createBoard() {
  return Array(ROWS).fill(null).map(() => Array(COLS).fill(EMPTY));
}

function copyBoard(board) {
  return board.map(row => [...row]);
}

function rotatePiece(piece) {
  const shape = piece.shape;
  const rows = shape.length;
  const cols = shape[0].length;
  const rotated = [];
  for (let x = 0; x < cols; x++) {
    rotated[x] = [];
    for (let y = rows - 1; y >= 0; y--) {
      rotated[x].push(shape[y][x]);
    }
  }
  return { ...piece, shape: rotated };
}

function isValidMove(board, piece, x, y) {
  for (let row = 0; row < piece.shape.length; row++) {
    for (let col = 0; col < piece.shape[row].length; col++) {
      if (piece.shape[row][col]) {
        const newX = x + col;
        const newY = y + row;
        if (newX < 0 || newX >= COLS || newY >= ROWS) return false;
        if (newY >= 0 && board[newY][newX] !== EMPTY) return false;
      }
    }
  }
  return true;
}

function lockPiece(board, piece, x, y) {
  let overflow = false;
  for (let row = 0; row < piece.shape.length; row++) {
    for (let col = 0; col < piece.shape[row].length; col++) {
      if (piece.shape[row][col]) {
        const newY = y + row;
        const newX = x + col;
        if (newY >= 0) board[newY][newX] = piece.type;
        else overflow = true;
      }
    }
  }
  return overflow;
}

function clearLines(board) {
  let lines = 0;
  for (let y = ROWS - 1; y >= 0; y--) {
    if (board[y].every(cell => cell !== EMPTY)) {
      board.splice(y, 1);
      board.unshift(Array(COLS).fill(EMPTY));
      lines++;
      y++;
    }
  }
  return lines;
}

function calculateScore(lines, level) {
  const lineScores = [0, 100, 300, 500, 800];
  return (lineScores[lines] || 800 * lines) * level;
}

function spawnPiece(st, els) {
  const piece = st.nextPiece || getRandomPiece();
  st.nextPiece = getRandomPiece();
  st.currentPiece = piece;
  st.currentX = Math.floor((COLS - piece.shape[0].length) / 2);
  st.currentY = -piece.shape.length;

  if (!isValidMove(st.board, piece, st.currentX, st.currentY)) {
    if (els) endGame(st, els);
    else {
      st.gameOver = true;
      st.playing = false;
      save(st, { immediate: true });
      pushHistory({ result: 'lose', score: st.score, level: st.level, lines: st.lines });
    }
    return false;
  }
  return true;
}

function movePiece(st, dx, dy) {
  if (!st.currentPiece || st.gameOver || st.paused) return false;

  if (isValidMove(st.board, st.currentPiece, st.currentX + dx, st.currentY + dy)) {
    st.currentX += dx;
    st.currentY += dy;
    return true;
  }
  return false;
}

function rotatePieceAction(st) {
  if (!st.currentPiece || st.gameOver || st.paused) return false;

  const rotated = rotatePiece(st.currentPiece);
  if (isValidMove(st.board, rotated, st.currentX, st.currentY)) {
    st.currentPiece = rotated;
    return true;
  }

  // Wall kick attempt
  const kicks = [-1, 1, -2, 2];
  for (const kick of kicks) {
    if (isValidMove(st.board, rotated, st.currentX + kick, st.currentY)) {
      st.currentX += kick;
      st.currentPiece = rotated;
      return true;
    }
  }
  return false;
}

function dropPiece(st, els) {
  if (!st.currentPiece || st.gameOver || st.paused) return false;

  if (isValidMove(st.board, st.currentPiece, st.currentX, st.currentY + 1)) {
    st.currentY++;
    return true;
  }

  const overflow = lockPiece(st.board, st.currentPiece, st.currentX, st.currentY);
  if (overflow) {
    endGame(st, els);
    return false;
  }

  const lines = clearLines(st.board);
  if (lines > 0) {
    st.lines += lines;
    st.score += calculateScore(lines, st.level);
    const newLevel = Math.floor(st.lines / 10) + 1;
    if (newLevel > st.level && newLevel <= 20) {
      st.level = newLevel;
    }
  }

  if (!spawnPiece(st, els)) {
    return false;
  }
  return true;
}

function hardDrop(st, els) {
  if (!st.currentPiece || st.gameOver || st.paused) return;
  while (isValidMove(st.board, st.currentPiece, st.currentX, st.currentY + 1)) {
    st.currentY += 1;
  }
  dropPiece(st, els);
}

function startGame(st) {
  st.board = createBoard();
  st.score = 0;
  st.lines = 0;
  st.level = 1;
  st.gameOver = false;
  st.paused = false;
  st.playing = true;
  st.nextPiece = getRandomPiece();
  spawnPiece(st);
  save(st, { immediate: true });
}

function getSpeed(level) {
  return LEVEL_SPEED[Math.min(level - 1, LEVEL_SPEED.length - 1)] || 800;
}

function render(els, st) {
  if (!els || !st) return;

  if (els.tetRoot) {
    const skin = TETRIS_SKINS[st.skinId] || TETRIS_SKINS[DEFAULT_SKIN_ID];
    for (const entry of Object.values(TETRIS_SKINS)) {
      if (entry.boardClass) els.tetRoot.classList.remove(entry.boardClass);
    }
    els.tetRoot.dataset.tetrisSkin = st.skinId;
    if (skin.boardClass) els.tetRoot.classList.add(skin.boardClass);
  }

  if (els.tetScore) els.tetScore.textContent = st.score;
  if (els.tetLevel) els.tetLevel.textContent = st.level;
  if (els.tetLines) els.tetLines.textContent = st.lines;
  if (els.tetStatus) {
    if (st.gameOver) els.tetStatus.textContent = 'Game Over';
    else if (st.paused) els.tetStatus.textContent = 'Paused';
    else if (st.playing) els.tetStatus.textContent = 'Playing';
    else els.tetStatus.textContent = 'Ready';
  }

  if (els.tetStartBtn) {
    els.tetStartBtn.disabled = false;
    els.tetStartBtn.textContent = (st.playing && st.paused) ? 'Resume' : (st.gameOver ? 'Restart' : 'Start');
    els.tetStartBtn.style.display = 'none';
  }

  if (els.tetPauseBtn) {
    els.tetPauseBtn.disabled = !st.playing || st.gameOver;
    els.tetPauseBtn.textContent = st.paused ? 'Resume' : 'Pause';
    els.tetPauseBtn.style.display = st.playing && !st.gameOver ? 'inline-block' : 'none';
  }

  if (els.tetScreen && els.tetScreenTitle && els.tetScreenBtn) {
    const show = !st.playing || st.paused || st.gameOver;
    els.tetScreen.classList.toggle('mg-hidden', !show);
    if (st.gameOver) {
      els.tetScreenTitle.textContent = 'Game Over';
      els.tetScreenBtn.textContent = 'Restart';
    } else if (st.playing && st.paused) {
      els.tetScreenTitle.textContent = 'Paused';
      els.tetScreenBtn.textContent = 'Resume';
    } else {
      els.tetScreenTitle.textContent = '';
      els.tetScreenBtn.textContent = 'Start';
    }
  }

  renderBoard(els, st);
  renderNext(els, st);
}

function renderBoard(els, st) {
  if (!els.tetBoard) return;

  const display = els.tetBoard;
  display.innerHTML = '';

  const cellSize = 24;
  display.style.gridTemplateColumns = `repeat(${COLS}, ${cellSize}px)`;
  display.style.gridTemplateRows = `repeat(${ROWS}, ${cellSize}px)`;

  const tempBoard = copyBoard(st.board);

  if (st.currentPiece && st.playing && !st.gameOver) {
    for (let row = 0; row < st.currentPiece.shape.length; row++) {
      for (let col = 0; col < st.currentPiece.shape[row].length; col++) {
        if (st.currentPiece.shape[row][col]) {
          const y = st.currentY + row;
          const x = st.currentX + col;
          if (y >= 0 && y < ROWS && x >= 0 && x < COLS) {
            tempBoard[y][x] = st.currentPiece.type;
          }
        }
      }
    }
  }

  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const cell = document.createElement('div');
      cell.className = 'tet-cell';
      if (tempBoard[y][x] !== EMPTY) {
        const skin = getPieceSkin(tempBoard[y][x]);
        cell.classList.add('tet-filled');
        if (skin.type) cell.dataset.piece = skin.type;
        cell.style.setProperty('--tet-fill', skin.color);
        cell.style.setProperty('--tet-accent', skin.accent);
      }
      display.appendChild(cell);
    }
  }
}

function renderNext(els, st) {
  if (!els.tetNext || !st.nextPiece) return;

  const display = els.tetNext;
  display.innerHTML = '';

  const piece = st.nextPiece;
  const rows = piece.shape.length;
  const cols = piece.shape[0].length;

  display.style.gridTemplateColumns = `repeat(${cols}, 20px)`;
  display.style.gridTemplateRows = `repeat(${rows}, 20px)`;

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const cell = document.createElement('div');
      cell.className = 'tet-cell tet-next-cell';
      if (piece.shape[y][x]) {
        cell.classList.add('tet-filled');
        cell.dataset.piece = piece.type;
        cell.style.setProperty('--tet-fill', piece.color);
        cell.style.setProperty('--tet-accent', piece.accent);
      }
      display.appendChild(cell);
    }
  }
}

function getPieceSkin(value) {
  if (typeof value === 'string' && TETROMINOES[value]) {
    return {
      type: value,
      color: TETROMINOES[value].color,
      accent: TETROMINOES[value].accent,
    };
  }

  return {
    type: '',
    color: typeof value === 'string' ? value : '#8aa4ff',
    accent: '#ecf2ff',
  };
}

function showTetrisView(els) {
  showMinigamePanel(els, 'tetris');
  if (els?.tetHint) els.tetHint.textContent = '';
}

function attachHandlers(els, stRef) {
  const ui = els;

  const pauseTetris = (st) => {
    if (!st || !st.playing || st.gameOver) return;
    st.paused = true;
    save(st);
    render(ui, st);
  };

  const resumeTetris = (st) => {
    if (!st || !st.playing || st.gameOver) return;
    st.paused = false;
    st.lastDrop = Date.now();
    save(st);
    render(ui, st);
  };

  const startOrResumeTetris = () => {
    const st = stRef.current;
    if (!st) return;
    if (!st.playing || st.gameOver) {
      startGame(st);
      startGameLoop(st, ui);
      render(ui, st);
      return;
    }
    if (st.paused) {
      resumeTetris(st);
    }
  };

  const stopTetrisLoop = () => {
    const st = stRef.current;
    if (!st) return;
    if (st.dropInterval) {
      clearInterval(st.dropInterval);
      st.dropInterval = null;
    }
    st.playing = false;
    st.paused = false;
    save(st);
  };

  ui.tetExitBtn?.addEventListener('click', () => {
    stopTetrisLoop();
    openMinigameHub(ui, { bypassGate: true, reason: 'hub' });
  });

  ui.tetStartBtn?.addEventListener('click', startOrResumeTetris);
  ui.tetScreenBtn?.addEventListener('click', startOrResumeTetris);

  ui.tetPauseBtn?.addEventListener('click', () => {
    const st = stRef.current;
    if (!st || !st.playing || st.gameOver) return;
    if (st.paused) resumeTetris(st);
    else pauseTetris(st);
  });

  window.addEventListener('keydown', (ev) => {
    const st = stRef.current;
    if (!st || !st.playing || st.paused || st.gameOver) return;

    switch (ev.key) {
      case 'ArrowLeft':
        movePiece(st, -1, 0);
        ev.preventDefault();
        break;
      case 'ArrowRight':
        movePiece(st, 1, 0);
        ev.preventDefault();
        break;
      case 'ArrowDown':
        dropPiece(st, ui);
        ev.preventDefault();
        break;
      case 'ArrowUp':
      case 'x':
        rotatePieceAction(st);
        ev.preventDefault();
        break;
      case ' ':
        hardDrop(st, ui);
        ev.preventDefault();
        break;
      default:
        return;
    }
    save(st);
    render(ui, st);
  });
}

function startGameLoop(st, ui) {
  if (st.dropInterval) clearInterval(st.dropInterval);

  st.lastDrop = Date.now();

  st.dropInterval = setInterval(() => {
    const minigameHidden = ui?.viewMinigame?.style.display === 'none' || ui?.tetRoot?.style.display === 'none';
    if (minigameHidden) {
      clearInterval(st.dropInterval);
      st.dropInterval = null;
      st.playing = false;
      st.paused = false;
      save(st);
      return;
    }

    if (st.paused || st.gameOver || !st.playing) return;

    const now = Date.now();
    const elapsed = now - st.lastDrop;
    const speed = getSpeed(st.level);

    if (elapsed >= speed) {
      const moved = dropPiece(st, ui);
      st.lastDrop = now;

      if (!moved || st.gameOver) {
        clearInterval(st.dropInterval);
        st.dropInterval = null;
      }
      save(st);
      render(ui, st);
    }
  }, 50);
}

function enableGateHint(els, ok) {
  if (!els?.tetHint) return;
  els.tetHint.textContent = ok ? '' : 'Only available right after a focus session.';
}

export function mountTetris(els) {
  if (!els?.tetRoot) return;

  const stRef = { current: null };
  els.__tetris = stRef;

  attachHandlers(els, stRef);

  const st = load() || defaultState();
  st.playing = false;
  st.paused = false;
  st.dropInterval = null;
  stRef.current = st;
  save(st, { immediate: true });
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
    window.tetrisOpen = () => openTetris(els, { reason: 'dev' });
  }
}

export function openTetris(els, meta) {
  if (!els?.viewMinigame) return;

  const bypass = meta?.bypassGate === true;
  const ok = bypass || hasDiceBuildEligibility() || meta?.reason === 'dev';
  if (!ok) {
    enableGateHint(els, false);
    showToast(els.toastEl, 'Minigame is only available after focus completion.');
    return;
  }

  showMinigameSection(els);
  showTetrisView(els);
  enableGateHint(els, true);

  const stRef = els.__tetris;
  if (!stRef?.current) {
    stRef.current = defaultState();
  }
  syncSkinFromCollection(stRef.current).finally(() => {
    render(els, stRef.current);
  });
}

export function closeTetris(els) {
  const stRef = els?.__tetris;
  const st = stRef?.current;
  if (st?.dropInterval) {
    clearInterval(st.dropInterval);
    st.dropInterval = null;
  }
  if (st) {
    st.playing = false;
    st.paused = false;
    save(st, { immediate: true });
  }
  saver.cancel();
  closeMinigameSection(els);
}
