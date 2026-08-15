import type { ItemId, ItemDef, Rarity } from './types';

/** 赛季定义 */
export interface Season {
  id: string;
  name: string;
  emoji: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;
  items: SeasonItem[];
}

/** 赛季限时物品 */
export interface SeasonItem {
  id: ItemId;
  name: string;
  emoji: string;
  level: number;
  rarity: Rarity;
  /** 合成来源：两个相同 sourceId 合成得到此物品 */
  sourceId?: ItemId;
}

/** 赛季状态（存档用） */
export interface SeasonState {
  unlockedIds: string[];
}

// --- 赛季配置 ---

export const SEASONS: readonly Season[] = [
  {
    id: 'sakura_2026',
    name: '🌸 樱花季',
    emoji: '🌸',
    startDate: '2026-04-01',
    endDate: '2026-04-14',
    items: [
      { id: 'sakura_01', name: '樱花饼干', emoji: '🌸', level: 1, rarity: 'common' },
      { id: 'sakura_02', name: '樱花马卡龙', emoji: '🌸', level: 5, rarity: 'common', sourceId: 'sakura_01' },
      { id: 'sakura_03', name: '樱花蛋糕', emoji: '🎀', level: 10, rarity: 'rare', sourceId: 'sakura_02' },
      { id: 'sakura_04', name: '樱花千层塔', emoji: '✨', level: 15, rarity: 'legendary', sourceId: 'sakura_03' },
    ],
  },
  {
    id: 'halloween_2026',
    name: '🎃 万圣节',
    emoji: '🎃',
    startDate: '2026-10-20',
    endDate: '2026-11-03',
    items: [
      { id: 'hallo_01', name: '南瓜饼干', emoji: '🎃', level: 1, rarity: 'common' },
      { id: 'hallo_02', name: '幽灵甜甜圈', emoji: '👻', level: 5, rarity: 'common', sourceId: 'hallo_01' },
      { id: 'hallo_03', name: '蝙蝠蛋糕', emoji: '🦇', level: 10, rarity: 'rare', sourceId: 'hallo_02' },
      { id: 'hallo_04', name: '巫师甜品塔', emoji: '🧙', level: 15, rarity: 'legendary', sourceId: 'hallo_03' },
    ],
  },
  {
    id: 'christmas_2026',
    name: '🎄 圣诞节',
    emoji: '🎄',
    startDate: '2026-12-15',
    endDate: '2026-12-31',
    items: [
      { id: 'xmas_01', name: '姜饼人', emoji: '🎄', level: 1, rarity: 'common' },
      { id: 'xmas_02', name: '圣诞曲奇', emoji: '⭐', level: 5, rarity: 'common', sourceId: 'xmas_01' },
      { id: 'xmas_03', name: '圣诞树蛋糕', emoji: '🎁', level: 10, rarity: 'rare', sourceId: 'xmas_02' },
      { id: 'xmas_04', name: '极光甜品塔', emoji: '❄️', level: 15, rarity: 'legendary', sourceId: 'xmas_03' },
    ],
  },
];

/** 获取当前进行中的赛季，没有返回 null */
export function getActiveSeason(now: Date = new Date()): Season | null {
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return SEASONS.find(s => today >= s.startDate && today <= s.endDate) ?? null;
}

/** 创建赛季状态 */
export function createSeasonState(): SeasonState {
  return { unlockedIds: [] };
}

/** 解锁赛季物品，返回新状态（已解锁则 null） */
export function unlockSeasonItem(state: SeasonState, itemId: string): SeasonState | null {
  if (state.unlockedIds.includes(itemId)) return null;
  return { ...state, unlockedIds: [...state.unlockedIds, itemId] };
}

/** 赛季图鉴完成度 */
export function seasonCompletion(state: SeasonState, season: Season): { unlocked: number; total: number } {
  const total = season.items.length;
  const unlocked = season.items.filter(i => state.unlockedIds.includes(i.id)).length;
  return { unlocked, total };
}

/** 获取赛季物品展示信息 */
export function getSeasonItemDisplay(season: Season, itemId: string): { emoji: string; name: string } | null {
  const item = season.items.find(i => i.id === itemId);
  if (!item) return null;
  return { emoji: item.emoji, name: item.name };
}
