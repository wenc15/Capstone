// js/gacha.js
// 2026/01/28 created by Zhecheng Xu
// Changes:
//  - A-version (stable): keep all gacha DOM structure in index.html.
//  - Only bind events + update UI state in JS (NO innerHTML rendering).
//  - Avoid duplicate event listeners when navigating multiple times.
// =============================================================
// Purpose:
//  - Own gacha view behavior (single draw / 10x draw).
//  - Provide a clean place to later connect credits + gacha backend APIs.
//  - Keep UI stable by relying on static HTML nodes.

import { refreshCredits } from './creditsStore.js';
import { showToast } from './utils.js'; // 如果你没有 utils.js 或 showToast，就把相关行注释掉

let mounted = false;

export function mountGacha(els) {
  if (mounted) return; // 防止重复绑定
  mounted = true;

  if (!els) {
    console.warn('[Gacha] mountGacha called without els');
    return;
  }

  const { viewGacha, toastEl } = els;

  if (!viewGacha) {
    console.warn('[Gacha] Missing viewGacha in els');
    return;
  }

  // 直接从现有 HTML 里取按钮
  const singleBtn = viewGacha.querySelector('#gachaSingleBtn');
  const tenBtn    = viewGacha.querySelector('#gachaTenBtn');

  if (!singleBtn || !tenBtn) {
    console.warn('[Gacha] Missing gacha buttons. Check index.html ids: gachaSingleBtn, gachaTenBtn');
    return;
  }

  // 可选：如果你希望按钮看起来更像“绿色主题按钮”
  // 你可以在 CSS 里把 .gacha-btn 默认就做成绿色，这里不强制改 class。

  // 绑定事件：Single Draw
  singleBtn.addEventListener('click', async () => {
    // 先占位：后面接你的 gacha API
    console.log('[Gacha] Single draw clicked');

    // 可选：先刷新一下 credits（保证 token 显示是最新）
    try {
      await refreshCredits();
    } catch (e) {
      console.warn('[Gacha] refreshCredits failed:', e);
    }

    // 提示
    try {
      showToast(toastEl, 'Single Draw clicked (placeholder).');
    } catch {
      // 没有 toast 也没关系
    }
  });

  // 绑定事件：10x Draw
  tenBtn.addEventListener('click', async () => {
    console.log('[Gacha] Ten draw clicked (guarantee adv food later)');

    try {
      await refreshCredits();
    } catch (e) {
      console.warn('[Gacha] refreshCredits failed:', e);
    }

    try {
      showToast(toastEl, '10x Draw clicked (Adv. pet food guaranteed placeholder).');
    } catch {
      // ignore
    }
  });
}

/**
 * 在你切换到 Gacha 页面时调用（可选）
 * 用途：每次进入 gacha view 做一次轻量刷新（比如刷新 token、按钮状态）
 * 注意：这里不要重复 addEventListener
 */
export async function onEnterGacha(els) {
  if (!els?.viewGacha) return;

  // 后面接后端时，你可以在这里做：
  // - refreshCredits()
  // - 拉取 “奖券数量 / 抽卡券数量”
  // - 根据余额禁用按钮
  try {
    await refreshCredits();
  } catch (e) {
    console.warn('[Gacha] onEnterGacha refreshCredits failed:', e);
  }
}

/**
 * 可选：如果你以后想做“按钮禁用/loading”，可以用这个
 */
export function setGachaButtonsEnabled(els, enabled) {
  const root = els?.viewGacha;
  if (!root) return;

  const singleBtn = root.querySelector('#gachaSingleBtn');
  const tenBtn    = root.querySelector('#gachaTenBtn');

  if (singleBtn) singleBtn.disabled = !enabled;
  if (tenBtn) tenBtn.disabled = !enabled;
}
