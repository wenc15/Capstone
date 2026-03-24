// 2026/03/24 edited by Zhecheng Xu
// Changes:
// - Refined drag/drop stability and hover behavior.
// - Added shop refresh/entry animations and unlock toggle UX.
// - Improved dice animation resilience for rapid clicks.
// - Added visual feedback for Vault sold-hook triggers.
//
// dicebuild/actions.js
// Event binding and interaction handling for Dice & Build.

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const DICE_GIF_URL = new URL('../../../assets/dice/dice.gif', import.meta.url).href;
const DICE_FACE_URL = {
  1: new URL('../../../assets/dice/1.png', import.meta.url).href,
  2: new URL('../../../assets/dice/2.png', import.meta.url).href,
  3: new URL('../../../assets/dice/3.png', import.meta.url).href,
  4: new URL('../../../assets/dice/4.png', import.meta.url).href,
  5: new URL('../../../assets/dice/5.png', import.meta.url).href,
  6: new URL('../../../assets/dice/6.png', import.meta.url).href,
};

let diceGifTokenSeed = 0;
let activeDiceAnimId = 0;

function renderDicePreview(ui, faces, opts = {}) {
  const el = ui?.mgLastRoll;
  if (!el) return;

  el.innerHTML = '';
  const row = document.createElement('div');
  row.className = 'mg-dice-row';
  const useGif = !!opts.useGif;

  faces.forEach((face, i) => {
    const n = Math.max(1, Math.min(6, Number(face || 1)));
    const wrap = document.createElement('div');
    wrap.className = 'mg-die-wrap';

    const die = document.createElement('img');
    die.className = 'mg-die-face';
    if (useGif) die.classList.add('is-gif');
    die.alt = `dice ${n}`;
    if (useGif) {
      const token = opts.gifToken || Date.now();
      die.src = '';
      die.src = `${DICE_GIF_URL}?r=${token}_${i}`;
    } else {
      die.src = DICE_FACE_URL[n];
    }

    const num = document.createElement('span');
    num.className = 'mg-die-num';
    num.textContent = String(n);

    wrap.appendChild(die);
    wrap.appendChild(num);
    row.appendChild(wrap);
  });

  el.appendChild(row);
}

async function animateDiceRoll(ui, result) {
  const label = ui?.mgLastRoll;
  if (!label) return;
  const animId = ++activeDiceAnimId;

  const rollBtn = ui?.mgRollBtn;
  if (rollBtn) rollBtn.classList.add('is-rolling');

  const dice = Array.isArray(result?.dice) ? result.dice : [1];
  const gifToken = `${Date.now()}_${++diceGifTokenSeed}`;
  renderDicePreview(ui, dice, { useGif: true, gifToken });
  await sleep(760);
  if (animId !== activeDiceAnimId) return;
  renderDicePreview(ui, dice);
  if (rollBtn && animId === activeDiceAnimId) rollBtn.classList.remove('is-rolling');
}

function mergeExpValue(inst, BASE_EXP_BY_LEVEL) {
  const base = BASE_EXP_BY_LEVEL[inst.level] ?? 0;
  const cur = Math.max(0, Math.round(inst.exp || 0));
  return base + cur + 6;
}

function playUnlockLockDrop(ui, anchorEl) {
  const root = ui?.mgRoot;
  if (!root || !anchorEl) return;

  const rootRect = root.getBoundingClientRect();
  const cellRect = anchorEl.getBoundingClientRect();

  const lock = document.createElement('div');
  lock.className = 'mg-lock-drop';
  lock.textContent = '🔒';
  lock.style.left = `${Math.round(cellRect.left - rootRect.left + (cellRect.width * 0.5) - 10)}px`;
  lock.style.top = `${Math.round(cellRect.top - rootRect.top + (cellRect.height * 0.42))}px`;
  root.appendChild(lock);

  // Physics-style drop: small initial upward velocity, random horizontal drift,
  // then gravity-accelerated fall (quadratic position in time).
  let x = 0;
  let y = 0;
  const dir = Math.random() < 0.5 ? -1 : 1;
  const vx = dir * (46 + Math.random() * 58); // px / s
  let vy = -(120 + Math.random() * 70); // px / s
  const g = 840; // px / s^2
  let rot = 0;
  const vr = dir * (110 + Math.random() * 130); // deg / s

  let prev = performance.now();
  const start = prev;
  const maxDur = 980;
  const maxDrop = 108;

  function step(now) {
    const dt = Math.max(0.001, (now - prev) / 1000);
    prev = now;

    vy += g * dt;
    x += vx * dt;
    y += vy * dt;
    rot += vr * dt;

    const t = (now - start) / maxDur;
    const fade = Math.max(0, 1 - (t * t));
    lock.style.opacity = String(Math.min(0.98, fade));
    lock.style.transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) rotate(${rot.toFixed(2)}deg)`;

    if ((now - start) < maxDur && y < maxDrop) {
      requestAnimationFrame(step);
    } else {
      lock.remove();
    }
  }

  requestAnimationFrame(step);
}

export function attachDiceBuildHandlers(els, stRef, deps) {
  const {
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
    triggerOpeningPhasesSequential,
    stepMove,
    resolvePathTriggers,
    resolveLand,
    finalizeStageIfNeeded,
  } = deps;

  const ui = els;
  let dragSource = null;
  let suppressBoardClick = false;
  let ignoreClickUntil = 0;
  let justDropped = false;
  let pendingDeferredRender = false;
  let shopRefreshAnimating = false;
  let hoverHideTimer = null;

  const cancelHoverHide = () => {
    if (hoverHideTimer) {
      clearTimeout(hoverHideTimer);
      hoverHideTimer = null;
    }
  };

  const hideHoverSoon = (delay = 70) => {
    cancelHoverHide();
    hoverHideTimer = setTimeout(() => {
      hoverHideTimer = null;
      hideHoverCard(ui);
    }, delay);
  };

  const showHoverStable = (payload, anchorEl) => {
    cancelHoverHide();
    showHoverCard(ui, payload, anchorEl);
  };

  const setDragBuildVisual = (on) => {
    ui?.mgRoot?.classList.toggle('is-drag-build', !!on);
  };

  const markJustDropped = () => {
    justDropped = true;
    ignoreClickUntil = Date.now() + 420;
    setTimeout(() => {
      justDropped = false;
    }, 430);
  };

  const forceResetDragState = () => {
    const st = stRef.current;
    dragSource = null;
    setDragBuildVisual(false);
    if (st) st.dragPreview = null;
    clearBoardDropState();
    clearBackpackDropState();
    ui.mgBackpack?.querySelectorAll('.mg-pack-slot').forEach((slot) => {
      slot.classList.remove('is-dragging');
    });
    ui.mgStore?.querySelectorAll('.mg-store-item').forEach((slot) => {
      slot.classList.remove('is-dragging');
    });
    ui.mgBoard?.querySelectorAll('.mg-cell').forEach((slot) => {
      slot.classList.remove('is-dragging');
    });
    if (pendingDeferredRender && st) {
      pendingDeferredRender = false;
      render(ui, st);
    }
  };

  setDragBuildVisual(false);

  const clearBoardDropState = () => {
    ui.mgBoard?.querySelectorAll('.mg-cell').forEach((cell) => {
      cell.classList.remove('is-drop-ok', 'is-drop-merge', 'is-drop-bad');
    });
  };

  const clearBackpackDropState = () => {
    ui.mgBackpack?.querySelectorAll('.mg-pack-slot').forEach((cell) => {
      cell.classList.remove('is-drop-ok', 'is-drop-bad');
    });
  };

  const renderMaybe = (st) => {
    if (!st) return;
    if (dragSource || st.isMoving) {
      pendingDeferredRender = true;
      return;
    }
    pendingDeferredRender = false;
    render(ui, st);
  };

  const movePlayerMarkerToLoopPos = (st, loopPos) => {
    const boardEl = ui?.mgBoard;
    if (!boardEl || !st?.board?.loop) return;
    const cellIdx = st.board.loop[loopPos];
    if (!Number.isFinite(cellIdx)) return;

    const prev = boardEl.querySelector('.mg-player');
    if (prev) prev.remove();

    const target = boardEl.querySelector(`.mg-cell[data-idx="${cellIdx}"]`);
    if (!target) return;

    const marker = document.createElement('div');
    marker.className = 'mg-player is-hop';
    marker.textContent = '🙂';
    target.appendChild(marker);
  };

  const lockedUnlockOrder = [
    14, 21, 28,
    20, 27, 34,
  ];

  const getLockedChoices = (st) => {
    const unlocked = new Set(st.unlockedLockedCells || []);
    return lockedUnlockOrder.filter((idx) => !unlocked.has(idx));
  };

  const pulseCell = (st, cellIdx, duration = 520, opts = {}) => {
    if (!Number.isFinite(cellIdx)) return;
    const now = Date.now();
    st.fxPulse = st.fxPulse || {};
    const key = String(cellIdx);
    const curUntil = st.fxPulse[key] || 0;
    if (!opts.force && curUntil > now + 120) return;
    const until = now + duration;
    st.fxPulse[key] = until;
    setTimeout(() => {
      const live = stRef.current;
      if (!live || !live.fxPulse) return;
      const cur = live.fxPulse[key] || 0;
      if (cur <= Date.now()) {
        delete live.fxPulse[key];
        renderMaybe(live);
      }
    }, duration + 30);
  };

  const pushCellFx = (st, cellIdx, text, kind = 'coins') => {
    if (!Number.isFinite(cellIdx) || !text) return;
    const born = Date.now();
    const duration = 820;
    const id = `fx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const until = born + duration;
    st.cellFxItems = Array.isArray(st.cellFxItems) ? st.cellFxItems : [];
    st.cellFxItems.push({ id, cellIdx, text, kind, born, duration, until });

    setTimeout(() => {
      const live = stRef.current;
      if (!live || !Array.isArray(live.cellFxItems)) return;
      live.cellFxItems = live.cellFxItems.filter((x) => x.id !== id);
      renderMaybe(live);
    }, duration + 40);
  };

  const playSoldHookFx = (st, affectedCells) => {
    if (!Array.isArray(affectedCells) || !affectedCells.length) return;
    for (const cellIdx of affectedCells) {
      if (!Number.isFinite(cellIdx)) continue;
      pulseCell(st, cellIdx, 720, { force: true });
      pushCellFx(st, cellIdx, 'Vault +1 Coin Gain', 'coins');
    }
  };

  const getSelectedInstance = (st) => {
    const sel = st?.selected;
    if (!sel) return null;
    if (sel.from === 'board') {
      return (st.placed || {})[String(sel.idx)] || null;
    }
    if (sel.from === 'backpack') {
      return st.backpack?.[sel.idx] || null;
    }
    return null;
  };

  const clearSellSelection = (st) => {
    st.selected = null;
    st.detail = null;
  };

  const sellSelectedBuilding = (st) => {
    const sel = st?.selected;
    if (!sel) return false;
    const inst = getSelectedInstance(st);
    if (!inst) return false;

    const val = sellValue(inst);
    st.cash += val;
    st.coinsEarned = (st.coinsEarned || 0) + val;
    const soldAffected = triggerSoldHooks(st, inst);
    playSoldHookFx(st, soldAffected);

    if (sel.from === 'board') {
      delete (st.placed || {})[String(sel.idx)];
    } else if (sel.from === 'backpack') {
      st.backpack[sel.idx] = null;
    }

    clearSellSelection(st);
    showFloat(ui, `+${val}`);
    return true;
  };

  const resolveDragPayload = (st) => {
    if (!dragSource) return null;
    if (dragSource.kind === 'backpack') {
      const src = st.backpack[dragSource.idx];
      if (!src) return null;
      return { source: 'backpack', inst: src };
    }
    if (dragSource.kind === 'store') {
      const it = st.shop.find((x) => x.slot === dragSource.slot);
      if (!it || it.soldOut || !it.defId) return null;
      return { source: 'store', item: it, inst: makeInstance(it.defId) };
    }
    if (dragSource.kind === 'board') {
      const inst = (st.placed || {})[String(dragSource.cellIdx)] || null;
      if (!inst) return null;
      return { source: 'board', inst, cellIdx: dragSource.cellIdx };
    }
    return null;
  };

  const getDropMeta = (st, payload, cellIdx) => {
    const src = payload?.inst;
    if (!src) return { ok: false, msg: 'Invalid source.' };
    const t = st.board.tiles.get(cellIdx) || null;
    if (!t) return { ok: false, msg: 'Cannot place here.' };

    const placed = st.placed || (st.placed = {});
    const target = placed[String(cellIdx)] || null;

    // Placed board buildings are fixed in place.
    // They can only be dragged onto same-type buildings for merge.
    if (payload?.source === 'board') {
      if (Number(payload.cellIdx) === Number(cellIdx)) return { ok: false, msg: '' };
      if (!target) return { ok: false, msg: 'Placed buildings cannot move to empty tiles.' };
      if (target.defId === src.defId) return { ok: true, mode: 'merge', src, target };
      return { ok: false, msg: 'Only same building can merge.' };
    }

    // Backpack/store buildings can place on valid build tiles, or merge on same-type target.
    const canPlace = ((t.kind === 'locked' || t.kind === 'build_locked')
      ? isLockedUsable(st, cellIdx)
      : canPlaceOnKind(t.kind));
    if (!canPlace) return { ok: false, msg: 'Cannot place here.' };

    if (!target) return { ok: true, mode: 'place', src, target: null };
    if (target.defId === src.defId) return { ok: true, mode: 'merge', src, target };
    return { ok: false, msg: 'Only same building can merge.' };
  };

  const applyBoardDropHints = (st) => {
    if (!st || !dragSource) return;
    const payload = resolveDragPayload(st);
    clearBoardDropState();
    if (!payload) return;

    ui.mgBoard?.querySelectorAll('.mg-cell').forEach((cell) => {
      const cellIdx = Number(cell.getAttribute('data-idx'));
      if (!Number.isFinite(cellIdx)) return;
      const meta = getDropMeta(st, payload, cellIdx);
      if (!meta.ok) return;
      cell.classList.add(meta.mode === 'merge' ? 'is-drop-merge' : 'is-drop-ok');
    });
  };

  const applyBackpackDropHints = (st) => {
    if (!st || !dragSource || dragSource.kind !== 'store') return;
    clearBackpackDropState();
    ui.mgBackpack?.querySelectorAll('.mg-pack-slot').forEach((slot) => {
      const idx = Number(slot.getAttribute('data-idx'));
      if (!Number.isFinite(idx)) return;
      slot.classList.add(st.backpack[idx] ? 'is-drop-bad' : 'is-drop-ok');
    });
  };

  const consumeShopSlot = (st, slot) => {
    if (!st || !Array.isArray(st.shop)) return;
    st.shop = st.shop.map((it) => {
      if (Number(it?.slot) !== Number(slot)) return it;
      return { slot: Number(slot), soldOut: true };
    });
  };

  const playShopRefreshSlide = async () => {
    const storeEl = ui.mgStore;
    if (!storeEl) return;

    const oldItems = Array.from(storeEl.querySelectorAll('.mg-store-item'));
    if (oldItems.length) {
      oldItems.forEach((el, i) => {
        el.style.setProperty('--mg-store-stagger', `${i * 22}ms`);
        el.classList.add('is-refresh-out');
      });
      await sleep(220 + ((oldItems.length - 1) * 22));
    }

    const st = stRef.current;
    if (!st) return;
    render(ui, st);

    const newItems = Array.from(storeEl.querySelectorAll('.mg-store-item'));
    if (!newItems.length) return;

    newItems.forEach((el, i) => {
      el.style.setProperty('--mg-store-stagger', `${i * 22}ms`);
      el.classList.add('is-refresh-in');
    });
    requestAnimationFrame(() => {
      newItems.forEach((el) => el.classList.add('is-refresh-in-active'));
    });

    setTimeout(() => {
      newItems.forEach((el) => {
        el.classList.remove('is-refresh-in', 'is-refresh-in-active');
        el.style.removeProperty('--mg-store-stagger');
      });
    }, 330 + ((newItems.length - 1) * 22));
  };

  const playStoreOpenFx = () => {
    const bar = ui.mgStorebar;
    const storeEl = ui.mgStore;
    if (!bar || !storeEl) return;

    bar.classList.remove('is-entering');
    void bar.offsetWidth;
    bar.classList.add('is-entering');

    const items = Array.from(storeEl.querySelectorAll('.mg-store-item'));
    if (!items.length) return;

    items.forEach((el, i) => {
      el.style.setProperty('--mg-store-stagger', `${i * 26}ms`);
      el.classList.add('is-start-in');
    });

    setTimeout(() => {
      items.forEach((el) => {
        el.classList.remove('is-start-in');
        el.style.removeProperty('--mg-store-stagger');
      });
      bar.classList.remove('is-entering');
    }, 460 + ((items.length - 1) * 26));
  };

  ui.mgMenuBtn?.addEventListener('click', () => {
    openMinigameHub(ui, { bypassGate: true, reason: 'hub' });
  });

  ui.mgExitBtn?.addEventListener('click', () => {
    closeDiceBuild(ui);
  });

  ui.mgResultExit?.addEventListener('click', () => {
    hideResult(ui);
    closeDiceBuild(ui);
  });

  ui.mgRefreshBtn?.addEventListener('click', async () => {
    const st = stRef.current;
    if (!st) return;
    if (shopRefreshAnimating) return;
    if (!st.shopEnabled) {
      showToast(ui.toastEl, 'Shop is only available at START.');
      return;
    }
    if (st.cash < st.refreshCost) {
      showToast(ui.toastEl, 'Not enough cash.');
      return;
    }
    st.cash -= st.refreshCost;
    st.refreshCount += 1;
    st.refreshCost = clamp(5 + st.refreshCount * 5, 5, 50);
    buildShopItems(st);
    save(st);
    shopRefreshAnimating = true;
    if (ui.mgRefreshBtn) ui.mgRefreshBtn.disabled = true;
    try {
      await playShopRefreshSlide();
    } finally {
      shopRefreshAnimating = false;
      const live = stRef.current;
      if (ui.mgRefreshBtn && live) ui.mgRefreshBtn.disabled = !live.shopEnabled;
    }
  });

  ui.mgStore?.addEventListener('click', (ev) => {
    const btn = ev.target.closest('.mg-store-item');
    if (!btn) return;
    const st = stRef.current;
    if (!st) return;
    if (!st.shopEnabled) {
      showToast(ui.toastEl, 'Shop is only available at START.');
      return;
    }
    const slot = Number(btn.getAttribute('data-slot'));
    const it = st.shop.find((x) => x.slot === slot);
    if (!it) return;
    if (it.soldOut) return;
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
    consumeShopSlot(st, slot);
    save(st);
    render(ui, st);
  });

  ui.mgStore?.addEventListener('mousemove', (ev) => {
    const btn = ev.target.closest('.mg-store-item');
    if (!btn) {
      hideHoverSoon(80);
      return;
    }

    const st = stRef.current;
    if (!st) return;
    const slot = Number(btn.getAttribute('data-slot'));
    const it = st.shop.find((x) => x.slot === slot);
    if (!it || it.soldOut || !it.defId) {
      hideHoverSoon(65);
      return;
    }

    const def = BUILDINGS[it.defId] || {};
    showHoverStable({
      def,
      defId: it.defId,
      icon: def.icon,
      name: def.name,
      rarity: def.rarity,
      tags: def.tags || [],
      level: 1,
      exp: 0,
      showExp: false,
      preferTop: true,
    }, btn);
  });

  ui.mgStore?.addEventListener('mouseleave', () => hideHoverSoon(55));

  ui.mgStore?.addEventListener('dragstart', (ev) => {
    const btn = ev.target.closest('.mg-store-item');
    if (!btn) return;
    const st = stRef.current;
    if (!st || !st.shopEnabled) {
      ev.preventDefault();
      return;
    }

    const slot = Number(btn.getAttribute('data-slot'));
    const it = st.shop.find((x) => x.slot === slot);
    if (!it) {
      ev.preventDefault();
      return;
    }
    if (it.soldOut || !it.defId) {
      ev.preventDefault();
      return;
    }
    if (st.cash < it.price) {
      ev.preventDefault();
      showToast(ui.toastEl, 'Not enough cash.');
      return;
    }

    dragSource = { kind: 'store', slot };
    ignoreClickUntil = Date.now() + 220;
    setDragBuildVisual(true);
    st.dragPreview = { source: 'store', defId: it.defId };
    btn.classList.add('is-dragging');
    applyBoardDropHints(st);
    applyBackpackDropHints(st);
    if (ev.dataTransfer) {
      ev.dataTransfer.effectAllowed = 'copyMove';
      ev.dataTransfer.setData('text/plain', `store:${slot}`);
    }
  });

  ui.mgStore?.addEventListener('dragend', () => {
    dragSource = null;
    setDragBuildVisual(false);
    markJustDropped();
    const st = stRef.current;
    if (st) st.dragPreview = null;
    ui.mgStore?.querySelectorAll('.mg-store-item').forEach((slot) => {
      slot.classList.remove('is-dragging');
    });
    clearBoardDropState();
    clearBackpackDropState();
  });

  ui.mgBoard?.addEventListener('dragstart', (ev) => {
    const btn = ev.target.closest('.mg-cell');
    if (!btn) return;
    const st = stRef.current;
    if (!st) return;

    const cellIdx = Number(btn.getAttribute('data-idx'));
    const inst = (st.placed || {})[String(cellIdx)] || null;
    if (!inst) {
      ev.preventDefault();
      return;
    }

    dragSource = { kind: 'board', cellIdx };
    ignoreClickUntil = Date.now() + 220;
    setDragBuildVisual(false);
    st.dragPreview = { source: 'board', defId: inst.defId, cellIdx };
    btn.classList.add('is-dragging');
    applyBoardDropHints(st);
    if (ev.dataTransfer) {
      ev.dataTransfer.effectAllowed = 'move';
      ev.dataTransfer.setData('text/plain', `board:${cellIdx}`);
    }
  });

  ui.mgBoard?.addEventListener('dragend', () => {
    dragSource = null;
    setDragBuildVisual(false);
    markJustDropped();
    const st = stRef.current;
    if (st) st.dragPreview = null;
    ui.mgBoard?.querySelectorAll('.mg-cell').forEach((slot) => {
      slot.classList.remove('is-dragging');
    });
    clearBoardDropState();
    clearBackpackDropState();
  });

  ui.mgBackpack?.addEventListener('dragstart', (ev) => {
    const btn = ev.target.closest('.mg-pack-slot');
    if (!btn) return;
    const st = stRef.current;
    if (!st) return;

    const idx = Number(btn.getAttribute('data-idx'));
    if (!st.backpack[idx]) {
      ev.preventDefault();
      return;
    }

    dragSource = { kind: 'backpack', idx };
    ignoreClickUntil = Date.now() + 220;
    setDragBuildVisual(true);
    st.dragPreview = { source: 'backpack', defId: st.backpack[idx].defId, idx };
    btn.classList.add('is-dragging');
    applyBoardDropHints(st);
    if (ev.dataTransfer) {
      ev.dataTransfer.effectAllowed = 'move';
      ev.dataTransfer.setData('text/plain', String(idx));
    }
  });

  ui.mgBackpack?.addEventListener('dragend', () => {
    dragSource = null;
    setDragBuildVisual(false);
    markJustDropped();
    const st = stRef.current;
    if (st) st.dragPreview = null;
    ui.mgBackpack?.querySelectorAll('.mg-pack-slot').forEach((slot) => {
      slot.classList.remove('is-dragging');
    });
    clearBoardDropState();
    clearBackpackDropState();
  });

  ui.mgBackpack?.addEventListener('dragover', (ev) => {
    if (!dragSource || dragSource.kind !== 'store') return;
    const btn = ev.target.closest('.mg-pack-slot');
    if (!btn) return;
    const st = stRef.current;
    if (!st) return;

    ev.preventDefault();
    const idx = Number(btn.getAttribute('data-idx'));
    const ok = !st.backpack[idx];
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = ok ? 'copy' : 'none';
  });

  ui.mgBackpack?.addEventListener('drop', (ev) => {
    ev.preventDefault();
    clearBackpackDropState();
    if (!dragSource || dragSource.kind !== 'store') return;

    const btn = ev.target.closest('.mg-pack-slot');
    if (!btn) return;

    const st = stRef.current;
    if (!st || !st.shopEnabled) return;

    const payload = resolveDragPayload(st);
    if (!payload || payload.source !== 'store') return;
    if (st.cash < payload.item.price) {
      showToast(ui.toastEl, 'Not enough cash.');
      return;
    }

    const idx = Number(btn.getAttribute('data-idx'));
    if (st.backpack[idx]) {
      showToast(ui.toastEl, 'Backpack slot is occupied.');
      return;
    }

    st.cash -= payload.item.price;
    st.backpack[idx] = payload.inst;
    consumeShopSlot(st, payload.item.slot);

    dragSource = null;
    setDragBuildVisual(false);
    st.dragPreview = null;
    markJustDropped();
    ui.mgStore?.querySelectorAll('.mg-store-item').forEach((slot) => {
      slot.classList.remove('is-dragging');
    });
    save(st);
    renderMaybe(st);
  });

  ui.mgBackpack?.addEventListener('mousemove', (ev) => {
    const btn = ev.target.closest('.mg-pack-slot');
    if (!btn) {
      hideHoverSoon(80);
      return;
    }

    const st = stRef.current;
    if (!st) return;
    const idx = Number(btn.getAttribute('data-idx'));
    const inst = st.backpack[idx];
    if (!inst) {
      hideHoverSoon(65);
      return;
    }

    const def = BUILDINGS[inst.defId] || {};
    showHoverStable({
      def,
      defId: inst.defId,
      inst,
      icon: def.icon,
      name: def.name,
      rarity: def.rarity,
      tags: def.tags || [],
      level: inst.level,
      exp: inst.exp,
      showExp: false,
      preferLeft: true,
    }, btn);
  });

  ui.mgBackpack?.addEventListener('mouseleave', () => hideHoverSoon(55));

  ui.mgBackpack?.addEventListener('click', (ev) => {
    if (Date.now() < ignoreClickUntil) return;
    if (justDropped) return;
    const btn = ev.target.closest('.mg-pack-slot');
    if (!btn) return;
    const st = stRef.current;
    if (!st) return;

    const idx = Number(btn.getAttribute('data-idx'));
    const inst = st.backpack[idx];
    if (!inst) {
      if (st.selected) {
        clearSellSelection(st);
        save(st);
        render(ui, st);
      }
      return;
    }

    const sel = st.selected;
    const isSame = !!sel && sel.from === 'backpack' && Number(sel.idx) === idx;
    if (isSame) {
      if (sellSelectedBuilding(st)) {
        save(st);
        render(ui, st);
      }
      return;
    }

    st.selected = { from: 'backpack', idx };
    st.detail = null;
    save(st);
    render(ui, st);
  });

  ui.mgBoard?.addEventListener('dragover', (ev) => {
    if (!dragSource) return;
    const btn = ev.target.closest('.mg-cell');
    if (!btn) return;
    const st = stRef.current;
    if (!st) return;

    ev.preventDefault();

    const payload = resolveDragPayload(st);
    if (!payload) return;

    const cellIdx = Number(btn.getAttribute('data-idx'));
    const meta = getDropMeta(st, payload, cellIdx);
    if (meta.ok && meta.mode === 'merge') {
      btn.classList.add('is-drop-merge');
      if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move';
      return;
    }
    if (meta.ok) {
      btn.classList.add('is-drop-ok');
      if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move';
      return;
    }
    btn.classList.add('is-drop-bad');
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'none';
  });

  ui.mgBoard?.addEventListener('dragleave', (ev) => {
    const btn = ev.target.closest('.mg-cell');
    if (!btn) return;
    btn.classList.remove('is-drop-bad');
  });

  ui.mgBoard?.addEventListener('drop', (ev) => {
    ev.preventDefault();
    clearBoardDropState();

    const btn = ev.target.closest('.mg-cell');
    if (!btn || !dragSource) return;

    const st = stRef.current;
    if (!st) return;
    const payload = resolveDragPayload(st);
    if (!payload) return;

    if (payload.source === 'store' && st.cash < payload.item.price) {
      showToast(ui.toastEl, 'Not enough cash.');
      return;
    }

    const cellIdx = Number(btn.getAttribute('data-idx'));
    const meta = getDropMeta(st, payload, cellIdx);
    if (!meta.ok) {
      if (meta.msg) showToast(ui.toastEl, meta.msg);
      return;
    }

    const placed = st.placed || (st.placed = {});
    const src = payload.inst;
    if (!src) return;

    if (meta.mode === 'place') {
      placed[String(cellIdx)] = src;
      if (payload.source === 'backpack') {
        st.backpack[dragSource.idx] = null;
      }
      showFloat(ui, 'Placed');
    } else if (meta.mode === 'merge') {
      meta.target.coinMod = Math.max(0, Math.round(meta.target.coinMod || 0))
        + Math.max(0, Math.round(src.coinMod || 0));
      meta.target.exp += mergeExpValue(src, BASE_EXP_BY_LEVEL);
      ensureLevels(meta.target);
      if (payload.source === 'backpack') {
        st.backpack[dragSource.idx] = null;
      }
      showFloat(ui, '+EXP');
    }

    if (payload.source === 'store') {
      st.cash -= payload.item.price;
      consumeShopSlot(st, payload.item.slot);
    } else if (payload.source === 'board') {
      delete placed[String(payload.cellIdx)];
    }

    st.selectingPlace = null;
    clearSellSelection(st);
    dragSource = null;
    setDragBuildVisual(false);
    st.dragPreview = null;
    markJustDropped();
    ui.mgBackpack?.querySelectorAll('.mg-pack-slot').forEach((slot) => {
      slot.classList.remove('is-dragging');
    });
    ui.mgStore?.querySelectorAll('.mg-store-item').forEach((slot) => {
      slot.classList.remove('is-dragging');
    });
    ui.mgBoard?.querySelectorAll('.mg-cell').forEach((slot) => {
      slot.classList.remove('is-dragging');
    });
    suppressBoardClick = true;
    setTimeout(() => {
      suppressBoardClick = false;
    }, 0);

    save(st);
    render(ui, st);
  });

  ui.mgBoard?.addEventListener('click', (ev) => {
    if (suppressBoardClick) return;
    if (Date.now() < ignoreClickUntil) return;
    if (justDropped) return;
    const btn = ev.target.closest('.mg-cell');
    if (!btn) return;
    const st = stRef.current;
    if (!st) return;

    const cellIdx = Number(btn.getAttribute('data-idx'));
    const t = st.board.tiles.get(cellIdx) || null;
    if (!t) return;

    if (st.selectingUnlock) {
      const lockedKind = t.kind === 'locked' || t.kind === 'build_locked';
      const unlocked = isLockedUsable(st, cellIdx);
      if (!lockedKind || unlocked) {
        showToast(ui.toastEl, 'Select a locked block to unlock.');
        return;
      }

      const cost = Math.max(0, Math.round(st.pendingUnlockCost || 0));
      if (st.cash < cost) {
        showToast(ui.toastEl, 'Not enough cash.');
        st.selectingUnlock = false;
        st.pendingUnlockCost = 0;
        save(st);
        render(ui, st);
        return;
      }

      const unlockedList = Array.isArray(st.unlockedLockedCells) ? st.unlockedLockedCells : [];
      if (!unlockedList.includes(cellIdx)) unlockedList.push(cellIdx);
      playUnlockLockDrop(ui, btn);
      st.unlockedLockedCells = unlockedList;
      st.unlockedBlocks = unlockedList.length;
      st.cash -= cost;
      st.selectingUnlock = false;
      st.pendingUnlockCost = 0;
      showFloat(ui, 'Unlocked');
      save(st);
      render(ui, st);
      return;
    }

    const placed = st.placed || (st.placed = {});
    const target = placed[String(cellIdx)] || null;

    if (target) {
      const sel = st.selected;
      const isSame = !!sel && sel.from === 'board' && Number(sel.idx) === cellIdx;
      if (isSame) {
        if (sellSelectedBuilding(st)) {
          save(st);
          render(ui, st);
        }
        return;
      }

      st.selected = { from: 'board', idx: cellIdx };
      st.detail = null;
      save(st);
      render(ui, st);
      return;
    }

    if (st.selected) {
      clearSellSelection(st);
      save(st);
      render(ui, st);
    }
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
    st.coinsEarned = (st.coinsEarned || 0) + val;
    const soldAffected = triggerSoldHooks(st, inst);
    playSoldHookFx(st, soldAffected);
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

    if (st.selectingUnlock) {
      st.selectingUnlock = false;
      st.pendingUnlockCost = 0;
      showToast(ui.toastEl, 'Unlock selection cancelled.');
      save(st);
      render(ui, st);
      return;
    }

    const choices = getLockedChoices(st);
    if (!choices.length) {
      showToast(ui.toastEl, 'All blocks unlocked.');
      return;
    }

    const costIdx = clamp(st.unlockedBlocks || 0, 0, BUY_BLOCK_COSTS.length - 1);
    const cost = BUY_BLOCK_COSTS[costIdx] || BUY_BLOCK_COSTS[0];
    if (st.cash < cost) {
      showToast(ui.toastEl, 'Not enough cash.');
      return;
    }
    st.selectingUnlock = true;
    st.pendingUnlockCost = cost;
    showToast(ui.toastEl, 'Select one locked block to unlock.');
    save(st);
    render(ui, st);
  });

  ui.mgRollBtn?.addEventListener('click', async () => {
    const st = stRef.current;
    if (!st) return;
    if (!canRoll(st) || st.isRolling) return;
    let shouldPlayStoreOpenFx = false;

    st.isRolling = true;
    render(ui, st);

    try {
      if ((st.playerLoopPos || 0) === 0) {
        st.shopEnabled = false;
      }

      const useTwoDice = !!st.nextRollTwoDice;
      st.nextRollTwoDice = false;
      const d1 = 1 + Math.floor(Math.random() * 6);
      const d2 = useTwoDice ? (1 + Math.floor(Math.random() * 6)) : null;
      const dice = d2 == null ? [d1] : [d1, d2];
      const roll = dice.reduce((sum, n) => sum + n, 0);
      const rollText = d2 == null ? String(d1) : `${d1}+${d2}=${roll}`;

      await animateDiceRoll(ui, { dice, rollText });

      st.lastRoll = rollText;
      st.lastDice = [...dice];
      st.totalRolls += 1;
      st.rollInStage += 1;
      const rollId = st.totalRolls;

      const float = (t) => showFloat(ui, t);
      const hooks = {
        onTrigger: ({ cellIdx }) => {
          pulseCell(st, cellIdx, 540);
        },
        onGain: ({ cellIdx, kind, amount }) => {
          if (!amount || !Number.isFinite(cellIdx)) return;
          pulseCell(st, cellIdx, 560);
          const txt = kind === 'exp' ? `+${amount} EXP` : `+${amount} 💵`;
          pushCellFx(st, cellIdx, txt, kind);
        },
      };
      const rollCtx = { dice, sum: roll, rollId };

      await triggerOpeningPhasesSequential(st, rollCtx, float, hooks, async () => {
        render(ui, st);
        await sleep(300);
      });

      st.isMoving = true;
      render(ui, st);
      const moveInfo = await stepMove(st, roll, async ({ loopPos }) => {
        movePlayerMarkerToLoopPos(st, loopPos);
        await sleep(185);
      });
      if (moveInfo?.stoppedAtStart) {
        buildShopItems(st);
        shouldPlayStoreOpenFx = true;
      }
      st.isMoving = false;
      pendingDeferredRender = false;
      await resolvePathTriggers(st, moveInfo?.traversed || [], float, hooks, async () => {
        render(ui, st);
        await sleep(330);
      });
      const landInfo = resolveLand(st, float, hooks);
      if (landInfo?.landTriggered) {
        render(ui, st);
        await sleep(320);
      }

      finalizeStageIfNeeded(st, ui);
      save(st);
    } finally {
      st.isMoving = false;
      st.isRolling = false;
      pendingDeferredRender = false;
      render(ui, st);
      if (shouldPlayStoreOpenFx && st.shopEnabled) {
        playStoreOpenFx();
      }
    }
  });

  ui.mgBoard?.addEventListener('mousemove', (ev) => {
    const btn = ev.target.closest('.mg-cell');
    if (!btn) {
      hideHoverSoon(80);
      return;
    }

    const st = stRef.current;
    if (!st) return;
    const cellIdx = Number(btn.getAttribute('data-idx'));
    const inst = (st.placed || {})[String(cellIdx)];
    if (!inst) {
      hideHoverSoon(65);
      return;
    }

    const def = BUILDINGS[inst.defId] || {};
    showHoverStable({
      def,
      defId: inst.defId,
      inst,
      icon: def.icon,
      name: def.name,
      rarity: def.rarity,
      tags: def.tags || [],
      level: inst.level,
      exp: inst.exp,
      showExp: true,
      preferTop: true,
    }, btn);
  });

  ui.mgBoard?.addEventListener('mouseleave', () => hideHoverSoon(55));

  ui.mgRoot?.addEventListener('click', (ev) => {
    const st = stRef.current;
    if (!st || !st.selected) return;

    const keep = ev.target.closest('.mg-cell, .mg-pack-slot, .mg-detail-card, #mgDetail');
    if (keep) return;

    clearSellSelection(st);
    save(st);
    render(ui, st);
  });

  window.addEventListener('dragend', forceResetDragState);
  window.addEventListener('drop', () => {
    setTimeout(forceResetDragState, 0);
  });
  window.addEventListener('blur', forceResetDragState);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) forceResetDragState();
  });
}
