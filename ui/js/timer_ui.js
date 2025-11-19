/* 11.18 edited by Jingyao:
 *  - Backend integration for start/stop focus session.
 */

/* 11.18–11.19 edited by Claire (Qinquan) Wang:
 *  - Hooked timer logic to backend (createBackendSession/stopBackendSession).
 *  - Replaced the old notes input with a whitelist-based flow.
 *  - Delegated whitelist management to js/whitelist.js (checkbox multi-select).
 *  - Fixed updatePreview so the slider updates both the main timer display and the widget.
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

  // ===== Timer state =====
  let endTs = null;        // timestamp when the session should end (ms)
  let tick = null;         // setInterval handle
  let isRunning = false;   // whether the timer is currently running
  let remainingMs = 0;     // remaining time in ms
  let lastStartedMins = 0; // duration (minutes) used for this session

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
      isFailed: false,
      isViolating: false,
      violationSeconds: 0,
      currentProcess: null,
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
    if (!range) return;

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

    lastStartedMins = clampMins(Number(range.value || 25));
    remainingMs = lastStartedMins * 60 * 1000;
    endTs = now + remainingMs;

    isRunning = true;
    range.disabled = true;
    if (stopBtn) {
      stopBtn.style.display = 'inline-block';
    }

    if (tick) clearInterval(tick);
    tick = setInterval(() => {
      const left = endTs - Date.now();
      display.textContent = fmt(left);
      broadcastState(left);

      if (left <= 0) {
        clearInterval(tick);
        tick = null;
        isRunning = false;
        endTs = null;
        remainingMs = 0;
        range.disabled = false;
        if (stopBtn) {
          stopBtn.style.display = 'none';
        }

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

    const mins = clampMins(Number(range.value || 25));
    const ms = mins * 60 * 1000;
    display.textContent = fmt(ms);

    if (stopBtn) {
      stopBtn.style.display = 'none';
    }
    range.disabled = false;

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
      const mins = clampMins(Number(range.value || 25));
      await createBackendSession(mins);
    } catch (err) {
      console.error('Start session via backend failed:', err);
      alert('Failed to start focus session (backend). Please try again later.');
      return;
    }

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
}
