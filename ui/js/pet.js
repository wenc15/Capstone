// 2026/01/28 edited by JS
// Changes:
//  - Wire Pet Feed to backend Inventory/PetGrowth APIs.
//  - Update level/exp UI based on stored growth.

// js/pet.js

const API_BASE = 'http://localhost:5024';
const PET_ID = 0;
const EXP_PER_LEVEL = 100;

// Stage thresholds (cumulative growth EXP)
//  - Egg -> Juvenile: 300
//  - Juvenile -> Adult: +2000 (i.e. Adult at 2300 total)
const EGG_TO_JUVENILE_EXP = 300;
const JUVENILE_TO_ADULT_EXP = 2000;
const ADULT_EXP_THRESHOLD = EGG_TO_JUVENILE_EXP + JUVENILE_TO_ADULT_EXP;

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

const EGG_IMG_SRC = 'assets/egg.png';
const ADULT_VIDEO_SRC = 'assets/adult1.webm';
const JUVENILE_IMG_SRC = 'assets/pet1.gif';

const FOOD_PRIORITY = [
  { id: 'adv_food', exp: 30 },
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

async function getPetGrowth() {
  const data = await fetchJson(`/api/pets/${PET_ID}/growth`);
  return data?.growth ?? 0;
}

async function addPetGrowth(amount) {
  const data = await fetchJson(`/api/pets/${PET_ID}/growth/add`, {
    method: 'POST',
    body: JSON.stringify({ amount }),
  });
  return data?.growth ?? 0;
}

function renderGrowthUI(els, growth) {
  if (!els?.petLevel || !els?.petExpFill) return;

  const safe = Math.max(0, Number(growth) || 0);
  const level = Math.floor(safe / EXP_PER_LEVEL) + 1;
  const inLevel = safe % EXP_PER_LEVEL;
  const pct = Math.max(0, Math.min(100, Math.round((inLevel / EXP_PER_LEVEL) * 100)));

  els.petLevel.textContent = String(level);
  els.petExpFill.style.width = `${pct}%`;
}

function getPetStageFromGrowth(growth) {
  const safe = Math.max(0, Number(growth) || 0);
  if (safe < EGG_TO_JUVENILE_EXP) return 'egg';
  if (safe < ADULT_EXP_THRESHOLD) return 'juvenile';
  return 'adult';
}

function renderPetMedia(els, stage, juvenileSrc) {
  const host = els?.petMedia;
  if (!host) return;

  if (stage === 'egg') {
    host.innerHTML = `
      <img id="petImage" src="${EGG_IMG_SRC}" alt="Pet" class="pet-sprite is-egg" style="width: 200px">
    `.trim();
    return;
  }

  if (stage === 'juvenile') {
    const src = juvenileSrc || JUVENILE_IMG_SRC;
    host.innerHTML = `
      <img id="petImage" src="${src}" alt="Pet" class="pet-sprite" style="width: 200px">
    `.trim();
    return;
  }

  host.innerHTML = `
    <video id="petVideo" class="pet-sprite pet-video" width="200" height="200" muted autoplay loop playsinline preload="auto">
      <source src="${ADULT_VIDEO_SRC}" type="video/webm" />
    </video>
  `.trim();

  const video = host.querySelector('video');
  const p = video?.play?.();
  if (p && typeof p.catch === 'function') p.catch(() => {});
}

function pickRandom(list) {
  if (!Array.isArray(list) || list.length === 0) return '';
  const idx = Math.floor(Math.random() * list.length);
  return list[idx];
}

function speak(petSpeechBubble, text, ms = 1200) {
  if (!petSpeechBubble) return;
  petSpeechBubble.textContent = text;
  petSpeechBubble.style.display = 'block';
  setTimeout(() => (petSpeechBubble.style.display = 'none'), ms);
}

export function mountPet(els) {
  const { feedBtn, playBtn, petMedia, petImage, petSpeechBubble, storeBtn } = els;

  let currentGrowth = 0;
  let currentStage = null;
  const juvenileSrc = petImage?.getAttribute('src') || JUVENILE_IMG_SRC;

  function maybeUpgradeMedia(growth) {
    const stage = getPetStageFromGrowth(growth);
    if (stage === currentStage) return;
    currentStage = stage;
    renderPetMedia(els, stage, juvenileSrc);
  }

  // Default to egg visuals immediately; update once growth loads.
  renderGrowthUI(els, currentGrowth);
  maybeUpgradeMedia(currentGrowth);

  getPetGrowth()
    .then((growth) => {
      currentGrowth = growth;
      renderGrowthUI(els, growth);
      maybeUpgradeMedia(growth);
    })
    .catch((e) => {
      console.warn('[Pet] Failed to load growth:', e);
      // Keep the default egg state if we cannot load.
      currentGrowth = 0;
      renderGrowthUI(els, currentGrowth);
      maybeUpgradeMedia(currentGrowth);
    });

  petMedia?.addEventListener('click', () => {
    const stage = getPetStageFromGrowth(currentGrowth);
    const text = pickRandom(PET_SPEECH[stage]);
    speak(petSpeechBubble, text || '...', 1400);
  });

  feedBtn?.addEventListener('click', async () => {
    try {
      const inv = await getInventory();
      const best = FOOD_PRIORITY.find((f) => (inv[f.id] || 0) > 0);

      if (!best) {
        speak(petSpeechBubble, 'No food. Visit the store!');
        storeBtn?.focus?.();
        return;
      }

      await consumeInventoryItem(best.id, 1);
      const growth = await addPetGrowth(best.exp);
      currentGrowth = growth;
      renderGrowthUI(els, growth);
      maybeUpgradeMedia(growth);
      speak(petSpeechBubble, `Yum! +${best.exp} EXP`, 1400);
    } catch (e) {
      console.warn('[Pet] Feed failed:', e);
      speak(petSpeechBubble, 'Could not feed right now.');
    }
  });

  playBtn?.addEventListener('click', () => {
    speak(petSpeechBubble, 'Let\'s play!');
  });
}
