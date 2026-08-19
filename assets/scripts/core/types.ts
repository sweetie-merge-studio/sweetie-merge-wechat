/** 物品唯一标识 */
export type ItemId = string;

/** 稀有度 */
export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic';

/** 物品定义 */
export interface ItemDef {
  readonly id: ItemId;
  readonly name: string;
  readonly level: number;
  readonly rarity: Rarity;
  readonly emoji: string;
  readonly nextId?: ItemId;
  readonly energyCost: number;
  readonly spawnWeight: number; // 出现权重（概率由 weight / totalWeight 决定）
}

/** 棋盘格子 */
export interface Cell {
  itemId?: ItemId;
}

/** 精力状态 */
export interface EnergyState {
  current: number;
  max: number;
  regenPerMinute: number;
  lastTickAt: number; // epoch ms
}

/** 金币状态 */
export interface EconomyState {
  coins: number;
  diamonds: number;
}

/** 图鉴状态 */
export interface CollectionState {
  unlockedIds: Set<ItemId>;
  /** 已解锁但钻石奖励未领取的物品 */
  unclaimedIds: Set<ItemId>;
}

/** 碎片状态 */
export interface ShardState {
  /** 各品类碎片数 { category → count }，上限 8 */
  shards: Record<string, number>;
  /** 已合成的稀有物品 ID */
  completedRareIds: Set<string>;
  /** 原材料碎片数 { ingredientId → count } */
  ingredientShards: Record<string, number>;
}

/** 盲盒保底状态 */
export interface BlindBoxState {
  /** 普通盲盒连续未出碎片次数 */
  normalPity: number;
  /** 高级盲盒连续未出碎片次数 */
  premiumPity: number;
  /** 总开箱次数 */
  totalOpened: number;
}

/** 盲盒抽取结果 */
export interface BlindBoxResult {
  type: 'coins' | 'energy' | 'shard' | 'targetShard' | 'item' | 'ingredientShard';
  /** 碎片所属品类 */
  category?: string;
  /** 金币/精力数量 或 碎片数量 */
  amount: number;
  /** 物品奖励的 itemId */
  itemId?: ItemId;
  /** 原材料碎片 ID（ingredientShard 时使用） */
  ingredientId?: string;
}

/** 存档数据 */
export interface SaveData {
  board: Array<{ itemId?: ItemId }>;
  energy: EnergyState;
  economy: EconomyState;
  collection: string[]; // Set 序列化为数组
  collectionUnclaimed?: string[]; // 未领取钻石奖励的物品 ID
  orders?: unknown;     // OrderState（可选，兼容旧存档）
  lastOnline: number;
  // --- 子系统（可选，兼容旧存档） ---
  daily?: unknown;
  shop?: unknown;
  season?: unknown;
  social?: unknown;
  level?: unknown;
  backpack?: unknown;
  bakery?: unknown;
  tutorial?: unknown;
  // --- 稀有图鉴 & 盲盒 ---
  shards?: Record<string, number>;
  completedRareIds?: string[];
  blindBox?: { normalPity: number; premiumPity: number; totalOpened: number };
  ingredientShards?: Record<string, number>;
}

/** 平台接口 */
export interface Platform {
  /** 平台标识（'web' / 'wechat' / 'douyin'），登录时上报给服务端 */
  readonly name: string;
  save(data: SaveData): void;
  load(): SaveData | null;
  showRewardedAd(): Promise<boolean>;
  showInterstitialAd(): Promise<void>;
  /** 登录并获取用户标识（微信返回 openid，web 返回本地 ID） */
  login(): Promise<{ openid: string }>;
  /** 分享游戏（返回是否成功） */
  share(title: string, imageUrl?: string): Promise<boolean>;
  /** 云存档：上传 */
  cloudSave?(data: SaveData): Promise<boolean>;
  /** 云存档：下载（返回 null 表示无云端存档） */
  cloudLoad?(): Promise<SaveData | null>;
}
