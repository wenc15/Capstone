// 2025/11/19 edited by 京华昼梦
// 新增内容：
//   - 增加 SessionHistoryFilePath，用于存储所有专注会话的详细历史记录。
// =============================================================
// 新增的作用：
//   - 为 LocalDataService 提供统一的历史记录 JSON 文件路径。
//   - 与 user_profile.json、whitelist_presets.json 一致，保持数据文件结构清晰。
// =============================================================
// 新增的结构变化：
//   - LocalStoragePaths 增加新字段 SessionHistoryFilePath。
//   - 所有历史会话的记录将写入 %AppData%/Growin/session_history.json。
// =============================================================

//2025/11/17 created by Zikai
// =============================================================
// 文件：LocalStoragePaths.cs
// 作用：统一管理本地 JSON 数据的路径，确保在不同环境下路径一致。
// 结构：
//   - BaseDirectory: 应用根目录（%AppData%/Growin）
//   - UserProfileFilePath: 用户 profile JSON 文件路径
//   - WhitelistPresetsFilePath: 白名单预设 JSON 文件路径
//   - EnsureBaseDirectory(): 确保根目录存在
// =============================================================

using System;
using System.IO;

namespace CapstoneBackend.Utils;

public static class LocalStoragePaths
{
    /// <summary>
    /// Growin 的根目录，例如：
    /// C:\Users\xxx\AppData\Roaming\Growin
    /// </summary>
    public static string BaseDirectory { get; } =
        Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "Growin");

    /// <summary>用户 profile 文件路径：user_profile.json</summary>
    public static string UserProfileFilePath =>
        Path.Combine(BaseDirectory, "user_profile.json");

    /// <summary>白名单预设文件路径：whitelist_presets.json</summary>
    public static string WhitelistPresetsFilePath =>
        Path.Combine(BaseDirectory, "whitelist_presets.json");

    /// <summary>专注会话历史文件路径：session_history.json</summary>
    public static string SessionHistoryFilePath =>
        Path.Combine(BaseDirectory, "session_history.json");


    /// <summary>
    /// 确保 BaseDirectory 存在（不存在时自动创建）。
    /// 在任何读写文件之前都应该调用一次。
    /// </summary>
    public static void EnsureBaseDirectory()
    {
        if (!Directory.Exists(BaseDirectory))
        {
            Directory.CreateDirectory(BaseDirectory);
        }
    }
}
