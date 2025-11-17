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

// 注册 Controller
builder.Services.AddControllers();

// swagger
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// 注册本地数据服务（Profile、白名单预设等）
builder.Services.AddSingleton<LocalDataService>();

// 注册专注会话服务
builder.Services.AddSingleton<FocusSessionService>();

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseHttpsRedirection();

app.MapControllers();

app.Run();
