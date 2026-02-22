// 2026/01/29 created by Chengyuan Wen(wenc15)
// =============================================================
// File: CardsController.cs
// Purpose: Provide Draw Card system HTTP APIs for frontend.
// Endpoints:
//   - GET  /api/cards       : Get all cards + owned status (for card library UI)
//   - POST /api/cards/draw  : Draw 2 cards (duplicates allowed) + isNew flags
// Dependencies:
//   - ICardDrawService (business logic in Services)
// Notes:
//   - userId is "local" for now (no auth). Can be replaced later.
// =============================================================

using CapstoneBackend.Services;
using CapstoneBackend.Services.Dtos;
using Microsoft.AspNetCore.Mvc;

namespace CapstoneBackend.Controllers;

[ApiController]
[Route("api/[controller]")]
public class CardsController : ControllerBase
{
    private readonly ICardDrawService _cardDrawService;

    public CardsController(ICardDrawService cardDrawService)
    {
        _cardDrawService = cardDrawService;
    }

    [HttpGet]
    public async Task<ActionResult<List<CardDto>>> GetAllCards()
    {
        var userId = "local";
        var cards = await _cardDrawService.GetAllCardsAsync(userId);
        return Ok(cards);
    }

    [HttpPost("draw")]
    public async Task<ActionResult<DrawResultDto>> DrawTwo()
    {
        var userId = "local";
        var result = await _cardDrawService.DrawTwoAsync(userId);
        return Ok(result);
    }
}
