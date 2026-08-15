import type { EnergyState, ItemId } from './types';
import { getItemById } from '../data/items';
import { getConfig } from './config';

/**
 * 广告触发条件（来自 PRD 广告设计表）
 *
 * 激励视频：
 *  1. 精力耗尽 → +20 精力
 *  2. 解锁稀有物品 → 立即获得
 *  3. 批量清理低级物品 → 清空棋盘低级格子
 *
 * 插屏广告：
 *  4. 每 5-10 分钟定时展示
 */

/** 精力是否耗尽（触发激励视频恢复） */
export function shouldShowEnergyAd(energy: EnergyState): boolean {
  return energy.current <= 0;
}

/** 物品是否是稀有/传说级别（触发激励视频直接获得） */
export function isRareOrAbove(itemId: ItemId): boolean {
  const def = getItemById().get(itemId);
  if (!def) return false;
  return def.rarity === 'rare' || def.rarity === 'epic' || def.rarity === 'legendary';
}

/** 棋盘上 Lv.1 物品数量，超过配置阈值触发批量清理广告 */
export function countLowLevelItems(boardItemIds: ReadonlyArray<ItemId | undefined>, threshold?: number): boolean {
  if (threshold === undefined) threshold = getConfig().ad.batchClearThreshold;
  let count = 0;
  for (const id of boardItemIds) {
    if (!id) continue;
    const def = getItemById().get(id);
    if (def && def.level <= 1) count++;
  }
  return count >= threshold;
}

/** 获取棋盘上所有 Lv.1 物品的索引 */
export function getLowLevelIndices(boardItemIds: ReadonlyArray<ItemId | undefined>): number[] {
  const indices: number[] = [];
  for (let i = 0; i < boardItemIds.length; i++) {
    const id = boardItemIds[i];
    if (!id) continue;
    const def = getItemById().get(id);
    if (def && def.level <= 1) indices.push(i);
  }
  return indices;
}

// --- 插屏广告频率控制 ---

/** 是否可以展示插屏广告 */
export function canShowInterstitial(lastShownAt: number, now: number): boolean {
  return now - lastShownAt >= getConfig().ad.interstitialMinInterval;
}
