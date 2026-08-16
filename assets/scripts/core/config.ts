/**
 * 配置中心 — 统一管理功能参数
 *
 * 使用方式：
 * 1. 本地开发：直接改这个文件
 * 2. 上线后：可由云端下发覆盖（plan3 S11 赛季热更新）
 *
 * 注意：shop/season/social 功能开关默认关闭，由服务端远程配置开启
 */

import { assetUrl } from './asset-url';

export interface AppConfig {
  // --- 功能开关（false = 完全不渲染，不占资源） ---
  features: {
    /** 钻石货币体系 */
    diamond: boolean;
    /** 每日任务+签到 */
    daily: boolean;
    /** 订单系统 */
    orders: boolean;
    /** 离线收益 */
    offlineReward: boolean;
    /** 图鉴 */
    collection: boolean;
    /** 商店 */
    shop: boolean;
    /** 赛季 */
    season: boolean;
    /** 社交 */
    social: boolean;
    /** IAP 内购 */
    iap: boolean;
    /** 盲盒 */
    blindbox: boolean;
    /** 钻石消费（能量购买/订单刷新等） */
    diamondSpend: boolean;
    /** 商店-装饰物区块 */
    shopDeco: boolean;
    /** 图鉴-稀有类 Tab */
    collectionRare: boolean;
  };

  // --- 底部导航栏（按顺序显示，enabled=false 不渲染） ---
  bottomNav: Array<{
    id: string;
    label: string;
    labelEn?: string;
    emoji: string;
    icon?: string;
    enabled: boolean;
  }>;

  // --- 精力参数 ---
  energy: {
    max: number;
    regenPerMinute: number;
    adReward: number;
    motherCost: number;
    /** 金币购买精力：每次获得的精力 */
    coinRefillAmount: number;
    /** 金币购买精力：价格 */
    coinRefillCost: number;
    /** 金币购买精力：每日次数上限 */
    coinRefillDailyLimit: number;
  };

  // --- 金币参数 ---
  economy: {
    mergeRewardMultiplier: number;  // 合成奖励 = level * multiplier
    recycleRewardMultiplier: number;
    orderDoubleEnabled: boolean;    // 订单翻倍广告
  };

  // --- 钻石参数 ---
  diamond: {
    signInDay7Reward: number;
    categoryUnlockReward: number;
    dailyTaskReward: number;
    rareOrderReward: number;
    dailyChestDiamond: number;
    energyRefillCost: number;
    orderRefreshCost: number;
  };

  // --- 订单参数 ---
  order: {
    maxActive: number;
    newUserProtectCount: number; // 前 N 单不弹插屏
  };

  // --- 广告参数 ---
  ad: {
    interstitialMinInterval: number; // 毫秒
    interstitialMaxPerDay: number;
    newUserProtectMs: number;        // 新用户保护时长
    batchClearThreshold: number;     // 低级物品堆积阈值
  };

  // --- 棋盘参数 ---
  board: {
    size: number;
  };
}

/** 默认配置 — 当前线上版本 */
export const DEFAULT_CONFIG: AppConfig = {
  features: {
    diamond: true,
    daily: true,
    orders: true,
    offlineReward: true,
    collection: true,
    shop: true,
    season: false,
    social: false,
    iap: false,
    blindbox: false,
    diamondSpend: false,
    shopDeco: false,
    collectionRare: false,
  },

  bottomNav: [
    { id: 'daily',      label: '每日', labelEn: 'Daily',     emoji: '📅', icon: assetUrl('/assets/icons/nav/nav_daily.webp'), enabled: true },
    { id: 'collection', label: '图鉴', labelEn: 'Journal',   emoji: '📖', icon: assetUrl('/assets/icons/nav/nav_collection.webp'), enabled: true },
    { id: 'home',       label: '首页', labelEn: 'Home',      emoji: '🏠', icon: assetUrl('/assets/icons/nav/nav_home.webp'), enabled: true },
    { id: 'backpack',   label: '背包', labelEn: 'Backpack',  emoji: '🎒', icon: assetUrl('/assets/icons/nav/nav_backpack.webp'), enabled: true },
    { id: 'shop',       label: '商店', labelEn: 'Shop',      emoji: '🏪', icon: assetUrl('/assets/icons/nav/nav_shop.webp'), enabled: true },
  ],

  energy: {
    max: 100,
    regenPerMinute: 0.33, // 每 3 分钟 +1
    adReward: 20,
    motherCost: 3,        // 每次点击母棋消耗 3 精力
    coinRefillAmount: 30,  // 金币购买：每次+30精力
    coinRefillCost: 500,   // 金币购买：500金币/次
    coinRefillDailyLimit: 5, // 金币购买：每日最多5次
  },

  economy: {
    mergeRewardMultiplier: 5,
    recycleRewardMultiplier: 10,
    orderDoubleEnabled: true,
  },

  diamond: {
    signInDay7Reward: 8,
    categoryUnlockReward: 10,
    dailyTaskReward: 3,
    rareOrderReward: 5,
    dailyChestDiamond: 1,       // 每日任务宝箱额外奖励钻石
    energyRefillCost: 10,
    orderRefreshCost: 5,
  },

  order: {
    maxActive: 6,
    newUserProtectCount: 3,
  },

  ad: {
    interstitialMinInterval: 5 * 60 * 1000,
    interstitialMaxPerDay: 8,
    newUserProtectMs: 5 * 60 * 1000,
    batchClearThreshold: 12,
  },

  board: {
    size: 6,
  },
};

// --- 运行时配置（可被云端覆盖） ---

let currentConfig: AppConfig = { ...DEFAULT_CONFIG };

/** 获取当前配置 */
export function getConfig(): Readonly<AppConfig> {
  return currentConfig;
}

/** 将数值约束在合理范围内 */
function clampNum(val: unknown, min: number, max: number, fallback: number): number {
  if (typeof val !== 'number' || !Number.isFinite(val)) return fallback;
  return Math.max(min, Math.min(val, max));
}

/** 覆盖配置（云端下发时调用），带边界校验防止恶意/错误值。整体替换 currentConfig 避免持有子对象引用失效 */
export function mergeConfig(partial: Partial<AppConfig>): void {
  const prev = currentConfig;

  const features = partial.features
    ? { ...prev.features, ...partial.features }
    : prev.features;

  const bottomNav = partial.bottomNav ?? prev.bottomNav;

  const energy = partial.energy
    ? {
        ...prev.energy,
        ...partial.energy,
        max: clampNum(partial.energy.max, 10, 500, prev.energy.max),
        regenPerMinute: clampNum(partial.energy.regenPerMinute, 0.01, 5, prev.energy.regenPerMinute),
        adReward: clampNum(partial.energy.adReward, 1, 100, prev.energy.adReward),
        motherCost: clampNum(partial.energy.motherCost, 1, 20, prev.energy.motherCost),
        coinRefillAmount: clampNum(partial.energy.coinRefillAmount, 1, 200, prev.energy.coinRefillAmount),
        coinRefillCost: clampNum(partial.energy.coinRefillCost, 50, 5000, prev.energy.coinRefillCost),
        coinRefillDailyLimit: clampNum(partial.energy.coinRefillDailyLimit, 0, 20, prev.energy.coinRefillDailyLimit),
      }
    : prev.energy;

  const economy = partial.economy
    ? {
        ...prev.economy,
        ...partial.economy,
        mergeRewardMultiplier: clampNum(partial.economy.mergeRewardMultiplier, 1, 50, prev.economy.mergeRewardMultiplier),
        recycleRewardMultiplier: clampNum(partial.economy.recycleRewardMultiplier, 1, 100, prev.economy.recycleRewardMultiplier),
      }
    : prev.economy;

  const diamond = partial.diamond
    ? {
        ...prev.diamond,
        ...partial.diamond,
        signInDay7Reward: clampNum(partial.diamond.signInDay7Reward, 0, 100, prev.diamond.signInDay7Reward),
        categoryUnlockReward: clampNum(partial.diamond.categoryUnlockReward, 0, 200, prev.diamond.categoryUnlockReward),
        dailyTaskReward: clampNum(partial.diamond.dailyTaskReward, 0, 50, prev.diamond.dailyTaskReward),
        rareOrderReward: clampNum(partial.diamond.rareOrderReward, 0, 50, prev.diamond.rareOrderReward),
        dailyChestDiamond: clampNum(partial.diamond.dailyChestDiamond, 0, 20, prev.diamond.dailyChestDiamond),
        energyRefillCost: clampNum(partial.diamond.energyRefillCost, 1, 100, prev.diamond.energyRefillCost),
        orderRefreshCost: clampNum(partial.diamond.orderRefreshCost, 1, 100, prev.diamond.orderRefreshCost),
      }
    : prev.diamond;

  const order = partial.order
    ? {
        ...prev.order,
        ...partial.order,
        maxActive: clampNum(partial.order.maxActive, 1, 20, prev.order.maxActive),
      }
    : prev.order;

  const ad = partial.ad
    ? {
        ...prev.ad,
        ...partial.ad,
        interstitialMinInterval: clampNum(partial.ad.interstitialMinInterval, 30_000, 600_000, prev.ad.interstitialMinInterval),
        interstitialMaxPerDay: clampNum(partial.ad.interstitialMaxPerDay, 0, 30, prev.ad.interstitialMaxPerDay),
        newUserProtectMs: clampNum(partial.ad.newUserProtectMs, 0, 3_600_000, prev.ad.newUserProtectMs),
        batchClearThreshold: clampNum(partial.ad.batchClearThreshold, 3, 50, prev.ad.batchClearThreshold),
      }
    : prev.ad;

  const board = partial.board
    ? {
        ...prev.board,
        ...partial.board,
        size: clampNum(partial.board.size, 4, 10, prev.board.size),
      }
    : prev.board;

  // 整体替换，保证 getConfig() 返回全新对象
  currentConfig = { features, bottomNav, energy, economy, diamond, order, ad, board };
}
