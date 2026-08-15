/**
 * EventBus — 替代 Vue reactivity（ref / computed / watch）
 *
 * GameManager 在状态变化时 emit 事件，UI 组件 on/off 监听并刷新显示。
 */

type Handler = (...args: unknown[]) => void;

export class EventBus {
  private _map = new Map<string, Set<Handler>>();

  on(event: string, handler: Handler): void {
    let set = this._map.get(event);
    if (!set) {
      set = new Set();
      this._map.set(event, set);
    }
    set.add(handler);
  }

  off(event: string, handler: Handler): void {
    this._map.get(event)?.delete(handler);
  }

  once(event: string, handler: Handler): void {
    const wrapper: Handler = (...args) => {
      this.off(event, wrapper);
      handler(...args);
    };
    this.on(event, wrapper);
  }

  emit(event: string, ...args: unknown[]): void {
    const set = this._map.get(event);
    if (!set) return;
    for (const handler of set) {
      try {
        handler(...args);
      } catch (err) {
        console.error(`[EventBus] Error in handler for "${event}":`, err);
      }
    }
  }

  clear(): void {
    this._map.clear();
  }
}

/** 全局事件总线实例 */
export const eventBus = new EventBus();

/** 常用事件名称 */
export const GameEvents = {
  /** 任意游戏状态变化（通用刷新） */
  STATE_CHANGED: 'state:changed',
  /** 棋盘变化 */
  BOARD_CHANGED: 'board:changed',
  /** 经济变化（金币/钻石） */
  ECONOMY_CHANGED: 'economy:changed',
  /** 精力变化 */
  ENERGY_CHANGED: 'energy:changed',
  /** 订单变化 */
  ORDERS_CHANGED: 'orders:changed',
  /** 图鉴变化 */
  COLLECTION_CHANGED: 'collection:changed',
  /** 等级变化 */
  LEVEL_CHANGED: 'level:changed',
  /** 升级事件 */
  LEVEL_UP: 'level:up',
  /** 每日任务变化 */
  DAILY_CHANGED: 'daily:changed',
  /** 商店变化 */
  SHOP_CHANGED: 'shop:changed',
  /** 背包变化 */
  BACKPACK_CHANGED: 'backpack:changed',
  /** 烘焙坊变化 */
  BAKERY_CHANGED: 'bakery:changed',
  /** 新手引导步骤 */
  TUTORIAL_CHANGED: 'tutorial:changed',
  /** 离线收益数据就绪 */
  OFFLINE_REWARD_READY: 'offline:reward_ready',
  /** 服务端就绪 */
  SERVER_READY: 'server:ready',
} as const;
