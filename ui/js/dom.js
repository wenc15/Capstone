// js/dom.js
// Collects all DOM elements needed across the UI.

export function collectDom() {
  // ===== Timer area =====
  const display   = document.getElementById('timerDisplay');
  const startBtn  = document.getElementById('startBtn');
  const stopBtn   = document.getElementById('stopBtn');
  const range     = document.getElementById('timeRange');
  const out       = document.getElementById('timeValue');
  // const noteInput = document.getElementById('sessionNote'); // removed
  const focusLast = document.getElementById('focusLast');
  const toastEl   = document.getElementById('doneToast');

  // Whitelist checkbox group container (replaces old <select id="whitelistSelect">)
  const whitelistGroup = document.getElementById('whitelistGroup');

  // ===== View switching =====
  const viewTimer = document.getElementById('view-timer');
  const viewStats = document.getElementById('view-stats');
  const viewPet   = document.getElementById('view-pet');
  const navTimer  = document.getElementById('navTimer');
  const navStats  = document.getElementById('navStats');
  const navPet    = document.getElementById('navPet');  

  // ===== Stats area =====
  const statCount    = document.getElementById('statCount');
  const statTotal    = document.getElementById('statTotal');
  const statLastNote = document.getElementById('statLastNote');
  const chartCanvas  = document.getElementById('focusChart');

  //2026/1/22 added token dom
  const tokenValue = document.getElementById('tokenValue');

  return {
    // Timer
    display,
    startBtn,
    stopBtn,
    range,
    out,
    focusLast,
    toastEl,
    whitelistGroup,

    // Views & Nav
    viewTimer,
    viewStats,
    viewPet, 
    navTimer,
    navStats,
    navPet, 

    // Stats
    statCount,
    statTotal,
    statLastNote,
    chartCanvas,

    // Chart.js instance holder
    chartRef: { current: null },

    // Convenience object for stats.js
    statsEls: { statCount, statTotal, statLastNote, chartCanvas },

    //token/credits
    tokenValue,
  };
}
