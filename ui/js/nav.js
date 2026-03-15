// js/nav.js
// Updated by Zhecheng Xu on 2026/01/28
// Changes:
//  - Add Pet navigation support and include Pet view/button in the unified nav switch.
//  - Centralize sidebar view switching (Timer / Statistics / Pet) with active style + aria-current.
//  - Keep behavior: always refresh Statistics (renderStats) when navigating to Statistics.
//  - Add defensive checks + console warnings to avoid silent failures when elements are missing.
// =============================================================
// Purpose:
//  - Own all sidebar navigation behavior in one place.
//  - Ensure only one main view is visible at a time and UI state stays consistent.
//  - Trigger per-view refresh hooks (e.g., renderStats) on navigation when needed.
//
// 2026/03/14 edited by JS
// Changes:
//  - Add Achievements view navigation + onEnter hook.
// 11.19 edited by Claire (Qinquan) Wang
// Changes:
//  - Keep Timer/Stats navigation logic in one place.
//  - Always refresh the Stats view (renderStats) whenever the user
//    navigates to Statistics.
//  - Add basic defensive checks and console warnings instead of failing silently.

import { renderStats } from './stats.js';
import { onEnterGacha } from './gacha.js';
import { onEnterAchievements } from './achievements.js';
import { mountMinigameHub, openMinigameHub } from './minigame_hub.js';
import { mountTetris } from './minigame_tetris.js';
import { mountSnake } from './minigame_snake.js';

export function mountNav(els) {
  const {
    navTimer,
    navStats,
    navAchievements,
    navPet,
    navGacha,
    navMinigame,
    viewTimer,
    viewStats,
    viewAchievements,
    viewPet,
    viewGacha,
    viewMinigame,
    statsEls,
    gachaRoot,
    chartRef
  } = els;

  const btnTimer = navTimer;
  const btnStats = navStats;
  const btnAchievements = navAchievements;
  const btnPet   = navPet;
  const btnGacha = navGacha; 
  const btnMinigame = navMinigame;

 // Defensive check: log exactly what's missing
  const missing = {
    navTimer: !navTimer,
    navStats: !navStats,
    navAchievements: !navAchievements,
    navPet: !navPet,
    navGacha: !navGacha,
    navMinigame: !navMinigame,
    viewTimer: !viewTimer,
    viewStats: !viewStats,
    viewAchievements: !viewAchievements,
    viewPet: !viewPet,
    viewGacha: !viewGacha,
    viewMinigame: !viewMinigame,
  };

 const hasMissing = Object.values(missing).some(Boolean);
 if (hasMissing) {
   console.warn('[Nav] Missing nav or view elements. Navigation not mounted.', missing, {
     navTimer, navStats, navPet, navGacha, navMinigame,
     viewTimer, viewStats, viewPet, viewGacha, viewMinigame, gachaRoot
   });
   return;
 }


  const allBtns  = [btnTimer, btnStats, btnAchievements, btnPet, btnGacha, btnMinigame];
  const allViews = [viewTimer, viewStats, viewAchievements, viewPet, viewGacha, viewMinigame];

  function setActive(btn, view) {
    allViews.forEach((v) => {
      v.style.display = v === view ? 'block' : 'none';
    });

    allBtns.forEach((b) => {
      const isActive = b === btn;
      b.classList.toggle('active', isActive);
      b.setAttribute('aria-current', isActive ? 'page' : 'false');
    });

    if (view === viewStats) {
      try {
        renderStats({ els: statsEls, chartRef });
      } catch (err) {
        console.error('[Nav] Failed to render stats view:', err);
      }
    }

    if (view === viewAchievements) {
      try {
        onEnterAchievements(els);
      } catch (err) {
        console.error('[Nav] Failed to render achievements view:', err);
      }
    }

    if (view === viewGacha) {
      try {
        onEnterGacha(els);
      } catch (err) {
        console.error('[Nav] Failed to render gacha view:', err);
      }
    }
  }

  btnTimer.addEventListener('click', () => setActive(btnTimer, viewTimer));
  btnStats.addEventListener('click', () => setActive(btnStats, viewStats));
  btnAchievements.addEventListener('click', () => setActive(btnAchievements, viewAchievements));
  btnPet.addEventListener('click', () => setActive(btnPet, viewPet));
  btnGacha.addEventListener('click', () => setActive(btnGacha, viewGacha));
  btnMinigame.addEventListener('click', () => {
    try { openMinigameHub(els); } catch (err) { console.error('[Nav] Failed to open Minigame hub:', err); }
  });

  // Mount minigames
  try { mountMinigameHub(els); } catch (err) { console.error('[Nav] Failed to mount Minigame hub:', err); }
  try { mountTetris(els); } catch (err) { console.error('[Nav] Failed to mount Tetris:', err); }
  try { mountSnake(els); } catch (err) { console.error('[Nav] Failed to mount Snake:', err); }

  setActive(btnTimer, viewTimer);
}
