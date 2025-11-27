// 2025/11/27 created by wenc15
// 内容：
//   - 定义 WebsiteUsage 模型，用于保存「单次网页使用时间片段」的数据。
//   - 字段包含 URL、域名、标题、图标、开始/结束时间（UTC）以及持续时长等信息。
// =============================================================
// 作用：
//   - 作为 EF Core 实体映射到 SQLite（growin.db）中的 WebsiteUsages 表。
//   - 为 UsageController 提供持久化结构，用于统计每日各网站使用总时长。
//   - 将来自 Chrome 扩展的原始使用记录进行规范化存储，方便后续查询和聚合。
// =============================================================
// 结构：
//   - 文件：Models/WebsiteUsage.cs
//   - 主要字段：Id, Url, Domain, Title, Icon, StartTimeUtc, EndTimeUtc, DurationSeconds, UserId。
//   - 典型用法：_db.WebsiteUsages.Add(...); _db.WebsiteUsages.Where(...).ToListAsync();
// =============================================================

using System;

namespace CapstoneBackend.Models
{
    /// <summary>
    /// WebsiteUsage 表示一次网页使用的「时间片段」记录。
    /// 例如：用户从 10:00 打开 github.com，到 10:05 离开，持续 300 秒。
    /// </summary>
    public class WebsiteUsage
    {
        /// <summary>
        /// 主键 ID，自增。
        /// </summary>
        public int Id { get; set; }

        /// <summary>
        /// 完整 URL，例如：https://github.com/wenc15/Capstone
        /// </summary>
        public string Url { get; set; } = "";

        /// <summary>
        /// 域名部分，例如：github.com
        /// 用于统计「按网站」聚合使用时长。
        /// </summary>
        public string Domain { get; set; } = "";

        /// <summary>
        /// 页面标题（可选，来自浏览器 tab 的 title）。
        /// </summary>
        public string Title { get; set; } = "";

        /// <summary>
        /// 页面图标 URL（favicon，可选，用于前端展示）。
        /// </summary>
        public string Icon { get; set; } = "";

        /// <summary>
        /// 本次访问开始时间（UTC）。
        /// 从扩展发送的 startTime 转为 UTC 存储。
        /// </summary>
        public DateTime StartTimeUtc { get; set; }

        /// <summary>
        /// 本次访问结束时间（UTC）。
        /// 从扩展发送的 endTime 转为 UTC 存储。
        /// </summary>
        public DateTime EndTimeUtc { get; set; }

        /// <summary>
        /// 本次访问持续的总时长（单位：秒）。
        /// </summary>
        public int DurationSeconds { get; set; }

        /// <summary>
        /// 用户标识（目前可以先写死为 "local"）。
        /// 如果以后支持多用户 / 多配置，可以用来区分不同 profile。
        /// </summary>
        public string UserId { get; set; } = "local";
    }
}
