// 2026/01/27 edited by Zikai Lu
// 新增内容：
//   - 在 POST /api/usage 中联动 FocusSessionService。
// 新增的作用：
//   - 用网站使用上报触发白名单违规判断。
// =============================================================

// 2025/11/27 created by wenc15
// 内容：
//   - 新增 UsageController 处理网页使用记录相关 API。
//   - 提供：
//       POST /api/usage       → 由 Chrome 扩展上报使用记录。
//       GET  /api/usage/today → 前端查询「今日各网站累计使用时长」。
// =============================================================
// 作用：
//   - 打通：Chrome 扩展 → 后端 → SQLite(growin.db) → 前端统计页 的完整链路。
//   - 为 stats 页面提供按域名聚合的使用时长数据源。
// =============================================================
// 结构：
//   - 文件：Controllers/UsageController.cs
//   - 依赖：AppDbContext, WebsiteUsage, UsageItemDto。
// =============================================================

using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using CapstoneBackend.Data;
using CapstoneBackend.Models;
using CapstoneBackend.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CapstoneBackend.Controllers;

[ApiController]
[Route("api/[controller]")] // => /api/usage
public class UsageController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly ILogger<UsageController> _logger;
    private readonly FocusSessionService _focusService;

    public UsageController(AppDbContext db, ILogger<UsageController> logger, FocusSessionService focusService)
    {
        _db = db;
        _logger = logger;
        _focusService = focusService;
    }

    // ---------------------------------------------------------
    // POST /api/usage
    // 用途：
    //   - 由 Chrome 扩展 background.js 调用。
    //   - 一次提交一个或多个 UsageItemDto（列表）。
    //   - 请求体示例：
    //     [
    //       {
    //         "url": "...",
    //         "domain": "github.com",
    //         "title": "GitHub",
    //         "icon": "...",
    //         "startTime": "2025-11-27T10:00:00.000Z",
    //         "endTime": "2025-11-27T10:05:00.000Z",
    //         "duration": 300
    //       }
    //     ]
    // ---------------------------------------------------------
    [HttpPost]
    public async Task<IActionResult> Post([FromBody] List<UsageItemDto> items)
    {
        if (items == null || items.Count == 0)
        {
            return BadRequest(new { error = "Usage list cannot be empty" });
        }

        foreach (var item in items)
        {
            // 简单过滤一下明显无效的数据
            if (string.IsNullOrWhiteSpace(item.Url) || item.Duration <= 0)
            {
                _logger.LogWarning("Skip invalid usage item: {@Item}", item);
                continue;
            }

            // DTO → 实体模型 WebsiteUsage
            var usage = new WebsiteUsage
            {
                Url = item.Url,
                Domain = item.Domain ?? "",
                Title = item.Title ?? "",
                Icon = item.Icon ?? "",
                StartTimeUtc = item.StartTime.ToUniversalTime(),
                EndTimeUtc = item.EndTime.ToUniversalTime(),
                DurationSeconds = item.Duration,
                UserId = item.UserId ?? "local"
            };

            _focusService.ReportWebsiteUsage(item.Domain, item.Url, item.Duration);
            _db.WebsiteUsages.Add(usage);
        }

        await _db.SaveChangesAsync();
        return Ok();
    }

    // ---------------------------------------------------------
    // GET /api/usage/today
    // 用途：
    //   - 前端查询「今日各网站累计使用时长」（按域名聚合）。
    //   - 返回示例：
    //     [
    //       { "domain": "github.com", "totalSeconds": 1800 },
    //       { "domain": "youtube.com", "totalSeconds": 600 }
    //     ]
    // ---------------------------------------------------------
    [HttpGet("today")]
    public async Task<ActionResult<IEnumerable<UsageSummaryDto>>> GetToday()
    {
        var nowUtc = DateTime.UtcNow;
        var dayStartUtc = nowUtc.Date;          // 今日 00:00（UTC）
        var dayEndUtc = dayStartUtc.AddDays(1); // 明日 00:00（UTC）

        var query = await _db.WebsiteUsages
            .Where(u => u.StartTimeUtc >= dayStartUtc && u.StartTimeUtc < dayEndUtc)
            .GroupBy(u => u.Domain)
            .Select(g => new UsageSummaryDto
            {
                Domain = g.Key,
                TotalSeconds = g.Sum(x => x.DurationSeconds)
            })
            .OrderByDescending(x => x.TotalSeconds)
            .ToListAsync();

        return Ok(query);
    }
}

/// <summary>
/// UsageSummaryDto 用于对前端返回「按域名聚合后的总时长」。
/// </summary>
public class UsageSummaryDto
{
    // 域名，例如 github.com
    public string Domain { get; set; } = "";

    // 总时长（秒），前端可以再转换为分钟 / 小时显示
    public int TotalSeconds { get; set; }
}
