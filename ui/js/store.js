// 2026/01/28 created by JS
// Changes:
//  - Add Store overlay UI for purchasing food with Credits.
//  - Integrate with backend Credits/Inventory APIs and refresh UI state.

// js/store.js

import { refreshCredits, subscribeCredits, consumeCredits as storeConsumeCredits } from './creditsStore.js';
import { showToast } from './utils.js';

const API_BASE = 'http://localhost:5024';

const PRODUCTS = [
  { id: 'basic_food', name: 'Basic Food', exp: 5, cost: 1, icon: '🥣' },
  { id: 'meat_snack', name: 'Meat Snack', exp: 15, cost: 5, icon: '🍖' },
  { id: 'adv_food', name: 'Adv. Food', exp: 30, cost: 10, icon: '🐟' },
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

  function openStore() {
    isOpen = true;
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
    refreshCredits().catch((e) => console.warn('[Store] Failed to refresh credits:', e));
    refreshInventory();
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
}
