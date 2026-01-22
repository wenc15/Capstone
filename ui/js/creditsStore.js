// 2026/1/22 created by Jingyao Sun
// 新增内容：
//   - 前端 Credits 状态管理模块（原生 JS）。
//   - 提供 refreshCredits() 用于从后端同步点数。
// =============================================================
// 作用补充：
//   - 作为 UI Token 显示的单一数据源。
//   - 供 renderer.js 在 Session 成功完成时调用。
//   - 不引入任何前端框架或状态库。

import { getCredits } from "./creditsApi.js";

let credits = 0;
const listeners = [];

export async function refreshCredits() {
  credits = await getCredits();
  listeners.forEach((fn) => fn(credits));
}

export function subscribeCredits(fn) {
  listeners.push(fn);
  fn(credits); // 立即推一次当前值
}
