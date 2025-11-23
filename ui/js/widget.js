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


// widget.js —— 只订阅共享状态，不再自己计时、不再 fetch
import { subscribeFocusStatus, getFocusStatus } from './focusStatusStore.js';

// ---- Mount widget UI ----
export function mountWidget() {
  const root = document.getElementById('widget');
  if (!root) return;

  root.innerHTML = `
    <div class="wg-time" id="wgTime">00:00</div>
    <button class="wg-btn" id="wgPlay" aria-label="Play/Pause">▶️</button>
  `;

  const elTime = root.querySelector('#wgTime');
  const btnPlay = root.querySelector('#wgPlay');

  function formatSeconds(sec) {
    const total = Math.max(0, sec | 0);
    const m = Math.floor(total / 60).toString().padStart(2, '0');
    const s = (total % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  function render(st) {
    elTime.textContent = formatSeconds(st.remainingSeconds ?? 0);
    btnPlay.textContent = st.isRunning ? '⏸️' : '▶️';

    root.classList.toggle('wg-running', !!st.isRunning);
    root.classList.toggle('wg-failed', !!st.isFailed);
    root.classList.toggle('wg-violating', !!st.isViolating);
  }

  // 初始化：用当前状态先画一次（比如 00:00、▶️）
  render(getFocusStatus());

  // 订阅：每次 timer UI 更新 status，这里自动重画
  subscribeFocusStatus(render);

  // ✅ widget 不负责 start/stop，只是遥控/镜像
  // 如果你希望点 widget 也能启动，就简单转发给 main page 的 start 按钮：
  btnPlay.addEventListener('click', () => {
    const mainStartBtn = document.getElementById('startBtn'); // 你主页面 start 按钮的 id
    if (mainStartBtn) mainStartBtn.click();
  });
}
