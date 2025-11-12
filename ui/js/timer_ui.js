// js/timer-ui.js

import { clampMins, fmt, showToast, notifySystem } from './utils.js';
import { saveSession } from './storage.js';
import { renderStats } from './stats.js';

/**
 * 把计时器 UI 相关逻辑封装到一个函数里
 * renderer.js 只需要把 DOM 元素传进来就行
 */
export function mountTimer({
  display,
  startBtn,
  resetBtn,
  range,
  out,
  noteInput,
  focusLast,
  toastEl,
  viewStats,
  statsEls,
  chartRef,
}) {

// ===== state (Timer) =====
let endTs = null;        // 结束时间戳（ms）
let tick = null;         // setInterval 句柄
let paused = true;       // 是否暂停/未运行
let remainingMs = 0;     // 暂停时剩余（ms）
let lastStartedMins = 0; // 本次计时起始设定（用于完成显示）

function updatePreview() {
  if (paused && !endTs) {
    const mins = clampMins(Number(range.value || 25));
    display.textContent = fmt(mins * 60 * 1000);
    if (out) out.value = `${mins} min`;
  }
}

// ===== timer core =====
function startOrResume() {
  const now = Date.now();

  if (!endTs) {
    if (remainingMs <= 0) {
      lastStartedMins = clampMins(Number(range.value || 25));
      remainingMs = lastStartedMins * 60 * 1000;
    }
    endTs = now + remainingMs;
  }

  paused = false;
  range.disabled = true;
  startBtn.textContent = 'Pause';
  resetBtn.style.display = 'none';

  if (tick) clearInterval(tick);
  tick = setInterval(() => {
    const left = endTs - Date.now();
    display.textContent = fmt(left);

    if (left <= 0) {
      clearInterval(tick);
      tick = null;
      paused = true;
      endTs = null;
      remainingMs = 0;
      range.disabled = false;
      startBtn.textContent = 'Start';
      resetBtn.style.display = 'none';
      updatePreview();

      // 记录本次完成
      const note = noteInput?.value || '';
      saveSession(lastStartedMins, note);
      if (focusLast) focusLast.textContent = `${lastStartedMins} min`;

      /* showToast(`Session complete: ${lastStartedMins} min ✅`);
      notifySystem('Focus session complete', `${lastStartedMins} minutes`);

      // 如果当前在 Statistics 视图，刷新图表
      if (viewStats.style.display !== 'none') renderStats(); */
      
      showToast(toastEl, `Session complete: ${lastStartedMins} min ✅`);
      notifySystem('Focus session complete', `${lastStartedMins} minutes`);

      // 如果当前在 Statistics 视图，刷新图表
      if (viewStats && viewStats.style.display !== 'none') {
        renderStats({ els: statsEls, chartRef });
}

    }
  }, 200);
}

function pause() {
  if (!endTs) return;
  remainingMs = Math.max(0, endTs - Date.now());
  clearInterval(tick);
  tick = null;
  endTs = null;
  paused = true;

  startBtn.textContent = 'Resume';
  resetBtn.style.display = 'inline-block';
  range.disabled = false; // 暂停时允许修改时长
}

function resetCountdown() {
  clearInterval(tick);
  tick = null;
  endTs = null;
  paused = true;
  remainingMs = 0;

  startBtn.textContent = 'Start';
  resetBtn.style.display = 'none';
  range.disabled = false;
  updatePreview();
}

// ===== events =====
range?.addEventListener('input', updatePreview);
startBtn?.addEventListener('click', () => {
  if (!paused) pause(); else startOrResume();
});
resetBtn?.addEventListener('click', resetCountdown);

  // ===== init =====
if (range) {
  range.min = '1';
  range.max = '60';
  range.value = String(clampMins(Number(range.value || 25)));
}
updatePreview();
}
