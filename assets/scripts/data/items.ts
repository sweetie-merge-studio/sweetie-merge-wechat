import type { ItemDef, ItemId, Rarity } from '../core/types';

/**
 * 多品类物品系统
 * - 每个品类有 4 个等级（Lv.1 → Lv.4）
 * - 同品类同级别合成 → 升一级
 * - 玩家等级越高，解锁越多品类
 * - 生成只生成 Lv.1 的物品（高级全靠合成）
 */

export type Category = 'bread' | 'cookie' | 'cake' | 'drink' | 'icecream' | 'candy' | 'chocolate' | 'fruit';

export interface CategoryDef {
  id: Category;
  name: string;
  emoji: string;
  /** 玩家达到此等级（completedOrders）才解锁 */
  unlockAt: number;
  items: Array<{ name: string; emoji: string }>;
}

/** 品类定义 — 按解锁顺序排列，每品类 8 个等级 */
export const CATEGORIES: readonly CategoryDef[] = [
  {
    id: 'bread', name: '面包', emoji: '🍞', unlockAt: 1,
    items: [
      { name: '白面包', emoji: '🍞' },
      { name: '全麦面包', emoji: '🥖' },
      { name: '牛角包', emoji: '🥐' },
      { name: '法棍面包', emoji: '🥯' },
      { name: '肉松面包', emoji: '🥐' },
      { name: '菠萝包', emoji: '🍞' },
      { name: '丹麦面包', emoji: '🥐' },
      { name: '国王面包', emoji: '👑' },
    ],
  },
  {
    id: 'cookie', name: '饼干', emoji: '🍪', unlockAt: 10,
    items: [
      { name: '小饼干', emoji: '🍪' },
      { name: '巧克力饼', emoji: '🍫' },
      { name: '曲奇', emoji: '🥠' },
      { name: '马卡龙', emoji: '🧁' },
      { name: '华夫饼', emoji: '🧇' },
      { name: '蛋卷', emoji: '🍪' },
      { name: '千层酥', emoji: '🥐' },
      { name: '皇家饼干', emoji: '👑' },
    ],
  },
  {
    id: 'cake', name: '蛋糕', emoji: '🍰', unlockAt: 20,
    items: [
      { name: '纸杯蛋糕', emoji: '🧁' },
      { name: '草莓蛋糕', emoji: '🍰' },
      { name: '芝士蛋糕', emoji: '🎂' },
      { name: '提拉米苏', emoji: '🍰' },
      { name: '黑森林', emoji: '🎂' },
      { name: '歌剧院蛋糕', emoji: '🍰' },
      { name: '翻糖蛋糕', emoji: '🎂' },
      { name: '婚礼蛋糕', emoji: '👑' },
    ],
  },
  {
    id: 'drink', name: '饮品', emoji: '🧋', unlockAt: 30,
    items: [
      { name: '柠檬水', emoji: '🍋' },
      { name: '奶茶', emoji: '🧋' },
      { name: '咖啡', emoji: '☕' },
      { name: '果昔', emoji: '🥤' },
      { name: '抹茶拿铁', emoji: '🍵' },
      { name: '鸡尾酒', emoji: '🍹' },
      { name: '香槟', emoji: '🥂' },
      { name: '皇家奶茶', emoji: '👑' },
    ],
  },
  {
    id: 'icecream', name: '冰淇淋', emoji: '🍦', unlockAt: 40,
    items: [
      { name: '冰棍', emoji: '🧊' },
      { name: '甜筒', emoji: '🍦' },
      { name: '圣代', emoji: '🍨' },
      { name: '雪糕三明治', emoji: '🍦' },
      { name: '冰淇淋泡芙', emoji: '🍨' },
      { name: '彩虹冰淇淋', emoji: '🌈' },
      { name: '冰淇淋火锅', emoji: '🍨' },
      { name: '冰淇淋城堡', emoji: '👑' },
    ],
  },
  {
    id: 'candy', name: '糖果', emoji: '🍬', unlockAt: 50,
    items: [
      { name: '硬糖', emoji: '🍬' },
      { name: '棒棒糖', emoji: '🍭' },
      { name: '太妃糖', emoji: '🍬' },
      { name: '软糖熊', emoji: '🧸' },
      { name: '牛轧糖', emoji: '🍬' },
      { name: '水晶糖', emoji: '💎' },
      { name: '星空糖', emoji: '✨' },
      { name: '宝石糖果', emoji: '👑' },
    ],
  },
  {
    id: 'chocolate', name: '巧克力', emoji: '🍫', unlockAt: 60,
    items: [
      { name: '牛奶巧克力', emoji: '🍫' },
      { name: '黑巧克力', emoji: '🖤' },
      { name: '松露巧克力', emoji: '🍫' },
      { name: '抹茶巧克力', emoji: '🍵' },
      { name: '手工巧克力', emoji: '🍫' },
      { name: '巧克力喷泉', emoji: '⛲' },
      { name: '金箔巧克力', emoji: '✨' },
      { name: '皇家巧克力', emoji: '👑' },
    ],
  },
  {
    id: 'fruit', name: '水果', emoji: '🍓', unlockAt: 70,
    items: [
      { name: '苹果', emoji: '🍎' },
      { name: '草莓', emoji: '🍓' },
      { name: '樱桃', emoji: '🍒' },
      { name: '芒果', emoji: '🥭' },
      { name: '蓝莓', emoji: '🫐' },
      { name: '葡萄', emoji: '🍇' },
      { name: '水果拼盘', emoji: '🥝' },
      { name: '水果宝箱', emoji: '👑' },
    ],
  },
];

// --- 原材料（烘焙原料，盲盒可获取） ---

export interface IngredientDef {
  readonly id: string;
  readonly name: string;
  readonly emoji: string;
}

export const INGREDIENTS: readonly IngredientDef[] = [
  { id: 'egg',       name: '鸡蛋', emoji: '🥚' },
  { id: 'milk',      name: '牛奶', emoji: '🥛' },
  { id: 'sugar',     name: '糖',   emoji: '🍬' },
  { id: 'flour',     name: '面粉', emoji: '🌾' },
  { id: 'butter',    name: '黄油', emoji: '🧈' },
  { id: 'cocoa',     name: '可可粉', emoji: '🍫' },
];

export const INGREDIENT_BY_ID: ReadonlyMap<string, IngredientDef> = new Map(
  INGREDIENTS.map(i => [i.id, i]),
);

/** 随机选一个原材料 ID */
export function randomIngredient(): string {
  return INGREDIENTS[Math.floor(Math.random() * INGREDIENTS.length)].id;
}

// --- 稀有图鉴物品（碎片合成，不可棋盘生成） ---

export interface RareItemDef {
  readonly id: string;
  readonly category: Category;
  readonly name: string;
  readonly emoji: string;
  /** 需要多少碎片合成 */
  readonly shardsRequired: number;
  /** 合成后解锁的图鉴钻石奖励 */
  readonly diamondReward: number;
}

export const RARE_ITEMS: readonly RareItemDef[] = [
  { id: 'bread_rare', category: 'bread', name: '彩虹吐司', emoji: '🌈', shardsRequired: 8, diamondReward: 5 },
  { id: 'cookie_rare', category: 'cookie', name: '星空马卡龙', emoji: '🌌', shardsRequired: 8, diamondReward: 5 },
  { id: 'cake_rare', category: 'cake', name: '梦幻独角兽蛋糕', emoji: '🦄', shardsRequired: 8, diamondReward: 5 },
  { id: 'drink_rare', category: 'drink', name: '极光气泡水', emoji: '🌊', shardsRequired: 8, diamondReward: 5 },
  { id: 'icecream_rare', category: 'icecream', name: '银河冰淇淋', emoji: '🌠', shardsRequired: 8, diamondReward: 5 },
  { id: 'candy_rare', category: 'candy', name: '龙息糖果', emoji: '🐉', shardsRequired: 8, diamondReward: 5 },
  { id: 'chocolate_rare', category: 'chocolate', name: '黑金松露', emoji: '🖤', shardsRequired: 8, diamondReward: 5 },
  { id: 'fruit_rare', category: 'fruit', name: '黄金果篮', emoji: '🏆', shardsRequired: 8, diamondReward: 5 },
];

export const RARE_ITEM_BY_ID: ReadonlyMap<string, RareItemDef> = new Map(
  RARE_ITEMS.map(r => [r.id, r])
);

export const RARE_ITEM_BY_CATEGORY: ReadonlyMap<Category, RareItemDef> = new Map(
  RARE_ITEMS.map(r => [r.category, r])
);

/** 碎片 ID → 品类 */
export function shardCategory(shardId: string): Category | undefined {
  const m = shardId.match(/^(\w+)_shard$/);
  return m ? m[1] as Category : undefined;
}

// --- 金币物品（棋盘上的可合成金币） ---

/** 金币物品定义：4 级合成链 coin_1→coin_2→coin_3→coin_4 */
const COIN_ITEMS: readonly { name: string; nameEn: string; emoji: string }[] = [
  { name: '1枚金币', nameEn: '1 Coin', emoji: '🪙' },
  { name: '3枚金币', nameEn: '3 Coins', emoji: '🪙' },
  { name: '一堆金币', nameEn: 'Coin Pile', emoji: '💰' },
  { name: '一箱金币', nameEn: 'Coin Chest', emoji: '📦' },
];

/** 金币物品最大等级 */
export const COIN_MAX_LEVEL = COIN_ITEMS.length;

/** 金币宝箱（coin_4）领取后获得的金币数 */
export const COIN_CHEST_VALUE = 50;

/** 触发金币掉落的最低合成产物等级 */
export const COIN_DROP_MIN_LEVEL = 4;

/** 生成金币 ItemDef 列表 */
function buildCoinItems(): ItemDef[] {
  return COIN_ITEMS.map((ci, idx) => {
    const level = idx + 1;
    return {
      id: `coin_${level}` as ItemId,
      name: ci.name,
      level,
      rarity: 'common' as Rarity,
      emoji: ci.emoji,
      nextId: level < COIN_ITEMS.length ? `coin_${level + 1}` as ItemId : undefined,
      energyCost: 0,
      spawnWeight: 0, // 不自然生成
    };
  });
}

/** 是否是金币物品 */
export function isCoinItem(itemId: ItemId): boolean {
  return itemId.startsWith('coin_');
}

/** 是否是满级金币（可以点击领取） */
export function isMaxCoin(itemId: ItemId): boolean {
  return itemId === `coin_${COIN_MAX_LEVEL}`;
}

// --- 钻石物品（棋盘上的可合成钻石） ---

/** 钻石物品定义：4 级合成链 diamond_1→diamond_2→diamond_3→diamond_4 */
const DIAMOND_ITEMS: readonly { name: string; nameEn: string; emoji: string }[] = [
  { name: '1颗钻石', nameEn: '1 Diamond', emoji: '💎' },
  { name: '3颗钻石', nameEn: '3 Diamonds', emoji: '💎' },
  { name: '一堆钻石', nameEn: 'Diamond Pile', emoji: '💎' },
  { name: '一箱钻石', nameEn: 'Diamond Chest', emoji: '💎' },
];

export const DIAMOND_MAX_LEVEL = DIAMOND_ITEMS.length;
export const DIAMOND_CHEST_VALUE = 10;

function buildDiamondItems(): ItemDef[] {
  return DIAMOND_ITEMS.map((di, idx) => {
    const level = idx + 1;
    return {
      id: `diamond_${level}` as ItemId,
      name: di.name,
      level,
      rarity: 'common' as Rarity,
      emoji: di.emoji,
      nextId: level < DIAMOND_ITEMS.length ? `diamond_${level + 1}` as ItemId : undefined,
      energyCost: 0,
      spawnWeight: 0,
    };
  });
}

export function isDiamondItem(itemId: ItemId): boolean {
  return itemId.startsWith('diamond_');
}

export function isMaxDiamond(itemId: ItemId): boolean {
  return itemId === `diamond_${DIAMOND_MAX_LEVEL}`;
}

// --- 精力物品（棋盘上的可合成精力） ---

/** 精力物品定义：4 级合成链 energy_1→energy_2→energy_3→energy_4 */
const ENERGY_ITEMS: readonly { name: string; nameEn: string; emoji: string }[] = [
  { name: '1点精力', nameEn: '1 Energy', emoji: '⚡' },
  { name: '3点精力', nameEn: '3 Energy', emoji: '⚡' },
  { name: '一堆精力', nameEn: 'Energy Pile', emoji: '⚡' },
  { name: '一箱精力', nameEn: 'Energy Chest', emoji: '⚡' },
];

export const ENERGY_MAX_LEVEL = ENERGY_ITEMS.length;
export const ENERGY_CHEST_VALUE = 30;

function buildEnergyItems(): ItemDef[] {
  return ENERGY_ITEMS.map((ei, idx) => {
    const level = idx + 1;
    return {
      id: `energy_${level}` as ItemId,
      name: ei.name,
      level,
      rarity: 'common' as Rarity,
      emoji: ei.emoji,
      nextId: level < ENERGY_ITEMS.length ? `energy_${level + 1}` as ItemId : undefined,
      energyCost: 0,
      spawnWeight: 0,
    };
  });
}

export function isEnergyItem(itemId: ItemId): boolean {
  return itemId.startsWith('energy_');
}

export function isMaxEnergy(itemId: ItemId): boolean {
  return itemId === `energy_${ENERGY_MAX_LEVEL}`;
}

/** 是否是货币类物品（金币/钻石/精力） */
export function isCurrencyItem(itemId: ItemId): boolean {
  return isCoinItem(itemId) || isDiamondItem(itemId) || isEnergyItem(itemId);
}

// --- 生成 ItemDef 列表 ---

function rarity(level: number): Rarity {
  if (level <= 2) return 'common';
  if (level <= 4) return 'uncommon';
  if (level <= 6) return 'rare';
  if (level === 7) return 'epic';
  return 'legendary';
}

function energyCost(level: number): number {
  if (level <= 3) return 1;
  if (level <= 5) return 2;
  if (level <= 7) return 3;
  return 4;
}

/** 从品类定义生成物品列表 */
function buildItems(categories: readonly CategoryDef[]): ItemDef[] {
  const items: ItemDef[] = [];
  for (const cat of categories) {
    for (let lvIdx = 0; lvIdx < cat.items.length; lvIdx++) {
      const level = lvIdx + 1;
      const ci = cat.items[lvIdx];
      const id = `${cat.id}_${level}` as ItemId;
      const nextId = level < cat.items.length ? `${cat.id}_${level + 1}` as ItemId : undefined;

      items.push({
        id,
        name: ci.name,
        level,
        rarity: rarity(level),
        emoji: ci.emoji,
        nextId,
        energyCost: energyCost(level),
        spawnWeight: level === 1 ? 10 : 0,
      });
    }
  }
  return items;
}

// --- 可变物品注册表（支持远程热更新） ---

/** 将稀有图鉴物品转为 ItemDef（level 9, mythic, 不自然生成） */
function buildRareItemDefs(): ItemDef[] {
  return RARE_ITEMS.map(r => ({
    id: r.id as ItemId,
    name: r.name,
    level: 9,
    rarity: 'mythic' as Rarity,
    emoji: r.emoji,
    energyCost: 0,
    spawnWeight: 0,
  }));
}

let _categories: readonly CategoryDef[] = CATEGORIES;
let _coinItems: readonly ItemDef[] = buildCoinItems();
let _diamondItems: readonly ItemDef[] = buildDiamondItems();
let _energyItems: readonly ItemDef[] = buildEnergyItems();
let _rareItemDefs: readonly ItemDef[] = buildRareItemDefs();
let _items: readonly ItemDef[] = [...buildItems(CATEGORIES), ..._coinItems, ..._diamondItems, ..._energyItems, ..._rareItemDefs];
let _itemById: ReadonlyMap<ItemId, ItemDef> = new Map(_items.map(item => [item.id, item]));
let _spawnableItems: readonly ItemDef[] = _items.filter(i => i.spawnWeight > 0);

/** 当前生效的品类定义（远程更新后返回新数据） */
export function getCategories(): readonly CategoryDef[] { return _categories; }

/** 全部物品定义 */
export function getItems(): readonly ItemDef[] { return _items; }
/** @deprecated 直接引用将不再更新，请改用 getItems() */
export { _items as ITEMS };

/** ID → 定义 */
export function getItemById(): ReadonlyMap<ItemId, ItemDef> { return _itemById; }
/** @deprecated 直接引用将不再更新，请改用 getItemById() */
export { _itemById as ITEM_BY_ID };

/** 可自然生成的物品（Lv.1） */
export function getSpawnableItems(): readonly ItemDef[] { return _spawnableItems; }
/** @deprecated 直接引用将不再更新，请改用 getSpawnableItems() */
export { _spawnableItems as SPAWNABLE_ITEMS };

/**
 * 用服务端品类数据重新生成物品注册表
 * 调用后 getItems() / getItemById() / getSpawnableItems() 返回新数据
 */
/** 合法品类 ID 集合（防止服务端下发未知品类污染类型系统） */
const VALID_CATEGORY_IDS = new Set<string>(CATEGORIES.map(c => c.id));

export function reloadItems(serverCategories: CategoryDef[]): void {
  // 仅接受合法品类 ID，过滤掉未知品类
  const validated = serverCategories.filter(c =>
    VALID_CATEGORY_IDS.has(c.id) && Array.isArray(c.items) && c.items.length > 0,
  );
  if (validated.length === 0) return; // 全部不合法则保持本地数据
  _categories = validated;
  _coinItems = buildCoinItems();
  _diamondItems = buildDiamondItems();
  _energyItems = buildEnergyItems();
  _rareItemDefs = buildRareItemDefs();
  _items = [...buildItems(validated), ..._coinItems, ..._diamondItems, ..._energyItems, ..._rareItemDefs];
  _itemById = new Map(_items.map(item => [item.id, item]));
  _spawnableItems = _items.filter(i => i.spawnWeight > 0);
}

/** 按权重随机生成（只在已解锁品类中） */
export function randomSpawnItem(unlockedCategories?: Set<Category>): ItemDef {
  const spawnable = _spawnableItems;
  const pool = unlockedCategories
    ? spawnable.filter(i => unlockedCategories.has(getCategory(i.id)!))
    : [...spawnable];

  if (pool.length === 0) return spawnable[0];

  const total = pool.reduce((s, i) => s + i.spawnWeight, 0);
  let r = Math.random() * total;
  for (const item of pool) {
    r -= item.spawnWeight;
    if (r <= 0) return item;
  }
  return pool[pool.length - 1];
}

/** 合成判定：同品类同级别 → 返回下一级 ID */
export function getMergeResult(aId?: ItemId, bId?: ItemId): ItemId | undefined {
  if (!aId || !bId || aId !== bId) return undefined;
  const def = _itemById.get(aId);
  return def?.nextId;
}

/** 获取物品所属品类（货币类物品无品类） */
export function getCategory(itemId: ItemId): Category | undefined {
  if (isCurrencyItem(itemId)) return undefined;
  const parts = itemId.split('_');
  return parts[0] as Category;
}

/** 获取展示名 */
export function getDisplayName(itemId: ItemId): string {
  const def = _itemById.get(itemId);
  if (!def) return itemId;
  return `${def.emoji} ${def.name}`;
}

/** 获取展示 emoji */
export function getDisplayEmoji(itemId: ItemId): string {
  return _itemById.get(itemId)?.emoji ?? '?';
}

/** 根据已完成订单数获取已解锁品类 */
export function getUnlockedCategories(completedOrders: number): Set<Category> {
  const unlocked = new Set<Category>();
  for (const cat of _categories) {
    if (completedOrders >= cat.unlockAt) {
      unlocked.add(cat.id);
    }
  }
  return unlocked;
}

// --- 母棋（品类生成器） ---

/** 母棋 ID 格式：mother_bread, mother_cookie ... */
export function getMotherItemId(category: Category): ItemId {
  return `mother_${category}` as ItemId;
}

/** 是否是母棋 */
export function isMother(itemId: ItemId): boolean {
  return itemId.startsWith('mother_');
}

/** 获取母棋对应的品类 */
export function getMotherCategory(itemId: ItemId): Category | undefined {
  if (!isMother(itemId)) return undefined;
  return itemId.replace('mother_', '') as Category;
}

/** 获取母棋展示信息 */
export function getMotherDisplay(itemId: ItemId): { emoji: string; name: string } | null {
  const cat = getMotherCategory(itemId);
  if (!cat) return null;
  const def = _categories.find(c => c.id === cat);
  if (!def) return null;
  return { emoji: `🏭${def.emoji}`, name: `${def.name}工坊` };
}

/** 点击母棋 → 生成该品类 Lv.1 物品的 ID */
export function getMotherSpawnId(itemId: ItemId): ItemId | undefined {
  const cat = getMotherCategory(itemId);
  if (!cat) return undefined;
  return `${cat}_1` as ItemId;
}

/**
 * 返回物品图片在 resources bundle 中的相对路径（无扩展名，供 resources.load 使用）
 * - 普通物品：sprites/items/{category}/{category}_{level}
 * - 母棋：    sprites/mothers/mother_{category}
 * - 金币：    sprites/currency/coin
 * - 钻石：    sprites/currency/diamond
 * - 精力：    sprites/ui/energy_bolt
 * - 未知：    返回空字符串
 */
export function getItemSpritePath(itemId: ItemId): string {
  if (isMother(itemId)) {
    const cat = getMotherCategory(itemId);
    return cat ? `sprites/mothers/mother_${cat}` : '';
  }
  if (isCoinItem(itemId)) return 'sprites/currency/coin';
  if (isDiamondItem(itemId)) return 'sprites/currency/diamond';
  if (isEnergyItem(itemId)) return 'sprites/ui/energy_bolt';

  const parts = itemId.split('_');
  if (parts.length < 2) return '';
  const category = parts[0];
  return `sprites/items/${category}/${itemId}`;
}
