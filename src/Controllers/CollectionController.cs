// 2026/03/09 created by Zikai Lu
// =============================================================
// 文件：CollectionController.cs
// 作用：提供收藏品（Collection）相关接口，供前端查询与获取收藏品。
// 结构：
//   - GET  /api/collection           查询完整收藏品列表及拥有状态（0/1）
//   - POST /api/collection/acquire   获取指定收藏品（未拥有 -> 置 1；已拥有 -> 返回已拥有）
// 依赖：LocalDataService 中的 GetCollection() / TryAcquireCollectionItem()。
// =============================================================

using CapstoneBackend.Models;
using CapstoneBackend.Services;
using Microsoft.AspNetCore.Mvc;

namespace CapstoneBackend.Controllers;

[ApiController]
[Route("api/[controller]")]
public class CollectionController : ControllerBase
{
    private readonly LocalDataService _dataService;

    public CollectionController(LocalDataService dataService)
    {
        _dataService = dataService;
    }

    /// <summary>
    /// 查询完整收藏品列表（预设目录 + 拥有状态 0/1）。
    /// 路径：GET /api/collection
    /// </summary>
    [HttpGet]
    public ActionResult<CollectionQueryResponse> GetCollection()
    {
        var items = _dataService.GetCollection();
        return Ok(new CollectionQueryResponse { Items = items });
    }

    /// <summary>
    /// 获取指定收藏品：
    /// - 未拥有(0)时更新为已拥有(1)
    /// - 已拥有(1)时返回 alreadyOwned=true
    /// 路径：POST /api/collection/acquire
    /// 请求体：{ "itemId": "skin_cat_sakura" }
    /// </summary>
    [HttpPost("acquire")]
    public ActionResult<CollectionAcquireResponse> Acquire([FromBody] CollectionAcquireRequest request)
    {
        if (request == null || string.IsNullOrWhiteSpace(request.ItemId))
        {
            return BadRequest(new { message = "itemId must be non-empty." });
        }

        var ok = _dataService.TryAcquireCollectionItem(request.ItemId, out var alreadyOwned, out var state);
        if (!ok)
        {
            return NotFound(new { message = "collection item not found in preset catalog.", itemId = request.ItemId });
        }

        var response = new CollectionAcquireResponse
        {
            ItemId = request.ItemId,
            State = state,
            AlreadyOwned = alreadyOwned,
            Message = alreadyOwned ? "already owned" : "acquired",
        };

        return Ok(response);
    }
}
