// 2026/01/27 edited by Zikai Lu
// 新增内容：
//   - 增加网站白名单与违规累计逻辑。
//   - 新增网站域名规范化与子域名匹配判断。
// 新增的作用：
//   - 对接 chrome-extension 的网站使用上报，超出 grace 即失败会话。
// =============================================================

// 2026/01/21 edited by Zikai Lu
// 新增内容：
//   - 使用向上取整计算剩余秒数，避免会话提前结束导致奖励点数不足。
// 新增的作用：
//   - 确保成功完成的专注会话能正确累计满分钟的点数与统计时长。
// =============================================================

// 2025/11/19 edited by 京华昼梦
// 新增内容：
//   - 在 EndSession(outcome) 中新增写入会话历史的逻辑。
//   - 根据 elapsedSeconds 自动计算本次会话的 minutes（最少 1 分钟）。
//   - 将当前 whitelist 应用列表作为 note 保存到 history。
// =============================================================
// 新增的作用：
//   - 每次会话结束（成功 / 失败 / 手动终止）都能记录完整历史，供 Stats 使用。
//   - 与 RecordSession(outcome, seconds) 同步，构成“汇总 + 历史明细”的双层数据体系。
// =============================================================
// 新增的结构变化：
//   - EndSession() 现在除更新 profile 外，还调用 AddSessionHistory()。
//   - 引入新的 SessionHistoryItem 数据结构，保持与前端 stats.js 的 JSON 格式一致。
// =============================================================

// 2025/11/18 edited by 京华昼梦
// 新增内容：
//   - 添加 sessionId 与 startedAt 字段，用于记录会话唯一标识与开始时间。
//   - 在 StartSession 中新增 remainingSeconds 的立即初始化，确保前端首次 /status 即获得正确倒计时。
//   - 新增 IsRunning() 方法，供 Controller 用于防止重复启动会话。
// =============================================================
// 新增的作用：
//   - 提升前后端联动一致性：StartSession 在启动瞬间即可提供可用状态，避免前端出现 0 秒或延迟。
//   - 提供更安全的会话状态管理：外部（Controller）可在启动前判断会话是否占用。
// =============================================================
// 新增的结构变化：
//   - StartSession() 现在负责初始化会话元信息（sessionId、startedAt、remainingSeconds）。
//   - 类对外暴露新的运行状态查询方法：IsRunning()。
// =============================================================


//2025/11/17 edited by Zikai
//新增用户profile和预设白名单相关联动
// =============================================================
// 文件：FocusSessionService.cs
// 作用：管理单次专注会话的生命周期（开始、监控、结束/失败）。
//      在关键节点（成功、失败、手动结束）调用 LocalDataService
//      更新本地用户 Profile（累计时长和各种计数）。
// 结构：
//   - StartSession(): 初始化会话并启动定时器
//   - StopSession(): 用户主动结束（Aborted）
//   - CheckLoop(): 每秒检查剩余时间与违规状态
//   - EndSession(outcome): 统一的结束逻辑 + 写入 Profile
//   - GetStatus(): 给前端查询当前状态
// =============================================================

using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using CapstoneBackend.Models;
using CapstoneBackend.Utils;

namespace CapstoneBackend.Services;

public class FocusSessionService
{
    // Process alias map (normalized names without .exe)
    // 1) Support one app corresponding to multiple process names.
    // 2) Add low-cost launcher mappings to reduce false violations.
    private static readonly Dictionary<string, string[]> ProcessAliasMap = new(StringComparer.OrdinalIgnoreCase)
    {
        // Canonical app -> aliases
        ["discord"] = new[] { "update" },
        ["slack"] = new[] { "update" },
        ["teams"] = new[] { "ms-teams" },
        ["ms-teams"] = new[] { "teams" },

        // Launcher/updater -> probable app processes
        ["update"] = new[] { "discord", "slack" },
    };

    private readonly object _lock = new();
    private System.Threading.Timer? _timer;
    private readonly LocalDataService _dataService;

    private DateTimeOffset _startAt;
    private DateTimeOffset _endAt;
    private int _plannedDurationSeconds;

    private HashSet<string> _whitelist = new(StringComparer.OrdinalIgnoreCase);
    private HashSet<string> _sessionTrustedProcesses = new(StringComparer.OrdinalIgnoreCase);
    private HashSet<string> _websiteWhitelist = new(StringComparer.OrdinalIgnoreCase);

    private TimeSpan _grace = TimeSpan.FromSeconds(10); // 宽限时间
    private DateTimeOffset? _violationStart;
    private bool _failed;
    private string? _failReason;

    private int _remainingSeconds; //11/18/25 不确定是否应该让变量初始化为0
    private int _preferredDurationSeconds = 25 * 60;
    private int _violationSeconds;
    private string? _currentProcess;
    private bool _isRunning;
    private string? _sessionId;       // 新：用于调试/日志（可选）
    private DateTimeOffset? _startedAt; // 新：用于会话元信息（可选）
    private int _websiteViolationSeconds;
    private int _websiteviolationseconds
    {
        get => _websiteViolationSeconds;
        set => _websiteViolationSeconds = value;
    }

    private const int AutoTrustMaxParentDepth = 6;
    private const int AutoTrustMaxPerSession = 32;
    private static readonly TimeSpan AutoTrustProcessStartTolerance = TimeSpan.FromSeconds(5);
    private static readonly TimeSpan AutoTrustLauncherFallbackWindow = TimeSpan.FromMinutes(2);
    private static readonly HashSet<string> LauncherLikeProcessNames = new(StringComparer.OrdinalIgnoreCase)
    {
        "update",
        "updater",
        "launcher",
        "bootstrapper",
    };


    public FocusSessionService(LocalDataService dataService)
    {
        _dataService = dataService;
    }

    public void StartSession(StartFocusRequest req)
    {
        lock (_lock)
        {
            _whitelist = ExpandAllowedProcesses(req.AllowedProcesses);

            _websiteWhitelist = new HashSet<string>(
                req.AllowedWebsites.Select(NormalizeDomain).Where(x => !string.IsNullOrWhiteSpace(x)),
                StringComparer.OrdinalIgnoreCase
            );

            _startAt = DateTimeOffset.Now;
            _plannedDurationSeconds = req.DurationSeconds;
            _preferredDurationSeconds = req.DurationSeconds;
            _endAt = _startAt.AddSeconds(req.DurationSeconds);
            _grace = TimeSpan.FromSeconds(req.GraceSeconds <= 0 ? 10 : req.GraceSeconds);

            _sessionId = Guid.NewGuid().ToString("N");          // 新增：给本次专注生成唯一 ID
            _startedAt = DateTimeOffset.Now;                    // 新增：记录专注开始时间
            _remainingSeconds = Math.Max(0,                     // 新增：初始化剩余秒数
                (int)(_endAt - _startedAt.Value).TotalSeconds);

            _failed = false;
            _failReason = null;
            _violationStart = null;
            _violationSeconds = 0;
            _sessionTrustedProcesses = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            _websiteViolationSeconds = 0;
            _remainingSeconds = req.DurationSeconds;
            _isRunning = true;

            _timer?.Dispose();
            _timer = new System.Threading.Timer(CheckLoop, null, TimeSpan.Zero, TimeSpan.FromSeconds(1));
        }
    }

    private static HashSet<string> ExpandAllowedProcesses(IEnumerable<string>? allowedProcesses)
    {
        var expanded = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var queue = new Queue<string>();

        foreach (var raw in allowedProcesses ?? Enumerable.Empty<string>())
        {
            var normalized = NormalizeProcessName(raw);
            if (string.IsNullOrWhiteSpace(normalized))
                continue;

            if (expanded.Add(normalized))
                queue.Enqueue(normalized);
        }

        while (queue.Count > 0)
        {
            var current = queue.Dequeue();
            if (!ProcessAliasMap.TryGetValue(current, out var aliases))
                continue;

            foreach (var alias in aliases)
            {
                var normalizedAlias = NormalizeProcessName(alias);
                if (string.IsNullOrWhiteSpace(normalizedAlias))
                    continue;

                if (expanded.Add(normalizedAlias))
                    queue.Enqueue(normalizedAlias);
            }
        }

        return expanded;
    }

    public void StopSession()
    {
        lock (_lock)
        {
            if (!_isRunning)
                return;

            // 手动结束视为 Aborted
            EndSession(SessionOutcome.Aborted);
        }
    }

    private void CheckLoop(object? state)
    {
        lock (_lock)
        {
            if (!_isRunning) return;

            var now = DateTimeOffset.Now;
            _remainingSeconds = Math.Max(0, (int)Math.Ceiling((_endAt - now).TotalSeconds));

            if (_remainingSeconds <= 0)
            {
                // 时间到了，自然结束；如果中途没失败就算成功
                EndSession(SessionOutcome.Success);
                return;
            }

            var active = ActiveWindowHelper.GetActiveProcessInfo();
            _currentProcess = active?.ProcessName;

            if (active is null || string.IsNullOrEmpty(active.ProcessName))
            {
                _violationStart = null;
                _violationSeconds = 0;
                return;
            }

            var normalized = NormalizeProcessName(active.ProcessName);
            bool isAllowed = _whitelist.Contains(normalized) || _sessionTrustedProcesses.Contains(normalized);

            if (!isAllowed && TryAutoTrustByParent(active, normalized))
            {
                isAllowed = true;
            }

            if (isAllowed)
            {
                _violationStart = null;
                _violationSeconds = 0;
                return;
            }

            // 非白名单软件
            if (_violationStart is null)
            {
                _violationStart = now;
                _violationSeconds = 0;
            }
            else
            {
                _violationSeconds = (int)(now - _violationStart.Value).TotalSeconds;

                if (now - _violationStart.Value >= _grace)
                {
                    _failed = true;
                    _failReason = $"Used non-whitelisted program：{_currentProcess}";
                    EndSession(SessionOutcome.Failed);
                }
            }
        }
    }

    /// <summary>
    /// 会话统一结束逻辑：停止计时器，计算实际专注时长，并更新用户 Profile 与会话历史。
    /// </summary>
    private void EndSession(SessionOutcome outcome)
    {
        if (!_isRunning)
            return;

        _isRunning = false;
        _timer?.Dispose();
        _timer = null;

        var now = DateTimeOffset.Now;

        var elapsedSeconds = _startAt == default
            ? 0
            : Math.Max(0, (int)(now - _startAt).TotalSeconds);

        // 更新总体 Profile 统计
        _dataService.RecordSession(outcome, elapsedSeconds);

        // 把秒数换算成分钟，至少 1 分钟
        var minutes = Math.Max(1, (int)Math.Ceiling(elapsedSeconds / 60.0));

        // 这里用当前 whitelist 作为 note（前端 stats 会展示在“Last Note/App”里）
        var note = _whitelist is { Count: > 0 }
            ? string.Join(", ", _whitelist)
            : string.Empty;

        _dataService.AddSessionHistory(new SessionHistoryItem
        {
            Ts = now.ToUnixTimeMilliseconds(),
            Minutes = minutes,
            Note = note,
            Outcome = outcome.ToString().ToLower(), // success / failed / aborted
        });
    }


    private static string NormalizeProcessName(string name)
    {
        if (string.IsNullOrWhiteSpace(name))
            return string.Empty;

        var raw = name.Trim().Trim('"');
        if (raw.StartsWith("steam://", StringComparison.OrdinalIgnoreCase))
            return "steam";

        // Handle command lines like:
        //   "C:\\Path\\app.exe" --flag
        //   C:\\Path\\app.exe --flag
        var token = raw;
        if (raw.Contains(' '))
            token = raw.Split(' ', StringSplitOptions.RemoveEmptyEntries)[0].Trim('"');

        var fileName = Path.GetFileName(token.Replace('\\', '/'));
        var normalized = string.IsNullOrWhiteSpace(fileName) ? token : fileName;

        if (normalized.EndsWith(".exe", StringComparison.OrdinalIgnoreCase))
            normalized = normalized[..^4];

        return normalized;
    }

    private bool TryAutoTrustByParent(ProcessSnapshot active, string activeNormalized)
    {
        if (string.IsNullOrWhiteSpace(activeNormalized))
            return false;

        if (_sessionTrustedProcesses.Count >= AutoTrustMaxPerSession)
            return false;

        var startedInSession = active.StartTime is null || active.StartTime.Value >= _startAt - AutoTrustProcessStartTolerance;
        if (!startedInSession)
            return false;

        var visited = new HashSet<int>();
        var pid = active.ParentProcessId;
        var depth = 0;

        while (pid > 0 && depth < AutoTrustMaxParentDepth && visited.Add(pid))
        {
            if (!ActiveWindowHelper.TryGetProcessInfo(pid, out var parent) || parent is null)
                break;

            var parentNormalized = NormalizeProcessName(parent.ProcessName);
            if (_whitelist.Contains(parentNormalized) || _sessionTrustedProcesses.Contains(parentNormalized))
            {
                _sessionTrustedProcesses.Add(activeNormalized);
                return true;
            }

            pid = parent.ParentProcessId;
            depth++;
        }

        if (active.StartTime is not null
            && active.StartTime.Value <= _startAt + AutoTrustLauncherFallbackWindow
            && HasLauncherLikeWhitelistEntry())
        {
            _sessionTrustedProcesses.Add(activeNormalized);
            return true;
        }

        return false;
    }

    private bool HasLauncherLikeWhitelistEntry()
    {
        foreach (var allowed in _whitelist)
        {
            if (LauncherLikeProcessNames.Contains(allowed))
                return true;
        }

        return false;
    }

    private static string NormalizeDomain(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return string.Empty;

        var raw = value.Trim();
        if (Uri.TryCreate(raw, UriKind.Absolute, out var uri))
            return uri.Host;

        if (Uri.TryCreate("https://" + raw, UriKind.Absolute, out uri))
            return uri.Host;

        return raw.ToLowerInvariant();
    }

    private bool IsDomainAllowed(string domain)
    {
        if (_websiteWhitelist.Contains(domain))
            return true;

        foreach (var allowed in _websiteWhitelist)
        {
            if (domain.EndsWith("." + allowed, StringComparison.OrdinalIgnoreCase))
                return true;
        }

        return false;
    }

    public FocusStatusResponse GetStatus()
    {
        lock (_lock)
        {
            return new FocusStatusResponse
            {
                IsRunning = _isRunning,
                RemainingSeconds = _remainingSeconds,
                IsFailed = _failed,
                FailReason = _failReason,
                IsViolating = _violationSeconds > 0 && !_failed && _isRunning,
                ViolationSeconds = _violationSeconds,
                CurrentProcess = _currentProcess
            };
        }
    }

    public void ReportWebsiteUsage(string? domain, string? url, int durationSeconds)
    {
        lock (_lock)
        {
            if (!_isRunning || durationSeconds <= 0)
                return;

            if (_websiteWhitelist.Count == 0)
                return;

            var normalized = NormalizeDomain(!string.IsNullOrWhiteSpace(domain) ? domain : url);
            if (string.IsNullOrWhiteSpace(normalized))
                return;

            if (IsDomainAllowed(normalized))
            {
                _websiteViolationSeconds = 0;
                return;
            }

            _websiteViolationSeconds += durationSeconds;
            if (_websiteViolationSeconds >= _grace.TotalSeconds)
            {
                _failed = true;
                _failReason = $"Used non-whitelisted website: {normalized}";
                EndSession(SessionOutcome.Failed);
            }
        }
    }

    // ---------------------------------------------------------
    // ★ 新增：让 Controller 可以判断当前是否已有正在运行的 session
    // ---------------------------------------------------------
    public bool IsRunning()
    {
        lock (_lock)
        {
            // 返回当前专注模式是否处于“活跃”
            // 加锁确保不会读到 timer 还没写完的值
            return _isRunning;
        }
    }

    public int GetPreferredDurationSeconds()
    {
        lock (_lock)
        {
            return Math.Max(60, _preferredDurationSeconds);
        }
    }

    public int SetPreferredDurationSeconds(int durationSeconds)
    {
        lock (_lock)
        {
            var clamped = Math.Max(60, Math.Min(8 * 60 * 60, durationSeconds));
            _preferredDurationSeconds = clamped;
            return _preferredDurationSeconds;
        }
    }

}
