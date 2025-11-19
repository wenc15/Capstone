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

//2025/11/17 edited by Zikai
//新增用户profile和预设白名单相关支持
// =============================================================
// 文件：Program.cs
// 作用：ASP.NET Core 最小主机启动文件，负责注册服务和中间件。
// 结构：
//   - 注册控制器、Swagger
//   - 注册 LocalDataService、FocusSessionService（依赖注入）
//   - 配置 HTTPS 重定向、路由映射
// =============================================================

using CapstoneBackend.Services;

var builder = WebApplication.CreateBuilder(args);

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