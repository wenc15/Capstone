// 2026/01/29 created by Chengyuan Wen（wenc15)
// =============================================================
// File: CardDefinition.cs
// Purpose: EF Core entity for the card catalog (card pool).
//          This table stores the "definition" of each card (static metadata),
//          NOT whether a user owns it.
// Structure:
//   - Id        : Primary key
//   - Name      : Display name of the card (can be placeholder initially)
//   - Rarity    : Rarity label (optional; can be null until rarity rules are finalized)
//   - ImageKey  : Asset key (NOT a file path). Frontend maps this key to real images.
//   - IsEnabled : Whether this card is available in the draw pool (soft on/off switch)
// Notes:
//   - Owned status is stored in UserCard table (per user).
//   - We can seed ~100 placeholder cards first, then update Name/ImageKey later.
// =============================================================

namespace CapstoneBackend.Models;

public class CardDefinition
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string? Rarity { get; set; }
    public string? ImageKey { get; set; }
    public bool IsEnabled { get; set; } = true;
}
