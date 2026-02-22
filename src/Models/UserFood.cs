namespace CapstoneBackend.Models;

public class UserFood
{
    public int Id { get; set; }
    public string UserId { get; set; } = "local";
    public string FoodId { get; set; } = "";   // references FoodDefinition.FoodId
    public DateTime ObtainedAt { get; set; }
    public int Count { get; set; } = 1;
}
