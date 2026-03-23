namespace CapstoneBackend.Services.Dtos;

public record FoodDraw10ResultDto(
    List<DrawnFoodDto> Items,
    int NewCredits,
    bool GuaranteedEpicApplied
);