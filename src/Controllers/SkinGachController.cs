// 2026/03/12 created by Darren (Chengyuan Wen)
// =============================================================
// 文件：SkinGachaController.cs
// 作用：提供 Skin Pool 抽卡接口。
// 结构：
//   - POST /api/gacha/skin/draw
// 请求体：{ "cost": 1 }
// 返回：SkinDrawResultDto（drop + newCredits）
// =============================================================

// 2026/03/16 updated by Darren (Chengyuan Wen)
// =============================================================
// File: SkinGachaController.cs
// Purpose: Expose Skin Pool gacha endpoints.
// Structure:
//   - POST /api/gacha/skin/draw    : single draw (no guarantee)
//   - POST /api/gacha/skin/draw10  : ten draw (guarantee at least 1 skin, if pools exist)
// Request body: { "cost": 1 }
// Response:
//   - draw    -> SkinDrawResultDto
//   - draw10  -> SkinDraw10ResultDto
// =============================================================

using CapstoneBackend.Services;
using CapstoneBackend.Services.Dtos;
using Microsoft.AspNetCore.Mvc;

namespace CapstoneBackend.Controllers;

[ApiController]
[Route("api/gacha/skin")]
public class SkinGachaController : ControllerBase
{
    private readonly ISkinGachaService _service;

    public SkinGachaController(ISkinGachaService service)
    {
        _service = service;
    }

    /// <summary>
    /// Single draw (no guarantee).
    /// Path: POST /api/gacha/skin/draw
    /// Body: { "cost": 1 }
    /// </summary>
    [HttpPost("draw")]
    public async Task<ActionResult<SkinDrawResultDto>> Draw([FromBody] SkinDrawRequestDto request)
    {
        if (request == null || request.Cost <= 0)
            return BadRequest(new { message = "cost must be a positive integer." });

        const string userId = "local";

        try
        {
            var result = await _service.DrawOneAsync(userId, request.Cost, request.Pool ?? "tetris");
            return Ok(result);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    /// <summary>
    /// Ten draw (guarantee: at least 1 skin if skin pools exist).
    /// Path: POST /api/gacha/skin/draw10
    /// Body: { "cost": 1 }
    /// </summary>
    [HttpPost("draw10")]
    public async Task<ActionResult<SkinDraw10ResultDto>> Draw10([FromBody] SkinDrawRequestDto request)
    {
        if (request == null || request.Cost <= 0)
            return BadRequest(new { message = "cost must be a positive integer." });

        const string userId = "local";

        try
        {
            var result = await _service.DrawTenAsync(userId, request.Cost, request.Pool ?? "tetris");
            return Ok(result);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }
}
