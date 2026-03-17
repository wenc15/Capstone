// 2026/03/16 updated by Darren (Chengyuan Wen)
// =============================================================
// File: FoodGachaService.cs
// Purpose: Core business logic for the Food Gacha system (Food Pool).
//
// Features:
//   - Load enabled foods from FoodDefinitions (EF Core + SQLite)
//   - Validate and deduct Credits before granting rewards
//   - Food rarity logic (Option A):
//       * Common: 70%
//       * Rare:   25%
//       * Epic:   5%
//     Rarity probability is fixed regardless of how many foods exist in each tier.
//     After selecting a rarity tier, pick a random food uniformly within that tier.
//   - Persist results into LOCAL JSON inventory (UserProfile.Inventory) using item key:
//       "food:<FoodId>"
//   - Achievement tracking:
//       Increment "food_draws_total" after successful draws
//
// Draw Modes:
//   - Single Draw (DrawOneAsync):
//       No guarantee / pity system.
//   - Ten Draw (DrawTenAsync):
//       Costs cost * 10 in a single transaction.
//       Guarantee: at least 1 Epic food in the 10 results (if Epic pool exists).
//
// Main Methods:
//   - DrawOneAsync(userId, cost)
//   - DrawTenAsync(userId, cost)
//
// Dependencies:
//   - AppDbContext:
//       * FoodDefinitions: food catalog / pool
//   - LocalDataService:
//       * TryConsumeCredits(cost, out newCredits)
//       * GetInventory(), AddInventoryItem(...)
//   - AchievementService:
//       * IncrementCounter("food_draws_total", ...)
//
// Notes:
//   - userId is "local" for now (no auth).
//   - Rarity labels are expected to be English: "Common", "Rare", "Epic" (case-insensitive).
//   - Random.Shared is used for basic randomness (not cryptographic).
// =============================================================




//2026/03/12 updated by Darren (Chengyuan Wen)
// =============================================================
// File: FoodGachaService.cs
// Purpose: Core business logic for the Food Gacha system (Food Pool).
//          - Load enabled food pool from FoodDefinitions (EF Core + SQLite)
//          - Validate and deduct Credits (Token) before granting rewards
//          - Draw 1 food item using rarity-weighted rules (Option A):
//              * Common: 70%
//              * Rare:   25%
//              * Epic:   5%
//            (Rarity probability is fixed regardless of how many foods exist in each tier;
//             after choosing a tier, pick uniformly within that tier.)
//          - Persist the result into LOCAL JSON inventory (UserProfile.Inventory):
//              * New item  -> IsNew = true
//              * Duplicate -> increment Count, IsNew = false
//          - Track achievements:
//              * Increment "food_draws_total" counter after each successful draw
//
// Main Method:
//   - DrawOneAsync(userId, cost)
//       1) Load enabled food pool
//       2) Consume credits (cost)
//       3) Pick rarity by weights, then pick a food within that rarity
//       4) Upsert inventory (food:<FoodId>)
//       5) Increment achievement counter
//       6) Return DTO result (drawn item + new credits)
//
// Dependencies:
//   - AppDbContext (EF Core):
//       * FoodDefinitions: food pool/catalog
//   - LocalDataService (local JSON storage):
//       * TryConsumeCredits(cost, out newCredits)
//       * GetInventory(), AddInventoryItem(...)
//   - AchievementService:
//       * IncrementCounter("food_draws_total", 1)
//
// Notes:
//   - userId is "local" for now (no auth). Can be replaced later.
//   - Rarity strings are expected to be English-only: "Common", "Rare", "Epic" (case-insensitive).
//   - ImageKey is an asset key (frontend maps to images), not a file path.
//   - Random.Shared is used for basic randomness (not cryptographic).
// =============================================================


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
    Task<FoodDraw10ResultDto> DrawTenAsync(string userId, int cost);
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

        // 2) Deduct credits
        var ok = _dataService.TryConsumeCredits(cost, out var newCredits);
        if (!ok)
            throw new InvalidOperationException("insufficient credits");

        // 3) Pick by rarity weighted (Common 70 / Rare 25 / Epic 5)
        var drawn = PickByRarityWeighted(pool);

        // 4) Inventory upsert
        var itemId = $"food:{drawn.FoodId}";
        var inv = _dataService.GetInventory();
        var before = inv.TryGetValue(itemId, out var c) ? c : 0;

        _dataService.AddInventoryItem(itemId, 1);

        // 5) Achievements
        _achievementService.IncrementCounter("food_draws_total", 1);

        var isNew = before == 0;

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

    // -----------------------------
    // Rarity-weighted selection
    // -----------------------------
    private static readonly (string Key, int Weight)[] RarityWeights =
    {
        ("common", 70),
        ("rare", 25),
        ("epic", 5),
    };

    private static string NormalizeRarity(string? rarity)
    {
        if (string.IsNullOrWhiteSpace(rarity)) return "common";
        return rarity.Trim().ToLowerInvariant(); // expects "Common/Rare/Epic" in foods.json
    }

    private static FoodDefinition PickByRarityWeighted(List<FoodDefinition> pool)
    {
        var groups = pool
            .GroupBy(f => NormalizeRarity(f.Rarity), StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.ToList(), StringComparer.OrdinalIgnoreCase);

        var available = RarityWeights
            .Where(w => groups.TryGetValue(w.Key, out var list) && list.Count > 0)
            .ToList();

        // If configured tiers are missing, fallback to uniform pick
        if (available.Count == 0)
            return pool[Random.Shared.Next(pool.Count)];

        var total = available.Sum(x => x.Weight);
        var roll = Random.Shared.Next(1, total + 1); // 1..total

        var acc = 0;
        foreach (var (key, weight) in available)
        {
            acc += weight;
            if (roll <= acc)
            {
                var list = groups[key];
                return list[Random.Shared.Next(list.Count)];
            }
        }

        // Should never happen
        return pool[Random.Shared.Next(pool.Count)];
    }
}

private static bool IsEpic(FoodDefinition f)
    => NormalizeRarity(f.Rarity) == "epic";


public async Task<FoodDraw10ResultDto> DrawTenAsync(string userId, int cost)
{
    if (cost <= 0)
        throw new InvalidOperationException("cost must be a positive integer.");

    // 1) Load pool
    var pool = await _db.FoodDefinitions
        .Where(f => f.IsEnabled)
        .ToListAsync();

    if (pool.Count == 0)
        throw new InvalidOperationException("No food available to draw. Seed FoodDefinitions first.");

    // 2) Deduct credits ONCE (10 draws)
    var totalCost = checked(cost * 10);
    var ok = _dataService.TryConsumeCredits(totalCost, out var newCredits);
    if (!ok)
        throw new InvalidOperationException("insufficient credits");

    // 3) Plan 10 draws first (so we can enforce guarantee without undo)
    var planned = new List<FoodDefinition>(capacity: 10);
    for (var i = 0; i < 10; i++)
    {
        planned.Add(PickByRarityWeighted(pool)); // your Option A weighted picker
    }

    // 4) Guarantee: at least 1 Epic
    var epicPool = pool.Where(IsEpic).ToList();
    var guaranteedEpicApplied = false;

    if (epicPool.Count > 0 && !planned.Any(IsEpic))
    {
        planned[9] = epicPool[Random.Shared.Next(epicPool.Count)]; // force last slot to Epic
        guaranteedEpicApplied = true;
    }

    // 5) Apply results to inventory + build DTO list
    var items = new List<DrawnFoodDto>(capacity: 10);
    var invSnapshot = _dataService.GetInventory(); // local snapshot for isNew tracking

    foreach (var drawn in planned)
    {
        var itemId = $"food:{drawn.FoodId}";
        var before = invSnapshot.TryGetValue(itemId, out var c) ? c : 0;

        _dataService.AddInventoryItem(itemId, 1);

        invSnapshot[itemId] = before + 1;

        items.Add(new DrawnFoodDto(
            FoodId: drawn.FoodId,
            Name: drawn.Name,
            Rarity: drawn.Rarity,
            ExpValue: drawn.ExpValue,
            ImageKey: drawn.ImageKey,
            IsNew: before == 0
        ));
    }

    // Achievements: count 10 food draws
    _achievementService.IncrementCounter("food_draws_total", 10);

    return new FoodDraw10ResultDto(
        Items: items,
        NewCredits: newCredits,
        GuaranteedEpicApplied: guaranteedEpicApplied
    );
}
