/*11.18 edited by Jingyao:
// 新增内容：
//   - 新增后端基础地址常量 API_BASE，用于集中配置 .NET 后端服务 URL。
//   - 新增 createBackendSession(durationMinutes) 方法，封装调用 POST /api/focus/start 的逻辑，
//     统一构造 durationSeconds / allowedProcesses / graceSeconds 请求体。
//   - 调整 Start 按钮点击事件：在启动本地倒计时前，先 await createBackendSession(...)，
//     确保每次前端 Start 对应一次后端 Session，失败时中断前端计时并重置。
//   - 移除 pause / resume 相关按钮与状态字段，仅保留 Start / Stop 两态逻辑，减少与后端状态模型不一致的部分。
// 新增的结构变化：
//   - timer_ui.js 顶部增加「后端配置区」（API_BASE + createBackendSession），计时逻辑仍封装在
//     mountTimer 内部，对外导出 API 不变。
//   - Start 按钮事件现在变为「后端 Start 成功 → 本地 startCountdown()」，后端返回非 2xx 时不会
//     再进入倒计时状态，避免前后端状态不一致。
//   - 与后端的会话参数（durationSeconds / allowedProcesses / graceSeconds）集中收敛在
//     createBackendSession 内部，避免分散在多个事件处理函数中，方便后续统一维护与扩展。*/
import { setFocusStatus } from './focusStatusStore.js';

import { clampMins, fmt, showToast, notifySystem } from './utils.js';
import { saveSession } from './storage.js';
import { renderStats } from './stats.js';

export function mountTimer(els) {
  const {
    display,
    startBtn,
    stopBtn,
    range,
    out,
    noteInput,
    focusLast,
    toastEl,
    viewStats,
    statsEls,
    chartRef
  } = els;

  // ===== Backend config（使用真实后端接口）=====
  const API_BASE = 'http://localhost:5024'; // ← 这里改成 dotnet run 打印的那个地址

  /**
   * 在后端创建一个新的专注 Session（只在“新一轮 Start”时调用）
   * @param {number} durationMinutes - 前端当前设定的分钟数
   */
  async function createBackendSession(durationMinutes) {
    const durationSeconds = Math.max(1, Math.round(durationMinutes * 60));

    // TODO：后面接你的白名单 UI，现在先写死几个进程名做联调
    const allowedProcesses = ['chrome.exe', 'notepad.exe'];

    const body = {
      durationSeconds,
      allowedProcesses,
      graceSeconds: 10, // 先写死，之后需要再做设置项
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
        if (text) msg = text;
      } catch {
        // ignore
      }
      throw new Error(msg || `Start failed: ${res.status}`);
    }

    // 后端现在没返回 JSON，就不解析了
    return;
  }

  /* 11.18 Jingyao Sun: Add stop session */
    /**
   * 告诉后端「我手动结束这次专注」
   */
  async function stopBackendSession() {
    const res = await fetch(`${API_BASE}/api/focus/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'  // 可以留空，但带个空对象最保险
    });

    if (!res.ok) {
      let msg = '';
      try {
        const text = await res.text();
        if (text) msg = text;
      } catch {
        // ignore
      }
      throw new Error(msg || `Stop failed: ${res.status}`);
    }
  }


  // ===== state (Timer) =====
  let endTs = null;        // 结束时间戳（ms）
  let tick = null;         // setInterval 句柄
  let isRunning = false;   // 当前是否正在计时
  let remainingMs = 0;     // 剩余时间（ms）
  let lastStartedMins = 0; // 本次计时起始设定（用于完成显示）



  // 把当前前端 timer 的状态同步到共享 store，给 widget 用
  function broadcastState(msOverride) {
    const running = isRunning && !!endTs;
    const msLeft = typeof msOverride === 'number'
      ? msOverride
      : (running ? Math.max(0, endTs - Date.now()) : remainingMs);

    setFocusStatus({
      isRunning: running,
      remainingSeconds: Math.max(0, Math.round(msLeft / 1000)),
      isFailed: false,
      isViolating: false,
      violationSeconds: 0,
      currentProcess: null,
    });
  }


  function updatePreview() {
    if (isRunning && !endTs) {
      const mins = clampMins(Number(range.value || 25));
      display.textContent = fmt(mins * 60 * 1000);
      if (out) out.value = `${mins} min`;

      remainingMs = mins * 60 * 1000;
      broadcastState(); // 预览时顺便同步给 widget
    }
  }

  // ===== timer core =====
  function startCountdown() {
    const now = Date.now();

    // 每次 Start 都从当前滑条重新开始一轮
    lastStartedMins = clampMins(Number(range.value || 25));
    remainingMs = lastStartedMins * 60 * 1000;
    endTs = now + remainingMs;

    isRunning = true;
    range.disabled = true;
    stopBtn.style.display = 'inline-block';   // 跑起来时显示 Stop

    if (tick) clearInterval(tick);
    tick = setInterval(() => {
      const left = endTs - Date.now();
      display.textContent = fmt(left);
      broadcastState(left); // 每次 tick 同步给 widget

      if (left <= 0) {
        clearInterval(tick);
        tick = null;
        isRunning = false;
        endTs = null;
        remainingMs = 0;
        range.disabled = false;
        stopBtn.style.display = 'none';
        updatePreview();      // 里面也会 broadcastState

        // 记录本次完成
        const note = noteInput?.value || '';
        saveSession(lastStartedMins, note);
        if (focusLast) focusLast.textContent = `${lastStartedMins} min`;

        showToast(toastEl, `Session complete: ${lastStartedMins} min ✅`);
        notifySystem('Focus session complete', `${lastStartedMins} minutes`);

        // 如果当前在 Statistics 视图，刷新图表
        if (viewStats && viewStats.style.display !== 'none') {
          renderStats({ els: statsEls, chartRef });
        }

        broadcastState(); // 完成后同步一次“已结束”状态
      }
    }, 200);

    broadcastState(); // 启动时同步一次
  }

  function stopCountdown() {
    clearInterval(tick);
    tick = null;
    endTs = null;
    isRunning = false;
    remainingMs = 0;

    const mins = clampMins(Number(range.value || 25));
    const ms = mins * 60 * 1000;
    display.textContent = fmt(ms);

    stopBtn.style.display = 'none';
    range.disabled = false;
    updatePreview();   // 会顺便 broadcastState
    broadcastState();  // 再保险同步一次
  }


  // ===== events =====
  range?.addEventListener('input', updatePreview);

  startBtn?.addEventListener('click', async () => {
    // 已经在跑就什么都不做，避免重复点击
    if (isRunning) {
      return;
    }

    // 每次 Start 都视为新的一轮：先让后端启动 session
    try {
      const mins = clampMins(Number(range.value || 25));
      await createBackendSession(mins);
    } catch (err) {
      console.error('Start session via backend failed:', err);
      alert('启动专注失败（后端），请稍后再试');
      return; // 后端失败就不要启动前端计时了
    }

    // 后端启动成功后，再启动前端倒计时
    startCountdown();
  });



  stopBtn?.addEventListener('click', async () => {
    // 已经不在跑的话，不用多此一举
    if (!isRunning) {
      return;
    }

    try {
      // 1. 告诉后端：这次 session 手动结束（记成 Aborted）
      await stopBackendSession();
    } catch (err) {
      console.error('Stop session via backend failed:', err);
      alert('停止专注失败（后端），请稍后再试');
      // 如果你希望“后端失败就别停前端计时”，这里可以直接 return
      // return;
    }

    // 2. 无论如何，先把前端的倒计时停掉，让界面别继续跑
    stopCountdown();
  });


  // ===== init =====
  if (range) {
    range.min = '1';
    range.max = '60';
    range.value = String(clampMins(Number(range.value || 25)));
  }
  updatePreview();
  broadcastState(); // 初始同步一次
}
