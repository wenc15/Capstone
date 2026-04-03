// 2026/03/04 created by Darren (Chengyuan Wen)
// =============================================================
// 文件：AchievementsController.cs
// 作用：提供成就系统（Achievements）的 HTTP API 接口，供前端查询成就状态。
// 结构：
//   - GET /api/achievements
//      返回所有成就的状态（进度、是否解锁、解锁时间等），并在查询时触发自动解锁逻辑。
//
// 依赖：
//   - AchievementService：成就业务逻辑（读取配置、计算进度、自动解锁）
//
// 说明：
//   - Controller 尽量保持轻量：只处理 HTTP 输入/输出，将业务规则交给 Service。
// =============================================================


using CapstoneBackend.Services;
using Microsoft.AspNetCore.Mvc;

namespace CapstoneBackend.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AchievementsController : ControllerBase
{
    public sealed class AchievementCounterIncrementRequest
    {
        public string Type { get; set; } = string.Empty;
        public int Delta { get; set; } = 1;
    }

    public sealed class AchievementCounterMaxRequest
    {
        public string Type { get; set; } = string.Empty;
        public int Value { get; set; }
    }

    private readonly AchievementService _service;

    public AchievementsController(AchievementService service)
    {
        _service = service;
    }

    [HttpGet]
    public ActionResult GetAll()
    {
        var list = _service.GetStatusesAndAutoUnlock();
        return Ok(new { achievements = list });
    }

    [HttpPost("counter/increment")]
    public ActionResult IncrementCounter([FromBody] AchievementCounterIncrementRequest request)
    {
        if (request == null || string.IsNullOrWhiteSpace(request.Type) || request.Delta <= 0)
            return BadRequest(new { message = "type and positive delta are required." });

        _service.IncrementCounter(request.Type.Trim(), request.Delta);
        return Ok(new { ok = true });
    }

    [HttpPost("counter/max")]
    public ActionResult UpdateCounterMax([FromBody] AchievementCounterMaxRequest request)
    {
        if (request == null || string.IsNullOrWhiteSpace(request.Type) || request.Value < 0)
            return BadRequest(new { message = "type and non-negative value are required." });

        _service.SetCounterMax(request.Type.Trim(), request.Value);
        return Ok(new { ok = true });
    }
}
