
/**
 * 游戏提示语配置
 *
 * 按场景分类，底部导航气泡随机展示
 * 后续可由云端下发覆盖
 */

export interface TipConfig {
  /** 新手引导（等级 1-3） */
  beginner: string[];
  /** 日常提示（等级 4+） */
  general: string[];
  /** 合成相关 */
  merge: string[];
  /** 订单相关 */
  order: string[];
  /** 精力相关 */
  energy: string[];
  /** 功能引导 */
  feature: string[];
}

export const TIPS: TipConfig = {
  beginner: [
    '试试合成两个相同的物品！',
    '点击工坊可以生成新物品哦',
    '完成订单可以获得金币和经验',
    '合成高级物品获得更多经验！',
    '切换下方工坊可以生产不同品类',
  ],

  general: [
    '合成传说物品可获得 10 经验！',
    '升级可以解锁新的品类工坊',
    '稀有订单奖励更丰厚哦',
    '每日签到不要忘记领奖励～',
    '图鉴收集度越高越厉害！',
    '满级物品可以回收换金币',
  ],

  merge: [
    '相同物品拖到一起就能合成',
    'Lv.4 是最高级，无法继续合成',
    '合成稀有物品获得 5 经验',
    '棋盘快满了？试试回收低级物品',
  ],

  order: [
    '点击物品可以直接交付订单',
    '订单有时间限制，注意倒计时',
    '困难订单奖励翻倍！',
    '完成订单可获得 10 经验值',
  ],

  energy: [
    '精力不足？等待自动恢复吧',
    '每分钟恢复 1 点精力',
    '看广告可以立即恢复 20 精力',
    '生产一个物品消耗 2 精力',
  ],

  feature: [
    '下方切换工坊可以生产不同甜品',
    '点击图鉴查看已解锁的甜品',
    '每日任务完成后有额外奖励',
  ],
};

// @platform-specific:start Web 走 i18n 提示池并回退本地；双端无 i18n，直接用 TIPS
/** 根据玩家等级获取合适的提示池 */
export function getTipPool(level: number): string[] {
  if (level <= 3) {
    return [...TIPS.beginner, ...TIPS.merge];
  }
  return [
    ...TIPS.general,
    ...TIPS.merge,
    ...TIPS.order,
    ...TIPS.energy,
    ...TIPS.feature,
  ];
}
// @platform-specific:end

const MAX_TIP_LENGTH = 18;

/** 随机获取一条提示（不超过 18 字） */
export function getRandomTip(level: number): string {
  const pool = getTipPool(level);
  const tip = pool[Math.floor(Math.random() * pool.length)];
  return tip.length > MAX_TIP_LENGTH ? tip.slice(0, MAX_TIP_LENGTH) + '…' : tip;
}
