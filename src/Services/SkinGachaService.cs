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
// Purpose: Core logic for the Skin Pool gacha.
// Drop Rules:
//   - Common: 70%
//   - Rare:   25%
//   - Epic:    5%
// Special Rule:
//   - Epic tier is reserved for minigame skins.
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
    Task<SkinDrawResultDto> DrawOneAsync(string userId, int cost, string pool);
    Task<SkinDraw10ResultDto> DrawTenAsync(string userId, int cost, string pool);
}

public class SkinGachaService : ISkinGachaService
{
    private readonly AppDbContext _db;
    private readonly LocalDataService _dataService;
    private readonly SkinCatalogService _skinCatalog;
    private readonly AchievementService _achievementService;

    private static readonly (string Key, int Weight)[] RarityWeights =
    {
        ("common", 70),
        ("rare", 25),
        ("epic", 5),
    };

    public SkinGachaService(AppDbContext db, LocalDataService dataService, SkinCatalogService skinCatalog, AchievementService achievementService)
    {
        _db = db;
        _dataService = dataService;
        _skinCatalog = skinCatalog;
        _achievementService = achievementService;
    }

    public async Task<SkinDrawResultDto> DrawOneAsync(string userId, int cost, string pool)
    {
        if (cost <= 0)
            throw new InvalidOperationException("cost must be a positive integer.");

        var ok = _dataService.TryConsumeCredits(cost, out var newCredits);
        if (!ok)
            throw new InvalidOperationException("insufficient credits");

        var foods = await _db.FoodDefinitions
            .Where(f => f.IsEnabled)
            .ToListAsync();

        var epicSkins = GetEpicSkinsForPool(pool);
        var drop = DrawPlannedDrop(foods, epicSkins);
        var result = ApplyPlannedDrop(drop, newCredits);
        _achievementService.IncrementCounter("gacha_draws_total", 1);
        return result;
    }

    private SkinDrawResultDto DrawSkin(CollectionItemDefinition skin, int newCredits)
    {
        var ok = _dataService.TryAcquireCollectionItem(skin.ItemId, out var alreadyOwned, out _);
        if (!ok)
            throw new InvalidOperationException("skin item not found in catalog");

        return new SkinDrawResultDto(
            Drop: new SkinDropDto(
                DropType: "skin",
                SubType: skin.Category ?? "skin",
                ItemId: skin.ItemId,
                Name: skin.DisplayName,
                Rarity: NormalizeRarityLabel(skin.Rarity),
                ImageKey: null,
                IsNew: !alreadyOwned
            ),
            NewCredits: newCredits
        );
    }

    private static string NormalizeRarityKey(string? rarity)
    {
        if (string.IsNullOrWhiteSpace(rarity)) return "common";
        return rarity.Trim().ToLowerInvariant();
    }

    private static string NormalizeRarityLabel(string? rarity)
    {
        var key = NormalizeRarityKey(rarity);
        if (key == "epic") return "Epic";
        if (key == "rare") return "Rare";
        return "Common";
    }

    private static bool IsEpic(CollectionItemDefinition skin)
        => NormalizeRarityKey(skin.Rarity) == "epic";

    private static string NormalizePoolKey(string? pool)
    {
        var value = pool?.Trim().ToLowerInvariant();
        if (value == "snake") return "snake";
        if (value == "dicebuild") return "dicebuild";
        return "tetris";
    }

    private static string NormalizeFoodRarity(string? rarity)
    {
        var value = rarity?.Trim().ToLowerInvariant();
        return value switch
        {
            "epic" or "史诗" => "epic",
            "rare" or "稀有" => "rare",
            _ => "common"
        };
    }

    private List<CollectionItemDefinition> GetEpicSkinsForPool(string pool)
    {
        var poolKey = NormalizePoolKey(pool);
        return _skinCatalog.GetEpicSkins()
            .Where(x => string.Equals(x.Game, poolKey, StringComparison.OrdinalIgnoreCase))
            .ToList();
    }

    private PlannedSkinDrop DrawPlannedDrop(List<FoodDefinition> foods, List<CollectionItemDefinition>? epicSkins)
    {
        var hasEpicSkin = epicSkins is { Count: > 0 };
        var rarity = RollRarity(hasEpicSkin);
        if (rarity == "epic" && hasEpicSkin)
        {
            var pickedSkin = epicSkins![Random.Shared.Next(epicSkins.Count)];
            return PlannedSkinDrop.FromSkin(pickedSkin);
        }

        var food = PickFoodByRarity(foods, rarity);
        if (food is null)
            throw new InvalidOperationException("Food pool is empty. Seed foods.json first.");

        return PlannedSkinDrop.FromFood(food);
    }

    private static string RollRarity(bool hasEpicSkin)
    {
        var total = hasEpicSkin ? RarityWeights.Sum(x => x.Weight) : RarityWeights.Where(x => x.Key != "epic").Sum(x => x.Weight);
        var roll = Random.Shared.Next(1, total + 1);
        var acc = 0;

        foreach (var (key, weight) in RarityWeights)
        {
            if (key == "epic" && !hasEpicSkin) continue;
            acc += weight;
            if (roll <= acc) return key;
        }

        return "common";
    }

    private static FoodDefinition? PickFoodByRarity(List<FoodDefinition> foods, string rarity)
    {
        var target = foods.Where(f => NormalizeFoodRarity(f.Rarity) == rarity).ToList();
        if (target.Count == 0 && rarity != "common")
        {
            target = foods.Where(f => NormalizeFoodRarity(f.Rarity) == "common").ToList();
        }

        if (target.Count == 0)
        {
            target = foods;
        }

        if (target.Count == 0) return null;
        return target[Random.Shared.Next(target.Count)];
    }

    private SkinDrawResultDto ApplyPlannedDrop(PlannedSkinDrop drop, int newCredits)
    {
        if (drop.DropType == "skin" && drop.Skin is not null)
        {
            return DrawSkin(drop.Skin, newCredits);
        }

        if (drop.Food is null)
            throw new InvalidOperationException("Invalid planned drop.");

        var drawn = drop.Food;
        var itemId = drawn.FoodId;
        var inv = _dataService.GetInventory();
        var before = inv.TryGetValue(itemId, out var c) ? c : 0;

        _dataService.AddInventoryItem(itemId, 1);

        return new SkinDrawResultDto(
            Drop: new SkinDropDto(
                DropType: "food",
                SubType: "food",
                ItemId: drawn.FoodId,
                Name: drawn.Name,
                Rarity: NormalizeRarityLabel(drawn.Rarity),
                ImageKey: drawn.ImageKey,
                IsNew: before == 0
            ),
            NewCredits: newCredits
        );
    }

    private static CollectionItemDefinition PickByRarityWeighted(List<CollectionItemDefinition> pool)
    {
        var groups = pool
            .GroupBy(x => NormalizeRarityKey(x.Rarity), StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.ToList(), StringComparer.OrdinalIgnoreCase);

        var available = RarityWeights
            .Where(w => groups.TryGetValue(w.Key, out var list) && list.Count > 0)
            .ToList();

        if (available.Count == 0)
            return pool[Random.Shared.Next(pool.Count)];

        var total = available.Sum(x => x.Weight);
        var roll = Random.Shared.Next(1, total + 1);
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

        return pool[Random.Shared.Next(pool.Count)];
    }

    public async Task<SkinDraw10ResultDto> DrawTenAsync(string userId, int cost, string pool)
    {
        if (cost <= 0)
            throw new InvalidOperationException("cost must be a positive integer.");

        var foods = await _db.FoodDefinitions
            .Where(f => f.IsEnabled)
            .ToListAsync();

        if (foods.Count == 0)
            throw new InvalidOperationException("Food pool is empty. Seed foods.json first.");

        var epicSkins = GetEpicSkinsForPool(pool);

        var totalCost = checked(cost * 10);
        var ok = _dataService.TryConsumeCredits(totalCost, out var newCredits);
        if (!ok)
            throw new InvalidOperationException("insufficient credits");

        var planned = new List<PlannedSkinDrop>(10);
        for (var i = 0; i < 10; i++)
        {
            planned.Add(DrawPlannedDrop(foods, epicSkins));
        }

        var guaranteedSkinApplied = false;

        if (epicSkins.Count > 0 && !planned.Any(x => x.DropType == "skin"))
        {
            var guaranteedSkin = epicSkins[Random.Shared.Next(epicSkins.Count)];
            planned[9] = PlannedSkinDrop.FromSkin(guaranteedSkin);
            guaranteedSkinApplied = true;
        }

        var drops = new List<SkinDropDto>(10);
        foreach (var plannedDrop in planned)
        {
            if (plannedDrop.DropType == "skin" && plannedDrop.Skin is not null)
            {
                var skin = plannedDrop.Skin;
                var acquired = _dataService.TryAcquireCollectionItem(skin.ItemId, out var alreadyOwned, out _);
                if (!acquired)
                    throw new InvalidOperationException("failed to acquire skin");

                drops.Add(new SkinDropDto(
                    DropType: "skin",
                    SubType: skin.Category ?? "skin",
                    ItemId: skin.ItemId,
                    Name: skin.DisplayName,
                    Rarity: NormalizeRarityLabel(skin.Rarity),
                    ImageKey: null,
                    IsNew: !alreadyOwned
                ));
                continue;
            }

            if (plannedDrop.Food is null)
                throw new InvalidOperationException("invalid planned drop");

            var food = plannedDrop.Food;
            var itemId = food.FoodId;
            var invSnapshot = _dataService.GetInventory();
            var before = invSnapshot.TryGetValue(itemId, out var c) ? c : 0;

            _dataService.AddInventoryItem(itemId, 1);

            drops.Add(new SkinDropDto(
                DropType: "food",
                SubType: "food",
                ItemId: food.FoodId,
                Name: food.Name,
                Rarity: NormalizeRarityLabel(food.Rarity),
                ImageKey: food.ImageKey,
                IsNew: before == 0
            ));
        }

        _achievementService.IncrementCounter("gacha_draws_total", 10);

        return new SkinDraw10ResultDto(
            Drops: drops,
            NewCredits: newCredits,
            GuaranteedSkinApplied: guaranteedSkinApplied
        );
    }

    private sealed record PlannedSkinDrop(string DropType, CollectionItemDefinition? Skin, FoodDefinition? Food)
    {
        public static PlannedSkinDrop FromSkin(CollectionItemDefinition skin) => new("skin", skin, null);
        public static PlannedSkinDrop FromFood(FoodDefinition food) => new("food", null, food);
    }
}
