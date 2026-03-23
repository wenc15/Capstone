// 2026/03/09 created by Zikai Lu
// 新增内容：
//   - 新增 Collection（收藏品）系统模型与预设目录。
//   - 定义查询返回模型、获取收藏品请求/响应模型。
// 新增的作用：
//   - 为“皮肤/收藏品”提供固定列表 + 0/1 拥有状态的数据结构。
//   - 统一前后端对 Collection 接口的字段约定。
// =============================================================

using System.Collections.Generic;

namespace CapstoneBackend.Models;

public class CollectionItemDefinition
{
    public string ItemId { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string? Rarity { get; set; }
    public string? Category { get; set; }
    public string? Game { get; set; }
}

public static class CollectionCatalog
{
    // 预设收藏品目录：可按业务继续扩展。
    public static readonly IReadOnlyList<CollectionItemDefinition> PresetItems = new List<CollectionItemDefinition>
    {
        new() { ItemId = "skin_cat_default", DisplayName = "Cat Default Skin" },
        new() { ItemId = "skin_cat_sakura", DisplayName = "Cat Sakura Skin" },
        new() { ItemId = "skin_dog_default", DisplayName = "Dog Default Skin" },
        new() { ItemId = "skin_dog_space", DisplayName = "Dog Space Skin" },
        new() { ItemId = "skin_bird_sky", DisplayName = "Bird Sky Skin" },
        new() { ItemId = "skin_fox_autumn", DisplayName = "Fox Autumn Skin" },
    };
}

public class CollectionItemStatus
{
    public string ItemId { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public int State { get; set; }
}

public class CollectionQueryResponse
{
    public List<CollectionItemStatus> Items { get; set; } = new();
}

public class CollectionAcquireRequest
{
    public string ItemId { get; set; } = string.Empty;
}

public class CollectionAcquireResponse
{
    public string ItemId { get; set; } = string.Empty;
    public int State { get; set; }
    public bool AlreadyOwned { get; set; }
    public string Message { get; set; } = string.Empty;
}
