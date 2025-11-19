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
//   - UserProfile 相关：GetUserProfile(), RecordSession()
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


    // 片段：LocalDataService.RecordSession
    // 作用：根据一次专注会话结果更新用户 profile 里的统计信息。
    //       现在会额外统计 Aborted -> CanceledSessions。
    // =============================================================
    public void RecordSession(SessionOutcome outcome, int focusSeconds)
    {
        lock (_fileLock)
        {
            var profile = GetUserProfile();

            profile.TotalSessions += 1;
            profile.TotalFocusSeconds += Math.Max(0, focusSeconds);

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

            SaveUserProfile(profile);
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
