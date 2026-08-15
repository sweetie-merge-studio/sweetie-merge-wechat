import type { EconomyState } from './types';

/** 创建初始金币状态 — 新用户赠送启动资金 */
export function createEconomy(): EconomyState {
  return { coins: 100, diamonds: 10 };
}

/** 增加钻石（忽略非正数/非有限值） */
export function addDiamonds(state: EconomyState, amount: number): void {
  if (!Number.isFinite(amount) || amount <= 0) return;
  state.diamonds = Math.min(state.diamonds + Math.floor(amount), 999_999);
}

/** 增加金币（忽略非正数/非有限值） */
export function addCoins(state: EconomyState, amount: number): void {
  if (!Number.isFinite(amount) || amount <= 0) return;
  state.coins = Math.min(state.coins + Math.floor(amount), 9_999_999);
}

/** 消费金币，成功返回 true */
export function spendCoins(state: EconomyState, amount: number): boolean {
  if (state.coins < amount) return false;
  state.coins -= amount;
  return true;
}

/** 消费钻石，成功返回 true */
export function spendDiamonds(state: EconomyState, amount: number): boolean {
  if (state.diamonds < amount) return false;
  state.diamonds -= amount;
  return true;
}
