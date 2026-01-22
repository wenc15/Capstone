// 2026.1.22 created by JS
// 新增内容：
//   - Token 显示层挂载逻辑：订阅 creditsStore 并更新 DOM。
//   - 提供轻量视觉反馈（flash）。
// =============================================================
// 作用补充：
//   - 将 Token 的 UI 更新与 renderer.js 解耦，保持入口文件简洁。
//   - 数据请求在 creditsApi/creditsStore，UI 更新在 token_ui。

import { refreshCredits, subscribeCredits } from "./creditsStore.js";

export function mountToken(els) {
  subscribeCredits((value) => {
    if (!els.tokenValue) return;
    els.tokenValue.textContent = String(value);
    els.tokenValue.classList.add("flash");
    setTimeout(() => els.tokenValue.classList.remove("flash"), 250);
  });

  // app 启动时拉一次真实后端数据
  refreshCredits();
}
