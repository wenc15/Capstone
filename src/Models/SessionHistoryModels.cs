// 2026/03/16 created by Zikai Lu
// 新增内容：
//   - 定义 SessionHistory 的查询响应模型（明细 + 按日汇总）。
// 新增的作用：
//   - 让前端直接拿到可读时间与日期分组统计，减少前端二次处理。
// =============================================================

using System;
using System.Collections.Generic;

namespace CapstoneBackend.Models;

public class SessionHistoryRecordView
{
    public long Ts { get; set; }
    public string Time { get; set; } = string.Empty;
    public string Date { get; set; } = string.Empty;
    public int Minutes { get; set; }
    public string? Note { get; set; }
    public string Outcome { get; set; } = "success";
}

public class SessionHistoryRecordsResponse
{
    public List<SessionHistoryRecordView> Items { get; set; } = new();
}

public class SessionHistoryDailySummaryItem
{
    public string Date { get; set; } = string.Empty;
    public int Sessions { get; set; }
    public int TotalMinutes { get; set; }
    public int Success { get; set; }
    public int Failed { get; set; }
    public int Aborted { get; set; }
}

public class SessionHistoryDailySummaryResponse
{
    public List<SessionHistoryDailySummaryItem> Daily { get; set; } = new();
}

public class LocalArchiveExportData
{
    public int SchemaVersion { get; set; } = 1;
    public DateTimeOffset ExportedAt { get; set; } = DateTimeOffset.UtcNow;
    public UserProfile UserProfile { get; set; } = new();
    public List<SessionHistoryItem> SessionHistory { get; set; } = new();
    public List<WhitelistPreset> WhitelistPresets { get; set; } = new();
}

public class LocalArchiveImportResult
{
    public int SchemaVersion { get; set; }
    public int SessionHistoryCount { get; set; }
    public int WhitelistPresetCount { get; set; }
    public DateTimeOffset ImportedAt { get; set; } = DateTimeOffset.UtcNow;
}
