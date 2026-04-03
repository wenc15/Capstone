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
  const { achvList, achvMeta, achvEmpty, achvError, toastEl } = els || {};
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
  // Sort by category, keep unlocked and in-progress mixed together.
  // Do NOT push unlocked achievements to the bottom.
  return [...list].sort((a, b) => {
    const ca = achievementCategoryRank(a.type);
    const cb = achievementCategoryRank(b.type);
    if (ca !== cb) return ca - cb;

    const ta = achievementTypeRank(a.type);
    const tb = achievementTypeRank(b.type);
    if (ta !== tb) return ta - tb;

    const targetA = Number(a?.target) || 0;
    const targetB = Number(b?.target) || 0;
    if (targetA !== targetB) return targetA - targetB;

    return String(a.title).localeCompare(String(b.title));
  });
}

function achievementCategoryRank(type) {
  const t = String(type || '').toLowerCase();

  // 1) Focus / session
  if (t.includes('session') || t.includes('focus') || t.includes('streak') || t.includes('failed')) return 1;
  // 2) Pet
  if (t.includes('pet')) return 2;
  // 3) Minigame
  if (t.includes('tetris') || t.includes('snake') || t.includes('dicebuild') || t.includes('minigame')) return 3;
  // 4) Gacha / food / credits
  if (t.includes('food') || t.includes('gacha') || t.includes('credit')) return 4;
  // 5) Misc
  return 9;
}

function achievementTypeRank(type) {
  const t = String(type || '').toLowerCase();

  // Focus progression order: sessions -> streak -> setbacks.
  if (t === 'successful_sessions' || t === 'total_sessions') return 1;
  if (t === 'focus_best_streak_days') return 2;
  if (t === 'failed_sessions') return 3;

  // Pet progression order.
  if (t === 'pet_interactions_total') return 1;
  if (t === 'pet_feeds_total') return 2;
  if (t === 'pet_level_max') return 3;
  if (t === 'pet_any_max_level') return 4;

  return 5;
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function renderAchievementList(els, list) {
  const { achvList } = els;
  achvList.innerHTML = '';
  const shouldKeepOpen = Date.now() <= keepOpenUntil;
  let lastCategoryKey = '';

  for (const a of list) {
    const categoryKey = achievementCategoryKey(a.type);
    if (categoryKey && categoryKey !== lastCategoryKey) {
      const divider = document.createElement('div');
      divider.className = 'achv-divider';
      divider.innerHTML = `
        <span class="achv-divider-line" aria-hidden="true"></span>
        <span class="achv-divider-label">${escapeHtml(achievementCategoryLabel(categoryKey))}</span>
        <span class="achv-divider-line" aria-hidden="true"></span>
      `.trim();
      achvList.appendChild(divider);
      lastCategoryKey = categoryKey;
    }

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

function achievementCategoryKey(type) {
  const t = String(type || '').toLowerCase();
  if (t.includes('session') || t.includes('focus') || t.includes('streak') || t.includes('failed')) return 'focus';
  if (t.includes('pet')) return 'pet';
  if (t.includes('tetris') || t.includes('snake') || t.includes('dicebuild') || t.includes('minigame')) return 'minigame';
  if (t.includes('food') || t.includes('gacha') || t.includes('credit') || t.includes('skin')) return 'collect';
  return 'other';
}

function achievementCategoryLabel(key) {
  if (key === 'focus') return 'Focus';
  if (key === 'pet') return 'Pet';
  if (key === 'minigame') return 'Minigame';
  if (key === 'collect') return 'Collection & Gacha';
  return 'Other';
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

  if (t === 'focus_best_streak_days') return svgBadge();
  if (t === 'focus_long_60plus_sessions') return svgHourglass();
  if (t === 'focus_night_sessions') return unicodeIcon('☾', 'is-moon');
  if (t === 'failed_sessions') return svgWarning();
  if (t === 'successful_sessions' || t === 'total_sessions') return svgSprout();

  if (t === 'pet_interactions_total') return unicodeIcon('🐾');
  if (t === 'pet_feeds_total') return svgBowl();
  if (t === 'pet_level_max' || t === 'pet_any_max_level') return svgSparkStar();

  if (t === 'dicebuild_wins') return svgTown();
  if (t === 'tetris_best_score') return svgBlocks();
  if (t === 'snake_best_score') return unicodeIcon('🐍', 'is-snake');

  if (t === 'skins_owned_total') return svgShirt();
  if (t === 'gacha_draws_total' || t.includes('food')) return svgGachaCards();
  if (t.includes('credits')) return svgCoin();
  return svgBadge();
}

function unicodeIcon(symbol, extraClass = '') {
  const cls = `achv-ico-unicode${extraClass ? ` ${extraClass}` : ''}`;
  return `<span class="${cls}" aria-hidden="true">${escapeHtml(String(symbol || '') + '\uFE0E')}</span>`;
}

function svgBase(pathD, extraClass = '') {
  const cls = `achv-ico-svg${extraClass ? ` ${extraClass}` : ''}`;
  return `
    <svg class="${cls}" width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="${pathD}" />
    </svg>
  `.trim();
}

function svgBaseTransformed(pathD, transform) {
  return `
    <svg class="achv-ico-svg" width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <g transform="${transform}">
        <path d="${pathD}" />
      </g>
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

function svgFlame() {
  return svgBase('M12.1 21.2c-3.8 0-6.8-2.8-6.8-6.5c0-2.9 1.7-5.2 4.1-6.9c.2 1.6 1.1 2.7 2.6 3.2c-.4-2.8.6-5.3 2.9-7.8c2.2 2.6 3.6 5.5 3.6 8.9c0 .4 0 .9-.1 1.3c.9-.8 1.5-1.8 1.8-3.1c1.3 1.3 2.1 3 2.1 5c0 3.4-2.9 5.9-7 5.9Zm0-2.2c2.3 0 4-1.7 4-3.9c0-1.4-.7-2.5-1.9-3.7c-.3 1.4-1.2 2.3-2.5 3c-.1-1.1-.6-2.1-1.6-3.1c-1.1 1.1-1.8 2.3-1.8 3.8c0 2.2 1.7 3.9 3.8 3.9Z');
}

function svgHourglass() {
  return svgBaseTransformed('M6.1 2.6h11.8a1.1 1.1 0 0 1 1.1 1.1v1.2c0 2-1.1 3.8-2.9 4.8l-1.4.8l1.4.8c1.8 1 2.9 2.8 2.9 4.8v1.2a1.1 1.1 0 0 1-1.1 1.1H6.1A1.1 1.1 0 0 1 5 17.3v-1.2c0-2 1.1-3.8 2.9-4.8l1.4-.8l-1.4-.8A5.5 5.5 0 0 1 5 4.9V3.7a1.1 1.1 0 0 1 1.1-1.1Zm1.1 2.2c0 1.3.7 2.5 1.9 3.1l2.5 1.3a.9.9 0 0 0 .8 0L15 7.9c1.2-.6 1.9-1.8 1.9-3.1V4.6H7.2v.2Zm9.7 11.4c0-1.3-.7-2.5-1.9-3.1l-2.5-1.3a.9.9 0 0 0-.8 0L9 13.1c-1.2.6-1.9 1.8-1.9 3.1v.2h9.8v-.2Z', 'translate(0,0.8)');
}

function svgMoon() {
  return `
    <svg class="achv-ico-svg" width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <g transform="rotate(-30 12 12)">
        <path fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" d="M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18Zm4.1 2.6a6.8 6.8 0 1 1 0 12.8a6.8 6.8 0 0 0 0-12.8Z"/>
      </g>
    </svg>
  `.trim();
}

function svgWarning() {
  return svgBase('M12 2.8c.5 0 .9.2 1.2.7l7.5 12.7a1.4 1.4 0 0 1-1.2 2.1H4.5a1.4 1.4 0 0 1-1.2-2.1L10.8 3.5c.3-.5.7-.7 1.2-.7Zm0 2.7a1 1 0 0 0-1 1v3.6a1 1 0 1 0 2 0V6.5a1 1 0 0 0-1-1Zm0 7a1.1 1.1 0 1 0 0 2.2a1.1 1.1 0 0 0 0-2.2Z');
}

function svgTarget() {
  return svgBase('M12 21a9 9 0 1 1 9-9a1 1 0 1 1-2 0a7 7 0 1 0-7 7a7 7 0 0 0 7-7a1 1 0 1 1 2 0a9 9 0 0 1-9 9Zm0-4.7a4.7 4.7 0 1 1 4.7-4.7a4.7 4.7 0 0 1-4.7 4.7Zm0-2.5a2.2 2.2 0 1 0 0-4.4a2.2 2.2 0 0 0 0 4.4Zm8.7-11.2l-5.8 2.3l1.8 1.8l-2.2 2.2l-1.8-1.8l-2.2 5.7l3.7-4.2l1.8 1.8l2.2-2.2l-1.8-1.8l4.3-3.8Z');
}

function svgPaw() {
  return `
    <svg class="achv-ico-svg" width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <g fill="currentColor">
        <circle cx="7" cy="8.4" r="1.9"/>
        <circle cx="10.2" cy="5.6" r="1.9"/>
        <circle cx="13.8" cy="5.6" r="1.9"/>
        <circle cx="17" cy="8.4" r="1.9"/>
        <path d="M12 20.4c-4.2 0-6.5-1.8-6.5-4.2c0-1.9 1.5-3.6 3.6-3.6c1.2 0 2 .5 2.9 1.1c.9-.6 1.7-1.1 2.9-1.1c2.1 0 3.6 1.7 3.6 3.6c0 2.4-2.3 4.2-6.5 4.2Z"/>
      </g>
    </svg>
  `.trim();
}

function svgSparkStar() {
  return svgBase('M12 2l1.8 3.6L18 6.2l-3 2.9l.7 4.1L12 11.3L8.3 13.2L9 9.1L6 6.2l4.2-.6L12 2Zm7.5 10.5l.8 1.6l1.7.3l-1.2 1.2l.3 1.7l-1.6-.8l-1.6.8l.3-1.7L17 14.4l1.7-.3l.8-1.6ZM4.5 13l.9 1.7l1.8.3L6 16.2l.3 1.8l-1.8-.9l-1.8.9l.3-1.8L1.8 15l1.8-.3L4.5 13Z', 'is-star');
}

function svgTown() {
  return svgBase('M3 20h18v-2h-1V9.6l-3-2V5h-3v1L12 4L4 9.6V18H3v2Zm3-2v-6h4v6H6Zm6 0v-8h4v8h-4Zm6 0v-7h1v7h-1Z');
}

function svgBlocks() {
  return svgBase('M4.2 4.2h6.4v4.4H4.2V4.2Zm8.2 0h7.4v4.4h-7.4V4.2ZM4.2 10.2h4.4v4.4H4.2v-4.4Zm6.2 0h4.4v4.4h-4.4v-4.4Zm6.2 0h3.2v4.4h-3.2v-4.4ZM4.2 16.2h6.4v3.6H4.2v-3.6Zm8.2 0h7.4v3.6h-7.4v-3.6Z');
}

function svgSnake() {
  return svgBase('M7 6.5c1.8-2.2 5.1-2.6 7.4-.8c1.7 1.3 2.4 3.6 1.9 5.6c1.8.1 3.3 1.6 3.3 3.5c0 2-1.6 3.6-3.6 3.6h-2.5a1 1 0 0 1 0-2h2.5a1.6 1.6 0 1 0 0-3.2h-2.7a1 1 0 0 1-.9-1.4c.7-1.4.4-3.1-.7-4c-1.4-1-3.3-.8-4.3.5c-1 1.3-1 3 .1 4.2l2.9 3a4.7 4.7 0 0 1 .1 6.5l-1 1a1 1 0 1 1-1.4-1.4l1-1a2.7 2.7 0 0 0 0-3.7l-2.9-3A5.8 5.8 0 0 1 7 6.5Zm10.5-.9a1.1 1.1 0 1 1 2.2 0a1.1 1.1 0 0 1-2.2 0Z');
}

function svgShirt() {
  return svgBase('M7.2 4.3L12 6.1l4.8-1.8l2.8 2.4l-1.9 2.7l-1.5-.9v8.8H7.8V8.5l-1.5.9L4.4 6.7l2.8-2.4Z', 'is-shirt');
}

function svgGachaCards() {
  return `
    <svg class="achv-ico-svg" width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <g fill="none" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3.5" y="8.6" width="8.1" height="10.4" rx="1.6" transform="rotate(-16 3.5 8.6)" fill="var(--achv-icon-bg)" stroke="currentColor" stroke-width="1.6"/>
        <rect x="7.8" y="5.1" width="8.3" height="12.1" rx="1.6" fill="var(--achv-icon-bg)" stroke="currentColor" stroke-width="1.6"/>
        <rect x="12.2" y="7.0" width="8.1" height="10.4" rx="1.6" transform="rotate(15 12.2 7)" fill="var(--achv-icon-bg)" stroke="currentColor" stroke-width="1.6"/>
      </g>
    </svg>
  `.trim();
}
