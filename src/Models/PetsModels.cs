// 2026/03/14 edited by JS
// =============================================================
// 文件：PetsModels.cs
// 作用：为宠物“拥有/激活/解锁”提供 DTO。
// =============================================================

using System.Collections.Generic;

namespace CapstoneBackend.Models;

public class PetStateResponse
{
    public int ActivePetId { get; set; }
    public List<int> UnlockedPetIds { get; set; } = new();
}

public class PetSelectRequest
{
    public int PetId { get; set; }
}
