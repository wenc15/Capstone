/* 11.18 edited by Jingyao:
 // 新增内容：
 //   - 新增后端基础地址常量 API_BASE，用于集中配置 .NET 后端服务 URL。
 //   - 新增 createBackendSession(durationMinutes) 方法...
 */

/* 11.18–11.19 edited by Claire (Qinquan) Wang:
 * - Hooked timer logic to backend...
 */

/* 11.19 edited by Jingyao Sun:
 * - Wired timer to backend status polling...
 */
/* 11.27 edited by Claire (Qinquan) Wang:
 * - 修改了白名单问题，在计时开始后锁定白名单，计时结束后解锁白名单。
 * - grace period 现在强制不允许负数，避免后端报错。
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
  const API_BASE = 'http://localhost:5024';

  // Initialize the whitelist checkbox group
  initWhitelist(whitelistGroup);

  // === 辅助函数：控制白名单锁定状态 ===
  function setWhitelistState(enabled) {
    const searchInput = document.getElementById('wlSearchInput');
    const selectedList = document.getElementById('wlSelectedList');

    if (searchInput) {
      searchInput.disabled = !enabled;
      searchInput.placeholder = enabled 
        ? "Search apps (Chrome, VS Code, Word…)" 
        : "Timer running - Whitelist locked";
    }
    if (selectedList) {
      selectedList.style.pointerEvents = enabled ? 'auto' : 'none';
      selectedList.style.opacity = enabled ? '1' : '0.6';
    }
  }

  /**
   * Create a new focus session on the backend.
   */
  async function createBackendSession(durationMinutes) {
    const durationSeconds = Math.max(1, Math.round(durationMinutes * 60));

    // [FIX Bug 1] 校验 Grace Period，不允许负数
    // 如果想要报错：
    // if (grace < 0) throw new Error("Grace period cannot be negative");
    const graceSeconds = Math.max(0, 10); // 强制 >= 0

    // Build allowedProcesses from the current whitelist selection
    const allowedProcesses = getAllowedProcesses();

    const body = {
      durationSeconds,
      allowedProcesses,
      graceSeconds, 
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
      
      // 更新本地 backendFlags（监控状态）
      backendFlags.isFailed = !!data.isFailed;
      backendFlags.isViolating = !!data.isViolating;
      backendFlags.violationSeconds = data.violationSeconds ?? 0;
      backendFlags.currentProcess = data.currentProcess ?? null;
      backendFlags.failReason = data.failReason ?? null;

      // [FIX Bug 2] 状态恢复：如果后端在跑，前端没跑，则立刻同步 UI
      if (data.isRunning && !isRunning) {
          resumeTimerFromBackendState(data.remainingSeconds);
      }

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
    }
  }

  /**
   * [FIX Bug 2 新增函数] 从后端状态恢复 UI (用于窗口重开)
   */
  function resumeTimerFromBackendState(remainingSeconds) {
    console.log('[Resume] Syncing UI with running backend session...');
    
    // 1. 锁定白名单
    setWhitelistState(false);
    
    // 2. 恢复变量
    isRunning = true;
    if (range) range.disabled = true;
    setButtonsForRunning(true);
    
    // 3. 设定结束时间
    const now = Date.now();
    remainingMs = remainingSeconds * 1000;
    endTs = now + remainingMs;
    
    // 4. 启动 tick
    if (tick) clearInterval(tick);
    tick = setInterval(() => {
        const left = endTs - Date.now();
        if (display) display.textContent = fmt(left);
        broadcastState(left);

        if (left <= 0) {
            // 自然结束逻辑
            setWhitelistState(true);
            stopBackendStatusPolling();
            clearInterval(tick);
            tick = null;
            isRunning = false;
            endTs = null;
            remainingMs = 0;
            if (range) range.disabled = false;
            setButtonsForRunning(false);
            updatePreview();

            // 记录 Session (注意：这里我们可能丢失了原始的 startMins，用实际完成时间代替)
            const note = getWhitelistNote();
            const completedMins = Math.round(remainingSeconds / 60) || 1;
            saveSession(completedMins, note);

            if (focusLast) focusLast.textContent = `${completedMins} min`;
            showToast(toastEl, `Session complete (synced): ${completedMins} min ✅`);
            notifySystem('Focus session complete', 'Synced from backend');

            if (viewStats && viewStats.style.display !== 'none') {
                renderStats({ els: statsEls, chartRef });
            }
            broadcastState();
            updateSessionSummary({ minutes: completedMins, distractedApp: null });
        }
    }, 200);

    // 5. 确保轮询开启
    startBackendStatusPolling();
  }


  /**
   * When backend marks the session as failed
   */
  function handleBackendFailure(reason) {
    // 失败停止 -> 解锁白名单
    setWhitelistState(true);

    const elapsedMinutes = computeElapsedMinutes();
    let distractedApp = backendFlags.currentProcess;

    if (!distractedApp && reason) {
      const idx = reason.indexOf(': ');
      if (idx >= 0 && idx < reason.length - 1) {
        distractedApp = reason.slice(idx + 1).trim();
      }
    }

    // 失败 Session 强制 minutes: 0
    updateSessionSummary({
      minutes: 0, 
      distractedApp, 
    });

    stopBackendStatusPolling();
    clearInterval(tick);
    tick = null;
    endTs = null;
    isRunning = false;
    remainingMs = 0;

    if (range) range.disabled = false;
    setButtonsForRunning(false);
    updatePreview();
    broadcastState();

    const msg = reason && reason.trim() ? `Session failed: ${reason}` : 'Session failed.';
    showToast(toastEl, msg);
  }


  function startBackendStatusPolling() {
    if (statusTimer) clearInterval(statusTimer);
    statusTimer = setInterval(pollBackendStatusOnce, 1000);
  }

  function stopBackendStatusPolling() {
    if (statusTimer) {
      clearInterval(statusTimer);
      statusTimer = null;
    }
    // reset flags
    backendFlags = { isFailed: false, isViolating: false, violationSeconds: 0, currentProcess: null, failReason: null };
    broadcastState();
  }


  // ===== Timer state =====
  let endTs = null;
  let tick = null;
  let isRunning = false;
  let remainingMs = 0;
  let lastStartedMins = 0;

  let backendFlags = {
    isFailed: false,
    isViolating: false,
    violationSeconds: 0,
    currentProcess: null,
    failReason: null,
  };

  let statusTimer = null;

  // === Start/Stop 按钮显示控制 ===
  function setButtonsForRunning(running) {
    if (!startBtn || !stopBtn) return;
    if (running) {
      startBtn.style.display = 'none';
      stopBtn.style.display = 'inline-block';
    } else {
      startBtn.style.display = 'inline-block';
      stopBtn.style.display = 'none';
    }
  }

  // 计算当前这次 session 已经坚持了多少分钟
  function computeElapsedMinutes() {
    if (!isRunning || !endTs) {
      const mins = clampMins(Number(range?.value || lastStartedMins || 25));
      return mins;
    }
    const totalMs = lastStartedMins * 60 * 1000;
    const now = Date.now();
    const leftMs = Math.max(0, endTs - now);
    const elapsedMs = Math.max(0, totalMs - leftMs);
    return Math.max(0, Math.round(elapsedMs / 60000));
  }

  function broadcastState(msOverride) {
    const running = isRunning && !!endTs;
    const msLeft = typeof msOverride === 'number' ? msOverride : (running ? Math.max(0, endTs - Date.now()) : remainingMs);
    setFocusStatus({
      isRunning: running,
      remainingSeconds: Math.max(0, Math.round(msLeft / 1000)),
      isFailed: backendFlags.isFailed,
      isViolating: backendFlags.isViolating,
      violationSeconds: backendFlags.violationSeconds,
      currentProcess: backendFlags.currentProcess,
      failReason: backendFlags.failReason,
    });
  }

  function updatePreview() {
    if (!range || !display) return;
    const mins = clampMins(Number(range.value || 25));
    const ms = mins * 60 * 1000;
    display.textContent = fmt(ms);
    if (out) out.value = `${mins} min`;
    if (!isRunning) {
      remainingMs = ms;
      endTs = null;
    }
    broadcastState(ms);
  }

  // ===== Timer core =====

  function startCountdown() {
    setWhitelistState(false);
    const now = Date.now();
    lastStartedMins = clampMins(Number(range?.value || 25));
    remainingMs = lastStartedMins * 60 * 1000;
    endTs = now + remainingMs;
    isRunning = true;
    if (range) range.disabled = true;
    setButtonsForRunning(true);

    if (tick) clearInterval(tick);
    tick = setInterval(() => {
      const left = endTs - Date.now();
      if (display) display.textContent = fmt(left);
      broadcastState(left);

      if (left <= 0) {
        setWhitelistState(true);
        stopBackendStatusPolling();
        clearInterval(tick);
        tick = null;
        isRunning = false;
        endTs = null;
        remainingMs = 0;
        if (range) range.disabled = false;
        setButtonsForRunning(false);
        updatePreview();

        const note = getWhitelistNote();
        saveSession(lastStartedMins, note);
        if (focusLast) focusLast.textContent = `${lastStartedMins} min`;
        showToast(toastEl, `Session complete: ${lastStartedMins} min ✅`);
        notifySystem('Focus session complete', `${lastStartedMins} minutes`);
        if (viewStats && viewStats.style.display !== 'none') {
          renderStats({ els: statsEls, chartRef });
        }
        broadcastState();
        const elapsedMinutes = computeElapsedMinutes();
        updateSessionSummary({ minutes: elapsedMinutes, distractedApp: null });
      }
    }, 200);
    broadcastState();
  }

  function stopCountdown() {
    setWhitelistState(true);
    clearInterval(tick);
    tick = null;
    endTs = null;
    isRunning = false;
    remainingMs = 0;
    const mins = clampMins(Number(range?.value || 25));
    const ms = mins * 60 * 1000;
    if (display) display.textContent = fmt(ms);
    if (range) range.disabled = false;
    setButtonsForRunning(false);
    updatePreview();
    broadcastState();
  }

  // ===== Event wiring =====
  range?.addEventListener('input', updatePreview);

  startBtn?.addEventListener('click', async () => {
    if (isRunning) return;
    try {
      const mins = clampMins(Number(range?.value || 25));
      await createBackendSession(mins);
    } catch (err) {
      console.error('Start session via backend failed:', err);
      alert('Failed to start focus session (backend). Please try again later.');
      return;
    }
    startBackendStatusPolling();
    startCountdown();
  });

  stopBtn?.addEventListener('click', async () => {
    if (!isRunning) return;
    try {
      await stopBackendSession();
    } catch (err) {
      console.error('Stop session via backend failed:', err);
      alert('Failed to stop focus session. Please try again later.');
    }
    stopBackendStatusPolling();
    updateSessionSummary({ minutes: 0, distractedApp: null });
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
  setButtonsForRunning(false);

  // [FIX Bug 2] 页面加载时立即同步后端状态
  pollBackendStatusOnce();
}