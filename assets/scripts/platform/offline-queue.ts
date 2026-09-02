/**
 * 离线操作队列 — 网络不可用时缓存操作，恢复后批量上报
 *
 * 设计：
 * - 每条操作记录为 { type, payload, timestamp }
 * - 持久化到 wx.storage，防止刷新丢失
 * - 恢复网络后按 FIFO 顺序逐条重放
 * - 重放失败（非网络原因）则丢弃该条，避免死循环
 *
 * 平台适配：微信小游戏 (wx.* APIs)
 * 网络状态统一由 platform/network.ts 管理，避免与 request.ts 各自维护导致不一致
 */

import { reportMerge, reportSell } from '../api/economy';
import { spendEnergy, buyEnergy } from '../api/energy';
import { claimAdReward } from '../api/rewards';
import { completeOrder } from '../api/order';
import { isOnline, onReconnect as onNetworkReconnect } from './network';

// --- 网络恢复处理 ---

let _reconnectRegistered = false;

async function handleReconnect(): Promise<void> {
  console.info('[offline-queue] 网络恢复，开始重放队列');
  const result = await flushQueue();
  console.info(`[offline-queue] 重放完成: ${result.success} 成功, ${result.failed} 丢弃`);
}

// --- 操作类型 ---

interface MergeOp {
  type: 'merge';
  payload: { itemId: string };
}

interface SellOp {
  type: 'sell';
  payload: { itemId: string };
}

interface EnergySpendOp {
  type: 'energy_spend';
  payload: { amount: number };
}

interface OrderCompleteOp {
  type: 'order_complete';
  payload: { orderId: string };
}

interface BuyEnergyOp {
  type: 'buyEnergy';
  payload: { currency: 'coins' | 'diamonds'; buyType: 'fixed' | 'refill'; amount?: number };
}

interface AdRewardOp {
  type: 'adReward';
  payload: { rewardType: 'energy' | 'diamonds' };
}

type QueuedOp = (MergeOp | SellOp | EnergySpendOp | OrderCompleteOp | BuyEnergyOp | AdRewardOp) & {
  timestamp: number;
};

// --- 常量 ---

const STORAGE_KEY = 'sweetie_offline_queue';
const MAX_QUEUE_SIZE = 200;
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 超过 24 小时的操作丢弃

// --- 队列实现 ---

let queue: QueuedOp[] = [];
let flushing = false;

/** 从 wx.storage 恢复队列 */
function loadQueue(): void {
  try {
    const raw = wx.getStorageSync(STORAGE_KEY);
    if (!raw) return;
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (Array.isArray(parsed)) {
      // 过滤掉过期条目
      const now = Date.now();
      queue = parsed.filter(
        (op: QueuedOp) => now - op.timestamp < MAX_AGE_MS,
      );
    }
  } catch {
    queue = [];
  }
}

/** 持久化队列到 wx.storage */
function persistQueue(): void {
  try {
    if (queue.length === 0) {
      wx.removeStorageSync(STORAGE_KEY);
    } else {
      wx.setStorageSync(STORAGE_KEY, JSON.stringify(queue));
    }
  } catch {
    // storage full or unavailable — 队列仅存内存
  }
}

/** 检测网络是否可用（统一由 platform/network.ts 管理） */
export { isOnline };

/** 入队一条操作 */
export function enqueue(op: Omit<QueuedOp, 'timestamp'>): void {
  if (queue.length >= MAX_QUEUE_SIZE) {
    // 队列满时丢弃最旧的
    queue.shift();
  }
  queue.push({ ...op, timestamp: Date.now() } as QueuedOp);
  persistQueue();
}

/** 队列中待处理操作数 */
export function pendingCount(): number {
  return queue.length;
}

/** 逐条重放队列中的操作 */
export async function flushQueue(): Promise<{ success: number; failed: number }> {
  if (flushing || queue.length === 0) return { success: 0, failed: 0 };
  flushing = true;

  let success = 0;
  let failed = 0;

  while (queue.length > 0) {
    // 网络断开时中止
    if (!isOnline()) break;

    const op = queue[0];
    try {
      await replayOp(op);
      queue.shift();
      success++;
    } catch (err: unknown) {
      // 网络错误 → 停止重放，等下次恢复
      if (isNetworkError(err)) break;
      // 业务错误（如订单已完成）→ 丢弃该条继续
      queue.shift();
      failed++;
    }
    persistQueue();
  }

  flushing = false;
  return { success, failed };
}

/** 执行单条操作 */
async function replayOp(op: QueuedOp): Promise<void> {
  switch (op.type) {
    case 'merge':
      await reportMerge(op.payload);
      break;
    case 'sell':
      await reportSell(op.payload);
      break;
    case 'energy_spend':
      await spendEnergy(op.payload.amount);
      break;
    case 'order_complete':
      await completeOrder(op.payload.orderId);
      break;
    case 'buyEnergy':
      await buyEnergy({ currency: op.payload.currency, type: op.payload.buyType, amount: op.payload.amount });
      break;
    case 'adReward':
      await claimAdReward(op.payload.rewardType);
      break;
  }
}

/** 判断是否为网络相关错误 */
function isNetworkError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const name = (err as { name?: string }).name;
  return name === 'OfflineError' || name === 'TypeError' || name === 'AbortError';
}

/**
 * 注册恢复网络时的回调（用于 GameManager 重新同步服务端状态）
 * 返回取消注册函数
 */
export function onReconnect(cb: () => void): () => void {
  return onNetworkReconnect(cb);
}

/** 初始化：恢复队列 + 注册网络恢复回调（网络监听由 platform/network.ts 统一管理） */
export function initOfflineQueue(): void {
  loadQueue();
  if (!_reconnectRegistered) {
    _reconnectRegistered = true;
    onNetworkReconnect(() => {
      void handleReconnect();
    });
  }
}
