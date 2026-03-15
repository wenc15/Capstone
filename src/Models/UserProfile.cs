// 2026/01/27 edited by Zikai Lu
// 新增内容：
//   - 在用户 Profile 中增加 Inventory 字典，用于存储物品及其数量。
// 新增的作用：
//   - 为背包系统提供本地物品存储能力。
// =============================================================
// 2026/01/21 edited by Zikai Lu
// 新增内容：
//   - 在用户 Profile 中增加 PetGrowth 列表，用于存储宠物成长值（按编号索引）。
// 新增的作用：
//   - 为宠物系统提供本地成长值数据来源，便于查询与增减。
// =============================================================
// 2026/01/16 edited by Zikai
// 新增内容：
//   - 在用户 Profile 中增加 Credits 字段，保存当前点数余额。
// 新增的作用：
//   - 为点数系统（抽奖、商店等）提供统一的数据来源。
// =============================================================
// 2025/11/17 created by Zikai
// 文件：UserProfile.cs
// 作用：定义用户总体专注统计与点数信息的数据模型，持久化到本地 JSON。
// 结构：
//   - 累计时长与会话统计：TotalFocusSeconds / TotalSessions / SuccessfulSessions / FailedSessions / CanceledSessions
//   - 点数信息：Credits（当前点数余额）
// =============================================================
//
//
//
// 文件：UserProfile.cs
// 作用：定义用户的总体专注统计信息与点数信息，存储在本地 JSON 中。
// 结构：
//   - TotalFocusSeconds: 累计专注时长（秒）
//   - TotalSessions:     总会话数
//   - SuccessfulSessions:成功会话数
//   - FailedSessions:    失败会话数
//   - CanceledSessions:  取消会话数（手动停止）
//   - Credits:           当前点数余额（按专注分钟数累计）
// 开发者（Profile 部分）：Zikai Lu
// =============================================================
// 2026/03/14 edited by JS
// Changes:
//   - Add pet ownership state (ActivePetId / UnlockedPetIds).
//   - Default active/unlocked pet to 3.

// 2026/03/14 edited by JS
// Changes:
//   - Track the current "feeding" pet separately (FeedingPetId).
//   - Buying a new pet is gated by FeedingPetId reaching max level.

using System;
using System.Collections.Generic;

namespace CapstoneBackend.Models;

public class UserProfile
{
    /// <summary>累计专注时长（秒）。包含成功、失败、手动结束的所有专注时间。</summary>
    public long TotalFocusSeconds { get; set; }

    /// <summary>总会话数（成功 + 失败 + 手动结束）。</summary>
    public int TotalSessions { get; set; }

    /// <summary>成功会话数。</summary>
    public int SuccessfulSessions { get; set; }

    /// <summary>失败会话数。</summary>
    public int FailedSessions { get; set; }

    /// <summary>取消会话数：用户主动点击“停止专注”的次数。</summary>
    public int CanceledSessions { get; set; }

    /// <summary>
    /// 当前点数余额。
    /// 每次专注结束时按 floor(专注时长/60秒) 增加对应点数，
    /// 之后可用于抽奖系统、商店系统等。
    /// </summary>
    public int Credits { get; set; }

    /// <summary>
    /// 宠物成长值列表，索引即宠物编号（从 0 开始）。
    /// 默认值为 0；预留 -1 表示“未拥有”的情况（未来可用）。
    /// </summary>
    public List<int> PetGrowth { get; set; } = new();

    /// <summary>
    /// 当前激活的宠物编号。
    /// 约定：本版本仅有 1/2/3 三只宠物；默认使用宠物 3。
    /// </summary>
    public int ActivePetId { get; set; } = 3;

    /// <summary>
    /// 当前正在喂养/推进进度的宠物编号。
    /// 规则：必须让这只宠物满级（Lv20）才能购买下一只新宠物。
    /// </summary>
    public int FeedingPetId { get; set; } = 3;

    /// <summary>
    /// 已解锁/拥有的宠物编号列表。
    /// 默认解锁宠物 3。
    /// </summary>
    public List<int> UnlockedPetIds { get; set; } = new() { 3 };

    /// <summary>
    /// 背包物品字典，key 为物品 id，value 为数量。
    /// 未包含的物品视为数量 0。
    /// </summary>
    public Dictionary<string, int> Inventory { get; set; } = new(StringComparer.OrdinalIgnoreCase);

    /// <summary>
/// Achievement counters (event-style), e.g.:
/// - "food_draws_total": 3
/// - "credits_earned_total": 120
/// </summary>
public Dictionary<string, int> AchievementCounters { get; set; } = new(StringComparer.OrdinalIgnoreCase);

/// <summary>
/// Unlocked achievement ids, e.g. "first_focus", "first_food_draw".
/// </summary>
public HashSet<string> UnlockedAchievements { get; set; } = new(StringComparer.OrdinalIgnoreCase);

/// <summary>
/// Unlock timestamps (UTC), keyed by achievement id.
/// </summary>
public Dictionary<string, DateTimeOffset> AchievementUnlockedAt { get; set; } = new(StringComparer.OrdinalIgnoreCase);
}
