// 2026/01/28 created by JS
// Changes:
//  - Add Store overlay UI for purchasing food with Credits.
//  - Integrate with backend Credits/Inventory APIs and refresh UI state.
//
// 2026/03/14 edited by JS
// Changes:
//  - Add Pets section to Store (buy 0 / equip).
//  - Enforce unlock chain 3 -> 2 -> 1 (prev pet max).

// js/store.js

import { refreshCredits, subscribeCredits, consumeCredits as storeConsumeCredits } from './creditsStore.js';
import { showToast } from './utils.js';
import { getPetsState, setActivePet, unlockPet } from './petsApi.js';

const API_BASE = 'http://localhost:5024';

const PRODUCTS = [
  { id: 'basic_food', name: 'Basic Food', exp: 5, cost: 1, icon: '🥣' },
  { id: 'meat_snack', name: 'Meat Snack', exp: 15, cost: 5, icon: '🍖' },
  { id: 'adv_food', name: 'Adv. Food', exp: 30, cost: 10, icon: '🐟' },
];

const PET_MAX_GROWTH_THRESHOLD = 1900;
const PET_ORDER = [3, 2, 1];
const PETS = [
  { id: 3, name: 'Pet 3', thumb: 'assets/pet3_1.png' },
  { id: 2, name: 'Pet 2', thumb: 'assets/pet2-1.gif' },
  { id: 1, name: 'Pet 1', thumb: 'assets/pet1-1.png' },
];

function getPrereqPetId(petId) {
  if (petId === 2) return 3;
  if (petId === 1) return 2;
  return null;
}

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
  overlay.className = 'store-overlay';
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
               <div class="store-card" data-item-id="${p.id}">
                <div class="store-card-head">
                  <div class="store-card-name">${p.name}</div>
                </div>
                <div class="store-card-icon" aria-hidden="true">${p.icon}</div>
                <div class="store-card-exp">+${p.exp} EXP</div>
                <div class="store-card-owned">Owned: <span class="store-owned" data-owned-for="${p.id}">0</span></div>
                <button class="store-buy" data-buy-for="${p.id}" type="button">
                  <span class="store-buy-label">Buy</span>
                  <span class="store-buy-cost">${p.cost}</span>
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
  const buyBtns = overlay.querySelectorAll('[data-buy-for]');
  const petsGrid = overlay.querySelector('#storePetsGrid');

  let isOpen = false;
  let inventory = {};

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

  function renderPetsUI(state, prereqGrowthMap) {
    if (!petsGrid) return;

    const activePetId = Number(state?.activePetId) || 3;
    const unlocked = new Set(Array.isArray(state?.unlockedPetIds) ? state.unlockedPetIds.map(Number) : [3]);

    petsGrid.innerHTML = PETS.map((p) => {
      const isUnlocked = unlocked.has(p.id);
      const isActive = activePetId === p.id;
      const prereq = getPrereqPetId(p.id);
      const prereqGrowth = prereq ? Number(prereqGrowthMap?.[prereq] ?? 0) : PET_MAX_GROWTH_THRESHOLD;
      const canBuy = !isUnlocked && (!prereq || prereqGrowth >= PET_MAX_GROWTH_THRESHOLD);

      let label = 'Equipped';
      let action = '';
      let disabled = true;
      let hint = '';

      if (isUnlocked && !isActive) {
        label = 'Equip';
        action = 'equip';
        disabled = false;
      } else if (!isUnlocked) {
        label = canBuy ? 'Buy 0' : 'Need prev max';
        action = canBuy ? 'buy' : '';
        disabled = !canBuy;
        hint = prereq ? `Requires Pet ${prereq} max` : '';
      }

      return `
        <div class="store-pet-card" data-pet-id="${p.id}">
          <img class="store-pet-thumb" src="${p.thumb}" alt="${p.name}" loading="lazy" />
          <div class="store-pet-meta">
            <div class="store-pet-name">${p.name}</div>
            <div class="store-pet-hint">${hint || (isActive ? 'Active' : (isUnlocked ? 'Unlocked' : 'Locked'))}</div>
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
      const prereqs = new Set();
      PETS.forEach((p) => {
        const pre = getPrereqPetId(p.id);
        if (pre) prereqs.add(pre);
      });

      const prereqGrowthMap = {};
      await Promise.all(Array.from(prereqs).map(async (pid) => {
        try {
          prereqGrowthMap[pid] = await getPetGrowth(pid);
        } catch {
          prereqGrowthMap[pid] = 0;
        }
      }));

      renderPetsUI(st, prereqGrowthMap);
    } catch (e) {
      console.warn('[Store] Failed to load pets:', e);
      renderPetsUI({ activePetId: 3, unlockedPetIds: [3] }, {});
    }
  }

  function openStore() {
    isOpen = true;
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
    refreshCredits().catch((e) => console.warn('[Store] Failed to refresh credits:', e));
    refreshInventory();
    refreshPets();
  }

  function closeStore() {
    isOpen = false;
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
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
    tokenEl.textContent = String(value);
  });

  buyBtns.forEach((btn) => {
    btn.addEventListener('click', async () => {
      const itemId = btn.getAttribute('data-buy-for');
      const product = PRODUCTS.find((p) => p.id === itemId);
      if (!product) return;

      const prevHtml = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = 'Buying...';

      try {
        await storeConsumeCredits(product.cost);
        await addInventoryItem(product.id, 1);
        await refreshInventory(); // credits 已在 store 里更新了
        showToast(els.toastEl, `Purchased ${product.name} (+${product.exp} EXP).`);
      } catch (e) {
        const msg = e?.body?.message || e?.message || 'Purchase failed.';
        showToast(els.toastEl, msg);
        try {
          await refreshCredits();
        } catch {
          // ignore
        }
      } finally {
        btn.disabled = false;
        btn.innerHTML = prevHtml;
      }
    });
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
    btn.textContent = action === 'buy' ? 'Buying...' : 'Equipping...';

    try {
      if (action === 'buy') {
        await unlockPet(petId);
        showToast(els.toastEl, `Unlocked Pet ${petId}.`);
      } else if (action === 'equip') {
        await setActivePet(petId);
        showToast(els.toastEl, `Equipped Pet ${petId}.`);
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
