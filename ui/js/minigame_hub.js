// 2026/03/25 edited by Zhecheng Xu
// Changes:
//  - Keep minigame hub navigation behavior aligned with relax prompt entry flow.

import { hasDiceBuildEligibility } from './relax_prompt.js';
import { showToast } from './utils.js';

export function showMinigameSection(els) {
  const views = [els?.viewTimer, els?.viewStats, els?.viewAchievements, els?.viewPet, els?.viewGacha, els?.viewMinigame];
  views.forEach((view) => {
    if (view) view.style.display = view === els?.viewMinigame ? 'block' : 'none';
  });

  const navs = [els?.navTimer, els?.navStats, els?.navAchievements, els?.navPet, els?.navGacha, els?.navMinigame];
  navs.forEach((nav) => {
    if (!nav) return;
    const active = nav === els?.navMinigame;
    nav.classList.toggle('active', active);
    nav.setAttribute('aria-current', active ? 'page' : 'false');
  });
}

export function showMinigamePanel(els, panel) {
  if (els?.mgHubView) els.mgHubView.style.display = panel === 'hub' ? 'block' : 'none';
  if (els?.mgRoot) els.mgRoot.style.display = panel === 'dicebuild' ? 'block' : 'none';
  if (els?.tetRoot) els.tetRoot.style.display = panel === 'tetris' ? 'block' : 'none';
  if (els?.snakeRoot) els.snakeRoot.style.display = panel === 'snake' ? 'block' : 'none';
}

export function closeMinigameSection(els) {
  showMinigamePanel(els, 'hub');
  if (els?.viewMinigame) els.viewMinigame.style.display = 'none';
  if (els?.viewTimer) els.viewTimer.style.display = 'block';

  const navs = [els?.navTimer, els?.navStats, els?.navAchievements, els?.navPet, els?.navGacha, els?.navMinigame];
  navs.forEach((nav) => {
    if (!nav) return;
    const active = nav === els?.navTimer;
    nav.classList.toggle('active', active);
    nav.setAttribute('aria-current', active ? 'page' : 'false');
  });
}

export function openMinigameHub(els, meta = {}) {
  if (!els?.viewMinigame) return false;

  const bypass = meta?.bypassGate || meta?.reason === 'dev' || meta?.reason === 'hub';
  const ok = bypass || hasDiceBuildEligibility();
  if (!ok) {
    showToast(els.toastEl, 'Minigame is only available after focus completion.');
    return false;
  }

  showMinigameSection(els);
  showMinigamePanel(els, 'hub');
  return true;
}

export function mountMinigameHub(els) {
  if (!els?.mgHubView) return;

  els.mgHubCloseBtn?.addEventListener('click', () => {
    closeMinigameSection(els);
  });

  els.mgOpenDicebuildBtn?.addEventListener('click', async () => {
    const mod = await import('./minigame_dicebuild.js');
    mod.openDiceBuild?.(els, { reason: 'hub' });
  });

  els.mgOpenTetrisBtn?.addEventListener('click', async () => {
    const mod = await import('./minigame_tetris.js');
    mod.openTetris?.(els, { reason: 'hub' });
  });

  els.mgOpenSnakeBtn?.addEventListener('click', async () => {
    const mod = await import('./minigame_snake.js');
    mod.openSnake?.(els, { reason: 'hub' });
  });
}
