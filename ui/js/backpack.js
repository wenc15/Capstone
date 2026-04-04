// 2026/03/14 edited by JS
// Changes:
//  - Add Backpack overlay UI for viewing Inventory items.

// 2026/03/14 edited by JS
// Changes:
//  - Add Pets section (select active pet from backpack).
//  - Show adult thumb when pet is max level.
//  - Use "Select" wording instead of "Equip".

// ui/js/backpack.js

import { showToast } from './utils.js';
import { getPetsState, setActivePet } from './petsApi.js';
import { openOverlayWithMotion, closeOverlayWithMotion, CLEANUP_MS } from './overlay_motion.js';

const API_BASE = 'http://localhost:5024';

const PET_MAX_GROWTH_THRESHOLD = 1900;
const EXP_PER_LEVEL = 100;
const MAX_LEVEL = 20;

const KNOWN_PETS = [
  { id: 1, name: 'Sprig', thumb: 'assets/pet1-1.png', adultThumb: 'assets/pet1-3.png' },
  { id: 2, name: 'Nomo', thumb: 'assets/pet2-1.gif', adultThumb: 'assets/pet2_3.png' },
  { id: 3, name: 'Lyra', thumb: 'assets/pet3_1.png', adultThumb: 'assets/pet3-3.png' },
];

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

async function getPetGrowth(petId) {
  const data = await fetchJson(`/api/pets/${petId}/growth`);
  return Number(data?.growth ?? 0) || 0;
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
  overlay.className = 'bag-overlay mg-hidden';
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
        <div class="bag-note">Your pets and inventory items.</div>

        <div class="bag-subtitle" style="margin-top:6px;">Pets</div>
        <div class="bag-list" id="bagPetList"></div>
        <div class="bag-empty" id="bagPetEmpty" style="display:none;">No pets yet.</div>

        <div class="bag-subtitle" style="margin-top:14px;">Items</div>
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
  const petListEl = overlay.querySelector('#bagPetList');
  const petEmptyEl = overlay.querySelector('#bagPetEmpty');
  const closeBtn = overlay.querySelector('#bagCloseBtn');
  const refreshBtn = overlay.querySelector('#bagRefreshBtn');

  let isOpen = false;
  let inFlight = false;

  function open() {
    isOpen = true;
    openOverlayWithMotion(overlay, { openDurationMs: CLEANUP_MS });
    refresh();
  }

  function close() {
    isOpen = false;
    closeOverlayWithMotion(overlay, { closeDurationMs: CLEANUP_MS });
  }

  function formatPetRow(p, growth, isActive) {
    const safeGrowth = Math.max(0, Number(growth) || 0);
    const capped = Math.min(PET_MAX_GROWTH_THRESHOLD, safeGrowth);
    const level = Math.min(MAX_LEVEL, Math.floor(capped / EXP_PER_LEVEL) + 1);

    const isMax = safeGrowth >= PET_MAX_GROWTH_THRESHOLD;
    const thumb = isMax ? (p.adultThumb || p.thumb) : p.thumb;

    let label = isActive ? 'Active' : 'Select';
    let disabled = isActive;
    let hint = '';

    return `
      <div class="bag-row" data-pet-id="${p.id}">
        <div class="bag-ico" aria-hidden="true"><img src="${thumb}" alt="" style="width:28px;height:28px;border-radius:10px;object-fit:cover;" /></div>
        <div class="bag-mid">
          <div class="bag-name">${p.name} <span style="opacity:.75; font-size:12px;">Lv ${level}/${MAX_LEVEL}</span></div>
          <div class="bag-id">pet_${p.id}${hint ? ` • ${hint}` : ''}</div>
        </div>
        <button class="bag-btn" type="button" data-pet-action="equip" ${disabled ? 'disabled' : ''}>${label}</button>
      </div>
    `.trim();
  }

  async function refresh() {
    if (inFlight) return;
    inFlight = true;
    refreshBtn && (refreshBtn.disabled = true);

    try {
      const [items, petState] = await Promise.all([
        getInventory(),
        getPetsState().catch(() => null),
      ]);

      // Pets
      if (!petState) {
        if (petListEl) petListEl.innerHTML = '';
        if (petEmptyEl) petEmptyEl.style.display = 'block';
      } else {
        const activePetId = Number(petState?.activePetId) || 3;
        const owned = new Set(Array.isArray(petState?.unlockedPetIds) ? petState.unlockedPetIds.map(Number) : [3]);

        const pets = KNOWN_PETS.filter((p) => owned.has(p.id));
        const growthMap = {};
        await Promise.all(pets.map(async (p) => {
          try {
            growthMap[p.id] = await getPetGrowth(p.id);
          } catch {
            growthMap[p.id] = 0;
          }
        }));

        if (pets.length === 0) {
          if (petListEl) petListEl.innerHTML = '';
          if (petEmptyEl) petEmptyEl.style.display = 'block';
        } else {
          if (petEmptyEl) petEmptyEl.style.display = 'none';
          if (petListEl) {
            petListEl.innerHTML = pets.map((p) => formatPetRow(p, growthMap[p.id], activePetId === p.id)).join('');
          }
        }
      }

      // Items
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

  overlay.addEventListener('click', async (e) => {
    const btn = e.target?.closest?.('[data-pet-action]');
    if (!btn) return;

    const card = btn.closest?.('[data-pet-id]');
    const petId = Number(card?.getAttribute?.('data-pet-id'));
    if (!petId) return;

    const prev = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Selecting...';

    try {
      await setActivePet(petId);
      const meta = KNOWN_PETS.find((p) => p.id === petId);
      showToast(els.toastEl, `Selected ${meta?.name || `pet_${petId}`}.`);
    } catch (err) {
      const msg = err?.body?.message || err?.message || 'Failed to equip pet.';
      showToast(els.toastEl, msg);
    } finally {
      btn.textContent = prev;
      await refresh();
    }
  });

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
