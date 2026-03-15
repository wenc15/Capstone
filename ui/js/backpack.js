// 2026/03/14 edited by JS
// Changes:
//  - Add Backpack overlay UI for viewing Inventory items.

// ui/js/backpack.js

import { showToast } from './utils.js';

const API_BASE = 'http://localhost:5024';

const KNOWN_ITEMS = {
  basic_food: { name: 'Basic Food', icon: '🥣' },
  meat_snack: { name: 'Meat Snack', icon: '🍖' },
  adv_food: { name: 'Adv. Food', icon: '🐟' },
};

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

function formatItemRow(itemId, count) {
  const meta = KNOWN_ITEMS[itemId] || null;
  const label = meta?.name || itemId;
  const icon = meta?.icon || '📦';

  return `
    <div class="bag-row" data-item-id="${itemId}">
      <div class="bag-ico" aria-hidden="true">${icon}</div>
      <div class="bag-mid">
        <div class="bag-name">${label}</div>
        <div class="bag-id">${itemId}</div>
      </div>
      <div class="bag-count">x${count}</div>
    </div>
  `.trim();
}

function buildOverlay() {
  const overlay = document.createElement('div');
  overlay.className = 'bag-overlay';
  overlay.setAttribute('aria-hidden', 'true');

  overlay.innerHTML = `
    <div class="bag-screen" role="dialog" aria-modal="true" aria-label="Backpack">
      <div class="bag-top">
        <div class="bag-title">Backpack</div>
        <div class="bag-right">
          <button class="bag-refresh" id="bagRefreshBtn" type="button">Refresh</button>
          <button class="bag-close" id="bagCloseBtn" type="button" aria-label="Close">Close</button>
        </div>
      </div>

      <div class="bag-stage">
        <div class="bag-note">Your Inventory items (from Store / Gacha).</div>
        <div class="bag-list" id="bagList"></div>
        <div class="bag-empty" id="bagEmpty" style="display:none;">No items yet.</div>
      </div>
    </div>
  `.trim();

  return overlay;
}

export function mountBackpack(els) {
  if (!els?.backpackBtn) return;

  const host = document.getElementById('app') || document.body;
  const overlay = buildOverlay();
  host.appendChild(overlay);

  const listEl = overlay.querySelector('#bagList');
  const emptyEl = overlay.querySelector('#bagEmpty');
  const closeBtn = overlay.querySelector('#bagCloseBtn');
  const refreshBtn = overlay.querySelector('#bagRefreshBtn');

  let isOpen = false;
  let inFlight = false;

  function open() {
    isOpen = true;
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
    refresh();
  }

  function close() {
    isOpen = false;
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
  }

  async function refresh() {
    if (inFlight) return;
    inFlight = true;
    refreshBtn && (refreshBtn.disabled = true);

    try {
      const items = await getInventory();
      const rows = Object.entries(items)
        .filter(([, n]) => (Number(n) || 0) > 0)
        .sort(([a], [b]) => a.localeCompare(b));

      if (rows.length === 0) {
        if (listEl) listEl.innerHTML = '';
        if (emptyEl) emptyEl.style.display = 'block';
        return;
      }

      if (emptyEl) emptyEl.style.display = 'none';
      if (listEl) {
        listEl.innerHTML = rows.map(([id, n]) => formatItemRow(id, Number(n) || 0)).join('');
      }
    } catch (e) {
      console.warn('[Backpack] Failed to load inventory:', e);
      const msg = e?.body?.message || e?.message || 'Failed to load backpack.';
      showToast(els.toastEl, msg);
    } finally {
      refreshBtn && (refreshBtn.disabled = false);
      inFlight = false;
    }
  }

  els.backpackBtn.addEventListener('click', open);
  closeBtn?.addEventListener('click', close);
  refreshBtn?.addEventListener('click', refresh);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  window.addEventListener('keydown', (e) => {
    if (!isOpen) return;
    if (e.key === 'Escape') close();
  });
}
