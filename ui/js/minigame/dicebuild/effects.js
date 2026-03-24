// 2026/03/24 edited by Zhecheng Xu
// Changes:
// - Aligned trigger timings and effect order.
// - Updated building-specific rules and bonus targeting.
// - Improved Vault sold-hook and trigger feedback plumbing.
//
// dicebuild/effects.js
// Core Dice & Build trigger and movement resolution pipeline.

export function createDiceBuildEffects({
  BUILDINGS,
  BOARD_COLS,
  idxOf,
  ensureLevels,
  gainCoins,
  makeInstance,
  pick,
  grantRandomBuilding,
}) {
  function getPlacedEntries(st) {
    const placed = st.placed || {};
    return Object.entries(placed)
      .map(([key, inst]) => ({
        cellIdx: Number(key),
        inst,
        tile: st.board.tiles.get(Number(key)) || null,
      }))
      .filter((x) => x.inst && x.tile);
  }

  function cellCoord(cellIdx) {
    return {
      x: cellIdx % BOARD_COLS,
      y: Math.floor(cellIdx / BOARD_COLS),
    };
  }

  function frontageForBuildingCell(cellIdx) {
    const { x, y } = cellCoord(cellIdx);
    if (y === 0) return idxOf(x, 1);
    if (y === 6) return idxOf(x, 5);
    if (x === 0) return idxOf(1, y);
    if (x === 6) return idxOf(5, y);
    return null;
  }

  function findPlacedByFrontage(st, frontCellIdx) {
    const entries = getPlacedEntries(st);
    return entries.find((entry) => frontageForBuildingCell(entry.cellIdx) === frontCellIdx) || null;
  }

  function getAdjacentPlacedEntries(st, srcCellIdx) {
    const src = cellCoord(srcCellIdx);
    return getPlacedEntries(st).filter((entry) => {
      if (entry.cellIdx === srcCellIdx) return false;
      const p = cellCoord(entry.cellIdx);
      return Math.abs(p.x - src.x) + Math.abs(p.y - src.y) === 1;
    });
  }

  const COIN_BONUS_RECEIVER_IDS = new Set(['00', '01', '02', '04', '05', '06', '07', '08', '09', '10', '12', '13']);

  function canReceiveCoinBonus(inst) {
    return !!inst?.defId && COIN_BONUS_RECEIVER_IDS.has(inst.defId);
  }

  function isCoinTypeBuilding(inst) {
    return (BUILDINGS[inst?.defId]?.tags || []).includes('Coin');
  }

  function countPlacedByTag(st, tag) {
    const entries = getPlacedEntries(st);
    return entries.filter((entry) => (BUILDINGS[entry.inst.defId]?.tags || []).includes(tag)).length;
  }

  function sortEntriesByPathOrder(st, entries) {
    const loop = st?.board?.loop || [];
    const loopPos = new Map();
    loop.forEach((cellIdx, i) => loopPos.set(cellIdx, i));

    return [...entries].sort((a, b) => {
      const af = frontageForBuildingCell(a.cellIdx);
      const bf = frontageForBuildingCell(b.cellIdx);
      const ai = loopPos.has(af) ? loopPos.get(af) : 999;
      const bi = loopPos.has(bf) ? loopPos.get(bf) : 999;
      if (ai !== bi) return ai - bi;
      return a.cellIdx - b.cellIdx;
    });
  }

  function gainExp(inst, n, float, hooks, sourceCellIdx) {
    const add = Math.max(0, Math.round(n || 0));
    if (!add || !inst) return;
    inst.exp += add;
    ensureLevels(inst);
    if (float) float(`+${add} EXP`);
    if (hooks?.onGain && Number.isFinite(sourceCellIdx)) {
      hooks.onGain({ cellIdx: sourceCellIdx, kind: 'exp', amount: add });
    }
  }

  function gainCoinsByInst(st, inst, n, float, hooks, sourceCellIdx) {
    const base = Math.max(0, Math.round(n || 0));
    if (!base) return;
    const mod = Math.max(0, Math.round(inst?.coinMod || 0));
    gainCoins(st, base + mod, float);
    if (hooks?.onGain && Number.isFinite(sourceCellIdx)) {
      hooks.onGain({ cellIdx: sourceCellIdx, kind: 'coins', amount: base + mod });
    }
  }

  function triggerDiceEffectsForInst(st, entry, rollCtx, float, hooks, opts = {}) {
    const inst = entry?.inst;
    const defId = inst?.defId;
    if (!inst || !defId) return;
    const level = Math.max(1, inst.level || 1);
    const sum = rollCtx.sum;
    const has = (n) => rollCtx.dice.includes(n);
    const isTwo = rollCtx.dice.length >= 2;
    let didTrigger = false;

    switch (defId) {
      case '01':
        if (has(1)) {
          gainCoinsByInst(st, inst, 2 * level, float, hooks, entry.cellIdx);
          gainExp(inst, 2, float, hooks, entry.cellIdx);
          didTrigger = true;
        }
        break;
      case '02':
        if (has(6)) {
          gainCoinsByInst(st, inst, 6 * level, float, hooks, entry.cellIdx);
          didTrigger = true;
        }
        break;
      case '05':
        if (has(3)) {
          gainCoinsByInst(st, inst, 2 * level, float, hooks, entry.cellIdx);
          didTrigger = true;
        }
        break;
      case '06':
        if (sum % 2 === 0) {
          gainCoinsByInst(st, inst, 2 * level, float, hooks, entry.cellIdx);
          didTrigger = true;
        }
        if (has(6)) {
          inst.coinMod = (inst.coinMod || 0) + 1;
          didTrigger = true;
        }
        break;
      case '08':
        if (isTwo) {
          gainCoinsByInst(st, inst, 6 * level, float, hooks, entry.cellIdx);
          didTrigger = true;
        }
        if (has(1)) {
          st.nextRollTwoDice = true;
          didTrigger = true;
        }
        break;
      case '09':
        if (has(1)) {
          const coinCount = countPlacedByTag(st, 'Coin');
          gainCoinsByInst(st, inst, coinCount * level, float, hooks, entry.cellIdx);
          didTrigger = true;
        }
        if (has(6)) {
          const diceCount = countPlacedByTag(st, 'Dice');
          gainCoinsByInst(st, inst, diceCount * level, float, hooks, entry.cellIdx);
          didTrigger = true;
        }
        break;
      case '11':
        if (!opts.fromHall && (has(3) || has(4))) {
          const adj = getAdjacentPlacedEntries(st, entry.cellIdx)
            .filter((x) => (BUILDINGS[x.inst.defId]?.tags || []).includes('Coin'));
          for (const a of adj) triggerDiceEffectsForInst(st, a, rollCtx, float, hooks, { fromHall: true });
          didTrigger = true;
        }
        break;
      case '13':
        if (isTwo) {
          gainCoinsByInst(st, inst, sum * level, float, hooks, entry.cellIdx);
          didTrigger = true;
        }
        break;
      case '14':
        if (has(5)) {
          gainExp(inst, level, float, hooks, entry.cellIdx);
          const others = getPlacedEntries(st).filter((x) => x.cellIdx !== entry.cellIdx);
          for (let i = 0; i < level && others.length; i += 1) {
            const pickIdx = Math.floor(Math.random() * others.length);
            const [picked] = others.splice(pickIdx, 1);
            gainExp(picked.inst, level, float, hooks, picked.cellIdx);
          }
          didTrigger = true;
        }
        break;
      default:
        break;
    }

    if (didTrigger && hooks?.onTrigger) {
      hooks.onTrigger({ cellIdx: entry.cellIdx, phase: 'dice' });
    }
    return didTrigger;
  }

  function triggerDicePhaseEndForInst(st, entry, float, hooks) {
    const inst = entry?.inst;
    const defId = inst?.defId;
    if (!inst || !defId) return;
    const level = Math.max(1, inst.level || 1);
    let didTrigger = false;

    if (defId === '00') {
      gainCoinsByInst(st, inst, level, float, hooks, entry.cellIdx);
      didTrigger = true;
    }
    if (defId === '07') {
      gainCoinsByInst(st, inst, level, float, hooks, entry.cellIdx);
      didTrigger = true;
    }
    if (defId === '03') {
      gainExp(inst, 1, float, hooks, entry.cellIdx);
      didTrigger = true;
    }
    if (defId === '10') {
      for (const target of getPlacedEntries(st)) {
        if (target.inst.defId === '03' || target.inst.defId === '01') {
          gainExp(target.inst, level, float, hooks, target.cellIdx);
        }
      }
      didTrigger = true;
    }

    if (didTrigger && hooks?.onTrigger) {
      hooks.onTrigger({ cellIdx: entry.cellIdx, phase: 'dice_end' });
    }
    return didTrigger;
  }

  async function triggerOpeningPhasesSequential(st, rollCtx, float, hooks, onTriggered) {
    const placed = sortEntriesByPathOrder(st, getPlacedEntries(st));
    for (const entry of placed) {
      const didRoll = triggerDiceEffectsForInst(st, entry, rollCtx, float, hooks);
      const didEnd = triggerDicePhaseEndForInst(st, entry, float, hooks);
      if ((didRoll || didEnd) && onTriggered) {
        await onTriggered({ cellIdx: entry.cellIdx, phase: 'dice_open' });
      }
    }
  }

  function triggerPassByFrontage(st, frontCellIdx, float, hooks) {
    const entry = findPlacedByFrontage(st, frontCellIdx);
    if (!entry) return { triggered: false };
    const inst = entry.inst;
    const defId = inst.defId;
    const level = Math.max(1, inst.level || 1);
    let didTrigger = false;

    if (defId === '04') {
      gainCoinsByInst(st, inst, 2 * level, float, hooks, entry.cellIdx);
      didTrigger = true;
    } else if (defId === '10') {
      gainCoinsByInst(st, inst, 1, float, hooks, entry.cellIdx);
      didTrigger = true;
    } else if (defId === '12') {
      gainCoinsByInst(st, inst, 5 * level, float, hooks, entry.cellIdx);
      const all = getPlacedEntries(st)
        .filter((x) => isCoinTypeBuilding(x.inst) && canReceiveCoinBonus(x.inst));
      if (all.length) {
        const target = pick(all);
        target.inst.coinMod = (target.inst.coinMod || 0) + level;
      }
      didTrigger = true;
    } else if (defId === '13') {
      st.nextRollTwoDice = true;
      didTrigger = true;
    } else if (defId === '14') {
      const grantId = Math.random() < 0.5 ? '03' : '01';
      const idx = st.backpack.findIndex((x) => !x);
      if (idx >= 0) {
        st.backpack[idx] = makeInstance(grantId);
        if (float) float('Get Building');
      } else {
        gainCoins(st, 5, float);
      }
      didTrigger = true;
    }
    if (didTrigger && hooks?.onTrigger) hooks.onTrigger({ cellIdx: entry.cellIdx, phase: 'pass' });
    return { triggered: didTrigger, cellIdx: didTrigger ? entry.cellIdx : null };
  }

  function triggerLandOnFrontage(st, frontCellIdx, float, hooks) {
    const entry = findPlacedByFrontage(st, frontCellIdx);
    if (!entry) return { triggered: false };
    const inst = entry.inst;
    const defId = inst.defId;
    const level = Math.max(1, inst.level || 1);
    let didTrigger = false;

    if (defId === '04') {
      gainExp(inst, level + 1, float, hooks, entry.cellIdx);
      const adj = getAdjacentPlacedEntries(st, entry.cellIdx);
      for (const a of adj) gainExp(a.inst, level + 1, float, hooks, a.cellIdx);
      didTrigger = true;
    } else if (defId === '05') {
      const adj = getAdjacentPlacedEntries(st, entry.cellIdx);
      for (const a of adj) {
        if (isCoinTypeBuilding(a.inst) && canReceiveCoinBonus(a.inst)) {
          a.inst.coinMod = (a.inst.coinMod || 0) + level;
        }
      }
      didTrigger = true;
    } else if (defId === '11') {
      const all = getPlacedEntries(st);
      for (const a of all) {
        if (isCoinTypeBuilding(a.inst) && canReceiveCoinBonus(a.inst)) {
          a.inst.coinMod = (a.inst.coinMod || 0) + level;
        }
      }
      didTrigger = true;
    }
    if (didTrigger && hooks?.onTrigger) hooks.onTrigger({ cellIdx: entry.cellIdx, phase: 'land' });
    return { triggered: didTrigger, cellIdx: didTrigger ? entry.cellIdx : null };
  }

  async function stepMove(st, steps, onStep) {
    const loop = st.board.loop;
    const len = loop.length;
    let p = st.playerLoopPos || 0;
    const traversed = [];

    for (let i = 0; i < steps; i += 1) {
      p = (p + 1) % len;
      const cellIdx = loop[p];
      traversed.push(cellIdx);
      st.playerLoopPos = p;
      if (onStep) {
        await onStep({ loopPos: p, cellIdx, stepIndex: i + 1, totalSteps: steps });
      }

      if (p === 0) {
        st.shopEnabled = true;
        return { traversed, stoppedAtStart: true };
      }
    }

    return { traversed, stoppedAtStart: false };
  }

  async function resolvePathTriggers(st, traversed, float, hooks, onTriggered) {
    if (!Array.isArray(traversed) || !traversed.length) return;
    for (const cellIdx of traversed) {
      const passInfo = triggerPassByFrontage(st, cellIdx, float, hooks);
      if (passInfo?.triggered && onTriggered) {
        await onTriggered({ cellIdx: passInfo.cellIdx, phase: 'pass' });
      }
    }
  }

  function resolveLand(st, float, hooks) {
    const loopIdx = st.playerLoopPos || 0;
    const cellIdx = st.board.loop[loopIdx];

    // Landing can stack with pass-by because movement already triggers pass-by per step.
    const landInfo = triggerLandOnFrontage(st, cellIdx, float, hooks);

    const tile = st.board.tiles.get(cellIdx);
    if (!tile) return;
    if (tile.kind === 'coin') {
      gainCoins(st, 5, float);
    }
    if (tile.kind === 'gift') {
      grantRandomBuilding(st, float);
    }
    return { landTriggered: !!landInfo?.triggered };
  }

  function triggerBuildingEvents(st, eventName, ctx) {
    const placed = sortEntriesByPathOrder(st, getPlacedEntries(st));
    if (eventName === 'diceRolled') {
      for (const entry of placed) {
        triggerDiceEffectsForInst(st, entry, ctx.rollCtx, ctx.float, ctx.hooks);
      }
      return;
    }
    if (eventName === 'dicePhaseEnd') {
      const rollId = ctx?.rollCtx?.rollId != null ? String(ctx.rollCtx.rollId) : '';
      if (rollId) {
        if (st.__lastDicePhaseEndRollId === rollId) return;
        st.__lastDicePhaseEndRollId = rollId;
      }
      for (const entry of placed) {
        triggerDicePhaseEndForInst(st, entry, ctx.float, ctx.hooks);
      }
    }
  }

  function triggerStageClearForPlaced(st) {
    for (const entry of getPlacedEntries(st)) {
      if (entry.inst.defId === '07') {
        const level = Math.max(1, Number(entry.inst.level || 1));
        entry.inst.coinMod = (entry.inst.coinMod || 0) + level;
      }
    }
  }

  function triggerSoldHooks(st, soldInst) {
    const affected = [];
    if (!soldInst) return affected;
    if (soldInst.defId !== '03' && soldInst.defId !== '01') return affected;
    for (const entry of getPlacedEntries(st)) {
      if (entry.inst.defId === '10') {
        entry.inst.coinMod = (entry.inst.coinMod || 0) + 1;
        affected.push(entry.cellIdx);
      }
    }
    return affected;
  }

  return {
    stepMove,
    resolvePathTriggers,
    resolveLand,
    triggerBuildingEvents,
    triggerOpeningPhasesSequential,
    triggerStageClearForPlaced,
    triggerSoldHooks,
  };
}
