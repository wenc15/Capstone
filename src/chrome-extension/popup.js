// 2026/03/25 edited by Zhecheng Xu
// Changes:
//  - Harden start/stop flow with direct backend calls plus background fallback.
//  - Add robust status normalization and stop confirmation polling.

// 2026/03/25 edited by Zhecheng Xu
// Changes:
//  - Improve popup focus-time sync rendering with local countdown estimation.
//  - Keep start/stop controls aligned with backend focus APIs.

const BACKEND_BASE_GLOBAL = "http://localhost:5024";

document.addEventListener("DOMContentLoaded", () => {
  const backendStatusEl = document.getElementById("backendStatus");
  const focusStatusEl = document.getElementById("focusStatus");
  const startBtn = document.getElementById("startFocusBtn");
  const stopBtn = document.getElementById("stopFocusBtn");


  const creditsStatusEl = document.getElementById("creditsStatus");

  // backend base (same port you use in manifest host_permissions)
  const BACKEND_BASE = BACKEND_BASE_GLOBAL;
  const FOCUS_POLL_MS = 1000;

  let focusSnapshot = null;
  let focusPollTimer = null;
  let focusTickTimer = null;
  let focusRequestInFlight = false;
  let isStartInFlight = false;
  let isStopInFlight = false;

  // --- helpers to render UI ---

  function renderGrowinStatus(status) {
    // status from background: { isConnected, isChromeFocused, isSleep, activePage, reconnectFail }
    if (!status.isConnected) {
      backendStatusEl.className = "status-card status-error";
      backendStatusEl.textContent = "Not connected to Growin backend";

      // If backend is not connected, credits cannot be fetched
      if (creditsStatusEl) {
        creditsStatusEl.className = "status-card status-neutral";
        creditsStatusEl.textContent = "Credits: —";
      }
    } else {
      backendStatusEl.className = "status-card status-ok";
      backendStatusEl.textContent = "Connected to Growin backend";
    }
  }

  function normalizeFocusStatus(raw) {
    if (!raw || typeof raw !== "object") return null;
    const isRunning = raw.isRunning ?? raw.IsRunning;
    if (isRunning === undefined) return null;
    return {
      isRunning: !!isRunning,
      remainingSeconds: Number(raw.remainingSeconds ?? raw.RemainingSeconds ?? 0),
      isFailed: !!(raw.isFailed ?? raw.IsFailed),
      isViolating: !!(raw.isViolating ?? raw.IsViolating),
      violationSeconds: Number(raw.violationSeconds ?? raw.ViolationSeconds ?? 0),
      currentProcess: raw.currentProcess ?? raw.CurrentProcess ?? null,
      failReason: raw.failReason ?? raw.FailReason ?? null,
    };
  }

  function formatClock(secRaw) {
    const total = Math.max(0, Math.floor(Number(secRaw) || 0));
    const mm = String(Math.floor(total / 60)).padStart(2, "0");
    const ss = String(total % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  }

  function estimateRemainingSeconds(focus) {
    if (!focus || !focus.isRunning) return 0;

    const base = Math.max(0, Number(focus.remainingSeconds) || 0);
    const receivedAt = Number(focus.receivedAtMs) || Date.now();
    const elapsed = Math.max(0, (Date.now() - receivedAt) / 1000);
    return Math.max(0, Math.round(base - elapsed));
  }

  function renderFocusStatus(focus) {
    // expect from background: { isRunning, remainingSeconds, … } or null
    if (!focus || focus.isRunning === undefined) {
      focusStatusEl.className = "status-card status-neutral";
      focusStatusEl.textContent = "Focus session: unknown";
      startBtn.disabled = isStartInFlight;
      stopBtn.disabled = true;
      return;
    }

    if (focus.isRunning) {
      focusStatusEl.className = "status-card status-ok";
      const leftSec = estimateRemainingSeconds(focus);
      focusStatusEl.textContent = `Focus is ON · ${formatClock(leftSec)} left`;
      startBtn.disabled = true;
      stopBtn.disabled = isStopInFlight;
    } else {
      focusStatusEl.className = "status-card status-neutral";
      focusStatusEl.textContent = "Focus is OFF";
      startBtn.disabled = isStartInFlight;
      stopBtn.disabled = true;
    }
  }

  function setFocusSnapshot(raw) {
    const normalized = normalizeFocusStatus(raw);
    if (!normalized) {
      focusSnapshot = null;
      renderFocusStatus(null);
      return;
    }

    focusSnapshot = {
      ...raw,
      ...normalized,
      remainingSeconds: Math.max(0, Number(normalized.remainingSeconds) || 0),
      receivedAtMs: Date.now(),
    };

    renderFocusStatus(focusSnapshot);
  }

  async function fetchFocusStatusDirect() {
    try {
      const res = await fetch(`${BACKEND_BASE}/api/focus/status`, {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data || null;
    } catch {
      return null;
    }
  }

  function requestFocusStatusOnce() {
    if (focusRequestInFlight) return;
    focusRequestInFlight = true;

    fetchFocusStatusDirect()
      .then((status) => {
        const normalized = normalizeFocusStatus(status);
        if (normalized) {
          setFocusSnapshot(normalized);
          return;
        }

        chrome.runtime.sendMessage({ type: "FOCUS_GET_STATUS" }, (response) => {
          if (chrome.runtime.lastError) {
            return;
          }
          const next = normalizeFocusStatus(response || null);
          if (next) setFocusSnapshot(next);
        });
      })
      .finally(() => {
        focusRequestInFlight = false;
      });
  }

  function startFocusSync() {
    if (focusPollTimer) clearInterval(focusPollTimer);
    if (focusTickTimer) clearInterval(focusTickTimer);

    requestFocusStatusOnce();

    focusPollTimer = setInterval(() => {
      requestFocusStatusOnce();
    }, FOCUS_POLL_MS);

    focusTickTimer = setInterval(() => {
      if (!focusSnapshot?.isRunning) return;
      renderFocusStatus(focusSnapshot);
    }, 250);
  }

  function startFocusViaBackground() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "FOCUS_START" }, (response) => {
        if (chrome.runtime.lastError) {
          resolve({ success: false, error: chrome.runtime.lastError.message });
          return;
        }
        resolve(response || { success: false, error: "no response" });
      });
    });
  }

  function stopFocusViaBackground() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "FOCUS_STOP" }, (response) => {
        if (chrome.runtime.lastError) {
          resolve({ success: false, error: chrome.runtime.lastError.message });
          return;
        }
        resolve(response || { success: false, error: "no response" });
      });
    });
  }

  async function waitUntilFocusStopped(maxAttempts = 6) {
    for (let i = 0; i < maxAttempts; i += 1) {
      const status = await fetchFocusStatusDirect();
      const normalized = normalizeFocusStatus(status);
      if (normalized && !normalized.isRunning) {
        setFocusSnapshot(normalized);
        return true;
      }
      await new Promise((r) => setTimeout(r, 180));
    }
    return false;
  }


  async function fetchCredits() {
    if (!creditsStatusEl) return;

    creditsStatusEl.className = "status-card status-neutral";
    creditsStatusEl.textContent = "Credits: Loading...";

    try {
      const res = await fetch(`${BACKEND_BASE}/api/credits`, {
        method: "GET",
        headers: { "Accept": "application/json" },
      });

      if (!res.ok) {
        creditsStatusEl.className = "status-card status-error";
        creditsStatusEl.textContent = `Credits: Error (${res.status})`;
        return;
      }

      const data = await res.json();
      // ASP.NET usually serializes to camelCase => { credits: number }
      const credits = data.credits ?? data.Credits ?? 0;

      creditsStatusEl.className = "status-card status-ok";
      creditsStatusEl.textContent = `Credits: ${credits}`;
    } catch (err) {
      creditsStatusEl.className = "status-card status-error";
      creditsStatusEl.textContent = "Credits: Offline";
    }
  }

  // --- initial load: ask background for status ---

  chrome.runtime.sendMessage({ type: "GET_GROWIN_STATUS" }, async (response) => {
    if (chrome.runtime.lastError) {
      backendStatusEl.className = "status-card status-error";
      backendStatusEl.textContent = "Extension error: " + chrome.runtime.lastError.message;
      return;
    }

    if (response) {
      renderGrowinStatus(response);


      if (response.isConnected) {
        await fetchCredits();
      }
    }
  });

  startFocusSync();

  // --- button handlers ---

  startBtn.addEventListener("click", async () => {
    if (isStartInFlight || isStopInFlight) return;
    isStartInFlight = true;
    startBtn.disabled = true;

    try {
      let response = await startFocusDirect();
      if (!response?.success) {
        response = await startFocusViaBackground();
      }
      if (response && response.success) {
        setFocusSnapshot(response.status || null);
        requestFocusStatusOnce();

        // Optional: if starting focus affects credits in your system, refresh here later
        // fetchCredits();
      } else {
        focusStatusEl.className = "status-card status-error";
        focusStatusEl.textContent =
          "Failed to start focus: " + (response && response.error ? response.error : "unknown error");
      }
    } catch (err) {
      focusStatusEl.className = "status-card status-error";
      focusStatusEl.textContent = "Failed to start focus: " + String(err);
    } finally {
      isStartInFlight = false;
      renderFocusStatus(focusSnapshot);
    }
  });

  stopBtn.addEventListener("click", async () => {
    if (isStopInFlight || isStartInFlight) return;
    isStopInFlight = true;
    stopBtn.disabled = true;

    try {
      let response = await stopFocusDirect();
      if (!response?.success) {
        response = await stopFocusViaBackground();
      }

      if (response && response.success) {
        setFocusSnapshot({ isRunning: false, remainingSeconds: 0 });
        const confirmed = await waitUntilFocusStopped();
        if (!confirmed) requestFocusStatusOnce();

        // Optional: if stopping focus awards credits, refresh here later
        // fetchCredits();
      } else {
        focusStatusEl.className = "status-card status-error";
        focusStatusEl.textContent =
          "Failed to stop focus: " + (response && response.error ? response.error : "unknown error");
      }
    } catch (err) {
      focusStatusEl.className = "status-card status-error";
      focusStatusEl.textContent = "Failed to stop focus: " + String(err);
    } finally {
      isStopInFlight = false;
      requestFocusStatusOnce();
      renderFocusStatus(focusSnapshot);
    }
  });

  window.addEventListener("unload", () => {
    if (focusPollTimer) clearInterval(focusPollTimer);
    if (focusTickTimer) clearInterval(focusTickTimer);
    focusPollTimer = null;
    focusTickTimer = null;
  });
});
  async function startFocusDirect() {
    try {
      const res = await fetch(`${BACKEND_BASE_GLOBAL}/api/focus/preference`, { method: "GET", headers: { Accept: "application/json" } });
      let durationSeconds = 25 * 60;
      if (res.ok) {
        const pref = await res.json();
        const n = Number(pref?.preferredDurationSeconds ?? pref?.PreferredDurationSeconds);
        if (Number.isFinite(n) && n > 0) durationSeconds = Math.round(n);
      }

      const body = {
        durationSeconds,
        allowedProcesses: ["chrome.exe"],
        allowedWebsites: [],
      };

      const r = await fetch(`${BACKEND_BASE_GLOBAL}/api/focus/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        return { success: false, error: await r.text() };
      }
      return { success: true, status: await r.json() };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }

  async function stopFocusDirect() {
    try {
      const r = await fetch(`${BACKEND_BASE_GLOBAL}/api/focus/stop`, { method: "POST" });
      if (!r.ok) {
        return { success: false, error: await r.text() };
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }
