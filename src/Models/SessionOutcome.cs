//2025/11/17 created by Zikai
// =============================================================
// 文件：SessionOutcome.cs
// 作用：枚举一次专注会话的结果状态，用于统计用户 Profile。
// 结构：
//   - Success: 自然成功结束
//   - Failed: 因违规等原因失败
//   - Aborted: 用户手动结束
// =============================================================

namespace CapstoneBackend.Models;

public enum SessionOutcome
{
    Success = 0,
    Failed = 1,
    Aborted = 2
}
