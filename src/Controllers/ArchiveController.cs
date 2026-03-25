// 2026/03/16 created by Zikai Lu
// 新增内容：
//   - 新增本地档案导出接口：GET /api/archive/export。
//   - 新增本地档案导入接口：POST /api/archive/import。
// 新增的作用：
//   - 支持用户导出本机配置与档案，并从外部文件导入恢复。
// =============================================================

using System.Text;
using System.Text.Json;
using CapstoneBackend.Models;
using CapstoneBackend.Services;
using Microsoft.AspNetCore.Mvc;

namespace CapstoneBackend.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ArchiveController : ControllerBase
{
    private readonly LocalDataService _dataService;

    public ArchiveController(LocalDataService dataService)
    {
        _dataService = dataService;
    }

    [HttpGet("export")]
    public IActionResult Export()
    {
        var archive = _dataService.ExportArchive();
        var json = JsonSerializer.Serialize(archive, new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            WriteIndented = true
        });

        var bytes = Encoding.UTF8.GetBytes(json);
        var fileName = $"growin-archive-{DateTimeOffset.UtcNow:yyyyMMddHHmmss}.json";
        return File(bytes, "application/json", fileName);
    }

    [HttpPost("import")]
    [RequestSizeLimit(5 * 1024 * 1024)]
    public async Task<ActionResult<LocalArchiveImportResult>> Import([FromForm] IFormFile file)
    {
        if (file is null || file.Length <= 0)
        {
            return BadRequest(new { error = "archive file is required." });
        }

        if (!file.FileName.EndsWith(".json", StringComparison.OrdinalIgnoreCase))
        {
            return BadRequest(new { error = "only .json archive file is supported." });
        }

        try
        {
            await using var stream = file.OpenReadStream();
            using var reader = new StreamReader(stream, Encoding.UTF8);
            var json = await reader.ReadToEndAsync();

            var archive = JsonSerializer.Deserialize<LocalArchiveExportData>(json, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            });

            if (archive is null)
            {
                return BadRequest(new { error = "invalid archive content." });
            }

            var result = _dataService.ImportArchive(archive);
            return Ok(result);
        }
        catch (JsonException ex)
        {
            return BadRequest(new { error = "invalid archive JSON.", details = ex.Message });
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpPost("clear")]
    public IActionResult ClearAll()
    {
        _dataService.ClearArchiveData();
        return Ok(new { ok = true });
    }
}
