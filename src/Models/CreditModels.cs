// 2026/01/16 created by Zikai
// =============================================================
// 文件：CreditModels.cs
// 作用：定义点数（Credits）系统相关的请求与响应模型。
// 结构：
//   - CreditAmountRequest: 通用点数变更请求体（增加/消耗点数）
//   - CreditBalanceResponse: 返回当前点数余额给前端展示
// =============================================================

namespace CapstoneBackend.Models;

/// <summary>
/// 修改点数时通用的请求体模型，例如：
/// { "amount": 10 }
/// </summary>
public class CreditAmountRequest
{
    /// <summary>
    /// 要增加或消耗的点数数量。
    /// 必须为正整数；后端会对非法值进行校验。
    /// </summary>
    public int Amount { get; set; }
}

/// <summary>
/// 返回当前点数余额的响应模型。
/// </summary>
public class CreditBalanceResponse
{
    /// <summary>当前点数余额。</summary>
    public int Credits { get; set; }
}
