import type { ItemId } from './types';

/** 每日任务定义 */
export interface DailyTask {
  id: string;
  label: string;
  target: number;
  current: number;
  /** 单任务奖励描述 */
  rewardLabel: string;
  /** 单任务奖励金币 */
  rewardCoins: number;
  /** 单任务奖励是否已领取 */
  claimed: boolean;
}

/** 连续登录奖励 */
export interface LoginReward {
  day: number;
  label: string;
  coins?: number;
  energy?: number;
  /** 直接解锁图鉴物品 */
  unlockItem?: ItemId;
}

/** 每日状态（存档用） */
export interface DailyState {
  /** 今天的日期字符串 YYYY-MM-DD */
  today: string;
  /** 任务进度 */
  tasks: DailyTask[];
  /** 今日任务是否已全部领取 */
  tasksClaimed: boolean;
  /** 连续登录天数 */
  streak: number;
  /** 今日是否已签到 */
  signedIn: boolean;
  /** 今日金币购买精力次数 */
  coinRefillCount: number;
  /** 今日能量位激励视频已看次数（频控上限见 config.ad.energyAdMaxPerDay） */
  energyAdCount: number;
  /** 上一次能量位激励视频的时间戳 ms（冷却用，跨天不重置） */
  energyAdLastAt: number;
  /** 首次建档日期 YYYY-MM-DD（埋点 is_first_day 用，跨天不重置；老存档合并时落在升级当日） */
  installDate: string;
  /** 今日首单双倍是否已发放（留存钩子：每天第一个完成的订单奖励 ×2） */
  firstOrderDoubled: boolean;
}

// --- 连续登录奖励表（7 天一轮，断签重置）---

export const LOGIN_REWARDS: readonly LoginReward[] = [
  { day: 1, label: '20 精力',          energy: 20 },
  { day: 2, label: '50 金币',          coins: 50 },
  { day: 3, label: '稀有甜品碎片',      coins: 100 },
  { day: 4, label: '30 精力',          energy: 30 },
  { day: 5, label: '100 金币',         coins: 100 },
  { day: 6, label: '50 精力',          energy: 50 },
  { day: 7, label: '传说甜品解锁',      coins: 200, unlockItem: 'cake_4' },
];

// --- 每日任务模板 ---

function makeTodayTasks(): DailyTask[] {
  return [
    { id: 'merge_10',   label: '合成 10 次',    target: 10, current: 0, rewardLabel: '50 金币',  rewardCoins: 50,  claimed: false },
    { id: 'order_2',    label: '完成 2 个订单',  target: 2,  current: 0, rewardLabel: '80 金币',  rewardCoins: 80,  claimed: false },
    { id: 'ad_2',       label: '看 2 次广告',    target: 2,  current: 0, rewardLabel: '30 金币',  rewardCoins: 30,  claimed: false },
  ];
}

/** 获取今天的日期字符串 */
export function getTodayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 创建初始每日状态 */
export function createDailyState(): DailyState {
  return {
    today: getTodayStr(),
    tasks: makeTodayTasks(),
    tasksClaimed: false,
    streak: 0,
    signedIn: false,
    coinRefillCount: 0,
    energyAdCount: 0,
    energyAdLastAt: 0,
    installDate: getTodayStr(),
    firstOrderDoubled: false,
  };
}

/** 今日首单双倍是否还可用（今天还没发放过） */
export function isFirstOrderBonusAvailable(state: DailyState): boolean {
  return !state.firstOrderDoubled;
}

/** 标记今日首单双倍已发放 */
export function markFirstOrderDoubled(state: DailyState): void {
  state.firstOrderDoubled = true;
}

/** 今天是否为安装当日（埋点 session_start 的 is_first_day） */
export function isFirstDay(state: DailyState): boolean {
  return state.installDate === getTodayStr();
}

/** 检查是否跨天，如果是则重置任务、更新连续登录 */
export function checkNewDay(state: DailyState): boolean {
  const today = getTodayStr();
  if (state.today === today) return false;

  // 跨天了
  const yesterday = getYesterdayStr();
  if (state.today === yesterday && state.signedIn) {
    // 昨天签过到 → 7 天循环（第 7 天后回到第 1 天）
    state.streak = state.streak >= 7 ? 1 : state.streak + 1;
  } else {
    // 断签 → 重置为 0，signIn() 会设为 1
    state.streak = 0;
  }

  state.today = today;
  state.tasks = makeTodayTasks();
  state.tasksClaimed = false;
  state.signedIn = false;
  state.coinRefillCount = 0;
  state.energyAdCount = 0;
  state.firstOrderDoubled = false;
  return true;
}

function getYesterdayStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 签到（每天只能一次） */
export function signIn(state: DailyState): LoginReward | null {
  if (state.signedIn) return null;
  state.signedIn = true;
  if (state.streak === 0) state.streak = 1;
  const dayIdx = ((state.streak - 1) % 7);
  return LOGIN_REWARDS[dayIdx];
}

/** 推进任务进度 */
export function advanceTask(state: DailyState, taskId: string, amount: number = 1): void {
  const task = state.tasks.find(t => t.id === taskId);
  if (!task) return;
  task.current = Math.min(task.current + amount, task.target);
}

/** 所有任务是否完成 */
export function allTasksDone(state: DailyState): boolean {
  return state.tasks.every(t => t.current >= t.target);
}

/** 领取单个任务奖励，返回金币数（null=不可领） */
export function claimSingleTask(state: DailyState, taskId: string): number | null {
  const task = state.tasks.find(t => t.id === taskId);
  if (!task || task.current < task.target || task.claimed) return null;
  task.claimed = true;
  return task.rewardCoins;
}

/** 领取全部完成奖励（200 金币宝箱） */
export function claimTaskReward(state: DailyState): number | null {
  if (!allTasksDone(state) || state.tasksClaimed) return null;
  // 所有单任务奖励必须已领取
  if (!state.tasks.every(t => t.claimed)) return null;
  state.tasksClaimed = true;
  return 200; // 宝箱金币
}
