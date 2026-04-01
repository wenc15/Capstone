// 2026/03/31 edited by Zikai Lu
// Changes:
//  - Centralize localStorage key registration for consistent cleanup.
//  - Provide shared JSON read/write helpers with quota-safe behavior.
//  - Add scheduled saver utility to reduce high-frequency write pressure.

export const LOCAL_STORAGE_KEYS = Object.freeze({
  appSettings: 'growin:appBehaviorSettings',
  musicVolume: 'growin:music.volume.v1',
  musicMode: 'growin:music.mode.v1',
  musicAutoplayOnFocus: 'growin:music.autoplayOnFocus.v1',
  timerSelectedMins: 'growin.timer.selectedMins.v1',
  sessionSummary: 'growin.session.summary.v2',
  focusSessions: 'focusSessions',
  customAppCatalog: 'growin.custom_app_catalog.v1',
  whitelistSelection: 'growin.whitelist.selection.v1',
  weatherCache: 'growin.weather.cache.v1',
  weatherGeo: 'growin.weather.geo.v1',
  relaxEligibility: 'dicebuild.eligibility.v1',
  relaxSettings: 'dicebuild.settings.v1',
  dicebuildSave: 'dicebuild.save.v6',
  dicebuildHistory: 'dicebuild.history.v1',
  dicebuildBootReset: 'dicebuild.boot.reset.v1',
  snakeSave: 'snake.save.v1',
  snakeHistory: 'snake.history.v1',
  tetrisSave: 'tetris.save.v1',
  tetrisHistory: 'tetris.history.v1',
  achievementsSeenUnlocked: 'growin:achievements:seenUnlocked',
});

const CLEAR_PREFIXES = Object.freeze([
  'growin.',
  'growin:',
  'dicebuild.',
  'snake.',
  'tetris.',
]);

export function getKnownLocalStorageKeys() {
  return Object.values(LOCAL_STORAGE_KEYS);
}

export function clearKnownLocalStorage() {
  try {
    const explicit = new Set(getKnownLocalStorageKeys());
    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (explicit.has(key) || CLEAR_PREFIXES.some((prefix) => key.startsWith(prefix))) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    // ignore storage failures
  }
}

export function readJsonSafe(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function writeJsonSafe(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function createScheduledSaver({
  key,
  select,
  minDelayMs = 700,
}) {
  let timer = null;
  let lastPayload = null;

  function buildPayload(st) {
    if (typeof select === 'function') return select(st);
    return st;
  }

  function saveNow(st) {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (st !== undefined) {
      lastPayload = buildPayload(st);
    }
    if (lastPayload === null) return false;
    return writeJsonSafe(key, lastPayload);
  }

  function schedule(st) {
    lastPayload = buildPayload(st);
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      writeJsonSafe(key, lastPayload);
    }, Math.max(120, Number(minDelayMs) || 700));
  }

  function cancel() {
    if (!timer) return;
    clearTimeout(timer);
    timer = null;
  }

  return {
    schedule,
    saveNow,
    cancel,
  };
}
