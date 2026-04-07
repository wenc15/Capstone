// 2025/11/27 edited by wenc15
// 新增内容：
//   - 注册 AppDbContext（EF Core + SQLite），用于存储 WebsiteUsage 网站使用记录。
//   - 在应用启动时通过 EnsureCreated() 自动创建 growin.db 及 WebsiteUsages 表结构。
//   - 为 UsageController 提供数据库访问支持（/api/Usage, /api/Usage/today）。
// =============================================================
// 作用补充：
//   - 在原有 LocalDataService + FocusSessionService 的基础上，新增一套「网站使用统计」数据通路。
//   - JSON 本地存储（UserProfile、SessionHistory、Whitelist）与 SQLite 数据库存储（WebsiteUsage）并存，职责清晰。
// =============================================================
//
// 2025/11/18 edited by 京华昼梦
// 新增内容：
//   - 补全 Program.cs 的最小主机构建代码，注册 Controller 与 Swagger。
//   - 注册 LocalDataService 与 FocusSessionService 为单例服务，统一管理本地数据与专注会话状态。
//   - 新增开发环境 CORS 策略，允许本地前端（浏览器 / Electron）访问 API。
// =============================================================
// 新增的作用：
//   - 确保 FocusSessionService 以 Singleton 形式存在，前后端共享同一个会话状态。
//   - 提供基础的 API 启动管线（Controller + Swagger），方便前端与 Postman 联调。
//   - 避免前端在本地调试时遇到跨域（CORS）错误，提高联调效率。
// =============================================================
// 新增的结构变化：
//   - 在 WebApplicationBuilder 上注册 AddControllers / AddEndpointsApiExplorer / AddSwaggerGen。
//   - 在 DI 容器中新增 LocalDataService、FocusSessionService 的 Singleton 注册。
//   - 新增名为 DevCorsPolicy 的 CORS 策略，并在管线中通过 app.UseCors() 启用。
// =============================================================
//
// 2025/11/17 edited by Zikai
// 新增用户 profile 和预设白名单相关支持
// =============================================================
// 文件：Program.cs
// 作用：ASP.NET Core 最小主机启动文件，负责注册服务和中间件。
// 结构：
//   - 注册控制器、Swagger
//   - 注册 LocalDataService、FocusSessionService（依赖注入）
//   - 注册 AppDbContext（EF Core + SQLite，用于 WebsiteUsage）
//   - 配置 HTTPS 重定向、CORS、路由映射
// =============================================================

using CapstoneBackend.Services;
using CapstoneBackend.Data;
using CapstoneBackend.Models;
using Microsoft.EntityFrameworkCore;
using System.Linq;
using System.Text.Json;

var builder = WebApplication.CreateBuilder(args);
builder.WebHost.UseUrls("http://localhost:5024");

// -------------------------------------------------------------
// 服务注册（依赖注入）
// -------------------------------------------------------------

// 注册 MVC Controller 支持
builder.Services.AddControllers();

// 注册 Swagger（仅用于开发环境调试 API）
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// 注册本地数据服务（UserProfile、白名单预设等）
builder.Services.AddSingleton<LocalDataService>();

// 注册专注会话服务（负责计时与前台进程检测）
// 作为 Singleton，确保整个应用只有一个会话状态源。
builder.Services.AddSingleton<FocusSessionService>();

// 注册抽卡服务（Food Gacha System）
// Scoped：每个 HTTP 请求一个实例，适合依赖 DbContext 的服务
builder.Services.AddScoped<IFoodGachaService, FoodGachaService>();

// 注册 EF Core + SQLite 数据库上下文（用于存储网站使用记录等）
builder.Services.AddDbContext<AppDbContext>(options =>
{
    options.UseSqlite("Data Source=growin.db");
});

// 注册成就系统服务（Achievements）
// 作为 Singleton：
//   - 成就定义（achievements.json）可以被缓存，避免每次请求都读文件
//   - 成就状态依赖 LocalDataService（同为 Singleton），保持一致的本地数据读写与线程安全
builder.Services.AddSingleton<AchievementService>();

// 注册皮肤目录服务（从 skins.json 读取并缓存）
builder.Services.AddSingleton<SkinCatalogService>();

// 注册 Skin Pool 抽卡服务
builder.Services.AddScoped<ISkinGachaService, SkinGachaService>();


// 配置 CORS：开发阶段允许本地前端自由访问
// 注意：这是开发环境用的“全开放”策略，后期如果要上线可以收紧域名。
var corsPolicyName = "DevCorsPolicy";
builder.Services.AddCors(options =>
{
    options.AddPolicy(name: corsPolicyName, policy =>
    {
        policy
            .AllowAnyOrigin()  // 允许任意 Origin（本地浏览器、Electron 等）
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
});

var app = builder.Build();

// 应用启动时自动创建数据库（如果不存在）
// 方便开发阶段使用，无需手动跑迁移。
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.EnsureCreated();

    // -------------------------------------------------------------
    // Seed/Sync FoodDefinitions from Data/foods.json (dev-friendly, no hardcode)
    // -------------------------------------------------------------
    var foodsPath = Path.Combine(app.Environment.ContentRootPath, "Data", "foods.json");

    if (File.Exists(foodsPath))
    {
        var json = File.ReadAllText(foodsPath);

        var options = new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true
        };

        var foods = JsonSerializer.Deserialize<List<FoodDefinition>>(json, options) ?? new();

        // remove empty ids + dedupe by FoodId (case-insensitive)
        var normalized = foods
            .Where(f => !string.IsNullOrWhiteSpace(f.FoodId))
            .GroupBy(f => f.FoodId.Trim(), StringComparer.OrdinalIgnoreCase)
            .Select(g => g.First())
            .ToList();

        // Upsert by FoodId
        var existing = await db.FoodDefinitions
            .ToDictionaryAsync(f => f.FoodId, StringComparer.OrdinalIgnoreCase);

        foreach (var f in normalized)
        {
            var key = f.FoodId.Trim();

            if (existing.TryGetValue(key, out var row))
            {
                row.Name = f.Name ?? "";
                row.Rarity = f.Rarity;
                row.ExpValue = f.ExpValue;
                row.ImageKey = f.ImageKey;
                row.IsEnabled = f.IsEnabled;
            }
            else
            {
                db.FoodDefinitions.Add(new FoodDefinition
                {
                    FoodId = key,
                    Name = f.Name ?? "",
                    Rarity = f.Rarity,
                    ExpValue = f.ExpValue,
                    ImageKey = f.ImageKey,
                    IsEnabled = f.IsEnabled
                });
            }
        }

        var normalizedIds = normalized
            .Select(f => f.FoodId.Trim())
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        foreach (var row in existing.Values)
        {
            if (!normalizedIds.Contains(row.FoodId))
            {
                row.IsEnabled = false;
            }
        }

        await db.SaveChangesAsync();
    }
    else
    {
        Console.WriteLine($"[FoodGacha] foods.json not found at: {foodsPath}");
    }
}

// -------------------------------------------------------------
// 中间件管线配置
// -------------------------------------------------------------

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

// 如不需要强制 https，可以视情况移除这一行；目前保留模板行为
app.UseHttpsRedirection();

// 启用前面定义的 CORS 策略（要放在 MapControllers 之前）
app.UseCors(corsPolicyName);

// 映射 Controller 路由
app.MapControllers();

app.Run();

public partial class Program { }
