// 2026/04/05 edited by zhechengxu
// Changes:
//  - Add violation grace seconds setting (5-60) and broadcast updates for defaults sync.

// 2026/03/25 edited by Zhecheng Xu
// Changes:
//  - Add focus music autoplay preference and broadcast to music module.
//  - Persist UI tone changes through app settings for widget/main sync.

// 2026/03/19 edited by Zhecheng Xu
// Changes:
//  - Add Settings data management modal.
//  - Wire archive export/import APIs to frontend actions.
// =============================================================
// Purpose:
//  - Provide user-facing backup/restore entry under Settings.

// 2026/03/31 edited by Zikai Lu
// Changes:
//  - Use centralized localStorage key registry for full local data cleanup.
//  - Keep settings persistence keys aligned across modules.
//  - Add website usage cleanup action with configurable keep-days input.

import { showToast } from './utils.js';
import { LOCAL_STORAGE_KEYS, clearKnownLocalStorage } from './local_storage.js';
import { openOverlayWithMotion, closeOverlayWithMotion, CLEANUP_MS } from './overlay_motion.js';

const API_BASE = 'http://localhost:5024';
const APP_SETTINGS_LOCAL_KEY = LOCAL_STORAGE_KEYS.appSettings;
const MUSIC_VOLUME_LOCAL_KEY = LOCAL_STORAGE_KEYS.musicVolume;
const MUSIC_MUTED_LOCAL_KEY = LOCAL_STORAGE_KEYS.musicMuted;
const MUSIC_AUTOPLAY_ON_FOCUS_LOCAL_KEY = LOCAL_STORAGE_KEYS.musicAutoplayOnFocus;
const FOCUS_GRACE_SECONDS_LOCAL_KEY = LOCAL_STORAGE_KEYS.focusGraceSeconds;
const DEFAULT_APP_SETTINGS = {
  showWidget: true,
  closeBehavior: 'minimize',
  uiTone: 'default',
};
const DEFAULT_FOCUS_GRACE_SECONDS = 10;
const MIN_FOCUS_GRACE_SECONDS = 5;
const MAX_FOCUS_GRACE_SECONDS = 60;

function clampMusicVolume01(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0.35;
  return Math.max(0, Math.min(1, n));
}

function loadMusicVolume01() {
  try {
    const raw = localStorage.getItem(MUSIC_VOLUME_LOCAL_KEY);
    if (raw == null) return 0.35;
    if (String(raw).trim() === '') return 0.35;
    const vol = clampMusicVolume01(raw);
    const mutedRaw = localStorage.getItem(MUSIC_MUTED_LOCAL_KEY);
    const isMuted = mutedRaw === '1' || mutedRaw === 'true';
    if (!isMuted && vol <= 0.0001) return 0.35;
    return vol;
  } catch {
    return 0.35;
  }
}

function loadMusicAutoplayOnFocus() {
  try {
    const raw = localStorage.getItem(MUSIC_AUTOPLAY_ON_FOCUS_LOCAL_KEY);
    if (raw == null) return true;
    return raw !== '0' && raw !== 'false';
  } catch {
    return true;
  }
}

function saveMusicAutoplayOnFocus(enabled) {
  try {
    localStorage.setItem(MUSIC_AUTOPLAY_ON_FOCUS_LOCAL_KEY, enabled ? '1' : '0');
  } catch {
    // ignore local storage failures
  }
}

function emitMusicVolume(volume01) {
  window.dispatchEvent(new CustomEvent('growin:music-volume', {
    detail: { value: clampMusicVolume01(volume01) },
  }));
}

function emitMusicAutoplayOnFocus(enabled) {
  window.dispatchEvent(new CustomEvent('growin:music-autoplay-on-focus', {
    detail: { enabled: !!enabled },
  }));
}

function normalizeUiTone(v) {
  return String(v || '').trim().toLowerCase() === 'sky' ? 'sky' : 'default';
}

function applyUiTone(tone) {
  const next = normalizeUiTone(tone);
  document.documentElement.setAttribute('data-ui-tone', next);
  return next;
}

function withUiToneFallback(settings, fallbackTone = 'default') {
  return {
    ...(settings || {}),
    uiTone: normalizeUiTone(settings?.uiTone ?? fallbackTone),
  };
}

async function parseJsonSafe(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function closeSettings(els) {
  if (!els?.settingsOverlay) return;
  closeOverlayWithMotion(els.settingsOverlay, { closeDurationMs: CLEANUP_MS });
}

function clampFocusGraceSeconds(v) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return DEFAULT_FOCUS_GRACE_SECONDS;
  return Math.max(MIN_FOCUS_GRACE_SECONDS, Math.min(MAX_FOCUS_GRACE_SECONDS, n));
}

function loadFocusGraceSeconds() {
  try {
    const raw = localStorage.getItem(FOCUS_GRACE_SECONDS_LOCAL_KEY);
    if (raw == null) return DEFAULT_FOCUS_GRACE_SECONDS;
    return clampFocusGraceSeconds(raw);
  } catch {
    return DEFAULT_FOCUS_GRACE_SECONDS;
  }
}

function saveFocusGraceSeconds(value) {
  const safe = clampFocusGraceSeconds(value);
  try {
    localStorage.setItem(FOCUS_GRACE_SECONDS_LOCAL_KEY, String(safe));
  } catch {
    // ignore local storage failures
  }
  return safe;
}

function openSettings(els) {
  if (!els?.settingsOverlay) return;
  openOverlayWithMotion(els.settingsOverlay, { openDurationMs: CLEANUP_MS });
}

function resolveAppSettingsFromRenderer(els) {
  const showWidget = els?.settingShowWidget?.checked !== false;
  const closeBehavior = els?.settingCloseBehavior?.value === 'exit' ? 'exit' : 'minimize';
  const uiTone = normalizeUiTone(els?.settingUiTone?.value);
  return { showWidget, closeBehavior, uiTone };
}

function applyAppSettingsToRenderer(els, settings) {
  const safe = {
    showWidget: settings?.showWidget ?? (settings?.widgetVisibleOnStartup !== false),
    closeBehavior: settings?.closeBehavior === 'exit' ? 'exit' : 'minimize',
    uiTone: normalizeUiTone(settings?.uiTone),
  };

  if (els?.settingShowWidget) {
    els.settingShowWidget.checked = safe.showWidget !== false;
  }
  if (els?.settingCloseBehavior) {
    els.settingCloseBehavior.value = safe.closeBehavior;
  }
  if (els?.settingUiTone) {
    els.settingUiTone.value = safe.uiTone;
  }
  applyUiTone(safe.uiTone);

  return safe;
}

function loadLocalAppSettings() {
  try {
    const raw = localStorage.getItem(APP_SETTINGS_LOCAL_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveLocalAppSettings(settings) {
  try {
    localStorage.setItem(APP_SETTINGS_LOCAL_KEY, JSON.stringify(settings));
  } catch {
    // ignore local storage failures
  }
}

async function loadAppBehaviorSettings(els) {
  const local = loadLocalAppSettings();
  const localSafe = applyAppSettingsToRenderer(els, local || DEFAULT_APP_SETTINGS);

  const api = window.electronAPI;
  if (!api?.getAppSettings) {
    return;
  }

  try {
    const settings = await api.getAppSettings();
    const mergedSettings = withUiToneFallback(settings, localSafe.uiTone);
    const safe = applyAppSettingsToRenderer(els, mergedSettings);
    saveLocalAppSettings(safe);
  } catch (err) {
    console.warn('[Settings] Failed to load app settings:', err);
  }
}

function bindAppSettingSyncEvents(els) {
  const api = window.electronAPI;
  if (!api?.onAppSettingsChanged) return;

  api.onAppSettingsChanged((settings) => {
    const local = loadLocalAppSettings() || DEFAULT_APP_SETTINGS;
    const mergedSettings = withUiToneFallback(settings, local.uiTone);
    const safe = applyAppSettingsToRenderer(els, mergedSettings);
    saveLocalAppSettings(safe);
  });
}

async function saveAppBehaviorSettings(els) {
  const meta = els?.settingsBehaviorMeta;
  const api = window.electronAPI;
  const patch = resolveAppSettingsFromRenderer(els);
  const localNext = { ...(loadLocalAppSettings() || DEFAULT_APP_SETTINGS), ...patch };
  saveLocalAppSettings(localNext);
  applyUiTone(localNext.uiTone);

  if (!api?.updateAppSettings) {
    if (meta) meta.textContent = 'Saved locally. Restart app to apply desktop behavior.';
    return;
  }

  if (meta) meta.textContent = 'Saving...';
  try {
    const saved = await api.updateAppSettings(patch);
    const mergedSettings = withUiToneFallback(saved, localNext.uiTone);
    const safe = applyAppSettingsToRenderer(els, mergedSettings);
    saveLocalAppSettings(safe);
    applyUiTone(safe.uiTone);
    if (meta) meta.textContent = 'Saved.';
  } catch (err) {
    console.warn('[Settings] Failed to save app settings:', err);
    if (meta) meta.textContent = 'Saved locally. Restart app to apply desktop behavior.';
  }
}

async function saveCloseBehaviorOnly(els) {
  const meta = els?.settingsBehaviorMeta;
  const api = window.electronAPI;
  const closeBehavior = els?.settingCloseBehavior?.value === 'exit' ? 'exit' : 'minimize';

  const localBase = loadLocalAppSettings() || DEFAULT_APP_SETTINGS;
  const localNext = { ...localBase, closeBehavior };
  saveLocalAppSettings(localNext);
  applyUiTone(localNext.uiTone);

  if (!api?.updateAppSettings) {
    if (meta) meta.textContent = 'Saved locally. Restart app to apply desktop behavior.';
    return;
  }

  if (meta) meta.textContent = 'Saving...';
  try {
    const saved = await api.updateAppSettings({ closeBehavior });
    const mergedSettings = withUiToneFallback(saved, localNext.uiTone);
    const safe = applyAppSettingsToRenderer(els, mergedSettings);
    saveLocalAppSettings(safe);
    applyUiTone(safe.uiTone);
    if (meta) meta.textContent = 'Saved.';
  } catch (err) {
    console.warn('[Settings] Failed to save close behavior:', err);
    if (meta) meta.textContent = 'Saved locally. Restart app to apply desktop behavior.';
  }
}

async function setWidgetVisibilityDirect(els, visible) {
  const api = window.electronAPI;
  if (!api?.setWidgetVisible) return;

  try {
    const saved = await api.setWidgetVisible(!!visible);
    const local = loadLocalAppSettings() || DEFAULT_APP_SETTINGS;
    const mergedSettings = withUiToneFallback(saved, local.uiTone);
    const safe = applyAppSettingsToRenderer(els, mergedSettings);
    saveLocalAppSettings(safe);
  } catch (err) {
    console.warn('[Settings] Failed to set widget visibility directly:', err);
  }
}

async function exportArchive(els) {
  const btn = els.archiveExportBtn;
  if (!btn) return;

  const prev = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Exporting...';

  try {
    const res = await fetch(`${API_BASE}/api/archive/export`);
    if (!res.ok) {
      const body = await parseJsonSafe(res);
      throw new Error(body?.error || `${res.status} ${res.statusText}`);
    }

    const blob = await res.blob();
    const contentDisposition = res.headers.get('content-disposition') || '';
    const nameMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
    const fileName = nameMatch?.[1] || `growin-archive-${Date.now()}.json`;

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    showToast(els.toastEl, 'Export successful.');
  } catch (e) {
    console.warn('[Settings] Export failed:', e);
    showToast(els.toastEl, e?.message || 'Export failed.');
  } finally {
    btn.disabled = false;
    btn.textContent = prev;
  }
}

async function importArchive(els) {
  const fileInput = els.archiveImportFile;
  const btn = els.archiveImportBtn;
  const meta = els.archiveImportMeta;
  if (!fileInput || !btn || !meta) return;

  const file = fileInput.files?.[0];
  if (!file) {
    showToast(els.toastEl, 'Please select a JSON file first.');
    return;
  }

  const isJsonName = file.name.toLowerCase().endsWith('.json');
  if (!isJsonName) {
    showToast(els.toastEl, 'Only .json file is supported.');
    return;
  }

  const prev = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Importing...';
  meta.textContent = '';

  try {
    const form = new FormData();
    form.append('file', file);

    const res = await fetch(`${API_BASE}/api/archive/import`, {
      method: 'POST',
      body: form,
    });

    const body = await parseJsonSafe(res);
    if (!res.ok) {
      const msg = body?.error || body?.message || `${res.status} ${res.statusText}`;
      throw new Error(msg);
    }

    meta.textContent = `Imported records: ${body?.sessionHistoryCount ?? 0}, presets: ${body?.whitelistPresetCount ?? 0}`;
    showToast(els.toastEl, 'Import successful. Reloading UI...');

    setTimeout(() => {
      window.location.reload();
    }, 450);
  } catch (e) {
    console.warn('[Settings] Import failed:', e);
    showToast(els.toastEl, e?.message || 'Import failed.');
  } finally {
    btn.disabled = false;
    btn.textContent = prev;
  }
}

async function deleteAllLocalData(els) {
  const btn = els.archiveDeleteBtn;
  if (!btn) return;

  const first = window.confirm('This will permanently delete all local data. Continue?');
  if (!first) return;
  const second = window.confirm('Final confirmation: this action cannot be undone. Delete now?');
  if (!second) return;

  const prev = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Deleting...';

  try {
    window.dispatchEvent(new CustomEvent('growin:force-stop-focus'));
    try {
      await fetch(`${API_BASE}/api/focus/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
    } catch {
      // ignore stop failures; clear still proceeds
    }

    const res = await fetch(`${API_BASE}/api/archive/clear`, {
      method: 'POST',
    });
    const body = await parseJsonSafe(res);
    if (!res.ok) {
      const msg = body?.error || body?.message || `${res.status} ${res.statusText}`;
      throw new Error(msg);
    }

    try {
      await fetch(`${API_BASE}/api/usage/clear`, {
        method: 'POST',
      });
    } catch {
      // ignore usage clear failures; local archive already cleared
    }

    clearKnownLocalStorage();

    showToast(els.toastEl, 'Local data deleted. Reloading UI...');
    setTimeout(() => {
      window.location.reload();
    }, 450);
  } catch (e) {
    console.warn('[Settings] Delete data failed:', e);
    showToast(els.toastEl, e?.message || 'Delete data failed.');
  } finally {
    btn.disabled = false;
    btn.textContent = prev;
  }
}

function parseKeepDays(rawValue) {
  const n = Math.round(Number(rawValue));
  if (!Number.isFinite(n)) return null;
  return Math.max(1, Math.min(36500, n));
}

async function cleanupUsageData(els) {
  const btn = els.usageCleanupBtn;
  const input = els.usageCleanupDaysInput;
  const meta = els.usageCleanupMeta;
  if (!btn || !input) return;

  const keepDays = parseKeepDays(input.value);
  if (!keepDays) {
    showToast(els.toastEl, 'Keep days must be a valid number.');
    if (meta) meta.textContent = 'Please enter a valid keep-days value.';
    return;
  }
  input.value = String(keepDays);

  const confirmed = window.confirm(`This will permanently remove website usage records older than ${keepDays} day(s). Continue?`);
  if (!confirmed) {
    if (meta) meta.textContent = 'Cleanup cancelled.';
    return;
  }

  const prev = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Cleaning...';
  if (meta) meta.textContent = '';

  try {
    const res = await fetch(`${API_BASE}/api/usage/cleanup?keepDays=${encodeURIComponent(String(keepDays))}`, {
      method: 'POST',
    });
    const body = await parseJsonSafe(res);
    if (!res.ok) {
      const msg = body?.error || body?.message || `${res.status} ${res.statusText}`;
      throw new Error(msg);
    }

    const removed = Number(body?.removed ?? 0);
    if (meta) meta.textContent = `Cleanup done: removed ${removed} records (keep ${keepDays} days).`;
    showToast(els.toastEl, `Usage cleanup done. Removed ${removed} records.`);
  } catch (e) {
    console.warn('[Settings] Usage cleanup failed:', e);
    if (meta) meta.textContent = 'Usage cleanup failed.';
    showToast(els.toastEl, e?.message || 'Usage cleanup failed.');
  } finally {
    btn.disabled = false;
    btn.textContent = prev;
  }
}

function refreshImportCta(els) {
  const fileInput = els.archiveImportFile;
  const btn = els.archiveImportBtn;
  const meta = els.archiveImportMeta;
  const reselectBtn = els.archiveReselectBtn;
  if (!fileInput || !btn || !meta) return;

  const f = fileInput.files?.[0] || null;
  if (!f) {
    btn.textContent = 'Import Data';
    meta.textContent = 'No file selected yet.';
    if (reselectBtn) reselectBtn.hidden = true;
    return;
  }

  btn.textContent = 'Confirm Import';
  meta.textContent = `Selected: ${f.name}`;
  if (reselectBtn) reselectBtn.hidden = false;
}

export function mountSettings(els) {
  const {
    settingsOpenBtn,
    settingsOverlay,
    settingsCloseBtn,
    settingShowWidget,
    settingCloseBehavior,
    settingUiTone,
    settingMusicAutoPlay,
    settingFocusGraceSeconds,
    openMusicFolderBtn,
    settingsBehaviorMeta,
    archiveExportBtn,
    archiveImportFile,
    archiveImportBtn,
    archiveReselectBtn,
    archiveDeleteBtn,
    usageCleanupDaysInput,
    usageCleanupBtn,
    usageCleanupMeta,
  } = els || {};

  if (!settingsOpenBtn || !settingsOverlay || !settingsCloseBtn || !archiveExportBtn || !archiveImportFile || !archiveImportBtn || !archiveReselectBtn || !archiveDeleteBtn || !usageCleanupDaysInput || !usageCleanupBtn || !usageCleanupMeta || !settingShowWidget || !settingCloseBehavior || !settingUiTone || !settingsBehaviorMeta || !openMusicFolderBtn || !settingFocusGraceSeconds) {
    return;
  }

  const keepDaysBoot = parseKeepDays(usageCleanupDaysInput.value);
  usageCleanupDaysInput.value = String(keepDaysBoot || 90);
  usageCleanupMeta.textContent = 'Remove website usage records older than keep-days.';

  const bootMusicVol = loadMusicVolume01();
  const bootAutoPlay = loadMusicAutoplayOnFocus();
  const bootGraceSeconds = loadFocusGraceSeconds();
  if (settingMusicAutoPlay) {
    settingMusicAutoPlay.checked = bootAutoPlay;
  }
  settingFocusGraceSeconds.value = String(bootGraceSeconds);
  emitMusicVolume(bootMusicVol);
  emitMusicAutoplayOnFocus(bootAutoPlay);

  loadAppBehaviorSettings(els);
  bindAppSettingSyncEvents(els);

  settingsOpenBtn.addEventListener('click', () => openSettings(els));
  settingsCloseBtn.addEventListener('click', () => closeSettings(els));
  settingsOverlay.addEventListener('click', (e) => {
    if (e.target === settingsOverlay) closeSettings(els);
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !settingsOverlay.classList.contains('mg-hidden')) {
      closeSettings(els);
    }
  });

  archiveImportFile.addEventListener('change', () => {
    const f = archiveImportFile.files?.[0];
    if (f && !f.name.toLowerCase().endsWith('.json')) {
      archiveImportFile.value = '';
      showToast(els.toastEl, 'Only .json file is supported.');
    }
    refreshImportCta(els);
  });

  archiveExportBtn.addEventListener('click', () => exportArchive(els));
  archiveImportBtn.addEventListener('click', () => {
    const f = archiveImportFile.files?.[0] || null;
    if (!f) {
      archiveImportFile.click();
      return;
    }
    importArchive(els).finally(() => {
      archiveImportFile.value = '';
      refreshImportCta(els);
    });
  });
  archiveReselectBtn.addEventListener('click', () => {
    archiveImportFile.click();
  });
  archiveDeleteBtn.addEventListener('click', () => deleteAllLocalData(els));
  usageCleanupBtn.addEventListener('click', () => cleanupUsageData(els));
  openMusicFolderBtn.addEventListener('click', async () => {
    const api = window.electronAPI;
    if (!api?.openMusicFolder) {
      showToast(els.toastEl, 'Music folder opening is unavailable.');
      return;
    }
    const res = await api.openMusicFolder();
    if (res?.ok) {
      if (settingsBehaviorMeta) settingsBehaviorMeta.textContent = `Opened: ${res.folder}`;
      showToast(els.toastEl, 'Music folder opened.');
    } else {
      showToast(els.toastEl, res?.error || 'Failed to open music folder.');
    }
  });
  settingShowWidget.addEventListener('change', async () => {
    await setWidgetVisibilityDirect(els, settingShowWidget.checked);
    if (settingsBehaviorMeta) settingsBehaviorMeta.textContent = 'Saved.';
  });
  settingCloseBehavior.addEventListener('change', () => saveCloseBehaviorOnly(els));
  settingUiTone.addEventListener('change', () => {
    const next = resolveAppSettingsFromRenderer(els);
    const localNext = { ...(loadLocalAppSettings() || DEFAULT_APP_SETTINGS), uiTone: next.uiTone };
    saveLocalAppSettings(localNext);
    applyUiTone(localNext.uiTone);
    const api = window.electronAPI;
    if (api?.updateAppSettings) {
      api.updateAppSettings({ uiTone: next.uiTone })
        .then((saved) => {
          const merged = withUiToneFallback(saved, localNext.uiTone);
          const safe = applyAppSettingsToRenderer(els, merged);
          saveLocalAppSettings(safe);
          if (settingsBehaviorMeta) settingsBehaviorMeta.textContent = 'Saved.';
        })
        .catch(() => {
          if (settingsBehaviorMeta) settingsBehaviorMeta.textContent = 'Saved locally.';
        });
      return;
    }
    if (settingsBehaviorMeta) settingsBehaviorMeta.textContent = 'Saved locally.';
  });

  if (settingMusicAutoPlay) {
    settingMusicAutoPlay.addEventListener('change', () => {
      const enabled = !!settingMusicAutoPlay.checked;
      saveMusicAutoplayOnFocus(enabled);
      emitMusicAutoplayOnFocus(enabled);
      if (settingsBehaviorMeta) settingsBehaviorMeta.textContent = enabled
        ? 'Focus auto-play music: On.'
        : 'Focus auto-play music: Off.';
    });
  }

  settingFocusGraceSeconds.addEventListener('change', () => {
    const saved = saveFocusGraceSeconds(settingFocusGraceSeconds.value);
    settingFocusGraceSeconds.value = String(saved);
    window.dispatchEvent(new CustomEvent('growin:focus-grace-seconds', {
      detail: { value: saved },
    }));
    if (settingsBehaviorMeta) settingsBehaviorMeta.textContent = `Violation grace set to ${saved}s.`;
  });

  refreshImportCta(els);
}
