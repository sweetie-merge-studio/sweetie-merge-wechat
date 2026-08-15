import type { EnergyState } from './types';
import { getConfig } from './config';

/** 创建初始精力状态，数值来自集中配置 */
export function createEnergy(): EnergyState {
  const cfg = getConfig().energy;
  return {
    current: cfg.max,
    max: cfg.max,
    regenPerMinute: cfg.regenPerMinute,
    lastTickAt: Date.now(),
  };
}

/** 按时间推进精力恢复 */
export function tickEnergy(state: EnergyState, now: number): void {
  if (state.current >= state.max) {
    state.lastTickAt = now;
    return;
  }
  const minutes = (now - state.lastTickAt) / 60_000;
  if (minutes <= 0) return;
  const gained = Math.floor(minutes * state.regenPerMinute);
  if (gained <= 0) return;
  state.current = Math.min(state.max, state.current + gained);
  state.lastTickAt = state.lastTickAt + (gained / state.regenPerMinute) * 60_000;
}

/** 消耗精力，成功返回 true */
export function consumeEnergy(state: EnergyState, cost: number): boolean {
  if (state.current < cost) return false;
  state.current -= cost;
  return true;
}

/** 广告恢复精力 — 不重置 lastTickAt，保留部分恢复进度 */
export function rewardEnergy(state: EnergyState, amount: number = getConfig().energy.adReward): void {
  state.current = Math.min(state.max, state.current + amount);
}

/** 付费购买精力 — 可以超过上限 */
export function addEnergyUncapped(state: EnergyState, amount: number): void {
  state.current += amount;
}

/** 金币购买精力 — 不超过上限 */
export function coinRefillEnergy(state: EnergyState): void {
  const cfg = getConfig().energy;
  state.current = Math.min(state.max, state.current + cfg.coinRefillAmount);
}
