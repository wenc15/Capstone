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

// 2026/03/14 edited by JS
// Changes:
//   - Add pet ownership/active state helpers.
//   - Pet purchase/equip gated by current pet max (Lv 20).
//   - Clamp pet growth at Lv 20 cap.

// 2026/03/14 edited by JS
// Changes:
//   - Track FeedingPetId and gate new pet purchase by FeedingPetId max.
//   - Allow switching ActivePetId freely; only purchase is gated.

// 2026/01/16 edited by Zikai
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

    private const int PetMaxGrowthThreshold = 1900; // Lv 20 cap: (20-1)*100

    private static bool IsValidPetId(int petId)
    {
        return petId == 1 || petId == 2 || petId == 3;
    }

    private static int ClampPetGrowth(int value)
    {
        var normalized = NormalizePetGrowthValue(value);
        return normalized > PetMaxGrowthThreshold ? PetMaxGrowthThreshold : normalized;
    }

    private static int GetPetGrowthFromProfile(UserProfile profile, int petId, out bool changed)
    {
        changed = EnsurePetGrowthList(profile, petId);

        var raw = petId >= 0 && profile.PetGrowth.Count > petId ? profile.PetGrowth[petId] : 0;
        var clamped = ClampPetGrowth(raw);
        if (raw != clamped)
        {
            profile.PetGrowth[petId] = clamped;
            changed = true;
        }

        return clamped;
    }

    private static bool EnsurePetState(UserProfile profile)
    {
        var changed = false;

        if (profile.UnlockedPetIds == null || profile.UnlockedPetIds.Count == 0)
        {
            profile.UnlockedPetIds = new List<int> { 3 };
            changed = true;
        }

        // 清理非法 id / 去重
        var set = new HashSet<int>();
        var normalized = new List<int>();
        foreach (var id in profile.UnlockedPetIds)
        {
            if (!IsValidPetId(id)) continue;
            if (set.Add(id)) normalized.Add(id);
        }
        if (normalized.Count == 0)
        {
            normalized.Add(3);
        }
        if (profile.UnlockedPetIds.Count != normalized.Count)
        {
            profile.UnlockedPetIds = normalized;
            changed = true;
        }

        if (!IsValidPetId(profile.ActivePetId) || !profile.UnlockedPetIds.Contains(profile.ActivePetId))
        {
            profile.ActivePetId = profile.UnlockedPetIds[0];
            changed = true;
        }

        // Current on-stage pet is the one being fed/leveled.
        if (profile.FeedingPetId != profile.ActivePetId)
        {
            profile.FeedingPetId = profile.ActivePetId;
            changed = true;
        }

        return changed;
    }

    // 作用：根据一次专注会话结果更新用户 profile 里的统计信息。
    //       现在会额外统计 Aborted -> CanceledSessions，同时按照 ceil(专注分钟数) 奖励点数（Credits）。
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

            // 新增：按分钟数奖励点数，使用 ceil 原则
            // 例如：5.1 分钟 → 6 点；0.1 分钟 → 1 点（若本次有时长）
            var minutes = (int)Math.Ceiling(safeSeconds / 60.0);
            if (minutes > 0)
            {
                profile.Credits += minutes;


            // 成就系统：累计获得点数（历史总获得 Credits，不受花费影响）
                if (profile.AchievementCounters == null)
                {
                profile.AchievementCounters = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
                }
                profile.AchievementCounters.TryGetValue("credits_earned_total", out var earned);
                profile.AchievementCounters["credits_earned_total"] = checked(earned + minutes);

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
    /// 设置点数余额为指定值（用于测试/调试）。
    /// </summary>
    public int SetCredits(int credits)
    {
        var safe = credits < 0 ? 0 : credits;

        lock (_fileLock)
        {
            var profile = GetUserProfile();
            profile.Credits = safe;
            SaveUserProfile(profile);
            return profile.Credits;
        }
    }

    /// <summary>
    /// 获取宠物拥有/激活状态。
    /// </summary>
    public PetStateResponse GetPetState()
    {
        lock (_fileLock)
        {
            var profile = GetUserProfile();
            var changed = EnsurePetState(profile);
            if (changed) SaveUserProfile(profile);

            return new PetStateResponse
            {
                ActivePetId = profile.ActivePetId,
                FeedingPetId = profile.FeedingPetId,
                UnlockedPetIds = new List<int>(profile.UnlockedPetIds)
            };
        }
    }

    /// <summary>
    /// 设置当前激活宠物（必须已解锁）。
    /// </summary>
    public bool TrySetActivePet(int petId, out PetStateResponse state, out string error)
    {
        error = string.Empty;
        state = new PetStateResponse();

        if (!IsValidPetId(petId))
        {
            error = "invalid petId.";
            return false;
        }

        lock (_fileLock)
        {
            var profile = GetUserProfile();
            EnsurePetState(profile);

            if (!profile.UnlockedPetIds.Contains(petId))
            {
                error = "pet is not unlocked.";
                state = new PetStateResponse { ActivePetId = profile.ActivePetId, FeedingPetId = profile.FeedingPetId, UnlockedPetIds = new List<int>(profile.UnlockedPetIds) };
                return false;
            }

            profile.ActivePetId = petId;
            profile.FeedingPetId = petId;
            SaveUserProfile(profile);

            state = new PetStateResponse { ActivePetId = profile.ActivePetId, FeedingPetId = profile.FeedingPetId, UnlockedPetIds = new List<int>(profile.UnlockedPetIds) };
            return true;
        }
    }

    /// <summary>
    /// 解锁指定宠物（要求当前 FeedingPetId 满级：阶段 3 阈值）。
    /// </summary>
    public bool TryUnlockPet(int petId, out PetStateResponse state, out string error)
    {
        error = string.Empty;
        state = new PetStateResponse();

        if (!IsValidPetId(petId))
        {
            error = "invalid petId.";
            return false;
        }

        lock (_fileLock)
        {
            var profile = GetUserProfile();
            EnsurePetState(profile);

            // Must max the current on-stage (active) pet before buying a new one.
            var anyGrowthChanged = false;
            var activeGrowth = GetPetGrowthFromProfile(profile, profile.ActivePetId, out var activeGrowthChanged);
            anyGrowthChanged = anyGrowthChanged || activeGrowthChanged;
            if (activeGrowth < PetMaxGrowthThreshold)
            {
                if (anyGrowthChanged) SaveUserProfile(profile);
                error = "current active pet must be max level first.";
                state = new PetStateResponse { ActivePetId = profile.ActivePetId, FeedingPetId = profile.FeedingPetId, UnlockedPetIds = new List<int>(profile.UnlockedPetIds) };
                return false;
            }

            // Only allow buying one new pet at a time.
            // If player already owns any other pet that is not max level (in backpack), block purchase.
            foreach (var ownedId in profile.UnlockedPetIds)
            {
                if (ownedId == profile.ActivePetId) continue;
                var g = GetPetGrowthFromProfile(profile, ownedId, out var ownedGrowthChanged);
                anyGrowthChanged = anyGrowthChanged || ownedGrowthChanged;
                if (g < PetMaxGrowthThreshold)
                {
                    if (anyGrowthChanged) SaveUserProfile(profile);
                    error = "you already have a non-max pet in backpack.";
                    state = new PetStateResponse { ActivePetId = profile.ActivePetId, FeedingPetId = profile.FeedingPetId, UnlockedPetIds = new List<int>(profile.UnlockedPetIds) };
                    return false;
                }
            }

            if (anyGrowthChanged) SaveUserProfile(profile);

            if (profile.UnlockedPetIds.Contains(petId))
            {
                // Allow re-buying an owned pet to restart its growth loop.
                // This will reset that pet's growth to 0 (egg) while keeping ownership.
                EnsurePetGrowthList(profile, petId);
                profile.PetGrowth[petId] = 0;
                SaveUserProfile(profile);

                state = new PetStateResponse { ActivePetId = profile.ActivePetId, FeedingPetId = profile.FeedingPetId, UnlockedPetIds = new List<int>(profile.UnlockedPetIds) };
                return true;
            }

            profile.UnlockedPetIds.Add(petId);
            SaveUserProfile(profile);

            state = new PetStateResponse { ActivePetId = profile.ActivePetId, FeedingPetId = profile.FeedingPetId, UnlockedPetIds = new List<int>(profile.UnlockedPetIds) };
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

            return new Dictionary<string, int>(profile.Inventory, StringComparer.OrdinalIgnoreCase);
        }
    }

    /// <summary>
    /// 增加指定物品的数量。
    /// amount 必须为正数；返回增加后的数量。
    /// </summary>
    public int AddInventoryItem(string itemId, int amount)
    {
        if (string.IsNullOrWhiteSpace(itemId) || amount <= 0)
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

            profile.Inventory.TryGetValue(itemId, out var current);
            if (current < 0)
            {
                current = 0;
            }

            checked
            {
                current += amount;
            }

            profile.Inventory[itemId] = current;
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
        lock (_fileLock)
        {
            var profile = GetUserProfile();
            if (profile.Inventory == null)
            {
                profile.Inventory = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
            }

            profile.Inventory.TryGetValue(itemId, out var current);
            if (current < 0)
            {
                current = 0;
            }

            if (string.IsNullOrWhiteSpace(itemId) || amount <= 0 || current < amount)
            {
                newCount = current;
                return false;
            }

            profile.Inventory[itemId] = current - amount;
            SaveUserProfile(profile);

            newCount = profile.Inventory[itemId];
            return true;
        }
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
            var growth = GetPetGrowthFromProfile(profile, petId, out var changed);
            if (changed) SaveUserProfile(profile);
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

            var current = ClampPetGrowth(profile.PetGrowth[petId]);
            checked { current += amount; }
            current = current > PetMaxGrowthThreshold ? PetMaxGrowthThreshold : current;

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

            var current = ClampPetGrowth(profile.PetGrowth[petId]);
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
            var path = LocalStoragePaths.SessionHistoryFilePath;

            if (!File.Exists(path))
                return new List<SessionHistoryItem>();

            try
            {
                var json = File.ReadAllText(path);
                var list = JsonSerializer.Deserialize<List<SessionHistoryItem>>(json, JsonOptions);
                return list ?? new List<SessionHistoryItem>();
            }
            catch
            {
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
            var list = GetSessionHistory();
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

    private void SaveSessionHistoryList(List<SessionHistoryItem> list)
    {
        var path = LocalStoragePaths.SessionHistoryFilePath;
        var json = JsonSerializer.Serialize(list, JsonOptions);
        File.WriteAllText(path, json);
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
    }

    private static void BackupIfExists(string sourcePath, string targetPath)
    {
        if (File.Exists(sourcePath))
        {
            File.Copy(sourcePath, targetPath, overwrite: true);
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
