/**
 * 埋点事件定义与发送抽象层
 *
 * 所有游戏内事件通过此模块上报，不直接依赖 SDK。
 * 平台层（web / wx）负责初始化 SDK 并注入 send 实现。
 */

// --- 事件名常量 ---

export const Events = {
  // 核心玩法
  MERGE: 'merge',
  SPAWN_ITEM: 'spawn_item',
  SELL_ITEM: 'sell_item',

  // 订单
  ORDER_START: 'order_start',
  ORDER_COMPLETE: 'order_complete',
  ORDER_DOUBLE: 'order_double',

  // 经济
  COIN_CHANGE: 'coin_change',
  DIAMOND_CHANGE: 'diamond_change',
  ENERGY_CHANGE: 'energy_change',
  ENERGY_EMPTY: 'energy_empty',

  // 等级
  LEVEL_UP: 'level_up',

  // 商店
  SHOP_BUY: 'shop_buy',

  // 每日
  DAILY_SIGNIN: 'daily_signin',
  DAILY_TASK_CLAIM: 'daily_task_claim',

  // 广告（trigger=入口点击，finish=播完/中途关闭；watch 为 Web 端历史事件）
  AD_WATCH: 'ad_watch',
  AD_TRIGGER: 'ad_trigger',
  AD_FINISH: 'ad_finish',

  // 社交
  SHARE: 'share',

  // 新手引导
  TUTORIAL_STEP: 'tutorial_step',
  TUTORIAL_SKIP: 'tutorial_skip',

  // 背包
  STASH_ITEM: 'stash_item',
  UNSTASH_ITEM: 'unstash_item',

  // 会话（session_start 为上线看板口径：冷启动/回前台超 30s，带 is_first_day）
  GAME_START: 'game_start',
  SESSION_START: 'session_start',
  OFFLINE_REWARD: 'offline_reward',
} as const;

export type EventName = (typeof Events)[keyof typeof Events];

// --- 发送接口 ---

type SendFn = (event: string, props?: Record<string, unknown>) => void;
type ProfileSetFn = (props: Record<string, unknown>) => void;

let _send: SendFn = () => {}; // no-op until init
let _profileSet: ProfileSetFn = () => {};

/** 由平台层调用，注入真实的 SDK 发送函数 */
export function registerAnalytics(send: SendFn, profileSet: ProfileSetFn): void {
  _send = send;
  _profileSet = profileSet;
}

/** 上报事件 */
export function trackEvent(event: EventName, props?: Record<string, unknown>): void {
  _send(event, props);
}

/** 设置用户属性 */
export function setUserProfile(props: Record<string, unknown>): void {
  _profileSet(props);
}
