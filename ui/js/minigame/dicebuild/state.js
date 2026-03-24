// dicebuild/state.js
// Persistence and default state creation for Dice & Build.

import { BUILDING_IDS, BOARD_COLS, BOARD_ROWS, HIST_KEY, SAVE_KEY } from './constants.js';
import { idxOf, makeBoard } from './board.js';

const LOCKED_UNLOCK_ORDER = [
  idxOf(0, 2), idxOf(0, 3), idxOf(0, 4),
  idxOf(6, 2), idxOf(6, 3), idxOf(6, 4),
];

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

export function createDiceBuildState({ makeInstance }) {
  function defaultState() {
    const board = makeBoard();
    return {
      version: 6,
      stageIdx: 0,
      rollInStage: 0,
      totalRolls: 0,
      coinsEarned: 0,
      cash: 20,
      refreshCost: 5,
      refreshCount: 0,
      playerLoopPos: 0,
      shopEnabled: true,
      unlockedBlocks: 0,
      unlockedLockedCells: [],
      placed: {},
      backpack: [
        makeInstance('00'),
        makeInstance('01'),
        makeInstance('02'),
        null,
        null,
      ],
      shop: [],
      lastRoll: null,
      lastDice: null,
      selectingPlace: null,
      selected: null,
      detail: null,
      selectingUnlock: false,
      pendingUnlockCost: 0,
      board,
      unlockedBuildingIds: [...BUILDING_IDS],
      nextRollTwoDice: false,
      isMoving: false,
      fxPulse: {},
      cellFxItems: [],
      dragPreview: null,
    };
  }

  function save(st) {
    writeJson(SAVE_KEY, st);
  }

  function load() {
    const st = readJson(SAVE_KEY, null);
    if (!st || st.version !== 6) return null;

    if (st?.board?.cols !== BOARD_COLS || st?.board?.rows !== BOARD_ROWS) {
      return null;
    }
    if (!Array.isArray(st?.board?.loop) || st.board.loop[0] !== idxOf(1, 1)) {
      return null;
    }

    if (typeof st.shopEnabled !== 'boolean') {
      st.shopEnabled = (st.playerLoopPos || 0) === 0;
    }
    if (typeof st.nextRollTwoDice !== 'boolean') {
      st.nextRollTwoDice = false;
    }
    if (!Array.isArray(st.lastDice)) {
      st.lastDice = null;
    }
    if (typeof st.isMoving !== 'boolean') {
      st.isMoving = false;
    }
    if (!st.fxPulse || typeof st.fxPulse !== 'object') {
      st.fxPulse = {};
    }
    if (!Array.isArray(st.cellFxItems)) {
      st.cellFxItems = [];
    }
    if (!st.dragPreview || typeof st.dragPreview !== 'object') {
      st.dragPreview = null;
    }
    if (!Array.isArray(st.unlockedLockedCells)) {
      const count = Math.max(0, Math.min(LOCKED_UNLOCK_ORDER.length, Math.round(st.unlockedBlocks || 0)));
      st.unlockedLockedCells = LOCKED_UNLOCK_ORDER.slice(0, count);
    }
    st.unlockedBlocks = Math.max(0, Math.min(LOCKED_UNLOCK_ORDER.length, st.unlockedLockedCells.length));
    if (typeof st.selectingUnlock !== 'boolean') {
      st.selectingUnlock = false;
    }
    if (!Number.isFinite(st.pendingUnlockCost)) {
      st.pendingUnlockCost = 0;
    }
    return st;
  }

  function pushHistory(entry) {
    const list = readJson(HIST_KEY, []);
    list.push({ ...entry, ts: Date.now() });
    writeJson(HIST_KEY, list);
  }

  return {
    defaultState,
    save,
    load,
    pushHistory,
  };
}
