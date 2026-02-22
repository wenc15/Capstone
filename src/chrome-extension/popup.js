document.addEventListener("DOMContentLoaded", () => {
  const backendStatusEl = document.getElementById("backendStatus");
  const focusStatusEl = document.getElementById("focusStatus");
  const startBtn = document.getElementById("startFocusBtn");
  const stopBtn = document.getElementById("stopFocusBtn");


  const creditsStatusEl = document.getElementById("creditsStatus");

  // backend base (same port you use in manifest host_permissions)
  const BACKEND_BASE = "http://localhost:5024";

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

  function renderFocusStatus(focus) {
    // expect from background: { isRunning, remainingSeconds, … } or null
    if (!focus || focus.isRunning === undefined) {
      focusStatusEl.className = "status-card status-neutral";
      focusStatusEl.textContent = "Focus session: unknown";
      startBtn.disabled = false;
      stopBtn.disabled = true;
      return;
    }

    if (focus.isRunning) {
      focusStatusEl.className = "status-card status-ok";
      const minutes = Math.ceil((focus.remainingSeconds || 0) / 60);
      focusStatusEl.textContent = `Focus is ON · ~${minutes} min left`;
      startBtn.disabled = true;
      stopBtn.disabled = false;
    } else {
      focusStatusEl.className = "status-card status-neutral";
      focusStatusEl.textContent = "Focus is OFF";
      startBtn.disabled = false;
      stopBtn.disabled = true;
    }
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

  chrome.runtime.sendMessage({ type: "FOCUS_GET_STATUS" }, (response) => {
    if (response) {
      renderFocusStatus(response);
    } else {
      renderFocusStatus(null);
    }
  });

  // --- button handlers ---

  startBtn.addEventListener("click", () => {
    startBtn.disabled = true;

    chrome.runtime.sendMessage({ type: "FOCUS_START" }, (response) => {
      if (response && response.success) {
        renderFocusStatus(response.status);

        // Optional: if starting focus affects credits in your system, refresh here later
        // fetchCredits();
      } else {
        focusStatusEl.className = "status-card status-error";
        focusStatusEl.textContent =
          "Failed to start focus: " + (response && response.error ? response.error : "unknown error");
        startBtn.disabled = false;
      }
    });
  });

  stopBtn.addEventListener("click", () => {
    stopBtn.disabled = true;

    chrome.runtime.sendMessage({ type: "FOCUS_STOP" }, (response) => {
      if (response && response.success) {
        renderFocusStatus({ isRunning: false });

        // Optional: if stopping focus awards credits, refresh here later
        // fetchCredits();
      } else {
        focusStatusEl.className = "status-card status-error";
        focusStatusEl.textContent =
          "Failed to stop focus: " + (response && response.error ? response.error : "unknown error");
      }
      startBtn.disabled = false;
    });
  });
});
