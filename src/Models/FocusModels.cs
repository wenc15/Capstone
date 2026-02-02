// 2026/01/27 edited by Zikai Lu
// 新增内容：
//   - StartFocusRequest 新增 AllowedWebsites 字段。
// 新增的作用：
//   - 接收 chrome-extension 的网站白名单配置。
// =============================================================

namespace CapstoneBackend.Models;

public class StartFocusRequest
{
    public int DurationSeconds { get; set; }                 // 专注时长（秒）
    public List<string> AllowedProcesses { get; set; } = new(); // 白名单：允许的进程名，例如 "chrome.exe"
    public List<string> AllowedWebsites { get; set; } = new();  // 白名单：允许的域名或 URL，例如 "github.com"
    public int GraceSeconds { get; set; } = 10;              // 宽限时间（秒），超出则判定失败
}

public class FocusStatusResponse
{
    public bool IsRunning { get; set; }          // 是否有正在进行的专注
    public int RemainingSeconds { get; set; }    // 剩余时间（秒）

    public bool IsFailed { get; set; }           // 是否已经判定失败
    public string? FailReason { get; set; }      // 失败原因（比如用到了哪个软件）

    public bool IsViolating { get; set; }        // 当前是否正在违规（使用非白名单软件）
    public int ViolationSeconds { get; set; }    // 当前这次违规已经持续多少秒
    public string? CurrentProcess { get; set; }  // 当前前台进程名（比如 "chrome"）
}
