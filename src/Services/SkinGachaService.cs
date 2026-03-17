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


// 2026/03/12 created by Darren (Chengyuan Wen)
// =============================================================
// File: SkinGachaService.cs
// Purpose: Core logic for the Skin Pool gacha (10% building, 10% background, 80% food).
// Drop Rules:
//   - 10%: Building skins (skin_build_*)
//   - 10%: Background skins (skin_bg_*)
//   - 80%: Food fallback
// Special Rule (UPDATED):
//   - Food dropped from Skin Pool must always be Common rarity (if available).
// Dependencies:
//   - LocalDataService: credits, inventory, collection ownership
//   - SkinCatalogService: skins.json catalog + categories
//   - AppDbContext: FoodDefinitions pool
// Notes:
//   - If a skin pool is empty, fallback to food.
//   - If Common food pool is empty, fallback to any enabled food.
// =============================================================

using CapstoneBackend.Data;
using CapstoneBackend.Models;
using CapstoneBackend.Services.Dtos;
using Microsoft.EntityFrameworkCore;

namespace CapstoneBackend.Services;

public interface ISkinGachaService
{
    Task<SkinDrawResultDto> DrawOneAsync(string userId, int cost);
    Task<SkinDraw10ResultDto> DrawTenAsync(string userId, int cost);
}

public class SkinGachaService : ISkinGachaService
{
    private readonly AppDbContext _db;
    private readonly LocalDataService _dataService;
    private readonly SkinCatalogService _skinCatalog;

    private const double BuildingRate = 0.10;
    private const double BackgroundRate = 0.10;

    public SkinGachaService(AppDbContext db, LocalDataService dataService, SkinCatalogService skinCatalog)
    {
        _db = db;
        _dataService = dataService;
        _skinCatalog = skinCatalog;
    }

    public async Task<SkinDrawResultDto> DrawOneAsync(string userId, int cost)
    {
        if (cost <= 0)
            throw new InvalidOperationException("cost must be a positive integer.");

        // 1) consume credits
        var ok = _dataService.TryConsumeCredits(cost, out var newCredits);
        if (!ok)
            throw new InvalidOperationException("insufficient credits");

        // 2) roll drop type
        var roll = Random.Shared.NextDouble();

        if (roll < BuildingRate)
        {
            var buildingPool = _skinCatalog.GetBuildingSkins();
            if (buildingPool.Count > 0)
                return DrawSkin(buildingPool, "building", newCredits);

            // pool empty => fallback food
            return await DrawFoodFallbackCommonOnly(newCredits);
        }

        if (roll < BuildingRate + BackgroundRate)
        {
            var backgroundPool = _skinCatalog.GetBackgroundSkins();
            if (backgroundPool.Count > 0)
                return DrawSkin(backgroundPool, "background", newCredits);

            return await DrawFoodFallbackCommonOnly(newCredits);
        }

        // 80% food
        return await DrawFoodFallbackCommonOnly(newCredits);
    }

    private SkinDrawResultDto DrawSkin(List<CollectionItemDefinition> pool, string subType, int newCredits)
    {
        var idx = Random.Shared.Next(pool.Count);
        var skin = pool[idx];

        var ok = _dataService.TryAcquireCollectionItem(skin.ItemId, out var alreadyOwned, out _);
        if (!ok)
            throw new InvalidOperationException("skin item not found in catalog");

        return new SkinDrawResultDto(
            Drop: new SkinDropDto(
                DropType: "skin",
                SubType: subType,
                ItemId: skin.ItemId,
                Name: skin.DisplayName,
                ImageKey: null,
                IsNew: !alreadyOwned
            ),
            NewCredits: newCredits
        );
    }

    /// <summary>
    /// Food fallback for Skin Pool:
    /// - Always drop a Common food if possible.
    /// - If no Common food exists, fallback to any enabled food.
    /// </summary>
    private async Task<SkinDrawResultDto> DrawFoodFallbackCommonOnly(int newCredits)
    {
        // 1) Try Common-only pool first
        var commonPool = await _db.FoodDefinitions
            .Where(f => f.IsEnabled && f.Rarity != null && f.Rarity.ToLower() == "common")
            .ToListAsync();

        // 2) If no common food exists, fallback to any enabled food (safe)
        var pool = commonPool;
        if (pool.Count == 0)
        {
            pool = await _db.FoodDefinitions
                .Where(f => f.IsEnabled)
                .ToListAsync();
        }

        if (pool.Count == 0)
            throw new InvalidOperationException("Food pool is empty. Seed foods.json first.");

        // 3) Random pick (uniform within selected pool)
        var drawn = pool[Random.Shared.Next(pool.Count)];

        // 4) Inventory upsert
        var itemId = $"food:{drawn.FoodId}";
        var inv = _dataService.GetInventory();
        var before = inv.TryGetValue(itemId, out var c) ? c : 0;

        _dataService.AddInventoryItem(itemId, 1);

        return new SkinDrawResultDto(
            Drop: new SkinDropDto(
                DropType: "food",
                SubType: "",
                ItemId: drawn.FoodId,
                Name: drawn.Name,
                ImageKey: drawn.ImageKey,
                IsNew: before == 0
            ),
            NewCredits: newCredits
        );
    }
}

public async Task<SkinDraw10ResultDto> DrawTenAsync(string userId, int cost)
{
    if (cost <= 0)
        throw new InvalidOperationException("cost must be a positive integer.");

    // 1) Deduct credits ONCE (10 draws)
    var totalCost = checked(cost * 10);
    var ok = _dataService.TryConsumeCredits(totalCost, out var newCredits);
    if (!ok)
        throw new InvalidOperationException("insufficient credits");

    // 2) Prepare skin pools
    var buildingPool = _skinCatalog.GetBuildingSkins();
    var backgroundPool = _skinCatalog.GetBackgroundSkins();

    // 3) Load food pool for fallback (Common-only)
    var commonFoods = await _db.FoodDefinitions
        .Where(f => f.IsEnabled && f.Rarity != null && f.Rarity.ToLower() == "common")
        .ToListAsync();

    if (commonFoods.Count == 0)
    {
        // safe fallback: any enabled food if no common exists
        commonFoods = await _db.FoodDefinitions
            .Where(f => f.IsEnabled)
            .ToListAsync();
    }

    if (commonFoods.Count == 0)
        throw new InvalidOperationException("Food pool is empty. Seed foods.json first.");

    // 4) Plan 10 drops first
    var planned = new List<(string DropType, string SubType, string Id, string Name, string? ImageKey)>(10);

    for (var i = 0; i < 10; i++)
    {
        var roll = Random.Shared.NextDouble();

        if (roll < 0.10 && buildingPool.Count > 0)
        {
            var s = buildingPool[Random.Shared.Next(buildingPool.Count)];
            planned.Add(("skin", "building", s.ItemId, s.DisplayName, null));
        }
        else if (roll < 0.20 && backgroundPool.Count > 0)
        {
            var s = backgroundPool[Random.Shared.Next(backgroundPool.Count)];
            planned.Add(("skin", "background", s.ItemId, s.DisplayName, null));
        }
        else
        {
            var f = commonFoods[Random.Shared.Next(commonFoods.Count)];
            planned.Add(("food", "", f.FoodId, f.Name, f.ImageKey));
        }
    }

    // 5) Guarantee: at least 1 skin
    var hasSkin = planned.Any(x => x.DropType == "skin");
    var guaranteedSkinApplied = false;

    if (!hasSkin && (buildingPool.Count + backgroundPool.Count) > 0)
    {
        // Force last slot to a skin (prefer 50/50, but respect empty pools)
        bool chooseBuilding;
        if (buildingPool.Count == 0) chooseBuilding = false;
        else if (backgroundPool.Count == 0) chooseBuilding = true;
        else chooseBuilding = Random.Shared.Next(2) == 0;

        if (chooseBuilding)
        {
            var s = buildingPool[Random.Shared.Next(buildingPool.Count)];
            planned[9] = ("skin", "building", s.ItemId, s.DisplayName, null);
        }
        else
        {
            var s = backgroundPool[Random.Shared.Next(backgroundPool.Count)];
            planned[9] = ("skin", "background", s.ItemId, s.DisplayName, null);
        }

        guaranteedSkinApplied = true;
    }

    // 6) Apply planned drops sequentially and build response list
    var drops = new List<SkinDropDto>(10);
    var invSnapshot = _dataService.GetInventory();

    foreach (var p in planned)
    {
        if (p.DropType == "skin")
        {
            var acquired = _dataService.TryAcquireCollectionItem(p.Id, out var alreadyOwned, out _);
            if (!acquired)
                throw new InvalidOperationException("failed to acquire skin");

            drops.Add(new SkinDropDto(
                DropType: "skin",
                SubType: p.SubType,
                ItemId: p.Id,
                Name: p.Name,
                ImageKey: null,
                IsNew: !alreadyOwned
            ));
        }
        else
        {
            var itemId = $"food:{p.Id}";
            var before = invSnapshot.TryGetValue(itemId, out var c) ? c : 0;

            _dataService.AddInventoryItem(itemId, 1);
            invSnapshot[itemId] = before + 1;

            drops.Add(new SkinDropDto(
                DropType: "food",
                SubType: "",
                ItemId: p.Id,
                Name: p.Name,
                ImageKey: p.ImageKey,
                IsNew: before == 0
            ));
        }
    }

    return new SkinDraw10ResultDto(
        Drops: drops,
        NewCredits: newCredits,
        GuaranteedSkinApplied: guaranteedSkinApplied
    );
}