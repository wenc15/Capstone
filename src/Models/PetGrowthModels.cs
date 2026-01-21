// 2026/01/21 created by Zikai Lu
// =============================================================
// 文件：PetGrowthModels.cs
// 作用：定义宠物成长值系统相关的请求与响应模型。
// 结构：
//   - PetGrowthAmountRequest: 宠物成长值变更请求体（增加/减少）
//   - PetGrowthResponse: 返回指定宠物成长值
// =============================================================

namespace CapstoneBackend.Models;

/// <summary>
/// 修改宠物成长值时通用的请求体模型，例如：
/// { "amount": 3 }
/// </summary>
public class PetGrowthAmountRequest
{
    /// <summary>
    /// 要增加或减少的成长值数量。
    /// 必须为正整数；后端会对非法值进行校验。
    /// </summary>
    public int Amount { get; set; }
}

/// <summary>
/// 返回宠物成长值的响应模型。
/// </summary>
public class PetGrowthResponse
{
    /// <summary>宠物编号（从 0 开始）。</summary>
    public int PetId { get; set; }

    /// <summary>当前成长值。</summary>
    public int Growth { get; set; }
}
