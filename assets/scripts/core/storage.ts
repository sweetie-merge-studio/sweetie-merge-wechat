import type { Cell, EnergyState, EconomyState, CollectionState, ShardState, BlindBoxState, SaveData } from './types';
import type { DailyState } from './daily';
import type { ShopState } from './shop';
import type { SeasonState } from './season';
import type { SocialState } from './social';
import type { LevelState } from './level';
import type { BackpackState } from './backpack';
import type { BakeryState } from './bakery';
import type { TutorialState } from './tutorial';
import { getConfig } from './config';

export interface SerializeInput {
  board: readonly Cell[];
  energy: EnergyState;
  economy: EconomyState;
  collection: CollectionState;
  orders?: unknown;
  daily?: DailyState;
  shop?: ShopState;
  season?: SeasonState;
  social?: SocialState;
  level?: LevelState;
  backpack?: BackpackState;
  bakery?: BakeryState;
  tutorial?: TutorialState;
  shardState?: ShardState;
  blindBox?: BlindBoxState;
}

/** 序列化游戏状态为存档数据 */
export function serialize(
  board: readonly Cell[],
  energy: EnergyState,
  economy: EconomyState,
  collection: CollectionState,
  orders?: unknown,
  subs?: {
    daily?: DailyState;
    shop?: ShopState;
    season?: SeasonState;
    social?: SocialState;
    level?: LevelState;
    backpack?: BackpackState;
    bakery?: BakeryState;
    tutorial?: TutorialState;
    shardState?: ShardState;
    blindBox?: BlindBoxState;
  },
): SaveData {
  return {
    board: board.map(c => ({ itemId: c.itemId })),
    energy: { ...energy },
    economy: { ...economy },
    collection: Array.from(collection.unlockedIds),
    collectionUnclaimed: Array.from(collection.unclaimedIds),
    orders,
    lastOnline: Date.now(),
    daily: subs?.daily ? { ...subs.daily, tasks: subs.daily.tasks.map(t => ({ ...t })) } : undefined,
    shop: subs?.shop ? { owned: [...subs.shop.owned] } : undefined,
    season: subs?.season ? { unlockedIds: [...subs.season.unlockedIds] } : undefined,
    social: subs?.social ? { ...subs.social } : undefined,
    level: subs?.level ? { ...subs.level } : undefined,
    backpack: subs?.backpack ? { ...subs.backpack, items: subs.backpack.items.map(i => ({ ...i })) } : undefined,
    bakery: subs?.bakery ? { ...subs.bakery, placed: subs.bakery.placed.map(p => ({ ...p })) } : undefined,
    tutorial: subs?.tutorial ? { ...subs.tutorial, completedSteps: [...subs.tutorial.completedSteps] } : undefined,
    shards: subs?.shardState ? { ...subs.shardState.shards } : undefined,
    completedRareIds: subs?.shardState ? Array.from(subs.shardState.completedRareIds) : undefined,
    ingredientShards: subs?.shardState ? { ...subs.shardState.ingredientShards } : undefined,
    blindBox: subs?.blindBox ? { ...subs.blindBox } : undefined,
  };
}

/** 安全取数字，非有限数字则返回默认值 */
function safeNum(val: unknown, fallback: number): number {
  return typeof val === 'number' && Number.isFinite(val) ? val : fallback;
}

/** 反序列化存档数据，失败返回 null */
export function deserialize(raw: unknown): SaveData | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;

  if (!Array.isArray(data.board)) return null;
  if (!data.energy || typeof data.energy !== 'object') return null;
  if (!data.economy || typeof data.economy !== 'object') return null;
  if (!Array.isArray(data.collection)) return null;

  const rawEnergy = data.energy as Record<string, unknown>;
  const rawEconomy = data.economy as Record<string, unknown>;

  const cfg = getConfig().energy;
  const energy: EnergyState = {
    current: safeNum(rawEnergy.current, 0),
    max: safeNum(rawEnergy.max, cfg.max),
    regenPerMinute: safeNum(rawEnergy.regenPerMinute, cfg.regenPerMinute),
    lastTickAt: safeNum(rawEnergy.lastTickAt, Date.now()),
  };

  const economy: EconomyState = {
    coins: safeNum(rawEconomy.coins, 0),
    diamonds: safeNum(rawEconomy.diamonds, 0),
  };

  return {
    board: (data.board as SaveData['board']).slice(0, 100),
    energy,
    economy,
    collection: data.collection.filter((id): id is string => typeof id === 'string'),
    collectionUnclaimed: Array.isArray(data.collectionUnclaimed)
      ? (data.collectionUnclaimed as unknown[]).filter((id): id is string => typeof id === 'string')
      : undefined,
    orders: data.orders,
    lastOnline: safeNum(data.lastOnline, Date.now()),
    daily: safeDaily(data.daily),
    shop: safeShop(data.shop),
    season: safeObj(data.season),
    social: safeObj(data.social),
    level: safeLevel(data.level),
    backpack: safeBackpack(data.backpack),
    bakery: safeBakery(data.bakery),
    tutorial: safeTutorial(data.tutorial),
    shards: data.shards && typeof data.shards === 'object' ? data.shards as Record<string, number> : undefined,
    completedRareIds: Array.isArray(data.completedRareIds)
      ? (data.completedRareIds as unknown[]).filter((id): id is string => typeof id === 'string')
      : undefined,
    ingredientShards: data.ingredientShards && typeof data.ingredientShards === 'object'
      ? data.ingredientShards as Record<string, number> : undefined,
    blindBox: data.blindBox && typeof data.blindBox === 'object'
      ? data.blindBox as { normalPity: number; premiumPity: number; totalOpened: number }
      : undefined,
  };
}

/** 安全取对象，非对象则返回 undefined */
function safeObj(val: unknown): unknown | undefined {
  return val && typeof val === 'object' ? val : undefined;
}

/** 校验 daily 子系统必需字段 */
function safeDaily(val: unknown): unknown | undefined {
  if (!val || typeof val !== 'object') return undefined;
  const d = val as Record<string, unknown>;
  if (typeof d.today !== 'string' || !Array.isArray(d.tasks)) return undefined;
  return val;
}

/** 校验 shop 子系统必需字段（兼容旧存档） */
function safeShop(val: unknown): unknown | undefined {
  if (!val || typeof val !== 'object') return undefined;
  const s = val as Record<string, unknown>;
  // 新格式：owned[]
  if (Array.isArray(s.owned)) return { owned: s.owned };
  // 旧格式：ownedMap{}
  if (s.ownedMap && typeof s.ownedMap === 'object') return { owned: Object.keys(s.ownedMap as Record<string, unknown>) };
  return undefined;
}

/** 校验 level 子系统必需字段 */
function safeLevel(val: unknown): unknown | undefined {
  if (!val || typeof val !== 'object') return undefined;
  const l = val as Record<string, unknown>;
  if (typeof l.level !== 'number' || typeof l.exp !== 'number') return undefined;
  return val;
}

/** 校验 backpack 子系统必需字段 */
function safeBackpack(val: unknown): unknown | undefined {
  if (!val || typeof val !== 'object') return undefined;
  const b = val as Record<string, unknown>;
  if (!Array.isArray(b.items) || typeof b.maxSlots !== 'number') return undefined;
  return val;
}

/** 校验 bakery 子系统必需字段 */
function safeBakery(val: unknown): unknown | undefined {
  if (!val || typeof val !== 'object') return undefined;
  const b = val as Record<string, unknown>;
  if (!Array.isArray(b.placed) || typeof b.backgroundId !== 'string') return undefined;
  return val;
}

/** 校验 tutorial 子系统必需字段 */
function safeTutorial(val: unknown): unknown | undefined {
  if (!val || typeof val !== 'object') return undefined;
  const t = val as Record<string, unknown>;
  if (!Array.isArray(t.completedSteps)) return undefined;
  return val;
}
