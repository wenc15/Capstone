// 2026/03/04 created by Darren (Chengyuan Wen)
// =============================================================
// 文件：AchievementDefinition.cs
// 作用：定义成就（Achievements）的“配置模型”（Definition），用于从 achievements.json 读取成就配置。
// 结构：
//   - Id:     成就唯一标识（例如 "first_focus"）
//   - Title:  成就标题（前端展示）
//   - Desc:   成就描述（前端展示）
//   - Type:   成就进度类型（例如 "total_sessions" / "food_draws_total"）
//   - Target: 达成目标值（例如 10）
// 说明：
//   - 该模型只描述“成就是什么”，不包含用户是否解锁、进度等状态信息。
//   - 用户的解锁状态与进度由 UserProfile + AchievementService 负责维护。
// =============================================================


using System.Text.Json.Serialization;

namespace CapstoneBackend.Models;

public class AchievementDefinition
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = "";

    [JsonPropertyName("title")]
    public string Title { get; set; } = "";

    [JsonPropertyName("desc")]
    public string Desc { get; set; } = "";

    // e.g. "total_sessions", "food_draws_total"
    [JsonPropertyName("type")]
    public string Type { get; set; } = "";

    [JsonPropertyName("target")]
    public int Target { get; set; }
}