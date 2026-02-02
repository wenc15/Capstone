// 2026/01/21 created by Zikai Lu
// =============================================================
// 文件：PetGrowthController.cs
// 作用：提供宠物成长值相关的 HTTP 接口，供前端查询与增减。
// 结构：
//   - GET  /api/pets/{petId}/growth         查询指定宠物成长值
//   - POST /api/pets/{petId}/growth/add     增加指定宠物成长值
//   - POST /api/pets/{petId}/growth/consume 减少指定宠物成长值（最低为 0）
// 依赖：LocalDataService 中的 GetPetGrowth() / AddPetGrowth() / ConsumePetGrowth()。
// =============================================================

using CapstoneBackend.Models;
using CapstoneBackend.Services;
using Microsoft.AspNetCore.Mvc;

namespace CapstoneBackend.Controllers;

[ApiController]
[Route("api/pets/{petId:int}/growth")]
public class PetGrowthController : ControllerBase
{
    private readonly LocalDataService _dataService;

    public PetGrowthController(LocalDataService dataService)
    {
        _dataService = dataService;
    }

    /// <summary>
    /// 查询指定宠物成长值。
    /// 路径：GET /api/pets/{petId}/growth
    /// </summary>
    [HttpGet]
    public ActionResult<PetGrowthResponse> GetPetGrowth([FromRoute] int petId)
    {
        if (petId < 0)
        {
            return BadRequest(new { message = "petId must be a non-negative integer." });
        }

        var growth = _dataService.GetPetGrowth(petId);
        return Ok(new PetGrowthResponse { PetId = petId, Growth = growth });
    }

    /// <summary>
    /// 增加指定宠物成长值。
    /// 路径：POST /api/pets/{petId}/growth/add
    /// 请求体：{ "amount": 3 }
    /// </summary>
    [HttpPost("add")]
    public ActionResult<PetGrowthResponse> AddPetGrowth(
        [FromRoute] int petId,
        [FromBody] PetGrowthAmountRequest request)
    {
        if (petId < 0)
        {
            return BadRequest(new { message = "petId must be a non-negative integer." });
        }

        if (request == null || request.Amount <= 0)
        {
            return BadRequest(new { message = "amount must be a positive integer." });
        }

        var growth = _dataService.AddPetGrowth(petId, request.Amount);
        return Ok(new PetGrowthResponse { PetId = petId, Growth = growth });
    }

    /// <summary>
    /// 减少指定宠物成长值。
    /// 路径：POST /api/pets/{petId}/growth/consume
    /// 请求体：{ "amount": 2 }
    /// </summary>
    [HttpPost("consume")]
    public ActionResult<PetGrowthResponse> ConsumePetGrowth(
        [FromRoute] int petId,
        [FromBody] PetGrowthAmountRequest request)
    {
        if (petId < 0)
        {
            return BadRequest(new { message = "petId must be a non-negative integer." });
        }

        if (request == null || request.Amount <= 0)
        {
            return BadRequest(new { message = "amount must be a positive integer." });
        }

        var growth = _dataService.ConsumePetGrowth(petId, request.Amount);
        return Ok(new PetGrowthResponse { PetId = petId, Growth = growth });
    }
}
