// minigame_dicebuild.js
// A minimal offline Dice & Build prototype.
// Notes:
//  - Local-only singleplayer; state stored in localStorage.
//  - Access is gated by relax_prompt eligibility.
//  - Core prototype with board/shop/backpack/placement/merge and staged goals.

import { hasDiceBuildEligibility, consumeDiceBuildEligibility } from './relax_prompt.js';
import { closeMinigameSection, openMinigameHub, showMinigamePanel, showMinigameSection } from './minigame_hub.js';
import { showToast } from './utils.js';
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
  return stateApi.defaultState();
}

function save(st) {
  stateApi.save(st);
}

function pushHistory(entry) {
  stateApi.pushHistory(entry);
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
    showResult(ui, st, true);
    pushHistory({ result: 'win', score: computeScore(st) });
    return;
  }

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
  uiRender.showResult(ui, st, { win, value: computeScore(st) });
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

  // Initial render uses a fresh state (kept hidden until opened)
  const st = defaultState();
  stRef.current = st;
  buildShopItems(st);
  save(st);
  render(els, st);

  // Keep local full building pool by default.

  // Expose dev helper
  if (typeof window !== 'undefined') {
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

  // Improve visibility for full board layout on smaller windows.
  window.electronAPI?.maximizeMainWindowForMinigame?.();

  // Consume eligibility when opening (unless dev)
  if (!bypass && meta?.reason !== 'dev') consumeDiceBuildEligibility();

  showMinigameSection(els);
  showDiceBuildView(els);
  enableGateHint(els, true);

  const stRef = els.__dicebuild;
  if (!stRef?.current) {
    stRef.current = defaultState();
    buildShopItems(stRef.current);
    save(stRef.current);
  }
  render(els, stRef.current);
}

export function closeDiceBuild(els) {
  closeMinigameSection(els);
}
