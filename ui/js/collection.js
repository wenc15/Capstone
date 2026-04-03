// 2026/03/23 edited by Zikai Lu
// Changes:
//  - Replace Timer card placeholder with real Collection preview.
//  - Add Collection overlay page connected to backend /api/collection.
//  - Display ownership state (Enabled/Owned/Locked) and support skin enable/disable toggling.

import { showToast } from './utils.js';
import { getCollectionItems, setCollectionSkinEnabled } from './collection_api.js';
import { openOverlayWithMotion, closeOverlayWithMotion, CLEANUP_MS } from './overlay_motion.js';

const COLLECTION_BOOT_CACHE_KEY = 'growin:collection.boot.v1';

const COLLECTION_ICONS = {
  skin_tetris_starlit: '🧱',
  skin_tetris_jelly: '🍮',
  skin_snake_nebula: '🐍',
  skin_dicebuild_petstand: '🎲',
};

const COLLECTION_NAME_OVERRIDES = {
  skin_tetris_jelly: 'Jelly Tetris Skin',
};

function iconForItem(itemId) {
  if (!itemId) return '🧩';
  if (COLLECTION_ICONS[itemId]) return COLLECTION_ICONS[itemId];
  if (itemId.startsWith('skin_tetris_')) return '🧱';
  if (itemId.startsWith('skin_snake_')) return '🐍';
  if (itemId.startsWith('skin_')) return '🎨';
  return '🧩';
}

function displayNameForItem(item) {
  const itemId = String(item?.itemId || '').trim();
  if (itemId && COLLECTION_NAME_OVERRIDES[itemId]) return COLLECTION_NAME_OVERRIDES[itemId];
  return item?.displayName || itemId || 'Unknown Item';
}

function buildOverlay() {
  const overlay = document.createElement('div');
  overlay.className = 'bag-overlay collection-overlay mg-hidden';
  overlay.setAttribute('aria-hidden', 'true');

  overlay.innerHTML = `
    <div class="bag-screen collection-screen" role="dialog" aria-modal="true" aria-label="Collection">
      <div class="bag-top">
        <div class="bag-title">Collection</div>
        <div class="bag-right">
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
  const enabled = owned && item.isEnabled;
  const stateText = enabled ? 'Enabled' : (owned ? 'Owned' : 'Locked');
  const stateClass = enabled ? 'is-enabled' : (owned ? 'is-owned' : 'is-unowned');
  const actionBtn = owned
    ? `<button class="bag-btn collection-toggle-btn" type="button" data-collection-action="toggle-enable" data-item-id="${item.itemId}" data-enable="${enabled ? '0' : '1'}">${enabled ? 'Disable' : 'Enable'}</button>`
    : '<button class="bag-btn collection-toggle-btn" type="button" disabled>Enable</button>';

  return `
    <div class="bag-row collection-row ${stateClass}" data-item-id="${item.itemId}">
      <div class="bag-ico" aria-hidden="true">${iconForItem(item.itemId)}</div>
      <div class="bag-mid">
        <div class="bag-name">${displayNameForItem(item)}</div>
        <div class="bag-id">${item.itemId}${item.game ? ` • ${item.game}` : ''}</div>
      </div>
      <div class="bag-count collection-state ${stateClass}">${stateText}</div>
      ${actionBtn}
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
      const stateClass = item.state <= 0 ? 'is-unowned' : (item.isEnabled ? 'is-enabled' : 'is-owned');
      return `<div class="collection-short-chip ${stateClass}" title="${displayNameForItem(item)}">${iconForItem(item.itemId)}</div>`;
    })
    .join('');

  previewEl.innerHTML = preview;
}

function saveCollectionBootCache({ metaText, previewHtml }) {
  try {
    localStorage.setItem(COLLECTION_BOOT_CACHE_KEY, JSON.stringify({
      metaText: String(metaText || ''),
      previewHtml: String(previewHtml || ''),
    }));
  } catch {
    // ignore localStorage failures
  }
}

function loadCollectionBootCache() {
  try {
    const raw = localStorage.getItem(COLLECTION_BOOT_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      metaText: typeof parsed?.metaText === 'string' ? parsed.metaText : '',
      previewHtml: typeof parsed?.previewHtml === 'string' ? parsed.previewHtml : '',
    };
  } catch {
    return null;
  }
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

  let isOpen = false;
  let inFlight = false;

  const boot = loadCollectionBootCache();
  if (boot) {
    if (boot.metaText) metaEl.textContent = boot.metaText;
    if (boot.previewHtml) previewEl.innerHTML = boot.previewHtml;
  }

  function open() {
    isOpen = true;
    openOverlayWithMotion(overlay, { openDurationMs: CLEANUP_MS });
    refresh();
  }

  function close() {
    isOpen = false;
    closeOverlayWithMotion(overlay, { closeDurationMs: CLEANUP_MS });
  }

  async function refresh() {
    if (inFlight) return;
    inFlight = true;

    try {
      const items = await getCollectionItems();
      renderCollectionPreview(items, previewEl, metaEl);
      saveCollectionBootCache({
        metaText: metaEl.textContent,
        previewHtml: previewEl.innerHTML,
      });

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
      inFlight = false;
    }
  }

  openBtn.addEventListener('click', open);
  closeBtn?.addEventListener('click', close);

  overlay.addEventListener('click', (e) => {
    const actionBtn = e.target?.closest?.('[data-collection-action="toggle-enable"]');
    if (actionBtn) {
      const itemId = String(actionBtn.getAttribute('data-item-id') || '').trim();
      const enable = String(actionBtn.getAttribute('data-enable') || '') === '1';
      if (!itemId) return;

      actionBtn.disabled = true;
      actionBtn.classList.add('is-loading');

      setCollectionSkinEnabled(itemId, enable)
        .then(async () => {
          showToast(els.toastEl, enable ? 'Skin enabled.' : 'Skin disabled.');
          window.dispatchEvent(new CustomEvent('collection:skin-changed', { detail: { itemId, enable } }));
          await refresh();
        })
        .catch((err) => {
          showToast(els.toastEl, err?.body?.message || err?.message || 'Failed to update skin state.');
          actionBtn.disabled = false;
          actionBtn.classList.remove('is-loading');
        });
      return;
    }

    if (e.target === overlay) close();
  });

  window.addEventListener('keydown', (e) => {
    if (!isOpen) return;
    if (e.key === 'Escape') close();
  });

  refresh();
}
