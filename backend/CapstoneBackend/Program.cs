using CapstoneBackend.Services;

var builder = WebApplication.CreateBuilder(args);

// 注册 Controller
builder.Services.AddControllers();

// swagger（可有可无，保留方便你以后在浏览器调试 API）
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// 注册我们写的专注服务
builder.Services.AddSingleton<FocusSessionService>();

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseHttpsRedirection();

// 映射控制器路由：这句非常关键，没有它会全部 404
app.MapControllers();

app.Run();
