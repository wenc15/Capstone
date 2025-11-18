// js/timer-ui.js

import { clampMins, fmt, showToast, notifySystem } from './utils.js';
import { saveSession } from './storage.js';
import { renderStats } from './stats.js';

export function mountTimer(els) {
  const {
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
    chartRef
  } = els;

  // ===== Backend config（改成真实后端） =====
  const API_BASE = 'http://localhost:5024'; // 改成你 dotnet run 的实际端口

  /**
   * 在后端创建一个新的专注 Session（只在“新一轮 Start”时调用）
   * @param {number} durationMinutes - 前端当前设定的分钟数
   */
  async function createBackendSession(durationMinutes) {
    const durationSeconds = Math.max(1, Math.round(durationMinutes * 60));

    // TODO：后面接你真正的白名单 UI。现在先写死做联调测试。
    const allowedProcesses = ['chrome.exe', 'notepad.exe'];

    const body = {
      durationSeconds,
      allowedProcesses,
      graceSeconds: 10, // 先写死，等你需要再做 UI 配置
    };

    const res = await fetch(`${API_BASE}/api/focus/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      let msg = '';
      try {
        const text = await res.text();
        msg = text || '';
      } catch {
        // ignore
      }
      throw new Error(msg || `Start failed: ${res.status}`);
    }

    // 目前后端没返回任何 JSON，就不解析了
    return;
  }

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

startBtn?.addEventListener('click', async () => {
  // 1. 如果当前正在跑 → 还是跟以前一样，变成 Pause
  if (!paused) {
    pause();
    return;
  }

  // 2. paused === true 的时候，说明是 Start 或 Resume
  //    我们只在“真正开始一轮新计时”的时候打后端：
  //    条件：没有 endTs 且 remainingMs <= 0
  if (!endTs && remainingMs <= 0) {
    try {
      // 这里的分钟数和你 startOrResume 里保持一致
      const mins = clampMins(Number(range.value || 25));
      // 调用后端创建 session（只负责记录）
      await createBackendSession(mins);
      // 如果后端返回 startAt/endAt，将来可以改用后端时间做倒计时
    } catch (err) {
      console.error('Start session via backend failed:', err);
      alert('启动专注失败（后端），请稍后再试');
      return; // 后端失败就不要启动前端计时了（你也可以选择照样本地计时）
    }
  }

  // 3. 无论是 新 Start（已成功通知后端）还是 Resume（不再打后端），
  //    都走你原本的前端计时逻辑
  startOrResume();
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
