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
        /// 返回所有历史会话记录。
        /// </summary>
        [HttpGet("history")]
        public ActionResult<List<SessionHistoryItem>> Get()
        {
            var list = _data.GetSessionHistory();
            return Ok(list);
        }
    }
}
