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
        if (request.DurationSeconds <= 0)
            return BadRequest("DurationSeconds must be > 0");

        if (request.AllowedProcesses == null || request.AllowedProcesses.Count == 0)
            return BadRequest("AllowedProcesses cannot be empty");

        _focusService.StartSession(request);
        return Ok();
    }

    // 前端点击 Stop 时调用：手动结束当前专注
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
