import type { Category } from '../data/items';

/** 等级定义 */
export interface LevelDef {
  readonly level: number;
  readonly title: string;
  readonly totalExp: number;     // 升到此级所需累计 EXP
  readonly expRequired: number;  // 本级所需 EXP
  readonly unlockCategory?: Category;
  /** 升级奖励：精力 */
  readonly rewardEnergy: number;
  /** 升级奖励：金币 */
  readonly rewardCoins: number;
  /** 升级所需金币（从下一级开始收费） */
  readonly coinCost: number;
}

/** 等级状态 */
export interface LevelState {
  level: number;
  exp: number;        // 累计总经验
  /** 当前选中的母棋品类（棋盘上只放这一个） */
  activeMother: Category | null;
  /** 经验已满但金币不足，等待手动升级 */
  pendingLevelUp: boolean;
}

/**
 * 等级表 — 80 级 S 型经验曲线
 *
 * 设计理念：
 * - 每 10 级为一个阶段，解锁一个新品类母棋
 * - Lv.1~5：新手入门，快速体验（50~120 EXP）
 * - Lv.6~10：学徒成长，节奏渐缓
 * - 每个 10 级段内逐步提升难度，阶段末解锁新品类作为里程碑奖励
 * - 称号按阶段递进：学徒 → 见习 → 初级 → 中级 → 高级 → 资深 → 大师 → 传奇
 * - 前 3 级免费升级（coinCost: 0），之后需要金币
 */

// 阶段称号前缀（每 10 级一个）
const STAGE_TITLES = [
  '学徒甜品师',   // Lv.1~10
  '见习甜品师',   // Lv.11~20
  '初级甜品师',   // Lv.21~30
  '中级甜品师',   // Lv.31~40
  '高级甜品师',   // Lv.41~50
  '资深甜品师',   // Lv.51~60
  '大师甜品师',   // Lv.61~70
  '传奇甜品师',   // Lv.71~80
];

function stageTitle(level: number): string {
  const stage = Math.floor((level - 1) / 10);
  return STAGE_TITLES[Math.min(stage, STAGE_TITLES.length - 1)];
}

/** 品类解锁映射：在哪一级解锁 */
const CATEGORY_UNLOCK: Record<number, Category> = {
  1:  'bread',
  10: 'cookie',
  20: 'cake',
  30: 'drink',
  40: 'icecream',
  50: 'candy',
  60: 'chocolate',
  70: 'fruit',
};

/** 生成等级表 */
function buildLevelTable(): LevelDef[] {
  const table: LevelDef[] = [];
  let totalExp = 0;

  for (let lv = 1; lv <= 80; lv++) {
    // 经验曲线：基础 50，每级递增，每个阶段有跳跃
    const stage = Math.floor((lv - 1) / 10); // 0~7
    const inStage = ((lv - 1) % 10);          // 0~9
    // 基础经验：50 + 阶段 * 30，级内递增 10~15
    const base = 50 + stage * 30;
    const growth = Math.floor(inStage * (10 + stage * 2));
    const expRequired = base + growth;

    // 升级奖励：随等级递增
    const rewardEnergy = 10 + Math.floor(lv / 5) * 2;
    const rewardCoins = 20 + lv * 5;

    // 金币花费：前 3 级免费，之后递增
    const coinCost = lv <= 3 ? 0 : Math.floor(30 + lv * 8);

    table.push({
      level: lv,
      title: stageTitle(lv),
      totalExp,
      expRequired,
      unlockCategory: CATEGORY_UNLOCK[lv],
      rewardEnergy,
      rewardCoins,
      coinCost,
    });

    totalExp += expRequired;
  }
  return table;
}

export const LEVEL_TABLE: readonly LevelDef[] = buildLevelTable();

// Lv.1 初始只解锁 bread
const LEVEL_1_CATEGORIES: Category[] = ['bread'];

/** 创建初始等级状态 */
export function createLevelState(): LevelState {
  return {
    level: 1,
    exp: 0,
    activeMother: 'bread',
    pendingLevelUp: false,
  };
}

/** 根据累计经验计算等级 */
export function calcLevel(totalExp: number): number {
  for (let i = LEVEL_TABLE.length - 1; i >= 0; i--) {
    if (totalExp >= LEVEL_TABLE[i].totalExp) {
      return LEVEL_TABLE[i].level;
    }
  }
  return 1;
}

/** 获取等级定义 */
export function getLevelDef(level: number): LevelDef {
  const capped = Math.min(level, LEVEL_TABLE.length);
  return LEVEL_TABLE[capped - 1];
}

/** 获取当前等级进度 (0~1) */
export function getLevelProgress(state: LevelState): number {
  const def = getLevelDef(state.level);
  const expInLevel = state.exp - def.totalExp;
  return Math.min(1, Math.max(0, expInLevel / def.expRequired));
}

/** 获取当前等级内的经验和所需经验 */
export function getLevelExpInfo(state: LevelState): { current: number; required: number } {
  const def = getLevelDef(state.level);
  return {
    current: state.exp - def.totalExp,
    required: def.expRequired,
  };
}

/** 升级结果 */
export interface LevelUpResult {
  leveledUp: boolean;
  newLevel: number;
  unlockedCategory?: Category;
  unlockedCategories: Category[];
}

/**
 * 增加经验。当经验达到下一级门槛时：
 * - coinCost === 0 → 自动升级（新手前两级免费）
 * - coinCost > 0 → 标记 pendingLevelUp，等待手动确认并扣币
 */
export function addExp(
  state: LevelState,
  amount: number
): LevelUpResult | null {
  if (amount <= 0) return null;

  state.exp += amount;
  const potentialLevel = calcLevel(state.exp);

  if (potentialLevel > state.level) {
    const nextDef = getLevelDef(state.level + 1);
    if (nextDef.coinCost > 0) {
      // 需要金币，标记待升级，不自动升
      state.pendingLevelUp = true;
      return null;
    }
    // 免费升级（Lv.1→2 等）
    return applyLevelUp(state, potentialLevel);
  }

  return null;
}

/**
 * 获取待升级所需金币（pendingLevelUp 为 true 时有效）
 */
export function getPendingLevelUpCost(state: LevelState): number {
  if (!state.pendingLevelUp) return 0;
  const nextDef = getLevelDef(state.level + 1);
  return nextDef.coinCost;
}

/**
 * 手动确认升级（扣币后调用）
 * 返回升级结果，可能连续升多级（如果后续级也免费或经验足够）
 */
export function confirmLevelUp(state: LevelState): LevelUpResult | null {
  if (!state.pendingLevelUp) return null;
  state.pendingLevelUp = false;

  const potentialLevel = calcLevel(state.exp);
  if (potentialLevel <= state.level) return null;

  // 升一级
  let result = applyLevelUp(state, state.level + 1);

  // 连续升级：后续免费级直接升掉，遇到收费级则挂起等玩家付费确认。
  // 不自动升免费级会让 pendingLevelUp 被清空、等级停在半路且没有 UI 入口再领。
  while (calcLevel(state.exp) > state.level) {
    const nextDef = getLevelDef(state.level + 1);
    if (nextDef.coinCost > 0) {
      state.pendingLevelUp = true;
      break;
    }
    const next = applyLevelUp(state, state.level + 1);
    const unlockedCategories = [...result.unlockedCategories, ...next.unlockedCategories];
    result = {
      ...next,
      unlockedCategories,
      unlockedCategory: unlockedCategories[0],
    };
  }

  return result;
}

/** 内部：实际执行升级 */
function applyLevelUp(state: LevelState, newLevel: number): LevelUpResult {
  const oldLevel = state.level;
  state.level = newLevel;
  const unlocked: Category[] = [];
  for (const def of LEVEL_TABLE) {
    if (def.level <= oldLevel) continue;
    if (def.level > newLevel) break;
    if (def.unlockCategory) unlocked.push(def.unlockCategory);
  }
  return {
    leveledUp: true,
    newLevel,
    unlockedCategory: unlocked[unlocked.length - 1],
    unlockedCategories: unlocked,
  };
}

/** 获取当前等级已解锁的所有品类 */
export function getUnlockedCategoriesByLevel(level: number): Set<Category> {
  const unlocked = new Set<Category>(LEVEL_1_CATEGORIES);
  for (const def of LEVEL_TABLE) {
    if (def.level > level) break;
    if (def.unlockCategory) {
      unlocked.add(def.unlockCategory);
    }
  }
  return unlocked;
}

/** 获取解锁某品类的母棋所需金币（基于该品类在等级表中的 coinCost） */
export function getMotherUnlockCost(category: Category): number {
  const def = LEVEL_TABLE.find(d => d.unlockCategory === category);
  if (!def) return 0;
  // 前两级免费，其余使用该等级的 coinCost
  return def.coinCost;
}

/** 切换当前母棋品类（必须是已解锁的） */
export function switchMother(state: LevelState, category: Category): boolean {
  const unlocked = getUnlockedCategoriesByLevel(state.level);
  if (!unlocked.has(category)) return false;
  state.activeMother = category;
  return true;
}
