// 2026/02/13 created by Darren (Chengyuan Wen)
// =============================================================
// File: FoodGachaDtos.cs
// Purpose: Define DTOs (Data Transfer Objects) for the Food Gacha system.
//          These DTOs describe the JSON shapes exchanged between backend and frontend.
//          They are NOT EF Core database entities (not tables).
//
// Structure:
//   - FoodDto
//       Used for displaying the full food pool (collection/library page).
//       Includes user-specific fields: Owned + Count.
//       Intended for: GET /api/foods  (or similar endpoint)
//
//   - DrawnFoodDto
//       Used for displaying the result of a gacha draw.
//       Includes IsNew to tell frontend whether this draw added a new item.
//       Intended for: part of POST /api/foodgacha/draw response
//
//   - FoodDrawResultDto
//       Wrapper response for draw endpoint.
//       Contains the drawn item + updated credits balance (after deducting cost).
//       Intended for: POST /api/foodgacha/draw
//
// Dependencies / Data Sources:
//   - FoodDefinition (food pool): FoodId, Name, Rarity, ExpValue, ImageKey
//   - UserFood (inventory): Owned, Count (computed per user)
//   - Credits system (LocalDataService): NewCredits returned after consumption
//
// Notes:
//   - FoodId is a stable identifier for frontend mapping (not DB primary key).
//   - ImageKey is an asset key (frontend maps it to images), not a file path.
// =============================================================

namespace CapstoneBackend.Services.Dtos;

public record FoodDto(
    string FoodId,
    string Name,
    string? Rarity,
    int ExpValue,
    string? ImageKey,
    bool Owned,
    int Count
);

public record DrawnFoodDto(
    string FoodId,
    string Name,
    string? Rarity,
    int ExpValue,
    string? ImageKey,
    bool IsNew
);

public record FoodDrawResultDto(
    DrawnFoodDto Item,
    int NewCredits
);

