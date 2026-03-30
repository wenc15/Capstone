// 2026/03/25 edited by Zhecheng Xu
// Changes:
//  - Add widget music prev/next controls and SVG icon controls.
//  - Sync widget color tone with app settings updates.

// 2025/11/18 edited by Jingyao(重点：与主计时器同步):
// 新增内容：
//   - 新增 createBackendSession()使 widget 与主计时器的启动逻辑统一。
//   - 新增 stopBackendSession()：widget Stop 会同步告知后端停止会话，
//   - 新增 broadcastState() 与统一的 updatePreview()，确保 widget 自身状态变化
//     会广播到主计时器 UI，使两者保持实时一致。
//   - Start / Stop 按钮事件改为 async 流程（先后端 → 再前端），实现真正的同步行为。
// =============================================================
// 修改内容：
//   - widget 不再自行独立启动计时。其 Start 必须等待 createBackendSession() 成功，
//     同主计时器逻辑保持一致，确保前端所有入口都指向同一后端会话。
//   - stopCountdown() 行为与 main timer 的 stop 行为合并逻辑，使双方 UI 停止时状态一致  
//     （隐藏 stop 按钮、重置滑条、刷新时间显示）。
//   - 移除 widget 内原有的本地-only 计时分支，统一使用 shared state 来管理，
//     避免与 main timer 出现“一个结束一个还在跑”的不同步问题。
// =============================================================
// 新增的作用：
//   - widget 与主计时器之间实现**双向同步**：无论从哪一侧 Start/Stop，
//     UI 与内部状态都会保持一致，避免重复计时与错乱。

// 2025/11/18 edited by Qinquan Wang:
// 新增内容：
// 暂停按钮改为停止按钮，图标和 aria-label 也相应更改。

// 12.21 updated by Jingyao: 使独立widget可调用主界面start

import { subscribeFocusStatus, getFocusStatus } from './focusStatusStore.js';

const APP_SETTINGS_LOCAL_KEY = 'growin:appBehaviorSettings';
const DEFAULT_GRACE_SECONDS = 10;

function normalizeUiTone(v) {
  return String(v || '').trim().toLowerCase() === 'sky' ? 'sky' : 'default';
}

function applyUiTone(tone) {
  const next = normalizeUiTone(tone);
  document.documentElement.setAttribute('data-ui-tone', next);
}

function loadUiToneLocalFallback() {
  try {
    const raw = localStorage.getItem(APP_SETTINGS_LOCAL_KEY);
    if (!raw) return 'default';
    const parsed = JSON.parse(raw);
    return normalizeUiTone(parsed?.uiTone);
  } catch {
    return 'default';
  }
}

// ---- Mount widget UI ----
export function mountWidget() {
  const root = document.getElementById('widget');
  if (!root) return;

  // Keep widget tone in sync with main app tone.
  applyUiTone(loadUiToneLocalFallback());
  const api = window.electronAPI;
  if (api?.getAppSettings) {
    api.getAppSettings()
      .then((st) => applyUiTone(st?.uiTone))
      .catch(() => {});
  }
  if (api?.onAppSettingsChanged) {
    api.onAppSettingsChanged((st) => applyUiTone(st?.uiTone));
  }

  const iconPlay = '<svg class="wg-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6l10 6-10 6z"></path></svg>';
  const iconStop = '<svg class="wg-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="1.5"></rect></svg>';
  const iconPrev = '<svg class="wg-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6h2v12H8z"></path><path d="M17 6l-7 6 7 6z"></path></svg>';
  const iconNext = '<svg class="wg-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 6h2v12h-2z"></path><path d="M7 6l7 6-7 6z"></path></svg>';

  root.innerHTML = `
    <div class="wg-time" id="wgTime">00:00</div>
    <div class="wg-controls" aria-label="Widget controls">
      <button class="wg-btn wg-btn-icon" id="wgPrev" aria-label="Previous track">${iconPrev}</button>
      <button class="wg-btn wg-btn-main" id="wgPlay" aria-label="Start/Stop">${iconPlay}</button>
      <button class="wg-btn wg-btn-icon" id="wgNext" aria-label="Next track">${iconNext}</button>
    </div>
  `;

  const elTime = root.querySelector('#wgTime');
  const btnPlay = root.querySelector('#wgPlay');
  const btnPrev = root.querySelector('#wgPrev');
  const btnNext = root.querySelector('#wgNext');
  let lastFocusToggleAt = 0;

  function formatSeconds(sec) {
    const total = Math.max(0, sec | 0);
    const m = Math.floor(total / 60).toString().padStart(2, '0');
    const s = (total % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  function getWidgetDisplaySeconds(st) {
    const base = Math.max(0, Number(st?.remainingSeconds ?? 0) || 0);
    if (!st?.isRunning || !st?.isViolating) return base;

    const violatingFor = Math.max(0, Number(st?.violationSeconds ?? 0) || 0);
    return Math.max(0, DEFAULT_GRACE_SECONDS - violatingFor);
  }

  function render(st) {
    elTime.textContent = formatSeconds(getWidgetDisplaySeconds(st));

    // ✅ 运行中显示 Stop 图标，不再是 Pause
    btnPlay.innerHTML = st.isRunning ? iconStop : iconPlay;
    btnPlay.classList.toggle('is-running', !!st.isRunning);

    root.classList.toggle('wg-running', !!st.isRunning);
    root.classList.toggle('wg-failed', !!st.isFailed);
    root.classList.toggle('wg-violating', !!st.isViolating);
  }

  // 初始化：用当前状态先画一次（比如 00:00、▶️）
  render(getFocusStatus());

  // 订阅：每次 timer UI 更新 status，这里自动重画
  subscribeFocusStatus(render);

  // ✅ widget 作为“遥控 Start / Stop”：
  // - 如果当前在运行 → 点一下 = 调用主界面 Stop
  // - 如果当前没在运行 → 点一下 = 调用主界面 Start
  //12.21 updated by Jingyao: 使独立widget可调用主界面start
  function triggerFocusToggle(e) {
    e?.preventDefault?.();
    e?.stopPropagation?.();

    const now = Date.now();
    if (now - lastFocusToggleAt < 180) return;
    lastFocusToggleAt = now;

    // Independent widget window can see slightly stale focus status.
    // Use main-window toggle command to avoid start/stop mis-branching.
    if (window.electronAPI?.sendFocusCommand) {
      window.electronAPI.sendFocusCommand('toggle');
      return;
    }

    // Embedded fallback (same page): directly click main start/stop button.
    const st = getFocusStatus();
    if (st.isRunning) {
      const mainStopBtn = document.getElementById('stopBtn');
      if (mainStopBtn) return mainStopBtn.click();
      console.warn('stop: no stopBtn and no IPC bridge');
      return;
    }

    const mainStartBtn = document.getElementById('startBtn');
    if (mainStartBtn) return mainStartBtn.click();
    console.warn('start: no startBtn and no IPC bridge');
  }

  // pointerdown is more reliable than click inside draggable widget window.
  btnPlay.addEventListener('pointerdown', triggerFocusToggle);
  btnPlay.addEventListener('click', triggerFocusToggle);

  function triggerMusicCommand(cmd) {
    if (cmd !== 'prev' && cmd !== 'next') return;
    const localBtn = document.getElementById(cmd === 'prev' ? 'musicPrevBtn' : 'musicNextBtn');
    if (localBtn) {
      localBtn.click();
      return;
    }
    if (window.electronAPI?.sendMusicCommand) {
      window.electronAPI.sendMusicCommand(cmd);
    }
  }

  btnPrev?.addEventListener('click', (e) => {
    e.stopPropagation();
    triggerMusicCommand('prev');
  });

  btnNext?.addEventListener('click', (e) => {
    e.stopPropagation();
    triggerMusicCommand('next');
  });

}
