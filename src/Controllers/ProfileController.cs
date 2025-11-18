//2025/11/17 created by Zikai
// =============================================================
// 文件：ProfileController.cs
// 作用：提供前端读取用户 Profile 的 API。
// 路由：GET /api/profile
// 结构：
//   - 构造函数注入 LocalDataService
//   - GetProfile(): 返回 UserProfile JSON
// =============================================================

using CapstoneBackend.Models;
using CapstoneBackend.Services;
using Microsoft.AspNetCore.Mvc;

namespace CapstoneBackend.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ProfileController : ControllerBase
{
    private readonly LocalDataService _dataService;

    public ProfileController(LocalDataService dataService)
    {
        _dataService = dataService;
    }

    [HttpGet]
    public ActionResult<UserProfile> GetProfile()
    {
        var profile = _dataService.GetUserProfile();
        return Ok(profile);
    }
}