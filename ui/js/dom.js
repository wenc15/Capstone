// js/dom.js

export function collectDom() {
  // ===== Timer 部分 =====
  const display    = document.getElementById('timerDisplay');
  const startBtn   = document.getElementById('startBtn');
  const resetBtn   = document.getElementById('resetBtn');
  const range      = document.getElementById('timeRange');
  const out        = document.getElementById('timeValue');
  const noteInput  = document.getElementById('sessionNote');
  const focusLast  = document.getElementById('focusLast');
  const toastEl    = document.getElementById('doneToast');

  // ===== 视图切换部分 =====
  const viewTimer  = document.getElementById('view-timer');
  const viewStats  = document.getElementById('view-stats');
  const navTimer   = document.getElementById('navTimer');
  const navStats   = document.getElementById('navStats');

  // ===== Stats 部分 =====
  const statCount    = document.getElementById('statCount');
  const statTotal    = document.getElementById('statTotal');
  const statLastNote = document.getElementById('statLastNote');
  const chartCanvas  = document.getElementById('focusChart');

  return {
    // Timer
    display, startBtn, resetBtn, range, out, noteInput, focusLast, toastEl,

    // Views & Nav
    viewTimer, viewStats, navTimer, navStats,

    // Stats
    statCount, statTotal, statLastNote, chartCanvas,

    // 统计图表实例容器
    chartRef: { current: null },

    // 统计用的对象结构（方便传给 renderStats）
    statsEls: { statCount, statTotal, statLastNote, chartCanvas }
  };
}
