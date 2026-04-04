// 2026/01/29 created by Chengyuan Wen(wenc15)
// =============================================================
// File: CardDtos.cs
// Purpose: Define DTOs (Data Transfer Objects) for the Draw Card system.
//          These DTOs are used to transfer data between backend and frontend,
//          and between Controller and Service. They are NOT database entities.
// Structure:
//   - CardDto        : Used by GET /api/cards (card list + owned status).
//   - DrawnCardDto   : Used in draw results (includes isNew flag).
//   - DrawResultDto  : Used by POST /api/cards/draw (two drawn card slots).
// Notes:
//   - "Owned" is computed from UserCard table (inventory), not stored in CardDefinition.
//   - "ImageKey" is a string key (not a file path). Frontend maps it to actual assets.
// =============================================================


namespace CapstoneBackend.Services.Dtos;

public record CardDto(
    int Id,
    string Name,
    string? Rarity,
    string? ImageKey,
    bool Owned
);

public record DrawnCardDto(
    int Id,
    string Name,
    string? Rarity,
    string? ImageKey,
    bool IsNew
);

public record DrawResultDto(
    DrawnCardDto Slot1,
    DrawnCardDto Slot2
);
