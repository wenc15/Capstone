// 2026/01/21 created by Zikai Lu
// =============================================================
// 文件：InventoryController.cs
// 作用：提供背包（Inventory）相关的 HTTP 接口，供前端查询与增减物品。
// 结构：
//   - GET  /api/inventory          查询背包全部物品
//   - POST /api/inventory/add      增加指定物品数量
//   - POST /api/inventory/consume  消耗指定物品数量（库存不足返回 400）
// 依赖：LocalDataService 中的 GetInventory() / AddInventoryItem() / TryConsumeInventoryItem()。
// =============================================================

using CapstoneBackend.Models;
using CapstoneBackend.Services;
using Microsoft.AspNetCore.Mvc;

namespace CapstoneBackend.Controllers;

[ApiController]
[Route("api/[controller]")]
public class InventoryController : ControllerBase
{
    private readonly LocalDataService _dataService;

    public InventoryController(LocalDataService dataService)
    {
        _dataService = dataService;
    }

    /// <summary>
    /// 查询背包全部物品及其数量。
    /// 路径：GET /api/inventory
    /// </summary>
    [HttpGet]
    public ActionResult<InventoryResponse> GetInventory()
    {
        var items = _dataService.GetInventory();
        return Ok(new InventoryResponse { Items = items });
    }

    /// <summary>
    /// 增加指定物品数量。
    /// 路径：POST /api/inventory/add
    /// 请求体：{ "itemId": "testObject1", "amount": 2 }
    /// </summary>
    [HttpPost("add")]
    public ActionResult<InventoryResponse> AddInventoryItem([FromBody] InventoryAmountRequest request)
    {
        if (request == null || string.IsNullOrWhiteSpace(request.ItemId) || request.Amount <= 0)
        {
            return BadRequest(new { message = "itemId must be non-empty and amount must be a positive integer." });
        }

        _dataService.AddInventoryItem(request.ItemId, request.Amount);
        var items = _dataService.GetInventory();
        return Ok(new InventoryResponse { Items = items });
    }

    /// <summary>
    /// 消耗指定物品数量。
    /// 路径：POST /api/inventory/consume
    /// 请求体：{ "itemId": "testObject1", "amount": 1 }
    /// </summary>
    [HttpPost("consume")]
    public ActionResult<InventoryResponse> ConsumeInventoryItem([FromBody] InventoryAmountRequest request)
    {
        if (request == null || string.IsNullOrWhiteSpace(request.ItemId) || request.Amount <= 0)
        {
            return BadRequest(new { message = "itemId must be non-empty and amount must be a positive integer." });
        }

        var success = _dataService.TryConsumeInventoryItem(request.ItemId, request.Amount, out var current);
        if (!success)
        {
            return BadRequest(new { message = "insufficient inventory.", currentCount = current });
        }

        var items = _dataService.GetInventory();
        return Ok(new InventoryResponse { Items = items });
    }
}
