// 2026/01/29 created by Chengyuan Wen(wenc15)
// =============================================================
// File: ICardDrawService.cs
// Purpose: Define the service contract for the Draw Card system.
//          Controllers call this interface instead of directly talking to DB,
//          so we keep business logic centralized and testable.
// Structure:
//   - GetAllCardsAsync(userId)
//       Returns all cards (CardDefinition) plus "Owned" status from UserCard.
//       Intended for: GET /api/cards
//   - DrawTwoAsync(userId)
//       Draws 2 cards (duplicates allowed), updates inventory for newly obtained,
//       and returns draw result with isNew flags.
//       Intended for: POST /api/cards/draw
// Dependencies:
//   - DTOs in CapstoneBackend.Services.Dtos
//   - Implementation (CardDrawService) will depend on AppDbContext (EF Core + SQLite).
// Notes:
//   - userId is "local" for now (no auth), can be replaced later.
// =============================================================


using CapstoneBackend.Services.Dtos;

namespace CapstoneBackend.Services;

public interface ICardDrawService
{
    Task<List<CardDto>> GetAllCardsAsync(string userId);
    Task<DrawResultDto> DrawTwoAsync(string userId);
}
