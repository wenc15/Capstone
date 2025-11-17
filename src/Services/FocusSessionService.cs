using CapstoneBackend.Models;
using CapstoneBackend.Utils;

namespace CapstoneBackend.Services;

public class FocusSessionService
{
    private readonly object _lock = new();
    private System.Threading.Timer? _timer;

    private DateTimeOffset _endAt;
    private HashSet<string> _whitelist = new(StringComparer.OrdinalIgnoreCase);

    private TimeSpan _grace = TimeSpan.FromSeconds(10); // 宽限时间
    private DateTimeOffset? _violationStart;
    private bool _failed;
    private string? _failReason;

    private int _remainingSeconds;
    private int _violationSeconds;
    private string? _currentProcess;
    private bool _isRunning;

    public void StartSession(StartFocusRequest req)
    {
        lock (_lock)
        {
            // 把前端传来的白名单整理成 HashSet，方便快速判断
            _whitelist = new HashSet<string>(
                req.AllowedProcesses.Select(NormalizeProcessName),
                StringComparer.OrdinalIgnoreCase
            );

            _endAt = DateTimeOffset.Now.AddSeconds(req.DurationSeconds);
            _grace = TimeSpan.FromSeconds(req.GraceSeconds <= 0 ? 10 : req.GraceSeconds);

            _failed = false;
            _failReason = null;
            _violationStart = null;
            _violationSeconds = 0;
            _isRunning = true;

            _timer?.Dispose();
            _timer = new Timer(CheckLoop, null, TimeSpan.Zero, TimeSpan.FromSeconds(1));
        }
    }

    public void StopSession()
    {
        lock (_lock)
        {
            _isRunning = false;
            _timer?.Dispose();
            _timer = null;
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
                // 时间到了，自然结束（如果中途没失败就是成功）
                _isRunning = false;
                _timer?.Dispose();
                _timer = null;
                return;
            }

            _currentProcess = ActiveWindowHelper.GetActiveProcessName();

            // 拿不到前台进程，就当没违规，清空状态
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
                // 回到白名单，清空违规状态
                _violationStart = null;
                _violationSeconds = 0;
                return;
            }

            // 使用了非白名单软件
            if (_violationStart is null)
            {
                _violationStart = now;
                _violationSeconds = 0;
            }
            else
            {
                _violationSeconds = (int)(now - _violationStart.Value).TotalSeconds;

                // 超过宽限时间，判定失败
                if (now - _violationStart.Value >= _grace)
                {
                    _failed = true;
                    _failReason = $"使用非白名单程序：{_currentProcess}";
                    _isRunning = false;
                    _timer?.Dispose();
                    _timer = null;
                }
            }
        }
    }

    private static string NormalizeProcessName(string name)
    {
        // 把 "chrome.exe" 和 "chrome" 当成同一个
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
                IsViolating = _violationSeconds > 0 && !_failed,
                ViolationSeconds = _violationSeconds,
                CurrentProcess = _currentProcess
            };
        }
    }
}
