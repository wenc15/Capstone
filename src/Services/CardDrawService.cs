// 2026/01/29 created by Darren (Chengyuan Wen)
// =============================================================
// File: CardDrawService.cs
// Purpose: Core business logic for the Draw Card system.
//          - Read card catalog from CardDefinition (enabled only)
//          - Read user inventory from UserCard (per user)
//          - Support drawing 2 cards with replacement (duplicates allowed)
//          - If a card is newly obtained, save it to UserCard and return isNew=true
//
// Structure / Main Methods:
//   - GetAllCardsAsync(userId)
//       Returns full card list with "Owned" flag for each card.
//       Owned is computed by checking existence in UserCard table.
//       Intended for: GET /api/cards
//
//   - DrawTwoAsync(userId)
//       Draw 2 cards (can repeat), update inventory for new cards,
//       return 2 slots + isNew flags.
//       Intended for: POST /api/cards/draw
//
// Dependencies:
//   - AppDbContext (EF Core + SQLite)
//   - Models: CardDefinition, UserCard
//   - DTOs: CardDto, DrawnCardDto, DrawResultDto
//
// Notes:
//   - userId is "local" for now (no auth). Can be replaced later.
//   - If Slot1 and Slot2 are the same card, Slot2 will NOT be "new"
//     if Slot1 already created the ownership record.
// =============================================================

using CapstoneBackend.Data;
using CapstoneBackend.Models;
using CapstoneBackend.Services.Dtos;
using Microsoft.EntityFrameworkCore;

namespace CapstoneBackend.Services;

public class CardDrawService : ICardDrawService
{
    private readonly AppDbContext _db;

    public CardDrawService(AppDbContext db)
    {
        _db = db;
    }

    /// <summary>
    /// EN: Return all enabled cards + whether the user already owns each card.
    /// CN: 返回所有可用卡片 + 用户是否已拥有（用于前端灰化显示）。
    /// </summary>
    public async Task<List<CardDto>> GetAllCardsAsync(string userId)
    {
        // EN: Load all enabled cards from catalog
        // CN: 从卡池表中读取所有启用的卡片
        var cards = await _db.CardDefinitions
            .Where(c => c.IsEnabled)
            .OrderBy(c => c.Id)
            .ToListAsync();

        // EN: Load owned card ids for this user (inventory)
        // CN: 读取该用户已获得的卡片 ID 集合（用于判断 Owned）
        // NOTE: Some EF Core versions don't support ToHashSetAsync, so we use ToListAsync().ToHashSet().
        var ownedIds = (await _db.UserCards
                .Where(uc => uc.UserId == userId)
                .Select(uc => uc.CardDefinitionId)
                .ToListAsync())
            .ToHashSet();

        // EN: Convert to DTO for API return (do NOT expose EF entities directly)
        // CN: 转成 DTO 返回（避免直接暴露数据库实体）
        return cards.Select(c => new CardDto(
            c.Id,
            c.Name,
            c.Rarity,
            c.ImageKey,
            ownedIds.Contains(c.Id)
        )).ToList();
    }

    /// <summary>
    /// EN: Draw 2 cards with replacement (duplicates allowed). Save new cards to inventory.
    /// CN: 抽两张卡（允许重复），如果是新卡则写入库存表并返回 isNew=true。
    /// </summary>
    public async Task<DrawResultDto> DrawTwoAsync(string userId)
    {
        // 1) EN: Get all enabled cards from catalog
        //    CN: 获取所有启用的卡片作为抽卡池
        var cards = await _db.CardDefinitions
            .Where(c => c.IsEnabled)
            .ToListAsync();

        if (cards.Count == 0)
            throw new InvalidOperationException("No cards available to draw. Seed CardDefinitions first.");

        // 2) EN: Pick 2 cards with replacement (so duplicates are possible)
        //    CN: 抽两次（可重复）
        var c1 = PickUniform(cards);
        var c2 = PickUniform(cards);

        // 3) EN: Read user's owned ids once for efficient "is new" check
        //    CN: 一次性读取已拥有集合，便于判断是否新卡
        // NOTE: Some EF Core versions don't support ToHashSetAsync, so we use ToListAsync().ToHashSet().
        var ownedIds = (await _db.UserCards
                .Where(uc => uc.UserId == userId)
                .Select(uc => uc.CardDefinitionId)
                .ToListAsync())
            .ToHashSet();

        // 4) EN: Decide whether each slot is new before inserting
        //    CN: 先判断每张卡是否新卡
        var isNew1 = !ownedIds.Contains(c1.Id);
        var isNew2 = !ownedIds.Contains(c2.Id);

        // EN/CN: If Slot1 is new, insert into UserCards
        if (isNew1)
        {
            _db.UserCards.Add(new UserCard
            {
                UserId = userId,
                CardDefinitionId = c1.Id,
                ObtainedAt = DateTime.UtcNow,
                Count = 1
            });

            // EN: Update local set so Slot2 check is consistent (same request)
            // CN: 更新本地 owned 集合，保证同一次抽卡里逻辑一致
            ownedIds.Add(c1.Id);
        }

        // IMPORTANT RULE:
        // EN: If Slot2 == Slot1 and Slot1 was new, then Slot2 must NOT be new.
        // CN: 如果两张抽到同一张卡，且第一张已记为新卡，那么第二张不能再是新卡。
        if (c2.Id == c1.Id && isNew1)
            isNew2 = false;

        // EN/CN: If Slot2 is new (and not the duplicate case above), insert into UserCards
        if (isNew2)
        {
            _db.UserCards.Add(new UserCard
            {
                UserId = userId,
                CardDefinitionId = c2.Id,
                ObtainedAt = DateTime.UtcNow,
                Count = 1
            });
        }

        // EN: Persist inventory updates
        // CN: 保存数据库更改
        await _db.SaveChangesAsync();

        // 5) EN/CN: Return DTO draw results to controller/frontend
        return new DrawResultDto(
            Slot1: new DrawnCardDto(c1.Id, c1.Name, c1.Rarity, c1.ImageKey, isNew1),
            Slot2: new DrawnCardDto(c2.Id, c2.Name, c2.Rarity, c2.ImageKey, isNew2)
        );
    }

    /// <summary>
    /// EN: Uniform random pick from the list.
    /// CN: 均匀随机抽取一张卡。
    /// </summary>
    private static CardDefinition PickUniform(List<CardDefinition> cards)
    {
        // EN: Random.Shared is OK for simple server-side randomness (not cryptographic).
        // CN: Random.Shared 适合简单随机（不用于安全场景）。
        var idx = Random.Shared.Next(0, cards.Count);
        return cards[idx];
    }
}
