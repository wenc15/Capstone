// 2026/03/25 edited by Zhecheng Xu
// Changes:
//  - Keep relax prompt style and gating behavior aligned with focus-complete flow updates.

// relax_prompt.js
// Purpose:
//  - Gate minigame access: only after a successful focus session.
//  - Show a lightweight prompt; user opts in to play.

const ELIG_KEY = 'dicebuild.eligibility.v1';
const SETTINGS_KEY = 'dicebuild.settings.v1';

function now() {
  return Date.now();
}

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

function getSettings() {
  const st = readJson(SETTINGS_KEY, null) || {};
  return {
    autoPrompt: st.autoPrompt !== false,
  };
}

export function grantDiceBuildEligibility(meta) {
  const payload = {
    ts: now(),
    minutes: Math.max(0, Math.round(meta?.minutes || 0)),
    consumed: false,
  };
  writeJson(ELIG_KEY, payload);
  return payload;
}

export function consumeDiceBuildEligibility() {
  const cur = readJson(ELIG_KEY, null);
  if (!cur) return null;
  cur.consumed = true;
  writeJson(ELIG_KEY, cur);
  return cur;
}

export function hasDiceBuildEligibility() {
  const cur = readJson(ELIG_KEY, null);
  if (!cur || cur.consumed) return false;
  // validity window: 30 minutes
  return (now() - (cur.ts || 0)) <= 30 * 60 * 1000;
}

export function offerRelaxAfterFocus(els, meta) {
  const settings = getSettings();
  grantDiceBuildEligibility(meta);
  if (!settings.autoPrompt) return;
  showPrompt(els, meta);
}

function formatRewardText(meta) {
  const mins = Math.max(0, Math.round(Number(meta?.minutes || 0)));
  const gain = Math.max(0, Math.round(Number(meta?.tokenGain || 0)));
  if (gain > 0) return `+${gain} tokens earned from ${mins} min focus.`;
  if (mins > 0) return `${mins} min focus logged. Token reward synced.`;
  return 'Token reward synced.';
}

function playPromptCelebration(els) {
  const root = els?.relaxPrompt;
  if (!root) return;

  root.querySelector('.relax-fireworks-layer')?.remove();

  const layer = document.createElement('div');
  layer.className = 'relax-fireworks-layer';
  root.appendChild(layer);

  for (let i = 0; i < 4; i += 1) {
    const burst = document.createElement('span');
    burst.className = 'relax-firework-burst';
    burst.style.left = `${16 + Math.round(Math.random() * 68)}%`;
    burst.style.top = `${10 + Math.round(Math.random() * 28)}%`;
    burst.style.setProperty('--delay', `${i * 90}ms`);
    layer.appendChild(burst);
  }

  setTimeout(() => {
    layer.remove();
  }, 1600);
}

function showPrompt(els, meta) {
  const root = els?.relaxPrompt;
  if (!root) return;
  if (els?.relaxRewardMeta) {
    els.relaxRewardMeta.textContent = formatRewardText(meta);
  }
  root.classList.remove('mg-hidden');
  playPromptCelebration(els);
}

function hidePrompt(els) {
  const root = els?.relaxPrompt;
  if (!root) return;
  root.classList.add('mg-hidden');
}

export function mountRelaxPrompt(els) {
  const { relaxPrompt, relaxPlayBtn, relaxLaterBtn } = els || {};
  if (!relaxPrompt || !relaxPlayBtn || !relaxLaterBtn) return;

  relaxPlayBtn.addEventListener('click', () => {
    hidePrompt(els);
    import('./minigame_hub.js')
      .then((mod) => mod.openMinigameHub?.(els, { reason: 'post-focus' }))
      .catch(() => {});
  });

  relaxLaterBtn.addEventListener('click', () => {
    // Dismiss = consume; user cannot open minigame later.
    consumeDiceBuildEligibility();
    hidePrompt(els);
  });

  // Escape closes prompt (and consumes eligibility)
  window.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape') return;
    if (relaxPrompt.classList.contains('mg-hidden')) return;
    consumeDiceBuildEligibility();
    hidePrompt(els);
  });

  // Dev helper: allow granting eligibility from console
  // window.dicebuildGrantOnce() => shows prompt
  if (typeof window !== 'undefined') {
    window.dicebuildGrantOnce = () => {
      grantDiceBuildEligibility({ minutes: 0 });
      showPrompt(els);
    };
  }
}
