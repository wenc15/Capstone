// 2026.1.22 created by JS
// 新增内容：
//   - Token 显示层挂载逻辑：订阅 creditsStore 并更新 DOM。
//   - 提供轻量视觉反馈（flash）。
// =============================================================
// 作用补充：
//   - 将 Token 的 UI 更新与 renderer.js 解耦，保持入口文件简洁。
//   - 数据请求在 creditsApi/creditsStore，UI 更新在 token_ui。
//
// 2026/03/14 edited by JS
// Changes:
//  - Add a small test button in topbar to +1000 tokens.

import { addCredits, refreshCredits, subscribeCredits } from "./creditsStore.js";
import { showToast } from "./utils.js";

export function mountToken(els) {
  subscribeCredits((value) => {
    if (!els.tokenValue) return;
    els.tokenValue.textContent = String(value);
    els.tokenValue.classList.add("flash");
    setTimeout(() => els.tokenValue.classList.remove("flash"), 250);
  });

  // Test helper: +1000 tokens
  if (els.tokenAdd1000Btn) {
    let inFlight = false;
    els.tokenAdd1000Btn.addEventListener("click", async () => {
      if (inFlight) return;
      inFlight = true;
      els.tokenAdd1000Btn.disabled = true;

      try {
        await addCredits(1000);
        showToast(els.toastEl, "+1000 tokens");
      } catch (e) {
        const msg = e?.body?.message || e?.message || "Failed to add tokens.";
        showToast(els.toastEl, msg);
        try {
          await refreshCredits();
        } catch {
          // ignore
        }
      } finally {
        els.tokenAdd1000Btn.disabled = false;
        inFlight = false;
      }
    });
  }

  // app 启动时拉一次真实后端数据
  refreshCredits();
}
