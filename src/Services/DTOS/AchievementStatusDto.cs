// 2026/03/04 created by Darren (Chengyuan Wen)
// =============================================================
// 文件：AchievementDtos.cs
// 作用：定义成就系统对外返回给前端的 DTO（数据传输对象）。
// 结构：
//   - AchievementStatusDto: 单个成就的状态（Definition + 用户进度 + 解锁信息）
// 字段说明：
//   - Id/Title/Desc/Type/Target: 成就定义信息（来自 achievements.json）
//   - Progress: 当前进度值
//   - Unlocked: 是否已解锁
//   - UnlockedAt: 解锁时间（UTC；未解锁为 null）
// =============================================================


namespace CapstoneBackend.Services.Dtos;

public class AchievementStatusDto
{
    public string Id { get; set; } = "";
    public string Title { get; set; } = "";
    public string Desc { get; set; } = "";
    public string Type { get; set; } = "";
    public int Target { get; set; }

    public int Progress { get; set; }
    public bool Unlocked { get; set; }
    public DateTimeOffset? UnlockedAt { get; set; }
}