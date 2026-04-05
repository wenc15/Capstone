// 2026/04/05 edited by zhechengxu
// Changes:
//  - Extend whitelist to apps + websites and sync defaults to backend.
//  - Add website input warning hints (validation hint only, no normalization).

// js/whitelist.js
// 2026/01/29 edited by Zhecheng Xu
// 新增内容：
//   - 支持 Browse 选择 exe 文件并加入白名单（从 file input 获取 exeName）。
//   - 引入自定义应用库（customCatalog）并使用 localStorage 持久化：
//       Key: growin.custom_app_catalog.v1
//       内容：[{ id, label, exeList }]
//   - Catalog 逻辑调整：内置应用列表 + 自定义应用列表合并检索（search / findById / findByExe）。
//   - 搜索匹配增强：支持按 label / id / exe 名称关键字检索。
// =============================================================
// 作用补充：
//   - 白名单不再只依赖固定 APP_CATALOG；用户自己添加过的 exe 会被记住，重启仍可直接搜索/选中。
//   - Browse 的目标是拿到“进程名（xxx.exe）”，供后端进程白名单匹配使用。
//   - 避免重复添加：按 exeName 去重；并确保白名单不为空（兜底 Electron）。
// =============================================================

// 11.19 created by Claire (Qinquan) Wang
// Responsibility:
//  - Manage the "whitelist" UI (checkbox group inside #whitelistGroup).
//  - Keep track of selected apps (multi-select).
//  - Provide helper functions for backend payloads and notes.

/* 11.19 edited by Jingyao Sun:
 *  - Replaced checkbox-based whitelist with a search + selected-list UI (Windows-style).
 *  - Introduced APP_CATALOG and internal currentWhitelistApps to track selected apps by id.
 *  - Implemented initWhitelist() to wire search input, results list, and removable pills.
 *  - Exposed getAllowedProcesses()/getWhitelistNote() for backend payloads and stats notes.
 *  - Changed the default whitelist app to be Electron.
 */

//
// 外部使用：
//   import { initWhitelist, getAllowedProcesses, getWhitelistNote } from './whitelist.js';
//
//   initWhitelist(whitelistGroup);
//   const processes = getAllowedProcesses(); // -> ["chrome.exe", "Code.exe", ...]

import { LOCAL_STORAGE_KEYS } from './local_storage.js';


// 预置应用“库”，类似 Windows 搜索到的常见应用列表。
// ===== 用户自定义应用库（可写 + 持久化）=====

// ===== 内置应用库（只读）=====
export const BASE_APP_CATALOG = [
  // Browsers
  { id: 'chrome',   label: 'Google Chrome',          exeList: ['chrome.exe'] },
  { id: 'edge',     label: 'Microsoft Edge',         exeList: ['msedge.exe'] },
  { id: 'firefox',  label: 'Mozilla Firefox',        exeList: ['firefox.exe'] },
  { id: 'brave',    label: 'Brave',                  exeList: ['brave.exe'] },
  { id: 'opera',    label: 'Opera',                  exeList: ['opera.exe'] },

  // Dev / Editors
  { id: 'code',     label: 'Visual Studio Code',     exeList: ['Code.exe', 'code.exe'] },
  { id: 'vs',       label: 'Visual Studio',          exeList: ['devenv.exe'] },
  { id: 'idea',     label: 'IntelliJ IDEA',          exeList: ['idea64.exe'] },
  { id: 'pycharm',  label: 'PyCharm',                exeList: ['pycharm64.exe'] },
  { id: 'webstorm', label: 'WebStorm',               exeList: ['webstorm64.exe'] },
  { id: 'rider',    label: 'Rider',                  exeList: ['rider64.exe'] },
  { id: 'notepadpp',label: 'Notepad++',              exeList: ['notepad++.exe'] },
  { id: 'sublime',  label: 'Sublime Text',           exeList: ['sublime_text.exe'] },
  { id: 'terminal', label: 'Windows Terminal',       exeList: ['WindowsTerminal.exe', 'wt.exe'] },
  { id: 'cmd',      label: 'Command Prompt',         exeList: ['cmd.exe'] },
  { id: 'powershell',label:'PowerShell',             exeList: ['powershell.exe', 'pwsh.exe'] },

  // Office
  { id: 'word',     label: 'Microsoft Word',         exeList: ['WINWORD.EXE'] },
  { id: 'excel',    label: 'Microsoft Excel',        exeList: ['EXCEL.EXE'] },
  { id: 'ppt',      label: 'PowerPoint',             exeList: ['POWERPNT.EXE'] },
  { id: 'onenote',  label: 'OneNote',                exeList: ['ONENOTE.EXE'] },
  { id: 'outlook',  label: 'Outlook',                exeList: ['OUTLOOK.EXE'] },

  // Communication (你可以按需放/不放，避免“分心应用”默认出现)
  { id: 'discord',  label: 'Discord',                exeList: ['Discord.exe'] },
  { id: 'slack',    label: 'Slack',                  exeList: ['slack.exe'] },
  { id: 'teams',    label: 'Microsoft Teams',        exeList: ['Teams.exe', 'ms-teams.exe'] },
  { id: 'zoom',     label: 'Zoom',                   exeList: ['Zoom.exe'] },

  // Media (同上，按需)
  { id: 'spotify',  label: 'Spotify',                exeList: ['Spotify.exe'] },
  { id: 'vlc',      label: 'VLC',                    exeList: ['vlc.exe'] },

  // PDF / Reading
  { id: 'acrobat',  label: 'Adobe Acrobat',          exeList: ['Acrobat.exe'] },
  { id: 'acrordc',  label: 'Adobe Reader',           exeList: ['AcroRd32.exe'] },

  // Utilities
  { id: 'explorer', label: 'File Explorer',          exeList: ['explorer.exe'] },
  { id: 'notepad',  label: 'Notepad',                exeList: ['notepad.exe'] },
  { id: 'calc',     label: 'Calculator',             exeList: ['calculator.exe', 'calc.exe'] },
  { id: 'paint',    label: 'Paint',                  exeList: ['mspaint.exe'] },

  // Your app / runtime
  { id: 'electron', label: 'Electron',               exeList: ['electron.exe'] },
];


const CUSTOM_CATALOG_KEY = 'growin.custom_app_catalog.v1';
const WHITELIST_SELECTION_KEY = 'growin.whitelist.selection.v1';
const API_BASE = 'http://localhost:5024';
const DEFAULT_FOCUS_GRACE_SECONDS = 10;
const MIN_FOCUS_GRACE_SECONDS = 5;
const MAX_FOCUS_GRACE_SECONDS = 60;
let customCatalog = loadCustomCatalog();
let focusDefaultsSyncTimer = null;
let focusDefaultsSyncBound = false;

function loadCustomCatalog() {
  try {
    const raw = localStorage.getItem(CUSTOM_CATALOG_KEY);
    const data = raw ? JSON.parse(raw) : [];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function saveCustomCatalog() {
  try {
    localStorage.setItem(CUSTOM_CATALOG_KEY, JSON.stringify(customCatalog));
  } catch (e) {
    console.warn('[Whitelist] Failed to save custom catalog:', e);
  }
}

function getCatalog() {
  // 合并：内置 + 自定义（自定义放后面）
  return [...BASE_APP_CATALOG, ...customCatalog];
}

function normalizeExeName(filePathOrName) {
  // 支持传入 "C:\...\xxx.exe" 或 "xxx.exe"
  const s = String(filePathOrName || '').replaceAll('\\', '/');
  return s.split('/').pop(); // xxx.exe
}

function makeCustomId(exeName) {
  // custom_xxx_exe 这种稳定 id（避免冲突就加时间戳）
  const base = 'custom_' + exeName.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  if (!getCatalog().some(a => a.id === base)) return base;
  return base + '_' + Date.now();
}

function upsertCustomApp(exeName) {
  const name = normalizeExeName(exeName);
  if (!name) return null;

  // 如果内置里已经有这个 exe（比如 chrome.exe），不需要加自定义
  const existsInBase = BASE_APP_CATALOG.some(app =>
    (app.exeList || []).some(x => x.toLowerCase() === name.toLowerCase())
  );
  if (existsInBase) return null;

  // 自定义里按 exeName 去重
  let app = customCatalog.find(a =>
    (a.exeList || []).some(x => x.toLowerCase() === name.toLowerCase())
  );

  if (!app) {
    app = {
      id: makeCustomId(name),
      label: name.replace(/\.exe$/i, ''), // 默认 label 用文件名
      exeList: [name],
    };
    customCatalog.push(app);
    saveCustomCatalog();
  }

  return app;
}

function getExeNameFromPath(filePath) {
  if (!filePath) return '';
  const normalized = String(filePath || '').replace(/^"+|"+$/g, '').trim();
  if (!normalized) return '';
  const parts = normalized.split(/[/\\]+/);
  return parts[parts.length - 1] || '';
}

function extractFirstExeToken(rawValue) {
  const text = String(rawValue || '').trim();
  if (!text) return '';

  const quoted = text.match(/"([^"\r\n]*?\.exe)"/i);
  if (quoted?.[1]) {
    const fromQuoted = getExeNameFromPath(quoted[1]);
    if (/\.exe$/i.test(fromQuoted)) return fromQuoted;
  }

  const plain = text.match(/([^\s"'`<>|]+?\.exe)/i);
  if (plain?.[1]) {
    const fromPlain = getExeNameFromPath(plain[1]);
    if (/\.exe$/i.test(fromPlain)) return fromPlain;
  }

  return '';
}

function inferExeNameFromShortcutName(fileName) {
  const raw = String(fileName || '').trim().toLowerCase();
  if (!raw) return '';
  const stem = raw
    .replace(/\.lnk$/i, '')
    .replace(/\s*-\s*shortcut$/i, '')
    .replace(/\s*-\s*快捷方式$/i, '')
    .trim();

  if (stem.includes('chrome')) return 'chrome.exe';
  if (stem.includes('edge')) return 'msedge.exe';
  if (stem.includes('firefox')) return 'firefox.exe';
  if (stem.includes('brave')) return 'brave.exe';
  if (stem.includes('opera')) return 'opera.exe';
  return '';
}

function resolvePickedExeName(picked) {
  const candidateList = [
    picked?.resolvedExeName,
    picked?.targetPath,
    picked?.selectedPath,
    picked?.selectedName,
  ];

  for (const candidate of candidateList) {
    const resolved = extractFirstExeToken(candidate);
    if (resolved) return resolved;
  }

  const inferred = inferExeNameFromShortcutName(picked?.selectedName || picked?.selectedPath || '');
  return inferred;
}

function addPickedFileToWhitelist(picked, groupEl, inputEl, browseFile) {
  if (!picked || picked.canceled) return;
  if (picked.error) {
    console.warn('[Whitelist] Browse failed:', picked.error);
    if (browseFile) browseFile.value = '';
    return;
  }

  const exeName = resolvePickedExeName(picked);
  if (!/\.exe$/i.test(exeName)) {
    console.warn('[Whitelist] Could not resolve executable from selection:', picked);
    if (browseFile) browseFile.value = '';
    return;
  }

  const matched = findAppByExe(exeName);
  const custom = matched ? null : upsertCustomApp?.(exeName);
  const appId = matched?.id || custom?.id;

  if (appId) {
    addAppToSelection(appId);
    renderSelected(groupEl);
  }

  inputEl.value = '';
  renderResults(groupEl, '');

  if (browseFile) browseFile.value = '';
}

function findAppByExe(exeName) {
  const exeLower = String(exeName || '').toLowerCase();
  return getCatalog().find(app =>
    (app.exeList || []).some(exe => String(exe).toLowerCase() === exeLower)
  ) || null;
}

// 当前白名单选择（应用 + 网站）
let currentWhitelistSelection = {
  appIds: ['electron'],
  websites: [],
};
const ALWAYS_ALLOWED_APP_IDS = ['electron'];

function isAlwaysAllowedId(id) {
  return ALWAYS_ALLOWED_APP_IDS.includes(String(id || '').toLowerCase());
}

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeAppIds(ids) {
  const set = new Set((Array.isArray(ids) ? ids : []).filter(Boolean));
  ALWAYS_ALLOWED_APP_IDS.forEach((id) => set.add(id));
  return Array.from(set);
}

function normalizeWebsites(websites) {
  const normalized = [];
  const seen = new Set();
  (Array.isArray(websites) ? websites : []).forEach((site) => {
    const value = String(site || '').trim();
    if (!value) return;
    const key = value.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    normalized.push(value);
  });
  return normalized;
}

function normalizeSelection(selection) {
  // backward compatible: old shape is an array of app ids
  if (Array.isArray(selection)) {
    return {
      appIds: normalizeAppIds(selection.map(String)),
      websites: [],
    };
  }

  const appIds = normalizeAppIds((selection?.appIds || []).map(String));
  const websites = normalizeWebsites(selection?.websites || []);
  return { appIds, websites };
}

function loadSelection() {
  try {
    const raw = localStorage.getItem(WHITELIST_SELECTION_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return normalizeSelection(parsed);
  } catch {
    return normalizeSelection(currentWhitelistSelection);
  }
}

function saveSelection() {
  try {
    localStorage.setItem(WHITELIST_SELECTION_KEY, JSON.stringify(normalizeSelection(currentWhitelistSelection)));
  } catch {
    // ignore
  }
  scheduleFocusDefaultsSync();
}

function clampFocusGraceSeconds(v) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return DEFAULT_FOCUS_GRACE_SECONDS;
  return Math.max(MIN_FOCUS_GRACE_SECONDS, Math.min(MAX_FOCUS_GRACE_SECONDS, n));
}

function loadFocusGraceSecondsLocal() {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEYS.focusGraceSeconds);
    if (raw == null) return DEFAULT_FOCUS_GRACE_SECONDS;
    return clampFocusGraceSeconds(raw);
  } catch {
    return DEFAULT_FOCUS_GRACE_SECONDS;
  }
}

async function syncFocusDefaultsToBackend() {
  const body = {
    allowedProcesses: getAllowedProcesses(),
    allowedWebsites: [...(currentWhitelistSelection.websites || [])],
    graceSeconds: loadFocusGraceSecondsLocal(),
  };

  try {
    await fetch(`${API_BASE}/api/focus/defaults`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    // ignore sync failures; local selection remains source of truth for main UI
  }
}

function scheduleFocusDefaultsSync() {
  if (focusDefaultsSyncTimer) {
    clearTimeout(focusDefaultsSyncTimer);
  }
  focusDefaultsSyncTimer = setTimeout(() => {
    focusDefaultsSyncTimer = null;
    void syncFocusDefaultsToBackend();
  }, 180);
}

function findAppById(id) {
  return getCatalog().find(app => app.id === id) || null;
}

function searchApps(keyword) {
  const k = keyword.trim().toLowerCase();
  if (!k) return [];
  return getCatalog().filter(app =>
    !isAlwaysAllowedId(app.id) && (
      app.label.toLowerCase().includes(k) ||
      app.id.toLowerCase().includes(k) ||
      (app.exeList || []).some(x => x.toLowerCase().includes(k))
    )
  );
}

function getWebsiteInputHint(value) {
  const text = String(value || '').trim();
  if (!text) return '';

  if (/\s/.test(text)) {
    return 'Contains spaces. Check if this is a valid domain/URL.';
  }

  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text);
  const hostLike = /^(localhost|(\d{1,3}\.){3}\d{1,3}|[a-z0-9-]+(\.[a-z0-9-]+)+)(:\d+)?(\/.*)?$/i.test(text);
  if (hasScheme || hostLike) return '';

  return 'Looks unusual for a website, but you can still add it.';
}

/**
 * 渲染“已选应用”列表（#wlSelectedList）
 * @param {HTMLElement} rootEl - whitelistGroup 根节点
 */
function renderSelected(rootEl) {
  const listEl = rootEl.querySelector('#wlSelectedList');
  if (!listEl) return;

  const visibleApps = currentWhitelistSelection.appIds.filter((id) => !isAlwaysAllowedId(id));
  const visibleWebsites = currentWhitelistSelection.websites;

  if (!visibleApps.length && !visibleWebsites.length) {
    listEl.innerHTML = '<li class="wl-selected-empty">No apps/websites selected yet.</li>';
    return;
  }

  const appPills = visibleApps
    .map((id) => {
      const app = findAppById(id);
      const label = escapeHtml(app?.label || id);
      return `
        <li class="wl-pill" data-app-id="${id}">
          <span class="wl-pill-label">${label}</span>
          <button type="button"
                  class="wl-pill-remove"
                  data-remove-kind="app"
                  data-app-id="${id}">
            ×
          </button>
        </li>
      `;
    })
    .join('');

  const websitePills = visibleWebsites
    .map((website) => {
      const safeWebsite = escapeHtml(website);
      return `
        <li class="wl-pill wl-pill-website" data-website="${safeWebsite}">
          <span class="wl-pill-label">${safeWebsite}</span>
          <button type="button"
                  class="wl-pill-remove"
                  data-remove-kind="website"
                  data-website="${safeWebsite}">
            ×
          </button>
        </li>
      `;
    })
    .join('');

  listEl.innerHTML = `
    <li class="wl-selected-line">
      <span class="wl-selected-line-label">Apps:</span>
      <ul class="wl-line-list">${appPills || '<li class="wl-line-empty">None</li>'}</ul>
    </li>
    <li class="wl-selected-line">
      <span class="wl-selected-line-label">Websites:</span>
      <ul class="wl-line-list">${websitePills || '<li class="wl-line-empty">None</li>'}</ul>
    </li>
  `;
}

/**
 * 渲染搜索结果列表（#wlSearchResults）
 * @param {HTMLElement} rootEl
 * @param {string} keyword
 */
function renderResults(rootEl, keyword) {
  const resultsEl = rootEl.querySelector('#wlSearchResults');
  if (!resultsEl) return;

  const k = keyword.trim();
  if (!k) {
    resultsEl.innerHTML = '';
    return;
  }

  const matches = searchApps(k);
  const normalizedWebsite = k;
  const websiteHint = getWebsiteInputHint(normalizedWebsite);
  const websiteAlreadySelected = currentWhitelistSelection.websites
    .some((site) => site.toLowerCase() === normalizedWebsite.toLowerCase());

  const websiteOption = websiteAlreadySelected
    ? ''
    : `
      <div class="wl-result-item wl-result-item-website"
           data-result-type="website"
           data-website="${escapeHtml(normalizedWebsite)}">
        <div class="wl-result-name">Use website: ${escapeHtml(normalizedWebsite)}</div>
        <div class="wl-result-exe">Add this website to whitelist</div>
        ${websiteHint
          ? `<div class="wl-result-hint-warning">${escapeHtml(websiteHint)}</div>`
          : ''}
      </div>
    `;

  if (!matches.length && !websiteOption) {
    resultsEl.innerHTML =
      '<div class="wl-result-empty">No matching app or website option found.</div>';
    return;
  }

  const appItems = matches
    .map((app) => {
      const exes = app.exeList.join(', ');
      return `
        <div class="wl-result-item" data-app-id="${app.id}">
          <div class="wl-result-name">${escapeHtml(app.label)}</div>
          <div class="wl-result-exe">${escapeHtml(exes)}</div>
        </div>
      `;
    })
    .join('');

  resultsEl.innerHTML = `${websiteOption}${appItems}`;
}

function addAppToSelection(appId) {
  if (!appId || currentWhitelistSelection.appIds.includes(appId)) return false;
  currentWhitelistSelection.appIds.push(appId);
  currentWhitelistSelection = normalizeSelection(currentWhitelistSelection);
  saveSelection();
  return true;
}

function addWebsiteToSelection(rawWebsite) {
  const website = String(rawWebsite || '').trim();
  if (!website) return false;

  const exists = currentWhitelistSelection.websites
    .some((item) => item.toLowerCase() === website.toLowerCase());
  if (exists) return false;

  currentWhitelistSelection.websites.push(website);
  currentWhitelistSelection = normalizeSelection(currentWhitelistSelection);
  saveSelection();
  return true;
}

/**
 * 初始化白名单 UI：搜索 + 已选列表
 * @param {HTMLElement | null} groupEl - index.html 里的 #whitelistGroup
 */
export function initWhitelist(groupEl) {
  if (!groupEl) {
    console.warn('[Whitelist] initWhitelist called with null element');
    currentWhitelistSelection = normalizeSelection(currentWhitelistSelection);
    return;
  }

  const inputEl    = groupEl.querySelector('#wlSearchInput');
  const resultsEl  = groupEl.querySelector('#wlSearchResults');
  const selectedEl = groupEl.querySelector('#wlSelectedList');
  const browseBtn  = groupEl.querySelector('#wlBrowseBtn');
  const browseFile  = groupEl.querySelector('#wlBrowseFile');

  if (!inputEl || !resultsEl || !selectedEl) {
    console.warn('[Whitelist] Missing inner elements (input/results/selected list).');
    return;
  }

  currentWhitelistSelection = normalizeSelection(currentWhitelistSelection);
  currentWhitelistSelection = loadSelection();

  if (!focusDefaultsSyncBound) {
    focusDefaultsSyncBound = true;
    window.addEventListener('growin:focus-grace-seconds', () => {
      scheduleFocusDefaultsSync();
    });
  }

  scheduleFocusDefaultsSync();

  // 初始渲染：默认选中 electron
  renderSelected(groupEl);
  renderResults(groupEl, '');

  // 输入时实时搜索
  inputEl.addEventListener('input', () => {
    renderResults(groupEl, inputEl.value);
  });

  // Browse -> 选择 exe/lnk -> 加入白名单
  browseBtn?.addEventListener('click', async () => {
    const picker = window.electronAPI?.pickWhitelistAppFile;
    if (typeof picker === 'function') {
      try {
        const picked = await picker();
        addPickedFileToWhitelist(picked, groupEl, inputEl, browseFile);
        return;
      } catch (err) {
        console.warn('[Whitelist] IPC picker unavailable, fallback to file input:', err);
      }
    }

    // fallback: 触发隐藏 file input（非 Electron 环境）
    browseFile?.click();
  });

  browseFile?.addEventListener('change', () => {
    const file = browseFile.files?.[0];
    if (!file) return;
    addPickedFileToWhitelist({ selectedName: file.name }, groupEl, inputEl, browseFile);
  });



  // 点击搜索结果 -> 加入已选列表
  resultsEl.addEventListener('click', event => {
    const item = event.target.closest('.wl-result-item');
    if (!item) return;

    const resultType = item.getAttribute('data-result-type');
    if (resultType === 'website') {
      const website = item.getAttribute('data-website');
      if (website) {
        addWebsiteToSelection(website);
        renderSelected(groupEl);
      }
    } else {
      const appId = item.getAttribute('data-app-id');
      if (!appId) return;
      addAppToSelection(appId);
      renderSelected(groupEl);
    }

    // 模拟 Windows 搜索：点击后清空搜索框和结果
    inputEl.value = '';
    renderResults(groupEl, '');
  });

  // 点击已选列表里的 × 删除
  selectedEl.addEventListener('click', event => {
    const btn = event.target.closest('.wl-pill-remove');
    if (!btn) return;
    const removeKind = btn.getAttribute('data-remove-kind');

    if (removeKind === 'website') {
      const website = String(btn.getAttribute('data-website') || '').trim();
      if (!website) return;
      currentWhitelistSelection.websites = currentWhitelistSelection.websites
        .filter((site) => site.toLowerCase() !== website.toLowerCase());
    } else {
      const appId = btn.getAttribute('data-app-id');
      if (!appId) return;
      if (isAlwaysAllowedId(appId)) return;
      currentWhitelistSelection.appIds = currentWhitelistSelection.appIds
        .filter((id) => id !== appId);
    }

    currentWhitelistSelection = normalizeSelection(currentWhitelistSelection);
    saveSelection();

    renderSelected(groupEl);
  });
}

/**
 * 给后端用：返回 allowedProcesses（进程名数组）
 * @returns {string[]}
 */
export function getAllowedProcesses() {
  currentWhitelistSelection = normalizeSelection(currentWhitelistSelection);
  const exes = [];
  currentWhitelistSelection.appIds.forEach(id => {
    const app = findAppById(id);
    if (!app) return;
    app.exeList.forEach(exe => exes.push(exe));
  });
  // 去重
  return Array.from(new Set(exes));
}

export function getAllowedWebsites() {
  currentWhitelistSelection = normalizeSelection(currentWhitelistSelection);
  return [...currentWhitelistSelection.websites];
}

/**
 * 给存储 / 统计用：返回类似 "Google Chrome, Visual Studio Code" 的字符串
 * @returns {string}
 */
export function getWhitelistNote() {
  const visibleApps = currentWhitelistSelection.appIds.filter((id) => !isAlwaysAllowedId(id));
  const labels = visibleApps.map(id => {
    const app = findAppById(id);
    return app?.label || id;
  });
  const websites = currentWhitelistSelection.websites;
  const parts = [...labels, ...websites];
  return parts.join(', ');
}
