// js/nav.js
import { renderStats } from './stats.js';

export function mountNav({
  btnTimer,
  btnStats,
  viewTimer,
  viewStats,
  statsEls,
  chartRef,
}) {
  // 防御一下：元素没拿到就直接返回
  if (!btnTimer || !btnStats || !viewTimer || !viewStats) return;

  const allBtns = [btnTimer, btnStats];
  const allViews = [viewTimer, viewStats];

  function setActive(btn, view) {
    // 视图切换
    allViews.forEach(v => {
      if (!v) return;
      v.style.display = (v === view) ? 'block' : 'none';
    });

    // 左侧按钮激活样式
    allBtns.forEach(b => {
      if (!b) return;
      b.classList.toggle('active', b === btn);
      b.setAttribute('aria-current', b === btn ? 'page' : 'false');
    });

    // 如果切到统计视图，顺便刷新统计
    if (view === viewStats) {
      renderStats({ els: statsEls, chartRef });
    }
  }

  // 事件绑定
  btnTimer.addEventListener('click', () => setActive(btnTimer, viewTimer));
  btnStats.addEventListener('click', () => setActive(btnStats, viewStats));

  // 默认显示 Timer 视图并高亮 Timer 按钮
  setActive(btnTimer, viewTimer);
}
