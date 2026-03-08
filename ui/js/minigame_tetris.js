// minigame_tetris.js
// A Tetris minigame prototype.
// Notes:
//  - Local-only singleplayer; state stored in localStorage.
//  - Access is gated by relax_prompt eligibility.
//  - MVP supports classic Tetris gameplay with scoring and levels.

import { hasDiceBuildEligibility, consumeDiceBuildEligibility } from './relax_prompt.js';
import { closeMinigameSection, openMinigameHub, showMinigamePanel, showMinigameSection } from './minigame_hub.js';
import { showToast } from './utils.js';

const SAVE_KEY = 'tetris.save.v1';
const HIST_KEY = 'tetris.history.v1';

const COLS = 10;
const ROWS = 20;
const EMPTY = 0;

const TETROMINOES = {
  I: { shape: [[1,1,1,1]], color: '#00f5ff' },
  O: { shape: [[1,1],[1,1]], color: '#ffeb3b' },
  T: { shape: [[0,1,0],[1,1,1]], color: '#9c27b0' },
  S: { shape: [[0,1,1],[1,1,0]], color: '#4caf50' },
  Z: { shape: [[1,1,0],[0,1,1]], color: '#f44336' },
  J: { shape: [[1,0,0],[1,1,1]], color: '#2196f3' },
  L: { shape: [[0,0,1],[1,1,1]], color: '#ff9800' },
};

const LEVEL_SPEED = [800, 711, 633, 564, 502, 447, 398, 354, 315, 281, 250, 222, 198, 175, 155, 138, 122, 108, 96, 85];

function endGame(st, els) {
  st.gameOver = true;
  st.playing = false;
  st.paused = false;
  if (st.dropInterval) {
    clearInterval(st.dropInterval);
    st.dropInterval = null;
  }
  save(st);
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
  };
}

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

function save(st) {
  writeJson(SAVE_KEY, st);
}

function load() {
  const st = readJson(SAVE_KEY, null);
  return st && st.version === 1 ? st : null;
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
        if (newY >= 0) board[newY][newX] = piece.color;
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
      save(st);
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
  save(st);
}

function getSpeed(level) {
  return LEVEL_SPEED[Math.min(level - 1, LEVEL_SPEED.length - 1)] || 800;
}

function render(els, st) {
  if (!els || !st) return;

  if (els.tetScore) els.tetScore.textContent = st.score;
  if (els.tetLevel) els.tetLevel.textContent = st.level;
  if (els.tetLines) els.tetLines.textContent = st.lines;
  if (els.tetStatus) {
    if (st.gameOver) els.tetStatus.textContent = 'Game Over';
    else if (st.playing) els.tetStatus.textContent = 'Playing';
    else els.tetStatus.textContent = 'Ready';
  }

  if (els.tetStartBtn) els.tetStartBtn.disabled = st.playing && !st.gameOver;

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
            tempBoard[y][x] = st.currentPiece.color;
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
        cell.classList.add('tet-filled');
        cell.style.backgroundColor = tempBoard[y][x];
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
        cell.style.backgroundColor = piece.color;
      }
      display.appendChild(cell);
    }
  }
}

function showTetrisView(els) {
  showMinigamePanel(els, 'tetris');
  if (els?.tetHint) els.tetHint.textContent = '';
}

function attachHandlers(els, stRef) {
  const ui = els;

  ui.tetHubBtn?.addEventListener('click', () => {
    openMinigameHub(ui, { bypassGate: true, reason: 'hub' });
  });

  ui.tetExitBtn?.addEventListener('click', () => {
    closeTetris(ui);
  });

  ui.tetStartBtn?.addEventListener('click', () => {
    const st = stRef.current;
    if (!st) return;
    startGame(st);
    startGameLoop(st, ui);
    render(ui, st);
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
  stRef.current = st;
  save(st);
  render(els, st);

  if (typeof window !== 'undefined') {
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

  if (!bypass && meta?.reason !== 'dev') consumeDiceBuildEligibility();

  showMinigameSection(els);
  showTetrisView(els);
  enableGateHint(els, true);

  const stRef = els.__tetris;
  if (!stRef?.current) {
    stRef.current = defaultState();
  }
  startGame(stRef.current);
  startGameLoop(stRef.current, els);
  render(els, stRef.current);
}

export function closeTetris(els) {
  closeMinigameSection(els);
}
