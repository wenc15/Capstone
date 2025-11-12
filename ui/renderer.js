import { mountWidget } from './js/widget.js';
import { clampMins, fmt, showToast, notifySystem } from './js/utils.js';
import { saveSession } from './js/storage.js';
import { renderStats } from './js/stats.js';
mountWidget(); 


// ===== DOM refs (Timer) =====
const display    = document.getElementById('timerDisplay');
const startBtn   = document.getElementById('startBtn');
const resetBtn   = document.getElementById('resetBtn');
const range      = document.getElementById('timeRange');
const out        = document.getElementById('timeValue');
const noteInput  = document.getElementById('sessionNote');
const focusLast  = document.getElementById('focusLast');    // Summary 的“最近一次”
const toastEl    = document.getElementById('doneToast');    // 可选的 toast

// ===== Views & Nav =====
const viewTimer  = document.getElementById('view-timer');
const viewStats  = document.getElementById('view-stats');
const navTimer   = document.getElementById('navTimer');
const navStats   = document.getElementById('navStats');

// ===== Stats refs =====
const statCount    = document.getElementById('statCount');
const statTotal    = document.getElementById('statTotal');
const statLastNote = document.getElementById('statLastNote');
const chartCanvas  = document.getElementById('focusChart');
let focusChart = null;

// ===== state (Timer) =====
let endTs = null;        // 结束时间戳（ms）
let tick = null;         // setInterval 句柄
let paused = true;       // 是否暂停/未运行
let remainingMs = 0;     // 暂停时剩余（ms）
let lastStartedMins = 0; // 本次计时起始设定（用于完成显示）

// ===== helpers =====
function updatePreview() {
  if (paused && !endTs) {
    const mins = clampMins(Number(range.value || 25));
    display.textContent = fmt(mins * 60 * 1000);
    if (out) out.value = `${mins} min`;
  }
}

// ===== navigation =====
function showView(which) {
  if (which === 'timer') {
    viewTimer.style.display = '';
    viewStats.style.display = 'none';
  } else {
    viewTimer.style.display = 'none';
    viewStats.style.display = '';
    renderStats();
  }
}
navTimer?.addEventListener('click', ()=> showView('timer'));
navStats?.addEventListener('click', ()=> showView('stats'));

// ===== timer core =====
function startOrResume() {
  const now = Date.now();

  if (!endTs) {
    if (remainingMs <= 0) {
      lastStartedMins = clampMins(Number(range.value || 25));
      remainingMs = lastStartedMins * 60 * 1000;
    }
    endTs = now + remainingMs;
  }

  paused = false;
  range.disabled = true;
  startBtn.textContent = 'Pause';
  resetBtn.style.display = 'none';

  if (tick) clearInterval(tick);
  tick = setInterval(() => {
    const left = endTs - Date.now();
    display.textContent = fmt(left);

    if (left <= 0) {
      clearInterval(tick);
      tick = null;
      paused = true;
      endTs = null;
      remainingMs = 0;
      range.disabled = false;
      startBtn.textContent = 'Start';
      resetBtn.style.display = 'none';
      updatePreview();

      // 记录本次完成
      const note = noteInput?.value || '';
      saveSession(lastStartedMins, note);
      if (focusLast) focusLast.textContent = `${lastStartedMins} min`;

      showToast(`Session complete: ${lastStartedMins} min ✅`);
      notifySystem('Focus session complete', `${lastStartedMins} minutes`);

      // 如果当前在 Statistics 视图，刷新图表
      if (viewStats.style.display !== 'none') renderStats();
    }
  }, 200);
}

function pause() {
  if (!endTs) return;
  remainingMs = Math.max(0, endTs - Date.now());
  clearInterval(tick);
  tick = null;
  endTs = null;
  paused = true;

  startBtn.textContent = 'Resume';
  resetBtn.style.display = 'inline-block';
  range.disabled = false; // 暂停时允许修改时长
}

function resetCountdown() {
  clearInterval(tick);
  tick = null;
  endTs = null;
  paused = true;
  remainingMs = 0;

  startBtn.textContent = 'Start';
  resetBtn.style.display = 'none';
  range.disabled = false;
  updatePreview();
}

// ===== events =====
range?.addEventListener('input', updatePreview);
startBtn?.addEventListener('click', () => {
  if (!paused) pause(); else startOrResume();
});
resetBtn?.addEventListener('click', resetCountdown);

// ===== init =====
if (range) {
  range.min = '1';
  range.max = '60';
  range.value = String(clampMins(Number(range.value || 25)));
}
updatePreview();
showView('timer'); // 默认显示计时视图

// —— 左侧导航的“激活态” & 视图切换 —— //
(function(){
  const btnTimer = document.getElementById('navTimer');
  const btnStats = document.getElementById('navStats');
  const viewTimer = document.getElementById('view-timer');
  const viewStats = document.getElementById('view-stats');
  const allBtns  = [btnTimer, btnStats];
  const allViews = [viewTimer, viewStats];

  function setActive(btn, view){
    // 视图切换
    allViews.forEach(v => v.style.display = (v === view) ? 'block' : 'none');
    // 激活样式
    allBtns.forEach(b => {
      b.classList.toggle('active', b === btn);
      b.setAttribute('aria-current', b === btn ? 'page' : 'false');
    });
  }

  // 事件绑定
  btnTimer.addEventListener('click', ()=> setActive(btnTimer, viewTimer));
  btnStats.addEventListener('click', ()=> setActive(btnStats, viewStats));

  // 首屏默认高亮 Timer
  setActive(btnTimer, viewTimer);
})();


//11.12 add widget pause



