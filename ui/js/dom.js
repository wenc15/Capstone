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
  const viewMinigame = document.getElementById('view-minigame');

  const navTimer  = document.getElementById('navTimer');
  const navStats  = document.getElementById('navStats');
  const navPet    = document.getElementById('navPet');
  const navGacha  = document.getElementById('navGacha');    

  // ===== Minigame (Dice & Build) =====
  const mgRoot = document.getElementById('mgRoot');
  const mgMenuBtn = document.getElementById('mgMenuBtn');
  const mgExitBtn = document.getElementById('mgExitBtn');
  const mgCash = document.getElementById('mgCash');
  const mgStage = document.getElementById('mgStage');
  const mgGoal = document.getElementById('mgGoal');
  const mgGoalFill = document.getElementById('mgGoalFill');
  const mgRolls = document.getElementById('mgRolls');
  const mgBoard = document.getElementById('mgBoard');
  const mgFloat = document.getElementById('mgFloat');
  const mgBackpack = document.getElementById('mgBackpack');
  const mgBuyBlockBtn = document.getElementById('mgBuyBlockBtn');
  const mgBuyBlockCost = document.getElementById('mgBuyBlockCost');
  const mgSellBtn = document.getElementById('mgSellBtn');
  const mgHint = document.getElementById('mgHint');
  const mgRefreshBtn = document.getElementById('mgRefreshBtn');
  const mgRefreshCost = document.getElementById('mgRefreshCost');
  const mgStore = document.getElementById('mgStore');
  const mgRollBtn = document.getElementById('mgRollBtn');
  const mgLastRoll = document.getElementById('mgLastRoll');
  const mgResult = document.getElementById('mgResult');
  const mgResultTitle = document.getElementById('mgResultTitle');
  const mgResultMeta = document.getElementById('mgResultMeta');
  const mgResultExit = document.getElementById('mgResultExit');

  // Building detail modal
  const mgDetail = document.getElementById('mgDetail');
  const mgDetailIcon = document.getElementById('mgDetailIcon');
  const mgDetailName = document.getElementById('mgDetailName');
  const mgDetailRarity = document.getElementById('mgDetailRarity');
  const mgDetailTag = document.getElementById('mgDetailTag');
  const mgDetailLevel = document.getElementById('mgDetailLevel');
  const mgDetailExp = document.getElementById('mgDetailExp');
  const mgDetailExpFill = document.getElementById('mgDetailExpFill');
  const mgDetailEffect = document.getElementById('mgDetailEffect');
  const mgDetailSell = document.getElementById('mgDetailSell');
  const mgDetailClose = document.getElementById('mgDetailClose');

  // Relax prompt overlay
  const relaxPrompt = document.getElementById('relaxPrompt');
  const relaxPlayBtn = document.getElementById('relaxPlayBtn');
  const relaxLaterBtn = document.getElementById('relaxLaterBtn');
  
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
  const petMedia = document.getElementById('petMedia');
  const petImage = document.getElementById('petImage');
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
    viewMinigame,
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
    petMedia,
    petImage,
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

    // Minigame
    mgRoot,
    mgMenuBtn,
    mgExitBtn,
    mgCash,
    mgStage,
    mgGoal,
    mgGoalFill,
    mgRolls,
    mgBoard,
    mgFloat,
    mgBackpack,
    mgBuyBlockBtn,
    mgBuyBlockCost,
    mgSellBtn,
    mgHint,
    mgRefreshBtn,
    mgRefreshCost,
    mgStore,
    mgRollBtn,
    mgLastRoll,
    mgResult,
    mgResultTitle,
    mgResultMeta,
    mgResultExit,

    // Building detail
    mgDetail,
    mgDetailIcon,
    mgDetailName,
    mgDetailRarity,
    mgDetailTag,
    mgDetailLevel,
    mgDetailExp,
    mgDetailExpFill,
    mgDetailEffect,
    mgDetailSell,
    mgDetailClose,

    // Relax prompt
    relaxPrompt,
    relaxPlayBtn,
    relaxLaterBtn,
  };
}
