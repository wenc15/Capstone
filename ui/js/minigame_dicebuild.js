// minigame_dicebuild.js
// A minimal offline Dice & Build prototype.
// Notes:
//  - Local-only singleplayer; state stored in localStorage.
//  - Access is gated by relax_prompt eligibility.
//  - MVP supports 3 starter buildings and basic shop/backpack/placement/merge.

import { hasDiceBuildEligibility, consumeDiceBuildEligibility } from './relax_prompt.js';
import { showToast } from './utils.js';

const API_BASE = 'http://localhost:5024';

const SAVE_KEY = 'dicebuild.save.v1';
const HIST_KEY = 'dicebuild.history.v1';

// Shorter run for a quick break (few minutes)
const STAGES = [10, 18, 28, 40, 55, 75];
const STAGE_COUNT = 6;
const ROLLS_PER_STAGE = 4;
const TOTAL_ROLLS = STAGE_COUNT * ROLLS_PER_STAGE;

const BUY_BLOCK_COSTS = [10, 25, 40, 55, 70, 85];

const BASE_EXP_BY_LEVEL = { 1: 0, 2: 6, 3: 12, 4: 18 };
const LEVEL_REQ = { 1: 0, 2: 6, 3: 12, 4: 18 };

const RARITY = {
  common: { label: 'Common', color: '#78c35a', buy: 8, sell: [4, 8, 12, 16] },
  rare: { label: 'Rare', color: '#4aa3ff', buy: 16, sell: [8, 16, 24, 32] },
  epic: { label: 'Epic', color: '#b06bff', buy: 30, sell: [15, 30, 45, 60] },
  legendary: { label: 'Legendary', color: '#ffb547', buy: 50, sell: [25, 50, 75, 100] },
};

// Starter building set (IDs align with your spec)
const BUILDINGS = {
  '00': {
    id: '00',
    name: 'Small Coin Pouch',
    tags: ['Coin'],
    rarity: 'common',
    icon: '👜',
    effectText: 'End of dice: +{L} coins',
    on: {
      dicePhaseEnd: ({ level, gainCoins, gainExp }) => {
        gainCoins(level);
        gainExp(1);
      },
    },
  },
  '01': {
    id: '01',
    name: 'Insurance Sellor',
    tags: ['Utility'],
    rarity: 'common',
    icon: '🛡️',
    effectText: 'Roll 1: +{L} coins, +2 EXP',
    on: {
      diceRolled: ({ level, roll, gainCoins, gainExp }) => {
        if (roll === 1) {
          gainCoins(2 * level);
          gainExp(2);
        }
      },
    },
  },
  '02': {
    id: '02',
    name: 'Dice Sculpture',
    tags: ['Dice'],
    rarity: 'common',
    icon: '🎲',
    effectText: 'Roll 6: +{L} coins',
    on: {
      diceRolled: ({ level, roll, gainCoins }) => {
        if (roll === 6) gainCoins(6 * level);
      },
    },
  },
};

// Board: fixed 5x7 layout matching design mock.
// - Path loop is an inner ring from Start -> ... -> back to Start.
// - Locked blocks are not part of the path.
const BOARD_COLS = 5;
const BOARD_ROWS = 7;

function idxOf(x, y) {
  return y * BOARD_COLS + x;
}

function makeBoard() {
  const tiles = new Map();

  function put(x, y, kind) {
    tiles.set(idxOf(x, y), { x, y, kind });
  }

  // Top row (foundation slots)
  put(1, 0, 'foundation');
  put(2, 0, 'foundation');
  put(3, 0, 'foundation');

  // Row 1: Start + path + coin
  put(0, 1, 'start');
  put(1, 1, 'path');
  put(2, 1, 'coin');
  put(3, 1, 'path');

  // Right column (inner ring)
  put(3, 2, 'path');
  put(3, 3, 'gift');
  put(3, 4, 'path');
  put(3, 5, 'path');

  // Bottom row (inner ring)
  put(2, 5, 'coin');
  put(1, 5, 'path');

  // Left column (inner ring)
  put(1, 4, 'path');
  put(1, 3, 'gift');
  put(1, 2, 'path');

  // Locked blocks (purchasable)
  put(0, 2, 'locked');
  put(0, 3, 'locked');
  put(0, 4, 'locked');
  put(4, 2, 'locked');
  put(4, 3, 'locked');
  put(4, 4, 'locked');

  // Extra foundation slots at bottom (unlocked by default)
  put(1, 6, 'foundation2');
  put(2, 6, 'foundation2');
  put(3, 6, 'foundation2');

  // Path loop (by tile keys)
  const loop = [
    idxOf(0, 1),
    idxOf(1, 1),
    idxOf(2, 1),
    idxOf(3, 1),
    idxOf(3, 2),
    idxOf(3, 3),
    idxOf(3, 4),
    idxOf(3, 5),
    idxOf(2, 5),
    idxOf(1, 5),
    idxOf(1, 4),
    idxOf(1, 3),
    idxOf(1, 2),
    idxOf(1, 1),
  ];

  return {
    cols: BOARD_COLS,
    rows: BOARD_ROWS,
    tiles,
    loop,
  };
}

function defaultState() {
  const board = makeBoard();
  return {
    version: 1,
    stageIdx: 0,
    rollInStage: 0,
    totalRolls: 0,
    coinsEarned: 0,
    cash: 20,
    refreshCost: 5,
    refreshCount: 0,
    playerLoopPos: 0,
    unlockedBlocks: 0,
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
    selectingPlace: null,
    selected: null,
    detail: null,
    selectingUnlock: false,
    board,
    unlockedBuildingIds: ['00', '01', '02'],
  };
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

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function fetchOwnedCards() {
  try {
    const res = await fetch(`${API_BASE}/api/cards`, { headers: { 'Content-Type': 'application/json' } });
    if (!res.ok) return null;
    const cards = await res.json();
    if (!Array.isArray(cards)) return null;
    return cards;
  } catch {
    return null;
  }
}

function extractUnlockedBuildingIds(cards) {
  // Convention: CardDefinition.ImageKey == "building_00" or "bld_00" etc.
  // MVP fallback: always return starter set.
  const unlocked = new Set(['00', '01', '02']);
  if (!Array.isArray(cards)) return Array.from(unlocked);

  for (const c of cards) {
    if (!c || !c.owned) continue;
    const key = String(c.imageKey || '').trim();
    const name = String(c.name || '').trim();

    const m1 = key.match(/(\d{2})/);
    const m2 = name.match(/\b(\d{2})\b/);
    const id = (m1 && m1[1]) || (m2 && m2[1]) || null;
    if (id && BUILDINGS[id]) unlocked.add(id);
  }
  return Array.from(unlocked);
}

function buildShopItems(st) {
  const unlocked = st.unlockedBuildingIds.filter((id) => BUILDINGS[id]);
  const pool = unlocked.length ? unlocked : ['00', '01', '02'];
  const items = [];
  for (let i = 0; i < 5; i += 1) {
    const id = pick(pool);
    const def = BUILDINGS[id];
    const price = RARITY[def.rarity]?.buy ?? 8;
    items.push({ slot: i, defId: id, price });
  }
  st.shop = items;
}

function fmtGoal(st) {
  const goal = STAGES[st.stageIdx] || STAGES[STAGES.length - 1];
  return { goal, cur: st.coinsEarned };
}

function canRoll(st) {
  return st.totalRolls < TOTAL_ROLLS && st.rollInStage < ROLLS_PER_STAGE;
}

function ensureLevels(inst) {
  let lvl = inst.level;
  while (lvl < 4) {
    const req = LEVEL_REQ[lvl + 1] ?? 999;
    if (inst.exp >= req) lvl += 1;
    else break;
  }
  inst.level = lvl;
}

function sellValue(inst) {
  const def = BUILDINGS[inst.defId];
  const rar = RARITY[def?.rarity || 'common'] || RARITY.common;
  const idx = clamp((inst.level || 1) - 1, 0, 3);
  return rar.sell[idx];
}

function expReqForNext(level) {
  if (level >= 4) return 18;
  return LEVEL_REQ[level + 1] ?? 18;
}

function rarityLabel(r) {
  const rar = RARITY[r || 'common'] || RARITY.common;
  return rar.label;
}

function rarityColor(r) {
  const rar = RARITY[r || 'common'] || RARITY.common;
  return rar.color;
}

function gainCoins(st, n, float) {
  const amount = Math.max(0, Math.round(n || 0));
  if (!amount) return;
  st.coinsEarned += amount;
  st.cash += amount;
  if (float) float(`+${amount}`);
}

function grantRandomBuilding(st, float) {
  const unlocked = st.unlockedBuildingIds.filter((id) => BUILDINGS[id]);
  const pool = unlocked.length ? unlocked : ['00', '01', '02'];
  const id = pick(pool);
  const inst = makeInstance(id);
  const idx = st.backpack.findIndex((x) => !x);
  if (idx >= 0) {
    st.backpack[idx] = inst;
    if (float) float('Get Building');
  } else {
    // no space, convert to cash
    st.cash += 5;
    if (float) float('+5 (Full)');
  }
}

function stepMove(st, steps, float) {
  const loop = st.board.loop;
  const len = loop.length;
  let p = st.playerLoopPos || 0;
  for (let i = 0; i < steps; i += 1) {
    p = (p + 1) % len;
    // Passing start: force land and stop remaining movement
    if (p === 0) {
      st.playerLoopPos = p;
      if (float) float('Start');
      return;
    }
  }
  st.playerLoopPos = p;
}

function resolveLand(st, float) {
  const loopIdx = st.playerLoopPos || 0;
  const cellIdx = st.board.loop[loopIdx];
  const tile = st.board.tiles.get(cellIdx);
  if (!tile) return;
  if (tile.kind === 'coin') {
    gainCoins(st, 5, float);
  }
  if (tile.kind === 'gift') {
    grantRandomBuilding(st, float);
  }
}

function listAllBuildingInstances(st) {
  const all = [];
  for (const inst of st.backpack) {
    if (inst) all.push(inst);
  }
  const placed = st.placed || {};
  Object.values(placed).forEach((inst) => {
    if (inst) all.push(inst);
  });
  return all;
}

function triggerBuildingEvents(st, eventName, ctx) {
  const all = listAllBuildingInstances(st);

  for (const inst of all) {
    const def = BUILDINGS[inst.defId];
    const fn = def?.on?.[eventName];
    if (!fn) continue;
    fn({
      level: inst.level,
      exp: inst.exp,
      roll: ctx.roll,
      gainCoins: (n) => gainCoins(st, n + (inst.coinMod || 0), ctx.float),
      gainExp: (n) => {
        const add = Math.max(0, Math.round(n || 0));
        if (!add) return;
        inst.exp += add;
        ensureLevels(inst);
      },
    });
  }
}

function boardCellKeyFromXY(x, y) {
  return String(idxOf(x, y));
}

function isFoundationKind(kind) {
  return kind === 'foundation' || kind === 'foundation2';
}

function canPlaceOnKind(kind) {
  return isFoundationKind(kind) || kind === 'locked';
}

function isLockedUsable(st, cellIdx) {
  // We unlock locked blocks in fixed order (left column then right column)
  const unlockOrder = [
    idxOf(0, 2), idxOf(0, 3), idxOf(0, 4),
    idxOf(4, 2), idxOf(4, 3), idxOf(4, 4),
  ];
  const unlockedSet = new Set(unlockOrder.slice(0, st.unlockedBlocks || 0));
  return unlockedSet.has(cellIdx);
}

function getUnlockedLockedCells(st) {
  const unlockOrder = [
    idxOf(0, 2), idxOf(0, 3), idxOf(0, 4),
    idxOf(4, 2), idxOf(4, 3), idxOf(4, 4),
  ];
  return unlockOrder.slice(0, st.unlockedBlocks || 0);
}

function finalizeStageIfNeeded(st, ui) {
  if (st.rollInStage < ROLLS_PER_STAGE) return;
  const goal = STAGES[st.stageIdx] || 0;
  const passed = st.coinsEarned >= goal;

  if (passed && st.stageIdx < STAGE_COUNT - 1) {
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
  const buildingScore = [...st.foundations, ...st.backpack]
    .filter(Boolean)
    .reduce((sum, inst) => sum + sellValue(inst), 0);
  return cashScore + completedGoals + buildingScore;
}

function showResult(ui, st, win) {
  if (!ui?.mgResult) return;
  ui.mgResult.classList.remove('mg-hidden');
  if (ui.mgResultTitle) ui.mgResultTitle.textContent = win ? 'Victory' : 'Defeat';
  const score = computeScore(st);
  const meta = `Score: ${score} · Cash: ${st.cash} · Stage: ${st.stageIdx + 1}/${STAGE_COUNT}`;
  if (ui.mgResultMeta) ui.mgResultMeta.textContent = meta;
}

function showBuildingDetail(ui, st, inst, cellIdx) {
  if (!ui?.mgDetail) return;
  const def = BUILDINGS[inst.defId] || {};
  ui.mgDetail.classList.remove('mg-hidden');

  if (ui.mgDetailIcon) ui.mgDetailIcon.textContent = def.icon || '🏗️';
  if (ui.mgDetailName) ui.mgDetailName.textContent = def.name || inst.defId;

  if (ui.mgDetailRarity) {
    ui.mgDetailRarity.textContent = rarityLabel(def.rarity);
    ui.mgDetailRarity.style.background = `${rarityColor(def.rarity)}22`;
    ui.mgDetailRarity.style.borderColor = `${rarityColor(def.rarity)}55`;
  }

  const tag = Array.isArray(def.tags) && def.tags.length ? def.tags[0] : '—';
  if (ui.mgDetailTag) ui.mgDetailTag.textContent = tag;

  const req = expReqForNext(inst.level || 1);
  const cur = Math.max(0, Math.round(inst.exp || 0));

  if (ui.mgDetailLevel) ui.mgDetailLevel.textContent = `Level ${inst.level}/4`;
  if (ui.mgDetailExp) ui.mgDetailExp.textContent = `${cur}/${req} EXP`;
  if (ui.mgDetailExpFill) {
    const pct = req > 0 ? clamp(Math.round((cur / req) * 100), 0, 100) : 0;
    ui.mgDetailExpFill.style.width = `${pct}%`;
  }

  const raw = String(def.effectText || '').trim();
  const effect = raw
    .replaceAll('{L}', String(inst.level || 1))
    .replaceAll('X', String(inst.level || 1));
  if (ui.mgDetailEffect) ui.mgDetailEffect.textContent = effect || '—';

  const val = sellValue(inst);
  if (ui.mgDetailSell) ui.mgDetailSell.textContent = `Sell 💰 ${val}`;
}

function hideBuildingDetail(ui) {
  ui?.mgDetail?.classList.add('mg-hidden');
}

function hideResult(ui) {
  ui?.mgResult?.classList.add('mg-hidden');
}

function showFloat(ui, text) {
  const el = ui?.mgFloat;
  if (!el) return;
  el.textContent = String(text || '');
  el.classList.remove('is-on');
  // restart animation
  void el.offsetWidth;
  el.classList.add('is-on');
}

function hideAllViews(els) {
  const ids = ['view-timer', 'view-stats', 'view-pet', 'view-gacha', 'view-minigame'];
  ids.forEach((id) => {
    const v = document.getElementById(id);
    if (v) v.style.display = id === 'view-minigame' ? 'block' : 'none';
  });

  // reset sidebar active state
  ['navTimer', 'navStats', 'navPet', 'navGacha'].forEach((id) => {
    const b = document.getElementById(id);
    if (!b) return;
    b.classList.remove('active');
    b.setAttribute('aria-current', 'false');
  });

  // extra hint
  if (els?.mgHint) els.mgHint.textContent = '';
}

function render(els, st) {
  if (!els || !st) return;

  // Top bar
  if (els.mgCash) els.mgCash.textContent = String(st.cash);
  if (els.mgStage) els.mgStage.textContent = `Stage ${st.stageIdx + 1}/${STAGE_COUNT}`;
  const { goal, cur } = fmtGoal(st);
  if (els.mgGoal) els.mgGoal.textContent = `${cur}/${goal}`;
  if (els.mgGoalFill) {
    const pct = goal > 0 ? clamp(Math.round((cur / goal) * 100), 0, 100) : 0;
    els.mgGoalFill.style.width = `${pct}%`;
  }
  if (els.mgRolls) {
    const left = Math.max(0, ROLLS_PER_STAGE - (st.rollInStage || 0));
    els.mgRolls.textContent = `🎲 ${left} left | ${st.totalRolls}/${TOTAL_ROLLS}`;
  }
  if (els.mgLastRoll) els.mgLastRoll.textContent = st.lastRoll ? `Rolled ${st.lastRoll}` : '—';

  // Board
  if (els.mgBoard) {
    els.mgBoard.innerHTML = '';
    const cols = st.board.cols;
    const rows = st.board.rows;
    const playerCell = st.board.loop[st.playerLoopPos || 0];
    const placed = st.placed || {};

    els.mgBoard.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;

    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        const cellIdx = idxOf(x, y);
        const t = st.board.tiles.get(cellIdx) || null;
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'mg-cell';
        cell.setAttribute('data-idx', String(cellIdx));

        const inst = placed[String(cellIdx)] || null;

        if (!t) {
          cell.classList.add('is-empty');
          cell.disabled = true;
          cell.textContent = '';
        } else {
          cell.classList.add('is-tile');
          cell.setAttribute('data-kind', t.kind);

          if (t.kind === 'start') {
            cell.classList.add('is-start');
            cell.textContent = 'START';
          } else if (t.kind === 'path') {
            cell.classList.add('is-path');
            cell.textContent = '·';
          } else if (t.kind === 'coin') {
            cell.classList.add('is-coin');
            cell.textContent = '💰';
          } else if (t.kind === 'gift') {
            cell.classList.add('is-gift');
            cell.textContent = '🎁';
          } else if (t.kind === 'locked') {
            const unlocked = isLockedUsable(st, cellIdx);
            cell.classList.add(unlocked ? 'is-foundation2' : 'is-locked');
            cell.textContent = unlocked ? '' : '🔒';
          } else if (isFoundationKind(t.kind)) {
            cell.classList.add(t.kind === 'foundation2' ? 'is-foundation2' : 'is-foundation');
            cell.textContent = '';
          }

          if (inst) {
            const def = BUILDINGS[inst.defId];
            cell.classList.add('has-building');
            cell.innerHTML = `
              <div class="mg-bld-ico">${def?.icon || '🏗️'}</div>
              <div class="mg-bld-lv">Lv${inst.level}</div>
            `.trim();
          }

          if (cellIdx === playerCell) {
            const marker = document.createElement('div');
            marker.className = 'mg-player';
            marker.textContent = '🙂';
            cell.appendChild(marker);
          }

          // disable non-interactive empties
          if (t.kind === 'path' || t.kind === 'coin' || t.kind === 'gift' || t.kind === 'start') {
            // clickable only for debug? keep enabled
          }
        }

        els.mgBoard.appendChild(cell);
      }
    }
  }

  // Backpack
  if (els.mgBackpack) {
    els.mgBackpack.innerHTML = '';
    st.backpack.forEach((inst, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mg-pack-slot';
      btn.setAttribute('data-idx', String(idx));
      if (!inst) {
        btn.classList.add('is-empty');
        btn.textContent = 'Empty';
      } else {
        const def = BUILDINGS[inst.defId];
        btn.innerHTML = `
          <div class="mg-slot-ico">${def?.icon || '🏗️'}</div>
          <div class="mg-slot-lv">Lv${inst.level}</div>
        `.trim();
        if (st.selectingPlace && st.selectingPlace.from === 'backpack' && st.selectingPlace.idx === idx) {
          btn.classList.add('is-selected');
        }
      }
      els.mgBackpack.appendChild(btn);
    });
  }

  // Store
  if (els.mgStore) {
    els.mgStore.innerHTML = '';
    st.shop.forEach((it) => {
      const def = BUILDINGS[it.defId];
      const rar = RARITY[def?.rarity || 'common'] || RARITY.common;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mg-store-item';
      btn.setAttribute('data-slot', String(it.slot));
      btn.innerHTML = `
        <div class="mg-store-name">${def?.icon || '🏗️'} ${def?.name || it.defId}</div>
        <div class="mg-store-meta"><span class="mg-dot" style="background:${rar.color}"></span>${rar.label} · ${it.price}</div>
      `.trim();
      els.mgStore.appendChild(btn);
    });
  }

  // Costs
  if (els.mgRefreshCost) els.mgRefreshCost.textContent = `(${st.refreshCost})`;
  const nextBlockCost = BUY_BLOCK_COSTS[Math.min(BUY_BLOCK_COSTS.length - 1, Math.max(0, st.unlockedBlocks || 0))] || BUY_BLOCK_COSTS[0];
  if (els.mgBuyBlockCost) els.mgBuyBlockCost.textContent = `(${nextBlockCost})`;

  if (els.mgRollBtn) els.mgRollBtn.disabled = !canRoll(st);

  // Sell button
  if (els.mgSellBtn) {
    const sel = st.selected;
    const ok = !!sel && ((sel.from === 'backpack' && !!st.backpack[sel.idx]) || (sel.from === 'board' && !!(st.placed || {})[String(sel.idx)]));
    els.mgSellBtn.disabled = !ok;
  }
}

function mergeExpValue(inst) {
  const base = BASE_EXP_BY_LEVEL[inst.level] ?? 0;
  const cur = Math.max(0, Math.round(inst.exp || 0));
  return base + cur + 6;
}

function attachHandlers(els, stRef) {
  const ui = els;

  ui.mgExitBtn?.addEventListener('click', () => {
    closeDiceBuild(ui);
  });

  ui.mgResultExit?.addEventListener('click', () => {
    hideResult(ui);
    closeDiceBuild(ui);
  });

  ui.mgRefreshBtn?.addEventListener('click', () => {
    const st = stRef.current;
    if (!st) return;
    if (st.cash < st.refreshCost) {
      showToast(ui.toastEl, 'Not enough cash.');
      return;
    }
    st.cash -= st.refreshCost;
    st.refreshCount += 1;
    st.refreshCost = clamp(5 + st.refreshCount * 5, 5, 50);
    buildShopItems(st);
    save(st);
    render(ui, st);
  });

  ui.mgStore?.addEventListener('click', (ev) => {
    const btn = ev.target.closest('.mg-store-item');
    if (!btn) return;
    const st = stRef.current;
    if (!st) return;
    const slot = Number(btn.getAttribute('data-slot'));
    const it = st.shop.find((x) => x.slot === slot);
    if (!it) return;
    if (st.cash < it.price) {
      showToast(ui.toastEl, 'Not enough cash.');
      return;
    }
    const free = st.backpack.findIndex((x) => !x);
    if (free < 0) {
      showToast(ui.toastEl, 'Backpack full.');
      return;
    }
    st.cash -= it.price;
    st.backpack[free] = makeInstance(it.defId);
    buildShopItems(st);
    save(st);
    render(ui, st);
  });

  ui.mgBackpack?.addEventListener('click', (ev) => {
    const btn = ev.target.closest('.mg-pack-slot');
    if (!btn) return;
    const idx = Number(btn.getAttribute('data-idx'));
    const st = stRef.current;
    if (!st) return;
    const inst = st.backpack[idx];
    if (!inst) {
      // allow selecting an empty slot to clear selection
      st.selectingPlace = null;
      st.selected = null;
      save(st);
      render(ui, st);
      return;
    }
    // toggle select
    const same = st.selectingPlace && st.selectingPlace.from === 'backpack' && st.selectingPlace.idx === idx;
    st.selectingPlace = same ? null : { from: 'backpack', idx };
    st.selected = same ? null : { from: 'backpack', idx };
    save(st);
    render(ui, st);
  });

  ui.mgBoard?.addEventListener('click', (ev) => {
    const btn = ev.target.closest('.mg-cell');
    if (!btn) return;
    const st = stRef.current;
    if (!st) return;

    const cellIdx = Number(btn.getAttribute('data-idx'));
    const t = st.board.tiles.get(cellIdx) || null;
    if (!t) return;

    const placed = st.placed || (st.placed = {});
    const target = placed[String(cellIdx)] || null;
    const sel = st.selectingPlace;

    // Placement / merge from backpack selection onto tiles (including on top of same-type building)
    const canPlace = (t.kind === 'locked' ? isLockedUsable(st, cellIdx) : canPlaceOnKind(t.kind));
    if (sel && sel.from === 'backpack') {
      if (!canPlace) {
        showToast(ui.toastEl, 'Cannot place here.');
        return;
      }

      const srcIdx = sel.idx;
      const src = st.backpack[srcIdx];
      if (!src) return;

      if (!target) {
        placed[String(cellIdx)] = src;
        st.backpack[srcIdx] = null;
        st.selectingPlace = null;
        st.selected = { from: 'board', idx: cellIdx };
        showFloat(ui, 'Placed');
      } else if (target.defId === src.defId) {
        // merge
        target.exp += mergeExpValue(src);
        ensureLevels(target);
        st.backpack[srcIdx] = null;
        st.selectingPlace = null;
        st.selected = { from: 'board', idx: cellIdx };
        showFloat(ui, '+EXP');
      } else {
        showToast(ui.toastEl, 'Only same building can merge.');
      }

      save(st);
      render(ui, st);
      return;
    }

    // If clicking a building with no selected backpack item, open details
    if (target) {
      st.detail = { from: 'board', idx: cellIdx };
      st.selected = { from: 'board', idx: cellIdx };
      showBuildingDetail(ui, st, target, cellIdx);
      save(st);
      render(ui, st);
      return;
    }
  });

  ui.mgSellBtn?.addEventListener('click', () => {
    const st = stRef.current;
    if (!st) return;
    const sel = st.selected;
    if (!sel) return;
    const from = sel.from;
    const idx = sel.idx;
    const inst = from === 'board' ? (st.placed || {})[String(idx)] : st.backpack[idx];
    if (!inst) return;
    const val = sellValue(inst);
    st.cash += val;
    if (from === 'board') delete (st.placed || {})[String(idx)];
    else st.backpack[idx] = null;
    st.selected = null;
    st.selectingPlace = null;
    showFloat(ui, `+${val}`);
    save(st);
    render(ui, st);
  });

  ui.mgDetailClose?.addEventListener('click', () => {
    hideBuildingDetail(ui);
    const st = stRef.current;
    if (!st) return;
    st.detail = null;
    save(st);
    render(ui, st);
  });

  ui.mgDetail?.addEventListener('click', (ev) => {
    // click outside card closes
    if (ev.target !== ui.mgDetail) return;
    hideBuildingDetail(ui);
    const st = stRef.current;
    if (!st) return;
    st.detail = null;
    save(st);
    render(ui, st);
  });

  window.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape') return;
    if (ui.mgDetail?.classList.contains('mg-hidden')) return;
    hideBuildingDetail(ui);
    const st = stRef.current;
    if (!st) return;
    st.detail = null;
    save(st);
    render(ui, st);
  });

  ui.mgDetailSell?.addEventListener('click', () => {
    const st = stRef.current;
    if (!st) return;
    const det = st.detail;
    if (!det) return;
    const placed = st.placed || {};
    const inst = det.from === 'board' ? placed[String(det.idx)] : st.backpack[det.idx];
    if (!inst) return;
    const val = sellValue(inst);
    st.cash += val;
    if (det.from === 'board') delete placed[String(det.idx)];
    else st.backpack[det.idx] = null;
    hideBuildingDetail(ui);
    st.detail = null;
    st.selected = null;
    st.selectingPlace = null;
    showFloat(ui, `+${val}`);
    save(st);
    render(ui, st);
  });

  ui.mgBuyBlockBtn?.addEventListener('click', () => {
    const st = stRef.current;
    if (!st) return;
    const lockedTotal = 6;
    if ((st.unlockedBlocks || 0) >= lockedTotal) {
      showToast(ui.toastEl, 'All blocks unlocked.');
      return;
    }

    const costIdx = clamp(st.unlockedBlocks || 0, 0, BUY_BLOCK_COSTS.length - 1);
    const cost = BUY_BLOCK_COSTS[costIdx] || BUY_BLOCK_COSTS[0];
    if (st.cash < cost) {
      showToast(ui.toastEl, 'Not enough cash.');
      return;
    }
    st.cash -= cost;
    st.unlockedBlocks = (st.unlockedBlocks || 0) + 1;
    showFloat(ui, 'Unlocked');
    save(st);
    render(ui, st);
  });

  ui.mgRollBtn?.addEventListener('click', () => {
    const st = stRef.current;
    if (!st) return;
    if (!canRoll(st)) return;

    const roll = 1 + Math.floor(Math.random() * 6);
    st.lastRoll = roll;
    st.totalRolls += 1;
    st.rollInStage += 1;

    const float = (t) => showFloat(ui, t);

    triggerBuildingEvents(st, 'diceRolled', { roll, float });
    triggerBuildingEvents(st, 'dicePhaseEnd', { roll, float });

    stepMove(st, roll, float);
    resolveLand(st, float);

    finalizeStageIfNeeded(st, ui);
    save(st);
    render(ui, st);
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

  // Initial render uses a fresh state (kept hidden until opened)
  const st = defaultState();
  stRef.current = st;
  buildShopItems(st);
  save(st);
  render(els, st);

  // Attempt to sync unlocked building list from /api/cards, best-effort
  fetchOwnedCards().then((cards) => {
    const cur = stRef.current;
    if (!cur) return;
    cur.unlockedBuildingIds = extractUnlockedBuildingIds(cards);
    buildShopItems(cur);
    save(cur);
    render(els, cur);
  });

  // Expose dev helper
  if (typeof window !== 'undefined') {
    window.dicebuildOpen = () => openDiceBuild(els, { reason: 'dev' });
  }
}

export function openDiceBuild(els, meta) {
  if (!els?.viewMinigame) return;

  const ok = hasDiceBuildEligibility() || meta?.reason === 'dev';
  if (!ok) {
    enableGateHint(els, false);
    showToast(els.toastEl, 'Minigame is only available after focus completion.');
    return;
  }

  // Consume eligibility when opening (unless dev)
  if (meta?.reason !== 'dev') consumeDiceBuildEligibility();

  hideAllViews(els);
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
  // Exit returns to Timer view
  const timer = els?.viewTimer || document.getElementById('view-timer');
  const mg = els?.viewMinigame || document.getElementById('view-minigame');
  if (mg) mg.style.display = 'none';
  if (timer) timer.style.display = 'block';

  const navTimer = document.getElementById('navTimer');
  if (navTimer) {
    navTimer.classList.add('active');
    navTimer.setAttribute('aria-current', 'page');
  }
}
