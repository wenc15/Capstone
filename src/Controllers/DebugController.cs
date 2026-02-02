#if DEBUG
// 2026/01/22 created by <your name>
// =============================================================
// 文件：DebugController.cs
// 作用：提供开发/测试用的调试接口，不会在 Release 构建中启用。
// 功能：
//   - /api/debug/fake-success-session
//     直接模拟一次成功结束的专注会话，并按现有规则增加 Credits。
// 使用场景：
//   - 快速验证 RecordSession / Credits 逻辑
//   - 快速造数据给前端演示（成功专注次数、点数等）
// =============================================================

using Microsoft.AspNetCore.Mvc;
using CapstoneBackend.Services;
using CapstoneBackend.Models;

namespace CapstoneBackend.Controllers;

[ApiController]
[Route("api/[controller]")]
public class DebugController : ControllerBase
{
    private readonly LocalDataService _localData;

    public DebugController(LocalDataService localData)
    {
        _localData = localData;
    }

    /// <summary>
    /// Fake a successful focus session for testing.
    /// Example:
    ///   POST /api/debug/fake-success-session?focusSeconds=600
    /// will behave like: one Success session with 600s duration,
    /// and credits += floor(600 / 60) = 10.
    /// </summary>
    [HttpPost("fake-success-session")]
    public IActionResult FakeSuccess([FromQuery] int focusSeconds = 600)
    {
        if (focusSeconds < 0)
        {
            focusSeconds = 0;
        }

        // 直接复用正式逻辑：Success + 指定秒数
        _localData.RecordSession(SessionOutcome.Success, focusSeconds);

        var profile = _localData.GetUserProfile();
        var addedMinutes = focusSeconds / 60;

        return Ok(new
        {
            focusSeconds,
            addedMinutes,
            totalCredits = profile.Credits,
            totalSuccessfulSessions = profile.SuccessfulSessions,
            totalFocusSeconds = profile.TotalFocusSeconds
        });
    }
}
#endif
