//2025/11/17 created by Zikai
// =============================================================
// 文件：WhitelistPresetModels.cs
// 作用：定义白名单预设的数据结构以及保存预设的请求模型。
// 结构：
//   - WhitelistPreset: 单个预设（Id, Name, 应用列表, 网站列表, 时间戳）
//   - SaveWhitelistPresetRequest: 前端保存预设时的请求体
// =============================================================

using System;
using System.Collections.Generic;

namespace CapstoneBackend.Models;

public class WhitelistPreset
{
    /// <summary>预设的唯一 Id，使用 Guid 字符串便于前后端传递。</summary>
    public string Id { get; set; } = Guid.NewGuid().ToString("N");

    /// <summary>预设名称（用户指定，可有默认名）。</summary>
    public string Name { get; set; } = string.Empty;

    /// <summary>白名单应用列表，例如 ["chrome.exe", "word.exe"]。</summary>
    public List<string> AllowedProcesses { get; set; } = new();

    /// <summary>白名单网站列表，例如 ["https://google.com", "github.com"]。</summary>
    public List<string> AllowedWebsites { get; set; } = new();

    /// <summary>创建时间（仅用于显示/排序）。</summary>
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    /// <summary>最后一次修改时间。</summary>
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>
/// 前端保存预设时使用的请求模型。
/// </summary>
public class SaveWhitelistPresetRequest
{
    /// <summary>
    /// 可选：如果传 Id，则视为“更新已有预设”；不传则创建新预设。
    /// </summary>
    public string? Id { get; set; }

    /// <summary>预设名称。允许前端传空，后端会生成一个默认名字。</summary>
    public string? Name { get; set; }

    /// <summary>白名单应用列表。</summary>
    public List<string> AllowedProcesses { get; set; } = new();

    /// <summary>白名单网站列表。</summary>
    public List<string> AllowedWebsites { get; set; } = new();
}
