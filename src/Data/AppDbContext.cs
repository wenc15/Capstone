// 2025/11/27 created by wenc15
// 内容：
//   - 定义 EF Core 数据库上下文 AppDbContext。
//   - 负责将 WebsiteUsage 等模型映射到 SQLite 数据库（growin.db）。
// =============================================================
// 作用：
//   - 为后端提供统一的数据访问入口（_db.WebsiteUsages...）。
//   - 配合 Program.cs 中的 AddDbContext<AppDbContext>() 与 EnsureCreated()，
//     在应用启动时自动创建数据库和表结构。
// =============================================================
// 结构：
//   - 文件：Data/AppDbContext.cs
//   - 命名空间：CapstoneBackend.Data
//   - 主要成员：DbSet<WebsiteUsage> WebsiteUsages
//   - 典型用法：在 Controller 中通过构造函数注入 AppDbContext，然后使用 _db.WebsiteUsages 增删改查。
// =============================================================

using CapstoneBackend.Models;
using Microsoft.EntityFrameworkCore;

namespace CapstoneBackend.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options)
        : base(options)
    {
    }

    /// <summary>
    /// 网站使用记录集合，对应数据库表 WebsiteUsages。
    /// 通过 _db.WebsiteUsages 进行增删改查。
    /// </summary>
    public DbSet<WebsiteUsage> WebsiteUsages { get; set; } = null!;
}
