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

export async function getCollectionItems() {
  const data = await fetchJson('/api/collection');
  const list = Array.isArray(data?.items) ? data.items : [];

  return list
    .map((item) => ({
      itemId: String(item?.itemId || item?.ItemId || '').trim(),
      displayName: String(item?.displayName || item?.DisplayName || item?.itemId || item?.ItemId || 'Unknown Item'),
      state: Number(item?.state ?? item?.State ?? 0) > 0 ? 1 : 0,
      isEnabled: Boolean(item?.isEnabled ?? item?.IsEnabled ?? false),
      game: String(item?.game || item?.Game || '').trim().toLowerCase(),
      rarity: String(item?.rarity || item?.Rarity || '').trim(),
      category: String(item?.category || item?.Category || '').trim(),
    }))
    .filter((item) => item.itemId)
    .sort((a, b) => a.itemId.localeCompare(b.itemId));
}

export async function setCollectionSkinEnabled(itemId, enable) {
  const body = await fetchJson('/api/collection/skin/enable', {
    method: 'POST',
    body: JSON.stringify({ itemId, enable }),
  });
  return {
    itemId: String(body?.itemId || body?.ItemId || itemId),
    game: String(body?.game || body?.Game || '').trim().toLowerCase(),
    enabled: Boolean(body?.enabled ?? body?.Enabled ?? enable),
    message: String(body?.message || body?.Message || ''),
  };
}

export async function getEnabledSkinForGame(game) {
  const key = String(game || '').trim().toLowerCase();
  if (!key) return null;

  const items = await getCollectionItems();
  return items.find((item) => item.game === key && item.state > 0 && item.isEnabled) || null;
}
