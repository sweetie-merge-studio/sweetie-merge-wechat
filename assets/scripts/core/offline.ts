import type { EnergyState } from './types';

/** 最小离线时长（分钟），低于此不弹离线收益 */
const MIN_OFFLINE_MINUTES = 30;

/** 计算离线期间恢复的精力 */
export function calcOfflineEnergy(energy: EnergyState, lastOnline: number, now: number): number {
  if (energy.current >= energy.max) return 0;
  const minutes = (now - lastOnline) / 60_000;
  if (minutes < MIN_OFFLINE_MINUTES) return 0;
  const gained = Math.floor(minutes * energy.regenPerMinute);
  return Math.min(gained, energy.max - energy.current);
}

/** 格式化离线时长 */
export function formatOfflineDuration(lastOnline: number, now: number): string {
  const diff = now - lastOnline;
  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours} 小时 ${minutes % 60} 分钟`;
  if (minutes > 0) return `${minutes} 分钟`;
  return '刚刚';
}
