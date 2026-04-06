// 2026/04/05 edited by zhechengxu
// Changes:
//  - Persist focus defaults (allowed apps/websites + grace seconds) to local JSON storage.

// 2026/03/16 edited by Zikai Lu
// 新增内容：
//   - 增加 SessionHistory 可读时间明细与按日期汇总查询方法。
//   - 增加本地档案导出/导入方法（user_profile/session_history/whitelist_presets）。
// 新增的作用：
//   - 让前端可直接使用可读时间和每日统计数据。
//   - 支持用户导出和导入本地配置与档案。
// =============================================================

// 2026/03/09 edited by Zikai Lu
// 新增内容：
//   - 增加 Collection 相关接口：GetCollection() / TryAcquireCollectionItem()。
//   - 引入预设收藏品目录，返回完整收藏列表及 0/1 拥有状态。
// 新增的作用：
//   - 为皮肤等收藏品提供固定目录查询能力。
//   - 支持“获取指定收藏品”：未拥有时置为 1，已拥有时返回已拥有状态。
// =============================================================

// 2026/01/27 edited by Zikai Lu
// 新增内容：
//   - 增加 Inventory 相关接口：GetInventory() / AddInventoryItem() / TryConsumeInventoryItem()。
// 新增的作用：
//   - 为背包系统提供本地物品存取能力，防止数量为负数。
// =============================================================

// 2026/01/21 edited by Zikai Lu
// 新增内容：
//   - 添加宠物成长值（PetGrowth）读写逻辑：GetPetGrowth() / AddPetGrowth() / ConsumePetGrowth()。
//   - 增加 PetGrowth 列表初始化与索引扩容的辅助方法。
// 新增的作用：
//   - 为宠物系统提供按编号管理的成长值存取能力。
//   - 保证成长值不低于 0，并兼容未来使用 -1 表示未拥有的场景。
// =============================================================

// 2026/01/16 edited by Zikai Lu
// 新增内容：
//   - 在 RecordSession(...) 中根据本次会话时长按 Ceil(秒 / 60) 累积点数（Credits）。
//   - 新增 GetCredits() / AddCredits() / TryConsumeCredits() 三个点数接口供 Controller 使用。
// 新增的作用：
//   - 为抽奖系统、商店系统等提供统一的点数余额数据来源。
//   - 将专注会话的有效时长转化为可消费的虚拟货币，增强激励机制。
// =============================================================

// 2025/11/19 edited by 京华昼梦
// 新增内容：
//   - 添加专注会话历史读写功能：GetSessionHistory() / AddSessionHistory()。
//   - 使用 session_history.json 持久化每次会话的分钟数、备注与结果。
// =============================================================
// 新增的作用：
//   - 为统计页面（stats.js）提供真正的后端数据来源。
//   - 支持按时间顺序累计每次会话的完整记录，而非只记录汇总 profile。
// =============================================================
// 新增的结构变化：
//   - LocalDataService 增加 SessionHistory 相关逻辑，与现有 UserProfile/Whitelist 一致。
//   - 所有写入均使用相同的锁机制与 JSON 序列化配置，确保线程安全与格式一致。
// =============================================================

// 2026/03/31 edited by Zikai Lu
// 新增内容：
//   - 增加 SessionHistory 内存缓存，降低高频追加时的重复读盘开销。
//   - 增加档案备份轮转（按文件类型保留最近备份），控制备份目录体积。
// 新增的作用：
//   - 在“保留全部历史”的前提下，优化本地文件存储性能与长期稳定性。
// =============================================================

//2025/11/17 created by Zikai
// =============================================================
// 文件：LocalDataService.cs
// 作用：统一管理本地 JSON 数据的读写。
// 结构：
//   - UserProfile 相关：GetUserProfile(), RecordSession()，以及 Credits（点数）相关接口
//   - SessionHistory 相关：GetSessionHistory(), AddSessionHistory()
//   - 白名单预设相关：GetWhitelistPresets(), SaveWhitelistPreset(), DeleteWhitelistPreset()
//   - 内部通过 LocalStoragePaths 管理路径，通过 JsonSerializer 持久化。
// =============================================================

using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using CapstoneBackend.Models;
using CapstoneBackend.Utils;

namespace CapstoneBackend.Services;

public class LocalDataService
{
    private readonly object _fileLock = new();
    private List<SessionHistoryItem>? _sessionHistoryCache;
    private const int ArchiveBackupKeepCountPerKind = 20;

    // 统一 JSON 序列化配置
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = true
    };

    public LocalDataService()
    {
        LocalStoragePaths.EnsureBaseDirectory();
    }

    #region UserProfile 相关

    public UserProfile GetUserProfile()
    {
        lock (_fileLock)
        {
            var path = LocalStoragePaths.UserProfileFilePath;

            if (!File.Exists(path))
            {
                var profile = new UserProfile();
                SaveUserProfile(profile);
                return profile;
            }

            try
            {
                var json = File.ReadAllText(path);
                var profile = JsonSerializer.Deserialize<UserProfile>(json, JsonOptions);
                return profile ?? new UserProfile();
            }
            catch
            {
                return new UserProfile();
            }
        }
    }

    private void SaveUserProfile(UserProfile profile)
    {
        lock (_fileLock)
        {
            var path = LocalStoragePaths.UserProfileFilePath;
            var json = JsonSerializer.Serialize(profile, JsonOptions);
            File.WriteAllText(path, json);
        }
    }
     public void SaveUserProfilePublic(UserProfile profile)
    {
        SaveUserProfile(profile);
    }

    private static bool EnsurePetGrowthList(UserProfile profile, int petId)
    {
        var changed = false;

        if (profile.PetGrowth == null)
        {
            profile.PetGrowth = new List<int>();
            changed = true;
        }

        if (petId >= 0 && profile.PetGrowth.Count <= petId)
        {
            var missing = petId + 1 - profile.PetGrowth.Count;
            for (var i = 0; i < missing; i++)
            {
                profile.PetGrowth.Add(0);
            }

            changed = true;
        }

        return changed;
    }

    private static int NormalizePetGrowthValue(int value)
    {
        return value < 0 ? 0 : value;
    }

    // 作用：根据一次专注会话结果更新用户 profile 里的统计信息。
    //       额外统计 Aborted -> CanceledSessions；仅在 Success 时按 ceil(专注分钟数) 奖励点数（Credits）。
    // =============================================================
    public void RecordSession(SessionOutcome outcome, int focusSeconds)
    {
        lock (_fileLock)
        {
            var profile = GetUserProfile();

            // 保护一下：不允许负数时长
            var safeSeconds = Math.Max(0, focusSeconds);

            profile.TotalSessions += 1;
            profile.TotalFocusSeconds += safeSeconds;

            switch (outcome)
            {
                case SessionOutcome.Success:
                    profile.SuccessfulSessions += 1;
                    break;

                case SessionOutcome.Failed:
                    profile.FailedSessions += 1;
                    break;

                case SessionOutcome.Aborted:
                    // 用户手动取消：增加取消会话计数
                    profile.CanceledSessions += 1;
                    break;

                default:
                    break;
            }

            // Credits 只在“成功完成”的会话中发放。
            // 使用 ceil 原则：例如 5.1 分钟 -> 6 点；用于避免计时抖动导致少发。
            if (outcome == SessionOutcome.Success)
            {
                var minutes = (int)Math.Ceiling(safeSeconds / 60.0);
                if (minutes > 0)
                {
                    profile.Credits += minutes;

                    // 成就系统：累计获得点数（历史总获得 Credits，不受花费影响）
                    profile.AchievementCounters ??= new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
                    profile.AchievementCounters.TryGetValue("credits_earned_total", out var earned);
                    profile.AchievementCounters["credits_earned_total"] = checked(earned + minutes);
                }
            }
            SaveUserProfile(profile);
        }
    }

    /// <summary>
    /// 获取当前点数余额（Credits）。
    /// </summary>
    public int GetCredits()
    {
        lock (_fileLock)
        {
            var profile = GetUserProfile();
            return profile.Credits;
        }
    }

    /// <summary>
    /// 增加指定数量的点数。
    /// amount 必须为正数；返回增加后的最新余额。
    /// </summary>
    public int AddCredits(int amount)
    {
        if (amount <= 0)
        {
            // 非法值直接返回当前余额，不修改。
            return GetCredits();
        }

        lock (_fileLock)
        {
            var profile = GetUserProfile();
            checked
            {
                profile.Credits += amount;
            }

            SaveUserProfile(profile);
            return profile.Credits;
        }
    }

    /// <summary>
    /// 尝试消耗指定数量的点数。
    /// - 当余额不足或 amount 非正数时，返回 false，余额不变。
    /// - 成功时返回 true，并通过 newBalance 输出新的余额。
    /// </summary>
    public bool TryConsumeCredits(int amount, out int newBalance)
    {
        lock (_fileLock)
        {
            var profile = GetUserProfile();

            if (amount <= 0 || profile.Credits < amount)
            {
                newBalance = profile.Credits;
                return false;
            }

            profile.Credits -= amount;
            SaveUserProfile(profile);

            newBalance = profile.Credits;
            return true;
        }
    }

    /// <summary>
    /// 获取背包内所有物品及其数量。
    /// </summary>
    public Dictionary<string, int> GetInventory()
    {
        lock (_fileLock)
        {
            var profile = GetUserProfile();

            if (profile.Inventory == null)
            {
                profile.Inventory = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
                SaveUserProfile(profile);
            }

            var changed = NormalizeInventoryKeys(profile.Inventory, out var normalized);
            if (changed)
            {
                profile.Inventory = normalized;
                SaveUserProfile(profile);
            }

            return new Dictionary<string, int>(profile.Inventory, StringComparer.OrdinalIgnoreCase);
        }
    }

    /// <summary>
    /// 增加指定物品的数量。
    /// amount 必须为正数；返回增加后的数量。
    /// </summary>
    public int AddInventoryItem(string itemId, int amount)
    {
        var normalizedItemId = NormalizeInventoryItemId(itemId);
        if (string.IsNullOrWhiteSpace(normalizedItemId) || amount <= 0)
        {
            return 0;
        }

        lock (_fileLock)
        {
            var profile = GetUserProfile();
            if (profile.Inventory == null)
            {
                profile.Inventory = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
            }

            var changed = NormalizeInventoryKeys(profile.Inventory, out var normalized);
            if (changed)
            {
                profile.Inventory = normalized;
            }

            profile.Inventory.TryGetValue(normalizedItemId, out var current);
            if (current < 0)
            {
                current = 0;
            }

            checked
            {
                current += amount;
            }

            profile.Inventory[normalizedItemId] = current;
            SaveUserProfile(profile);
            return current;
        }
    }

    /// <summary>
    /// 尝试消耗指定物品的数量。
    /// - 当库存不足或 amount 非正数时，返回 false，库存不变。
    /// - 成功时返回 true，并通过 newCount 输出新的数量。
    /// </summary>
    public bool TryConsumeInventoryItem(string itemId, int amount, out int newCount)
    {
        var normalizedItemId = NormalizeInventoryItemId(itemId);
        lock (_fileLock)
        {
            var profile = GetUserProfile();
            if (profile.Inventory == null)
            {
                profile.Inventory = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
            }

            var changed = NormalizeInventoryKeys(profile.Inventory, out var normalized);
            if (changed)
            {
                profile.Inventory = normalized;
            }

            profile.Inventory.TryGetValue(normalizedItemId, out var current);
            if (current < 0)
            {
                current = 0;
            }

            if (string.IsNullOrWhiteSpace(normalizedItemId) || amount <= 0 || current < amount)
            {
                newCount = current;
                return false;
            }

            profile.Inventory[normalizedItemId] = current - amount;
            SaveUserProfile(profile);

            newCount = profile.Inventory[normalizedItemId];
            return true;
        }
    }

    private static string NormalizeInventoryItemId(string? itemId)
    {
        var raw = itemId?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(raw)) return string.Empty;

        const string foodPrefix = "food:";
        if (raw.StartsWith(foodPrefix, StringComparison.OrdinalIgnoreCase) && raw.Length > foodPrefix.Length)
        {
            return raw.Substring(foodPrefix.Length).Trim();
        }

        return raw;
    }

    private static bool NormalizeInventoryKeys(
        Dictionary<string, int> source,
        out Dictionary<string, int> normalized)
    {
        normalized = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        var changed = false;

        foreach (var kv in source)
        {
            var key = NormalizeInventoryItemId(kv.Key);
            if (string.IsNullOrWhiteSpace(key))
            {
                changed = true;
                continue;
            }

            var count = Math.Max(0, kv.Value);
            if (!string.Equals(key, kv.Key, StringComparison.OrdinalIgnoreCase) || count != kv.Value)
            {
                changed = true;
            }

            if (normalized.TryGetValue(key, out var existing))
            {
                normalized[key] = checked(existing + count);
                changed = true;
            }
            else
            {
                normalized[key] = count;
            }
        }

        if (!changed && normalized.Count != source.Count)
        {
            changed = true;
        }

        return changed;
    }

    /// <summary>
    /// 查询 Collection 完整列表（预设目录 + 拥有状态 0/1）。
    /// </summary>
    public List<CollectionItemStatus> GetCollection()
    {
        lock (_fileLock)
        {
            var profile = GetUserProfile();
            var changed = NormalizeCollectionSkinState(profile, out _);

            var result = new List<CollectionItemStatus>();
            foreach (var def in CollectionCatalog.PresetItems)
            {
                profile.Collection.TryGetValue(def.ItemId, out var state);
                var owned = state > 0 ? 1 : 0;
                var game = NormalizeGameKey(def.Game);
                var enabled = owned == 1
                    && !string.IsNullOrWhiteSpace(game)
                    && profile.ActiveSkinsByGame.TryGetValue(game, out var activeItemId)
                    && string.Equals(activeItemId, def.ItemId, StringComparison.OrdinalIgnoreCase);

                result.Add(new CollectionItemStatus
                {
                    ItemId = def.ItemId,
                    DisplayName = def.DisplayName,
                    Category = def.Category,
                    Rarity = def.Rarity,
                    Game = def.Game,
                    State = owned,
                    IsEnabled = enabled,
                });
            }

            if (changed)
            {
                SaveUserProfile(profile);
            }

            return result;
        }
    }

    /// <summary>
    /// 获取指定收藏品：
    /// - 若状态为 0，更新为 1；
    /// - 若状态为 1，返回已拥有；
    /// - 若 itemId 不在预设目录中，返回 false。
    /// </summary>
    public bool TryAcquireCollectionItem(string itemId, out bool alreadyOwned, out int state)
{
    lock (_fileLock)
    {
        alreadyOwned = false;
        state = 0;

        if (string.IsNullOrWhiteSpace(itemId))
        {
            return false;
        }

        // 说明：
        // - 不再依赖硬编码的 CollectionCatalog.PresetItems 校验
        // - SkinGachaService 从 skins.json 抽取，保证 itemId 合法
        // - CollectionController 的 acquire 入口也可继续使用（前端传入 id）

        var profile = GetUserProfile();
        if (profile.Collection == null)
        {
            profile.Collection = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        }

        profile.Collection.TryGetValue(itemId, out var current);
        current = current > 0 ? 1 : 0;

        if (current == 1)
        {
            alreadyOwned = true;
            state = 1;
            return true;
        }

        profile.Collection[itemId] = 1;
        SaveUserProfile(profile);

        alreadyOwned = false;
        state = 1;
        return true;
    }
}

    public bool TrySetCollectionSkinEnabled(string itemId, bool enable, out string game, out bool enabled, out string message)
    {
        lock (_fileLock)
        {
            game = string.Empty;
            enabled = false;
            message = "invalid request";

            if (string.IsNullOrWhiteSpace(itemId))
            {
                message = "itemId must be non-empty.";
                return false;
            }

            var profile = GetUserProfile();
            _ = NormalizeCollectionSkinState(profile, out var defMap);

            var normalizedItemId = itemId.Trim();
            if (!defMap.TryGetValue(normalizedItemId, out var def))
            {
                message = "collection item not found in preset catalog.";
                return false;
            }

            var gameKey = NormalizeGameKey(def.Game);
            if (string.IsNullOrWhiteSpace(gameKey))
            {
                message = "item is not bound to a minigame.";
                return false;
            }

            game = gameKey;
            profile.Collection.TryGetValue(def.ItemId, out var state);
            var owned = state > 0 ? 1 : 0;

            if (enable)
            {
                if (owned == 0)
                {
                    message = "item not owned.";
                    return false;
                }

                profile.ActiveSkinsByGame[gameKey] = def.ItemId;
                SaveUserProfile(profile);

                enabled = true;
                message = "enabled";
                return true;
            }

            if (profile.ActiveSkinsByGame.TryGetValue(gameKey, out var activeItemId)
                && string.Equals(activeItemId, def.ItemId, StringComparison.OrdinalIgnoreCase))
            {
                profile.ActiveSkinsByGame.Remove(gameKey);
                SaveUserProfile(profile);
            }

            enabled = false;
            message = "disabled";
            return true;
        }
    }

    private static string NormalizeGameKey(string? game)
        => string.IsNullOrWhiteSpace(game) ? string.Empty : game.Trim().ToLowerInvariant();

    private static bool NormalizeCollectionSkinState(UserProfile profile, out Dictionary<string, CollectionItemDefinition> defMap)
    {
        var changed = false;

        if (profile.Collection == null)
        {
            profile.Collection = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
            changed = true;
        }

        if (profile.ActiveSkinsByGame == null)
        {
            profile.ActiveSkinsByGame = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            changed = true;
        }

        defMap = CollectionCatalog.PresetItems
            .Where(x => !string.IsNullOrWhiteSpace(x.ItemId))
            .GroupBy(x => x.ItemId.Trim(), StringComparer.OrdinalIgnoreCase)
            .Select(g => g.First())
            .ToDictionary(x => x.ItemId.Trim(), x => x, StringComparer.OrdinalIgnoreCase);

        foreach (var key in profile.Collection.Keys.ToList())
        {
            var normalized = profile.Collection[key] > 0 ? 1 : 0;
            if (profile.Collection[key] != normalized)
            {
                profile.Collection[key] = normalized;
                changed = true;
            }
        }

        foreach (var kv in profile.ActiveSkinsByGame.ToList())
        {
            var gameKey = NormalizeGameKey(kv.Key);
            var itemId = kv.Value?.Trim() ?? string.Empty;

            if (string.IsNullOrWhiteSpace(gameKey) || string.IsNullOrWhiteSpace(itemId))
            {
                profile.ActiveSkinsByGame.Remove(kv.Key);
                changed = true;
                continue;
            }

            if (!defMap.TryGetValue(itemId, out var def))
            {
                profile.ActiveSkinsByGame.Remove(kv.Key);
                changed = true;
                continue;
            }

            var defGame = NormalizeGameKey(def.Game);
            if (string.IsNullOrWhiteSpace(defGame) || !string.Equals(defGame, gameKey, StringComparison.OrdinalIgnoreCase))
            {
                profile.ActiveSkinsByGame.Remove(kv.Key);
                changed = true;
                continue;
            }

            profile.Collection.TryGetValue(itemId, out var ownedState);
            if (ownedState <= 0)
            {
                profile.ActiveSkinsByGame.Remove(kv.Key);
                changed = true;
                continue;
            }

            if (!string.Equals(kv.Key, gameKey, StringComparison.Ordinal))
            {
                profile.ActiveSkinsByGame.Remove(kv.Key);
                profile.ActiveSkinsByGame[gameKey] = itemId;
                changed = true;
            }
        }

        return changed;
    }

    private static bool EnsurePetState(UserProfile profile)
    {
        var changed = false;

        if (profile.UnlockedPetIds == null || profile.UnlockedPetIds.Count == 0)
        {
            profile.UnlockedPetIds = new List<int> { 3 };
            changed = true;
        }

        profile.UnlockedPetIds = profile.UnlockedPetIds
            .Where(id => id >= 1 && id <= 3)
            .Distinct()
            .OrderByDescending(id => id)
            .ToList();

        if (profile.UnlockedPetIds.Count == 0)
        {
            profile.UnlockedPetIds.Add(3);
            changed = true;
        }

        if (!profile.UnlockedPetIds.Contains(profile.ActivePetId))
        {
            profile.ActivePetId = profile.UnlockedPetIds[0];
            changed = true;
        }

        if (!profile.UnlockedPetIds.Contains(profile.FeedingPetId))
        {
            profile.FeedingPetId = profile.ActivePetId;
            changed = true;
        }

        return changed;
    }

    public PetStateResponse GetPetState()
    {
        lock (_fileLock)
        {
            var profile = GetUserProfile();
            var changed = EnsurePetState(profile);

            if (changed)
            {
                SaveUserProfile(profile);
            }

            return new PetStateResponse
            {
                ActivePetId = profile.ActivePetId,
                FeedingPetId = profile.FeedingPetId,
                UnlockedPetIds = new List<int>(profile.UnlockedPetIds)
            };
        }
    }

    public bool TrySetActivePet(int petId, out PetStateResponse state, out string error)
    {
        lock (_fileLock)
        {
            var profile = GetUserProfile();
            EnsurePetState(profile);

            if (petId < 1 || petId > 3)
            {
                state = BuildPetState(profile);
                error = "invalid pet id.";
                return false;
            }

            if (!profile.UnlockedPetIds.Contains(petId))
            {
                state = BuildPetState(profile);
                error = "pet is not unlocked.";
                return false;
            }

            profile.ActivePetId = petId;
            profile.FeedingPetId = petId;
            SaveUserProfile(profile);

            state = BuildPetState(profile);
            error = string.Empty;
            return true;
        }
    }

    public bool TryUnlockPet(int petId, out PetStateResponse state, out string error)
    {
        lock (_fileLock)
        {
            var profile = GetUserProfile();
            EnsurePetState(profile);

            if (petId < 1 || petId > 3)
            {
                state = BuildPetState(profile);
                error = "invalid pet id.";
                return false;
            }

            if (!profile.UnlockedPetIds.Contains(petId))
            {
                profile.UnlockedPetIds.Add(petId);
                profile.UnlockedPetIds = profile.UnlockedPetIds
                    .Distinct()
                    .OrderByDescending(id => id)
                    .ToList();
            }

            // 规则：购买宠物蛋（包含重复购买）都会将该宠物成长值重置为 0。
            EnsurePetGrowthList(profile, petId);
            profile.PetGrowth[petId] = 0;

            SaveUserProfile(profile);
            state = BuildPetState(profile);
            error = string.Empty;
            return true;
        }
    }

    private static PetStateResponse BuildPetState(UserProfile profile)
    {
        return new PetStateResponse
        {
            ActivePetId = profile.ActivePetId,
            FeedingPetId = profile.FeedingPetId,
            UnlockedPetIds = new List<int>(profile.UnlockedPetIds)
        };
    }

    /// <summary>
    /// 获取指定宠物的成长值。
    /// petId 从 0 开始，若不存在则自动扩容为 0。
    /// </summary>
    public int GetPetGrowth(int petId)
    {
        if (petId < 0)
        {
            return 0;
        }

        lock (_fileLock)
        {
            var profile = GetUserProfile();
            var changed = EnsurePetGrowthList(profile, petId);
            var growth = profile.PetGrowth[petId];

            if (changed)
            {
                SaveUserProfile(profile);
            }

            return growth;
        }
    }

    /// <summary>
    /// 增加指定宠物的成长值。
    /// amount 必须为正数；返回增加后的成长值。
    /// </summary>
    public int AddPetGrowth(int petId, int amount)
    {
        if (petId < 0 || amount <= 0)
        {
            return GetPetGrowth(petId);
        }

        lock (_fileLock)
        {
            var profile = GetUserProfile();
            EnsurePetGrowthList(profile, petId);

            var current = NormalizePetGrowthValue(profile.PetGrowth[petId]);
            checked
            {
                current += amount;
            }

            profile.PetGrowth[petId] = current;
            SaveUserProfile(profile);
            return current;
        }
    }

    /// <summary>
    /// 减少指定宠物的成长值。
    /// amount 必须为正数；不足时减少到 0，返回新的成长值。
    /// </summary>
    public int ConsumePetGrowth(int petId, int amount)
    {
        if (petId < 0 || amount <= 0)
        {
            return GetPetGrowth(petId);
        }

        lock (_fileLock)
        {
            var profile = GetUserProfile();
            EnsurePetGrowthList(profile, petId);

            var current = NormalizePetGrowthValue(profile.PetGrowth[petId]);
            var newValue = current - amount;
            if (newValue < 0)
            {
                newValue = 0;
            }

            profile.PetGrowth[petId] = newValue;
            SaveUserProfile(profile);
            return newValue;
        }
    }

    #endregion

    #region SessionHistory 相关

    /// <summary>
    /// 读取专注会话历史列表，如果文件不存在则返回空列表。
    /// </summary>
    public List<SessionHistoryItem> GetSessionHistory()
    {
        lock (_fileLock)
        {
            if (_sessionHistoryCache is not null)
            {
                return new List<SessionHistoryItem>(_sessionHistoryCache);
            }

            var path = LocalStoragePaths.SessionHistoryFilePath;

            if (!File.Exists(path))
            {
                _sessionHistoryCache = new List<SessionHistoryItem>();
                return new List<SessionHistoryItem>();
            }

            try
            {
                var json = File.ReadAllText(path);
                var list = JsonSerializer.Deserialize<List<SessionHistoryItem>>(json, JsonOptions);
                _sessionHistoryCache = list ?? new List<SessionHistoryItem>();
                return new List<SessionHistoryItem>(_sessionHistoryCache);
            }
            catch
            {
                _sessionHistoryCache = new List<SessionHistoryItem>();
                return new List<SessionHistoryItem>();
            }
        }
    }

    /// <summary>
    /// 返回会话历史明细（包含可读时间和日期字段，不包含汇总）。
    /// </summary>
    public List<SessionHistoryRecordView> GetSessionHistoryRecords()
    {
        lock (_fileLock)
        {
            var list = GetSessionHistory();

            return list
                .OrderByDescending(x => x.Ts)
                .Select(x =>
                {
                    var localTime = DateTimeOffset.FromUnixTimeMilliseconds(x.Ts).ToLocalTime();
                    return new SessionHistoryRecordView
                    {
                        Ts = x.Ts,
                        Time = localTime.ToString("yyyy-MM-dd HH:mm:ss"),
                        Date = localTime.ToString("yyyy-MM-dd"),
                        Minutes = x.Minutes,
                        Note = x.Note,
                        Outcome = x.Outcome ?? "success"
                    };
                })
                .ToList();
        }
    }

    /// <summary>
    /// 按日期汇总会话历史（本地时区）。
    /// </summary>
    public List<SessionHistoryDailySummaryItem> GetSessionHistoryDailySummary()
    {
        lock (_fileLock)
        {
            var records = GetSessionHistoryRecords();

            return records
                .GroupBy(x => x.Date, StringComparer.Ordinal)
                .Select(g => new SessionHistoryDailySummaryItem
                {
                    Date = g.Key,
                    Sessions = g.Count(),
                    TotalMinutes = g.Sum(x => Math.Max(0, x.Minutes)),
                    Success = g.Count(x => string.Equals(x.Outcome, "success", StringComparison.OrdinalIgnoreCase)),
                    Failed = g.Count(x => string.Equals(x.Outcome, "failed", StringComparison.OrdinalIgnoreCase)),
                    Aborted = g.Count(x => string.Equals(x.Outcome, "aborted", StringComparison.OrdinalIgnoreCase))
                })
                .OrderByDescending(x => x.Date)
                .ToList();
        }
    }

    /// <summary>
    /// 追加一条专注会话历史记录到 session_history.json。
    /// </summary>
    public void AddSessionHistory(SessionHistoryItem entry)
    {
        lock (_fileLock)
        {
            var list = _sessionHistoryCache is not null
                ? new List<SessionHistoryItem>(_sessionHistoryCache)
                : GetSessionHistory();
            list.Add(entry);
            SaveSessionHistoryList(list);
        }
    }

    public LocalArchiveExportData ExportArchive()
    {
        lock (_fileLock)
        {
            return new LocalArchiveExportData
            {
                SchemaVersion = 1,
                ExportedAt = DateTimeOffset.UtcNow,
                UserProfile = GetUserProfile(),
                SessionHistory = GetSessionHistory(),
                WhitelistPresets = GetWhitelistPresets()
            };
        }
    }

    public LocalArchiveImportResult ImportArchive(LocalArchiveExportData archive)
    {
        if (archive is null)
        {
            throw new ArgumentNullException(nameof(archive));
        }

        if (archive.UserProfile is null)
        {
            throw new ArgumentException("userProfile is required.");
        }

        archive.SessionHistory ??= new List<SessionHistoryItem>();
        archive.WhitelistPresets ??= new List<WhitelistPreset>();

        lock (_fileLock)
        {
            BackupArchiveFiles();

            SaveUserProfile(archive.UserProfile);
            SaveSessionHistoryList(archive.SessionHistory);
            SaveWhitelistPresetList(archive.WhitelistPresets);

            return new LocalArchiveImportResult
            {
                SchemaVersion = archive.SchemaVersion,
                SessionHistoryCount = archive.SessionHistory.Count,
                WhitelistPresetCount = archive.WhitelistPresets.Count,
                ImportedAt = DateTimeOffset.UtcNow
            };
        }
    }

    public void ClearArchiveData()
    {
        lock (_fileLock)
        {
            BackupArchiveFiles();
            SaveUserProfile(new UserProfile());
            SaveSessionHistoryList(new List<SessionHistoryItem>());
            SaveWhitelistPresetList(new List<WhitelistPreset>());
        }
    }

    private void SaveSessionHistoryList(List<SessionHistoryItem> list)
    {
        var path = LocalStoragePaths.SessionHistoryFilePath;
        var json = JsonSerializer.Serialize(list, JsonOptions);
        File.WriteAllText(path, json);
        _sessionHistoryCache = new List<SessionHistoryItem>(list);
    }

    private void SaveWhitelistPresetList(List<WhitelistPreset> presets)
    {
        var path = LocalStoragePaths.WhitelistPresetsFilePath;
        var json = JsonSerializer.Serialize(presets, JsonOptions);
        File.WriteAllText(path, json);
    }

    private void BackupArchiveFiles()
    {
        var backupDir = Path.Combine(LocalStoragePaths.BaseDirectory, "backups");
        Directory.CreateDirectory(backupDir);

        var suffix = DateTimeOffset.UtcNow.ToString("yyyyMMddHHmmss");
        BackupIfExists(LocalStoragePaths.UserProfileFilePath, Path.Combine(backupDir, $"user_profile.{suffix}.bak.json"));
        BackupIfExists(LocalStoragePaths.SessionHistoryFilePath, Path.Combine(backupDir, $"session_history.{suffix}.bak.json"));
        BackupIfExists(LocalStoragePaths.WhitelistPresetsFilePath, Path.Combine(backupDir, $"whitelist_presets.{suffix}.bak.json"));
        BackupIfExists(LocalStoragePaths.FocusDefaultsFilePath, Path.Combine(backupDir, $"focus_defaults.{suffix}.bak.json"));

        TrimBackups(backupDir, "user_profile.*.bak.json");
        TrimBackups(backupDir, "session_history.*.bak.json");
        TrimBackups(backupDir, "whitelist_presets.*.bak.json");
        TrimBackups(backupDir, "focus_defaults.*.bak.json");
    }

    private static void BackupIfExists(string sourcePath, string targetPath)
    {
        if (File.Exists(sourcePath))
        {
            File.Copy(sourcePath, targetPath, overwrite: true);
        }
    }

    private static void TrimBackups(string backupDir, string pattern)
    {
        try
        {
            var files = new DirectoryInfo(backupDir)
                .GetFiles(pattern, SearchOption.TopDirectoryOnly)
                .OrderByDescending(f => f.LastWriteTimeUtc)
                .ToList();

            for (var i = ArchiveBackupKeepCountPerKind; i < files.Count; i++)
            {
                files[i].Delete();
            }
        }
        catch
        {
            // ignore backup trimming failures
        }
    }

    #endregion

    #region Focus 默认配置

    private static FocusDefaultsDto NormalizeFocusDefaults(FocusDefaultsDto? value)
    {
        var allowedProcesses = (value?.AllowedProcesses ?? new List<string>())
            .Select(x => (x ?? string.Empty).Trim())
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (allowedProcesses.Count == 0)
        {
            allowedProcesses.Add("chrome.exe");
        }

        var allowedWebsites = (value?.AllowedWebsites ?? new List<string>())
            .Select(x => (x ?? string.Empty).Trim())
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        var graceSeconds = value?.GraceSeconds ?? 10;
        graceSeconds = Math.Max(5, Math.Min(60, graceSeconds));

        return new FocusDefaultsDto
        {
            AllowedProcesses = allowedProcesses,
            AllowedWebsites = allowedWebsites,
            GraceSeconds = graceSeconds,
        };
    }

    public FocusDefaultsDto GetFocusDefaults()
    {
        lock (_fileLock)
        {
            var path = LocalStoragePaths.FocusDefaultsFilePath;
            if (!File.Exists(path))
            {
                var defaults = NormalizeFocusDefaults(null);
                File.WriteAllText(path, JsonSerializer.Serialize(defaults, JsonOptions));
                return defaults;
            }

            try
            {
                var json = File.ReadAllText(path);
                var parsed = JsonSerializer.Deserialize<FocusDefaultsDto>(json, JsonOptions);
                var normalized = NormalizeFocusDefaults(parsed);
                return normalized;
            }
            catch
            {
                return NormalizeFocusDefaults(null);
            }
        }
    }

    public FocusDefaultsDto SaveFocusDefaults(FocusDefaultsDto request)
    {
        lock (_fileLock)
        {
            var normalized = NormalizeFocusDefaults(request);
            var path = LocalStoragePaths.FocusDefaultsFilePath;
            var json = JsonSerializer.Serialize(normalized, JsonOptions);
            File.WriteAllText(path, json);
            return normalized;
        }
    }

    #endregion

    #region 白名单预设相关

    public List<WhitelistPreset> GetWhitelistPresets()
    {
        lock (_fileLock)
        {
            var path = LocalStoragePaths.WhitelistPresetsFilePath;

            if (!File.Exists(path))
                return new List<WhitelistPreset>();

            try
            {
                var json = File.ReadAllText(path);
                var presets = JsonSerializer.Deserialize<List<WhitelistPreset>>(json, JsonOptions);
                return presets ?? new List<WhitelistPreset>();
            }
            catch
            {
                return new List<WhitelistPreset>();
            }
        }
    }

    /// <summary>
    /// 保存（新建或更新）一个白名单预设。
    /// </summary>
    public WhitelistPreset SaveWhitelistPreset(SaveWhitelistPresetRequest request)
    {
        lock (_fileLock)
        {
            var presets = GetWhitelistPresets();

            WhitelistPreset? presetToUpdate = null;

            if (!string.IsNullOrWhiteSpace(request.Id))
            {
                presetToUpdate = presets
                    .FirstOrDefault(p => string.Equals(p.Id, request.Id, StringComparison.OrdinalIgnoreCase));
            }

            if (presetToUpdate is null && !string.IsNullOrWhiteSpace(request.Name))
            {
                presetToUpdate = presets
                    .FirstOrDefault(p => string.Equals(p.Name, request.Name, StringComparison.OrdinalIgnoreCase));
            }

            if (presetToUpdate is null)
            {
                presetToUpdate = new WhitelistPreset
                {
                    Id = Guid.NewGuid().ToString("N"),
                    CreatedAt = DateTimeOffset.UtcNow
                };
                presets.Add(presetToUpdate);
            }

            presetToUpdate.Name = string.IsNullOrWhiteSpace(request.Name)
                ? $"Preset {DateTime.Now:yyyy-MM-dd HH:mm}"
                : request.Name.Trim();

            presetToUpdate.AllowedProcesses = request.AllowedProcesses ?? new List<string>();
            presetToUpdate.AllowedWebsites = request.AllowedWebsites ?? new List<string>();
            presetToUpdate.UpdatedAt = DateTimeOffset.UtcNow;

            var path = LocalStoragePaths.WhitelistPresetsFilePath;
            var json = JsonSerializer.Serialize(presets, JsonOptions);
            File.WriteAllText(path, json);

            return presetToUpdate;
        }
    }

    /// <summary>
    /// 删除指定 Id 的白名单预设。前端删除按钮使用。
    /// </summary>
    public bool DeleteWhitelistPreset(string id)
    {
        lock (_fileLock)
        {
            var presets = GetWhitelistPresets();
            var removed = presets.RemoveAll(p =>
                string.Equals(p.Id, id, StringComparison.OrdinalIgnoreCase)) > 0;

            if (removed)
            {
                var path = LocalStoragePaths.WhitelistPresetsFilePath;
                var json = JsonSerializer.Serialize(presets, JsonOptions);
                File.WriteAllText(path, json);
            }

            return removed;
        }
    }

    #endregion
}
