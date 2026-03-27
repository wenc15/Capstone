// 2026/03/26 edited by JS
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
using System.Globalization;
using CapstoneBackend.Models;
using CapstoneBackend.Services.Dtos;

namespace CapstoneBackend.Services;


public class AchievementService
{
    private readonly LocalDataService _dataService;
    private readonly IWebHostEnvironment _env;

    // Keep in sync with ui/js/pet.js
    private const int PetExpPerLevel = 100;
    private const int PetMaxLevel = 20;
    private const int PetMaxGrowth = (PetMaxLevel - 1) * PetExpPerLevel;

    private List<AchievementDefinition>? _cachedDefs;
    private DateTimeOffset _cachedDefsLastWriteUtc;
    private readonly object _defsLock = new();

    private sealed class AchievementDefinitionsFile
    {
        public string? Changelog { get; set; }
        public List<AchievementDefinition>? Achievements { get; set; }
    }

    public AchievementService(LocalDataService dataService, IWebHostEnvironment env)
    {
        _dataService = dataService;
        _env = env;
    }

    public List<AchievementDefinition> GetDefinitions()
    {
        var path = Path.Combine(_env.ContentRootPath, "Data", "achievements.json");
        if (!File.Exists(path))
            return new List<AchievementDefinition>();

        var lastWriteUtc = File.GetLastWriteTimeUtc(path);

        lock (_defsLock)
        {
            if (_cachedDefs != null && _cachedDefsLastWriteUtc == lastWriteUtc)
                return _cachedDefs;

            var json = File.ReadAllText(path);
            var opts = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };

            List<AchievementDefinition> defs;
            try
            {
                // Back-compat: allow either a raw array or an object wrapper.
                defs = JsonSerializer.Deserialize<List<AchievementDefinition>>(json, opts) ?? new List<AchievementDefinition>();
            }
            catch (JsonException)
            {
                var file = JsonSerializer.Deserialize<AchievementDefinitionsFile>(json, opts);
                defs = file?.Achievements ?? new List<AchievementDefinition>();
            }

            // Remove empty IDs and dedupe
            _cachedDefs = defs
                .Where(d => !string.IsNullOrWhiteSpace(d.Id))
                .GroupBy(d => d.Id.Trim(), StringComparer.OrdinalIgnoreCase)
                .Select(g => g.First())
                .ToList();

            _cachedDefsLastWriteUtc = lastWriteUtc;
            return _cachedDefs;
        }
    }

    /// <summary>
    /// Read current achievements with auto-unlock applied.
    /// This will update UserProfile (unlocked set + timestamps) when thresholds are met.
    /// </summary>
    public List<AchievementStatusDto> GetStatusesAndAutoUnlock()
    {
        var defs = GetDefinitions();
        var profile = _dataService.GetUserProfile();

        var maxPetLevel = ComputeMaxPetLevel(profile.PetGrowth);
        var bestFocusStreakDays = ComputeBestFocusStreakDays();

        foreach (var def in defs)
        {
            var progress = GetProgressFor(def.Type, profile, maxPetLevel, bestFocusStreakDays);

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
            var progress = GetProgressFor(def.Type, profile, maxPetLevel, bestFocusStreakDays);
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

    private int GetProgressFor(string type, UserProfile profile, int maxPetLevel, int bestFocusStreakDays)
    {
        // Computed-from-profile types (no extra counters required)
        if (type.Equals("total_sessions", StringComparison.OrdinalIgnoreCase))
            return profile.TotalSessions;

        if (type.Equals("successful_sessions", StringComparison.OrdinalIgnoreCase))
            return profile.SuccessfulSessions;

        if (type.Equals("failed_sessions", StringComparison.OrdinalIgnoreCase))
            return profile.FailedSessions;

        if (type.Equals("total_focus_minutes", StringComparison.OrdinalIgnoreCase))
            return (int)(profile.TotalFocusSeconds / 60);

        // Pet-related (computed from profile.PetGrowth)
        if (type.Equals("pet_level_max", StringComparison.OrdinalIgnoreCase))
            return maxPetLevel;

        if (type.Equals("pet_any_max_level", StringComparison.OrdinalIgnoreCase))
            return maxPetLevel >= PetMaxLevel ? 1 : 0;

        // Focus streak (computed from session history)
        if (type.Equals("focus_best_streak_days", StringComparison.OrdinalIgnoreCase))
            return bestFocusStreakDays;

        // Event-style counters (stored in profile.AchievementCounters)
        if (profile.AchievementCounters.TryGetValue(type, out var v))
            return v;

        return 0;
    }

    private static int ComputeMaxPetLevel(List<int>? petGrowth)
    {
        if (petGrowth == null || petGrowth.Count == 0)
            return 1;

        var maxLevel = 1;
        foreach (var raw in petGrowth)
        {
            var safe = Math.Max(0, raw);
            var capped = Math.Min(PetMaxGrowth, safe);
            var lv = Math.Min(PetMaxLevel, (capped / PetExpPerLevel) + 1);
            if (lv > maxLevel) maxLevel = lv;
        }

        return maxLevel;
    }

    private int ComputeBestFocusStreakDays()
    {
        List<SessionHistoryDailySummaryItem> daily;
        try
        {
            daily = _dataService.GetSessionHistoryDailySummary();
        }
        catch
        {
            return 0;
        }

        if (daily == null || daily.Count == 0)
            return 0;

        var days = daily
            .Where(d => d != null && d.Success > 0 && !string.IsNullOrWhiteSpace(d.Date))
            .Select(d => TryParseLocalDateOnly(d.Date))
            .Where(d => d.HasValue)
            .Select(d => d!.Value)
            .Distinct()
            .OrderBy(d => d)
            .ToList();

        if (days.Count == 0)
            return 0;

        var best = 0;
        var run = 0;
        DateOnly? prev = null;

        foreach (var day in days)
        {
            if (prev.HasValue && day == prev.Value.AddDays(1))
                run += 1;
            else
                run = 1;

            if (run > best) best = run;
            prev = day;
        }

        return best;
    }

    private static DateOnly? TryParseLocalDateOnly(string date)
    {
        if (string.IsNullOrWhiteSpace(date))
            return null;

        if (DateOnly.TryParseExact(date.Trim(), "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var d))
            return d;

        if (DateOnly.TryParse(date.Trim(), CultureInfo.InvariantCulture, DateTimeStyles.None, out d))
            return d;

        return null;
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
