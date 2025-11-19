// 11.19 added by Jingyao Sun
// session_summary.js
// 作用：更新首页卡片里的「Session Summary」——只改 Focus Time 和 Distractions。
//   - Focus Time: 当前刚结束的 session 时长（分钟，至少 1）
//   - Distractions: 如因非白名单程序自动失败 → 显示那个程序名；否则显示 "—"

export function updateSessionSummary({ minutes, distractedApp }) {
  const focusEl = document.getElementById('sumFocusTime');
  const distEl = document.getElementById('sumDistractions');

  // 1) Focus Time
  if (focusEl) {
    let m = Number.isFinite(minutes) ? Math.round(minutes) : 0;
    if (m < 0) m = 0;
    // 允许 0 → 直接显示 "0 min"
    focusEl.textContent = `${m} min`;
  }

  // 2) Distractions
  if (distEl) {
    if (distractedApp && distractedApp.trim()) {
      distEl.textContent = distractedApp.trim();
    } else {
      distEl.textContent = '—';
    }
  }

  // 注意：Cards（sumCards）完全不动，保持 index.html 里的硬写内容。
}
