// 2026/03/25 edited by Zhecheng Xu
// Changes:
//  - Refine achievement popup queue behavior and panel rendering stability.

// ui/js/achievements.js
// Purpose:
//  - Render Achievements view (minimal list: icon + title + desc + progress).
//  - Fetch from backend: GET /api/achievements.

const API_BASE = 'http://localhost:5024';
const SEEN_UNLOCKED_KEY = 'growin:achievements:seenUnlocked';
const ACHV_POPUP_HOST_ID = 'achvPopupHost';

let mounted = false;
let inFlight = null;
let latestEls = null;
const popupQueue = [];
const queuedPopupIds = new Set();
let activePopupId = '';
let popupActive = false;
let pollTimer = null;
let hasUnlockedBaseline = false;
const lastUnlockedState = new Map();
let keepOpenAchvId = '';
let keepOpenUntil = 0;
let lastListDigest = '';

const POPUP_STAY_MS = 5000;
const POPUP_EXIT_MS = 650;
const ACHV_POLL_MS = 1000;

export function mountAchievements(els) {
  if (mounted) return;
  mounted = true;
  latestEls = els || latestEls;

  const { achvRefreshBtn } = els || {};
  if (achvRefreshBtn) {
    achvRefreshBtn.addEventListener('click', () => {
      refreshAchievements(els, { force: true });
    });
  }

  // Keep achievements synced globally so newly unlocked popup can appear
  // even when user is not currently on the achievements page.
  refreshAchievements(els, { force: true }).catch(() => {});
  if (!pollTimer) {
    pollTimer = setInterval(() => {
      if (!latestEls) return;
      refreshAchievements(latestEls, { silent: true }).catch(() => {});
    }, ACHV_POLL_MS);
  }

  window.addEventListener('focus', () => {
    if (!latestEls) return;
    refreshAchievements(latestEls, { force: true, silent: true }).catch(() => {});
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    if (!latestEls) return;
    refreshAchievements(latestEls, { force: true, silent: true }).catch(() => {});
  });
}

export function onEnterAchievements(els) {
  latestEls = els || latestEls;
  mountAchievements(els);
  refreshAchievements(els);
}

async function refreshAchievements(els, { force = false, silent = false } = {}) {
  latestEls = els || latestEls;
  const { achvList, achvMeta, achvEmpty, achvError, toastEl, achvRefreshBtn } = els || {};
  if (!achvList || !achvMeta) return;

  if (inFlight && !force) return inFlight;

  if (!silent) {
    setVisible(achvError, false);
    setVisible(achvEmpty, false);
    const hasExistingRows = achvList.childElementCount > 0;
    achvMeta.textContent = hasExistingRows ? 'Refreshing...' : 'Loading...';
    if (!hasExistingRows) {
      renderSkeleton(achvList);
    }
    if (achvRefreshBtn) achvRefreshBtn.disabled = true;
  }

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
      const digest = buildListDigest(sorted);
      const changed = digest !== lastListDigest;
      lastListDigest = digest;

      const unlockedCount = sorted.filter(a => a.unlocked).length;
      if (!silent || changed) {
        achvMeta.textContent = `${unlockedCount}/${sorted.length} unlocked`;
      }

      if (!silent || changed) {
        renderAchievementList(els, sorted);
        setVisible(achvEmpty, sorted.length === 0);
      }

      toastNewUnlocks(toastEl, sorted);
    } catch (err) {
      if (!silent) {
        achvMeta.textContent = 'Offline';
        achvList.innerHTML = '';
        if (achvError) {
          achvError.textContent = `Failed to load achievements: ${err?.message || 'unknown error'}`;
          setVisible(achvError, true);
        }
      }
    } finally {
      if (!silent && achvRefreshBtn) achvRefreshBtn.disabled = false;
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
  const shouldKeepOpen = Date.now() <= keepOpenUntil;

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

    if (shouldKeepOpen && keepOpenAchvId && a.id === keepOpenAchvId) {
      row.classList.add('is-open');
      row.setAttribute('aria-expanded', 'true');
      detail.classList.add('is-open');
      detail.setAttribute('aria-hidden', 'false');
    }

    row.addEventListener('click', () => {
      const wasOpen = row.classList.contains('is-open');

      achvList.querySelectorAll('.achv-row.is-open').forEach((r) => {
        if (r === row) return;
        r.classList.remove('is-open');
        r.setAttribute('aria-expanded', 'false');
      });
      achvList.querySelectorAll('.achv-detail.is-open').forEach((d) => {
        const prevRow = d.previousElementSibling;
        if (prevRow === row) return;
        d.classList.remove('is-open');
        d.setAttribute('aria-hidden', 'true');
      });

      const isOpen = !wasOpen;
      row.classList.toggle('is-open', isOpen);
      row.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      detail.classList.toggle('is-open', isOpen);
      detail.setAttribute('aria-hidden', isOpen ? 'false' : 'true');

      if (isOpen) {
        keepOpenAchvId = a.id;
        keepOpenUntil = Date.now() + 8000;
      } else if (keepOpenAchvId === a.id) {
        keepOpenAchvId = '';
        keepOpenUntil = 0;
      }
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
  const progressPct = !a.unlocked && a.target > 0 ? `${barPct}%` : '';

  return `
    <div class="achv-detail-row">
      <div class="achv-detail-status">
        <span>${escapeHtml(status)}${escapeHtml(when)}</span>
        <span class="achv-detail-pct">${escapeHtml(progressPct)}</span>
      </div>
      <div class="achv-bar" aria-hidden="true"><div class="achv-bar-fill" style="width:${barPct}%"></div></div>
    </div>
  `.trim();
}

function buildListDigest(list) {
  return (list || []).map((a) => [a.id, a.unlocked ? 1 : 0, a.progress, a.target, a.unlockedAt || ''].join(':')).join('|');
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

function toastNewUnlocks(_toastEl, list) {
  const unlockedIds = list.filter(a => a.unlocked && a.id).map(a => a.id);
  const byId = new Map(list.map((a) => [a.id, a]));

  if (!hasUnlockedBaseline) {
    hasUnlockedBaseline = true;
    writeSeenUnlocked(new Set(unlockedIds));
    syncLastUnlockedState(list);
    return;
  }

  const seen = readSeenUnlocked();
  const directNew = unlockedIds.filter((id) => !seen.has(id));
  const transitioned = list
    .filter((a) => a.unlocked && lastUnlockedState.get(a.id) === false)
    .map((a) => a.id);

  const toShow = [...new Set([...directNew, ...transitioned])]
    .map((id) => byId.get(id))
    .filter(Boolean);

  toShow.forEach((a) => enqueueAchievementPopup(a));

  writeSeenUnlocked(new Set(unlockedIds));
  syncLastUnlockedState(list);
}

function syncLastUnlockedState(list) {
  lastUnlockedState.clear();
  for (const a of list || []) {
    if (!a?.id) continue;
    lastUnlockedState.set(a.id, !!a.unlocked);
  }
}

function ensurePopupHost() {
  let host = document.getElementById(ACHV_POPUP_HOST_ID);
  if (host) return host;
  host = document.createElement('div');
  host.id = ACHV_POPUP_HOST_ID;
  host.className = 'achv-popup-host';
  document.body.appendChild(host);
  return host;
}

function enqueueAchievementPopup(achv) {
  if (!achv) return;
  const id = String(achv.id || '');
  if (!id) return;
  if (queuedPopupIds.has(id) || activePopupId === id) return;
  queuedPopupIds.add(id);
  popupQueue.push(achv);
  if (popupActive) return;
  showNextAchievementPopup();
}

function showNextAchievementPopup() {
  if (popupActive) return;
  const next = popupQueue.shift();
  if (!next) return;
  queuedPopupIds.delete(String(next.id || ''));
  activePopupId = String(next.id || '');
  popupActive = true;
  showAchievementPopup(next, () => {
    activePopupId = '';
    popupActive = false;
    setTimeout(() => {
      showNextAchievementPopup();
    }, 60);
  });
}

function showAchievementPopup(achv, onDone) {
  if (!achv) return;
  const host = ensurePopupHost();
  const item = document.createElement('button');
  item.type = 'button';
  item.className = 'achv-popup';
  item.innerHTML = `
    <div class="achv-popup-icon">${iconSvgFor(achv.type)}</div>
    <div class="achv-popup-main">
      <div class="achv-popup-kicker">Achievement Unlocked</div>
      <div class="achv-popup-title">${escapeHtml(achv.title || achv.id || 'Achievement')}</div>
      <div class="achv-popup-desc">${escapeHtml(achv.desc || '')}</div>
    </div>
  `.trim();
  host.appendChild(item);

  let closed = false;

  const closePopup = () => {
    if (closed) return;
    closed = true;
    item.classList.remove('is-on');
    item.classList.add('is-off');
    setTimeout(() => {
      item.remove();
      try { onDone?.(); } catch {}
    }, POPUP_EXIT_MS);
  };

  item.addEventListener('click', () => {
    if (achv?.id) {
      openAchievementFromPopup(achv.id);
    }
    closePopup();
  });

  // Force initial off-screen style to be committed before entering,
  // otherwise some browsers may skip the enter transition and flash.
  void item.offsetWidth;
  setTimeout(() => {
    if (!closed) item.classList.add('is-on');
  }, 24);

  setTimeout(() => {
    closePopup();
  }, POPUP_STAY_MS);
}

function openAchievementFromPopup(achvId) {
  const els = latestEls;
  keepOpenAchvId = String(achvId || '');
  keepOpenUntil = Date.now() + 10000;
  const navBtn = els?.navAchievements || document.getElementById('nav-achievements');
  if (navBtn) navBtn.click();
  if (els) {
    refreshAchievements(els, { force: true }).catch(() => {});
  }

  let retry = 0;
  const maxRetry = 16;
  const timer = setInterval(() => {
    retry += 1;
    const list = els?.achvList || document.getElementById('achvList');
    const escapedId = cssEscape(String(achvId));
    const row = list?.querySelector(`[data-achv-id="${escapedId}"]`);
    if (row) {
      clearInterval(timer);
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (!row.classList.contains('is-open')) {
        row.classList.add('is-open');
        row.setAttribute('aria-expanded', 'true');
        const detail = row.nextElementSibling;
        if (detail?.classList?.contains('achv-detail')) {
          detail.classList.add('is-open');
          detail.setAttribute('aria-hidden', 'false');
        }
      }
      row.classList.add('is-highlight');
      setTimeout(() => row.classList.remove('is-highlight'), 1600);
      return;
    }
    if (retry >= maxRetry) {
      clearInterval(timer);
    }
  }, 120);
}

function cssEscape(value) {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }
  return String(value).replace(/"/g, '\\"');
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
