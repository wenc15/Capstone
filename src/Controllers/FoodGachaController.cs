using CapstoneBackend.Services;
using CapstoneBackend.Services.Dtos;
using Microsoft.AspNetCore.Mvc;

namespace CapstoneBackend.Controllers;

[ApiController]
[Route("api/gacha/food")]
public class FoodGachaController : ControllerBase
{
    private readonly IFoodGachaService _foodGachaService;
    private readonly LocalDataService _dataService;

    public FoodGachaController(IFoodGachaService foodGachaService, LocalDataService dataService)
    {
        _foodGachaService = foodGachaService;
        _dataService = dataService;
    }

    /// <summary>
    /// Single draw (no guarantee).
    /// Path: POST /api/gacha/food/draw
    /// Body: { "cost": 1 }
    /// </summary>
    [HttpPost("draw")]
    public async Task<ActionResult<FoodDrawResultDto>> Draw([FromBody] FoodDrawRequestDto request)
    {
        if (request == null || request.Cost <= 0)
            return BadRequest(new { message = "cost must be a positive integer." });

        const string userId = "local";

        try
        {
            var result = await _foodGachaService.DrawOneAsync(userId, request.Cost);
            return Ok(result);
        }
        catch (InvalidOperationException ex)
        {
            // Helpful for UI: show credits at failure time
            return BadRequest(new
            {
                message = ex.Message,
                currentCredits = _dataService.GetCredits()
            });
        }
    }

    /// <summary>
    /// Ten draw (guarantee: at least 1 Epic if Epic pool exists).
    /// Path: POST /api/gacha/food/draw10
    /// Body: { "cost": 1 }
    /// </summary>
    [HttpPost("draw10")]
    public async Task<ActionResult<FoodDraw10ResultDto>> Draw10([FromBody] FoodDrawRequestDto request)
    {
        if (request == null || request.Cost <= 0)
            return BadRequest(new { message = "cost must be a positive integer." });

        const string userId = "local";

        try
        {
            var result = await _foodGachaService.DrawTenAsync(userId, request.Cost);
            return Ok(result);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new
            {
                message = ex.Message,
                currentCredits = _dataService.GetCredits()
            });
        }
    }
}

public record FoodDrawRequestDto(int Cost);