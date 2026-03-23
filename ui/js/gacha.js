import { refreshCredits, subscribeCredits } from './creditsStore.js';
import { showToast } from './utils.js';

const API_BASE = 'http://localhost:5024';
const DRAW_COST = 1;
const TEN_DRAW_COUNT = 10;

const FOOD_REWARDS = [
  { itemId: 'food_common_001', name: 'Apple', rarity: 'Common', icon: '🍎', rateText: '70% tier', blurb: 'A simple snack from the common reward band.', kind: 'Common food' },
  { itemId: 'food_common_002', name: 'Bread', rarity: 'Common', icon: '🍞', rateText: '70% tier', blurb: 'A steady pet-food pull from the common tier.', kind: 'Common food' },
  { itemId: 'food_common_003', name: 'Milk', rarity: 'Common', icon: '🥛', rateText: '70% tier', blurb: 'A light growth reward from the common tier.', kind: 'Common food' },
  { itemId: 'food_rare_001', name: 'Sushi', rarity: 'Rare', icon: '🍣', rateText: '25% tier', blurb: 'A stronger pet-food reward from the rare tier.', kind: 'Rare food' },
  { itemId: 'food_rare_002', name: 'Steak', rarity: 'Rare', icon: '🥩', rateText: '25% tier', blurb: 'A hearty rare-tier food reward.', kind: 'Rare food' },
];

const SKIN_POOLS = {
  tetris: {
    key: 'tetris',
    label: 'Tetris Pool',
    title: 'Starlit Stack',
    eyebrow: 'Tetris Skin Pool',
    heading: 'Pull food rewards and chase the Tetris epic skin.',
    description: 'This pool uses common and rare pet-food rewards for the lower tiers, with the Tetris skin locked to the highest rarity.',
    featured: { itemId: 'skin_tetris_starlit', name: 'Starlit Tetris Skin', rarity: 'Epic', icon: '🧩', kind: 'Tetris skin', rateText: '5% tier', blurb: 'The featured epic reward for the Tetris pool.' },
  },
  snake: {
    key: 'snake',
    label: 'Snake Pool',
    title: 'Nebula Trail',
    eyebrow: 'Snake Skin Pool',
    heading: 'Pull food rewards and chase the Snake epic skin.',
    description: 'This pool mirrors the food-style rarity flow too, but its top rarity is reserved for the Snake minigame skin.',
    featured: { itemId: 'skin_snake_nebula', name: 'Nebula Snake Skin', rarity: 'Epic', icon: '🐍', kind: 'Snake skin', rateText: '5% tier', blurb: 'The featured epic reward for the Snake pool.' },
  },
};

let mounted = false;
let isAnimating = false;
let skipRequested = false;
let fadeStartTimer = null;
let fadeEndTimer = null;
let activePoolKey = 'tetris';

export function mountGacha(els) {
  if (mounted) return;
  mounted = true;

  const { viewGacha, toastEl } = els || {};
  if (!viewGacha) return;

  const singleBtn = viewGacha.querySelector('#gachaSingleBtn');
  const tenBtn = viewGacha.querySelector('#gachaTenBtn');
  const stage = viewGacha.querySelector('.gacha-hero-art');
  const poolGrid = viewGacha.querySelector('#gachaPoolGrid');
  const lastDrawEl = viewGacha.querySelector('#gachaLastDraw .gacha-last-draw-value');
  const creditValueEl = viewGacha.querySelector('#gachaCreditValue');
  const singleCostEl = viewGacha.querySelector('#gachaSingleCost');
  const tenCostEl = viewGacha.querySelector('#gachaTenCost');
  const featuredNameEl = viewGacha.querySelector('#gachaFeaturedName');
  const featuredIconEl = viewGacha.querySelector('#gachaFeaturedIcon');
  const featuredMetaEl = viewGacha.querySelector('#gachaFeaturedMeta');
  const eyebrowEl = viewGacha.querySelector('#gachaEyebrow');
  const headingEl = viewGacha.querySelector('#gachaHeading');
  const descriptionEl = viewGacha.querySelector('#gachaDescription');
  const titleMainEl = viewGacha.querySelector('#gachaTitleMain');
  const titleSubEl = viewGacha.querySelector('#gachaTitleSub');
  const poolNoteEl = viewGacha.querySelector('#gachaPoolNote');
  const footnoteEl = viewGacha.querySelector('#gachaFootnote');
  const poolTabs = Array.from(viewGacha.querySelectorAll('[data-gacha-pool]'));

  if (!singleBtn || !tenBtn || !stage || !poolGrid || !lastDrawEl || !creditValueEl || !singleCostEl || !tenCostEl) return;

  singleCostEl.textContent = String(DRAW_COST);
  tenCostEl.textContent = String(DRAW_COST * TEN_DRAW_COUNT);
  applyPoolTheme({ eyebrowEl, headingEl, descriptionEl, titleMainEl, titleSubEl, poolNoteEl, footnoteEl, poolGrid, featuredNameEl, featuredIconEl, featuredMetaEl, poolTabs }, activePoolKey);

  const panel = buildResultPanel();
  stage.appendChild(panel.root);

  const updateCreditsUi = (credits) => {
    creditValueEl.textContent = String(typeof credits === 'number' ? credits : 0);
  };

  subscribeCredits(updateCreditsUi);

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
    panel.root.classList.remove('is-hidden');

    try {
      panel.metaEl.textContent = count === 1 ? 'Calling backend single-draw endpoint...' : 'Calling backend 10x draw endpoint...';
      const credits = await refreshCredits();
      const requiredCredits = DRAW_COST * count;
      if (credits < requiredCredits) {
        throw new Error(`Not enough credits. Need ${requiredCredits}, current ${credits}.`);
      }

      const { items, partialError, guaranteeApplied } = await drawSkins(count, activePoolKey);
      if (!items.length) {
        throw partialError || new Error('No draw result returned.');
      }

      renderCards(panel.gridEl, items, count > 1);
      updateFeaturedCard(items, { featuredNameEl, featuredIconEl, featuredMetaEl });
      lastDrawEl.textContent = formatLastDraw(items);

      panel.metaEl.textContent = count === 1 ? 'Single draw ready to reveal.' : `${items.length} results ready to reveal.`;
      await revealCardsInTwoPhases(panel.gridEl, panel.metaEl, items);

      await refreshCredits();
      const rewardText = formatRewardSummary(items);
      const guaranteeText = guaranteeApplied ? ' Epic guarantee triggered.' : '';
      panel.metaEl.textContent = partialError
        ? `Partial draw completed. ${rewardText}`
        : `Draw complete. ${rewardText}${guaranteeText}`;
      showToast(toastEl, partialError ? `Partial draw saved. ${rewardText}` : `${rewardText}${guaranteeText}`);
      scheduleAutoFade(panel.root);

      if (partialError) {
        console.warn('[Gacha] partial draw error:', partialError);
      }
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
      setGachaButtonsEnabled(els, true);
    }
  };

  singleBtn.addEventListener('click', () => runDraw(1));
  tenBtn.addEventListener('click', () => runDraw(TEN_DRAW_COUNT));
  panel.skipBtn.addEventListener('click', () => {
    skipRequested = true;
    panel.skipBtn.disabled = true;
  });
  panel.closeBtn.addEventListener('click', () => {
    skipRequested = true;
    cancelAutoFade(panel.root);
    panel.root.classList.add('is-hidden');
  });

  poolTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const nextPool = tab.dataset.gachaPool || 'tetris';
      activePoolKey = nextPool in SKIN_POOLS ? nextPool : 'tetris';
      applyPoolTheme({ eyebrowEl, headingEl, descriptionEl, titleMainEl, titleSubEl, poolNoteEl, footnoteEl, poolGrid, featuredNameEl, featuredIconEl, featuredMetaEl, poolTabs }, activePoolKey);
    });
  });
}

function applyPoolTheme(els, poolKey) {
  const pool = SKIN_POOLS[poolKey] || SKIN_POOLS.tetris;
  const previewItems = [...FOOD_REWARDS, pool.featured];

  if (els.eyebrowEl) els.eyebrowEl.textContent = pool.eyebrow;
  if (els.headingEl) els.headingEl.textContent = pool.heading;
  if (els.descriptionEl) els.descriptionEl.textContent = pool.description;
  if (els.titleMainEl) els.titleMainEl.textContent = pool.title;
  if (els.titleSubEl) els.titleSubEl.textContent = `Current backend ${pool.label.toLowerCase()} with food rewards in the lower tiers`;
  if (els.poolNoteEl) els.poolNoteEl.textContent = `${pool.label} uses common and rare pet food below, with ${pool.featured.name} as the only Epic reward.`;
  if (els.footnoteEl) els.footnoteEl.textContent = `Tier rates match the backend rules: Common 70%, Rare 25%, Epic 5%. In the ${pool.label}, the Epic slot is reserved for ${pool.featured.name}, and 10x draw guarantees at least one Epic skin when that pool exists.`;
  if (els.featuredNameEl) els.featuredNameEl.textContent = pool.featured.name;
  if (els.featuredIconEl) els.featuredIconEl.textContent = pool.featured.icon;
  if (els.featuredMetaEl) els.featuredMetaEl.textContent = `${pool.featured.rarity} skin, ${pool.featured.kind}`;
  if (els.poolTabs) {
    els.poolTabs.forEach((tab) => {
      tab.classList.toggle('is-active', tab.dataset.gachaPool === pool.key);
    });
  }

  renderPoolPreview(els.poolGrid, previewItems);
}

function renderPoolPreview(poolGrid, items) {
  poolGrid.innerHTML = items.map((item) => `
    <article class="gacha-pool-card" data-rarity="${getRarityKey(item.rarity)}">
      <div class="gacha-pool-card-top">
        <div class="gacha-pool-card-icon" aria-hidden="true">${item.icon}</div>
        <div class="gacha-pool-card-rate">${item.rateText}</div>
      </div>
      <div class="gacha-pool-card-name">${item.name}</div>
      <div class="gacha-pool-card-meta">${item.rarity} · ${item.kind} · ${item.blurb}</div>
    </article>
  `).join('');
}

function updateFeaturedCard(items, els) {
  if (!items?.length) return;
  const ranked = [...items].sort((a, b) => rankRarity(b.rarity) - rankRarity(a.rarity) || String(a.name).localeCompare(String(b.name)));
  const best = ranked[0];
  if (els.featuredNameEl) els.featuredNameEl.textContent = best.name;
  if (els.featuredIconEl) els.featuredIconEl.textContent = best.icon;
  if (els.featuredMetaEl) els.featuredMetaEl.textContent = `${best.rarity} ${best.dropType === 'food' ? 'food' : 'skin'}, ${best.kind || 'Collection item'}${best.isNew ? ' · New pull' : ''}`;
}

function rankRarity(rarity) {
  const value = getRarityKey(rarity);
  if (value === 'legendary') return 4;
  if (value === 'epic') return 3;
  if (value === 'rare') return 2;
  return 1;
}

function getRarityKey(rarity) {
  const value = String(rarity || '').trim().toLowerCase();
  if (value === 'epic' || value === '史诗') return 'epic';
  if (value === 'rare' || value === '稀有') return 'rare';
  if (value === 'legendary') return 'legendary';
  return 'common';
}

function formatRarityLabel(rarity) {
  const key = getRarityKey(rarity);
  if (key === 'epic') return 'Epic';
  if (key === 'rare') return 'Rare';
  if (key === 'legendary') return 'Legendary';
  return 'Common';
}

function buildResultPanel() {
  const root = document.createElement('section');
  root.className = 'gacha-reveal-panel is-hidden';
  root.innerHTML = `
    <div class="gacha-reveal-head">
      <div class="gacha-reveal-title">Draw Result</div>
      <div class="gacha-reveal-head-actions">
        <button type="button" class="gacha-skip-btn" aria-hidden="true">Skip</button>
        <button type="button" class="gacha-close-btn" aria-label="Close draw result">x</button>
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

async function drawSkins(count, poolKey) {
  if (count === TEN_DRAW_COUNT) {
    const result = await requestJson('/api/gacha/skin/draw10', {
      method: 'POST',
      body: JSON.stringify({ cost: DRAW_COST, pool: poolKey }),
    });

    const rawItems = result?.drops || result?.Drops || [];
    return {
      items: rawItems.map((item) => normalizeSkinItem(item)).filter(Boolean),
      partialError: null,
      guaranteeApplied: Boolean(result?.guaranteedSkinApplied ?? result?.GuaranteedSkinApplied),
    };
  }

  try {
    const result = await requestJson('/api/gacha/skin/draw', {
      method: 'POST',
      body: JSON.stringify({ cost: DRAW_COST, pool: poolKey }),
    });
    const normalized = normalizeSkinItem(result?.drop || result?.Drop);
    return {
      items: normalized ? [normalized] : [],
      partialError: null,
      guaranteeApplied: false,
    };
  } catch (error) {
    return {
      items: [],
      partialError: error,
      guaranteeApplied: false,
    };
  }
}

function normalizeSkinItem(item) {
  if (!item) return null;

  const itemId = item.itemId || item.ItemId || '';
  const meta = getSkinMeta(itemId, item);

  return {
    itemId,
    name: item.name || item.Name || meta.name,
    rarity: formatRarityLabel(item.rarity || item.Rarity || meta.rarity),
    rarityKey: getRarityKey(item.rarity || item.Rarity || meta.rarity),
    icon: meta.icon,
    kind: meta.kind,
    dropType: String(item.dropType || item.DropType || meta.dropType || 'skin').toLowerCase(),
    isNew: Boolean(item.isNew ?? item.IsNew),
  };
}

function getSkinMeta(itemId, fallback = {}) {
  const featuredItems = Object.values(SKIN_POOLS).map((pool) => pool.featured);
  return [...FOOD_REWARDS, ...featuredItems].find((item) => item.itemId === itemId) || {
    itemId,
    name: fallback.name || fallback.Name || itemId,
    rarity: formatRarityLabel(fallback.rarity || fallback.Rarity || 'Common'),
    kind: fallback.subType || fallback.SubType || 'Skin',
    icon: (fallback.dropType || fallback.DropType) === 'food' ? '🍽️' : '🎴',
    dropType: fallback.dropType || fallback.DropType || 'skin',
  };
}

async function requestJson(path, init = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers || {}),
    },
    ...init,
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

function renderCards(gridEl, items, isTenDraw) {
  gridEl.classList.toggle('is-ten', isTenDraw);
  gridEl.classList.toggle('is-single', !isTenDraw);
  gridEl.innerHTML = '';

  items.forEach((item, idx) => {
    const card = document.createElement('article');
    card.className = 'gacha-flip-card';
    card.setAttribute('data-rarity', item.rarityKey || getRarityKey(item.rarity));
    card.setAttribute('data-index', String(idx));
    card.innerHTML = `
      <div class="gacha-flip-inner">
        <div class="gacha-face gacha-face-back">?</div>
        <div class="gacha-face gacha-face-front">
          <div class="gacha-item-icon">${item.icon}</div>
          <div class="gacha-item-name">${item.name}</div>
          <div class="gacha-item-meta">${item.rarity} · ${item.kind || 'Skin'}</div>
          <div class="gacha-item-badge">${item.isNew ? 'New' : 'Owned'}</div>
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

function formatRewardSummary(items) {
  return items.map((item) => item.name).join(', ');
}

function formatLastDraw(items) {
  if (items.length === 1) {
    const item = items[0];
    return `${item.name} · ${item.rarity} · ${item.kind || 'Skin'}`;
  }

  const counts = items.reduce((acc, item) => {
    acc[item.name] = (acc[item.name] || 0) + 1;
    return acc;
  }, {});

  return Object.entries(counts).map(([name, amount]) => `${name} x${amount}`).join(', ');
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
