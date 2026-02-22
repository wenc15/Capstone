// 2026/02/13 created by Darren (Chengyuan Wen)
// =============================================================
// File: FoodGachaService.cs
// Purpose: Core business logic for the Food Gacha system.
//          - Read food pool from FoodDefinition (enabled only)
//          - Validate and deduct Credits (Token) before granting rewards
//          - Randomly draw 1 food item (currently uniform; rarity weighting can be added later)
//          - Persist the result into user inventory (UserFood):
//              * New item  -> insert row, IsNew = true
//              * Duplicate -> increment Count, IsNew = false
//
// Structure / Main Methods:
//   - DrawOneAsync(userId, cost)
//       1) Load enabled food pool
//       2) Check + consume credits (cost)
//       3) Pick a food randomly from the pool
//       4) Upsert inventory (insert or Count++)
//       5) Save changes and return DTO result (drawn item + new credits)
//
// Dependencies:
//   - AppDbContext (EF Core + SQLite)
//       * FoodDefinitions: food pool/catalog
//       * UserFoods: per-user inventory
//   - LocalDataService (Credits/Token system)
//       * TryConsumeCredits(cost, out newCredits)
//   - DTOs: FoodDrawResultDto, DrawnFoodDto
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

    public FoodGachaService(AppDbContext db, LocalDataService dataService)
    {
        _db = db;
        _dataService = dataService;
    }

    public async Task<FoodDrawResultDto> DrawOneAsync(string userId, int cost)
    {
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

        // 4) Inventory upsert
        var existing = await _db.UserFoods
            .FirstOrDefaultAsync(x => x.UserId == userId && x.FoodId == drawn.FoodId);

        bool isNew;
        if (existing == null)
        {
            isNew = true;
            _db.UserFoods.Add(new UserFood
            {
                UserId = userId,
                FoodId = drawn.FoodId,
                ObtainedAt = DateTime.UtcNow,
                Count = 1
            });
        }
        else
        {
            isNew = false;
            existing.Count += 1;
        }

        await _db.SaveChangesAsync();

        return new FoodDrawResultDto(
            Item: new DrawnFoodDto(drawn.FoodId, drawn.Name, drawn.Rarity, drawn.ExpValue, drawn.ImageKey, isNew),
            NewCredits: newCredits
        );
    }

    private static FoodDefinition PickUniform(List<FoodDefinition> pool)
    {
        var idx = Random.Shared.Next(0, pool.Count);
        return pool[idx];
    }
}

