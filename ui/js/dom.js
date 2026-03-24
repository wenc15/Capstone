// 2026/03/19 edited by Zhecheng Xu
// Changes:
//  - Collect Settings/Data Management modal DOM nodes.

// 2026/01/28 edited by JS
// Changes:
//  - Collect Pet view DOM (level/exp) and Store button for the new store overlay.
//
// 2026/03/14 edited by JS
// Changes:
//  - Collect topbar test button DOM for +1000 tokens.
//  - Collect Pet view Backpack button + evolution hint DOM.

// 2026/03/14 edited by JS
// Changes:
//  - Collect sidebar pet preview DOM.

// js/dom.js
// Collects all DOM elements needed across the UI.

export function collectDom() {
  // ===== Topbar =====
  const weatherChip = document.getElementById('weatherChip');
  const weatherIcon = document.getElementById('weatherIcon');
  const weatherTemp = document.getElementById('weatherTemp');

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
  const openCollectionBtn = document.getElementById('openCollectionBtn');
  const collectionPreviewShort = document.getElementById('collectionPreviewShort');
  const collectionOwnedMeta = document.getElementById('collectionOwnedMeta');

  // ===== View switching =====
  const viewTimer = document.getElementById('view-timer');
  const viewStats = document.getElementById('view-stats');
  const viewAchievements = document.getElementById('view-achievements');
  const viewPet   = document.getElementById('view-pet');
  const viewGacha = document.getElementById('view-gacha');  
  const viewMinigame = document.getElementById('view-minigame');

  const navTimer  = document.getElementById('navTimer');
  const navStats  = document.getElementById('navStats');
  const navAchievements = document.getElementById('navAchievements');
  const navPet    = document.getElementById('navPet');
  const navGacha  = document.getElementById('navGacha');    
  const navMinigame = document.getElementById('navMinigame');

  // ===== Achievements view =====
  const achvList = document.getElementById('achvList');
  const achvMeta = document.getElementById('achvMeta');
  const achvEmpty = document.getElementById('achvEmpty');
  const achvError = document.getElementById('achvError');
  const achvRefreshBtn = document.getElementById('achvRefreshBtn');

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
  const backpackBtn = document.getElementById('backpackBtn');

  // ===== Stats area =====
  const statCount    = document.getElementById('statCount');
  const statTotal    = document.getElementById('statTotal');
  const statLastNote = document.getElementById('statLastNote');
  const chartCanvas  = document.getElementById('focusChart');

  //2026/1/22 added token dom
  const tokenValue = document.getElementById('tokenValue');
  const tokenAdd1000Btn = document.getElementById('tokenAdd1000Btn');

  // ===== Settings / Archive =====
  const settingsOpenBtn = document.getElementById('settingsOpenBtn');
  const settingsOverlay = document.getElementById('settingsOverlay');
  const settingsCloseBtn = document.getElementById('settingsCloseBtn');
  const settingWidgetStartupVisible = document.getElementById('settingWidgetStartupVisible');
  const settingCloseBehavior = document.getElementById('settingCloseBehavior');
  const settingsBehaviorMeta = document.getElementById('settingsBehaviorMeta');
  const archiveExportBtn = document.getElementById('archiveExportBtn');
  const archiveImportFile = document.getElementById('archiveImportFile');
  const archiveImportBtn = document.getElementById('archiveImportBtn');
  const archiveImportMeta = document.getElementById('archiveImportMeta');

  // ===== Pet view =====
  const feedBtn = document.getElementById('feedBtn');
  const petMedia = document.getElementById('petMedia');
  const petImage = document.getElementById('petImage');
  const petSpeechBubble = document.getElementById('petSpeechBubble');
  const petLevel = document.getElementById('petLevel');
  const petExpFill = document.getElementById('petExpFill');
  const petEvoHint = document.getElementById('petEvoHint');

  // ===== Sidebar pet preview =====
  const sidebarPetPreview = document.getElementById('sidebarPetPreview');

  return {
    weatherChip,
    weatherIcon,
    weatherTemp,

    // Timer
    display,
    startBtn,
    stopBtn,
    range,
    out,
    focusLast,
    toastEl,
    whitelistGroup,
    openCollectionBtn,
    collectionPreviewShort,
    collectionOwnedMeta,

    // Views & Nav
    viewTimer,
    viewStats,
    viewAchievements,
    viewPet, 
    viewGacha,
    viewMinigame,
    navTimer,
    navStats,
    navAchievements,
    navPet, 
    navGacha, 
    navMinigame,

    // Achievements
    achvList,
    achvMeta,
    achvEmpty,
    achvError,
    achvRefreshBtn,

    //Gacha
    gachaRoot,


    // Pet/Store
    storeBtn,
    backpackBtn,

    // Pet
    feedBtn,
    petMedia,
    petImage,
    petSpeechBubble,
    petLevel,
    petExpFill,
    petEvoHint,

    // Sidebar pet preview
    sidebarPetPreview,

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
    tokenAdd1000Btn,

    // Settings / Archive
    settingsOpenBtn,
    settingsOverlay,
    settingsCloseBtn,
    settingWidgetStartupVisible,
    settingCloseBehavior,
    settingsBehaviorMeta,
    archiveExportBtn,
    archiveImportFile,
    archiveImportBtn,
    archiveImportMeta,

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

    // Minigame hub
    mgHubView: document.getElementById('mgHubView'),
    mgHubCloseBtn: document.getElementById('mgHubCloseBtn'),
    mgOpenDicebuildBtn: document.getElementById('mgOpenDicebuildBtn'),
    mgOpenTetrisBtn: document.getElementById('mgOpenTetrisBtn'),
    mgOpenSnakeBtn: document.getElementById('mgOpenSnakeBtn'),

    // Tetris
    tetRoot: document.getElementById('tetrisRoot'),
    tetHubBtn: document.getElementById('tetHubBtn'),
    tetExitBtn: document.getElementById('tetExitBtn'),
    tetBoard: document.getElementById('tetBoard'),
    tetScore: document.getElementById('tetScore'),
    tetLevel: document.getElementById('tetLevel'),
    tetLines: document.getElementById('tetLines'),
    tetStatus: document.getElementById('tetStatus'),
    tetNext: document.getElementById('tetNext'),
    tetStartBtn: document.getElementById('tetStartBtn'),
    tetHint: document.getElementById('tetHint'),

    // Snake
    snakeRoot: document.getElementById('snakeRoot'),
    snakeHubBtn: document.getElementById('snakeHubBtn'),
    snakeExitBtn: document.getElementById('snakeExitBtn'),
    snakeBoard: document.getElementById('snakeBoard'),
    snakeScore: document.getElementById('snakeScore'),
    snakeHighScore: document.getElementById('snakeHighScore'),
    snakeStartBtn: document.getElementById('snakeStartBtn'),
    snakeHint: document.getElementById('snakeHint'),
    snakeStatus: document.getElementById('snakeStatus'),
  };
}
