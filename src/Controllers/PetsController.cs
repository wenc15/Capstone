// 2026/03/14 edited by JS
// =============================================================
// 文件：PetsController.cs
// 作用：提供宠物拥有/激活/解锁的 HTTP 接口。
// 结构：
//   - GET  /api/pets/state
//   - POST /api/pets/active  { "petId": 3 }
//   - POST /api/pets/unlock  { "petId": 2 }
// =============================================================

using CapstoneBackend.Models;
using CapstoneBackend.Services;
using Microsoft.AspNetCore.Mvc;

namespace CapstoneBackend.Controllers;

[ApiController]
[Route("api/[controller]")]
public class PetsController : ControllerBase
{
    private readonly LocalDataService _data;

    public PetsController(LocalDataService data)
    {
        _data = data;
    }

    [HttpGet("state")]
    public ActionResult<PetStateResponse> GetState()
    {
        return Ok(_data.GetPetState());
    }

    [HttpPost("active")]
    public ActionResult<PetStateResponse> SetActive([FromBody] PetSelectRequest request)
    {
        if (request == null)
        {
            return BadRequest(new { message = "request body is required." });
        }

        var ok = _data.TrySetActivePet(request.PetId, out var state, out var error);
        if (!ok)
        {
            return BadRequest(new { message = error, state });
        }

        return Ok(state);
    }

    [HttpPost("unlock")]
    public ActionResult<PetStateResponse> Unlock([FromBody] PetSelectRequest request)
    {
        if (request == null)
        {
            return BadRequest(new { message = "request body is required." });
        }

        var ok = _data.TryUnlockPet(request.PetId, out var state, out var error);
        if (!ok)
        {
            return BadRequest(new { message = error, state });
        }

        return Ok(state);
    }
}
