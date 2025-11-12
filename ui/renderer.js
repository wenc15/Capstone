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
function clampMins(v) {
  if (Number.isNaN(v)) return 25;
  return Math.min(60, Math.max(1, Math.floor(v)));
}
function fmt(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = String(Math.floor(total / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  return `${m}:${s}`;
}
function updatePreview() {
  if (paused && !endTs) {
    const mins = clampMins(Number(range.value || 25));
    display.textContent = fmt(mins * 60 * 1000);
    if (out) out.value = `${mins} min`;
  }
}
function showToast(text) {
  if (!toastEl) return;
  toastEl.textContent = text;
  toastEl.classList.add('show');
  setTimeout(()=> toastEl.classList.remove('show'), 3000);
}
function notifySystem(title, body) {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'granted') {
    new Notification(title, { body });
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then(p=>{
      if (p === 'granted') new Notification(title, { body });
    });
  }
}

// ===== persistence (localStorage) =====
const KEY = 'focusSessions'; // 每项：{ ts, minutes, note }
function loadSessions() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); }
  catch { return []; }
}
function saveSession(minutes, note) {
  const list = loadSessions();
  list.push({ ts: Date.now(), minutes, note: note?.trim() || '' });
  localStorage.setItem(KEY, JSON.stringify(list));
  return list;
}

// 统计最近 7 天每日总分钟
function aggregateLast7Days(list) {
  const MS_DAY = 24*60*60*1000;
  const end = new Date(); end.setHours(23,59,59,999);
  const days = [];
  for (let i=6; i>=0; i--) {
    const d = new Date(end.getTime() - i*MS_DAY);
    const key = d.toISOString().slice(0,10); // YYYY-MM-DD
    days.push({ key, label: `${d.getMonth()+1}/${d.getDate()}`, total:0 });
  }
  const map = new Map(days.map(d=>[d.key,d]));
  list.forEach(item=>{
    const dayKey = new Date(item.ts).toISOString().slice(0,10);
    if (map.has(dayKey)) map.get(dayKey).total += Number(item.minutes)||0;
  });
  return days;
}

// ===== render stats =====
function renderStats() {
  const list = loadSessions();
  // 顶部统计
  if (statCount) statCount.textContent = String(list.length);
  // 最近 7 天总和
  const last7 = aggregateLast7Days(list);
  const sum7 = last7.reduce((a,b)=>a + b.total, 0);
  if (statTotal) statTotal.textContent = `${sum7} min`;
  // 最近一次备注
  if (statLastNote) statLastNote.textContent = list.length ? (list[list.length-1].note || '—') : '—';

  // 柱状图
  if (chartCanvas && window.Chart) {
    const labels = last7.map(d=>d.label);
    const data   = last7.map(d=>d.total);
    if (focusChart) {
      // 更新数据
      focusChart.data.labels = labels;
      focusChart.data.datasets[0].data = data;
      focusChart.update();
    } else {
      focusChart = new Chart(chartCanvas, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'Minutes',
            data,
          }]
        },
        options: {
          responsive: true,
          plugins: { legend: { display: false } },
          scales: {
            y: { beginAtZero: true, ticks: { precision: 0 } }
          }
        }
      });
    }
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
