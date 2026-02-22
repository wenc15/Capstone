// 2026/02/21 edited by Zhecheng Xu
// Changes:
//  - Refined draw-result panel interactions (close behavior, skip stability, auto fade).
//  - Kept single-draw card size consistent with 10x draw card slots.
//  - Linked draw results to inventory updates and made draw commit happen on click (animation is display-only).
// =============================================================
// Purpose:
//  - Keep gacha result data deterministic even if animation is interrupted/closed.
//  - Improve UX consistency for panel layout, toast timing, and reveal rhythm.

import { refreshCredits } from './creditsStore.js';
import { showToast } from './utils.js';

const API_BASE = 'http://localhost:5024';

const FOOD_POOL = [
  { foodId: 'basic_food', name: 'Basic Food', rarity: 'Common', expValue: 5, icon: '🥣', weight: 62 },
  { foodId: 'meat_snack', name: 'Meat Snack', rarity: 'Rare', expValue: 15, icon: '🍖', weight: 28 },
  { foodId: 'adv_food', name: 'Adv. Food', rarity: 'Legendary', expValue: 30, icon: '🐟', weight: 10 },
];

let mounted = false;
let isAnimating = false;
let skipRequested = false;
let fadeStartTimer = null;
let fadeEndTimer = null;

export function mountGacha(els) {
  if (mounted) return;
  mounted = true;

  const { viewGacha, toastEl } = els || {};
  if (!viewGacha) return;

  const singleBtn = viewGacha.querySelector('#gachaSingleBtn');
  const tenBtn = viewGacha.querySelector('#gachaTenBtn');
  if (!singleBtn || !tenBtn) return;

  const stage = viewGacha.querySelector('.gacha-stage');
  if (!stage) return;

  const panel = buildResultPanel();
  stage.appendChild(panel.root);

  const runDraw = async (count) => {
    if (isAnimating) return;
    isAnimating = true;
    skipRequested = false;
    cancelAutoFade(panel.root);

    setGachaButtonsEnabled(els, false);
    panel.skipBtn.disabled = false;
    panel.skipBtn.style.visibility = 'visible';
    panel.skipBtn.style.pointerEvents = 'auto';
    panel.skipBtn.setAttribute('aria-hidden', 'false');

    const items = mockDraw(count);
    let commitSucceeded = false;
    const commitPromise = commitDrawResultNow(items).then(() => {
      commitSucceeded = true;
    });

    panel.root.classList.remove('is-hidden');
    renderCards(panel.gridEl, items, count === 10);
    panel.metaEl.textContent = count === 10 ? '10x draw in progress...' : 'Single draw in progress...';

    try {
      await revealCardsInTwoPhases(panel.gridEl, panel.metaEl, items);
      await commitPromise;
      const rewardText = formatRewardSummary(items);
      panel.metaEl.textContent = formatSummary();
      showToast(toastEl, count === 10 ? `10 cards revealed. ${rewardText}` : `Card revealed. ${rewardText}`);
      scheduleAutoFade(panel.root);
    } catch (e) {
      try {
        await commitPromise;
      } catch {
      }
      console.warn('[Gacha] draw animation error:', e);
      showToast(toastEl, commitSucceeded ? 'Draw saved. Animation interrupted.' : 'Draw failed. Rewards were not updated.');
    } finally {
      isAnimating = false;
      skipRequested = false;
      panel.skipBtn.style.visibility = 'hidden';
      panel.skipBtn.style.pointerEvents = 'none';
      panel.skipBtn.setAttribute('aria-hidden', 'true');
      setGachaButtonsEnabled(els, true);
    }
  };

  singleBtn.addEventListener('click', () => runDraw(1));
  tenBtn.addEventListener('click', () => runDraw(10));
  panel.skipBtn.addEventListener('click', () => {
    skipRequested = true;
    panel.skipBtn.disabled = true;
  });

  panel.closeBtn.addEventListener('click', () => {
    skipRequested = true;
    cancelAutoFade(panel.root);
    panel.root.classList.add('is-hidden');
  });
}

async function commitDrawResultNow(items) {
  await grantDrawRewards(items);
  await refreshCredits();
}

function buildResultPanel() {
  const root = document.createElement('section');
  root.className = 'gacha-reveal-panel';
  root.innerHTML = `
    <div class="gacha-reveal-head">
      <div class="gacha-reveal-title">Draw Result</div>
      <div class="gacha-reveal-head-actions">
        <button type="button" class="gacha-skip-btn" aria-hidden="true">Skip</button>
        <button type="button" class="gacha-close-btn" aria-label="Close draw result">×</button>
      </div>
    </div>
    <div class="gacha-reveal-meta">Pick single or 10x draw to start.</div>
    <div class="gacha-reveal-grid" aria-live="polite"></div>
  `;

  return {
    root,
    gridEl: root.querySelector('.gacha-reveal-grid'),
    metaEl: root.querySelector('.gacha-reveal-meta'),
    skipBtn: root.querySelector('.gacha-skip-btn'),
    closeBtn: root.querySelector('.gacha-close-btn'),
  };
}

function mockDraw(count) {
  const items = [];
  for (let i = 0; i < count; i += 1) {
    items.push(weightedPick(FOOD_POOL));
  }

  if (count === 10 && !items.some((x) => x.foodId === 'adv_food')) {
    const idx = Math.floor(Math.random() * items.length);
    items[idx] = FOOD_POOL.find((x) => x.foodId === 'adv_food') || items[idx];
  }

  return items.map((item) => ({ ...item }));
}

function weightedPick(pool) {
  const total = pool.reduce((sum, item) => sum + (item.weight || 1), 0);
  let roll = Math.random() * total;
  for (const item of pool) {
    roll -= (item.weight || 1);
    if (roll <= 0) return item;
  }
  return pool[pool.length - 1];
}

function renderCards(gridEl, items, isTenDraw) {
  gridEl.classList.toggle('is-ten', isTenDraw);
  gridEl.classList.toggle('is-single', !isTenDraw);
  gridEl.innerHTML = '';

  items.forEach((item, idx) => {
    const card = document.createElement('article');
    card.className = 'gacha-flip-card';
    card.setAttribute('data-rarity', String(item.rarity || 'Common').toLowerCase());
    card.setAttribute('data-index', String(idx));
    card.innerHTML = `
      <div class="gacha-flip-inner">
        <div class="gacha-face gacha-face-back">?</div>
        <div class="gacha-face gacha-face-front">
          <div class="gacha-item-icon">${item.icon}</div>
          <div class="gacha-item-name">${item.name}</div>
          <div class="gacha-item-meta">${item.rarity} · +${item.expValue} EXP</div>
        </div>
      </div>
    `;
    gridEl.appendChild(card);
  });
}

async function revealCardsInTwoPhases(gridEl, metaEl, items) {
  const cards = Array.from(gridEl.querySelectorAll('.gacha-flip-card'));

  for (let i = 0; i < cards.length; i += 1) {
    const card = cards[i];
    if (!card) continue;

    card.classList.add('is-dealt');

    if (skipRequested) {
      revealAll(cards);
      metaEl.textContent = 'Animation skipped. All cards revealed.';
      break;
    }

    await sleep(130);
    card.classList.add('is-flipped');
    metaEl.textContent = `Revealed ${i + 1}/${items.length}: ${items[i].name}`;
    await sleep(120);
  }
}

function revealAll(cards) {
  cards.forEach((card) => {
    card.classList.add('is-dealt');
    card.classList.add('is-flipped');
  });
}

function formatSummary() {
  return 'Draw complete.';
}

async function grantDrawRewards(items) {
  const grouped = countByFoodId(items);
  const ids = Object.keys(grouped);

  for (const itemId of ids) {
    const amount = grouped[itemId];
    await addInventoryItem(itemId, amount);
  }
}

function countByFoodId(items) {
  return items.reduce((acc, item) => {
    if (!item?.foodId) return acc;
    acc[item.foodId] = (acc[item.foodId] || 0) + 1;
    return acc;
  }, {});
}

function formatRewardSummary(items) {
  const grouped = countByFoodId(items);
  return Object.entries(grouped)
    .map(([foodId, amount]) => {
      const meta = FOOD_POOL.find((x) => x.foodId === foodId);
      const label = meta?.name || foodId;
      return `${label} +${amount}`;
    })
    .join(', ');
}

async function addInventoryItem(itemId, amount) {
  const res = await fetch(`${API_BASE}/api/inventory/add`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ itemId, amount }),
  });

  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (!res.ok) {
    const msg = body?.message || `${res.status} ${res.statusText}`;
    const err = new Error(msg);
    err.status = res.status;
    err.body = body;
    throw err;
  }

  return body;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function scheduleAutoFade(panelRoot) {
  cancelAutoFade(panelRoot);

  fadeStartTimer = setTimeout(() => {
    panelRoot.classList.add('is-fading');
  }, 2500);

  fadeEndTimer = setTimeout(() => {
    panelRoot.classList.add('is-hidden');
    panelRoot.classList.remove('is-fading');
  }, 3400);
}

function cancelAutoFade(panelRoot) {
  if (fadeStartTimer) {
    clearTimeout(fadeStartTimer);
    fadeStartTimer = null;
  }

  if (fadeEndTimer) {
    clearTimeout(fadeEndTimer);
    fadeEndTimer = null;
  }

  panelRoot.classList.remove('is-fading');
}

export async function onEnterGacha() {
  try {
    await refreshCredits();
  } catch (e) {
    console.warn('[Gacha] onEnterGacha refreshCredits failed:', e);
  }
}

export function setGachaButtonsEnabled(els, enabled) {
  const root = els?.viewGacha;
  if (!root) return;

  const singleBtn = root.querySelector('#gachaSingleBtn');
  const tenBtn = root.querySelector('#gachaTenBtn');
  if (singleBtn) singleBtn.disabled = !enabled;
  if (tenBtn) tenBtn.disabled = !enabled;
}
