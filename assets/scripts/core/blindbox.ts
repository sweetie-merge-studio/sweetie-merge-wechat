/**
 * 盲盒抽取系统
 * - 普通盲盒：200 金币，低概率碎片
 * - 高级盲盒：5 钻石，高概率碎片 + 指定碎片
 * - 保底机制：普通 10 次 / 高级 5 次 未出碎片必出
 */

import type { BlindBoxState, BlindBoxResult } from './types';
import type { ShardState } from './types';
import { randomDropCategory } from './shard';
import type { Category } from '../data/items';
import { randomIngredient } from '../data/items';

// --- 常量 ---

export const NORMAL_BOX_COST = 200;   // 金币
export const PREMIUM_BOX_COST = 5;    // 钻石

const NORMAL_PITY_LIMIT = 10;
const PREMIUM_PITY_LIMIT = 5;

// --- 概率池 ---

interface PoolEntry {
  type: BlindBoxResult['type'];
  weight: number;
}

const NORMAL_POOL: readonly PoolEntry[] = [
  { type: 'coins',           weight: 35 },
  { type: 'energy',          weight: 25 },
  { type: 'shard',           weight: 18 },
  { type: 'ingredientShard', weight: 17 },
  { type: 'item',            weight: 5 },
];

const PREMIUM_POOL: readonly PoolEntry[] = [
  { type: 'coins',           weight: 20 },
  { type: 'energy',          weight: 15 },
  { type: 'shard',           weight: 30 },
  { type: 'ingredientShard', weight: 15 },
  { type: 'targetShard',     weight: 15 },
  { type: 'item',            weight: 5 },
];

// --- 随机工具 ---

function weightedRandom(pool: readonly PoolEntry[]): BlindBoxResult['type'] {
  const total = pool.reduce((s, e) => s + e.weight, 0);
  let r = Math.random() * total;
  for (const entry of pool) {
    r -= entry.weight;
    if (r <= 0) return entry.type;
  }
  return pool[pool.length - 1].type;
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// --- 创建初始状态 ---

export function createBlindBoxState(): BlindBoxState {
  return { normalPity: 0, premiumPity: 0, totalOpened: 0 };
}

// --- 核心抽取 ---

/**
 * 普通盲盒抽取
 * @returns { result, newState } — 不可变，返回新状态
 */
export function openNormalBox(
  state: BlindBoxState,
  shardState: ShardState,
  unlockedCategories: Set<Category>,
): { result: BlindBoxResult; newState: BlindBoxState } {
  const pityTriggered = state.normalPity >= NORMAL_PITY_LIMIT - 1;
  let type = pityTriggered ? 'shard' as const : weightedRandom(NORMAL_POOL);

  // 如果抽到碎片但没有可掉落品类，降级为金币（仍视为触发碎片，重置保底）
  let shardDowngraded = false;
  if ((type === 'shard' || type === 'targetShard') && !randomDropCategory(shardState, unlockedCategories)) {
    shardDowngraded = true;
    type = 'coins';
  }

  const result = buildResult(type, shardState, unlockedCategories, 'normal');
  const gotShard = result.type === 'shard' || shardDowngraded;

  const newState: BlindBoxState = {
    normalPity: gotShard ? 0 : state.normalPity + 1,
    premiumPity: state.premiumPity,
    totalOpened: state.totalOpened + 1,
  };

  return { result, newState };
}

/**
 * 高级盲盒抽取
 * @returns { result, newState } — 不可变，返回新状态
 */
export function openPremiumBox(
  state: BlindBoxState,
  shardState: ShardState,
  unlockedCategories: Set<Category>,
): { result: BlindBoxResult; newState: BlindBoxState } {
  const pityTriggered = state.premiumPity >= PREMIUM_PITY_LIMIT - 1;
  let type = pityTriggered ? 'shard' as const : weightedRandom(PREMIUM_POOL);

  // 如果抽到碎片但没有可掉落品类，降级为金币（仍视为触发碎片，重置保底）
  let shardDowngraded = false;
  if ((type === 'shard' || type === 'targetShard') && !randomDropCategory(shardState, unlockedCategories)) {
    shardDowngraded = true;
    type = 'coins';
  }

  const result = buildResult(type, shardState, unlockedCategories, 'premium');
  const gotShard = result.type === 'shard' || result.type === 'targetShard' || shardDowngraded;

  const newState: BlindBoxState = {
    normalPity: state.normalPity,
    premiumPity: gotShard ? 0 : state.premiumPity + 1,
    totalOpened: state.totalOpened + 1,
  };

  return { result, newState };
}

// --- 结果构建 ---

function buildResult(
  type: BlindBoxResult['type'],
  shardState: ShardState,
  unlockedCategories: Set<Category>,
  tier: 'normal' | 'premium',
): BlindBoxResult {
  switch (type) {
    case 'coins':
      return {
        type: 'coins',
        amount: tier === 'normal' ? randomInt(30, 80) : randomInt(80, 200),
      };

    case 'energy':
      return {
        type: 'energy',
        amount: tier === 'normal' ? randomInt(3, 8) : randomInt(5, 15),
      };

    case 'shard': {
      const cat = randomDropCategory(shardState, unlockedCategories);
      return {
        type: 'shard',
        category: cat ?? undefined,
        amount: tier === 'premium' ? randomInt(1, 2) : 1,
      };
    }

    case 'targetShard': {
      // 指定品类碎片 — UI 层会弹出品类选择器，这里先标记 type
      return {
        type: 'targetShard',
        category: undefined, // UI 层填入玩家选择的品类
        amount: 1,
      };
    }

    case 'ingredientShard': {
      const ingId = randomIngredient();
      return {
        type: 'ingredientShard',
        ingredientId: ingId,
        amount: tier === 'premium' ? randomInt(2, 4) : randomInt(1, 2),
      };
    }

    case 'item': {
      // 随机物品奖励
      const itemId = tier === 'normal'
        ? randomItemInRange(unlockedCategories, 3, 5)
        : randomItemInRange(unlockedCategories, 5, 7);
      return {
        type: 'item',
        itemId: itemId ?? undefined,
        amount: 1,
      };
    }

    default:
      return { type: 'coins', amount: 50 };
  }
}

/**
 * 从已解锁品类中随机选一个 [minLv, maxLv] 范围的物品 ID
 */
function randomItemInRange(
  unlockedCategories: Set<Category>,
  minLv: number,
  maxLv: number,
): string | null {
  const cats = Array.from(unlockedCategories);
  if (cats.length === 0) return null;

  const cat = cats[Math.floor(Math.random() * cats.length)];
  const level = randomInt(minLv, maxLv);
  // 物品 ID 格式: {category}_{level}，需确保不超过最大等级 8
  const clampedLevel = Math.min(level, 8);
  return `${cat}_${clampedLevel}`;
}
