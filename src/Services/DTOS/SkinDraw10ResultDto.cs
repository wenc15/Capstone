namespace CapstoneBackend.Services.Dtos;

public record SkinDraw10ResultDto(
    List<SkinDropDto> Drops,
    int NewCredits,
    bool GuaranteedSkinApplied
);