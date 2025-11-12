import { mountWidget } from './js/widget.js';
/* import { clampMins, fmt, showToast, notifySystem } from './js/utils.js';
import { saveSession } from './js/storage.js';
import { renderStats } from './js/stats.js'; */
import { mountTimer } from './js/timer_ui.js';
import { mountNav } from './js/nav.js';
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

const statsEls = { statCount, statTotal, statLastNote, chartCanvas };
const chartRef = { current: null };

mountTimer({
  display,
  startBtn,
  resetBtn,
  range,
  out,
  noteInput,
  focusLast,
  toastEl,
  viewStats,
  statsEls,
  chartRef,
});

mountNav({
  btnTimer: navTimer,
  btnStats: navStats,
  viewTimer,
  viewStats,
  statsEls,
  chartRef,
});




