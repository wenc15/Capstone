// 2026/03/16 edited by Zikai Lu
// 新增内容：
//   - GET /api/focus/history 适配新结构，返回 records-only（不含汇总）。
//   - 新增 GET /api/focus/history/summary，返回按日期聚合统计。
// 新增的作用：
//   - 前端可以直接显示可读时间明细与每日汇总。
// =============================================================

// 2025/11/19 created by 京华昼梦
// 新增内容：
//   - 新增 API GET /api/focus/history，用于向前端返回所有专注会话历史。
//   - 控制器依赖 LocalDataService.GetSessionHistory() 提供列表。
// =============================================================
// 新增的作用：
//   - 前端 stats.js 可以通过后端获取真实历史数据，而非本地 localStorage。
//   - 支持跨设备/版本持久化统计，而不是局限在浏览器缓存。
// =============================================================
// 新增的结构变化：
//   - Controllers 目录新增 FocusHistoryController。
//   - 新增路由：GET /api/focus/history，与前端保持一致。
// =============================================================

using System.Collections.Generic;
using CapstoneBackend.Models;
using CapstoneBackend.Services;
using Microsoft.AspNetCore.Mvc;

namespace CapstoneBackend.Controllers
{
    /// <summary>
    /// 提供前端读取专注会话历史的 API。
    /// 路由：GET /api/focus/history
    /// </summary>
    [ApiController]
    [Route("api/focus")]
    public class FocusHistoryController : ControllerBase
    {
        private readonly LocalDataService _data;

        public FocusHistoryController(LocalDataService data)
        {
            _data = data;
        }

        /// <summary>
        /// 返回所有历史会话记录（records-only，不含汇总）。
        /// </summary>
        [HttpGet("history")]
        public ActionResult<SessionHistoryRecordsResponse> Get()
        {
            var items = _data.GetSessionHistoryRecords();
            return Ok(new SessionHistoryRecordsResponse { Items = items });
        }

        /// <summary>
        /// 返回按日期聚合后的会话历史汇总。
        /// </summary>
        [HttpGet("history/summary")]
        public ActionResult<SessionHistoryDailySummaryResponse> GetSummary()
        {
            var daily = _data.GetSessionHistoryDailySummary();
            return Ok(new SessionHistoryDailySummaryResponse { Daily = daily });
        }
    }
}
