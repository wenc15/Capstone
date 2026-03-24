// 2026/01/28 edited by JS
// Changes:
//  - Wire Pet Feed to backend Inventory/PetGrowth APIs.
//  - Update level/exp UI based on stored growth.
//
// 2026/03/14 edited by JS
// Changes:
//  - Support 3 pets (1/2/3) with 3 phases each (1/2/3).
//  - Default active pet = 3; other pets unlock in order 3 -> 2 -> 1.

// 2026/03/14 edited by JS
// Changes:
//  - Cap pet level at Lv 20 for UI.
//  - Rename pets: 1=Sprig, 2=Nomo, 3=Lyra.

// js/pet.js

import { getPetsState, onPetsChanged } from './petsApi.js';

const API_BASE = 'http://localhost:5024';
const EXP_PER_LEVEL = 100;
const MAX_LEVEL = 20;
const MAX_GROWTH = (MAX_LEVEL - 1) * EXP_PER_LEVEL;

// Evolution thresholds (derived from Level)
//  - Phase 1 -> Phase 2: Lv 5
//  - Phase 2 -> Phase 3: Lv 20
const EVO_LV_PHASE2 = 5;
const EVO_LV_PHASE3 = 20;
const PHASE2_GROWTH_THRESHOLD = (EVO_LV_PHASE2 - 1) * EXP_PER_LEVEL;
const PHASE3_GROWTH_THRESHOLD = (EVO_LV_PHASE3 - 1) * EXP_PER_LEVEL;

const PET_CATALOG = {
  3: {
    id: 3,
    name: 'Lyra',
    phases: {
      1: { kind: 'img', src: 'assets/pet3_1.png', wobble: true },
      2: { kind: 'img', src: 'assets/pet3-2.gif' },
      3: { kind: 'img', src: 'assets/pet3-3.gif' },
    },
  },
  2: {
    id: 2,
    name: 'Nomo',
    phases: {
      1: { kind: 'img', src: 'assets/pet2-1.gif' },
      2: { kind: 'img', src: 'assets/pet2-2.gif' },
      3: { kind: 'img', src: 'assets/pet2-3.gif' },
    },
  },
  1: {
    id: 1,
    name: 'Sprig',
    phases: {
      1: { kind: 'img', src: 'assets/pet1-1.png' },
      2: { kind: 'img', src: 'assets/pet1-2.gif' },
      3: { kind: 'video', src: 'assets/pet1-3.webm' },
    },
  },
};

const PET_PREVIEW_OVERRIDE = {
  // Sidebar preview prefers static adult images.
  1: { 3: 'assets/pet1-3.png' },
};

const PET_SPEECH = {
  egg: [
    '😴',
    '💤',
    'Zzz...',
    'zzZ...',
    '(sleeping)',
    '(snuggled up)',
    '...',
    '*yawn*',
    'mrrp...',
    'crack...',
    'tap tap',
    '🥚💤',
  ],
  juvenile: [
    'Hi!',
    "I'm here!",
    'There you are!',
    'I missed you!',
    'Look! Me!',
    'Pet me?',
    'Boop!',
    'Hehe.',
    'Yay!',
    'Wiggle wiggle.',
    'I like you.',
    "You're my favorite.",
    'Stay with me!',
    'We hang out?',
    "I'm comfy.",
    'Ooh!',
    'Snack time?',
    "I'm bouncy today!",
    'I brought good vibes.',
    "I'll just chill here.",
    'You do your thing.',
    "I'm not going anywhere.",
    'Tiny happy dance!',
    'Squeak!',
    'Bestie!',
    'More taps!',
  ],
  adult: [
    "Hey, I'm here.",
    "I'm with you.",
    'No matter what.',
    "I've got you.",
    'You and me.',
    'I like being around you.',
    "I'll stay close.",
    "I'm not leaving.",
    'Want a cuddle?',
    'Come here.',
    "You're safe with me.",
    "I'm proud of you.",
    'I believe you.',
    "It's okay.",
    "It's okay, really.",
    "I'm listening.",
    'Tell me everything.',
    "I'll keep you company.",
    "I'll sit right here.",
    'We can go slow.',
    'We can take our time.',
    "I'm happy you're here.",
    "You're my person.",
    "I'm on your side.",
    "I'll be your little anchor.",
    'Deep breath together?',
    'Here - hold my paw.',
    "I'll cheer quietly.",
    "I'll celebrate with you.",
    'Still here.',
  ],
};

const FOOD_PRIORITY = [
  { id: 'adv_food', exp: 45 },
  { id: 'meat_snack', exp: 15 },
  { id: 'basic_food', exp: 5 },
];

async function fetchJson(path, init) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });

  let body = null;
  try {
    body = await res.json();
  } catch {
    // ignore
  }

  if (!res.ok) {
    const msg = body?.message || `${res.status} ${res.statusText}`;
    const err = new Error(msg);
    err.status = res.status;
    err.body = body;
    throw err;
  }

  return body;
}

async function getInventory() {
  const data = await fetchJson('/api/inventory');
  return data?.items || {};
}

async function consumeInventoryItem(itemId, amount) {
  return fetchJson('/api/inventory/consume', {
    method: 'POST',
    body: JSON.stringify({ itemId, amount }),
  });
}

async function getPetGrowth(petId) {
  const data = await fetchJson(`/api/pets/${petId}/growth`);
  return data?.growth ?? 0;
}

async function addPetGrowth(petId, amount) {
  const data = await fetchJson(`/api/pets/${petId}/growth/add`, {
    method: 'POST',
    body: JSON.stringify({ amount }),
  });
  return data?.growth ?? 0;
}

function renderGrowthUI(els, growth) {
  if (!els?.petLevel || !els?.petExpFill) return;

  const safe = Math.max(0, Number(growth) || 0);
  const capped = Math.min(MAX_GROWTH, safe);
  const level = Math.min(MAX_LEVEL, Math.floor(capped / EXP_PER_LEVEL) + 1);
  const inLevel = level >= MAX_LEVEL ? EXP_PER_LEVEL : (capped % EXP_PER_LEVEL);
  const pct = level >= MAX_LEVEL ? 100 : Math.max(0, Math.min(100, Math.round((inLevel / EXP_PER_LEVEL) * 100)));

  els.petLevel.textContent = String(level);
  els.petExpFill.style.width = `${pct}%`;

  if (els.petEvoHint) {
    if (level < EVO_LV_PHASE2) {
      els.petEvoHint.textContent = `Evolves at Lv ${EVO_LV_PHASE2} (in ${EVO_LV_PHASE2 - level} lv).`;
    } else if (level < EVO_LV_PHASE3) {
      els.petEvoHint.textContent = `Next evolution at Lv ${EVO_LV_PHASE3} (in ${EVO_LV_PHASE3 - level} lv).`;
    } else {
      els.petEvoHint.textContent = `Max level (Lv ${MAX_LEVEL}).`;
    }
  }
}

function getPetPhaseFromGrowth(growth) {
  const safe = Math.min(MAX_GROWTH, Math.max(0, Number(growth) || 0));
  if (safe < PHASE2_GROWTH_THRESHOLD) return 1;
  if (safe < PHASE3_GROWTH_THRESHOLD) return 2;
  return 3;
}

function renderPetMedia(els, petId, phase) {
  const host = els?.petMedia;
  if (!host) return;

  const pet = PET_CATALOG[petId] || PET_CATALOG[3];
  const cfg = pet?.phases?.[phase] || pet?.phases?.[1];

  if (!cfg) return;

  if (cfg.kind === 'video') {
    host.innerHTML = `
      <video id="petVideo" class="pet-sprite pet-video" width="200" height="200" muted autoplay loop playsinline preload="auto">
        <source src="${cfg.src}" type="video/webm" />
      </video>
    `.trim();

    const video = host.querySelector('video');
    const p = video?.play?.();
    if (p && typeof p.catch === 'function') p.catch(() => {});
    return;
  }

  const extraClass = cfg.wobble ? ' is-egg' : '';
  host.innerHTML = `
    <img id="petImage" src="${cfg.src}" alt="Pet" class="pet-sprite${extraClass}" style="width: 200px">
  `.trim();
}

function renderSidebarPreview(els, petId, growth) {
  const img = els?.sidebarPetPreview;
  if (!img) return;

  const phase = getPetPhaseFromGrowth(growth);
  const pet = PET_CATALOG[petId] || PET_CATALOG[3];
  const override = PET_PREVIEW_OVERRIDE?.[pet?.id]?.[phase] || null;
  const cfg = pet?.phases?.[phase] || pet?.phases?.[1] || null;

  const src = override || (cfg?.kind === 'img' ? cfg?.src : null);
  img.src = src || 'assets/pet.png';
  img.alt = `${pet?.name || 'Pet'} Preview`;
}

function pickRandom(list) {
  if (!Array.isArray(list) || list.length === 0) return '';
  const idx = Math.floor(Math.random() * list.length);
  return list[idx];
}

const speechTimers = new WeakMap();

function speak(petSpeechBubble, text, ms = 1200) {
  if (!petSpeechBubble) return;

  const prev = speechTimers.get(petSpeechBubble);
  if (prev) clearTimeout(prev);

  petSpeechBubble.textContent = text;
  petSpeechBubble.style.display = 'block';
  const timer = setTimeout(() => {
    petSpeechBubble.style.display = 'none';
    speechTimers.delete(petSpeechBubble);
  }, ms);

  speechTimers.set(petSpeechBubble, timer);
}

export function mountPet(els) {
  const { feedBtn, petMedia, petSpeechBubble, storeBtn } = els;

  let currentPetId = 3;
  let currentGrowth = 0;
  let currentPhase = null;
  let lastPetClickSpeakAt = 0;

  function refreshMedia() {
    const phase = getPetPhaseFromGrowth(currentGrowth);
    if (phase === currentPhase) return;
    currentPhase = phase;
    renderPetMedia(els, currentPetId, phase);
    renderSidebarPreview(els, currentPetId, currentGrowth);
  }

  async function loadActivePetAndGrowth() {
    try {
      const st = await getPetsState();
      currentPetId = Number(st?.activePetId) || 3;
    } catch (e) {
      console.warn('[Pet] Failed to load pet state:', e);
      currentPetId = 3;
    }

    // Default to phase-1 visuals immediately; update once growth loads.
    currentGrowth = 0;
    currentPhase = null;
    renderGrowthUI(els, currentGrowth);
    renderPetMedia(els, currentPetId, 1);
    renderSidebarPreview(els, currentPetId, currentGrowth);

    try {
      const growth = await getPetGrowth(currentPetId);
      currentGrowth = Math.min(MAX_GROWTH, Math.max(0, Number(growth) || 0));
      renderGrowthUI(els, currentGrowth);
      refreshMedia();
    } catch (e) {
      console.warn('[Pet] Failed to load growth:', e);
      currentGrowth = 0;
      renderGrowthUI(els, currentGrowth);
      refreshMedia();
    }
  }

  loadActivePetAndGrowth();

  onPetsChanged((st) => {
    const next = Number(st?.activePetId);
    if (!next || next === currentPetId) return;
    currentPetId = next;
    loadActivePetAndGrowth();
  });

  petMedia?.addEventListener('click', () => {
    const now = Date.now();
    if (now - lastPetClickSpeakAt < 1000) return; // at most one response per second
    lastPetClickSpeakAt = now;

    const phase = getPetPhaseFromGrowth(currentGrowth);
    const key = phase === 1 ? 'egg' : phase === 2 ? 'juvenile' : 'adult';
    const text = pickRandom(PET_SPEECH[key]);
    speak(petSpeechBubble, text || '...', 1400);
  });

  feedBtn?.addEventListener('click', async () => {
    try {
      if (currentGrowth >= MAX_GROWTH) {
        speak(petSpeechBubble, `Already max level (Lv ${MAX_LEVEL}).`, 1400);
        return;
      }

      const inv = await getInventory();
      const best = FOOD_PRIORITY.find((f) => (inv[f.id] || 0) > 0);

      if (!best) {
        speak(petSpeechBubble, 'No food. Visit the store!');
        storeBtn?.focus?.();
        return;
      }

      await consumeInventoryItem(best.id, 1);
      const growth = await addPetGrowth(currentPetId, best.exp);
      currentGrowth = Math.min(MAX_GROWTH, Math.max(0, Number(growth) || 0));
      renderGrowthUI(els, currentGrowth);
      refreshMedia();
      speak(petSpeechBubble, `Yum! +${best.exp} EXP`, 1400);
    } catch (e) {
      console.warn('[Pet] Feed failed:', e);
      speak(petSpeechBubble, 'Could not feed right now.');
    }
  });

}
