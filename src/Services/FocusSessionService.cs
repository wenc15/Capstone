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
using System.Linq;
using CapstoneBackend.Models;
using CapstoneBackend.Utils;

namespace CapstoneBackend.Services;

public class FocusSessionService
{
    private readonly object _lock = new();
    private System.Threading.Timer? _timer;
    private readonly LocalDataService _dataService;

    private DateTimeOffset _startAt;
    private DateTimeOffset _endAt;
    private int _plannedDurationSeconds;

    private HashSet<string> _whitelist = new(StringComparer.OrdinalIgnoreCase);

    private TimeSpan _grace = TimeSpan.FromSeconds(10); // 宽限时间
    private DateTimeOffset? _violationStart;
    private bool _failed;
    private string? _failReason;

    private int _remainingSeconds;
    private int _violationSeconds;
    private string? _currentProcess;
    private bool _isRunning;

    public FocusSessionService(LocalDataService dataService)
    {
        _dataService = dataService;
    }

    public void StartSession(StartFocusRequest req)
    {
        lock (_lock)
        {
            _whitelist = new HashSet<string>(
                req.AllowedProcesses.Select(NormalizeProcessName),
                StringComparer.OrdinalIgnoreCase
            );

            _startAt = DateTimeOffset.Now;
            _plannedDurationSeconds = req.DurationSeconds;
            _endAt = _startAt.AddSeconds(req.DurationSeconds);
            _grace = TimeSpan.FromSeconds(req.GraceSeconds <= 0 ? 10 : req.GraceSeconds);

            _failed = false;
            _failReason = null;
            _violationStart = null;
            _violationSeconds = 0;
            _remainingSeconds = req.DurationSeconds;
            _isRunning = true;

            _timer?.Dispose();
            _timer = new System.Threading.Timer(CheckLoop, null, TimeSpan.Zero, TimeSpan.FromSeconds(1));
        }
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
            _remainingSeconds = Math.Max(0, (int)(_endAt - now).TotalSeconds);

            if (_remainingSeconds <= 0)
            {
                // 时间到了，自然结束；如果中途没失败就算成功
                EndSession(SessionOutcome.Success);
                return;
            }

            _currentProcess = ActiveWindowHelper.GetActiveProcessName();

            if (string.IsNullOrEmpty(_currentProcess))
            {
                _violationStart = null;
                _violationSeconds = 0;
                return;
            }

            var normalized = NormalizeProcessName(_currentProcess);
            bool isAllowed = _whitelist.Contains(normalized);

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
                    _failReason = $"使用非白名单程序：{_currentProcess}";
                    EndSession(SessionOutcome.Failed);
                }
            }
        }
    }

    /// <summary>
    /// 会话统一结束逻辑：停止计时器，计算实际专注时长，并更新用户 Profile。
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

        _dataService.RecordSession(outcome, elapsedSeconds);
    }

    private static string NormalizeProcessName(string name)
    {
        if (name.EndsWith(".exe", StringComparison.OrdinalIgnoreCase))
            return name[..^4];
        return name;
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
}
