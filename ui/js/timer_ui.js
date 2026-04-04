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
import { fmt, showToast, notifySystem } from './utils.js';
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
    timerMinPart,
    timerSecPart,
    startBtn,
    stopBtn,
    range,
    out,
    whitelistGroup,   // ← checkbox group container, from dom.js
    toastEl,
    viewStats,
    statsEls,
    chartRef,
  } = els;

  // ===== Backend config =====
  const API_BASE = 'http://localhost:5024';
  const MAX_TIMER_MINUTES = 90;
  const MAX_TIMER_MS = MAX_TIMER_MINUTES * 60 * 1000;
  const BACKEND_DRIFT_CORRECT_THRESHOLD_MS = 1000;
  const TIMER_SELECTED_MINS_KEY = 'growin.timer.selectedMins.v1';
  const TIMER_SELECTED_DURATION_MS_KEY = 'growin.timer.selectedDurationMs.v1';
  let prefSyncTimer = null;
  let prefRetryTimer = null;
  let pendingPreferredDurationSeconds = null;

  function clampTimerMinutes(v) {
    if (Number.isNaN(v)) return 25;
    return Math.min(MAX_TIMER_MINUTES, Math.max(1, Math.floor(v)));
  }

  async function postPreferredDuration(durationSecondsInput) {
    const safeSeconds = Math.max(1, Math.round(Number(durationSecondsInput) || 25 * 60));
    try {
      const res = await fetch(`${API_BASE}/api/focus/preference`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ durationSeconds: safeSeconds }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async function flushPreferredDurationSync() {
    if (pendingPreferredDurationSeconds == null) return;
    const durationSeconds = pendingPreferredDurationSeconds;
    const ok = await postPreferredDuration(durationSeconds);
    if (ok) {
      pendingPreferredDurationSeconds = null;
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

  function queuePreferredDurationSync(durationSecondsInput, { immediate = false } = {}) {
    const safeSeconds = Math.max(1, Math.round(Number(durationSecondsInput) || 25 * 60));
    pendingPreferredDurationSeconds = safeSeconds;
    if (prefSyncTimer) clearTimeout(prefSyncTimer);
    if (immediate) {
      void flushPreferredDurationSync();
      return;
    }
    prefSyncTimer = setTimeout(() => {
      void flushPreferredDurationSync();
    }, 180);
  }

  function loadSelectedDurationMs() {
    try {
      const rawMs = localStorage.getItem(TIMER_SELECTED_DURATION_MS_KEY);
      if (rawMs != null) {
        return clampDurationMs(Number(rawMs));
      }

      const rawMins = localStorage.getItem(TIMER_SELECTED_MINS_KEY);
      if (rawMins == null) return null;
      return clampDurationMs(clampTimerMinutes(Number(rawMins)) * 60 * 1000);
    } catch {
      return null;
    }
  }

  function saveSelectedDurationMs(ms) {
    const safeMs = clampDurationMs(ms);
    try {
      localStorage.setItem(TIMER_SELECTED_DURATION_MS_KEY, String(safeMs));
      localStorage.setItem(TIMER_SELECTED_MINS_KEY, String(clampTimerMinutes(Math.ceil(safeMs / 60000))));
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

  async function syncCreditsWithTimeout(timeoutMs = 1800) {
    try {
      return await Promise.race([
        syncCreditsAndCelebrate(),
        new Promise((resolve) => setTimeout(() => resolve(0), timeoutMs)),
      ]);
    } catch {
      return 0;
    }
  }

  function showPostFocusPrompt(minutes) {
    void (async () => {
      const tokenGain = await syncCreditsWithTimeout();
      offerRelaxAfterFocus(els, { minutes, tokenGain });
    })();
  }

  /**
   * Create a new focus session on the backend.
   */
  async function createBackendSession(durationSecondsInput) {
    const durationSeconds = Math.max(1, Math.round(durationSecondsInput));

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
    if (statusPollPromise) return statusPollPromise;

    const requestVersion = statusStateVersion;
    const controller = new AbortController();
    statusPollAbortController = controller;

    const run = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/focus/status`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
        });

        if (!res.ok) {
          console.warn('Status polling failed with status', res.status);
          return;
        }

        const data = await res.json();

        if (requestVersion !== statusStateVersion) {
          return;
        }

        const wasBackendRunning = prevBackendRunning;

        // Clear failure latch once backend clears failure.
        if (!data.isFailed) backendFailureHandled = false;
        // Credits: if backend session just completed successfully, refresh credits
        if (wasBackendRunning && !data.isRunning && !data.isFailed) {
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
          const backendRemainingMs = Math.max(0, (data.remainingSeconds ?? 0) * 1000);
          if (isRunning && endTs) {
            const now = nowMonotonicMs();
            const localRemainingMs = Math.max(0, endTs - now);
            const driftMs = backendRemainingMs - localRemainingMs;
            if (driftMs < -BACKEND_DRIFT_CORRECT_THRESHOLD_MS) {
              remainingMs = backendRemainingMs;
              endTs = now + backendRemainingMs;
            } else {
              remainingMs = localRemainingMs;
            }
          } else {
            remainingMs = backendRemainingMs;
          }
        }

        // 把新的状态广播给 widget / 其他 UI
        broadcastState();

        // 仅在“当前/刚刚在跑”的会话失败时处理，避免刷新时把历史失败再次弹出。
        const shouldHandleLiveFailure = !!(isRunning || data.isRunning || wasBackendRunning);
        if (data.isFailed && shouldHandleLiveFailure && !backendFailureHandled) {
          backendFailureHandled = true;
          console.log('Session failed from backend:', data.failReason);
          handleBackendFailure(data.failReason);
        }
      } catch (err) {
        if (err?.name === 'AbortError') return;
        console.error('Error while polling backend status:', err);
      } finally {
        if (statusPollAbortController === controller) {
          statusPollAbortController = null;
        }
      }
    };

    statusPollPromise = run().finally(() => {
      statusPollPromise = null;
    });
    return statusPollPromise;
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
    lastRenderedRunningSeconds = null;
    if (range) range.disabled = true;
    setButtonsForRunning(true);
    
    // 3. 设定结束时间
    const now = nowMonotonicMs();
    const safeRemainingSeconds = Math.max(0, Number(remainingSeconds) || 0);
    remainingMs = safeRemainingSeconds * 1000;
    endTs = now + remainingMs;
    
    // 4. 启动 tick
    if (tick) clearInterval(tick);
    tick = setInterval(() => {
        const left = endTs - nowMonotonicMs();
        renderTimerDisplay(left);
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
            lastRenderedRunningSeconds = null;
            if (range) range.disabled = false;
            setButtonsForRunning(false);
            refreshIdlePreview();

            // 记录 Session (注意：这里我们可能丢失了原始的 startMins，用实际完成时间代替)
            const note = getWhitelistNote();
            const completedMins = Math.round(remainingSeconds / 60) || 1;
            saveSession(completedMins, note);

            showToast(toastEl, `Session complete (synced): ${completedMins} min ✅`);
            notifySystem('Focus session complete', 'Synced from backend');
            showPostFocusPrompt(completedMins);

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
    refreshIdlePreview();
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
    statusStateVersion += 1;
    if (statusPollAbortController) {
      statusPollAbortController.abort();
    }
    backendFlags = { isFailed: false, isViolating: false, violationSeconds: 0, currentProcess: null, failReason: null };
    broadcastState();
  }


  // ===== Timer state =====
  let endTs = null;
  let tick = null;
  let isRunning = false;
  let remainingMs = 0;
  let selectedDurationMs = 25 * 60 * 1000;
  let lastStartedDurationMs = 0;
  let lastStartedMins = 0;
  let activeEditPart = null;
  let timerPartEditInput = null;
  let lastRenderedRunningSeconds = null;

  let backendFlags = {
    isFailed: false,
    isViolating: false,
    violationSeconds: 0,
    currentProcess: null,
    failReason: null,
  };

  let statusTimer = null;
  let statusPollPromise = null;
  let statusPollAbortController = null;
  let statusStateVersion = 0;
  // Credits: track backend running edge (for success completion)
  let prevBackendRunning = false;
  let stopRequestInFlight = false;

  // Prevent repeating failure side-effects while polling.
  let backendFailureHandled = false;

  function clampDurationMs(ms) {
    const n = Math.round(Number(ms) || 0);
    const minMs = 1000;
    const maxMs = MAX_TIMER_MS;
    return Math.max(minMs, Math.min(maxMs, n));
  }

  function formatDurationLabel(ms) {
    const totalSec = Math.max(0, Math.ceil((Number(ms) || 0) / 1000));
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    if (secs <= 0) return `${mins}min`;
    return `${mins}min${secs}s`;
  }

  function nowMonotonicMs() {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
      return performance.now();
    }
    return Date.now();
  }

  function getDurationParts(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    return {
      mins: Math.floor(total / 60),
      secs: total % 60,
    };
  }

  function renderTimerDisplay(ms) {
    let total = Math.max(0, Math.ceil(ms / 1000));
    if (isRunning) {
      if (lastRenderedRunningSeconds == null) {
        lastRenderedRunningSeconds = total;
      } else {
        total = Math.min(total, lastRenderedRunningSeconds);
        lastRenderedRunningSeconds = total;
      }
    } else {
      lastRenderedRunningSeconds = null;
    }
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    if (timerMinPart && activeEditPart !== 'min') {
      timerMinPart.textContent = String(mins).padStart(2, '0');
    }
    if (timerSecPart && activeEditPart !== 'sec') {
      timerSecPart.textContent = String(secs).padStart(2, '0');
    }
    if ((!timerMinPart || !timerSecPart) && display) {
      display.textContent = fmt(ms);
    }
  }

  function syncRangeWithDuration(ms) {
    if (!range) return;
    const minsForSlider = clampTimerMinutes(Math.max(1, Math.ceil(ms / 60000)));
    range.value = String(minsForSlider);
  }



  // === Start/Stop 按钮显示控制 ===
  function setButtonsForRunning(running) {
    if (!startBtn || !stopBtn) return;
    if (running) {
      startBtn.style.display = 'none';
      stopBtn.style.display = 'inline-block';
      if (display) display.classList.remove('is-editable');
      closeTimerPartEditor({ apply: false });
      timerMinPart?.removeAttribute('title');
      timerSecPart?.removeAttribute('title');
    } else {
      startBtn.style.display = 'inline-block';
      stopBtn.style.display = 'none';
      if (display) display.classList.add('is-editable');
      if (timerMinPart) timerMinPart.title = 'Click to edit minutes';
      if (timerSecPart) timerSecPart.title = 'Click to edit seconds';
    }
  }

  // 计算当前这次 session 已经坚持了多少分钟
  function computeElapsedMinutes() {
    if (!isRunning || !endTs) {
      const mins = clampTimerMinutes(Math.ceil((lastStartedDurationMs || selectedDurationMs || 25 * 60 * 1000) / 60000));
      return mins;
    }
    const totalMs = Math.max(1000, Math.round(lastStartedDurationMs || selectedDurationMs || 25 * 60 * 1000));
    const now = nowMonotonicMs();
    const leftMs = Math.max(0, endTs - now);
    const elapsedMs = Math.max(0, totalMs - leftMs);
    return Math.max(0, Math.round(elapsedMs / 60000));
  }

  function broadcastState(msOverride) {
    const running = isRunning && !!endTs;
    const msLeft = typeof msOverride === 'number' ? msOverride : (running ? Math.max(0, endTs - nowMonotonicMs()) : remainingMs);
    const fallbackSeconds = Math.max(0, Math.ceil(msLeft / 1000));
    const syncedSeconds = (running && Number.isFinite(lastRenderedRunningSeconds))
      ? Math.max(0, Number(lastRenderedRunningSeconds))
      : fallbackSeconds;
    setFocusStatus({
      isRunning: running,
      remainingSeconds: syncedSeconds,
      isFailed: backendFlags.isFailed,
      isViolating: backendFlags.isViolating,
      violationSeconds: backendFlags.violationSeconds,
      currentProcess: backendFlags.currentProcess,
      failReason: backendFlags.failReason,
    });
  }

  function updatePreview() {
    if (!range || !display) return;
    const mins = clampTimerMinutes(Number(range.value || 25));
    const ms = clampDurationMs(mins * 60 * 1000);
    selectedDurationMs = ms;
    refreshIdlePreview();
    saveSelectedDurationMs(ms);
    queuePreferredDurationSync(Math.round(ms / 1000));
  }

  function refreshIdlePreview() {
    renderTimerDisplay(selectedDurationMs);
    if (out) {
      const label = formatDurationLabel(selectedDurationMs);
      out.value = label;
      out.textContent = label;
    }
    if (!isRunning) {
      if (range) range.disabled = false;
      remainingMs = selectedDurationMs;
      endTs = null;
    }
    broadcastState(selectedDurationMs);
  }

  function applyCustomDurationFromParts(minsInput, secsInput) {
    const mins = clampTimerMinutes(Number(minsInput) || 1);
    let secs = Math.max(0, Math.min(59, Number(secsInput) || 0));
    if (mins >= MAX_TIMER_MINUTES) secs = 0;

    const ms = clampDurationMs((mins * 60 + secs) * 1000);
    selectedDurationMs = ms;
    remainingMs = ms;
    endTs = null;
    syncRangeWithDuration(ms);

    saveSelectedDurationMs(ms);
    queuePreferredDurationSync(Math.round(ms / 1000));
    refreshIdlePreview();
  }

  function closeTimerPartEditor({ apply = true } = {}) {
    if (!timerPartEditInput || !activeEditPart) return;
    const input = timerPartEditInput;
    const raw = input.value;
    const editedPart = activeEditPart;
    input.remove();
    timerPartEditInput = null;
    activeEditPart = null;

    const current = getDurationParts(selectedDurationMs);

    if (editedPart === 'min' && timerMinPart) {
      timerMinPart.classList.remove('is-editing');
      timerMinPart.textContent = String(current.mins).padStart(2, '0');
    }
    if (editedPart === 'sec' && timerSecPart) {
      timerSecPart.classList.remove('is-editing');
      timerSecPart.textContent = String(current.secs).padStart(2, '0');
    }

    if (apply && !isRunning) {
      const digits = raw.replace(/[^0-9]/g, '');
      const n = Number(digits || 0);
      if (editedPart === 'min') {
        applyCustomDurationFromParts(n, current.secs);
      } else {
        applyCustomDurationFromParts(current.mins, n);
      }
    }
  }

  function computeCaretIndexFromClick(ev, valueLength, targetEl) {
    if (!(ev instanceof MouseEvent) || !targetEl) return valueLength;
    const rect = targetEl.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, ev.clientX - rect.left));
    const ratio = rect.width > 0 ? (x / rect.width) : 1;
    const idx = Math.round(ratio * valueLength);
    return Math.max(0, Math.min(valueLength, idx));
  }

  function isClickInsideText(targetEl, ev) {
    if (!(ev instanceof MouseEvent) || !targetEl) return false;
    const text = targetEl.textContent || '';
    if (!text.trim()) return false;
    const range = document.createRange();
    range.selectNodeContents(targetEl);
    const rect = range.getBoundingClientRect();
    return ev.clientX >= rect.left && ev.clientX <= rect.right && ev.clientY >= rect.top && ev.clientY <= rect.bottom;
  }

  function clampCaretForTwoDigits(pos) {
    if (!Number.isFinite(pos)) return 2;
    return Math.max(0, Math.min(2, Math.floor(pos)));
  }

  function replaceAt(value, index, ch) {
    const safe = String(value || '').padStart(2, '0').slice(0, 2);
    const i = Math.max(0, Math.min(1, index));
    return `${safe.slice(0, i)}${ch}${safe.slice(i + 1)}`;
  }

  function setOverwriteCaret(input, pos) {
    if (!input) return;
    const valueLen = Math.max(1, String(input.value || '').length);
    const safePos = clampCaretForTwoDigits(Number(pos));
    const idx = Math.min(valueLen - 1, safePos);
    input.setSelectionRange(idx, Math.min(valueLen, idx + 1));
  }

  const caretMeasureCanvas = document.createElement('canvas');
  const caretMeasureCtx = caretMeasureCanvas.getContext('2d');

  function measureTimerTextWidth(input) {
    if (!input || !caretMeasureCtx) return 0;
    const style = window.getComputedStyle(input);
    const value = String(input.value || '').padStart(2, '0').slice(0, 2);
    const letterSpacing = Number.parseFloat(style.letterSpacing) || 0;
    const font = [
      style.fontStyle,
      style.fontVariant,
      style.fontWeight,
      style.fontSize,
      style.fontFamily,
    ].join(' ');
    caretMeasureCtx.font = font;
    const textWidth = caretMeasureCtx.measureText(value).width;
    return textWidth + Math.max(0, value.length - 1) * letterSpacing;
  }

  function getTimerDigitBoundary(input) {
    if (!input) return 0;
    const style = window.getComputedStyle(input);
    const paddingLeft = Number.parseFloat(style.paddingLeft) || 0;
    const paddingRight = Number.parseFloat(style.paddingRight) || 0;
    const innerWidth = Math.max(0, input.clientWidth - paddingLeft - paddingRight);
    const textWidth = measureTimerTextWidth(input);
    const textStart = paddingLeft + Math.max(0, (innerWidth - textWidth) / 2);
    return textStart + textWidth / 2;
  }

  function setOverwriteCaretFromPointer(input, clientX) {
    if (!input || !Number.isFinite(clientX)) return;
    const rect = input.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const valueLen = Math.max(1, String(input.value || '').length);
    const boundary = getTimerDigitBoundary(input);
    const idx = Math.min(valueLen - 1, x < boundary ? 0 : 1);
    setOverwriteCaret(input, idx);
  }

  function openTimerPartEditor(part, caretIndex = null) {
    if (isRunning || timerPartEditInput) return;
    if (part !== 'min' && part !== 'sec') return;

    const target = part === 'min' ? timerMinPart : timerSecPart;
    if (!target) return;

    const input = document.createElement('input');
    input.id = part === 'min' ? 'timerMinEdit' : 'timerSecEdit';
    input.type = 'text';
    input.maxLength = 2;
    input.setAttribute('inputmode', 'numeric');
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('aria-label', part === 'min' ? 'Set minutes' : 'Set seconds');

    const { mins, secs } = getDurationParts(selectedDurationMs);
    input.value = part === 'min' ? String(mins).padStart(2, '0') : String(secs).padStart(2, '0');
    input.addEventListener('keydown', (ev) => {
      if (ev.key >= '0' && ev.key <= '9') {
        ev.preventDefault();
        const start = clampCaretForTwoDigits(input.selectionStart ?? 2);
        const idx = Math.min(1, start);
        const next = replaceAt(input.value, idx, ev.key);
        const caret = Math.min(1, idx + 1);
        input.value = next;
        setOverwriteCaret(input, caret);
        return;
      }

      if (ev.key === 'Backspace') {
        ev.preventDefault();
        const start = clampCaretForTwoDigits(input.selectionStart ?? 2);
        const idx = Math.max(0, Math.min(1, start - 1));
        input.value = replaceAt(input.value, idx, '0');
        setOverwriteCaret(input, idx);
        return;
      }

      if (ev.key === 'Delete') {
        ev.preventDefault();
        const start = clampCaretForTwoDigits(input.selectionStart ?? 2);
        const idx = Math.min(1, start);
        input.value = replaceAt(input.value, idx, '0');
        const caret = Math.min(1, idx + 1);
        setOverwriteCaret(input, caret);
        return;
      }

      if (ev.key === 'Enter') {
        ev.preventDefault();
        closeTimerPartEditor({ apply: true });
      }
      if (ev.key === 'Escape') {
        ev.preventDefault();
        closeTimerPartEditor({ apply: false });
      }

      if (ev.key.length === 1 && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
        ev.preventDefault();
      }
    });
    input.addEventListener('paste', (ev) => {
      ev.preventDefault();
    });
    input.addEventListener('blur', () => {
      closeTimerPartEditor({ apply: true });
    });
    input.addEventListener('mousedown', (ev) => {
      ev.preventDefault();
      if (document.activeElement !== input) input.focus();
      setOverwriteCaretFromPointer(input, ev.clientX);
      requestAnimationFrame(() => {
        setOverwriteCaretFromPointer(input, ev.clientX);
      });
    });
    input.addEventListener('focus', () => {
      setOverwriteCaret(input, input.selectionStart ?? 0);
    });

    target.appendChild(input);
    target.classList.add('is-editing');
    activeEditPart = part;
    timerPartEditInput = input;
    input.focus();
    const len = input.value.length;
    const pos = Number.isInteger(caretIndex) ? Math.max(0, Math.min(len, caretIndex)) : len;
    setOverwriteCaret(input, pos);
  }

  // ===== Timer core =====

  function startCountdown() {
    setWhitelistState(false);
    const now = nowMonotonicMs();
    const startMs = clampDurationMs(selectedDurationMs || (clampTimerMinutes(Number(range?.value || 25)) * 60 * 1000));
    lastStartedDurationMs = startMs;
    lastStartedMins = Math.max(1, Math.ceil(startMs / 60000));
    remainingMs = startMs;
    endTs = now + remainingMs;
    isRunning = true;
    lastRenderedRunningSeconds = null;
    if (range) range.disabled = true;
    setButtonsForRunning(true);

    if (tick) clearInterval(tick);
    tick = setInterval(() => {
      const left = endTs - nowMonotonicMs();
      renderTimerDisplay(left);
      broadcastState(left);

      if (left <= 0) {
        setWhitelistState(true);
        stopBackendStatusPolling();
        clearInterval(tick);
        tick = null;
        isRunning = false;
        endTs = null;
        remainingMs = 0;
        lastRenderedRunningSeconds = null;
        if (range) range.disabled = false;
        setButtonsForRunning(false);
        refreshIdlePreview();

        const note = getWhitelistNote();
        saveSession(lastStartedMins, note);
        showToast(toastEl, `Session complete: ${lastStartedMins} min ✅`);
        notifySystem('Focus session complete', `${lastStartedMins} minutes`);
        showPostFocusPrompt(lastStartedMins);

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
    lastRenderedRunningSeconds = null;
    const ms = clampDurationMs(selectedDurationMs || (clampTimerMinutes(Number(range?.value || 25)) * 60 * 1000));
    if (range) range.disabled = false;
    setButtonsForRunning(false);
    refreshIdlePreview();
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
    lastRenderedRunningSeconds = null;
    if (range) range.disabled = false;
    setButtonsForRunning(false);
    refreshIdlePreview();
    broadcastState();
  }

  // ===== Event wiring =====
  range?.addEventListener('input', updatePreview);

  timerMinPart?.addEventListener('click', (ev) => {
    if (isRunning) return;
    if (!isClickInsideText(timerMinPart, ev)) return;
    const caretIndex = computeCaretIndexFromClick(ev, 2, timerMinPart);
    openTimerPartEditor('min', caretIndex);
  });

  timerSecPart?.addEventListener('click', (ev) => {
    if (isRunning) return;
    if (!isClickInsideText(timerSecPart, ev)) return;
    const caretIndex = computeCaretIndexFromClick(ev, 2, timerSecPart);
    openTimerPartEditor('sec', caretIndex);
  });

  startBtn?.addEventListener('click', async () => {
    if (isRunning) return;
    statusStateVersion += 1;
    if (statusPollAbortController) {
      statusPollAbortController.abort();
    }
    try {
      const startMs = clampDurationMs(selectedDurationMs || (clampTimerMinutes(Number(range?.value || 25)) * 60 * 1000));
      const durationSeconds = Math.max(1, Math.round(startMs / 1000));
      queuePreferredDurationSync(durationSeconds, { immediate: true });
      await createBackendSession(durationSeconds);
    } catch (err) {
      console.error('Start session via backend failed:', err);
      alert('Failed to start focus session (backend). Please try again later.');
      return;
    }
    backendFailureHandled = false;
    startBackendStatusPolling();
    startCountdown();
  });

  stopBtn?.addEventListener('click', async () => {
    if (!isRunning || stopRequestInFlight) return;
    statusStateVersion += 1;
    if (statusPollAbortController) {
      statusPollAbortController.abort();
    }

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
    range.max = String(MAX_TIMER_MINUTES);
    const savedDurationMs = loadSelectedDurationMs();
    if (savedDurationMs != null) {
      selectedDurationMs = clampDurationMs(savedDurationMs);
    } else {
      selectedDurationMs = clampDurationMs(clampTimerMinutes(Number(range.value || 25)) * 60 * 1000);
    }
    range.value = String(clampTimerMinutes(Math.ceil(selectedDurationMs / 60000)));
  }
  refreshIdlePreview();
  display?.classList.remove('is-booting');
  queuePreferredDurationSync(Math.round(selectedDurationMs / 1000));
  broadcastState();
  setButtonsForRunning(false);

  // [FIX Bug 2] 页面加载时立即同步后端状态
  pollBackendStatusOnce();
  // Always-on polling to keep app in sync with external controllers
  // such as the Chrome extension popup.
  startBackendStatusPolling();
}
