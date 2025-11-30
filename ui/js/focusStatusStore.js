// 2025/11/18 edited by Jingyao
// 新增文件：focusStatusStore.js
// =============================================================
// 新增内容：
//   - 创建全新的全局状态存储模块（focusStatusStore.js），用于统一管理会话状态
// =============================================================
// 结构变化：
//   - 原本 widget 与 main timer 中的本地状态（isRunning、endTs、remainingMs）
//     移动至 store，由 store 统一管理，UI 侧不再自行维护这些字段。
//   - 所有 Start / Stop / 失败 / 违规状态更新都经过 store → UI 自动刷新。
//   - main timer、widget、未来的 monitor 区域全部基于同一个状态源，
//     实现完全一致的行为表现。
// =============================================================

// 2025/11/30 edited by Jingyao
// 新增内容：
//   - 和preload.js联通，使timer可以跨窗口同步
// =============================================================

// 跨窗口可共享的状态仓库：保持原 API 不变
const listeners = new Set();

let state = {
  isRunning: false,
  remainingSeconds: 0,
  isFailed: false,
  isViolating: false,
  violationSeconds: 0,
  currentProcess: null,
  failReason: null,
};

// BroadcastChannel：多窗口同步（Electron/现代浏览器都支持）
let chan = null;
try {
  chan = new BroadcastChannel('focus-status');
  chan.addEventListener('message', (ev) => {
    const next = ev.data || {};
    state = { ...state, ...next };
    for (const fn of listeners) fn({ ...state });
  });
} catch (e) {
  // 某些环境不支持就忽略
}

// Electron IPC 兜底（preload.js 暴露的桥）
if (typeof window !== 'undefined' && window.electronAPI?.onFocusStatus) {
  window.electronAPI.onFocusStatus((st) => {
    state = { ...state, ...st };
    for (const fn of listeners) fn({ ...state });
  });
}

export function setFocusStatus(partial) {
  state = { ...state, ...partial };
  for (const fn of listeners) fn({ ...state });

  // 广播给其它窗口
  try { chan?.postMessage(state); } catch (_) {}
  try { window.electronAPI?.emitFocusStatus?.(state); } catch (_) {}
}

export function getFocusStatus() {
  return { ...state };
}

export function subscribeFocusStatus(fn) {
  listeners.add(fn);
  fn({ ...state });
  return () => listeners.delete(fn);
}
