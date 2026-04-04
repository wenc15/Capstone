// 2026/03/12 created by Darren (Chengyuan Wen)
// =============================================================
// 文件：SkinCatalogService.cs
// 作用：从 Data/skins.json 读取皮肤目录并缓存，供 Skin Gacha 使用。
// 结构：
//   - GetAll(): 返回全部皮肤（去重、过滤空 id）
//   - GetBuildingSkins(): 返回 skin_build_*
//   - GetBackgroundSkins(): 返回 skin_bg_*
// 说明：
//   - 为避免硬编码，皮肤目录由 JSON 驱动。
//   - 使用缓存避免每次请求读文件。
// =============================================================

using System.Text.Json;
using CapstoneBackend.Models;

namespace CapstoneBackend.Services;

public class SkinCatalogService
{
    private readonly IWebHostEnvironment _env;
    private List<CollectionItemDefinition>? _cached;

    private static string NormalizeRarity(string? rarity)
    {
        if (string.IsNullOrWhiteSpace(rarity)) return "common";
        return rarity.Trim().ToLowerInvariant();
    }

    public SkinCatalogService(IWebHostEnvironment env)
    {
        _env = env;
    }

    public List<CollectionItemDefinition> GetAll()
    {
        if (_cached != null) return _cached;

        var path = Path.Combine(_env.ContentRootPath, "Data", "skins.json");
        if (!File.Exists(path))
        {
            _cached = new List<CollectionItemDefinition>();
            return _cached;
        }

        var json = File.ReadAllText(path);
        var items = JsonSerializer.Deserialize<List<CollectionItemDefinition>>(
            json,
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true }
        ) ?? new List<CollectionItemDefinition>();

        _cached = items
            .Where(x => !string.IsNullOrWhiteSpace(x.ItemId))
            .GroupBy(x => x.ItemId.Trim(), StringComparer.OrdinalIgnoreCase)
            .Select(g => g.First())
            .ToList();

        return _cached;
    }

    public List<CollectionItemDefinition> GetBuildingSkins()
        => GetAll().Where(x => x.ItemId.StartsWith("skin_build_", StringComparison.OrdinalIgnoreCase)).ToList();

    public List<CollectionItemDefinition> GetBackgroundSkins()
        => GetAll().Where(x => x.ItemId.StartsWith("skin_bg_", StringComparison.OrdinalIgnoreCase)).ToList();

    public List<CollectionItemDefinition> GetByRarity(string rarity)
        => GetAll().Where(x => NormalizeRarity(x.Rarity) == NormalizeRarity(rarity)).ToList();

    public List<CollectionItemDefinition> GetEpicSkins()
        => GetByRarity("epic");
}
