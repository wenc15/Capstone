// 2026/03/19 edited by Zhecheng Xu
// Changes:
//  - Add Settings data management modal.
//  - Wire archive export/import APIs to frontend actions.
// =============================================================
// Purpose:
//  - Provide user-facing backup/restore entry under Settings.

import { showToast } from './utils.js';

const API_BASE = 'http://localhost:5024';
const APP_SETTINGS_LOCAL_KEY = 'growin:appBehaviorSettings';
const DEFAULT_APP_SETTINGS = {
  widgetVisibleOnStartup: true,
  closeBehavior: 'minimize',
};

async function parseJsonSafe(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function closeSettings(els) {
  if (!els?.settingsOverlay) return;
  els.settingsOverlay.classList.remove('open');
  els.settingsOverlay.setAttribute('aria-hidden', 'true');
}

function openSettings(els) {
  if (!els?.settingsOverlay) return;
  els.settingsOverlay.classList.add('open');
  els.settingsOverlay.setAttribute('aria-hidden', 'false');
}

function resolveAppSettingsFromRenderer(els) {
  const widgetVisible = els?.settingWidgetStartupVisible?.checked !== false;
  const closeBehavior = els?.settingCloseBehavior?.value === 'exit' ? 'exit' : 'minimize';
  return { widgetVisibleOnStartup: widgetVisible, closeBehavior };
}

function applyAppSettingsToRenderer(els, settings) {
  const safe = {
    widgetVisibleOnStartup: settings?.widgetVisibleOnStartup !== false,
    closeBehavior: settings?.closeBehavior === 'exit' ? 'exit' : 'minimize',
  };

  if (els?.settingWidgetStartupVisible) {
    els.settingWidgetStartupVisible.checked = safe.widgetVisibleOnStartup;
  }
  if (els?.settingCloseBehavior) {
    els.settingCloseBehavior.value = safe.closeBehavior;
  }

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
  applyAppSettingsToRenderer(els, local || DEFAULT_APP_SETTINGS);

  const api = window.electronAPI;
  if (!api?.getAppSettings) {
    return;
  }

  try {
    const settings = await api.getAppSettings();
    const safe = applyAppSettingsToRenderer(els, settings);
    saveLocalAppSettings(safe);
  } catch (err) {
    console.warn('[Settings] Failed to load app settings:', err);
  }
}

async function saveAppBehaviorSettings(els) {
  const meta = els?.settingsBehaviorMeta;
  const api = window.electronAPI;
  const patch = resolveAppSettingsFromRenderer(els);
  saveLocalAppSettings(patch);

  if (!api?.updateAppSettings) {
    if (meta) meta.textContent = 'Saved locally. Restart app to apply desktop behavior.';
    return;
  }

  if (meta) meta.textContent = 'Saving...';
  try {
    const saved = await api.updateAppSettings(patch);
    const safe = applyAppSettingsToRenderer(els, saved);
    saveLocalAppSettings(safe);
    if (meta) meta.textContent = 'Saved.';
  } catch (err) {
    console.warn('[Settings] Failed to save app settings:', err);
    if (meta) meta.textContent = 'Saved locally. Restart app to apply desktop behavior.';
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

  const ok = window.confirm('Import will overwrite your current local data. Continue?');
  if (!ok) return;

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

export function mountSettings(els) {
  const {
    settingsOpenBtn,
    settingsOverlay,
    settingsCloseBtn,
    settingWidgetStartupVisible,
    settingCloseBehavior,
    settingsBehaviorMeta,
    archiveExportBtn,
    archiveImportFile,
    archiveImportBtn,
  } = els || {};

  if (!settingsOpenBtn || !settingsOverlay || !settingsCloseBtn || !archiveExportBtn || !archiveImportFile || !archiveImportBtn || !settingWidgetStartupVisible || !settingCloseBehavior || !settingsBehaviorMeta) {
    return;
  }

  loadAppBehaviorSettings(els);

  settingsOpenBtn.addEventListener('click', () => openSettings(els));
  settingsCloseBtn.addEventListener('click', () => closeSettings(els));
  settingsOverlay.addEventListener('click', (e) => {
    if (e.target === settingsOverlay) closeSettings(els);
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && settingsOverlay.classList.contains('open')) {
      closeSettings(els);
    }
  });

  archiveImportFile.addEventListener('change', () => {
    const f = archiveImportFile.files?.[0];
    const enabled = !!f && f.name.toLowerCase().endsWith('.json');
    archiveImportBtn.disabled = !enabled;
  });

  archiveExportBtn.addEventListener('click', () => exportArchive(els));
  archiveImportBtn.addEventListener('click', () => importArchive(els));
  settingWidgetStartupVisible.addEventListener('change', () => saveAppBehaviorSettings(els));
  settingCloseBehavior.addEventListener('change', () => saveAppBehaviorSettings(els));
}
