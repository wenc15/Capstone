// 2026/1/22 created by Jingyao Sun
// 新增内容：
//   - 提供 Credits 点数系统的前端 API 封装。
//   - 对接后端 CreditsController（/api/credits）。
// =============================================================
// 作用补充：
//   - 作为前端获取真实 Token 点数的唯一数据入口。
//   - 被 creditsStore 调用，用于初始化与刷新点数显示。

const API_BASE = "http://localhost:5024"; // 按后端端口确认

export async function getCredits() {
  const res = await fetch(`${API_BASE}/api/credits`);
  if (!res.ok) throw new Error("getCredits failed");
  const data = await res.json();
  return typeof data === "number" ? data : data.credits;
}
