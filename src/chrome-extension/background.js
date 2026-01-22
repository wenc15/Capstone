// ================================
// Growin background script
// ================================

// ---- Config ----
const TEN_SECONDS_MS = 10 * 1000;
const FOCUSED_CHECK_MS = 1000;
const RENOTIFY_MS = 10 * 1000;
const RECONNECTFAIL_SLEEP = 5;

// Backend REST API base URL (from `dotnet run` output)
const API_BASE = "http://localhost:5024"; // 🔧 change port if needed
const USAGE_ENDPOINT = `${API_BASE}/api/usage`; // you'll implement this on backend

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
};

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
  if (changeInfo.status === "complete" && tab.active) {
    onActivePage(tab);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GROWIN_TIME_UPDATE") {
    if (growinActivePage && growinActivePage.url) {
      growinActivePage.duration += Math.round(message.timeSpent / 1000); // ms → s
    }
  } else if (message.type === "GROWIN_TITLE_UPDATE") {
    if (growinActivePage && growinActivePage.url) {
      growinActivePage.title = message.title;
    }
  } else if (message.type === "GET_GROWIN_STATUS") {
    sendResponse({
      isConnected: isGrowinConnected,
      isChromeFocused: isChromeFocused,
      isSleep: isGrowinSleep,
      activePage: growinActivePage,
      reconnectFail: reconnectFail,
    });
    return true;
  } else if (message.type === "GROWIN_CONNECT") {
    console.log("[Growin] Connect request from UI");
    connectGrowin();
    sendResponse({ success: true });
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

  if (growinActivePage && growinActivePage.url) {
    if (growinActivePage.url !== tab.url) {
      calDuration();
      setActive(tab);
    } else {
      // same page; reset session start time
      growinActivePage.pageStartTime = Date.now();
    }
  } else {
    setActive(tab);
  }
}

function setActive(tab) {
  const { url, title, favIconUrl: icon } = tab;
  if (url && !url.startsWith("chrome://")) {
    growinActivePage = {
      url,
      title: title || "",
      icon: icon || "",
      domain: new URL(url).hostname,
      startTime: new Date().toISOString(),
      endTime: null,
      duration: 0,
      pageStartTime: Date.now(),
    };
  } else {
    growinActivePage = null;
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

