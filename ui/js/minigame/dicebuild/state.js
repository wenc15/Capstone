// dicebuild/state.js
// Persistence and default state creation for Dice & Build.
// 2026/03/25 edited by Zhecheng Xu
// Changes:
//  - Reset Dice & Build save once per app launch to start fresh each restart.

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
  const BOOT_RESET_FLAG = 'dicebuild.boot.reset.v1';

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
      skinId: 'default',
      speedMode: false,
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
    try {
      if (!sessionStorage.getItem(BOOT_RESET_FLAG)) {
        sessionStorage.setItem(BOOT_RESET_FLAG, '1');
        localStorage.removeItem(SAVE_KEY);
      }
    } catch {
      // ignore storage access failures
    }

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
    // Transient runtime flags should always reset after reload/open,
    // otherwise interactions can remain locked (cannot roll/drag).
    st.isMoving = false;
    st.isRolling = false;
    st.dragPreview = null;
    if (typeof st.skinId !== 'string' || !st.skinId.trim()) {
      st.skinId = 'default';
    }
    if (typeof st.speedMode !== 'boolean') {
      st.speedMode = false;
    }
    if (!st.fxPulse || typeof st.fxPulse !== 'object') {
      st.fxPulse = {};
    }
    if (!Array.isArray(st.cellFxItems)) {
      st.cellFxItems = [];
    }
    st.selectingPlace = null;
    if (!Array.isArray(st.unlockedLockedCells)) {
      const count = Math.max(0, Math.min(LOCKED_UNLOCK_ORDER.length, Math.round(st.unlockedBlocks || 0)));
      st.unlockedLockedCells = LOCKED_UNLOCK_ORDER.slice(0, count);
    }
    st.unlockedBlocks = Math.max(0, Math.min(LOCKED_UNLOCK_ORDER.length, st.unlockedLockedCells.length));
    st.selectingUnlock = false;
    st.pendingUnlockCost = 0;

    // Rebuild board topology on load so `tiles` remains a Map.
    // JSON persistence turns Map into plain objects, which breaks render (`tiles.get`).
    st.board = makeBoard();

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
