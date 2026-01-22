// Growin: per-page time tracking in the content script

let growinPageStartTime = Date.now();
let isGrowinPageVisible = !document.hidden;
let growinTotalTimeSpent = 0;

// Page visibility changes: fires when the tab becomes hidden/visible
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    // Tab just changed from visible → hidden
    if (isGrowinPageVisible) {
      const timeSpent = Date.now() - growinPageStartTime;
      growinTotalTimeSpent += timeSpent;
      sendGrowinTimeToBackground(timeSpent);
      isGrowinPageVisible = false;
    }
  } else {
    // Tab becomes visible again → restart timing
    growinPageStartTime = Date.now();
    isGrowinPageVisible = true;
  }
});

// Before the page is closed / refreshed / navigated away, send the final time slice
window.addEventListener("beforeunload", () => {
  if (isGrowinPageVisible) {
    const timeSpent = Date.now() - growinPageStartTime;
    growinTotalTimeSpent += timeSpent;
    sendGrowinTimeToBackground(timeSpent);
  }
});

// Watch for title changes and notify the background to update activePage.title
let growinLastTitle = document.title;
const growinTitleObserver = new MutationObserver(() => {
  if (document.title !== growinLastTitle) {
    growinLastTitle = document.title;
    chrome.runtime.sendMessage({
      type: "GROWIN_TITLE_UPDATE",
      title: document.title,
    });
  }
});

const titleNode = document.querySelector("title") || document.head;
if (titleNode) {
  growinTitleObserver.observe(titleNode, {
    childList: true,
    subtree: true,
  });
}

// Helper: send the “this visible period’s time” to the background script
function sendGrowinTimeToBackground(timeSpent) {
  chrome.runtime.sendMessage({
    type: "GROWIN_TIME_UPDATE",
    timeSpent: timeSpent,            // duration of this visible segment (ms)
    totalTime: growinTotalTimeSpent, // accumulated visible time (ms)
  });
}
