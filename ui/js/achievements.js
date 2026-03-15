// ui/js/achievements.js
// Purpose:
//  - Render Achievements view (minimal list: icon + title + desc + progress).
//  - Fetch from backend: GET /api/achievements.

import { showToast } from './utils.js';

const API_BASE = 'http://localhost:5024';
const SEEN_UNLOCKED_KEY = 'growin:achievements:seenUnlocked';

let mounted = false;
let inFlight = null;

export function mountAchievements(els) {
  if (mounted) return;
  mounted = true;

  const { achvRefreshBtn } = els || {};
  if (achvRefreshBtn) {
    achvRefreshBtn.addEventListener('click', () => {
      refreshAchievements(els, { force: true });
    });
  }
}

export function onEnterAchievements(els) {
  mountAchievements(els);
  refreshAchievements(els);
}

async function refreshAchievements(els, { force = false } = {}) {
  const { achvList, achvMeta, achvEmpty, achvError, toastEl, achvRefreshBtn } = els || {};
  if (!achvList || !achvMeta) return;

  if (inFlight && !force) return inFlight;

  setVisible(achvError, false);
  setVisible(achvEmpty, false);
  achvMeta.textContent = 'Loading...';
  renderSkeleton(achvList);
  if (achvRefreshBtn) achvRefreshBtn.disabled = true;

  inFlight = (async () => {
    try {
      const res = await fetch(`${API_BASE}/api/achievements`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });

      let data = null;
      try { data = await res.json(); } catch { data = null; }

      if (!res.ok) {
        const msg = data?.message || `${res.status} ${res.statusText}`;
        throw new Error(msg);
      }

      const list = Array.isArray(data?.achievements) ? data.achievements : [];
      const normalized = list.map(normalizeAchievement);
      const sorted = sortAchievements(normalized);

      const unlockedCount = sorted.filter(a => a.unlocked).length;
      achvMeta.textContent = `${unlockedCount}/${sorted.length} unlocked`;

      renderAchievementList(els, sorted);
      setVisible(achvEmpty, sorted.length === 0);

      toastNewUnlocks(toastEl, sorted);
    } catch (err) {
      achvMeta.textContent = 'Offline';
      achvList.innerHTML = '';
      if (achvError) {
        achvError.textContent = `Failed to load achievements: ${err?.message || 'unknown error'}`;
        setVisible(achvError, true);
      }
    } finally {
      if (achvRefreshBtn) achvRefreshBtn.disabled = false;
      inFlight = null;
    }
  })();

  return inFlight;
}

function normalizeAchievement(a) {
  const progress = numberOrZero(a?.progress ?? a?.Progress);
  const target = numberOrZero(a?.target ?? a?.Target);
  const unlocked = Boolean(a?.unlocked ?? a?.Unlocked);
  const unlockedAt = a?.unlockedAt ?? a?.UnlockedAt ?? null;

  return {
    id: String(a?.id ?? a?.Id ?? ''),
    title: String(a?.title ?? a?.Title ?? ''),
    desc: String(a?.desc ?? a?.Desc ?? ''),
    type: String(a?.type ?? a?.Type ?? ''),
    target,
    progress,
    unlocked,
    unlockedAt,
  };
}

function numberOrZero(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function sortAchievements(list) {
  // In-progress first, most complete first; unlocked later, newest first.
  return [...list].sort((a, b) => {
    if (a.unlocked !== b.unlocked) return a.unlocked ? 1 : -1;
    if (!a.unlocked) {
      const ap = a.target > 0 ? clamp01(a.progress / a.target) : 0;
      const bp = b.target > 0 ? clamp01(b.progress / b.target) : 0;
      if (bp !== ap) return bp - ap;
      return String(a.title).localeCompare(String(b.title));
    }

    const at = Date.parse(a.unlockedAt || '') || 0;
    const bt = Date.parse(b.unlockedAt || '') || 0;
    if (bt !== at) return bt - at;
    return String(a.title).localeCompare(String(b.title));
  });
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function renderAchievementList(els, list) {
  const { achvList } = els;
  achvList.innerHTML = '';

  for (const a of list) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = `achv-row${a.unlocked ? ' is-unlocked' : ''}`;
    row.setAttribute('aria-expanded', 'false');
    row.dataset.achvId = a.id;

    const ico = document.createElement('div');
    ico.className = 'achv-ico';
    ico.innerHTML = iconSvgFor(a.type);

    const main = document.createElement('div');
    main.className = 'achv-main';
    const title = document.createElement('div');
    title.className = 'achv-name';
    title.textContent = a.title || a.id || 'Achievement';
    const desc = document.createElement('div');
    desc.className = 'achv-desc';
    desc.textContent = a.desc || '';
    main.appendChild(title);
    main.appendChild(desc);

    const side = document.createElement('div');
    side.className = 'achv-side';

    const prog = document.createElement('div');
    prog.className = `achv-progress${a.unlocked ? ' is-done' : ''}`;
    prog.textContent = a.target > 0 ? `${Math.min(a.progress, a.target)}/${a.target}` : `${a.progress}`;

    const chev = document.createElement('div');
    chev.className = 'achv-chevron';
    chev.textContent = '›';

    side.appendChild(prog);
    side.appendChild(chev);

    row.appendChild(ico);
    row.appendChild(main);
    row.appendChild(side);

    const detail = document.createElement('div');
    detail.className = 'achv-detail';
    detail.setAttribute('aria-hidden', 'true');
    detail.innerHTML = buildDetailHtml(a);

    row.addEventListener('click', () => {
      const isOpen = row.classList.toggle('is-open');
      row.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      detail.classList.toggle('is-open', isOpen);
      detail.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
    });

    achvList.appendChild(row);
    achvList.appendChild(detail);
  }
}

function buildDetailHtml(a) {
  const pct = a.target > 0 ? clamp01(a.progress / a.target) : 0;
  const barPct = Math.round(pct * 100);
  const status = a.unlocked ? 'Unlocked' : 'In progress';
  const when = a.unlocked && a.unlockedAt ? ` · ${formatWhen(a.unlockedAt)}` : '';

  return `
    <div class="achv-detail-row">
      <div class="achv-detail-status">${escapeHtml(status)}${escapeHtml(when)}</div>
      <div class="achv-bar" aria-hidden="true"><div class="achv-bar-fill" style="width:${barPct}%"></div></div>
    </div>
  `.trim();
}

function formatWhen(isoOrDateLike) {
  const t = Date.parse(isoOrDateLike);
  if (!Number.isFinite(t)) return '';
  try {
    return new Date(t).toLocaleString();
  } catch {
    return new Date(t).toString();
  }
}

function toastNewUnlocks(toastEl, list) {
  const unlockedIds = list.filter(a => a.unlocked && a.id).map(a => a.id);
  if (unlockedIds.length === 0) return;

  const seen = readSeenUnlocked();
  const newly = unlockedIds.filter(id => !seen.has(id));
  if (newly.length === 0) return;

  const first = list.find(a => a.id === newly[0]);
  if (first) {
    showToast(toastEl, `Unlocked: ${first.title || first.id}`);
  }

  const nextSeen = new Set([...seen, ...newly]);
  writeSeenUnlocked(nextSeen);
}

function readSeenUnlocked() {
  try {
    const raw = localStorage.getItem(SEEN_UNLOCKED_KEY);
    const arr = JSON.parse(raw || '[]');
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.map(String));
  } catch {
    return new Set();
  }
}

function writeSeenUnlocked(set) {
  try {
    localStorage.setItem(SEEN_UNLOCKED_KEY, JSON.stringify([...set]));
  } catch {
  }
}

function renderSkeleton(root) {
  root.innerHTML = '';
  for (let i = 0; i < 6; i++) {
    const sk = document.createElement('div');
    sk.className = 'achv-row achv-skel';
    sk.innerHTML = `
      <div class="achv-ico"></div>
      <div class="achv-main">
        <div class="achv-skel-line a"></div>
        <div class="achv-skel-line b"></div>
      </div>
      <div class="achv-side">
        <div class="achv-progress"></div>
        <div class="achv-chevron">›</div>
      </div>
    `.trim();
    root.appendChild(sk);
  }
}

function setVisible(el, on) {
  if (!el) return;
  el.style.display = on ? 'block' : 'none';
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function iconSvgFor(type) {
  const t = String(type || '').toLowerCase();

  if (t.includes('focus') && t.includes('minute')) return svgClock();
  if (t.includes('total_sessions') || t.includes('session')) return svgSprout();
  if (t.includes('food')) return svgBowl();
  if (t.includes('credits')) return svgCoin();
  return svgBadge();
}

function svgBase(pathD) {
  return `
    <svg class="achv-ico-svg" width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="${pathD}" />
    </svg>
  `.trim();
}

function svgClock() {
  return svgBase('M12 21a9 9 0 1 1 0-18a9 9 0 0 1 0 18Zm0-2a7 7 0 1 0 0-14a7 7 0 0 0 0 14Zm1-11a1 1 0 0 0-2 0v4.25c0 .32.15.62.4.81l2.75 2.1a1 1 0 0 0 1.2-1.6L13 11.75V8Z');
}

function svgSprout() {
  return svgBase('M12 21c-1.7 0-3-1.3-3-3v-2.2c-1.3.1-2.5-.3-3.5-1.1c-1.6-1.2-2.4-3.2-2.5-5.7a1 1 0 0 1 1-1c2.8 0 4.9.8 6.2 2.3c.3.3.5.6.7.9c.2-1.1.7-2.1 1.5-2.9C14.1 6.7 16.2 6 19 6a1 1 0 0 1 1 1c-.1 2.5-.9 4.5-2.5 5.7c-1 .8-2.2 1.2-3.5 1.1V18c0 1.7-1.3 3-3 3Zm-7-11c.2 1.5.8 2.6 1.7 3.3c.7.5 1.5.7 2.3.6c-.1-1.1-.5-1.9-1.2-2.7C7.1 10.4 6.2 10.1 5 10Zm14-2c-1.2.1-2.1.4-2.8 1.2c-.7.8-1.1 1.6-1.2 2.7c.8.1 1.6-.1 2.3-.6c.9-.7 1.5-1.8 1.7-3.3Z');
}

function svgBowl() {
  return svgBase('M4 11a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1c0 4.4-3.6 8-8 8s-8-3.6-8-8Zm2.1 1c.5 2.9 3 5 5.9 5s5.4-2.1 5.9-5H6.1ZM7 7a1 1 0 0 1 1-1h8a1 1 0 1 1 0 2H8a1 1 0 0 1-1-1Z');
}

function svgCoin() {
  return svgBase('M12 21c-4.4 0-8-2.7-8-6V9c0-3.3 3.6-6 8-6s8 2.7 8 6v6c0 3.3-3.6 6-8 6Zm0-16c-3.4 0-6 1.9-6 4s2.6 4 6 4s6-1.9 6-4s-2.6-4-6-4Zm0 14c3.4 0 6-1.9 6-4v-2.2c-1.4 1.4-3.6 2.2-6 2.2s-4.6-.8-6-2.2V15c0 2.1 2.6 4 6 4Z');
}

function svgBadge() {
  return svgBase('M12 2a6 6 0 0 0-3 11.2V22l3-1.6L15 22v-8.8A6 6 0 0 0 12 2Zm0 2a4 4 0 1 1 0 8a4 4 0 0 1 0-8Z');
}
