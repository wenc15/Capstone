// Growin: per-page time tracking in the content script

let growinPageStartTime = Date.now();
let isGrowinPageVisible = !document.hidden;
let growinTotalTimeSpent = 0;

// 页面可见性变化：当标签页变成隐藏/显示时触发
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    // Tab 刚刚从“可见”变成“隐藏”
    if (isGrowinPageVisible) {
      const timeSpent = Date.now() - growinPageStartTime;
      growinTotalTimeSpent += timeSpent;
      sendGrowinTimeToBackground(timeSpent);
      isGrowinPageVisible = false;
    }
  } else {
    // Tab 再次可见，重新开始计时
    growinPageStartTime = Date.now();
    isGrowinPageVisible = true;
  }
});

// 页面关闭 / 刷新 / 跳转 前发送最后一段时间
window.addEventListener("beforeunload", () => {
  if (isGrowinPageVisible) {
    const timeSpent = Date.now() - growinPageStartTime;
    growinTotalTimeSpent += timeSpent;
    sendGrowinTimeToBackground(timeSpent);
  }
});

// 监听标题变化，通知 background 更新 activePage.title
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

// 封装发送“本次可见时段时间”的函数
function sendGrowinTimeToBackground(timeSpent) {
  chrome.runtime.sendMessage({
    type: "GROWIN_TIME_UPDATE",
    timeSpent: timeSpent,            // 当前这一段的持续时间（毫秒）
    totalTime: growinTotalTimeSpent, // 所有可见时间累计（毫秒）
  });
}
