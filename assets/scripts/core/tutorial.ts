/**
 * 新手引导 — 步骤定义 + 纯函数状态管理
 */

/** 步骤 ID */
export type TutorialStepId =
  | 'tapMother'
  | 'tapMotherAgain'
  | 'dragMerge'
  | 'firstOrder'
  | 'deliverOrder'
  | 'dailyCheckIn';

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
  { id: 'tapMother',      text: '点击工坊，生产第一个面包！', target: 'board-mother',      requireAction: true },
  { id: 'tapMotherAgain', text: '再点一次，凑齐一对！',       target: 'board-mother',      requireAction: true },
  { id: 'dragMerge',      text: '拖到一起，合成！',           target: 'board-merge-pair',  requireAction: true },
  { id: 'firstOrder',     text: '有顾客下单啦，来看看吧！',     target: 'tutorial-order-card', requireAction: false, autoCompleteMs: 500 },
  { id: 'deliverOrder',   text: '点击领取按钮，完成订单！',    target: 'order-collect-btn', requireAction: true },
  { id: 'dailyCheckIn',   text: '每天签到领奖励！',           target: 'nav-daily',         requireAction: true, spotPadding: 20 },
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
