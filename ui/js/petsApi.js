// 2026/03/14 edited by JS
// Changes:
//  - Add Pets API helpers (state/unlock/active) and a small event bus.

// ui/js/petsApi.js

const API_BASE = 'http://localhost:5024';

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

export async function getPetsState() {
  const data = await fetchJson('/api/pets/state');
  return {
    activePetId: Number(data?.activePetId ?? 3),
    unlockedPetIds: Array.isArray(data?.unlockedPetIds) ? data.unlockedPetIds.map(Number) : [3],
  };
}

export async function setActivePet(petId) {
  const data = await fetchJson('/api/pets/active', {
    method: 'POST',
    body: JSON.stringify({ petId }),
  });
  const state = {
    activePetId: Number(data?.activePetId ?? petId),
    unlockedPetIds: Array.isArray(data?.unlockedPetIds) ? data.unlockedPetIds.map(Number) : [],
  };
  emitPetsChanged(state);
  return state;
}

export async function unlockPet(petId) {
  const data = await fetchJson('/api/pets/unlock', {
    method: 'POST',
    body: JSON.stringify({ petId }),
  });
  const state = {
    activePetId: Number(data?.activePetId ?? 3),
    unlockedPetIds: Array.isArray(data?.unlockedPetIds) ? data.unlockedPetIds.map(Number) : [],
  };
  emitPetsChanged(state);
  return state;
}

export function onPetsChanged(handler) {
  const fn = (e) => {
    try {
      handler?.(e?.detail || null);
    } catch {
      // ignore
    }
  };
  window.addEventListener('pets:changed', fn);
  return () => window.removeEventListener('pets:changed', fn);
}

export function emitPetsChanged(state) {
  window.dispatchEvent(new CustomEvent('pets:changed', { detail: state }));
}
