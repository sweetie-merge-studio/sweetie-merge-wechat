/**
 * 新手引导 — 步骤定义 + 纯函数状态管理
 *
 * 设计原则：只教最核心的两个操作，其余（订单/精力/签到/商店）玩家自行探索。
 * 步骤过多会打断游戏节奏、让指引显得不连贯。
 */

/** 步骤 ID */
export type TutorialStepId =
  | 'tapMother'
  | 'dragMerge';

/** 步骤定义 */
export interface TutorialStepDef {
  readonly id: TutorialStepId;
  readonly text: string;
  /** UI 层用来定位高亮目标的标记 */
  readonly target: string;
  /** false = 自动完成（纯展示步骤） */
  readonly requireAction: boolean;
  /** 自动完成延迟 ms（仅 requireAction=false） */
  readonly autoCompleteMs?: number;
  /** 高亮区域额外 padding（默认 8） */
  readonly spotPadding?: number;
}

/** 引导状态（可序列化） */
export interface TutorialState {
  completedSteps: TutorialStepId[];
  skipped: boolean;
}

// ─── 步骤配置表 ───────────────────────────────────────

export const TUTORIAL_STEPS: readonly TutorialStepDef[] = [
  // 第一步：点母体产出。完成条件由 BoardManager 控制——棋盘上出现2个相同物品时才推进，
  // 确保第二步拖拽合成有东西可拖，两步连贯不中断。
  { id: 'tapMother', text: '点一点工坊，生出小面包吧！', target: 'board-mother', requireAction: true },
  // 第二步：拖拽合成。两个相同物品拖到一起即完成，核心玩法闭环。
  { id: 'dragMerge', text: '把两个一样的拖到一起，变变变！', target: 'board-merge-pair', requireAction: true },
];

// ─── 纯函数 ──────────────────────────────────────────

/** 创建初始状态 */
export function createTutorialState(): TutorialState {
  return { completedSteps: [], skipped: false };
}

/** 当前应显示的步骤（null = 引导已结束） */
export function getCurrentStep(state: TutorialState): TutorialStepDef | null {
  if (state.skipped) return null;
  for (const step of TUTORIAL_STEPS) {
    if (!state.completedSteps.includes(step.id)) return step;
  }
  return null; // 全部完成
}

/** 标记步骤完成，返回新状态（不可变） */
export function completeStep(state: TutorialState, stepId: TutorialStepId): TutorialState {
  if (state.completedSteps.includes(stepId)) return state;
  return { ...state, completedSteps: [...state.completedSteps, stepId] };
}

/** 跳过全部引导，返回新状态 */
export function skipTutorial(state: TutorialState): TutorialState {
  return { ...state, skipped: true };
}

/** 是否处于引导中 */
export function isTutorialActive(state: TutorialState): boolean {
  return getCurrentStep(state) !== null;
}
