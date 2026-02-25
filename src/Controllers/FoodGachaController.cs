// 2026/02/25 created by Darren (Chengyuan Wen)
// =============================================================
// File: FoodGachaController.cs
// Purpose: Expose HTTP API endpoint(s) for Food Gacha actions.
//          - POST /api/gacha/food/draw : consume credits and draw 1 food item
//
// Notes:
//   - userId is temporarily hardcoded as "local" (no auth yet).
//   - Core business logic is handled by IFoodGachaService.
//   - Controller is responsible for HTTP input/output + basic validation.
// =============================================================

using CapstoneBackend.Services;
using CapstoneBackend.Services.Dtos;
using Microsoft.AspNetCore.Mvc;

namespace CapstoneBackend.Controllers;

[ApiController]
[Route("api/gacha/food")]
public class FoodGachaController : ControllerBase
{
    private readonly IFoodGachaService _foodGachaService;

    public FoodGachaController(IFoodGachaService foodGachaService)
    {
        _foodGachaService = foodGachaService;
    }

    /// <summary>
    /// EN: Draw one food item from the gacha pool.
    /// CN: 从食物扭蛋卡池中抽取 1 个食物。
    /// </summary>
    /// <remarks>
    /// Path: POST /api/gacha/food/draw
    /// Example body: { "cost": 1 }
    /// </remarks>
    [HttpPost("draw")]
    public async Task<ActionResult<FoodDrawResultDto>> Draw([FromBody] FoodDrawRequestDto request)
    {
        // EN: Basic validation (cost must be > 0)
        // CN: 基础参数校验（cost 必须大于 0）
        if (request == null || request.Cost <= 0)
        {
            return BadRequest(new { message = "cost must be a positive integer." });
        }

        // EN: Temporary local user id before real authentication is added
        // CN: 暂时使用固定 userId（后续接入登录系统后替换）
        const string userId = "local";

        try
        {
            var result = await _foodGachaService.DrawOneAsync(userId, request.Cost);
            return Ok(result);
        }
        catch (InvalidOperationException ex)
        {
            // EN: Business rule errors (e.g., insufficient credits / empty pool)
            // CN: 业务规则错误（例如点数不足、卡池为空）
            return BadRequest(new { message = ex.Message });
        }
    }
}

/// <summary>
/// EN: Request body for draw API.
/// CN: 抽卡接口请求体（前端传入扣费 cost）
/// </summary>
public record FoodDrawRequestDto(int Cost);