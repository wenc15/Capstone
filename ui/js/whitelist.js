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
let customCatalog = loadCustomCatalog();

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
  const parts = filePath.split(/[/\\]+/);
  return parts[parts.length - 1] || '';
}

function findAppByExe(exeName) {
  const exeLower = String(exeName || '').toLowerCase();
  return getCatalog().find(app =>
    (app.exeList || []).some(exe => String(exe).toLowerCase() === exeLower)
  ) || null;
}

// 当前选中的应用，用 id 表示（例如 ["chrome", "code"]）
let currentWhitelistApps = ['electron'];  // 默认至少包含 Electron，避免白名单为空

function findAppById(id) {
  return getCatalog().find(app => app.id === id) || null;
}

function searchApps(keyword) {
  const k = keyword.trim().toLowerCase();
  if (!k) return [];
  return getCatalog().filter(app =>
    app.label.toLowerCase().includes(k) ||
    app.id.toLowerCase().includes(k) ||
    (app.exeList || []).some(x => x.toLowerCase().includes(k))
  );
}

/**
 * 渲染“已选应用”列表（#wlSelectedList）
 * @param {HTMLElement} rootEl - whitelistGroup 根节点
 */
function renderSelected(rootEl) {
  const listEl = rootEl.querySelector('#wlSelectedList');
  if (!listEl) return;

  if (!currentWhitelistApps.length) {
    listEl.innerHTML = '<li class="wl-selected-empty">No apps selected yet.</li>';
    return;
  }

  listEl.innerHTML = currentWhitelistApps
    .map(id => {
      const app = findAppById(id);
      const label = app?.label || id;
      return `
        <li class="wl-pill" data-app-id="${id}">
          <span class="wl-pill-label">${label}</span>
          <button type="button"
                  class="wl-pill-remove"
                  data-app-id="${id}">
            ×
          </button>
        </li>
      `;
    })
    .join('');
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
  if (!matches.length) {
    resultsEl.innerHTML =
      '<div class="wl-result-empty">No apps found. Try another keyword.</div>';
    return;
  }

  resultsEl.innerHTML = matches
    .map(app => {
      const exes = app.exeList.join(', ');
      return `
        <div class="wl-result-item" data-app-id="${app.id}">
          <div class="wl-result-name">${app.label}</div>
          <div class="wl-result-exe">${exes}</div>
        </div>
      `;
    })
    .join('');
}

/**
 * 初始化白名单 UI：搜索 + 已选列表
 * @param {HTMLElement | null} groupEl - index.html 里的 #whitelistGroup
 */
export function initWhitelist(groupEl) {
  if (!groupEl) {
    console.warn('[Whitelist] initWhitelist called with null element');
    currentWhitelistApps = ['electron'];
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

  // 初始渲染：默认选中 electron
  renderSelected(groupEl);
  renderResults(groupEl, '');

  // 输入时实时搜索
  inputEl.addEventListener('input', () => {
    renderResults(groupEl, inputEl.value);
  });

  // Browse -> 选择 exe -> 加入白名单（只取 file.name）
  browseBtn?.addEventListener('click', () => {
    // 触发隐藏的 file input，会弹出系统选择器
    browseFile?.click();
  });

  browseFile?.addEventListener('change', () => {
    const file = browseFile.files?.[0];
    if (!file) return;

    const exeName = file.name; // ✅ 只要 exe 名就够了
    if (!/\.exe$/i.test(exeName)) {
      console.warn('[Whitelist] Not an exe:', exeName);
      browseFile.value = '';
      return;
    }

    // 1) 记录到“自定义库”（推荐：存 localStorage，方便下次还能搜到）
    const custom = upsertCustomApp?.(exeName); // 如果你写了 upsertCustomApp
    // 如果你没做持久化，也可以直接用 exeName 创建一个临时 id：
    const appId = custom?.id || `custom_${exeName.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;

    // 2) 选中它
    if (!currentWhitelistApps.includes(appId)) {
      currentWhitelistApps.push(appId);
      renderSelected(groupEl);
    }

    // 3) 清空搜索 & 结果（保持你原来的体验）
    inputEl.value = '';
    renderResults(groupEl, '');

    // 4) 允许下次选择同一个文件也触发 change
    browseFile.value = '';
  });



  // 点击搜索结果 -> 加入已选列表
  resultsEl.addEventListener('click', event => {
    const item = event.target.closest('.wl-result-item');
    if (!item) return;
    const appId = item.getAttribute('data-app-id');
    if (!appId) return;

    if (!currentWhitelistApps.includes(appId)) {
      currentWhitelistApps.push(appId);
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
    const appId = btn.getAttribute('data-app-id');
    if (!appId) return;

    currentWhitelistApps = currentWhitelistApps.filter(id => id !== appId);

    // 安全起见：若全删光了，回到默认 electron，避免后端白名单为空
    if (!currentWhitelistApps.length) {
      currentWhitelistApps = ['electron'];
    }

    renderSelected(groupEl);
  });
}

/**
 * 给后端用：返回 allowedProcesses（进程名数组）
 * @returns {string[]}
 */
export function getAllowedProcesses() {
  const exes = [];
  currentWhitelistApps.forEach(id => {
    const app = findAppById(id);
    if (!app) return;
    app.exeList.forEach(exe => exes.push(exe));
  });
  // 去重
  return Array.from(new Set(exes));
}

/**
 * 给存储 / 统计用：返回类似 "Google Chrome, Visual Studio Code" 的字符串
 * @returns {string}
 */
export function getWhitelistNote() {
  if (!currentWhitelistApps.length) return '';
  const labels = currentWhitelistApps.map(id => {
    const app = findAppById(id);
    return app?.label || id;
  });
  return labels.join(', ');
}
