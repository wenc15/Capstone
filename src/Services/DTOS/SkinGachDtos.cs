// 2026/03/12 created by Darren (Chengyuan Wen)
// =============================================================
// 文件：SkinGachaDtos.cs
// 作用：Skin Pool 抽卡接口的请求/响应 DTO。
// 结构：
//   - SkinDrawRequestDto: 请求体（cost）
//   - SkinDropDto: 掉落结果（skin 或 food）
//   - SkinDrawResultDto: 返回掉落 + newCredits
// =============================================================

namespace CapstoneBackend.Services.Dtos;

public record SkinDrawRequestDto(int Cost, string? Pool);

public record SkinDropDto(
    string DropType,   // "skin" or "food"
    string SubType,    // "building" / "background" / "" (food)
    string ItemId,     // skinId or foodId
    string Name,
    string Rarity,
    string? ImageKey,
    bool IsNew
);

public record SkinDrawResultDto(SkinDropDto Drop, int NewCredits);
