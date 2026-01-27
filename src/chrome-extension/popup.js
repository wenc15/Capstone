document.addEventListener("DOMContentLoaded", () => {
  const backendStatusEl = document.getElementById("backendStatus");
  const focusStatusEl = document.getElementById("focusStatus");
  const startBtn = document.getElementById("startFocusBtn");
  const stopBtn = document.getElementById("stopFocusBtn");

  // --- helpers to render UI ---

  function renderGrowinStatus(status) {
    // status from background: { isConnected, isChromeFocused, isSleep, activePage, reconnectFail }
    if (!status.isConnected) {
      backendStatusEl.className = "status-card status-error";
      backendStatusEl.textContent = "Not connected to Growin backend";
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

  // --- initial load: ask background for status ---

  chrome.runtime.sendMessage({ type: "GET_GROWIN_STATUS" }, (response) => {
    if (chrome.runtime.lastError) {
      backendStatusEl.className = "status-card status-error";
      backendStatusEl.textContent = "Extension error: " + chrome.runtime.lastError.message;
      return;
    }
    if (response) {
      renderGrowinStatus(response);
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
      } else {
        // simple error display
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
      } else {
        focusStatusEl.className = "status-card status-error";
        focusStatusEl.textContent =
          "Failed to stop focus: " + (response && response.error ? response.error : "unknown error");
      }
      // After stop, allow start again
      startBtn.disabled = false;
    });
  });
});
