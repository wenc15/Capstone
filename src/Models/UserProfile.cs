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
}
