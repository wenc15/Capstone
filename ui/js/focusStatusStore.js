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


// focusStatusStore.js
const listeners = new Set();

let state = {
  isRunning: false,
  remainingSeconds: 0,
  isFailed: false,
  isViolating: false,
  violationSeconds: 0,
  currentProcess: null,
};

// 由 timer UI 调用：更新状态
export function setFocusStatus(partial) {
  state = { ...state, ...partial };
  for (const fn of listeners) {
    fn({ ...state });
  }
}

// widget / timer UI 都可以读当前状态
export function getFocusStatus() {
  return { ...state };
}

// widget / timer UI 都可以订阅状态变化
export function subscribeFocusStatus(fn) {
  listeners.add(fn);
  fn({ ...state }); // 先推一次当前状态
  return () => listeners.delete(fn);
}
