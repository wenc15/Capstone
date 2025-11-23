//2025/11/17 created by Zikai
// =============================================================
// 文件：WhitelistPresetsController.cs
// 作用：为前端提供对白名单预设的增/查/删接口。
// 路由：
//   - GET    /api/whitelistpresets        获取全部预设
//   - POST   /api/whitelistpresets        保存（新建或更新）预设
//   - DELETE /api/whitelistpresets/{id}   删除指定预设
// 结构：
//   - 构造函数注入 LocalDataService
//   - GetAll(): 返回 List<WhitelistPreset>
//   - Save(): 保存当前白名单为预设
//   - Delete(id): 删除预设（你刚刚提到的删除接口在这里）
// =============================================================

using System.Collections.Generic;
using CapstoneBackend.Models;
using CapstoneBackend.Services;
using Microsoft.AspNetCore.Mvc;

namespace CapstoneBackend.Controllers;

[ApiController]
[Route("api/[controller]")]
public class WhitelistPresetsController : ControllerBase
{
    private readonly LocalDataService _dataService;

    public WhitelistPresetsController(LocalDataService dataService)
    {
        _dataService = dataService;
    }

    [HttpGet]
    public ActionResult<List<WhitelistPreset>> GetAll()
    {
        var presets = _dataService.GetWhitelistPresets();
        return Ok(presets);
    }

    [HttpPost]
    public ActionResult<WhitelistPreset> Save([FromBody] SaveWhitelistPresetRequest request)
    {
        request.AllowedProcesses ??= new List<string>();
        request.AllowedWebsites ??= new List<string>();

        var result = _dataService.SaveWhitelistPreset(request);
        return Ok(result);
    }

    /// <summary>
    /// 删除一个白名单预设。前端调用示例：
    /// DELETE /api/whitelistpresets/{id}
    /// </summary>
    [HttpDelete("{id}")]
    public IActionResult Delete(string id)
    {
        var removed = _dataService.DeleteWhitelistPreset(id);
        if (!removed)
            return NotFound();

        return NoContent();
    }
}
