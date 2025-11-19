/* 11.18 edited by Jingyao:
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
 //     createBackendSession 内部，避免分散在多个事件处理函数中，方便后续统一维护与扩展。
 */

/* 11.18–11.19 edited by Claire (Qinquan) Wang:
 *  - Hooked timer logic to backend (createBackendSession/stopBackendSession).
 *  - Replaced the old notes input with a whitelist-based flow.
 *  - Delegated whitelist management to js/whitelist.js (checkbox multi-select).
 *  - Fixed updatePreview so the slider updates both the main timer display and the widget.
 */

/* 11.19 edited by Jingyao Sun:
 *  - Wired timer to backend status polling via GET /api/focus/status.
 *  - Merged backendFlags into focusStatus so the widget can reflect failures/violations.
 *  - Added backend failure handling to stop the countdown and show a toast reason.
 *  - Ensured Start/Stop also start/stop backend status polling for consistent session state.
 *  - Added computeElapsedMinutes() to calculate precise elapsed session time (0 min allowed).
 *  - Integrated updateSessionSummary() for three end-of-session paths:
 *     (1) Natural completion
 *     (2) Manual Stop
 *     (3) Backend failure due to non-whitelisted process
 *  - handleBackendFailure() now extracts the failing process name from backendFlags.currentProcess
 *   or failReason, and updates Session Summary accordingly.
 */


import { setFocusStatus } from './focusStatusStore.js';
import { clampMins, fmt, showToast, notifySystem } from './utils.js';
import { saveSession } from './storage.js';
import { renderStats } from './stats.js';

import {
  initWhitelist,
  getAllowedProcesses,
  getWhitelistNote,
} from './whitelist.js';

import { updateSessionSummary } from './session_summary.js';

export function mountTimer(els) {
  const {
    display,
    startBtn,
    stopBtn,
    range,
    out,
    whitelistGroup,   // ← checkbox group container, from dom.js
    focusLast,
    toastEl,
    viewStats,
    statsEls,
    chartRef,
  } = els;

  // ===== Backend config =====
  // Adjust this base URL if your backend listens on a different host/port.
  const API_BASE = 'http://localhost:5024';

  // Initialize the whitelist checkbox group (tracks selected apps internally)
  initWhitelist(whitelistGroup);

  /**
   * Create a new focus session on the backend.
   * Called once per "Start" click.
   * @param {number} durationMinutes - duration selected on the slider (minutes)
   */
  async function createBackendSession(durationMinutes) {
    const durationSeconds = Math.max(1, Math.round(durationMinutes * 60));

    // Build allowedProcesses from the current whitelist selection
    const allowedProcesses = getAllowedProcesses();

    const body = {
      durationSeconds,
      allowedProcesses,
      graceSeconds: 10, // can be made configurable later
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
  }

  /**
   * Tell the backend that the current focus session was stopped manually.
   */
  async function stopBackendSession() {
    const res = await fetch(`${API_BASE}/api/focus/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
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

  /**
   * Poll backend /api/focus/status once and merge into backendFlags.
   */
  async function pollBackendStatusOnce() {
    try {
      const res = await fetch(`${API_BASE}/api/focus/status`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!res.ok) {
        console.warn('Status polling failed with status', res.status);
        return;
      }

      const data = await res.json();
      // data 对应后端 FocusStatusResponse:
      // { isRunning, remainingSeconds, isFailed, failReason,
      //   isViolating, violationSeconds, currentProcess }

      // 更新本地 backendFlags（监控状态）
      backendFlags.isFailed = !!data.isFailed;
      backendFlags.isViolating = !!data.isViolating;
      backendFlags.violationSeconds = data.violationSeconds ?? 0;
      backendFlags.currentProcess = data.currentProcess ?? null;
      backendFlags.failReason = data.failReason ?? null;

      // 如果后端还在跑，就用后端的剩余秒数修正一下前端
      if (data.isRunning) {
        remainingMs = Math.max(0, (data.remainingSeconds ?? 0) * 1000);
      }

      // 把新的状态广播给 widget / 其他 UI
      broadcastState();

      // 如果后端判定失败，就在前端也结束这次 session
      if (data.isFailed) {
        console.log('Session failed from backend:', data.failReason);
        handleBackendFailure(data.failReason);
      }
    } catch (err) {
      console.error('Error while polling backend status:', err);
      // 这里失败就静默，避免打扰用户；下次轮询再试
    }
  }

  /**
   * When backend marks the session as failed (e.g. user uses non-whitelisted app),
   * stop local countdown and show a message.
   */
  function handleBackendFailure(reason) {
    // 1. 先计算这次 session 实际坚持了多久
    const elapsedMinutes = computeElapsedMinutes();

    // 2. 试图拿到具体的违规程序名
    //   优先用后端发来的 currentProcess（已经保存在 backendFlags 里）
    let distractedApp = backendFlags.currentProcess;

    // 如果 currentProcess 拿不到，就从 failReason 里抠：
    // 例如 "使用非白名单程序：chrome"
    if (!distractedApp && reason) {
      const idx = reason.indexOf('：'); // 全角冒号
      if (idx >= 0 && idx < reason.length - 1) {
        distractedApp = reason.slice(idx + 1).trim();
      }
    }

    // 3. 更新首页 Session Summary
    updateSessionSummary({
      minutes: elapsedMinutes,
      distractedApp, // 自动失败 → 这里显示违规程序名
    });

    // 4. 再停掉前端 timer 和轮询
    stopBackendStatusPolling();
    clearInterval(tick);
    tick = null;
    endTs = null;
    isRunning = false;
    remainingMs = 0;

    if (range) range.disabled = false;

    // 按钮恢复为“未运行”状态：只显示 Start
    setButtonsForRunning(false);

    // 回到预览状态
    updatePreview();
    broadcastState();

    const msg =
      reason && reason.trim()
        ? `Session failed: ${reason}`
        : 'Session failed due to non-whitelisted app.';
    showToast(toastEl, msg);
  }


  function startBackendStatusPolling() {
    if (statusTimer) clearInterval(statusTimer);
    // 每 1 秒轮询一次后端
    statusTimer = setInterval(pollBackendStatusOnce, 1000);
  }

  function stopBackendStatusPolling() {
    if (statusTimer) {
      clearInterval(statusTimer);
      statusTimer = null;
    }
    // 清空后端标记
    backendFlags.isFailed = false;
    backendFlags.isViolating = false;
    backendFlags.violationSeconds = 0;
    backendFlags.currentProcess = null;
    backendFlags.failReason = null;

    broadcastState();
  }


  // ===== Timer state =====
  let endTs = null;        // timestamp when the session should end (ms)
  let tick = null;         // setInterval handle
  let isRunning = false;   // whether the timer is currently running
  let remainingMs = 0;     // remaining time in ms
  let lastStartedMins = 0; // duration (minutes) used for this session

  // Latest backend status snapshot (monitoring result)
  let backendFlags = {
    isFailed: false,
    isViolating: false,
    violationSeconds: 0,
    currentProcess: null,
    failReason: null,
  };

  // Polling timer for /api/focus/status
  let statusTimer = null;

  // === Start/Stop 按钮显示控制 ===
  function setButtonsForRunning(running) {
    if (!startBtn || !stopBtn) return;

    if (running) {
      // 计时中：隐藏 Start，只显示 Stop
      startBtn.style.display = 'none';
      stopBtn.style.display = 'inline-block';
    } else {
      // 未计时：只显示 Start，隐藏 Stop
      startBtn.style.display = 'inline-block';
      stopBtn.style.display = 'none';
    }
  }

  // 计算当前这次 session 已经坚持了多少分钟（用于 Session Summary）
  function computeElapsedMinutes() {
    // 如果还没真正 start，就用 slider 当前值兜底
    if (!isRunning || !endTs) {
      const mins = clampMins(Number(range?.value || lastStartedMins || 25));
      return mins;
    }

    const totalMs = lastStartedMins * 60 * 1000;
    const now = Date.now();
    const leftMs = Math.max(0, endTs - now);
    const elapsedMs = Math.max(0, totalMs - leftMs);

    const mins = Math.round(elapsedMs / 60000);
    return Math.max(0, mins);
  }

  /**
   * Push the current timer state into the shared focusStatus store
   * so that the floating widget can reflect it.
   * @param {number | undefined} msOverride
   */
  function broadcastState(msOverride) {
    const running = isRunning && !!endTs;
    const msLeft =
      typeof msOverride === 'number'
        ? msOverride
        : running
        ? Math.max(0, endTs - Date.now())
        : remainingMs;

    setFocusStatus({
      isRunning: running,
      remainingSeconds: Math.max(0, Math.round(msLeft / 1000)),

      // merge latest backend monitoring flags
      isFailed: backendFlags.isFailed,
      isViolating: backendFlags.isViolating,
      violationSeconds: backendFlags.violationSeconds,
      currentProcess: backendFlags.currentProcess,
      // widget/其他地方如果用得上可以读 failReason，没有就忽略
      failReason: backendFlags.failReason,
    });
  }

  /**
   * Slider preview:
   * - Always updates the main timer display and the text label.
   * - When not running, keeps remainingMs in sync with the slider
   *   and clears endTs (pure preview).
   * - Broadcasts preview time to the widget.
   */
  function updatePreview() {
    if (!range || !display) return;

    const mins = clampMins(Number(range.value || 25));
    const ms = mins * 60 * 1000;

    display.textContent = fmt(ms);
    if (out) {
      out.value = `${mins} min`;
    }

    if (!isRunning) {
      remainingMs = ms;
      endTs = null;
    }

    broadcastState(ms);
  }

  // ===== Timer core =====

  /**
   * Start the local countdown timer, assuming the backend session
   * has already been created successfully.
   */
  function startCountdown() {
    const now = Date.now();

    lastStartedMins = clampMins(Number(range?.value || 25));
    remainingMs = lastStartedMins * 60 * 1000;
    endTs = now + remainingMs;

    isRunning = true;
    if (range) range.disabled = true;

    // 计时开始：只显示 Stop
    setButtonsForRunning(true);

    if (tick) clearInterval(tick);
    tick = setInterval(() => {
      const left = endTs - Date.now();
      if (display) {
        display.textContent = fmt(left);
      }
      broadcastState(left);

      if (left <= 0) {
        // 前端认为时间到了 → 同时停止后端状态轮询
        stopBackendStatusPolling();

        clearInterval(tick);
        tick = null;
        isRunning = false;
        endTs = null;
        remainingMs = 0;
        if (range) range.disabled = false;

        // 计时自然结束 → 恢复为“未运行”按钮状态（只显示 Start）
        setButtonsForRunning(false);

        // Return to "preview" state based on the slider
        updatePreview();

        // Use the current whitelist apps as the "note/app" string
        const note = getWhitelistNote();
        saveSession(lastStartedMins, note);

        if (focusLast) {
          focusLast.textContent = `${lastStartedMins} min`;
        }

        showToast(toastEl, `Session complete: ${lastStartedMins} min ✅`);
        notifySystem('Focus session complete', `${lastStartedMins} minutes`);

        // If the stats view is currently visible, refresh it
        if (viewStats && viewStats.style.display !== 'none') {
          renderStats({ els: statsEls, chartRef });
        }

        broadcastState();
        // ★ 自然结束：Focus Time = 实际分钟数，Distractions = "—"
        const elapsedMinutes = computeElapsedMinutes();
        updateSessionSummary({
          minutes: elapsedMinutes,
          distractedApp: null,
        });

      }
    }, 200);

    broadcastState();
  }

  /**
   * Stop the local countdown and reset the UI back to the slider preview state.
   */
  function stopCountdown() {
    clearInterval(tick);
    tick = null;
    endTs = null;
    isRunning = false;
    remainingMs = 0;

    const mins = clampMins(Number(range?.value || 25));
    const ms = mins * 60 * 1000;
    if (display) {
      display.textContent = fmt(ms);
    }

    if (range) range.disabled = false;

    // 手动停止：恢复为“未运行”按钮状态（只显示 Start）
    setButtonsForRunning(false);

    updatePreview();
    broadcastState();
  }

  // ===== Event wiring =====

  // Slider preview
  range?.addEventListener('input', updatePreview);

  // Start button
  startBtn?.addEventListener('click', async () => {
    if (isRunning) {
      return;
    }

    try {
      const mins = clampMins(Number(range?.value || 25));
      await createBackendSession(mins);
    } catch (err) {
      console.error('Start session via backend failed:', err);
      alert('Failed to start focus session (backend). Please try again later.');
      return;
    }

    // 后端会话成功创建 → 开始轮询监控状态
    startBackendStatusPolling();

    // 再启动本地倒计时
    startCountdown();
  });


  // Stop button
  stopBtn?.addEventListener('click', async () => {
    if (!isRunning) {
      return;
    }

    try {
      await stopBackendSession();
    } catch (err) {
      console.error('Stop session via backend failed:', err);
      alert('Failed to stop focus session (backend). Please try again later.');
      // If you prefer to keep the timer running when backend fails, you can return here.
      // return;
    }

    // 先停掉状态轮询
    stopBackendStatusPolling();

    // ★ 手动 Stop：算一下本次坚持了多久，Distractions 置为 "—"
    const elapsedMinutes = computeElapsedMinutes();
    updateSessionSummary({
      minutes: elapsedMinutes,
      distractedApp: null,
    });

    stopCountdown();
  });

  // ===== Initial setup =====
  if (range) {
    range.min = '1';
    range.max = '60';
    range.value = String(clampMins(Number(range.value || 25)));
  }
  updatePreview();
  broadcastState();

  // 确保一开始是“未运行”状态：只显示 Start，隐藏 Stop
  setButtonsForRunning(false);
}
