// 2026/03/25 edited by Zhecheng Xu
// Changes:
//  - Add dock player controls, queue behavior, and volume popover interactions.
//  - Sync focus-driven playback behavior and autoplay preference from Settings.

import { subscribeFocusStatus } from './focusStatusStore.js';

const MUSIC_VOLUME_LOCAL_KEY = 'growin:music.volume.v1';
const MUSIC_MODE_LOCAL_KEY = 'growin:music.mode.v1';
const MUSIC_AUTOPLAY_ON_FOCUS_LOCAL_KEY = 'growin:music.autoplayOnFocus.v1';
const PREV_DOUBLE_TAP_MS = 360;
const PROGRESS_MAX = 1000;

const PLAY_MODES = [
  { key: 'queue', icon: '↺', label: 'Queue' },
  { key: 'shuffle', icon: '⇄', label: 'Shuffle' },
  { key: 'single', icon: '1↺', label: 'Repeat One' },
];

function clamp01(v, fallback = 0) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

function loadSavedVolume01(defaultValue) {
  try {
    const raw = localStorage.getItem(MUSIC_VOLUME_LOCAL_KEY);
    if (raw == null) return clamp01(defaultValue, 0.35);
    return clamp01(raw, clamp01(defaultValue, 0.35));
  } catch {
    return clamp01(defaultValue, 0.35);
  }
}

function saveVolume01(v) {
  try {
    localStorage.setItem(MUSIC_VOLUME_LOCAL_KEY, String(clamp01(v, 0.35)));
  } catch {
    // ignore local storage failures
  }
}

function loadSavedMode() {
  try {
    const raw = String(localStorage.getItem(MUSIC_MODE_LOCAL_KEY) || '');
    if (PLAY_MODES.some((m) => m.key === raw)) return raw;
  } catch {
    // noop
  }
  return 'queue';
}

function saveMode(modeKey) {
  try {
    localStorage.setItem(MUSIC_MODE_LOCAL_KEY, modeKey);
  } catch {
    // noop
  }
}

function loadAutoPlayOnFocus() {
  try {
    const raw = localStorage.getItem(MUSIC_AUTOPLAY_ON_FOCUS_LOCAL_KEY);
    if (raw == null) return true;
    return raw !== '0' && raw !== 'false';
  } catch {
    return true;
  }
}

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function buildDefaultTracks() {
  return [
    new URL('../music/music1.mp3', import.meta.url).toString(),
    new URL('../music/music2.mp3', import.meta.url).toString(),
    new URL('../music/music3.mp3', import.meta.url).toString(),
    new URL('../music/music4.mp3', import.meta.url).toString(),
  ];
}

function fileNameFromUrl(src) {
  try {
    const u = new URL(src, window.location.href);
    return decodeURIComponent((u.pathname || '').split('/').pop() || '').trim();
  } catch {
    return '';
  }
}

function albumFromUrl(src) {
  try {
    const u = new URL(src, window.location.href);
    const parts = String(u.pathname || '').split('/').filter(Boolean);
    if (parts.length >= 2) {
      const parent = decodeURIComponent(parts[parts.length - 2] || '').trim();
      if (parent) return parent;
    }
  } catch {
    // noop
  }
  return '';
}

function trackTitleFromFile(file, index) {
  const noExt = String(file || '').replace(/\.[a-zA-Z0-9]+$/, '').trim();
  return noExt || `Track ${index + 1}`;
}

function escapeHtml(v) {
  return String(v)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatTime(sec) {
  const s = Number(sec);
  if (!Number.isFinite(s) || s < 0) return '0:00';
  const total = Math.floor(s);
  const m = Math.floor(total / 60);
  const r = total % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

function modeByKey(modeKey) {
  return PLAY_MODES.find((m) => m.key === modeKey) || PLAY_MODES[0];
}

function normalizeTrackInput(raw, index) {
  if (typeof raw === 'string') {
    return { src: raw };
  }
  if (!raw || typeof raw !== 'object') return null;
  const src = typeof raw.src === 'string' ? raw.src.trim() : '';
  if (!src) return null;
  const out = { src };
  if (typeof raw.title === 'string' && raw.title.trim()) out.title = raw.title.trim();
  if (typeof raw.album === 'string' && raw.album.trim()) out.album = raw.album.trim();
  if (typeof raw.artist === 'string' && raw.artist.trim()) out.artist = raw.artist.trim();
  if (typeof raw.file === 'string' && raw.file.trim()) out.file = raw.file.trim();
  if (!out.file) out.file = fileNameFromUrl(src) || `track-${index + 1}.mp3`;
  return out;
}

export function mountMusic(opts = {}) {
  const rawTracks = Array.isArray(opts.tracks) && opts.tracks.length
    ? opts.tracks.slice()
    : buildDefaultTracks();

  const normalizedTracks = rawTracks
    .map((raw, index) => normalizeTrackInput(raw, index))
    .filter(Boolean);

  const trackItems = normalizedTracks.map((it, index) => {
    const file = it.file || fileNameFromUrl(it.src) || `track-${index + 1}.mp3`;
    const parentAlbum = it.album || albumFromUrl(it.src);
    const baseTitle = trackTitleFromFile(file, index);
    const titleParts = baseTitle.split(' - ').map((s) => s.trim()).filter(Boolean);
    const title = it.title || (titleParts.length >= 2 ? titleParts[titleParts.length - 1] : baseTitle);
    const album = parentAlbum || (titleParts.length >= 2 ? titleParts[0] : 'Unknown album');
    return {
      src: it.src,
      file,
      title,
      album,
      artist: it.artist || '',
      duration: null,
      disabled: false,
      broken: false,
    };
  });

  const queueOrder = trackItems.map((_, i) => i);
  const els = opts.els || null;

  const volume = loadSavedVolume01(typeof opts.volume === 'number' ? opts.volume : 0.35);

  const audio = new Audio();
  audio.preload = 'auto';
  audio.loop = false;
  audio.volume = Math.max(0, Math.min(1, volume));

  let disposed = false;
  let isFocusRunning = false;
  let isManualPlaying = false;
  let needsUserGesture = false;
  let startGestureUntil = 0;
  let gestureUnlocked = false;
  let prevTapAt = 0;
  let pendingPlay = false;
  let isSeeking = false;
  let seekPreviewSec = 0;
  let lastShownDurationSec = 0;
  let pausedByUserWhileFocus = false;
  let autoPlayOnFocus = loadAutoPlayOnFocus();

  let currentIndex = trackItems.length ? queueOrder[0] : -1;
  let shuffleBag = [];
  let historyStack = [];
  let playMode = loadSavedMode();

  const modeBtn = els?.musicModeBtn || null;
  const prevBtn = els?.musicPrevBtn || null;
  const nextBtn = els?.musicNextBtn || null;
  const playPauseBtn = els?.musicPlayPauseBtn || null;
  const queueList = els?.musicQueueList || null;
  const dockTrack = els?.musicDockTrack || null;
  const dockMeta = els?.musicDockMeta || null;
  const volumeBtn = els?.musicVolumeBtn || null;
  const volumeSlider = els?.musicVolumeSlider || null;
  const volumeValueEl = els?.musicVolumeValue || null;
  const progressEl = els?.musicProgress || null;
  const currentTimeEl = els?.musicCurrentTime || null;
  const durationTimeEl = els?.musicDurationTime || null;
  let lastNonZeroVolume = audio.volume > 0 ? audio.volume : 0.35;

  function shouldPlay() {
    return (isFocusRunning && autoPlayOnFocus && !pausedByUserWhileFocus) || isManualPlaying;
  }

  function getPlayableIndices() {
    return queueOrder.filter((idx) => {
      const item = trackItems[idx];
      return item && !item.disabled && !item.broken;
    });
  }

  function ensurePlayablePool() {
    const playable = getPlayableIndices();
    if (playable.length) return playable;
    const hasDisabled = trackItems.some((it) => it.disabled && !it.broken);
    if (hasDisabled) {
      trackItems.forEach((it) => {
        if (!it.broken) it.disabled = false;
      });
      return getPlayableIndices();
    }
    return playable;
  }

  function ensureSrcByIndex(index) {
    if (index < 0 || index >= trackItems.length) return;
    currentIndex = index;
    const src = trackItems[index]?.src;
    if (!src) return;
    if (audio.src !== src) audio.src = src;
  }

  function queuePosOf(index) {
    return queueOrder.indexOf(index);
  }

  function refillShuffleBag() {
    const playable = ensurePlayablePool()
      .filter((idx) => idx !== currentIndex);
    shuffleBag = shuffleInPlace(playable.slice());
  }

  function getNextIndex() {
    if (!trackItems.length) return -1;
    const playable = ensurePlayablePool();
    if (!playable.length) return -1;

    if (playMode === 'single') return currentIndex >= 0 ? currentIndex : playable[0];

    if (playMode === 'shuffle') {
      if (!shuffleBag.length) refillShuffleBag();
      if (shuffleBag.length) return shuffleBag.shift();
      return currentIndex >= 0 ? currentIndex : playable[0];
    }

    const pos = queuePosOf(currentIndex);
    if (pos < 0) return playable[0];
    for (let step = 1; step <= queueOrder.length; step += 1) {
      const idx = queueOrder[(pos + step) % queueOrder.length];
      const item = trackItems[idx];
      if (item && !item.disabled && !item.broken) return idx;
    }
    return playable[0];
  }

  function getPrevByQueue() {
    const playable = ensurePlayablePool();
    if (!playable.length) return -1;
    const pos = queuePosOf(currentIndex);
    if (pos < 0) return playable[0];
    for (let step = 1; step <= queueOrder.length; step += 1) {
      const idx = queueOrder[(pos - step + queueOrder.length) % queueOrder.length];
      const item = trackItems[idx];
      if (item && !item.disabled && !item.broken) return idx;
    }
    return playable[0];
  }

  function getPreviousIndex() {
    while (historyStack.length) {
      const idx = historyStack.pop();
      const item = trackItems[idx];
      if (item && !item.disabled && !item.broken) return idx;
    }
    return getPrevByQueue();
  }

  function renderProgress({ force = false } = {}) {
    const audioDuration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
    const trackDuration = (currentIndex >= 0 && Number.isFinite(trackItems[currentIndex]?.duration) && trackItems[currentIndex].duration > 0)
      ? trackItems[currentIndex].duration
      : 0;
    const duration = audioDuration || trackDuration || 0;
    if (duration > 0) lastShownDurationSec = duration;
    const current = isSeeking ? seekPreviewSec : (Number.isFinite(audio.currentTime) ? audio.currentTime : 0);

    if (currentTimeEl) currentTimeEl.textContent = formatTime(current);
    if (durationTimeEl) durationTimeEl.textContent = formatTime(duration || lastShownDurationSec);

    if (!progressEl) return;
    progressEl.disabled = duration <= 0;
    const pct = duration > 0 ? Math.max(0, Math.min(100, (current / duration) * 100)) : 0;
    progressEl.style.setProperty('--music-progress-pct', `${pct}%`);
    if (!isSeeking || force) {
      const ratio = duration > 0 ? (current / duration) : 0;
      progressEl.value = String(Math.max(0, Math.min(PROGRESS_MAX, Math.round(ratio * PROGRESS_MAX))));
    }
  }

  function renderQueue() {
    if (!queueList) return;
    if (!trackItems.length) {
      queueList.innerHTML = '<div class="music-queue-empty">No songs loaded yet.</div>';
      return;
    }

    const html = queueOrder.map((idx, orderPos) => {
      const item = trackItems[idx];
      if (!item) return '';
      const active = idx === currentIndex;
      const disabled = item.disabled || item.broken;
      const stateText = item.broken
        ? 'Unavailable'
        : (item.disabled ? 'Disabled' : 'Ready');
      const durationText = item.duration != null ? formatTime(item.duration) : '--:--';
      const actionLabel = item.broken ? 'Unavailable' : (item.disabled ? 'Enable' : 'Disable');
      const recoverClass = item.disabled && !item.broken ? ' is-recover' : '';
      const actionDisabled = item.broken ? ' disabled' : '';
      const infoBits = [`#${orderPos + 1}`];
      if (item.artist) infoBits.push(escapeHtml(item.artist));
      infoBits.push(escapeHtml(item.file), durationText, stateText);

      return [
        `<div class="music-queue-item${active ? ' is-active' : ''}${disabled ? ' is-disabled' : ''}">`,
        `  <button class="music-queue-play" data-queue-action="play" data-track-index="${idx}" type="button"${disabled ? ' disabled' : ''}>`,
        `    <div class="music-queue-item-title">${escapeHtml(item.title)}</div>`,
        `    <div class="music-queue-item-meta">${infoBits.join(' • ')}</div>`,
        '  </button>',
        `  <button class="music-queue-disable${recoverClass}" data-queue-action="toggle-disable" data-track-index="${idx}" type="button"${actionDisabled}>${actionLabel}</button>`,
        '</div>',
      ].join('');
    }).join('');

    queueList.innerHTML = html;
  }

  function renderDock() {
    const mode = modeByKey(playMode);
    if (modeBtn) {
      modeBtn.textContent = mode.icon;
      modeBtn.title = `Playback mode: ${mode.label}`;
    }

    const activeTitle = (currentIndex >= 0 && trackItems[currentIndex]?.title)
      ? trackItems[currentIndex].title
      : 'No track selected';
    const activeAlbum = (currentIndex >= 0 && trackItems[currentIndex]?.album)
      ? trackItems[currentIndex].album
      : 'Unknown album';
    if (dockTrack) dockTrack.textContent = activeTitle;
    if (dockMeta) dockMeta.textContent = activeAlbum;

    if (playPauseBtn) {
      const isPlayingNow = shouldPlay() && (!!audio.src || currentIndex >= 0) && (!audio.paused || pendingPlay);
      playPauseBtn.textContent = isPlayingNow ? '⏸' : '▶';
      playPauseBtn.title = isPlayingNow ? 'Pause' : 'Play';
      playPauseBtn.classList.toggle('is-paused', isPlayingNow);
    }

    const effectiveVol = audio.muted ? 0 : audio.volume;
    const volPct = Math.round(Math.max(0, Math.min(1, effectiveVol)) * 100);
    if (volumeBtn) {
      volumeBtn.title = volPct <= 0 ? 'Unmute' : 'Mute';
      volumeBtn.setAttribute('aria-label', volPct <= 0 ? 'Unmute' : 'Mute');
      volumeBtn.classList.toggle('is-muted', volPct <= 0);
      volumeBtn.classList.toggle('is-low', volPct > 0 && volPct < 45);
    }
    if (volumeSlider) {
      volumeSlider.value = String(volPct);
      volumeSlider.style.setProperty('--music-volume-pct', `${volPct}%`);
    }
    if (volumeValueEl) volumeValueEl.textContent = `${volPct}%`;

    renderQueue();
    renderProgress();
  }

  function loadTrackDuration(index) {
    const item = trackItems[index];
    if (!item || item.duration != null) return;

    const probe = new Audio();
    probe.preload = 'metadata';

    const cleanup = () => {
      probe.onloadedmetadata = null;
      probe.onerror = null;
    };

    probe.onloadedmetadata = () => {
      item.duration = Number.isFinite(probe.duration) ? probe.duration : null;
      cleanup();
      renderQueue();
      if (index === currentIndex) renderProgress({ force: true });
    };

    probe.onerror = () => {
      cleanup();
    };

    probe.src = item.src;
  }

  async function playNow() {
    if (disposed) return;
    if (!trackItems.length) return;

    const playable = ensurePlayablePool();
    if (!playable.length) return;
    if (currentIndex < 0 || !trackItems[currentIndex] || trackItems[currentIndex].disabled || trackItems[currentIndex].broken) {
      currentIndex = playable[0];
    }

    ensureSrcByIndex(currentIndex);
    pendingPlay = true;
    renderDock();
    try {
      await audio.play();
      needsUserGesture = false;
    } catch (e) {
      pendingPlay = false;
      needsUserGesture = true;
      console.warn('[Music] play blocked:', e);
    } finally {
      if (audio.paused) pendingPlay = false;
      renderDock();
    }
  }

  async function tryGestureUnlock() {
    if (gestureUnlocked || disposed || !trackItems.length) return;
    const prevMuted = !!audio.muted;
    const prevTime = audio.currentTime || 0;
    const prevSrc = audio.src;
    try {
      audio.muted = true;
      const playable = ensurePlayablePool();
      if (!playable.length) return;
      ensureSrcByIndex(currentIndex >= 0 ? currentIndex : playable[0]);
      await audio.play();
      gestureUnlocked = true;
      needsUserGesture = false;
      if (!shouldPlay()) {
        audio.pause();
        audio.currentTime = 0;
        audio.src = prevSrc || '';
      }
    } catch {
      // wait for next gesture
    } finally {
      audio.muted = prevMuted;
      try { if (shouldPlay() && prevTime > 0) audio.currentTime = prevTime; } catch {}
      renderDock();
    }
  }

  function stopNow({ hard = false } = {}) {
    pendingPlay = false;
    try { audio.pause(); } catch {}
    if (hard) {
      try { audio.currentTime = 0; } catch {}
      audio.src = '';
      try { audio.load(); } catch {}
    }
    renderDock();
  }

  function moveToEndInQueue(index) {
    const pos = queuePosOf(index);
    if (pos < 0) return;
    queueOrder.splice(pos, 1);
    queueOrder.push(index);
  }

  function disableTrack(index) {
    const item = trackItems[index];
    if (!item || item.disabled || item.broken) return;
    const enabledCount = trackItems.filter((it) => !it.disabled && !it.broken).length;
    if (enabledCount <= 1) return;
    item.disabled = true;
    moveToEndInQueue(index);
    shuffleBag = [];
    renderDock();
  }

  function enableTrack(index) {
    const item = trackItems[index];
    if (!item || item.broken || !item.disabled) return;
    item.disabled = false;
    shuffleBag = [];
    renderDock();
  }

  function moveToIndex(index, { recordHistory = true, autoplay = false } = {}) {
    if (index < 0 || index >= trackItems.length) return;
    const item = trackItems[index];
    if (!item || item.disabled || item.broken) return;
    if (recordHistory && currentIndex >= 0 && currentIndex !== index) {
      historyStack.push(currentIndex);
    }
    ensureSrcByIndex(index);
    loadTrackDuration(index);
    if (autoplay) {
      void playNow();
      return;
    }
    renderDock();
  }

  function playNext({ autoplay = true } = {}) {
    const nextIndex = getNextIndex();
    if (nextIndex < 0) return;
    moveToIndex(nextIndex, { recordHistory: true, autoplay });
  }

  function playPreviousTrack({ autoplay = true } = {}) {
    const prevIndex = getPreviousIndex();
    if (prevIndex < 0) return;
    moveToIndex(prevIndex, { recordHistory: false, autoplay });
  }

  function toggleMode() {
    const idx = PLAY_MODES.findIndex((m) => m.key === playMode);
    const next = PLAY_MODES[(idx + 1) % PLAY_MODES.length];
    playMode = next.key;
    saveMode(playMode);
    shuffleBag = [];
    renderDock();
  }

  function syncPlaybackWithState() {
    if (shouldPlay()) {
      if (Date.now() <= startGestureUntil) void tryGestureUnlock();
      void playNow();
      return;
    }
    stopNow();
  }

  function onTrackError() {
    if (disposed || !trackItems.length) return;
    const item = trackItems[currentIndex];
    if (item) item.broken = true;
    const playable = ensurePlayablePool();
    if (!playable.length) {
      console.warn('[Music] No playable tracks found in ui/music.');
      stopNow({ hard: true });
      return;
    }
    currentIndex = playable[0];
    playNext({ autoplay: shouldPlay() });
  }

  audio.addEventListener('ended', () => {
    if (disposed || !trackItems.length) return;
    if (!shouldPlay()) return;
    if (playMode === 'single') {
      try { audio.currentTime = 0; } catch {}
      void playNow();
      return;
    }
    playNext({ autoplay: true });
  });

  audio.addEventListener('error', onTrackError);
  audio.addEventListener('timeupdate', () => renderProgress());
  audio.addEventListener('loadedmetadata', () => {
    const item = trackItems[currentIndex];
    if (item && Number.isFinite(audio.duration)) item.duration = audio.duration;
    renderProgress({ force: true });
    renderQueue();
  });
  audio.addEventListener('durationchange', () => renderProgress({ force: true }));
  audio.addEventListener('play', () => {
    pendingPlay = false;
    renderDock();
  });
  audio.addEventListener('pause', () => {
    pendingPlay = false;
    renderDock();
  });

  function onPotentialStartGesture(ev) {
    if (disposed) return;
    const target = ev?.target;
    const id = target?.id || target?.closest?.('button')?.id || '';
    if (id === 'startBtn' || id === 'stopBtn' || id === 'tetStartBtn' || id === 'snakeStartBtn' || id === 'tetScreenBtn' || id === 'snakeScreenBtn') {
      startGestureUntil = Date.now() + 1800;
      void tryGestureUnlock();
    }
  }

  function onUserGesture() {
    if (disposed) return;
    void tryGestureUnlock();
    if (!shouldPlay()) return;
    if (!needsUserGesture && !(audio.paused || !audio.src)) return;
    void playNow();
  }

  function onVolumeEvent(ev) {
    const v = clamp01(ev?.detail?.value, audio.volume);
    audio.volume = v;
    if (v > 0) {
      audio.muted = false;
      lastNonZeroVolume = v;
    }
    saveVolume01(v);
    renderDock();
  }

  function onAutoPlayOnFocusEvent(ev) {
    const enabled = !!ev?.detail?.enabled;
    autoPlayOnFocus = enabled;
    try {
      localStorage.setItem(MUSIC_AUTOPLAY_ON_FOCUS_LOCAL_KEY, enabled ? '1' : '0');
    } catch {
      // ignore
    }
    if (!enabled) pausedByUserWhileFocus = false;
    syncPlaybackWithState();
  }

  function onVolumeBtnClick(ev) {
    ev?.stopPropagation?.();
    if (audio.muted || audio.volume <= 0.0001) {
      audio.muted = false;
      const v = lastNonZeroVolume > 0 ? lastNonZeroVolume : 0.35;
      audio.volume = clamp01(v, 0.35);
      saveVolume01(audio.volume);
      renderDock();
      return;
    }
    if (audio.volume > 0) lastNonZeroVolume = audio.volume;
    audio.muted = true;
    renderDock();
  }

  function onVolumeSliderInput() {
    if (!volumeSlider) return;
    const v = clamp01(Number(volumeSlider.value) / 100, audio.volume);
    audio.volume = v;
    if (v > 0) {
      audio.muted = false;
      lastNonZeroVolume = v;
    } else {
      audio.muted = true;
    }
    saveVolume01(v);
    renderDock();
  }

  function onPrevClick() {
    if (!trackItems.length) return;
    const now = Date.now();
    const isDoubleTap = (now - prevTapAt) <= PREV_DOUBLE_TAP_MS;
    prevTapAt = now;

    if (isDoubleTap) {
      isManualPlaying = true;
      playPreviousTrack({ autoplay: true });
      prevTapAt = 0;
      return;
    }

    try { audio.currentTime = 0; } catch {}
    renderProgress({ force: true });
  }

  function onPlayPauseClick() {
    if (!trackItems.length) return;
    const isPlayingNow = (!!audio.src && !audio.paused) || pendingPlay;
    if (isPlayingNow) {
      if (isFocusRunning && autoPlayOnFocus) {
        pausedByUserWhileFocus = true;
      }
      isManualPlaying = false;
      pendingPlay = false;
      try { audio.pause(); } catch {}
      renderDock();
      return;
    }
    if (isFocusRunning && autoPlayOnFocus && pausedByUserWhileFocus) {
      pausedByUserWhileFocus = false;
      isManualPlaying = false;
    } else {
      isManualPlaying = true;
    }
    syncPlaybackWithState();
  }

  function onNextClick() {
    if (!trackItems.length) return;
    isManualPlaying = true;
    playNext({ autoplay: true });
  }

  function onQueueListClick(ev) {
    ev?.stopPropagation?.();
    const actionEl = ev?.target?.closest?.('[data-queue-action]');
    if (!actionEl) return;
    const idx = Number(actionEl.getAttribute('data-track-index'));
    if (!Number.isInteger(idx)) return;

    const action = actionEl.getAttribute('data-queue-action');
    if (action === 'toggle-disable') {
      const item = trackItems[idx];
      if (!item || item.broken) return;
      if (item.disabled) enableTrack(idx);
      else disableTrack(idx);
      return;
    }

    if (action === 'play') {
      isManualPlaying = true;
      moveToIndex(idx, { recordHistory: true, autoplay: true });
    }
  }

  function onProgressInput() {
    if (!progressEl) return;
    const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
    if (duration <= 0) return;
    isSeeking = true;
    seekPreviewSec = (Number(progressEl.value) / PROGRESS_MAX) * duration;
    renderProgress();
  }

  function commitSeek() {
    if (!progressEl) return;
    const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
    if (duration > 0) {
      const target = (Number(progressEl.value) / PROGRESS_MAX) * duration;
      try { audio.currentTime = target; } catch {}
    }
    isSeeking = false;
    renderProgress({ force: true });
  }

  if (modeBtn) modeBtn.addEventListener('click', toggleMode);
  if (prevBtn) prevBtn.addEventListener('click', onPrevClick);
  if (playPauseBtn) playPauseBtn.addEventListener('click', onPlayPauseClick);
  if (nextBtn) nextBtn.addEventListener('click', onNextClick);
  if (volumeBtn) volumeBtn.addEventListener('click', onVolumeBtnClick);
  if (volumeSlider) volumeSlider.addEventListener('input', onVolumeSliderInput);
  if (queueList) queueList.addEventListener('click', onQueueListClick);
  if (progressEl) {
    progressEl.addEventListener('input', onProgressInput);
    progressEl.addEventListener('change', commitSeek);
    progressEl.addEventListener('pointerup', commitSeek);
    progressEl.addEventListener('blur', commitSeek);
  }

  document.addEventListener('pointerdown', onPotentialStartGesture, { passive: true, capture: true });
  document.addEventListener('pointerdown', onUserGesture, { passive: true });
  document.addEventListener('keydown', onUserGesture);
  window.addEventListener('growin:music-volume', onVolumeEvent);
  window.addEventListener('growin:music-autoplay-on-focus', onAutoPlayOnFocusEvent);

  if (window.electronAPI?.onMusicCommand) {
    window.electronAPI.onMusicCommand((cmd) => {
      if (cmd === 'prev') onPrevClick();
      if (cmd === 'next') onNextClick();
      if (cmd === 'toggle') onPlayPauseClick();
    });
  }

  const unsub = subscribeFocusStatus((st) => {
    if (disposed) return;
    const wasRunning = isFocusRunning;
    const wasPlaying = ((!audio.paused) || pendingPlay) && !!audio.src;
    isFocusRunning = !!st?.isRunning;
    if (wasRunning && !isFocusRunning) {
      if (wasPlaying && !isManualPlaying) {
        // Keep playback when focus ends; do not auto-pause.
        isManualPlaying = true;
      }
      pausedByUserWhileFocus = false;
    }
    syncPlaybackWithState();
  });

  trackItems.forEach((_, idx) => loadTrackDuration(idx));
  if (trackItems.length) ensureSrcByIndex(currentIndex);
  renderDock();

  return {
    setVolume(v) {
      const next = clamp01(v, audio.volume);
      audio.volume = next;
      saveVolume01(next);
      renderDock();
    },
    dispose() {
      disposed = true;
      try { unsub?.(); } catch {}
      try { document.removeEventListener('pointerdown', onPotentialStartGesture, { capture: true }); } catch {}
      try { document.removeEventListener('pointerdown', onUserGesture); } catch {}
      try { document.removeEventListener('keydown', onUserGesture); } catch {}
      try { window.removeEventListener('growin:music-volume', onVolumeEvent); } catch {}
      try { window.removeEventListener('growin:music-autoplay-on-focus', onAutoPlayOnFocusEvent); } catch {}
      try { audio.removeEventListener('error', onTrackError); } catch {}
      if (modeBtn) modeBtn.removeEventListener('click', toggleMode);
      if (prevBtn) prevBtn.removeEventListener('click', onPrevClick);
      if (playPauseBtn) playPauseBtn.removeEventListener('click', onPlayPauseClick);
      if (nextBtn) nextBtn.removeEventListener('click', onNextClick);
      if (volumeBtn) volumeBtn.removeEventListener('click', onVolumeBtnClick);
      if (volumeSlider) volumeSlider.removeEventListener('input', onVolumeSliderInput);
      if (queueList) queueList.removeEventListener('click', onQueueListClick);
      if (progressEl) {
        progressEl.removeEventListener('input', onProgressInput);
        progressEl.removeEventListener('change', commitSeek);
        progressEl.removeEventListener('pointerup', commitSeek);
        progressEl.removeEventListener('blur', commitSeek);
      }
      stopNow({ hard: true });
    },
  };
}
