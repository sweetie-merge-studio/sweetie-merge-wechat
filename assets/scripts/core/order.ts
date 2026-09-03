import type { ItemId } from './types';
import { getItems, getItemById } from '../data/items';
import type { Category } from '../data/items';
import { getUnlockedCategoriesByLevel } from './level';

/** 订单难度 */
export type OrderDifficulty = 'easy' | 'normal' | 'hard' | 'rare';

/** 顾客头像数量 */
const CUSTOMER_COUNT = 10;

/** 从已有订单中选一个不重复的头像编号 */
function pickUniqueAvatar(existingOrders: readonly Order[]): number {
  const used = new Set(existingOrders.map(o => o.avatar).filter(Boolean));
  // 优先选未使用的
  const available = [];
  for (let i = 1; i <= CUSTOMER_COUNT; i++) {
    if (!used.has(i)) available.push(i);
  }
  if (available.length > 0) {
    return available[Math.floor(Math.random() * available.length)];
  }
  // 全部用过了就随机
  return Math.floor(Math.random() * CUSTOMER_COUNT) + 1;
}

/** 订单定义 */
export interface Order {
  id: string;
  difficulty: OrderDifficulty;
  requirements: OrderRequirement[];
  reward: { coins: number; energy?: number };
  timeLimit?: number;
  createdAt: number;
  /** 顾客头像编号 1~7 */
  avatar: number;
}

/** 单个交付需求 */
export interface OrderRequirement {
  itemId: ItemId;
  fulfilled: boolean;
  /** 匹配到的棋盘格子索引（物品还在棋盘上，领取时才消耗） */
  matchedBoardIdx?: number;
}

/** 已完成订单记录 */
export interface CompletedOrderRecord {
  id: string;
  items: ItemId[];
  coins: number;
  difficulty: OrderDifficulty;
  completedAt: number;
}

/** 订单状态（存档用） */
export interface OrderState {
  activeOrders: Order[];
  completedCount: number;
  nextId: number;
  /** 今日已完成的订单历史（每日重置） */
  completedHistory?: CompletedOrderRecord[];
  /** 历史记录日期标记 (YYYY-MM-DD)，用于跨日清理 */
  historyDate?: string;
}

const VALID_DIFFICULTIES: readonly string[] = ['easy', 'normal', 'hard', 'rare'];

/** 难度选项顺序（与权重数组一一对应） */
const DIFFICULTY_OPTIONS: readonly OrderDifficulty[] = ['easy', 'normal', 'hard', 'rare'];

/** 按权重数组从选项中随机选取（权重和应为 1） */
function weightedPick<T>(options: readonly T[], weights: readonly number[]): T {
  const r = Math.random();
  let acc = 0;
  for (let i = 0; i < options.length; i++) {
    acc += weights[i];
    if (r < acc) return options[i];
  }
  return options[options.length - 1];
}

function isValidRequirement(value: unknown): value is OrderRequirement {
  if (!value || typeof value !== 'object') return false;
  const req = value as Record<string, unknown>;
  return typeof req.itemId === 'string' && typeof req.fulfilled === 'boolean';
}

function isValidOrder(value: unknown): value is Order {
  if (!value || typeof value !== 'object') return false;
  const order = value as Record<string, unknown>;
  if (typeof order.id !== 'string') return false;
  if (typeof order.difficulty !== 'string' || !VALID_DIFFICULTIES.includes(order.difficulty)) return false;
  if (!Array.isArray(order.requirements) || order.requirements.length === 0) return false;
  if (!order.requirements.every(isValidRequirement)) return false;
  const reward = order.reward as Record<string, unknown> | undefined;
  if (!reward || typeof reward !== 'object' || typeof reward.coins !== 'number') return false;
  return typeof order.createdAt === 'number' && typeof order.avatar === 'number';
}

/** 存档中的 orders 字段未经 deserialize 校验，读回前用本守卫验证结构 */
export function isValidOrderState(value: unknown): value is OrderState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Record<string, unknown>;
  if (!Array.isArray(state.activeOrders) || !state.activeOrders.every(isValidOrder)) return false;
  return typeof state.completedCount === 'number' && typeof state.nextId === 'number';
}

// --- 订单配置 ---

/** 每个等级物品的金币价值 */
const ITEM_VALUE_BY_LEVEL: Record<number, number> = {
  1: 10,
  2: 25,
  3: 50,
  4: 100,
  5: 200,
  6: 400,
  7: 800,
  8: 1500,
};

/** 获取物品的金币价值 */
export function getItemValue(itemId: ItemId): number {
  const def = getItemById().get(itemId);
  if (!def) return 0;
  return ITEM_VALUE_BY_LEVEL[def.level] ?? 0;
}

interface DifficultyConfig {
  levelRange: [number, number]; // 物品等级范围
  itemCount: number;
  energy?: number;
  timeLimit?: number;
}

const DIFFICULTY_CONFIG: Record<OrderDifficulty, DifficultyConfig> = {
  easy:   { levelRange: [1, 3], itemCount: 2 },
  normal: { levelRange: [2, 4], itemCount: 2, timeLimit: 30 * 60 * 1000 },
  hard:   { levelRange: [3, 6], itemCount: 2, timeLimit: 60 * 60 * 1000 },
  rare:   { levelRange: [5, 8], itemCount: 2, energy: 20, timeLimit: 3 * 60 * 60 * 1000 },
};

const DEFAULT_MAX_ORDERS = 6;

/** 创建初始订单状态 */
export function createOrderState(playerLevel: number = 1): OrderState {
  const state: OrderState = { activeOrders: [], completedCount: 0, nextId: 1 };
  // 第一个订单固定为 bread_2（新手引导能完成的最简订单）
  const firstId = `order_${state.nextId++}`;
  state.activeOrders.push({
    id: firstId,
    difficulty: 'easy',
    requirements: [{ itemId: 'bread_2', fulfilled: false }],
    reward: { coins: getItemValue('bread_2') },
    createdAt: Date.now(),
    avatar: 1,
  });
  while (state.activeOrders.length < DEFAULT_MAX_ORDERS) {
    state.activeOrders.push(generateOrder(state, playerLevel));
  }
  return state;
}

/**
 * 新手期锯齿难度表（等级 1–12，蓝图 01 §2）：
 * 每 3–4 级一个小周期，周期开头放松、周期末收紧；卡点在等级 5（第一次能量压力，
 * 建立广告位价值感）和等级 12（留存卡点，配合品类解锁张力）。数值全部 [待测试]，
 * 上线前自己玩一轮再定。每行 [easy, normal, hard, rare]，行内和为 1。
 */
const EARLY_DIFFICULTY_TABLE: Record<number, [number, number, number, number]> = {
  1:  [1.00, 0.00, 0.00, 0.00], // 教学段：不允许卡住
  2:  [1.00, 0.00, 0.00, 0.00],
  3:  [0.70, 0.30, 0.00, 0.00], // 周期一：开始收紧
  4:  [0.50, 0.50, 0.00, 0.00],
  5:  [0.25, 0.55, 0.20, 0.00], // 卡点一：hard 首次登场，能量压力
  6:  [0.55, 0.45, 0.00, 0.00], // 周期二：放松回血
  7:  [0.40, 0.50, 0.10, 0.00],
  8:  [0.30, 0.55, 0.15, 0.00],
  9:  [0.45, 0.45, 0.10, 0.00], // 周期三：放松
  10: [0.30, 0.50, 0.20, 0.00],
  11: [0.20, 0.50, 0.30, 0.00],
  12: [0.10, 0.45, 0.40, 0.05], // 卡点二：留存卡点，rare 首次露头
};

/** 根据玩家等级选择难度 */
function pickDifficulty(playerLevel: number): OrderDifficulty {
  const row = EARLY_DIFFICULTY_TABLE[playerLevel];
  if (row) return weightedPick(DIFFICULTY_OPTIONS, row);
  // 13 级以后：大师期曲线（easy 5% / normal 25% / hard 40% / rare 30%）
  return weightedPick(DIFFICULTY_OPTIONS, [0.05, 0.25, 0.40, 0.30]);
}

/**
 * 根据玩家等级计算订单中物品的最大等级上限
 * 玩家等级低时不应出现过高等级的物品
 */
function getMaxItemLevelForPlayer(playerLevel: number): number {
  if (playerLevel <= 2) return 3;
  if (playerLevel <= 4) return 4;
  if (playerLevel <= 7) return 5;
  if (playerLevel <= 11) return 6;
  if (playerLevel <= 15) return 7;
  return 8;
}

/** 预构建的候选物品池（含权重） */
interface ItemPool {
  ids: ItemId[];
  weights: number[];
  totalWeight: number;
}

/** 构建候选物品池 + 权重（一次 filter，重试时复用） */
function buildItemPool(playerLevel: number, minLevel: number, maxLevel: number): ItemPool {
  const unlocked = getUnlockedCategoriesByLevel(playerLevel);
  const items = getItems().filter(i => {
    const cat = i.id.split('_')[0] as Category;
    return unlocked.has(cat) && i.level >= minLevel && i.level <= maxLevel;
  });
  if (items.length === 0) return { ids: ['bread_1'], weights: [1], totalWeight: 1 };
  const ids = items.map(i => i.id);
  const weights = items.map(i => i.level * i.level * i.level);
  const totalWeight = weights.reduce((s, w) => s + w, 0);
  return { ids, weights, totalWeight };
}

/** 从预构建池中按权重随机选取 */
function weightedPickFromPool(pool: ItemPool): ItemId {
  let roll = Math.random() * pool.totalWeight;
  for (let i = 0; i < pool.ids.length; i++) {
    roll -= pool.weights[i];
    if (roll <= 0) return pool.ids[i];
  }
  return pool.ids[pool.ids.length - 1];
}

/** 生成一个新订单 */
export function generateOrder(state: OrderState, playerLevel: number = 15): Order {
  const difficulty = pickDifficulty(playerLevel);
  const config = DIFFICULTY_CONFIG[difficulty];
  const id = `order_${state.nextId++}`;
  const avatar = pickUniqueAvatar(state.activeOrders);

  // 用玩家等级限制物品等级上限
  const playerMaxLevel = getMaxItemLevelForPlayer(playerLevel);
  const effectiveMinLevel = Math.min(config.levelRange[0], playerMaxLevel);
  const effectiveMaxLevel = Math.min(config.levelRange[1], playerMaxLevel);

  // 预构建候选池 + 权重，避免重试时重复 filter
  const pool = buildItemPool(playerLevel, effectiveMinLevel, effectiveMaxLevel);

  const requirements: OrderRequirement[] = [];
  const usedIds = new Set<ItemId>();
  for (let i = 0; i < config.itemCount; i++) {
    let itemId = weightedPickFromPool(pool);
    for (let retry = 0; retry < 10 && usedIds.has(itemId); retry++) {
      itemId = weightedPickFromPool(pool);
    }
    usedIds.add(itemId);
    requirements.push({ itemId, fulfilled: false });
  }

  return {
    id,
    difficulty,
    requirements,
    reward: {
      coins: requirements.reduce((sum, req) => sum + getItemValue(req.itemId), 0),
      energy: config.energy,
    },
    timeLimit: config.timeLimit,
    createdAt: Date.now(),
    avatar,
  };
}

/** 尝试交付物品给订单 */
export function fulfillItem(order: Order, itemId: ItemId): boolean {
  const req = order.requirements.find(r => !r.fulfilled && r.itemId === itemId);
  if (!req) return false;
  req.fulfilled = true;
  return true;
}

/** 订单是否全部完成 */
export function isOrderComplete(order: Order): boolean {
  return order.requirements.every(r => r.fulfilled);
}

/** 订单是否超时 */
export function isOrderExpired(order: Order, now: number): boolean {
  if (!order.timeLimit) return false;
  return now - order.createdAt >= order.timeLimit;
}

/** 完成订单：移除，补充新订单，返回奖励 */
export function completeOrder(state: OrderState, orderId: string, maxOrders: number = DEFAULT_MAX_ORDERS, playerLevel: number = 15): Order['reward'] | null {
  const idx = state.activeOrders.findIndex(o => o.id === orderId);
  if (idx < 0) return null;

  const order = state.activeOrders[idx];
  if (!isOrderComplete(order)) return null;

  const reward = order.reward;
  state.activeOrders.splice(idx, 1);
  state.completedCount++;

  while (state.activeOrders.length < maxOrders) {
    state.activeOrders.push(generateOrder(state, playerLevel));
  }

  return reward;
}

/** 刷新过期订单 */
export function refreshExpiredOrders(state: OrderState, now: number, playerLevel: number = 15): void {
  for (let i = 0; i < state.activeOrders.length; i++) {
    if (isOrderExpired(state.activeOrders[i], now)) {
      state.activeOrders[i] = generateOrder(state, playerLevel);
    }
  }
}

/** 获取订单物品展示名 */
export function getOrderItemName(itemId: ItemId): string {
  const def = getItemById().get(itemId);
  if (!def) return '???';
  return `${def.emoji} ${def.name}`;
}

/** 获取订单剩余时间（毫秒） */
export function getRemainingTime(order: Order, now: number): number {
  if (!order.timeLimit) return -1;
  return Math.max(0, order.timeLimit - (now - order.createdAt));
}
