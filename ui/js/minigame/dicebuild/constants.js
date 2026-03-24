// 2026/03/24 edited by Zhecheng Xu
// Changes:
// - Synced building metadata text with updated gameplay design.
// - Kept static progression and rarity constants centralized.
//
// dicebuild/constants.js
// Shared ruleset and static data for Dice & Build.

export const API_BASE = 'http://localhost:5024';

export const SAVE_KEY = 'dicebuild.save.v6';
export const HIST_KEY = 'dicebuild.history.v1';

export const STAGES = [15, 35, 80, 120, 233, 350];
export const STAGE_COUNT = 6;
export const ROLLS_PER_STAGE = 8;
export const TOTAL_ROLLS = STAGE_COUNT * ROLLS_PER_STAGE;

export const BUY_BLOCK_COSTS = [10, 25, 40, 55, 70, 85];

export const BASE_EXP_BY_LEVEL = { 1: 0, 2: 6, 3: 12, 4: 18 };
export const LEVEL_REQ = { 1: 0, 2: 6, 3: 12, 4: 18 };

export const RARITY = {
  common: { label: 'Common', color: '#78c35a', buy: 8, sell: [4, 8, 12, 16] },
  rare: { label: 'Rare', color: '#4aa3ff', buy: 16, sell: [8, 16, 24, 32] },
  epic: { label: 'Epic', color: '#b06bff', buy: 30, sell: [15, 30, 45, 60] },
  legendary: { label: 'Legendary', color: '#ffb547', buy: 50, sell: [25, 50, 75, 100] },
};

export const SHOP_RATES_BY_STAGE = [
  { common: 70, rare: 28, epic: 2, legendary: 0 },
  { common: 60, rare: 34, epic: 5, legendary: 1 },
  { common: 50, rare: 40, epic: 8, legendary: 2 },
  { common: 34, rare: 48, epic: 15, legendary: 3 },
  { common: 31, rare: 45, epic: 20, legendary: 4 },
  { common: 30, rare: 42, epic: 23, legendary: 5 },
];

export const BUILDINGS = {
  '00': {
    id: '00',
    name: 'Small Coin Pouch',
    tags: ['Coin'],
    rarity: 'common',
    icon: '👜',
    sellByLevel: [4, 8, 12, 16],
    effectText: 'At the end of the dice phase, gain {L} Coins.',
  },
  '01': {
    id: '01',
    name: 'Insurance Seller',
    tags: ['Utility'],
    rarity: 'common',
    icon: '🛡️',
    sellByLevel: [5, 16, 40, 65],
    sellBonusByLevel: [1, 8, 25, 45],
    effectText: 'When you roll a 1, gain {2L} Coins and 2 EXP. When sold, gain extra {SB} Coins.',
  },
  '02': {
    id: '02',
    name: 'Dice Sculpture',
    tags: ['Dice'],
    rarity: 'common',
    icon: '🎲',
    sellByLevel: [4, 8, 12, 16],
    effectText: 'When you roll a 6, gain {6L} Coins.',
  },
  '03': {
    id: '03',
    name: 'Piggy Bank',
    tags: ['Utility'],
    rarity: 'rare',
    icon: '🐷',
    sellByLevel: [10, 30, 60, 100],
    sellBonusByLevel: [3, 15, 35, 65],
    effectText: 'At the end of the dice phase, gain 1 EXP. When sold, gain extra {SB} Coins.',
  },
  '04': {
    id: '04',
    name: 'Bookstore',
    tags: ['Utility'],
    rarity: 'rare',
    icon: '📚',
    sellByLevel: [8, 16, 24, 32],
    effectText: 'When you land on this frontage tile, this building and adjacent buildings gain {L1} EXP. When you pass by this frontage tile, gain {2L} Coins.',
  },
  '05': {
    id: '05',
    name: 'Money Tree',
    tags: ['Coin'],
    rarity: 'rare',
    icon: '🌳',
    sellByLevel: [8, 16, 24, 32],
    effectText: 'When you land on this frontage tile, permanently increase adjacent Coin buildings\' Coin gain by {L}. When you roll a 3, gain {2L} Coins.',
  },
  '06': {
    id: '06',
    name: 'Four-Leaf Clover House',
    tags: ['Dice'],
    rarity: 'rare',
    icon: '🍀',
    sellByLevel: [8, 16, 24, 32],
    effectText: 'When you roll an even number, gain {2L} Coins. When you roll a 6, permanently increase this building\'s Coin gain by 1.',
  },
  '07': {
    id: '07',
    name: 'Wishing Well',
    tags: ['Coin'],
    rarity: 'rare',
    icon: '⛲',
    sellByLevel: [8, 16, 24, 32],
    effectText: 'At the end of the dice phase, gain {L} Coins. Each time you clear a stage, permanently increase this building\'s Coin gain by {L}.',
  },
  '08': {
    id: '08',
    name: 'Fortune Coin Pool',
    tags: ['Dice'],
    rarity: 'epic',
    icon: '🪙',
    sellByLevel: [15, 30, 45, 60],
    effectText: 'When you roll two dice, gain {6L} Coins. When you roll a 1, your next action will roll two dice.',
  },
  '09': {
    id: '09',
    name: 'Lucky Gate',
    tags: ['Coin', 'Dice'],
    rarity: 'epic',
    icon: '🚪',
    sellByLevel: [15, 30, 45, 60],
    effectText: 'When you roll a 1, gain Coins equal to (number of Coin buildings on the field x {L}). When you roll a 6, gain Coins equal to (number of Dice buildings on the field x {L}).',
  },
  '10': {
    id: '10',
    name: 'Vault',
    tags: ['Utility'],
    rarity: 'epic',
    icon: '🏦',
    sellByLevel: [15, 30, 45, 60],
    effectText: 'At the end of the dice phase, all Piggy Bank and Insurance Seller gain {L} EXP. When you pass by this frontage tile, gain 1 Coins. Each time you sell a Piggy Bank or Insurance Seller, permanently increase this building\'s Coin gain by 1.',
  },
  '11': {
    id: '11',
    name: 'Hall of Fortune',
    tags: ['Coin'],
    rarity: 'epic',
    icon: '🏛️',
    sellByLevel: [15, 30, 45, 60],
    effectText: 'When you roll a 3 or 4, trigger adjacent Coin buildings\' dice effects. When you land on this frontage tile, permanently increase all Coin buildings\' Coin gain by {L}.',
  },
  '12': {
    id: '12',
    name: 'Bunny Restaurant',
    tags: ['Coin'],
    rarity: 'legendary',
    icon: '🐰',
    sellByLevel: [25, 50, 75, 100],
    effectText: 'When you pass by this frontage tile, gain {5L} Coins and permanently increase one random coin-earning building\'s Coin gain by {L}.',
  },
  '13': {
    id: '13',
    name: 'Holographic Experience House',
    tags: ['Dice'],
    rarity: 'legendary',
    icon: '🛰️',
    sellByLevel: [25, 50, 75, 100],
    effectText: 'When you pass by this frontage tile, your next action will roll two dice. When you roll two dice, gain Coins equal to (sum of both dice results x {L}).',
  },
  '14': {
    id: '14',
    name: 'Fox Antique Shop',
    tags: ['Utility'],
    rarity: 'legendary',
    icon: '🦊',
    sellByLevel: [25, 50, 75, 100],
    effectText: 'When you roll a 5, this building and {L} random buildings gain {L} EXP. When you pass by this frontage tile, gain one Piggy Bank or Insurance Seller.',
  },
};

export const BUILDING_IDS = Object.keys(BUILDINGS);

export const BOARD_COLS = 7;
export const BOARD_ROWS = 7;
