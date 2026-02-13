namespace CapstoneBackend.Models;

public class FoodDefinition
{
    public int Id { get; set; }               // DB primary key
    public string FoodId { get; set; } = "";  // stable external id (e.g. "food_001")
    public string Name { get; set; } = "";
    public string? Rarity { get; set; }
    public int ExpValue { get; set; }
    public string? ImageKey { get; set; }
    public bool IsEnabled { get; set; } = true;
}
