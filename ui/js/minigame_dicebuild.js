// minigame_dicebuild.js
// A minimal offline Dice & Build prototype.
// Notes:
//  - Local-only singleplayer; state stored in localStorage.
//  - Access is gated by relax_prompt eligibility.
//  - Core prototype with board/shop/backpack/placement/merge and staged goals.

// 2026/03/31 edited by Zikai Lu
// Changes:
//  - Flush Dice & Build save immediately on close/navigation-sensitive paths.
//  - Keep regular interaction saves scheduled via stateApi for lower IO pressure.

import { hasDiceBuildEligibility, consumeDiceBuildEligibility } from './relax_prompt.js';
import { closeMinigameSection, openMinigameHub, showMinigamePanel, showMinigameSection } from './minigame_hub.js';
import { getEnabledSkinForGame } from './collection_api.js';
import { showToast } from './utils.js';
import { reportAchievementIncrement } from './achievement_events.js';
import { LOCAL_STORAGE_KEYS, readJsonSafe } from './local_storage.js';
import {
  STAGES,
  STAGE_COUNT,
  ROLLS_PER_STAGE,
  TOTAL_ROLLS,
  BUY_BLOCK_COSTS,
  BASE_EXP_BY_LEVEL,
  RARITY,
  BUILDINGS,
  BOARD_COLS,
} from './minigame/dicebuild/constants.js';
import { idxOf } from './minigame/dicebuild/board.js';
import { createDiceBuildEffects } from './minigame/dicebuild/effects.js';
import { createDiceBuildState } from './minigame/dicebuild/state.js';
import { createDiceBuildRender } from './minigame/dicebuild/render.js';
import { attachDiceBuildHandlers } from './minigame/dicebuild/actions.js';
import { createDiceBuildLogic } from './minigame/dicebuild/logic.js';

const DEFAULT_PLAYER_SKIN_ID = 'default';
const DICEBUILD_PLAYER_SKINS = {
  default: { playerClass: '' },
  skin_dicebuild_petstand: { playerClass: 'is-skin-petstand' },
};

async function syncSkinFromCollection(st) {
  if (!st) return;
  try {
    const skin = await getEnabledSkinForGame('dicebuild');
    const nextSkinId = skin?.itemId && skin.itemId in DICEBUILD_PLAYER_SKINS
      ? skin.itemId
      : DEFAULT_PLAYER_SKIN_ID;
    st.skinId = nextSkinId;
    save(st);
  } catch {
    st.skinId = DEFAULT_PLAYER_SKIN_ID;
  }
}

function makeInstance(defId) {
  return {
    uid: `b_${Math.random().toString(16).slice(2)}_${Date.now()}`,
    defId,
    level: 1,
    exp: 0,
    coinMod: 0,
  };
}

const stateApi = createDiceBuildState({ makeInstance });

function defaultState() {
  const st = stateApi.defaultState();
  if (!st.skinId) st.skinId = DEFAULT_PLAYER_SKIN_ID;
  return st;
}

function save(st) {
  stateApi.save(st);
}

function saveNow(st) {
  stateApi.saveNow(st);
}

function load() {
  const st = stateApi.load();
  if (!st) return null;
  if (!st.skinId) st.skinId = DEFAULT_PLAYER_SKIN_ID;
  if (typeof st.speedMode !== 'boolean') st.speedMode = false;
  return st;
}

function pushHistory(entry) {
  stateApi.pushHistory(entry);
}

function resetRunState(prev) {
  const next = defaultState();
  next.speedMode = !!prev?.speedMode;
  next.skinId = prev?.skinId || DEFAULT_PLAYER_SKIN_ID;
  buildShopItems(next);
  return next;
}

const logicApi = createDiceBuildLogic({ makeInstance });
const {
  clamp,
  pick,
  buildShopItems,
  fmtGoal,
  canRoll,
  ensureLevels,
  sellValue,
  expReqForNext,
  gainCoins,
  grantRandomBuilding,
} = logicApi;

const effects = createDiceBuildEffects({
  BUILDINGS,
  BOARD_COLS,
  idxOf,
  ensureLevels,
  gainCoins,
  makeInstance,
  pick,
  grantRandomBuilding,
});

function triggerStageClearForPlaced(st) {
  effects.triggerStageClearForPlaced(st);
}

function triggerSoldHooks(st, soldInst) {
  effects.triggerSoldHooks(st, soldInst);
}

async function stepMove(st, steps, onStep) {
  return effects.stepMove(st, steps, onStep);
}

async function resolvePathTriggers(st, traversed, float, hooks, onTriggered) {
  await effects.resolvePathTriggers(st, traversed, float, hooks, onTriggered);
}

function resolveLand(st, float, hooks) {
  return effects.resolveLand(st, float, hooks);
}

function triggerBuildingEvents(st, eventName, ctx) {
  effects.triggerBuildingEvents(st, eventName, ctx);
}

async function triggerOpeningPhasesSequential(st, rollCtx, float, hooks, onTriggered) {
  await effects.triggerOpeningPhasesSequential(st, rollCtx, float, hooks, onTriggered);
}

function isFoundationKind(kind) {
  return kind === 'foundation' || kind === 'foundation2' || kind === 'build_open';
}

function canPlaceOnKind(kind) {
  return isFoundationKind(kind) || kind === 'locked' || kind === 'build_locked';
}

function isLockedUsable(st, cellIdx) {
  const unlockedSet = new Set(st.unlockedLockedCells || []);
  return unlockedSet.has(cellIdx);
}

function finalizeStageIfNeeded(st, ui) {
  if (st.rollInStage < ROLLS_PER_STAGE) return;
  const goal = STAGES[st.stageIdx] || 0;
  const passed = st.coinsEarned >= goal;

  if (passed && st.stageIdx < STAGE_COUNT - 1) {
    playStageClearCelebration(ui);
    triggerStageClearForPlaced(st);
    st.stageIdx += 1;
    st.rollInStage = 0;
    st.coinsEarned = 0;
    st.refreshCost = 5;
    st.refreshCount = 0;
    showFloat(ui, `Stage ${st.stageIdx + 1}`);
    buildShopItems(st);
    return;
  }

  if (passed && st.stageIdx === STAGE_COUNT - 1) {
    playStageClearCelebration(ui);
    consumeDiceBuildEligibility();
    showResult(ui, st, true);
    pushHistory({ result: 'win', score: computeScore(st) });
    reportAchievementIncrement('dicebuild_wins', 1);
    return;
  }

  consumeDiceBuildEligibility();
  showResult(ui, st, false);
  pushHistory({ result: 'lose', score: computeScore(st) });
}

function computeScore(st) {
  // Minimal score: ceil(cash/2) + sum goals completed + sum sell values
  const cashScore = Math.ceil((st.cash || 0) / 2);
  const completedGoals = STAGES.slice(0, st.stageIdx).reduce((a, b) => a + b, 0);
  const buildingScore = [...Object.values(st.placed || {}), ...st.backpack]
    .filter(Boolean)
    .reduce((sum, inst) => sum + sellValue(inst), 0);
  return cashScore + completedGoals + buildingScore;
}

function computeBestScore(currentScore = 0) {
  const history = readJsonSafe(LOCAL_STORAGE_KEYS.dicebuildHistory, []);
  const historyBest = Array.isArray(history)
    ? history.reduce((best, item) => {
      const score = Number(item?.score) || 0;
      return score > best ? score : best;
    }, 0)
    : 0;
  return Math.max(historyBest, Math.max(0, Number(currentScore) || 0));
}

const uiRender = createDiceBuildRender({
  BUILDINGS,
  RARITY,
  STAGE_COUNT,
  ROLLS_PER_STAGE,
  TOTAL_ROLLS,
  BUY_BLOCK_COSTS,
  idxOf,
  isLockedUsable,
  isFoundationKind,
  canRoll,
  sellValue,
  expReqForNext,
  clamp,
});

function showResult(ui, st, win) {
  const value = computeScore(st);
  const best = computeBestScore(value);
  uiRender.showResult(ui, st, { win, value, best });
}

function showBuildingDetail(ui, st, inst, cellIdx) {
  uiRender.showBuildingDetail(ui, st, inst, cellIdx);
}

function hideHoverCard(ui) {
  uiRender.hideHoverCard(ui);
}

function showHoverCard(ui, payload, anchorEl) {
  uiRender.showHoverCard(ui, payload, anchorEl);
}

function hideBuildingDetail(ui) {
  uiRender.hideBuildingDetail(ui);
}

function hideResult(ui) {
  uiRender.hideResult(ui);
}

function showFloat(ui, text) {
  uiRender.showFloat(ui, text);
}

function playStageClearCelebration(ui) {
  uiRender.playStageClearCelebration(ui);
}

function showDiceBuildView(els) {
  showMinigamePanel(els, 'dicebuild');
  if (els?.mgHint) els.mgHint.textContent = '';
}

function syncDiceBuildLayout(ui) {
  uiRender.syncDiceBuildLayout(ui);
}

function render(els, st) {
  if (!st.skinId || !(st.skinId in DICEBUILD_PLAYER_SKINS)) {
    st.skinId = DEFAULT_PLAYER_SKIN_ID;
  }
  uiRender.render(els, st, { fmtGoal });
}

function attachHandlers(els, stRef) {
  attachDiceBuildHandlers(els, stRef, {
    BUILDINGS,
    BUY_BLOCK_COSTS,
    BASE_EXP_BY_LEVEL,
    showToast,
    openMinigameHub,
    closeDiceBuild,
    save,
    render,
    buildShopItems,
    clamp,
    makeInstance,
    hideHoverCard,
    showHoverCard,
    isLockedUsable,
    canPlaceOnKind,
    hideBuildingDetail,
    hideResult,
    showFloat,
    ensureLevels,
    sellValue,
    triggerSoldHooks,
    canRoll,
    triggerBuildingEvents,
    triggerOpeningPhasesSequential,
    stepMove,
    resolvePathTriggers,
    resolveLand,
    finalizeStageIfNeeded,
    createPlayerMarker: uiRender.createPlayerMarker,
  });
}

function enableGateHint(els, ok) {
  if (!els?.mgHint) return;
  els.mgHint.textContent = ok ? '' : 'Only available right after a focus session.';
}

export function mountDiceBuild(els) {
  if (!els?.mgRoot) return;

  const stRef = { current: null };
  els.__dicebuild = stRef;

  attachHandlers(els, stRef);

  window.addEventListener('resize', () => {
    syncDiceBuildLayout(els);
  });

  // Refreshing the app should always start a fresh run.
  // Keep only skin/speed mode preferences via resetRunState.
  const st = resetRunState(load() || defaultState());
  stRef.current = st;
  if (!Array.isArray(st.shop) || st.shop.length === 0) {
    buildShopItems(st);
  }
  save(st);
  syncSkinFromCollection(st).then(() => render(els, st));
  render(els, st);

  // Keep local full building pool by default.

  window.addEventListener('collection:skin-changed', () => {
    const cur = stRef.current;
    if (!cur) return;
    syncSkinFromCollection(cur).then(() => render(els, cur));
  });

  // Expose dev helper
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => {
      saveNow(stRef.current || null);
    });
    window.dicebuildOpen = () => openDiceBuild(els, { reason: 'dev' });
  }
}

export function openDiceBuild(els, meta) {
  if (!els?.viewMinigame) return;

  const bypass = meta?.bypassGate === true;
  const ok = bypass || hasDiceBuildEligibility() || meta?.reason === 'dev';
  if (!ok) {
    enableGateHint(els, false);
    showToast(els.toastEl, 'Minigame is only available after focus completion.');
    return;
  }

  showMinigameSection(els);
  showDiceBuildView(els);
  enableGateHint(els, true);

  const stRef = els.__dicebuild;
  if (!stRef?.current) {
    stRef.current = load() || defaultState();
    if (!Array.isArray(stRef.current.shop) || stRef.current.shop.length === 0) {
      buildShopItems(stRef.current);
    }
    save(stRef.current);
  }

  if (!canRoll(stRef.current)) {
    stRef.current = resetRunState(stRef.current);
    save(stRef.current);
  }

  hideResult(els);
  syncSkinFromCollection(stRef.current).finally(() => {
    render(els, stRef.current);
  });
}

export function closeDiceBuild(els) {
  const st = els?.__dicebuild?.current;
  if (st) saveNow(st);
  closeMinigameSection(els);
}
