// 2026/1/22 created by Jingyao Sun
// 新增内容：
//   - 前端 Credits 状态管理模块（原生 JS）。
//   - 提供 refreshCredits() 用于从后端同步点数。
// =============================================================
// 作用补充：
//   - 作为 UI Token 显示的单一数据源。
//   - 供 renderer.js 在 Session 成功完成时调用。
//   - 不引入任何前端框架或状态库。
// 2026/1/28 Updated by Zhecheng Xu:
// 新增内容：
//   - 增加 addCredits() / consumeCredits()：由 store 统一调用后端加/减点数。
//   - 增加并发保护（in-flight guard）：避免 refreshCredits() 重复并发请求导致状态抖动。
//   - 增加 getCreditsSnapshot()：便于在不订阅的情况下读取当前点数缓存。
// =============================================================
// 作用补充：
//   - 作为 UI Token 显示的单一数据源（single source of truth）。
//   - UI 不再直接调用 /api/credits/*，统一通过 creditsStore 读写点数，减少重复代码与状态不一致。
//   - 供 renderer.js（例如 Session 成功结束）与 store/store.js（例如购买/抽卡）调用后自动更新显示。
//   - 不引入任何前端框架或状态库，保持原生 JS 轻量实现。


import { getCredits, addCredits as apiAddCredits, consumeCredits as apiConsumeCredits } from "./creditsApi.js";

let credits = 0;
const listeners = [];

// Prevent overlapping refresh calls (optional but helpful)
let refreshPromise = null;

function notify() {
  listeners.forEach((fn) => {
    try {
      fn(credits);
    } catch (e) {
      console.warn("[creditsStore] listener error:", e);
    }
  });
}

export function getCreditsSnapshot() {
  return credits;
}

export function subscribeCredits(fn) {
  listeners.push(fn);
  // immediate push
  fn(credits);

  // return unsubscribe for hygiene
  return () => {
    const idx = listeners.indexOf(fn);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}

export async function refreshCredits() {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const value = await getCredits();
    credits = typeof value === "number" ? value : 0;
    notify();
    return credits;
  })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

// Mutations (so UI doesn't call API directly)
export async function addCredits(amount) {
  const value = await apiAddCredits(amount);
  credits = typeof value === "number" ? value : credits;
  notify();
  return credits;
}

export async function consumeCredits(amount) {
  const value = await apiConsumeCredits(amount);
  credits = typeof value === "number" ? value : credits;
  notify();
  return credits;
}
