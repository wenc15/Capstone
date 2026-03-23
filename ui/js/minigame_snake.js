// minigame_snake.js
// A Snake minigame prototype.
// Notes:
//  - Local-only singleplayer; state stored in localStorage.
//  - Access is gated by relax_prompt eligibility.
//  - Classic Snake gameplay with scoring.

import { hasDiceBuildEligibility, consumeDiceBuildEligibility } from './relax_prompt.js';
import { closeMinigameSection, openMinigameHub, showMinigamePanel, showMinigameSection } from './minigame_hub.js';
import { showToast } from './utils.js';

const SAVE_KEY = 'snake.save.v1';
const HIST_KEY = 'snake.history.v1';

const COLS = 20;
const ROWS = 20;
const EMPTY = 0;
const SNAKE = 1;
const FOOD = 2;

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
    playing: false,
    gameLoop: null,
    lastMove: 0,
    speed: 150,
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
  }
  initGame(st);
  save(st);
}

function changeDirection(st, dx, dy) {
  const curr = st.direction;
  if (curr.x === -dx && curr.y === -dy) return;
  st.nextDirection = { x: dx, y: dy };
}

function moveSnake(st, els) {
  if (st.gameOver || !st.playing) return;

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
    }
    st.food = spawnFood(st);
    if (!st.food) {
      endGame(st, els, 'win');
      return;
    }
  } else {
    st.snake.pop();
  }

  save(st);
}

function endGame(st, els, result = 'lose') {
  st.gameOver = true;
  st.playing = false;
  if (st.gameLoop) {
    clearInterval(st.gameLoop);
    st.gameLoop = null;
  }
  save(st);
  pushHistory({ result, score: st.score });
  if (els?.toastEl) showToast(els.toastEl, `Snake over - score ${st.score}`);
  if (els) openMinigameHub(els, { bypassGate: true, reason: 'hub' });
}

function render(els, st) {
  if (!els || !st) return;

  if (els.snakeScore) els.snakeScore.textContent = st.score;
  if (els.snakeHighScore) els.snakeHighScore.textContent = st.highScore;

  if (els.snakeStatus) {
    if (st.gameOver) els.snakeStatus.textContent = 'Game Over';
    else if (st.playing) els.snakeStatus.textContent = 'Playing';
    else els.snakeStatus.textContent = 'Ready';
  }

  if (els.snakeStartBtn) els.snakeStartBtn.disabled = st.playing;

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

  ui.snakeHubBtn?.addEventListener('click', () => {
    openMinigameHub(ui, { bypassGate: true, reason: 'hub' });
  });

  ui.snakeExitBtn?.addEventListener('click', () => {
    closeSnake(ui);
  });

  ui.snakeStartBtn?.addEventListener('click', () => {
    const st = stRef.current;
    if (!st) return;
    startGame(st);
    startGameLoop(st, ui);
    render(ui, st);
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

  const st = load() || defaultState();
  stRef.current = st;
  save(st);
  render(els, st);

  if (typeof window !== 'undefined') {
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

  if (!bypass && meta?.reason !== 'dev') consumeDiceBuildEligibility();

  showMinigameSection(els);
  showSnakeView(els);
  enableGateHint(els, true);

  const stRef = els.__snake;
  if (!stRef?.current) {
    stRef.current = defaultState();
  }
  startGame(stRef.current);
  startGameLoop(stRef.current, els);
  render(els, stRef.current);
}

export function closeSnake(els) {
  closeMinigameSection(els);
}
