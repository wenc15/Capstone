// 2026/03/22 edited by Zhecheng Xu
// Changes:
//  - Keep minimal gacha layout and restore "Feed Your Goals" food title.
//  - Make pool arrows non-wrapping with first/last hide behavior.
//  - Add pool info modal (i button) for credits/cost/featured/current pool/rates.
//  - Add slide-style pool transition with custom background per pool.

import { refreshCredits, subscribeCredits } from './creditsStore.js';
import { showToast } from './utils.js';

const API_BASE = 'http://localhost:5024';
const DRAW_COST = 5;
const TEN_DRAW_COUNT = 10;

const POOLS = [
  {
    key: 'food',
    title: 'Feed Your Goals',
    poolName: 'Food Pool',
    subtitle: 'Pet foods',
    featured: 'Adv. Food',
    tenSubText: 'adv. food guaranteed',
    apiType: 'food',
    rates: [
      { label: 'Common Food', value: '70%' },
      { label: 'Rare Food', value: '25%' },
      { label: 'Adv. Food (Epic)', value: '5%' },
    ],
    tenDrawNote: '10x: at least one Epic food guaranteed.',
  },
  {
    key: 'snake',
    title: 'Snake Skins',
    poolName: 'Snake Skin Pool',
    subtitle: 'Draw cosmetic skins for Snake minigame.',
    featured: 'Snake skin',
    tenSubText: 'snake skin guaranteed',
    apiType: 'skin',
    backendPool: 'snake',
    rates: [
      { label: 'Common', value: '70%' },
      { label: 'Rare', value: '25%' },
      { label: 'Snake skin (Epic)', value: '5%' },
    ],
    tenDrawNote: '10x: guaranteed epic snake skin in this pool.',
  },
  {
    key: 'tetris',
    title: 'Tetris Skins',
    poolName: 'Tetris Skin Pool',
    subtitle: 'Draw cosmetic skins for Tetris minigame.',
    featured: 'Tetris skin',
    tenSubText: 'tetris skin guaranteed',
    apiType: 'skin',
    backendPool: 'tetris',
    rates: [
      { label: 'Common', value: '70%' },
      { label: 'Rare', value: '25%' },
      { label: 'Tetris skin (Epic)', value: '5%' },
    ],
    tenDrawNote: '10x: guaranteed epic tetris skin in this pool.',
  },
];

const FOOD_ICON_BY_ID = {
  basic_food: '🥣',
  meat_snack: '🍖',
  adv_food: '🐟',
  food_001: '🥣',
  food_002: '🍖',
  food_003: '🍗',
  food_004: '🐟',
};

const POOL_BG_CLASSES = ['gacha-bg-food', 'gacha-bg-snake', 'gacha-bg-tetris'];

let mounted = false;
let currentPoolIdx = 0;
let isAnimating = false;
let isPoolSliding = false;
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
  const prevBtn = viewGacha.querySelector('#gachaPoolPrevBtn');
  const nextBtn = viewGacha.querySelector('#gachaPoolNextBtn');
  const infoBtn = viewGacha.querySelector('#gachaPoolInfoBtn');
  const currentLabel = viewGacha.querySelector('#gachaPoolCurrentLabel');
  const titleMain = viewGacha.querySelector('#gachaTitleMain');
  const titleSub = viewGacha.querySelector('#gachaTitleSub');
  const tenSubText = viewGacha.querySelector('#gachaTenSubText');
  const lastDrawEl = viewGacha.querySelector('#gachaLastDraw .gacha-last-draw-value');
  const creditValueEl = viewGacha.querySelector('#gachaCreditValue');
  const stage = viewGacha.querySelector('.gacha-min-stage');
  let activeBgEl = viewGacha.querySelector('[data-bg-slot="active"]');
  let incomingBgEl = viewGacha.querySelector('[data-bg-slot="incoming"]');

  if (!singleBtn || !tenBtn || !prevBtn || !nextBtn || !infoBtn || !titleMain || !lastDrawEl || !creditValueEl || !stage || !activeBgEl || !incomingBgEl) return;

  const panel = buildResultPanel();
  const info = buildInfoModal();
  stage.appendChild(panel.root);
  stage.appendChild(info.root);

  const syncNavButtons = () => {
    prevBtn.hidden = currentPoolIdx <= 0;
    nextBtn.hidden = currentPoolIdx >= POOLS.length - 1;
    prevBtn.disabled = false;
    nextBtn.disabled = false;
  };

  const syncInfoModal = (pool = getCurrentPool()) => {
    try {
      renderPoolInfo(info, pool, Number(creditValueEl.textContent || 0));
    } catch (err) {
      console.warn('[Gacha] renderPoolInfo failed:', err);
    }
  };

  const applyPoolText = (pool = getCurrentPool()) => {
    if (currentLabel) currentLabel.textContent = pool.poolName;
    titleMain.textContent = pool.title;
    if (titleSub) titleSub.textContent = pool.subtitle;
    if (tenSubText) tenSubText.textContent = pool.tenSubText || 'guaranteed';
    syncNavButtons();
    syncInfoModal(pool);
  };

  const setPoolBackground = (el, poolKey) => {
    if (!el) return;
    el.classList.remove(...POOL_BG_CLASSES);
    el.classList.add(`gacha-bg-${poolKey}`);
  };

  const syncBgLayerOrder = () => {
    if (activeBgEl) activeBgEl.style.zIndex = '1';
    if (incomingBgEl) incomingBgEl.style.zIndex = '0';
  };

  const switchPoolWithSlide = (nextIdx, direction) => {
    if (isPoolSliding) return;
    if (nextIdx < 0 || nextIdx >= POOLS.length || nextIdx === currentPoolIdx) return;

    isPoolSliding = true;
    const nextPool = POOLS[nextIdx];

    setPoolBackground(incomingBgEl, nextPool.key);
    incomingBgEl.style.zIndex = '2';
    activeBgEl.style.zIndex = '1';
    incomingBgEl.style.transition = 'none';
    activeBgEl.style.transition = 'none';
    incomingBgEl.style.transform = `translateX(${direction > 0 ? '100%' : '-100%'})`;
    activeBgEl.style.transform = 'translateX(0)';

    void incomingBgEl.offsetWidth;

    const slideTransition = 'transform 420ms cubic-bezier(0.22, 1, 0.36, 1)';
    incomingBgEl.style.transition = slideTransition;
    activeBgEl.style.transition = slideTransition;

    stage.classList.remove('gacha-pool-slide-left', 'gacha-pool-slide-right');
    stage.classList.add(direction > 0 ? 'gacha-pool-slide-right' : 'gacha-pool-slide-left');

    currentPoolIdx = nextIdx;
    applyPoolText(nextPool);

    requestAnimationFrame(() => {
      incomingBgEl.style.transform = 'translateX(0)';
      activeBgEl.style.transform = `translateX(${direction > 0 ? '-100%' : '100%'})`;
    });

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;

      const oldActive = activeBgEl;
      activeBgEl = incomingBgEl;
      incomingBgEl = oldActive;

      if (incomingBgEl) {
        incomingBgEl.style.transition = 'none';
        incomingBgEl.style.transform = 'translateX(0)';
      }
      if (activeBgEl) {
        activeBgEl.style.transition = 'none';
        activeBgEl.style.transform = 'translateX(0)';
      }

      syncBgLayerOrder();

      isPoolSliding = false;
      stage.classList.remove('gacha-pool-slide-left', 'gacha-pool-slide-right');
      syncNavButtons();
    };

    incomingBgEl.addEventListener('transitionend', finish, { once: true });
    setTimeout(finish, 500);
  };

  setPoolBackground(activeBgEl, getCurrentPool().key);
  setPoolBackground(incomingBgEl, getCurrentPool().key);
  syncBgLayerOrder();
  applyPoolText();

  subscribeCredits((credits) => {
    creditValueEl.textContent = String(typeof credits === 'number' ? credits : 0);
    syncInfoModal();
  });
  refreshCredits().catch(() => {});

  const runDraw = async (count) => {
    if (isAnimating || isPoolSliding) return;
    isAnimating = true;
    skipRequested = false;
    cancelAutoFade(panel.root);

    panel.skipBtn.disabled = false;
    panel.skipBtn.style.visibility = 'visible';
    panel.skipBtn.style.pointerEvents = 'auto';
    panel.skipBtn.setAttribute('aria-hidden', 'false');

    // Show facedown cards first, then flip to reveal results.
    renderFaceDownCards(panel.gridEl, count);
    panel.metaEl.textContent = count === 1 ? 'Drawing...' : 'Drawing 10...';
    panel.root.classList.remove('is-hidden');

    try {
      const credits = await refreshCredits();
      const required = count * DRAW_COST;
      if (credits < required) throw new Error(`Not enough credits. Need ${required}, current ${credits}.`);

      const pool = getCurrentPool();
      const { items, guaranteeApplied } = await drawFromPool(pool, count);
      if (!items.length) throw new Error('No draw result returned.');

      applyResultsToCards(panel.gridEl, items);
      lastDrawEl.textContent = formatLastDraw(items);

      panel.metaEl.textContent = count === 1 ? 'Single draw ready to reveal.' : `${items.length} results ready to reveal.`;
      await revealCardsSequentially(panel.gridEl, panel.metaEl, items);

      const convertedDuplicateSkinCount = await handleDuplicateSkinCompensation(items);
      await refreshCredits();

      const rewardText = formatRewardSummary(items);
      panel.metaEl.textContent = `Draw complete. ${rewardText}${guaranteeApplied ? ' Guarantee triggered.' : ''}`;
      showToast(toastEl, rewardText);
      if (convertedDuplicateSkinCount > 0) {
        const bonus = convertedDuplicateSkinCount * 5;
        showToast(toastEl, `Duplicate skin converted: +${bonus} Adv. Food`);
      }
      scheduleAutoFade(panel.root);
    } catch (error) {
      console.warn('[Gacha] draw failed:', error);
      panel.root.classList.add('is-hidden');
      showToast(toastEl, error?.message || 'Draw failed.');
    } finally {
      isAnimating = false;
      skipRequested = false;
      panel.skipBtn.style.visibility = 'hidden';
      panel.skipBtn.style.pointerEvents = 'none';
      panel.skipBtn.setAttribute('aria-hidden', 'true');
    }
  };

  singleBtn.addEventListener('click', () => runDraw(1));
  tenBtn.addEventListener('click', () => runDraw(TEN_DRAW_COUNT));
  prevBtn.addEventListener('click', () => {
    if (currentPoolIdx <= 0 || isPoolSliding) return;
    switchPoolWithSlide(currentPoolIdx - 1, -1);
  });
  nextBtn.addEventListener('click', () => {
    if (currentPoolIdx >= POOLS.length - 1 || isPoolSliding) return;
    switchPoolWithSlide(currentPoolIdx + 1, 1);
  });

  infoBtn.addEventListener('click', () => {
    syncInfoModal();
    info.root.classList.add('open');
  });
  info.closeBtn.addEventListener('click', () => info.root.classList.remove('open'));
  info.root.addEventListener('click', (ev) => {
    if (ev.target === info.root) info.root.classList.remove('open');
  });

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

function getCurrentPool() {
  return POOLS[currentPoolIdx] || POOLS[0];
}

function buildResultPanel() {
  const root = document.createElement('section');
  root.className = 'gacha-reveal-panel is-hidden';
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

function buildInfoModal() {
  const root = document.createElement('section');
  root.className = 'gacha-info-modal';
  root.innerHTML = `
    <article class="gacha-info-card" role="dialog" aria-modal="true" aria-label="Pool information">
      <div class="gacha-info-head">
        <h3 class="gacha-info-title">Pool Info</h3>
        <button class="gacha-info-close" type="button" aria-label="Close pool info">×</button>
      </div>
      <div class="gacha-info-sub" data-role="pool"></div>
      <div class="gacha-info-sub" data-role="featured"></div>
      <div class="gacha-info-sub" data-role="cost"></div>
      <div class="gacha-info-sub" data-role="credit"></div>
      <ul class="gacha-info-list" data-role="rates"></ul>
      <div class="gacha-info-sub" data-role="ten-note"></div>
    </article>
  `;

  return {
    root,
    closeBtn: root.querySelector('.gacha-info-close'),
    poolEl: root.querySelector('[data-role="pool"]'),
    featuredEl: root.querySelector('[data-role="featured"]'),
    costEl: root.querySelector('[data-role="cost"]'),
    creditEl: root.querySelector('[data-role="credit"]'),
    ratesEl: root.querySelector('[data-role="rates"]'),
    tenNoteEl: root.querySelector('[data-role="ten-note"]'),
  };
}

function renderPoolInfo(info, pool, credits) {
  if (!info || !pool) return;

  info.poolEl.textContent = `Current pool: ${pool.poolName}`;
  info.featuredEl.textContent = `Featured: ${pool.featured}`;
  info.costEl.textContent = `Cost: ${DRAW_COST} token (single) / ${DRAW_COST * TEN_DRAW_COUNT} tokens (10x)`;
  info.creditEl.textContent = `Your credits: ${Number.isFinite(credits) ? credits : 0}`;
  info.tenNoteEl.textContent = pool.tenDrawNote || '';

  info.ratesEl.innerHTML = '';
  (pool.rates || []).forEach((item) => {
    const row = document.createElement('li');
    row.textContent = `${item.label}: ${item.value}`;
    info.ratesEl.appendChild(row);
  });
}

async function drawFromPool(pool, count) {
  if (pool.apiType === 'food') {
    if (count === TEN_DRAW_COUNT) {
      const result = await requestJson('/api/gacha/food/draw10', { method: 'POST', body: JSON.stringify({ cost: DRAW_COST }) });
      return {
        items: (result?.items || result?.Items || []).map(normalizeFoodItem).filter(Boolean),
        guaranteeApplied: Boolean(result?.guaranteedEpicApplied ?? result?.GuaranteedEpicApplied),
      };
    }

    const result = await requestJson('/api/gacha/food/draw', { method: 'POST', body: JSON.stringify({ cost: DRAW_COST }) });
    const item = normalizeFoodItem(result?.item || result?.Item);
    return { items: item ? [item] : [], guaranteeApplied: false };
  }

  if (count === TEN_DRAW_COUNT) {
    const result = await requestJson('/api/gacha/skin/draw10', { method: 'POST', body: JSON.stringify({ cost: DRAW_COST, pool: pool.backendPool }) });
    return {
      items: (result?.drops || result?.Drops || []).map(normalizeSkinItem).filter(Boolean),
      guaranteeApplied: Boolean(result?.guaranteedSkinApplied ?? result?.GuaranteedSkinApplied),
    };
  }

  const result = await requestJson('/api/gacha/skin/draw', { method: 'POST', body: JSON.stringify({ cost: DRAW_COST, pool: pool.backendPool }) });
  const item = normalizeSkinItem(result?.drop || result?.Drop);
  return { items: item ? [item] : [], guaranteeApplied: false };
}

function normalizeFoodItem(item) {
  if (!item) return null;
  const rarity = formatRarity(item.rarity || item.Rarity || 'Common');
  const itemId = item.foodId || item.FoodId || item.itemId || item.ItemId || '';
  return {
    itemId,
    name: item.name || item.Name || itemId || 'Food',
    rarity,
    kind: 'Food',
    icon: FOOD_ICON_BY_ID[itemId] || fallbackIcon(rarity),
    rarityKey: getRarityKey(rarity),
  };
}

function normalizeSkinItem(item) {
  if (!item) return null;
  const dropType = String(item.dropType || item.DropType || 'skin').toLowerCase();
  const rarity = formatRarity(item.rarity || item.Rarity || 'Common');
  const itemId = item.itemId || item.ItemId || '';
  return {
    itemId,
    name: item.name || item.Name || itemId || 'Drop',
    rarity,
    kind: dropType === 'food' ? 'Food' : 'Skin',
    icon: dropType === 'food' ? (FOOD_ICON_BY_ID[itemId] || fallbackIcon(rarity)) : skinIcon(itemId),
    rarityKey: getRarityKey(rarity),
    isNew: Boolean(item.isNew ?? item.IsNew ?? false),
  };
}

async function handleDuplicateSkinCompensation(items) {
  const skins = (items || []).filter((item) => item?.kind === 'Skin' && item?.itemId);
  if (!skins.length) return 0;

  let converted = 0;
  for (const skin of skins) {
    try {
      const acquire = await requestJson('/api/collection/acquire', {
        method: 'POST',
        body: JSON.stringify({ itemId: skin.itemId }),
      });
      const message = String(acquire?.message || acquire?.Message || '').trim().toLowerCase();
      if (message === 'already owned' && skin.isNew === false) {
        await requestJson('/api/inventory/add', {
          method: 'POST',
          body: JSON.stringify({ itemId: 'adv_food', amount: 5 }),
        });
        converted += 1;
      }
    } catch (error) {
      console.warn('[Gacha] duplicate skin compensation failed:', error);
    }
  }
  return converted;
}

function skinIcon(itemId) {
  if (String(itemId).includes('snake')) return '🐍';
  if (String(itemId).includes('tetris')) return '🧩';
  return '🎴';
}

function fallbackIcon(rarity) {
  if (getRarityKey(rarity) === 'epic') return '⭐';
  if (getRarityKey(rarity) === 'rare') return '🍽️';
  return '🥣';
}

function getRarityKey(rarity) {
  const v = String(rarity || '').trim().toLowerCase();
  if (v === 'epic') return 'epic';
  if (v === 'rare') return 'rare';
  if (v === 'legendary') return 'legendary';
  return 'common';
}

function formatRarity(rarity) {
  const k = getRarityKey(rarity);
  if (k === 'epic') return 'Epic';
  if (k === 'rare') return 'Rare';
  if (k === 'legendary') return 'Legendary';
  return 'Common';
}

async function requestJson(path, init = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
    ...init,
  });

  let body = null;
  try { body = await res.json(); } catch {}

  if (!res.ok) {
    const err = new Error(body?.message || `${res.status} ${res.statusText}`);
    err.body = body;
    throw err;
  }
  return body;
}

function renderCards(gridEl, items, isTenDraw) {
  gridEl.classList.toggle('is-ten', isTenDraw);
  gridEl.classList.toggle('is-single', !isTenDraw);
  gridEl.innerHTML = '';

  items.forEach((item, idx) => {
    const card = document.createElement('article');
    card.className = 'gacha-flip-card';
    card.setAttribute('data-rarity', item.rarityKey);
    card.setAttribute('data-index', String(idx));
    card.innerHTML = `
      <div class="gacha-flip-inner">
        <div class="gacha-face gacha-face-back">?</div>
        <div class="gacha-face gacha-face-front">
          <div class="gacha-item-icon">${item.icon}</div>
          <div class="gacha-item-name">${item.name}</div>
          <div class="gacha-item-meta">${item.rarity} · ${item.kind}</div>
        </div>
      </div>
    `;
    gridEl.appendChild(card);
  });
}

function renderFaceDownCards(gridEl, count) {
  gridEl.innerHTML = '';
  const isTenDraw = count > 1;
  gridEl.classList.toggle('is-ten', isTenDraw);
  gridEl.classList.toggle('is-single', !isTenDraw);

  const total = isTenDraw ? TEN_DRAW_COUNT : 1;
  for (let i = 0; i < total; i += 1) {
    const card = document.createElement('article');
    card.className = 'gacha-flip-card is-dealt';
    card.setAttribute('data-rarity', 'common');
    card.setAttribute('data-index', String(i));
    card.innerHTML = `
      <div class="gacha-flip-inner">
        <div class="gacha-face gacha-face-back">?</div>
        <div class="gacha-face gacha-face-front">
          <div class="gacha-item-icon">🎁</div>
          <div class="gacha-item-name">Drawing...</div>
          <div class="gacha-item-meta">Waiting for result</div>
        </div>
      </div>
    `;
    gridEl.appendChild(card);
  }
}

function applyResultsToCards(gridEl, items) {
  const cards = Array.from(gridEl.querySelectorAll('.gacha-flip-card'));
  if (!cards.length || cards.length !== items.length) {
    renderCards(gridEl, items, items.length > 1);
    return;
  }

  cards.forEach((card, idx) => {
    const item = items[idx];
    if (!item) return;
    card.setAttribute('data-rarity', item.rarityKey);

    const iconEl = card.querySelector('.gacha-item-icon');
    const nameEl = card.querySelector('.gacha-item-name');
    const metaEl = card.querySelector('.gacha-item-meta');

    if (iconEl) iconEl.textContent = item.icon;
    if (nameEl) nameEl.textContent = item.name;
    if (metaEl) metaEl.textContent = `${item.rarity} · ${item.kind}`;
  });
}

async function revealCardsSequentially(gridEl, metaEl, items) {
  const cards = Array.from(gridEl.querySelectorAll('.gacha-flip-card'));
  for (let i = 0; i < cards.length; i += 1) {
    const card = cards[i];
    if (!card) continue;
    card.classList.add('is-dealt');
    if (skipRequested) {
      cards.forEach((c) => c.classList.add('is-dealt', 'is-flipped'));
      metaEl.textContent = 'Animation skipped. All cards revealed.';
      break;
    }
    await sleep(130);
    card.classList.add('is-flipped');
    metaEl.textContent = `Revealed ${i + 1}/${items.length}: ${items[i].name}`;
    await sleep(120);
  }
}

function formatRewardSummary(items) {
  const counts = items.reduce((acc, item) => {
    acc[item.name] = (acc[item.name] || 0) + 1;
    return acc;
  }, {});
  return Object.entries(counts).map(([n, c]) => `${n} x${c}`).join(', ');
}

function formatLastDraw(items) {
  if (items.length === 1) return `${items[0].name} · ${items[0].rarity} · ${items[0].kind}`;
  return formatRewardSummary(items);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function scheduleAutoFade(panelRoot) {
  cancelAutoFade(panelRoot);
  fadeStartTimer = setTimeout(() => panelRoot.classList.add('is-fading'), 2500);
  fadeEndTimer = setTimeout(() => {
    panelRoot.classList.add('is-hidden');
    panelRoot.classList.remove('is-fading');
  }, 3400);
}

function cancelAutoFade(panelRoot) {
  if (fadeStartTimer) clearTimeout(fadeStartTimer);
  if (fadeEndTimer) clearTimeout(fadeEndTimer);
  fadeStartTimer = null;
  fadeEndTimer = null;
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
  const prevBtn = root.querySelector('#gachaPoolPrevBtn');
  const nextBtn = root.querySelector('#gachaPoolNextBtn');
  const infoBtn = root.querySelector('#gachaPoolInfoBtn');
  if (singleBtn) singleBtn.disabled = !enabled;
  if (tenBtn) tenBtn.disabled = !enabled;
  if (prevBtn) prevBtn.disabled = !enabled;
  if (nextBtn) nextBtn.disabled = !enabled;
  if (infoBtn) infoBtn.disabled = !enabled;
}
