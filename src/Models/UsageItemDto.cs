// 2025/11/27 created by wenc15
// 内容：
//   - 定义 UsageItemDto，用于接收来自 Chrome 扩展的网页使用 JSON 数据。
//   - 属性与 background.js 中 sendUsageToBackend(data) 发送的字段一一对应。
// =============================================================
// 作用：
//   - 作为 POST /api/usage 的请求体模型（DTO）。
//   - 在 UsageController 中将其转换为 WebsiteUsage 实体并写入 SQLite（growin.db）。
// =============================================================
// 结构：
//   - 文件：Models/UsageItemDto.cs
//   - 依赖：System 命名空间（DateTime）。
//   - 使用方式：UsageController.Post([FromBody] List<UsageItemDto> items)
// =============================================================

using System;

namespace CapstoneBackend.Models;

public class UsageItemDto
{
    // 完整 URL（例如 https://github.com/wenc15/Capstone）
    // 对应 JS 中 data.url
    public string Url { get; set; } = "";

    // 域名（例如 github.com）
    // 对应 JS 中 data.domain
    public string Domain { get; set; } = "";

    // 页面标题
    // 对应 JS 中 data.title
    public string Title { get; set; } = "";

    // 页面图标（favicon）的 URL
    // 对应 JS 中 data.icon
    public string Icon { get; set; } = "";

    // 本次访问的开始时间
    // 对应 JS 中 data.startTime（ISO 字符串 → 反序列化为 DateTime）
    public DateTime StartTime { get; set; }

    // 本次访问的结束时间
    // 对应 JS 中 data.endTime
    public DateTime EndTime { get; set; }

    // 持续时长（单位：秒）
    // 对应 JS 中 data.duration
    public int Duration { get; set; }

    // 可选：用户标识，当前可以为空，后端在保存时默认填 "local"
    public string? UserId { get; set; }
}
