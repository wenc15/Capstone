// 2026/1/28 updated by Zhecheng Xu
//   - Add addCredits() / consumeCredits() helpers.
//   - Normalize Credits API responses so callers always receive a number.
//
// 2026/1/22 created by Jingyao Sun
// 新增内容：
//   - 提供 Credits 点数系统的前端 API 封装。
//   - 对接后端 CreditsController（/api/credits）。
// =============================================================
// 作用补充：
//   - 作为前端获取真实 Token 点数的唯一数据入口。
//   - 被 creditsStore 调用，用于初始化与刷新点数显示。
// =============================================================
// File: creditsApi.js
// Purpose:
//   - Frontend-only wrapper for Credits endpoints (/api/credits).
//   - Provides a single, consistent API for reading/updating token credits.
//
// Notes:
//   - Backend may return either a plain number OR an object like { credits: number }.
//     We normalize both forms to a number.
//


const API_BASE = "http://localhost:5024"; // confirm backend port

async function readJsonSafely(res) {
  // If server returns empty body, json() will throw.
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function normalizeCredits(payload) {
  // Support: 123  OR  { credits: 123 }
  if (typeof payload === "number") return payload;
  if (payload && typeof payload.credits === "number") return payload.credits;
  // Fallback (unexpected shape)
  return 0;
}

async function requestJson(path, init = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers || {}),
    },
    ...init,
  });

  const body = await readJsonSafely(res);

  if (!res.ok) {
    const msg = body?.message || `${res.status} ${res.statusText}`;
    const err = new Error(msg);
    err.status = res.status;
    err.body = body;
    throw err;
  }

  return body;
}

// GET /api/credits
export async function getCredits() {
  const data = await requestJson("/api/credits");
  return normalizeCredits(data);
}

// POST /api/credits/add  body: { amount: number }
// Returns: { credits: number } (or number)
export async function addCredits(amount) {
  const data = await requestJson("/api/credits/add", {
    method: "POST",
    body: JSON.stringify({ amount }),
  });
  return normalizeCredits(data);
}

// POST /api/credits/consume  body: { amount: number }
// Returns: { credits: number } (or number)
export async function consumeCredits(amount) {
  const data = await requestJson("/api/credits/consume", {
    method: "POST",
    body: JSON.stringify({ amount }),
  });
  return normalizeCredits(data);
}
