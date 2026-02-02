// 2026/01/28 edited by JS
// Changes:
//  - Wire Pet Feed to backend Inventory/PetGrowth APIs.
//  - Update level/exp UI based on stored growth.

// js/pet.js

const API_BASE = 'http://localhost:5024';
const PET_ID = 0;
const EXP_PER_LEVEL = 100;

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

function speak(petSpeechBubble, text, ms = 1200) {
  if (!petSpeechBubble) return;
  petSpeechBubble.textContent = text;
  petSpeechBubble.style.display = 'block';
  setTimeout(() => (petSpeechBubble.style.display = 'none'), ms);
}

export function mountPet(els) {
  const { feedBtn, playBtn, petSpeechBubble, storeBtn } = els;

  getPetGrowth()
    .then((growth) => renderGrowthUI(els, growth))
    .catch((e) => console.warn('[Pet] Failed to load growth:', e));

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
      renderGrowthUI(els, growth);
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
