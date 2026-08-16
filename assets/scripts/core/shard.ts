/**
 * 碎片收集系统
 * - 每个品类有对应碎片，收集满 8 个合成稀有图鉴物品
 * - 碎片不占棋盘，直接存入碎片背包
 */

import type { ShardState } from './types';
import { RARE_ITEM_BY_CATEGORY, type Category } from '../data/items';

/** 创建空碎片状态 */
export function createShardState(): ShardState {
  return { shards: {}, completedRareIds: new Set(), ingredientShards: {} };
}

/** 添加原材料碎片 */
export function addIngredientShard(
  state: ShardState,
  ingredientId: string,
  count: number = 1,
): number {
  const current = state.ingredientShards[ingredientId] ?? 0;
  const newShards = { ...state.ingredientShards, [ingredientId]: current + count };
  state.ingredientShards = newShards;
  return count;
}

/** 获取某原材料碎片数量 */
export function getIngredientShardCount(state: ShardState, ingredientId: string): number {
  return state.ingredientShards[ingredientId] ?? 0;
}

/** 获取某品类碎片数 */
export function getShardCount(state: ShardState, category: string): number {
  return state.shards[category] ?? 0;
}

/** 获取某品类所需碎片总数 */
export function getShardsRequired(category: Category): number {
  return RARE_ITEM_BY_CATEGORY.get(category)?.shardsRequired ?? 8;
}

/** 该品类碎片是否已集满 */
export function isShardComplete(state: ShardState, category: string): boolean {
  const rare = RARE_ITEM_BY_CATEGORY.get(category as Category);
  if (!rare) return false;
  return getShardCount(state, category) >= rare.shardsRequired;
}

/** 该品类稀有物品是否已合成 */
export function isRareCompleted(state: ShardState, category: string): boolean {
  const rare = RARE_ITEM_BY_CATEGORY.get(category as Category);
  if (!rare) return false;
  return state.completedRareIds.has(rare.id);
}

/**
 * 添加碎片，返回 { added, completed }
 * - added: 实际添加的碎片数
 * - completed: 是否刚好集满并合成了稀有物品
 */
export function addShard(
  state: ShardState,
  category: string,
  count: number = 1,
): { added: number; completed: boolean } {
  const rare = RARE_ITEM_BY_CATEGORY.get(category as Category);
  if (!rare) return { added: 0, completed: false };

  // 已合成的品类不再接受碎片
  if (state.completedRareIds.has(rare.id)) return { added: 0, completed: false };

  const current = getShardCount(state, category);
  const max = rare.shardsRequired;
  const space = max - current;
  const added = Math.min(count, space);
  if (added <= 0) return { added: 0, completed: false };

  const newShards = { ...state.shards, [category]: current + added };
  state.shards = newShards;

  // 检查是否集满
  const completed = current + added >= max;
  if (completed) {
    state.completedRareIds = new Set(state.completedRareIds).add(rare.id);
  }

  return { added, completed };
}

/**
 * 获取可掉落碎片的品类列表
 * 排除已集满的品类，只包含已解锁的品类
 */
export function getDroppableCategories(
  state: ShardState,
  unlockedCategories: Set<Category>,
): Category[] {
  return Array.from(unlockedCategories).filter(cat => {
    const rare = RARE_ITEM_BY_CATEGORY.get(cat);
    if (!rare) return false;
    return !state.completedRareIds.has(rare.id) && !isShardComplete(state, cat);
  });
}

/** 随机选一个可掉落的品类 */
export function randomDropCategory(
  state: ShardState,
  unlockedCategories: Set<Category>,
): Category | null {
  const pool = getDroppableCategories(state, unlockedCategories);
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}
