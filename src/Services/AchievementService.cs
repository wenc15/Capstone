// 2026/03/04 created by Darren (Chengyuan Wen)
// =============================================================
// 文件：AchievementService.cs
// 作用：成就系统核心业务逻辑（Achievements）。
// 功能：
//   1) 从 Data/achievements.json 读取成就定义（Definition），并进行缓存（避免每次请求都读文件）
//   2) 根据 UserProfile 计算各成就的进度（Progress）
//   3) 自动解锁：当 Progress >= Target 时，写入 UserProfile.UnlockedAchievements / AchievementUnlockedAt
//   4) 提供事件式计数器接口：IncrementCounter(type, delta)
//      - 适用于 “food_draws_total” 这种需要累加事件次数的成就
//
// 依赖：
//   - LocalDataService：读写 UserProfile（本地 JSON）
//   - IWebHostEnvironment：定位 achievements.json 路径（ContentRootPath）
//
// 说明：
//   - 本版本采用“自动解锁”策略：前端只需要调用 GET /api/achievements 即可得到最新状态。
//   - 进度来源分两类：
//       A) 直接从 UserProfile 计算（如 total_sessions / total_focus_minutes）
//       B) 从 UserProfile.AchievementCounters 读取（如 food_draws_total）
// =============================================================

using System.Text.Json;
using CapstoneBackend.Models;
using CapstoneBackend.Services.Dtos;

namespace CapstoneBackend.Services;


public class AchievementService
{
    private readonly LocalDataService _dataService;
    private readonly IWebHostEnvironment _env;

    private List<AchievementDefinition>? _cachedDefs;

    public AchievementService(LocalDataService dataService, IWebHostEnvironment env)
    {
        _dataService = dataService;
        _env = env;
    }

    public List<AchievementDefinition> GetDefinitions()
    {
        if (_cachedDefs != null) return _cachedDefs;

        var path = Path.Combine(_env.ContentRootPath, "Data", "achievements.json");
        if (!File.Exists(path))
        {
            _cachedDefs = new List<AchievementDefinition>();
            return _cachedDefs;
        }

        var json = File.ReadAllText(path);
        var defs = JsonSerializer.Deserialize<List<AchievementDefinition>>(json,
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true })
            ?? new List<AchievementDefinition>();

        // Remove empty IDs and dedupe
        _cachedDefs = defs
            .Where(d => !string.IsNullOrWhiteSpace(d.Id))
            .GroupBy(d => d.Id.Trim(), StringComparer.OrdinalIgnoreCase)
            .Select(g => g.First())
            .ToList();

        return _cachedDefs;
    }

    /// <summary>
    /// Read current achievements with auto-unlock applied.
    /// This will update UserProfile (unlocked set + timestamps) when thresholds are met.
    /// </summary>
    public List<AchievementStatusDto> GetStatusesAndAutoUnlock()
    {
        var defs = GetDefinitions();
        var profile = _dataService.GetUserProfile();

        foreach (var def in defs)
        {
            var progress = GetProgressFor(def.Type, profile);

            if (progress >= def.Target)
            {
                // Unlock if not unlocked yet
                if (!profile.UnlockedAchievements.Contains(def.Id))
                {
                    profile.UnlockedAchievements.Add(def.Id);
                    profile.AchievementUnlockedAt[def.Id] = DateTimeOffset.UtcNow;
                }
            }
        }

        // Persist if anything changed:
        // LocalDataService.SaveUserProfile is private, so easiest approach:
        // add a public method in LocalDataService to save profile OR add a helper method.
        // For minimal changes, we'll do this via a small new method in LocalDataService (next step).
        _dataService.SaveUserProfilePublic(profile);

        // Build response
        return defs.Select(def =>
        {
            var progress = GetProgressFor(def.Type, profile);
            var unlocked = profile.UnlockedAchievements.Contains(def.Id);
            profile.AchievementUnlockedAt.TryGetValue(def.Id, out var unlockedAt);

            return new AchievementStatusDto
            {
                Id = def.Id,
                Title = def.Title,
                Desc = def.Desc,
                Type = def.Type,
                Target = def.Target,
                Progress = progress,
                Unlocked = unlocked,
                UnlockedAt = unlocked ? unlockedAt : null
            };
        }).ToList();
    }

    private static int GetProgressFor(string type, UserProfile profile)
    {
        // Computed-from-profile types (no extra counters required)
        if (type.Equals("total_sessions", StringComparison.OrdinalIgnoreCase))
            return profile.TotalSessions;

        if (type.Equals("successful_sessions", StringComparison.OrdinalIgnoreCase))
            return profile.SuccessfulSessions;

        if (type.Equals("total_focus_minutes", StringComparison.OrdinalIgnoreCase))
            return (int)(profile.TotalFocusSeconds / 60);

        // Event-style counters (stored in profile.AchievementCounters)
        if (profile.AchievementCounters.TryGetValue(type, out var v))
            return v;

        return 0;
    }

    // Event hooks for later steps:
    public void IncrementCounter(string type, int delta = 1)
    {
        if (delta <= 0) return;

        var profile = _dataService.GetUserProfile();
        profile.AchievementCounters.TryGetValue(type, out var current);
        profile.AchievementCounters[type] = checked(current + delta);

        _dataService.SaveUserProfilePublic(profile);
    }
}