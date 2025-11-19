//2025/11/17 created by Zikai
// =============================================================
// 文件：UserProfile.cs
// 作用：定义用户的总体专注统计信息模型，存储在本地 JSON 文件中。
// 结构：
//   - TotalFocusSeconds: 累计专注时长（秒）
//   - TotalSessions:     总会话数
//   - SuccessfulSessions:成功会话数
//   - FailedSessions:    失败会话数
//   - CanceledSessions:  取消会话数（用户手动停止的次数）
// =============================================================

namespace CapstoneBackend.Models;

public class UserProfile
{
    /// <summary>累计专注时长（秒）。包含成功、失败、手动结束的所有专注时间。</summary>
    public long TotalFocusSeconds { get; set; }

    /// <summary>总会话数（成功 + 失败 + 手动结束）。</summary>
    public int TotalSessions { get; set; }

    /// <summary>成功会话数。</summary>
    public int SuccessfulSessions { get; set; }

    /// <summary>失败会话数。</summary>
    public int FailedSessions { get; set; }

    /// <summary>
    /// 取消会话数：用户主动点击“停止专注”（Aborted）的次数。
    /// 这些会话会计入 TotalSessions，但不算成功/失败。
    /// </summary>
    public int CanceledSessions { get; set; }
}
