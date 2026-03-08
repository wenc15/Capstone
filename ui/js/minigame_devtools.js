import { grantDiceBuildEligibility } from './relax_prompt.js';
import { openMinigameHub } from './minigame_hub.js';
import { openDiceBuild } from './minigame_dicebuild.js';
import { openTetris } from './minigame_tetris.js';
import { openSnake } from './minigame_snake.js';

function makeButton(label, onClick) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = label;
  btn.style.padding = '8px 10px';
  btn.style.border = '1px solid rgba(0,0,0,0.12)';
  btn.style.borderRadius = '10px';
  btn.style.background = '#ffffff';
  btn.style.cursor = 'pointer';
  btn.style.fontWeight = '700';
  btn.addEventListener('click', onClick);
  return btn;
}

export function mountMinigameDevtools(els) {
  if (typeof document === 'undefined') return;
  if (document.getElementById('mgDevtools')) return;

  const root = document.createElement('div');
  root.id = 'mgDevtools';
  root.style.position = 'fixed';
  root.style.right = '18px';
  root.style.bottom = '18px';
  root.style.zIndex = '9999';
  root.style.width = '220px';
  root.style.padding = '14px';
  root.style.borderRadius = '16px';
  root.style.background = 'rgba(255,255,255,0.96)';
  root.style.border = '1px solid rgba(0,0,0,0.08)';
  root.style.boxShadow = '0 14px 30px rgba(0,0,0,0.12)';
  root.style.fontFamily = 'system-ui, sans-serif';

  const title = document.createElement('div');
  title.textContent = 'Minigame Devtools';
  title.style.fontWeight = '900';
  title.style.marginBottom = '10px';

  const hint = document.createElement('div');
  hint.textContent = 'Test minigames without waiting for timer.';
  hint.style.fontSize = '12px';
  hint.style.color = '#5f6b63';
  hint.style.marginBottom = '12px';

  const grid = document.createElement('div');
  grid.style.display = 'grid';
  grid.style.gridTemplateColumns = '1fr 1fr';
  grid.style.gap = '8px';

  const grant = () => grantDiceBuildEligibility({ minutes: 1 });

  grid.appendChild(makeButton('Grant Access', () => grant()));
  grid.appendChild(makeButton('Open Hub', () => openMinigameHub(els, { reason: 'dev' })));
  grid.appendChild(makeButton('Dice & Build', () => {
    grant();
    openDiceBuild(els, { reason: 'dev', bypassGate: true });
  }));
  grid.appendChild(makeButton('Tetris', () => {
    grant();
    openTetris(els, { reason: 'dev', bypassGate: true });
  }));
  grid.appendChild(makeButton('Snake', () => {
    grant();
    openSnake(els, { reason: 'dev', bypassGate: true });
  }));

  const close = makeButton('Hide', () => {
    root.remove();
  });
  close.style.gridColumn = '1 / -1';
  grid.appendChild(close);

  root.appendChild(title);
  root.appendChild(hint);
  root.appendChild(grid);
  document.body.appendChild(root);
}
