// 2026/01/21 created by Zikai Lu
// =============================================================
// 文件：InventoryModels.cs
// 作用：定义背包系统相关的请求与响应模型。
// 结构：
//   - InventoryAmountRequest: 物品数量变更请求体（增加/消耗）
//   - InventoryResponse: 返回背包物品及其数量
// =============================================================

using System.Collections.Generic;

namespace CapstoneBackend.Models;

/// <summary>
/// 修改背包物品数量时通用的请求体模型，例如：
/// { "itemId": "testObject1", "amount": 2 }
/// </summary>
public class InventoryAmountRequest
{
    /// <summary>
    /// 物品 ID。
    /// </summary>
    public string ItemId { get; set; } = string.Empty;

    /// <summary>
    /// 要增加或消耗的数量。
    /// 必须为正整数；后端会对非法值进行校验。
    /// </summary>
    public int Amount { get; set; }
}

/// <summary>
/// 返回背包物品的响应模型。
/// </summary>
public class InventoryResponse
{
    /// <summary>背包物品及其数量。</summary>
    public Dictionary<string, int> Items { get; set; } = new();
}
