// 2026/01/16 created by Zikai
// =============================================================
// 文件：CreditsController.cs
// 作用：提供点数（Credits）系统相关的 HTTP 接口，供前端调用。
// 结构：
//   - GET  /api/credits         查询当前点数余额
//   - POST /api/credits/add     增加指定数量的点数
//   - POST /api/credits/consume 消耗指定数量的点数（余额不足时返回 400）
// 依赖：LocalDataService 中的 GetCredits() / AddCredits() / TryConsumeCredits()。
// =============================================================

using CapstoneBackend.Models;
using CapstoneBackend.Services;
using Microsoft.AspNetCore.Mvc;

namespace CapstoneBackend.Controllers;

[ApiController]
[Route("api/[controller]")]
public class CreditsController : ControllerBase
{
    private readonly LocalDataService _dataService;

    public CreditsController(LocalDataService dataService)
    {
        _dataService = dataService;
    }

    /// <summary>
    /// 查询当前点数余额。
    /// 路径：GET /api/credits
    /// </summary>
    [HttpGet]
    public ActionResult<CreditBalanceResponse> GetCredits()
    {
        var credits = _dataService.GetCredits();
        return Ok(new CreditBalanceResponse { Credits = credits });
    }

    /// <summary>
    /// 增加指定数量的点数。
    /// 路径：POST /api/credits/add
    /// 请求体：{ "amount": 10 }
    /// amount 必须为正数。
    /// </summary>
    [HttpPost("add")]
    public ActionResult<CreditBalanceResponse> AddCredits([FromBody] CreditAmountRequest request)
    {
        if (request == null || request.Amount <= 0)
        {
            return BadRequest(new { message = "amount must be a positive integer." });
        }

        var newBalance = _dataService.AddCredits(request.Amount);
        return Ok(new CreditBalanceResponse { Credits = newBalance });
    }

    /// <summary>
    /// 消耗指定数量的点数。
    /// 路径：POST /api/credits/consume
    /// 请求体：{ "amount": 5 }
    /// 余额不足时返回 400。
    /// </summary>
    [HttpPost("consume")]
    public ActionResult<CreditBalanceResponse> ConsumeCredits([FromBody] CreditAmountRequest request)
    {
        if (request == null || request.Amount <= 0)
        {
            return BadRequest(new { message = "amount must be a positive integer." });
        }

        var success = _dataService.TryConsumeCredits(request.Amount, out var newBalance);

        if (!success)
        {
            return BadRequest(new
            {
                message = "insufficient credits.",
                currentCredits = newBalance
            });
        }

        return Ok(new CreditBalanceResponse { Credits = newBalance });
    }
}