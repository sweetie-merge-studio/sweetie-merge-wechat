/**
 * 甜品店装饰系统 — 纯购买，无升级
 *
 * 装饰物只需金币购买，放置到烘焙坊即生效。
 */

import { assetUrl } from './asset-url';

export type SlotCategory = 'wall' | 'floor' | 'counter';

/** 装饰效果（固定数值） */
export interface DecoEffect {
  /** 额外订单槽位 */
  extraOrders?: number;
  /** 稀有订单概率加成 */
  rareOrderBonus?: number;
  /** 金币收益加成 */
  coinBonus?: number;
}

/** 装饰物定义 */
export interface Decoration {
  id: string;
  name: string;
  emoji: string;
  /** 图标路径（优先于 emoji 显示） */
  icon?: string;
  /** 购买价格 */
  price: number;
  /** 效果（null = 纯装饰） */
  effect: DecoEffect | null;
  /** 效果描述（给 UI 显示） */
  effectLabel?: string;
  /** 烘焙坊摆放类别 */
  slotCategory: SlotCategory;
}

/** 装修状态（存档） */
export interface ShopState {
  /** 已拥有的装饰 id 集合 */
  owned: string[];
}

// --- 装饰物数据 ---

export const DECORATIONS: readonly Decoration[] = [
  {
    id: 'flour_bag', name: '面粉袋', emoji: '🌾',
    icon: assetUrl('/assets/icons/deco/flour_bag.webp'),
    price: 150,
    slotCategory: 'floor',
    effect: null,
  },
  {
    id: 'milk_pitcher', name: '牛奶壶', emoji: '🥛',
    icon: assetUrl('/assets/icons/deco/milk_pitcher.webp'),
    price: 600,
    slotCategory: 'counter',
    effect: { coinBonus: 0.08 },
    effectLabel: '金币+8%',
  },
  {
    id: 'golden_apple', name: '金苹果', emoji: '🍎',
    icon: assetUrl('/assets/icons/deco/golden_apple.webp'),
    price: 1500,
    slotCategory: 'counter',
    effect: { rareOrderBonus: 0.08 },
    effectLabel: '稀有+8%',
  },
  {
    id: 'cake_box', name: '蛋糕礼盒', emoji: '🎁',
    icon: assetUrl('/assets/icons/deco/cake_box.webp'),
    price: 2000,
    slotCategory: 'counter',
    effect: { extraOrders: 1 },
    effectLabel: '订单+1',
  },
];

export const DECORATION_BY_ID: ReadonlyMap<string, Decoration> = new Map(
  DECORATIONS.map(d => [d.id, d])
);

// --- 纯函数 ---

/** 创建初始装修状态 */
export function createShopState(): ShopState {
  return { owned: [] };
}

/** 是否已拥有 */
export function isOwned(state: ShopState, decoId: string): boolean {
  return state.owned.includes(decoId);
}

/** 购买装饰物（返回新 state，不修改原对象） */
export function buyDecoration(state: ShopState, decoId: string, coins: number): { success: boolean; cost: number; newState: ShopState } {
  const deco = DECORATION_BY_ID.get(decoId);
  if (!deco) return { success: false, cost: 0, newState: state };
  if (isOwned(state, decoId)) return { success: false, cost: 0, newState: state };
  if (coins < deco.price) return { success: false, cost: 0, newState: state };

  const newState: ShopState = { owned: [...state.owned, decoId] };
  return { success: true, cost: deco.price, newState };
}

/** 计算烘焙坊中已放置装饰的总效果 */
export function getPlacedEffects(
  shopState: ShopState,
  placedDecoIds: readonly string[],
): { extraOrders: number; rareOrderBonus: number; coinBonus: number } {
  let extraOrders = 0;
  let rareOrderBonus = 0;
  let coinBonus = 0;

  for (const id of placedDecoIds) {
    if (!isOwned(shopState, id)) continue;
    const deco = DECORATION_BY_ID.get(id);
    if (!deco || !deco.effect) continue;
    extraOrders += deco.effect.extraOrders ?? 0;
    rareOrderBonus += deco.effect.rareOrderBonus ?? 0;
    coinBonus += deco.effect.coinBonus ?? 0;
  }

  return { extraOrders, rareOrderBonus, coinBonus };
}
