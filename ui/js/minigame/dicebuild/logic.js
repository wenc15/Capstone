// 2026/03/24 edited by Zhecheng Xu
// Changes:
// - Updated reward balancing helpers and EXP cap behavior.
// - Synced gift building generation with stage rarity weights.
//
// dicebuild/logic.js
// Rule helpers for pricing, progression, and reward math.

import {
  BUILDINGS,
  BUILDING_IDS,
  LEVEL_REQ,
  RARITY,
  SHOP_RATES_BY_STAGE,
  STAGES,
  TOTAL_ROLLS,
  ROLLS_PER_STAGE,
} from './constants.js';

export function createDiceBuildLogic({ makeInstance }) {
  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }

  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function pickByWeight(weightMap) {
    const entries = Object.entries(weightMap || {}).filter(([, w]) => Number(w) > 0);
    if (!entries.length) return 'common';
    const total = entries.reduce((sum, [, w]) => sum + Number(w), 0);
    let t = Math.random() * total;
    for (const [k, w] of entries) {
      t -= Number(w);
      if (t <= 0) return k;
    }
    return entries[entries.length - 1][0];
  }

  function buildShopItems(st) {
    const rates = SHOP_RATES_BY_STAGE[clamp(st.stageIdx || 0, 0, SHOP_RATES_BY_STAGE.length - 1)] || SHOP_RATES_BY_STAGE[0];
    const byRarity = {
      common: BUILDING_IDS.filter((id) => BUILDINGS[id]?.rarity === 'common'),
      rare: BUILDING_IDS.filter((id) => BUILDINGS[id]?.rarity === 'rare'),
      epic: BUILDING_IDS.filter((id) => BUILDINGS[id]?.rarity === 'epic'),
      legendary: BUILDING_IDS.filter((id) => BUILDINGS[id]?.rarity === 'legendary'),
    };

    const items = [];
    for (let i = 0; i < 5; i += 1) {
      const rarity = pickByWeight(rates);
      const rarityPool = byRarity[rarity] && byRarity[rarity].length ? byRarity[rarity] : BUILDING_IDS;
      const id = pick(rarityPool);
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
      if (inst.exp < req) break;
      inst.exp -= req;
      lvl += 1;
    }
    inst.level = lvl;
    if (inst.level >= 4) {
      inst.exp = 16;
    }
  }

  function sellValue(inst) {
    const def = BUILDINGS[inst.defId];
    const idx = clamp((inst.level || 1) - 1, 0, 3);
    const byDef = Array.isArray(def?.sellByLevel) ? def.sellByLevel : null;
    if (byDef && byDef[idx] != null) return byDef[idx];
    const rar = RARITY[def?.rarity || 'common'] || RARITY.common;
    return rar.sell[idx];
  }

  function expReqForNext(level) {
    if (level >= 4) return 16;
    return LEVEL_REQ[level + 1] ?? 16;
  }

  function gainCoins(st, n, float) {
    const amount = Math.max(0, Math.round(n || 0));
    if (!amount) return;
    st.coinsEarned += amount;
    st.cash += amount;
    if (float) float(`+${amount}`);
  }

  function grantRandomBuilding(st, float) {
    const rates = SHOP_RATES_BY_STAGE[clamp(st.stageIdx || 0, 0, SHOP_RATES_BY_STAGE.length - 1)] || SHOP_RATES_BY_STAGE[0];
    const byRarity = {
      common: BUILDING_IDS.filter((x) => BUILDINGS[x]?.rarity === 'common'),
      rare: BUILDING_IDS.filter((x) => BUILDINGS[x]?.rarity === 'rare'),
      epic: BUILDING_IDS.filter((x) => BUILDINGS[x]?.rarity === 'epic'),
      legendary: BUILDING_IDS.filter((x) => BUILDINGS[x]?.rarity === 'legendary'),
    };
    const rarity = pickByWeight(rates);
    const pool = byRarity[rarity] && byRarity[rarity].length ? byRarity[rarity] : BUILDING_IDS;
    const id = pick(pool);
    const inst = makeInstance(id);
    const idx = st.backpack.findIndex((x) => !x);
    if (idx >= 0) {
      st.backpack[idx] = inst;
      if (float) float('Get Building');
    } else {
      st.cash += 5;
      if (float) float('+5 (Full)');
    }
  }

  return {
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
  };
}
