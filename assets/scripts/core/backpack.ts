import type { ItemId } from './types';

/** 背包格子总数 6×6 */
export const BACKPACK_MAX_SLOTS = 36;
/** 初始解锁格子数 */
export const BACKPACK_INITIAL_SLOTS = 10;
/** 每次解锁的格子数 */
export const BACKPACK_UNLOCK_BATCH = 1;

/** 解锁下一个格子需要的钻石（按已解锁次数递增，封顶 50） */
export function unlockSlotsCost(currentUnlocked: number): number {
  const timesUnlocked = currentUnlocked - BACKPACK_INITIAL_SLOTS;
  // 平缓递增，封顶 50 钻石/格；从初始 10 格全开到 36 格共 26 次解锁，合计 624 钻石
  const costs = [2, 3, 3, 5, 5, 8, 8, 10, 10, 15, 15, 20, 20, 25, 25, 30, 30, 35, 35, 40, 40, 45, 45, 50, 50, 50];
  return costs[Math.min(timesUnlocked, costs.length - 1)];
}

/** 背包状态 */
export interface BackpackState {
  items: BackpackItem[];
  maxSlots: number;
  unlockedSlots: number;
}

/** 背包物品（每个物品独占一格） */
export interface BackpackItem {
  itemId: ItemId;
  count: number;
}

/** 创建初始背包 */
export function createBackpack(): BackpackState {
  return {
    items: [],
    maxSlots: BACKPACK_MAX_SLOTS,
    unlockedSlots: BACKPACK_INITIAL_SLOTS,
  };
}

/** 添加物品到背包（每个物品独占一格），返回是否成功 */
export function addToBackpack(state: BackpackState, itemId: ItemId): boolean {
  if (state.items.length >= state.unlockedSlots) return false;
  state.items.push({ itemId, count: 1 });
  return true;
}

/** 从背包移除物品（移除第一个匹配的格子） */
export function removeFromBackpack(state: BackpackState, itemId: ItemId): boolean {
  const idx = state.items.findIndex(i => i.itemId === itemId);
  if (idx < 0) return false;
  state.items.splice(idx, 1);
  return true;
}

/** 背包物品总数（每格算一个） */
export function backpackTotalCount(state: BackpackState): number {
  return state.items.length;
}

/** 解锁更多格子，返回是否成功 */
export function unlockMoreSlots(state: BackpackState): boolean {
  if (state.unlockedSlots >= state.maxSlots) return false;
  state.unlockedSlots = Math.min(state.unlockedSlots + BACKPACK_UNLOCK_BATCH, state.maxSlots);
  return true;
}
