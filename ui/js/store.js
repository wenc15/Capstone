// 2026/01/28 created by JS
// Changes:
//  - Add Store overlay UI for purchasing food with Credits.
//  - Integrate with backend Credits/Inventory APIs and refresh UI state.
//
// 2026/03/14 edited by JS
// Changes:
//  - Add Pets section to Store (purchase only).
//  - Gate purchase by current active pet max and "only one unmax pet" rule.
//  - Allow re-buying owned pets (resets growth to egg).

// 2026/03/14 edited by JS
// Changes:
//  - Support bulk food purchase with quantity selector and total cost.

// js/store.js

import { refreshCredits, subscribeCredits, consumeCredits as storeConsumeCredits } from './creditsStore.js';
import { showToast } from './utils.js';
import { getPetsState, unlockPet } from './petsApi.js';
import { openOverlayWithMotion, closeOverlayWithMotion, CLEANUP_MS } from './overlay_motion.js';

const API_BASE = 'http://localhost:5024';

const PRODUCTS = [
  { id: 'basic_food', name: 'Basic Food', exp: 5, cost: 1, icon: '🥣' },
  { id: 'meat_snack', name: 'Meat Snack', exp: 15, cost: 5, icon: '🍖' },
  { id: 'adv_food', name: 'Adv. Food', exp: 45, cost: 15, icon: '🐟' },
];

const FOOD_MAX_BUY_QTY = 99;

const PET_MAX_GROWTH_THRESHOLD = 1900;
const PETS = [
  { id: 1, name: 'Sprig', thumb: 'assets/pet1-1.png' },
  { id: 2, name: 'Nomo', thumb: 'assets/pet2-1.gif' },
  { id: 3, name: 'Lyra', thumb: 'assets/pet3_1.png' },
];

async function fetchJson(path, init) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });

  let body = null;
  try {
    body = await res.json();
  } catch {
    // ignore
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

async function getInventory() {
  const data = await fetchJson('/api/inventory');
  return data?.items || {};
}

async function getPetGrowth(petId) {
  const data = await fetchJson(`/api/pets/${petId}/growth`);
  return Number(data?.growth ?? 0) || 0;
}

async function addInventoryItem(itemId, amount) {
  return fetchJson('/api/inventory/add', {
    method: 'POST',
    body: JSON.stringify({ itemId, amount }),
  });
}


function buildOverlay() {
  const overlay = document.createElement('div');
  overlay.className = 'store-overlay mg-hidden';
  overlay.setAttribute('aria-hidden', 'true');

  overlay.innerHTML = `
    <div class="store-screen" role="dialog" aria-modal="true" aria-label="Pet Food Store">
      <div class="store-top">
        <div class="store-title">Pet Food Store</div>
        <div class="store-right">
          <div class="store-token"><span class="store-token-label">Tokens:</span> <span id="storeTokenValue">0</span></div>
          <button class="store-close" id="storeCloseBtn" type="button" aria-label="Close">Close</button>
        </div>
      </div>

       <div class="store-stage">
         <div class="store-section-title">Food</div>
          <div class="store-grid">
            ${PRODUCTS.map((p) => {
              return `
                <div class="store-card" data-item-id="${p.id}" data-unit-cost="${p.cost}">
                 <div class="store-card-head">
                   <div class="store-card-name">${p.name}</div>
                 </div>
                 <div class="store-card-icon" aria-hidden="true">${p.icon}</div>
                 <div class="store-card-exp">+${p.exp} EXP</div>
                 <div class="store-card-owned">Owned: <span class="store-owned" data-owned-for="${p.id}">0</span></div>

                 <div class="store-qty" aria-label="Quantity">
                   <button class="store-qty-btn" type="button" data-qty-delta="-1" data-qty-for="${p.id}" aria-label="Decrease">-</button>
                   <input class="store-qty-input" type="number" min="1" max="${FOOD_MAX_BUY_QTY}" value="1" inputmode="numeric" data-qty-input-for="${p.id}" aria-label="Quantity" />
                   <button class="store-qty-btn" type="button" data-qty-delta="1" data-qty-for="${p.id}" aria-label="Increase">+</button>
                 </div>

                 <button class="store-buy" data-buy-for="${p.id}" type="button">
                   <span class="store-buy-label">Buy</span>
                   <span class="store-buy-cost" data-buy-total-for="${p.id}">${p.cost}</span>
                 </button>
               </div>
             `;
            }).join('')}
          </div>

         <div class="store-section-title" style="margin-top:14px;">Pets</div>
         <div class="store-pet-grid" id="storePetsGrid"></div>
       </div>
     </div>
   `.trim();

  return overlay;
}

export function mountStore(els) {
  if (!els?.storeBtn) return;

  const host = document.getElementById('app') || document.body;
  const overlay = buildOverlay();
  host.appendChild(overlay);

  const tokenEl = overlay.querySelector('#storeTokenValue');
  const closeBtn = overlay.querySelector('#storeCloseBtn');
  const ownedEls = overlay.querySelectorAll('[data-owned-for]');
  const petsGrid = overlay.querySelector('#storePetsGrid');

  let isOpen = false;
  let inventory = {};
  let creditsSnapshot = 0;

  function clampQty(v) {
    const n = Math.floor(Number(v));
    if (!Number.isFinite(n)) return 1;
    return Math.max(1, Math.min(FOOD_MAX_BUY_QTY, n));
  }

  function getQty(itemId) {
    const input = overlay.querySelector(`[data-qty-input-for="${itemId}"]`);
    return clampQty(input?.value);
  }

  function setQty(itemId, nextQty) {
    const input = overlay.querySelector(`[data-qty-input-for="${itemId}"]`);
    if (!input) return;
    input.value = String(clampQty(nextQty));
    updateFoodTotal(itemId);
  }

  function updateFoodTotal(itemId) {
    const card = overlay.querySelector(`[data-item-id="${itemId}"]`);
    const totalEl = overlay.querySelector(`[data-buy-total-for="${itemId}"]`);
    if (!card || !totalEl) return;
    const unit = Number(card.getAttribute('data-unit-cost')) || 0;
    const qty = getQty(itemId);
    totalEl.textContent = String(Math.max(0, unit * qty));
  }

  function setOwnedCounts(items) {
    inventory = items || {};
    ownedEls.forEach((el) => {
      const id = el.getAttribute('data-owned-for');
      el.textContent = String(inventory[id] || 0);
    });
  }

  async function refreshInventory() {
    try {
      const items = await getInventory();
      setOwnedCounts(items);
    } catch (e) {
      console.warn('[Store] Failed to load inventory:', e);
    }
  }

  function renderPetsUI(state, growthMap) {
    if (!petsGrid) return;

    const activePetId = Number(state?.activePetId) || 3;
    const unlocked = new Set(Array.isArray(state?.unlockedPetIds) ? state.unlockedPetIds.map(Number) : [3]);
    const activeGrowth = Math.max(0, Number(growthMap?.[activePetId] ?? 0) || 0);
    const activeIsMax = activeGrowth >= PET_MAX_GROWTH_THRESHOLD;
    const hasUnmaxOtherOwned = Array.from(unlocked).some((id) => {
      const pid = Number(id);
      if (pid === activePetId) return false;
      const g = Math.max(0, Number(growthMap?.[pid] ?? 0) || 0);
      return g < PET_MAX_GROWTH_THRESHOLD;
    });

    petsGrid.innerHTML = PETS.map((p) => {
      const isUnlocked = unlocked.has(p.id);
      const isActive = activePetId === p.id;
      const canBuy = activeIsMax && !hasUnmaxOtherOwned;

      let label = canBuy ? 'Buy 0' : (hasUnmaxOtherOwned ? 'One at a time' : 'Need Lv 20');
      let action = 'buy';
      let disabled = !canBuy;
      let hint = '';

      if (!canBuy) {
        hint = hasUnmaxOtherOwned ? 'You already own a pet to raise.' : 'Requires current pet Lv 20.';
      } else {
        hint = isUnlocked ? 'Rebuy resets growth' : 'Buy new pet';
      }

      const status = isActive ? 'On stage' : (isUnlocked ? 'Owned' : 'Not owned');

      return `
        <div class="store-pet-card" data-pet-id="${p.id}" data-pet-owned="${isUnlocked ? '1' : '0'}">
          <img class="store-pet-thumb" src="${p.thumb}" alt="${p.name}" loading="lazy" />
          <div class="store-pet-meta">
            <div class="store-pet-name">${p.name}</div>
            <div class="store-pet-hint">${hint || status}</div>
          </div>
          <button class="store-pet-action" type="button" data-pet-action="${action}" ${disabled ? 'disabled' : ''}>
            ${label}
          </button>
        </div>
      `.trim();
    }).join('');
  }

   async function refreshPets() {
     try {
       const st = await getPetsState();
       const unlocked = Array.isArray(st?.unlockedPetIds) ? st.unlockedPetIds.map(Number) : [3];
       const ids = new Set([Number(st?.activePetId) || 3, ...unlocked]);

       const growthMap = {};
       await Promise.all(Array.from(ids).map(async (pid) => {
         try {
           growthMap[pid] = await getPetGrowth(pid);
         } catch {
           growthMap[pid] = 0;
         }
       }));

       renderPetsUI(st, growthMap);
     } catch (e) {
       console.warn('[Store] Failed to load pets:', e);
       renderPetsUI({ activePetId: 3, unlockedPetIds: [3] }, { 3: 0 });
     }
   }

  function openStore() {
    isOpen = true;
    openOverlayWithMotion(overlay, { openDurationMs: CLEANUP_MS });
    refreshCredits().catch((e) => console.warn('[Store] Failed to refresh credits:', e));
    refreshInventory();
    refreshPets();
  }

  function closeStore() {
    isOpen = false;
    closeOverlayWithMotion(overlay, { closeDurationMs: CLEANUP_MS });
  }

  els.storeBtn.addEventListener('click', openStore);
  closeBtn?.addEventListener('click', closeStore);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeStore();
  });

  window.addEventListener('keydown', (e) => {
    if (!isOpen) return;
    if (e.key === 'Escape') closeStore();
  });

  subscribeCredits((value) => {
    if (!tokenEl) return;
    creditsSnapshot = Number(value) || 0;
    tokenEl.textContent = String(value);
  });

  // Food quantity + purchase handlers (event delegation)
  overlay.addEventListener('click', async (e) => {
    const qtyBtn = e.target?.closest?.('[data-qty-for][data-qty-delta]');
    if (qtyBtn) {
      const itemId = qtyBtn.getAttribute('data-qty-for');
      const delta = Number(qtyBtn.getAttribute('data-qty-delta')) || 0;
      if (!itemId || !delta) return;
      setQty(itemId, getQty(itemId) + delta);
      return;
    }

    const buyBtn = e.target?.closest?.('[data-buy-for]');
    if (!buyBtn) return;

    const itemId = buyBtn.getAttribute('data-buy-for');
    const product = PRODUCTS.find((p) => p.id === itemId);
    if (!product) return;

    const qty = getQty(itemId);
    const totalCost = Math.max(0, product.cost * qty);

    if (totalCost <= 0) return;
    if (creditsSnapshot < totalCost) {
      showToast(els.toastEl, 'Not enough tokens.');
      return;
    }

    const prevHtml = buyBtn.innerHTML;
    buyBtn.disabled = true;
    buyBtn.innerHTML = 'Buying...';

    try {
      await storeConsumeCredits(totalCost);
      await addInventoryItem(product.id, qty);
      await refreshInventory();
      showToast(els.toastEl, `Purchased ${product.name} x${qty}.`);
    } catch (err) {
      const msg = err?.body?.message || err?.message || 'Purchase failed.';
      showToast(els.toastEl, msg);
      try {
        await refreshCredits();
      } catch {
        // ignore
      }
    } finally {
      buyBtn.disabled = false;
      buyBtn.innerHTML = prevHtml;
      updateFoodTotal(itemId);
    }
  });

  overlay.addEventListener('input', (e) => {
    const input = e.target?.closest?.('[data-qty-input-for]');
    if (!input) return;
    const itemId = input.getAttribute('data-qty-input-for');
    if (!itemId) return;
    input.value = String(clampQty(input.value));
    updateFoodTotal(itemId);
  });

  overlay.addEventListener('click', async (e) => {
    const btn = e.target?.closest?.('[data-pet-action]');
    if (!btn) return;

    const action = btn.getAttribute('data-pet-action');
    const card = btn.closest?.('[data-pet-id]');
    const petId = Number(card?.getAttribute?.('data-pet-id'));
    if (!petId || !action) return;

    const prev = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Buying...';

    try {
      const meta = PETS.find((p) => p.id === petId);
      const name = meta?.name || `Pet ${petId}`;
      if (action === 'buy') {
        const wasOwned = card?.getAttribute?.('data-pet-owned') === '1';
        await unlockPet(petId);
        showToast(els.toastEl, wasOwned ? `Bought ${name} again. Growth reset.` : `Bought ${name}. Added to backpack.`);
      }
    } catch (err) {
      const msg = err?.body?.message || err?.message || 'Pet action failed.';
      showToast(els.toastEl, msg);
    } finally {
      btn.textContent = prev;
      await refreshPets();
    }
  });
}
