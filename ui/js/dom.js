// 2026/01/28 edited by JS
// Changes:
//  - Collect Pet view DOM (level/exp) and Store button for the new store overlay.

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
  const viewGacha = document.getElementById('view-gacha');  

  const navTimer  = document.getElementById('navTimer');
  const navStats  = document.getElementById('navStats');
  const navPet    = document.getElementById('navPet');
  const navGacha  = document.getElementById('navGacha');    
  
  // ===== Gacha =====
  
  const gachaRoot = document.getElementById('gachaRoot');

  // ===== Pet/Store =====
  const storeBtn = document.getElementById('storeBtn');

  // ===== Stats area =====
  const statCount    = document.getElementById('statCount');
  const statTotal    = document.getElementById('statTotal');
  const statLastNote = document.getElementById('statLastNote');
  const chartCanvas  = document.getElementById('focusChart');

  //2026/1/22 added token dom
  const tokenValue = document.getElementById('tokenValue');

  // ===== Pet view =====
  const feedBtn = document.getElementById('feedBtn');
  const playBtn = document.getElementById('playBtn');
  const petSpeechBubble = document.getElementById('petSpeechBubble');
  const petLevel = document.getElementById('petLevel');
  const petExpFill = document.getElementById('petExpFill');

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
    viewGacha,
    navTimer,
    navStats,
    navPet, 
    navGacha, 

    //Gacha
    gachaRoot,


    // Pet/Store
    storeBtn,

    // Pet
    feedBtn,
    playBtn,
    petSpeechBubble,
    petLevel,
    petExpFill,

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
