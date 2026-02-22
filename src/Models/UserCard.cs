// 2026/01/29 created by Chengyuan Wen(wenc15)
// =============================================================
// File: UserCard.cs
// Purpose: EF Core entity for user inventory (which cards a user has obtained).
//          This table stores ownership state per user, separate from CardDefinition.
// Structure:
//   - Id               : Primary key
//   - UserId           : Identifies the user (temporary: "local" until auth is added)
//   - CardDefinitionId : FK to CardDefinition (which card is owned)
//   - ObtainedAt       : Timestamp when the card was first obtained (UTC recommended)
//   - Count            : Optional counter (useful if you decide to track duplicates)
// Navigation:
//   - CardDefinition   : Optional EF navigation property (can be null / not required)
// Notes:
//   - "Owned" in API is computed by checking if a UserCard row exists for that user+card.
//   - In current MVP: when a user draws a duplicate, we do NOT create a new row;
//     we may later choose to increment Count instead.
// =============================================================

namespace CapstoneBackend.Models;

public class UserCard
{
    public int Id { get; set; }
    public string UserId { get; set; } = "local";
    public int CardDefinitionId { get; set; }
    public DateTime ObtainedAt { get; set; }
    public int Count { get; set; } = 1;

    // optional navigation (not required)
    public CardDefinition? CardDefinition { get; set; }
}

