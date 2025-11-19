// js/whitelist.js
// 11.19 created by Claire (Qinquan) Wang
// Responsibility:
//  - Manage the "whitelist" UI (checkbox group inside #whitelistGroup).
//  - Keep track of selected apps (multi-select).
//  - Provide helper functions for backend payloads and notes.

// js/whitelist.js
// 11.19 updated by Jingyao
// Responsibility:
//  - Search-based whitelist UI (like Windows search).
//  - Manage selected apps list.
//  - Provide helper functions for backend payloads and notes.
//
// 外部使用：
//   import { initWhitelist, getAllowedProcesses, getWhitelistNote } from './whitelist.js';
//
//   initWhitelist(whitelistGroup);
//   const processes = getAllowedProcesses(); // -> ["chrome.exe", "Code.exe", ...]


// 预置应用“库”，类似 Windows 搜索到的常见应用列表。
const APP_CATALOG = [
  { id: 'chrome', label: 'Google Chrome',       exeList: ['chrome.exe'] },
  { id: 'edge',   label: 'Microsoft Edge',      exeList: ['msedge.exe'] },
  { id: 'code',   label: 'Visual Studio Code',  exeList: ['Code.exe', 'code.exe'] },
  { id: 'word',   label: 'Microsoft Word',      exeList: ['WINWORD.EXE'] },
  { id: 'ppt',    label: 'PowerPoint',          exeList: ['POWERPNT.EXE'] },
];

// 当前选中的应用，用 id 表示（例如 ["chrome", "code"]）
let currentWhitelistApps = ['chrome'];  // 默认至少包含 Chrome，避免白名单为空

function findAppById(id) {
  return APP_CATALOG.find(app => app.id === id) || null;
}

function searchApps(keyword) {
  const k = keyword.trim().toLowerCase();
  if (!k) return [];
  return APP_CATALOG.filter(app =>
    app.label.toLowerCase().includes(k) ||
    app.id.toLowerCase().includes(k)
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
    currentWhitelistApps = ['chrome'];
    return;
  }

  const inputEl    = groupEl.querySelector('#wlSearchInput');
  const resultsEl  = groupEl.querySelector('#wlSearchResults');
  const selectedEl = groupEl.querySelector('#wlSelectedList');

  if (!inputEl || !resultsEl || !selectedEl) {
    console.warn('[Whitelist] Missing inner elements (input/results/selected list).');
    return;
  }

  // 初始渲染：默认选中 chrome
  renderSelected(groupEl);
  renderResults(groupEl, '');

  // 输入时实时搜索
  inputEl.addEventListener('input', () => {
    renderResults(groupEl, inputEl.value);
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

    // 安全起见：若全删光了，回到默认 chrome，避免后端白名单为空
    if (!currentWhitelistApps.length) {
      currentWhitelistApps = ['chrome'];
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
