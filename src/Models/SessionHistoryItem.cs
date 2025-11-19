// 2025/11/19 created by 京华昼梦
// 内容：
//   - 定义 SessionHistoryItem 模型，用于保存单次专注会话的详细数据。
//   - 字段包括时间戳、分钟数、备注（note）与 outcome（success/failed/aborted）。
// =============================================================
// 作用：
//   - 提供标准化的数据结构供前端 stats.js 读取与可视化。
//   - 用 CamelCase JSON 命名（通过系统 JsonOptions 自动生成），无需前端额外转换。
// =============================================================
// 结构：
//   - Models 目录新增 SessionHistoryItem.cs。
//   - LocalDataService 和 FocusHistoryController 均依赖此模型读写历史数据。
// =============================================================

using System;

namespace CapstoneBackend.Models
{
    /// <summary>
    /// 单次专注会话的历史记录条目。
    /// 前端的 stats.js 会读取这些字段：
    ///   - ts: 时间戳（毫秒）
    ///   - minutes: 本次会话时长（分钟）
    ///   - note: 备注/白名单应用字符串
    ///   - outcome: 结果（success/failed/aborted）
    /// </summary>
    public class SessionHistoryItem
    {
        /// <summary>时间戳（毫秒），例如 DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()</summary>
        public long Ts { get; set; }

        /// <summary>本次会话时长（分钟）。</summary>
        public int Minutes { get; set; }

        /// <summary>备注 / 记录的应用，例如 "chrome.exe, Code.exe"</summary>
        public string? Note { get; set; }

        /// <summary>会话结果：success / failed / aborted</summary>
        public string Outcome { get; set; } = "success";
    }
}
