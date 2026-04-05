// 2026/04/05 edited by zhechengxu
// Changes:
//  - Send website usage in realtime with robust fallback to /api/usage.
//  - Load focus defaults (allowed apps/websites + grace seconds) before extension start.

// 2026/03/25 edited by Zhecheng Xu
// Changes:
//  - Add focus control and status message bridge for popup sync.
//  - Keep usage tracking + backend communication flow documented.

// ================================
// Growin background script
// ================================

// ---- Config ----
const TEN_SECONDS_MS = 10 * 1000;
const FOCUSED_CHECK_MS = 1000;
const RENOTIFY_MS = 10 * 1000;
const RECONNECTFAIL_SLEEP = 5;

// Backend REST API base URL (from `dotnet run` output)
// 2026/04/05 edited by zhechengxu
const API_BASE = "http://localhost:5024"; // 🔧 change port if needed
const USAGE_ENDPOINT = `${API_BASE}/api/usage`; // you'll implement this on backend
const USAGE_REALTIME_ENDPOINT = `${API_BASE}/api/usage/realtime`;
const FOCUS_ENDPOINT = `${API_BASE}/api/Focus`;

// 🔧 Turn this ON later when your backend WS server is ready
const USE_GROWIN_WEBSOCKET = false;
const GROWIN_WS_URL = "ws://localhost:9000";


// ---- WebSocket state ----
let growinWebSocket = null;
let isGrowinConnected = false;
let isChromeFocused = true;
let autoReConnectIntervalId = null;
let isGrowinSleep = false;
let reconnectFail = 0;
let growinNotifyFailList = [];

// ---- Active page tracking ----
let growinActivePage = {
  url: "",
  title: "",
  icon: "",
  domain: "",
  startTime: "",
  endTime: "",
  duration: 0,
  realtimeCursorTime: 0,
};

let realtimeSecondsPending = 0;
let realtimeSendInFlight = false;
let isRealtimeEndpointUnavailable = false;
let hasLoggedRealtimeFallback = false;
let realtimeDebugWindowStartMs = Date.now();
let realtimeDebugAccumulatedSeconds = 0;
let realtimeDebugLastDomain = "";

// =====================================
// Init
// =====================================

initGrowin();

function initGrowin() {
  if (USE_GROWIN_WEBSOCKET) {
    connectGrowin();
  } else {
    console.log(
      "[Growin] WebSocket disabled (no backend server running yet)."
    );
  }
  startWatchFocus();
  startRenotify();
}

// =====================================
// WebSocket handling
// =====================================
async function getFocusStatus() {
  try {
    const res = await fetch(`${FOCUS_ENDPOINT}/status`);
    if (!res.ok) return null;
    const data = await res.json(); // expected: FocusStatusResponse
    // e.g. { isRunning: true, remainingSeconds: 1234, ... }
    return data;
  } catch (err) {
    console.error("[Growin] FOCUS_GET_STATUS error:", err);
    return null;
  }
}

async function startFocusSession() {
  let durationSeconds = 25 * 60;
  let allowedProcesses = ["chrome.exe"];
  let allowedWebsites = [];
  let graceSeconds = 10;

  try {
    const prefRes = await fetch(`${FOCUS_ENDPOINT}/preference`);
    if (prefRes.ok) {
      const pref = await prefRes.json();
      const n = Number(pref?.preferredDurationSeconds ?? pref?.PreferredDurationSeconds);
      if (Number.isFinite(n) && n > 0) durationSeconds = Math.round(n);
    }
  } catch {
    // fallback to 25min
  }

  try {
    const defaultsRes = await fetch(`${FOCUS_ENDPOINT}/defaults`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    if (defaultsRes.ok) {
      const defaults = await defaultsRes.json();
      if (Array.isArray(defaults?.allowedProcesses) && defaults.allowedProcesses.length) {
        allowedProcesses = defaults.allowedProcesses;
      }
      if (Array.isArray(defaults?.allowedWebsites)) {
        allowedWebsites = defaults.allowedWebsites;
      }
      const g = Number(defaults?.graceSeconds);
      if (Number.isFinite(g) && g > 0) graceSeconds = Math.round(g);
    }
  } catch {
    // keep fallback defaults
  }

  // ⚠️ This body must match your StartFocusRequest model
  const body = {
    durationSeconds,
    allowedProcesses,
    allowedWebsites,
    graceSeconds,
  };

  try {
    const res = await fetch(`${FOCUS_ENDPOINT}/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errorText = await res.text();
      return { success: false, error: errorText };
    }

    const status = await res.json();
    return { success: true, status };
  } catch (err) {
    console.error("[Growin] FOCUS_START error:", err);
    return { success: false, error: String(err) };
  }
}

async function stopFocusSession() {
  try {
    const res = await fetch(`${FOCUS_ENDPOINT}/stop`, {
      method: "POST",
    });

    if (!res.ok) {
      const errorText = await res.text();
      return { success: false, error: errorText };
    }

    return { success: true };
  } catch (err) {
    console.error("[Growin] FOCUS_STOP error:", err);
    return { success: false, error: String(err) };
  }
}

function connectGrowin() {
  if (!USE_GROWIN_WEBSOCKET) {
    console.log("[Growin] Skipping WebSocket connection (disabled).");
    return;
  }

  growinWebSocket = new WebSocket(GROWIN_WS_URL);

  growinWebSocket.onopen = () => {
    isGrowinConnected = true;
    isGrowinSleep = false;
    reconnectFail = 0;
    clearInterval(autoReConnectIntervalId);
    keepGrowinAlive();
    console.log("[Growin] WebSocket connected");
  };

  growinWebSocket.onmessage = (event) => {
    console.log("[Growin] WS message:", event.data);

    if (event.data === "sleep") {
      isGrowinSleep = true;
      calDuration();
      console.log("[Growin] Sleep mode");
    } else if (event.data === "wake") {
      isGrowinSleep = false;
      console.log("[Growin] Wake up");
    }
  };

  growinWebSocket.onclose = () => {
    isGrowinConnected = false;
    console.warn("[Growin] WebSocket disconnected");
    growinWebSocket = null;
    startAutoReConnect();
  };
}

function startAutoReConnect() {
  if (!USE_GROWIN_WEBSOCKET) return;

  clearInterval(autoReConnectIntervalId);
  autoReConnectIntervalId = setInterval(() => {
    if (!isGrowinConnected) {
      console.log("[Growin] Attempting to reconnect WebSocket...");
      connectGrowin();
      reconnectFail++;

      if (reconnectFail >= RECONNECTFAIL_SLEEP && !isGrowinSleep) {
        isGrowinSleep = true;
      }
    }
  }, TEN_SECONDS_MS);
}

function keepGrowinAlive() {
  if (!USE_GROWIN_WEBSOCKET) return;

  const keepAliveIntervalId = setInterval(() => {
    if (isGrowinConnected && growinWebSocket) {
      console.log("[Growin] ping");
      growinWebSocket.send("ping");
    } else {
      clearInterval(keepAliveIntervalId);
    }
  }, TEN_SECONDS_MS);
}

function notifyGrowinServer(data) {
  if (!USE_GROWIN_WEBSOCKET) {
    console.log("[Growin] (WS disabled) sending via REST:", data);
    sendUsageToBackend(data);
    return;
  }

  console.log("[Growin] notify (WebSocket)", data);
  if (isGrowinConnected && growinWebSocket) {
    growinWebSocket.send(JSON.stringify(data));
  } else {
    growinNotifyFailList.push(data);
    console.log("[Growin] queued (fail list):", growinNotifyFailList);
  }
}


function renotifyGrowin() {
  if (!USE_GROWIN_WEBSOCKET) return;

  if (isGrowinConnected && growinWebSocket && growinNotifyFailList.length > 0) {
    const item = growinNotifyFailList[0];
    growinNotifyFailList.splice(0, 1);
    notifyGrowinServer(item);
  }
}

// =====================================
// REST API calls
// =====================================

async function sendUsageToBackend(data) {
  try {
    // Backend API we plan: POST /api/usage
    // Body format: an array of usage items, so backend can accept batches
    const body = [data];

    const res = await fetch(USAGE_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      console.error("[Growin] REST usage POST failed:", res.status);
    } else {
      console.log("[Growin] REST usage POST ok");
    }
  } catch (err) {
    console.error("[Growin] REST usage POST error:", err);
  }
}

function queueRealtimeUsage(seconds) {
  const safeSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
  if (!safeSeconds) return;
  realtimeSecondsPending += safeSeconds;
  reportRealtimeDebug(safeSeconds);
  void flushRealtimeUsage();
}

function reportRealtimeDebug(deltaSeconds) {
  const now = Date.now();
  realtimeDebugAccumulatedSeconds += Math.max(0, Number(deltaSeconds) || 0);
  realtimeDebugLastDomain = String(growinActivePage?.domain || "");

  if (now - realtimeDebugWindowStartMs < 5000) return;

  const windowSeconds = Math.max(0, Math.floor(realtimeDebugAccumulatedSeconds));
  const domain = realtimeDebugLastDomain || "(unknown)";
  console.log(
    `[Growin][Realtime] domain=${domain} +${windowSeconds}s pending=${realtimeSecondsPending}s running=${!!growinActivePage?.url}`
  );

  realtimeDebugWindowStartMs = now;
  realtimeDebugAccumulatedSeconds = 0;
}

async function flushRealtimeUsage() {
  if (realtimeSendInFlight) return;
  if (!growinActivePage || !growinActivePage.url) return;
  if (realtimeSecondsPending <= 0) return;

  realtimeSendInFlight = true;

  try {
    while (realtimeSecondsPending > 0 && growinActivePage && growinActivePage.url) {
      const payloadSeconds = 1;
      realtimeSecondsPending = Math.max(0, realtimeSecondsPending - payloadSeconds);

      try {
        if (isRealtimeEndpointUnavailable) {
          await sendRealtimeChunkViaUsageEndpoint(payloadSeconds);
          continue;
        }

        const body = [{
          url: growinActivePage.url,
          domain: growinActivePage.domain,
          duration: payloadSeconds,
        }];

        const res = await fetch(USAGE_REALTIME_ENDPOINT, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(body)
        });

        if (!res.ok) {
          // Older backend may not expose /api/usage/realtime yet.
          if (res.status === 404 || res.status === 405) {
            isRealtimeEndpointUnavailable = true;
          }

          if (!hasLoggedRealtimeFallback) {
            hasLoggedRealtimeFallback = true;
            console.warn(`[Growin] realtime endpoint unavailable (${res.status}), fallback to /api/usage`);
          }

          await sendRealtimeChunkViaUsageEndpoint(payloadSeconds);
        }
      } catch {
        try {
          if (!hasLoggedRealtimeFallback) {
            hasLoggedRealtimeFallback = true;
            console.warn("[Growin] realtime endpoint request failed, fallback to /api/usage");
          }
          await sendRealtimeChunkViaUsageEndpoint(payloadSeconds);
        } catch {
          realtimeSecondsPending += payloadSeconds;
          break;
        }
      }
    }
  } finally {
    realtimeSendInFlight = false;
  }

  if (realtimeSecondsPending > 0 && growinActivePage && growinActivePage.url) {
    setTimeout(() => {
      void flushRealtimeUsage();
    }, 0);
  }
}

async function sendRealtimeChunkViaUsageEndpoint(durationSeconds) {
  if (!growinActivePage || !growinActivePage.url) return;

  const safeSeconds = Math.max(1, Math.floor(Number(durationSeconds) || 0));
  const endTime = new Date();
  const startTime = new Date(endTime.getTime() - safeSeconds * 1000);
  const body = [{
    url: growinActivePage.url,
    title: growinActivePage.title || "",
    icon: growinActivePage.icon || "",
    domain: growinActivePage.domain || safeGetDomain(growinActivePage.url),
    startTime: startTime.toISOString(),
    endTime: endTime.toISOString(),
    duration: safeSeconds,
  }];

  const res = await fetch(USAGE_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    throw new Error(`usage fallback failed ${res.status}`);
  }
}


function startRenotify() {
  setInterval(() => {
    renotifyGrowin();
  }, RENOTIFY_MS);
}

// =====================================
// Chrome events & messages
// =====================================

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const tab = await getTab(activeInfo.tabId);
  onActivePage(tab);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!tab?.active) return;

  // Prefer URL-driven updates for realtime focus tracking.
  // Some websites trigger many "complete" updates without meaningful navigation,
  // which used to reset violation accumulation too often.
  if (typeof changeInfo?.url === "string" && changeInfo.url.length > 0) {
    onActivePage(tab);
    return;
  }

  // Initial page load fallback.
  if (changeInfo.status === "complete") {
    onActivePage(tab);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GROWIN_TIME_UPDATE") {
    // ... existing code ...
  } else if (message.type === "GROWIN_TITLE_UPDATE") {
    // ... existing code ...
  } else if (message.type === "GET_GROWIN_STATUS") {
  const isBackendConnected = USE_GROWIN_WEBSOCKET ? isGrowinConnected : true;

  sendResponse({
    isConnected: isBackendConnected,
    isChromeFocused: isChromeFocused,
    isSleep: isGrowinSleep,
    activePage: growinActivePage,
    reconnectFail: reconnectFail,
  });
  return true;
} else if (message.type === "GROWIN_CONNECT") {
    connectGrowin();
    sendResponse({ success: true });
    return true;

  // --- NEW: focus APIs for popup ---

  } else if (message.type === "FOCUS_GET_STATUS") {
    getFocusStatus().then(
      (status) => sendResponse(status),
      () => sendResponse(null)
    );
    return true; // async

  } else if (message.type === "FOCUS_START") {
    startFocusSession().then(
      (result) => sendResponse(result),
      (err) => sendResponse({ success: false, error: String(err) })
    );
    return true;

  } else if (message.type === "FOCUS_STOP") {
    stopFocusSession().then(
      (result) => sendResponse(result),
      (err) => sendResponse({ success: false, error: String(err) })
    );
    return true;
  }
});


// =====================================
// Helper functions
// =====================================

function getTab(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.get(tabId, (tab) => {
      resolve(tab);
    });
  });
}

function isFocused() {
  return new Promise((resolve) => {
    chrome.windows.getCurrent((w) => {
      resolve(w.focused);
    });
  });
}

function getCurrentTab() {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs.length > 0) {
        resolve(tabs[0]);
      } else {
        reject(tabs);
      }
    });
  });
}

function onActivePage(tab) {
  if (isGrowinSleep) return;
  if (!tab || !tab.url) return;

  const nextUrl = String(tab.url || "");
  const nextDomain = safeGetDomain(nextUrl);
  const now = Date.now();

  if (growinActivePage && growinActivePage.url) {
    const currentDomain = String(growinActivePage.domain || "");
    const sameUrl = growinActivePage.url === nextUrl;
    const sameDomain = !!nextDomain && currentDomain === nextDomain;

    if (!sameUrl && !sameDomain) {
      calDuration();
      setActive(tab);
    } else {
      // Same site (or same URL): only refresh metadata.
      // Do not reset realtime cursor, otherwise website violation becomes insensitive.
      growinActivePage.url = nextUrl;
      growinActivePage.title = tab.title || growinActivePage.title || "";
      growinActivePage.icon = tab.favIconUrl || growinActivePage.icon || "";
      if (nextDomain) {
        growinActivePage.domain = nextDomain;
      }
      if (!growinActivePage.pageStartTime) {
        growinActivePage.pageStartTime = now;
      }
      if (!growinActivePage.realtimeCursorTime) {
        growinActivePage.realtimeCursorTime = now;
      }
    }
  } else {
    setActive(tab);
  }
}

function safeGetDomain(rawUrl) {
  try {
    const u = new URL(String(rawUrl || ""));
    return u.hostname || "";
  } catch {
    return "";
  }
}

function setActive(tab) {
  const { url, title, favIconUrl: icon } = tab;
  if (url && !url.startsWith("chrome://")) {
    const now = Date.now();
    growinActivePage = {
      url,
      title: title || "",
      icon: icon || "",
      domain: new URL(url).hostname,
      startTime: new Date().toISOString(),
      endTime: null,
      duration: 0,
      pageStartTime: now,
      realtimeCursorTime: now,
    };
    realtimeSecondsPending = 0;
  } else {
    growinActivePage = null;
    realtimeSecondsPending = 0;
  }
}

function calDuration() {
  if (growinActivePage && growinActivePage.url) {
    const endTime = new Date().toISOString();

    const currentSessionDuration = growinActivePage.pageStartTime
      ? Math.round((Date.now() - growinActivePage.pageStartTime) / 1000)
      : 0;

    const totalDuration = growinActivePage.duration + currentSessionDuration;

    const data = {
      url: growinActivePage.url,
      title: growinActivePage.title,
      icon: growinActivePage.icon,
      domain: growinActivePage.domain,
      startTime: growinActivePage.startTime,
      endTime: endTime,
      duration: totalDuration, // seconds
    };

    console.log(
      `[Growin] Page ${growinActivePage.domain} total duration: ${totalDuration}s`
    );

    growinActivePage = null;
    realtimeSecondsPending = 0;
    notifyGrowinServer(data);
  }
}

function startWatchFocus() {
  console.log("[Growin] Start watching Chrome window focus");
  setInterval(async () => {
    const focused = await isFocused();
    if (focused) {
      if (!isChromeFocused) {
        isChromeFocused = true;
        const tab = await getCurrentTab();
        onActivePage(tab);
        console.warn("[Growin] Focus regained → reset tracking");
      }

      if (growinActivePage && growinActivePage.url) {
        const now = Date.now();
        const cursor = Math.max(0, Number(growinActivePage.realtimeCursorTime || growinActivePage.pageStartTime || now));
        const deltaSeconds = Math.floor((now - cursor) / 1000);
        if (deltaSeconds > 0) {
          growinActivePage.realtimeCursorTime = cursor + deltaSeconds * 1000;
          queueRealtimeUsage(deltaSeconds);
        }
      }
    } else {
      if (isChromeFocused) {
        isChromeFocused = false;
        calDuration();
        console.warn("[Growin] Chrome lost focus → finalize page");
      }
    }
  }, FOCUSED_CHECK_MS);
}

// Initialize the active tab once on startup
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  if (tabs[0]) {
    onActivePage(tabs[0]);
  }
});

