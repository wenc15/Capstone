/* 2026/03/25 edited by Zhecheng Xu
 * Changes:
 *  - Add backend-to-frontend stop sync so external extension stop halts local timer.
 *  - Improve stop responsiveness and guard stop request re-entry.
 */

/* 2026/03/25 edited by Zhecheng Xu
 * Changes:
 *  - Align timer/focus behavior with music and widget command interactions.
 *  - Keep focus status broadcast flow consistent for cross-window control.
 */

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
/* 12.21 edited by Jingyao Sun:
 * 更改start/stop按钮（startBtn/stopBtn）使timer接收来自widget的命令
 */

// 1.22 edited by JS:
// Added credits system. Session 成功完成后触发 refreshCredits()，让 Token 显示与后端 credits 实时同步。
//受影响程序：startCountdown()，

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

import { refreshCredits, getCreditsSnapshot } from './creditsStore.js';

import { offerRelaxAfterFocus } from './relax_prompt.js';


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
  const TIMER_SELECTED_MINS_KEY = 'growin.timer.selectedMins.v1';
  let prefSyncTimer = null;
  let prefRetryTimer = null;
  let pendingPreferredMins = null;

  async function postPreferredDuration(mins) {
    const safeMins = clampMins(Number(mins || 25));
    try {
      const res = await fetch(`${API_BASE}/api/focus/preference`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ durationSeconds: safeMins * 60 }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async function flushPreferredDurationSync() {
    if (pendingPreferredMins == null) return;
    const mins = pendingPreferredMins;
    const ok = await postPreferredDuration(mins);
    if (ok) {
      pendingPreferredMins = null;
      if (prefRetryTimer) {
        clearTimeout(prefRetryTimer);
        prefRetryTimer = null;
      }
      return;
    }

    if (prefRetryTimer) clearTimeout(prefRetryTimer);
    prefRetryTimer = setTimeout(() => {
      void flushPreferredDurationSync();
    }, 2200);
  }

  function queuePreferredDurationSync(mins, { immediate = false } = {}) {
    const safeMins = clampMins(Number(mins || 25));
    pendingPreferredMins = safeMins;
    if (prefSyncTimer) clearTimeout(prefSyncTimer);
    if (immediate) {
      void flushPreferredDurationSync();
      return;
    }
    prefSyncTimer = setTimeout(() => {
      void flushPreferredDurationSync();
    }, 180);
  }

  function loadSelectedMinutes() {
    try {
      const raw = localStorage.getItem(TIMER_SELECTED_MINS_KEY);
      if (raw == null) return null;
      return clampMins(Number(raw));
    } catch {
      return null;
    }
  }

  function saveSelectedMinutes(mins) {
    try {
      localStorage.setItem(TIMER_SELECTED_MINS_KEY, String(clampMins(Number(mins || 25))));
    } catch {
      // ignore localStorage failures
    }
  }

  // Initialize the whitelist checkbox group
  initWhitelist(whitelistGroup);

  // === 辅助函数：控制白名单锁定状态 ===
  function setWhitelistState(enabled) {
    const searchInput = document.getElementById('wlSearchInput');
    const browseBtn = document.getElementById('wlBrowseBtn');
    const searchResults = document.getElementById('wlSearchResults');
    const selectedList = document.getElementById('wlSelectedList');

    whitelistGroup?.classList.toggle('is-locked', !enabled);

    if (searchInput) {
      searchInput.disabled = !enabled;
      searchInput.style.cursor = enabled ? 'text' : 'not-allowed';
      searchInput.placeholder = enabled 
        ? "Search apps (Chrome, VS Code, Word…)" 
        : "Timer running - Whitelist locked";
    }
    if (browseBtn) {
      browseBtn.classList.toggle('is-locked', !enabled);
      browseBtn.setAttribute('aria-disabled', enabled ? 'false' : 'true');
      if (enabled) browseBtn.removeAttribute('tabindex');
      else browseBtn.setAttribute('tabindex', '-1');
    }
    if (searchResults) {
      searchResults.style.pointerEvents = enabled ? 'auto' : 'none';
      searchResults.style.opacity = enabled ? '1' : '0.6';
    }
    if (selectedList) {
      selectedList.style.pointerEvents = enabled ? 'auto' : 'none';
      selectedList.style.opacity = enabled ? '1' : '0.6';
    }
  }

  async function syncCreditsAndCelebrate() {
    const before = Number(getCreditsSnapshot() || 0);
    let after = before;
    try {
      after = Number(await refreshCredits());
      if (!Number.isFinite(after)) after = before;
    } catch {
      // keep old value on refresh error
    }
    const gained = Math.max(0, Math.round(after - before));
    if (gained > 0) {
      window.dispatchEvent(new CustomEvent('growin:token-gain', {
        detail: { amount: gained },
      }));
    }
    return gained;
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
      // Credits: if backend session just completed successfully, refresh credits
      if (prevBackendRunning && !data.isRunning && !data.isFailed) {
        refreshCredits();
      }
      prevBackendRunning = !!data.isRunning;

      
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

      // External stop sync: if backend stopped from another controller
      // (e.g. Chrome extension), stop local timer immediately.
      if (!data.isRunning && isRunning) {
        stopCountdown();
        updateSessionSummary({ minutes: 0, distractedApp: null });
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
            void syncCreditsAndCelebrate().then((tokenGain) => {
              offerRelaxAfterFocus(els, { minutes: completedMins, tokenGain });
            });

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
    if (statusTimer) return;
    statusTimer = setInterval(pollBackendStatusOnce, 1000);
  }

  function stopBackendStatusPolling() {
    // Keep polling alive so sessions started/stopped from other clients
    // (e.g. Chrome extension) can still sync into this app.
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
  // Credits: track backend running edge (for success completion)
  let prevBackendRunning = false;
  let stopRequestInFlight = false;



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
      saveSelectedMinutes(mins);
      queuePreferredDurationSync(mins);
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
        void syncCreditsAndCelebrate().then((tokenGain) => {
          offerRelaxAfterFocus(els, { minutes: lastStartedMins, tokenGain });
        });

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

  function forceStopForReset() {
    stopBackendStatusPolling();
    setWhitelistState(true);
    clearInterval(tick);
    tick = null;
    endTs = null;
    isRunning = false;
    remainingMs = 0;
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
      queuePreferredDurationSync(mins, { immediate: true });
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
    if (!isRunning || stopRequestInFlight) return;

    // Stop UI immediately so widget/main both reflect pause instantly.
    stopRequestInFlight = true;
    stopBackendStatusPolling();
    updateSessionSummary({ minutes: 0, distractedApp: null });
    stopCountdown();

    try {
      await stopBackendSession();
    } catch (err) {
      console.error('Stop session via backend failed:', err);
      showToast(toastEl, 'Stop request failed on backend, local timer already stopped.');
      // If backend did not actually stop, immediately re-sync from backend status.
      await pollBackendStatusOnce();
    } finally {
      stopRequestInFlight = false;
    }
  });

  // ✅ 接收来自 widget 的命令，让主窗口执行真正的 start/stop（走后端 + 同步 + broadcastState）
  if (window.electronAPI?.onFocusCommand) {
    window.electronAPI.onFocusCommand((cmd) => {
      if (cmd === 'start') startBtn?.click();
      if (cmd === 'stop') stopBtn?.click();
      if (cmd === 'toggle') {
        if (isRunning) stopBtn?.click();
        else startBtn?.click();
      }
    });
  }

  window.addEventListener('growin:force-stop-focus', () => {
    forceStopForReset();
  });


  // ===== Initial setup =====
  if (range) {
    range.min = '1';
    range.max = '60';
    const savedMins = loadSelectedMinutes();
    range.value = String(clampMins(Number(savedMins ?? range.value ?? 25)));
  }
  updatePreview();
  broadcastState();
  setButtonsForRunning(false);

  // [FIX Bug 2] 页面加载时立即同步后端状态
  pollBackendStatusOnce();
  // Always-on polling to keep app in sync with external controllers
  // such as the Chrome extension popup.
  startBackendStatusPolling();
}
