// 2026/03/25 edited by Zhecheng Xu
// Changes:
//  - Stabilize token value flash behavior to avoid layout jitter on unchanged updates.

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
  let lastValue = null;

  function showTokenGainBubble(amount) {
    const host = els.tokenChip || els.tokenValue?.closest?.('.token-chip');
    if (!host) return;

    const bubble = document.createElement('span');
    bubble.className = 'token-gain-bubble';
    bubble.textContent = `+${Math.max(0, Math.round(Number(amount) || 0))}`;
    host.appendChild(bubble);

    requestAnimationFrame(() => {
      bubble.classList.add('is-on');
    });
    setTimeout(() => {
      bubble.classList.remove('is-on');
      bubble.classList.add('is-off');
      setTimeout(() => bubble.remove(), 280);
    }, 980);
  }

  subscribeCredits((value) => {
    if (!els.tokenValue) return;
    const next = String(value);
    const changed = lastValue != null && next !== lastValue;
    els.tokenValue.textContent = next;
    if (changed) {
      els.tokenValue.classList.add("flash");
      setTimeout(() => els.tokenValue.classList.remove("flash"), 250);
    }
    lastValue = next;
  });

  window.addEventListener('growin:token-gain', (ev) => {
    const gain = Number(ev?.detail?.amount || 0);
    if (gain > 0) showTokenGainBubble(gain);
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
