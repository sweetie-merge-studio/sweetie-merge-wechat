import type { CollectionState, ItemId } from './types';
import { getItems } from '../data/items';

/** 创建空图鉴 */
export function createCollection(): CollectionState {
  return { unlockedIds: new Set(), unclaimedIds: new Set() };
}

/** 解锁一个物品，返回是否是新解锁（新解锁会加入未领取列表） */
export function unlockItem(state: CollectionState, itemId: ItemId): boolean {
  if (state.unlockedIds.has(itemId)) return false;
  state.unlockedIds.add(itemId);
  state.unclaimedIds.add(itemId);
  return true;
}

/** 领取图鉴钻石奖励，返回是否成功 */
export function claimCollectionReward(state: CollectionState, itemId: ItemId): boolean {
  if (!state.unclaimedIds.has(itemId)) return false;
  state.unclaimedIds.delete(itemId);
  return true;
}

/** 图鉴完成度（百分比） */
export function completionRate(state: CollectionState): number {
  return Math.round((state.unlockedIds.size / getItems().length) * 100);
}
