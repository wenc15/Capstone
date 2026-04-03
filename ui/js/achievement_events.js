const API_BASE = 'http://localhost:5024';

async function postJson(path, body) {
  try {
    await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
  } catch {
    // ignore non-critical achievement reporting errors
  }
}

export function reportAchievementIncrement(type, delta = 1) {
  const safeType = String(type || '').trim();
  const safeDelta = Number(delta);
  if (!safeType || !Number.isFinite(safeDelta) || safeDelta <= 0) return;
  void postJson('/api/achievements/counter/increment', { type: safeType, delta: Math.floor(safeDelta) });
}

export function reportAchievementMax(type, value) {
  const safeType = String(type || '').trim();
  const safeValue = Number(value);
  if (!safeType || !Number.isFinite(safeValue) || safeValue < 0) return;
  void postJson('/api/achievements/counter/max', { type: safeType, value: Math.floor(safeValue) });
}
