// 2025/11/18 edited by 京华昼梦
// 新增内容：
//   - 在 Start 接口中统一使用 JSON 形式的错误返回（new { error = "..." }）。
//   - 在 Start 接口中新增 IsRunning() 检查，若已有会话运行则返回 409 Conflict。
//   - Start 成功时直接返回当前 FocusStatusResponse，便于前端用一次请求初始化 UI。
// =============================================================
// 新增的作用：
//   - 统一错误返回格式，前端可以通过 error 字段统一处理提示文案。
//   - 防止重复启动专注会话，保证后端同一时间只有一个有效 session。
//   - 减少前端一次额外的 /status 请求，降低潜在 race condition 和网络开销。
// =============================================================
// 新增的结构变化：
//   - Start() 在启动前会调用 FocusSessionService.IsRunning() 判断占用状态。
//   - Start() 的返回从简单的 Ok() 变为 Ok(FocusStatusResponse)。
//   - Stop() 和 Status() 接口保持不变，用于手动结束与轮询状态。
// =============================================================

using CapstoneBackend.Models;
using CapstoneBackend.Services;
using Microsoft.AspNetCore.Mvc;

namespace CapstoneBackend.Controllers;

[ApiController]
[Route("api/[controller]")]
public class FocusController : ControllerBase
{
    private readonly FocusSessionService _focusService;

    public FocusController(FocusSessionService focusService)
    {
        _focusService = focusService;
    }

    // 前端点击 Start 时调用：传入专注时长 + 白名单
    [HttpPost("start")]
    public IActionResult Start([FromBody] StartFocusRequest request)
    {
        // 新增：对请求体做基础校验，并统一返回 JSON 结构的错误信息，便于前端解析。
        if (request.DurationSeconds <= 0)
            return BadRequest(new { error = "DurationSeconds must be > 0" });

        if (request.AllowedProcesses == null || request.AllowedProcesses.Count == 0)
            return BadRequest(new { error = "AllowedProcesses cannot be empty" });

        // 新增：如果当前已有一个专注会话在运行，则返回 409 Conflict，避免重复启动。
        if (_focusService.IsRunning())
            return Conflict(new { error = "A focus session is already running" });

        // 原有逻辑：启动专注会话
        _focusService.StartSession(request);

        // 新增：直接返回当前后端状态（FocusStatusResponse），
        //       让前端在收到 200 时就能拿到 remainingSeconds 等信息，无需立刻再调 /status。
        var status = _focusService.GetStatus();
        return Ok(status);
    }

    // 前端点击 Stop 时调用：手动结束当前专注
    // 11/18/25 优化选项：添加isRunning检测 防止误触stop时也会返回结果（未实装）
    [HttpPost("stop")]
    public IActionResult Stop()
    {
        _focusService.StopSession();
        return Ok();
    }

    // 前端每秒轮询，获取当前状态（是否违规、是否失败等）
    [HttpGet("status")]
    public ActionResult<FocusStatusResponse> Status()
    {
        var status = _focusService.GetStatus();
        return Ok(status);
    }
}
