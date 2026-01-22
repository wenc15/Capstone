// js/nav.js
// 11.19 edited by Claire (Qinquan) Wang
// Changes:
//  - Keep Timer/Stats navigation logic in one place.
//  - Always refresh the Stats view (renderStats) whenever the user
//    navigates to Statistics.
//  - Add basic defensive checks and console warnings instead of failing silently.

import { renderStats } from './stats.js';

export function mountNav(els) {
  const {
    navTimer,
    navStats,
    navPet, 
    viewTimer,
    viewStats,
    viewPet, 
    statsEls,
    chartRef,
  } = els;

  const btnTimer = navTimer;
  const btnStats = navStats;
  const btnPet   = navPet;   

  // Defensive check: if any core element is missing, abort mounting nav
  if (!btnTimer || !btnStats || !viewTimer || !viewStats) {
    console.warn('[Nav] Missing nav or view elements. Navigation not mounted.');
    return;
  }

  const allBtns = [btnTimer, btnStats, btnPet];
  const allViews = [viewTimer, viewStats, viewPet];

  /**
   * Set the active nav button and corresponding view.
   * Also triggers a stats refresh when switching to the Stats view.
   * @param {HTMLElement} btn  - the button that should be marked active
   * @param {HTMLElement} view - the view element to show
   */
  function setActive(btn, view) {
    // Toggle which main view is visible
    allViews.forEach((v) => {
      if (!v) return;
      v.style.display = v === view ? 'block' : 'none';
    });

    // Toggle active style & aria-current on sidebar buttons
    allBtns.forEach((b) => {
      if (!b) return;
      const isActive = b === btn;
      b.classList.toggle('active', isActive);
      b.setAttribute('aria-current', isActive ? 'page' : 'false');
    });

    // When switching to Statistics, refresh stats using latest local data
    if (view === viewStats) {
      try {
        renderStats({ els: statsEls, chartRef });
      } catch (err) {
        console.error('[Nav] Failed to render stats view:', err);
      }
    }
  }

  // Wire up navigation button clicks
  btnTimer.addEventListener('click', () => setActive(btnTimer, viewTimer));
  btnStats.addEventListener('click', () => setActive(btnStats, viewStats));
  btnPet.addEventListener('click', () => setActive(btnPet, viewPet));


  // Default: show Timer view and highlight Timer button on app load
  setActive(btnTimer, viewTimer);
}
