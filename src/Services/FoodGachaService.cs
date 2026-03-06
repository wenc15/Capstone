// 2026/02/13 created by Darren (Chengyuan Wen)
// =============================================================
// File: FoodGachaService.cs
// Purpose: Core business logic for the Food Gacha system.
//          - Read food pool from FoodDefinition (enabled only)
//          - Validate and deduct Credits (Token) before granting rewards
//          - Randomly draw 1 food item (currently uniform; rarity weighting can be added later)
//          - Persist the result into LOCAL JSON inventory (LocalDataService Inventory):
//              * New item  -> IsNew = true
//              * Duplicate -> Count++, IsNew = false
//
// Notes:
//   - userId is "local" for now (no auth). Can be replaced later.
//   - ImageKey is an asset key (frontend maps to images), not a file path.
//   - Random.Shared is fine for basic randomness (not cryptographic).
// =============================================================

using CapstoneBackend.Data;
using CapstoneBackend.Models;
using CapstoneBackend.Services.Dtos;
using Microsoft.EntityFrameworkCore;

namespace CapstoneBackend.Services;

public interface IFoodGachaService
{
    Task<FoodDrawResultDto> DrawOneAsync(string userId, int cost);
}

public class FoodGachaService : IFoodGachaService
{
    private readonly AppDbContext _db;
    private readonly LocalDataService _dataService;
    private readonly AchievementService _achievementService;

    public FoodGachaService(AppDbContext db, LocalDataService dataService, AchievementService achievementService)
    {
        _db = db;
        _dataService = dataService;
        _achievementService = achievementService;
    }

    public async Task<FoodDrawResultDto> DrawOneAsync(string userId, int cost)
    {
        if (cost <= 0)
            throw new InvalidOperationException("cost must be a positive integer.");

        // 1) Food pool
        var pool = await _db.FoodDefinitions
            .Where(f => f.IsEnabled)
            .ToListAsync();

        if (pool.Count == 0)
            throw new InvalidOperationException("No food available to draw. Seed FoodDefinitions first.");

        // 2) Validate + deduct credits (token)
        var ok = _dataService.TryConsumeCredits(cost, out var newCredits);
        if (!ok)
            throw new InvalidOperationException("insufficient credits");

        // 3) Random pick (uniform for now)
        var drawn = PickUniform(pool);

        // 4) Inventory upsert (LOCAL JSON inventory)
        var itemId = $"food:{drawn.FoodId}";

        var inv = _dataService.GetInventory();
        var before = inv.TryGetValue(itemId, out var c) ? c : 0;

        _dataService.AddInventoryItem(itemId, 1);

        // ✅ Hook achievements: count total food draws
        _achievementService.IncrementCounter("food_draws_total", 1);

        var isNew = before == 0;

        // 5) Return result
        return new FoodDrawResultDto(
            Item: new DrawnFoodDto(
                FoodId: drawn.FoodId,
                Name: drawn.Name,
                Rarity: drawn.Rarity,
                ExpValue: drawn.ExpValue,
                ImageKey: drawn.ImageKey,
                IsNew: isNew
            ),
            NewCredits: newCredits
        );
    }

    private static FoodDefinition PickUniform(List<FoodDefinition> pool)
    {
        var idx = Random.Shared.Next(0, pool.Count);
        return pool[idx];
    }
}