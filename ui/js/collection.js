// 2026/03/23 edited by Zikai Lu
// Changes:
//  - Replace Timer card placeholder with real Collection preview.
//  - Add Collection overlay page connected to backend /api/collection.
//  - Display ownership state (Owned/Locked) instead of quantity.

import { showToast } from './utils.js';

const API_BASE = 'http://localhost:5024';

const COLLECTION_ICONS = {
  skin_tetris_starlit: '🧱',
  skin_snake_nebula: '🐍',
};

function iconForItem(itemId) {
  if (!itemId) return '🧩';
  if (COLLECTION_ICONS[itemId]) return COLLECTION_ICONS[itemId];
  if (itemId.startsWith('skin_tetris_')) return '🧱';
  if (itemId.startsWith('skin_snake_')) return '🐍';
  if (itemId.startsWith('skin_')) return '🎨';
  return '🧩';
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

async function getCollectionItems() {
  const data = await fetchJson('/api/collection');
  const list = Array.isArray(data?.items) ? data.items : [];

  return list
    .map((item) => ({
      itemId: String(item?.itemId || item?.ItemId || '').trim(),
      displayName: String(item?.displayName || item?.DisplayName || item?.itemId || item?.ItemId || 'Unknown Item'),
      state: Number(item?.state ?? item?.State ?? 0) > 0 ? 1 : 0,
    }))
    .filter((item) => item.itemId)
    .sort((a, b) => a.itemId.localeCompare(b.itemId));
}

function buildOverlay() {
  const overlay = document.createElement('div');
  overlay.className = 'bag-overlay collection-overlay';
  overlay.setAttribute('aria-hidden', 'true');

  overlay.innerHTML = `
    <div class="bag-screen collection-screen" role="dialog" aria-modal="true" aria-label="Collection">
      <div class="bag-top">
        <div class="bag-title">Collection</div>
        <div class="bag-right">
          <button class="bag-refresh" id="collectionRefreshBtn" type="button">Refresh</button>
          <button class="bag-close" id="collectionCloseBtn" type="button" aria-label="Close">Close</button>
        </div>
      </div>

      <div class="bag-stage">
        <div class="bag-note">Full collection list from backend. Locked items are shown with a gray filter.</div>
        <div class="bag-list" id="collectionList"></div>
        <div class="bag-empty" id="collectionEmpty" style="display:none;">No collection items available.</div>
      </div>
    </div>
  `.trim();

  return overlay;
}

function formatCollectionRow(item) {
  const owned = item.state > 0;
  const stateText = owned ? 'Owned' : 'Locked';
  const stateClass = owned ? 'is-owned' : 'is-unowned';

  return `
    <div class="bag-row collection-row ${stateClass}" data-item-id="${item.itemId}">
      <div class="bag-ico" aria-hidden="true">${iconForItem(item.itemId)}</div>
      <div class="bag-mid">
        <div class="bag-name">${item.displayName}</div>
        <div class="bag-id">${item.itemId}</div>
      </div>
      <div class="bag-count collection-state ${stateClass}">${stateText}</div>
    </div>
  `.trim();
}

function renderCollectionPreview(items, previewEl, metaEl) {
  if (!previewEl || !metaEl) return;

  const total = items.length;
  const owned = items.filter((item) => item.state > 0).length;
  metaEl.textContent = `Owned ${owned} / ${total}`;

  if (!total) {
    previewEl.innerHTML = '<div class="collection-short-empty">No collection data</div>';
    return;
  }

  const preview = items.slice(0, 8)
    .map((item) => {
      const ownedClass = item.state > 0 ? 'is-owned' : 'is-unowned';
      return `<div class="collection-short-chip ${ownedClass}" title="${item.displayName}">${iconForItem(item.itemId)}</div>`;
    })
    .join('');

  previewEl.innerHTML = preview;
}

export function mountCollection(els) {
  const openBtn = els?.openCollectionBtn;
  const previewEl = els?.collectionPreviewShort;
  const metaEl = els?.collectionOwnedMeta;
  if (!openBtn || !previewEl || !metaEl) return;

  const host = document.getElementById('app') || document.body;
  const overlay = buildOverlay();
  host.appendChild(overlay);

  const listEl = overlay.querySelector('#collectionList');
  const emptyEl = overlay.querySelector('#collectionEmpty');
  const closeBtn = overlay.querySelector('#collectionCloseBtn');
  const refreshBtn = overlay.querySelector('#collectionRefreshBtn');

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
    if (refreshBtn) refreshBtn.disabled = true;

    try {
      const items = await getCollectionItems();
      renderCollectionPreview(items, previewEl, metaEl);

      if (!items.length) {
        if (listEl) listEl.innerHTML = '';
        if (emptyEl) emptyEl.style.display = 'block';
        return;
      }

      if (emptyEl) emptyEl.style.display = 'none';
      if (listEl) listEl.innerHTML = items.map(formatCollectionRow).join('');
    } catch (e) {
      console.warn('[Collection] Failed to load collection:', e);
      if (emptyEl) emptyEl.style.display = 'none';
      showToast(els.toastEl, e?.body?.message || e?.message || 'Failed to load collection.');
    } finally {
      if (refreshBtn) refreshBtn.disabled = false;
      inFlight = false;
    }
  }

  openBtn.addEventListener('click', open);
  closeBtn?.addEventListener('click', close);
  refreshBtn?.addEventListener('click', refresh);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  window.addEventListener('keydown', (e) => {
    if (!isOpen) return;
    if (e.key === 'Escape') close();
  });

  refresh();
}
