// 2026/01/21 edited by Zikai Lu
// 新增内容：
//   - 添加宠物成长值（PetGrowth）读写逻辑：GetPetGrowth() / AddPetGrowth() / ConsumePetGrowth()。
//   - 增加 PetGrowth 列表初始化与索引扩容的辅助方法。
// 新增的作用：
//   - 为宠物系统提供按编号管理的成长值存取能力。
//   - 保证成长值不低于 0，并兼容未来使用 -1 表示未拥有的场景。
// =============================================================

// 2026/01/16 edited by Zikai
// 新增内容：
//   - 在 RecordSession(...) 中根据本次会话时长按 floor(秒 / 60) 累积点数（Credits）。
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
    //       现在会额外统计 Aborted -> CanceledSessions，同时按照 floor(专注分钟数) 奖励点数（Credits）。
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

            // 新增：按分钟数奖励点数，使用 floor 原则
            // 例如：5.9 分钟 → 5 点；0.5 分钟 → 0 点（不奖励）
            var minutes = safeSeconds / 60; // int 除法自带向下取整
            if (minutes > 0)
            {
                profile.Credits += minutes;
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
    /// 追加一条专注会话历史记录到 session_history.json。
    /// </summary>
    public void AddSessionHistory(SessionHistoryItem entry)
    {
        lock (_fileLock)
        {
            var list = GetSessionHistory();
            list.Add(entry);

            var path = LocalStoragePaths.SessionHistoryFilePath;
            var json = JsonSerializer.Serialize(list, JsonOptions);
            File.WriteAllText(path, json);
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
