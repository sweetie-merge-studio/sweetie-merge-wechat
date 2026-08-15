/** 社交状态（存档用） */
export interface SocialState {
  /** 今日已分享次数 */
  sharesToday: number;
  /** 今日已点赞好友数 */
  likesToday: number;
  /** 上次分享日期 YYYY-MM-DD */
  lastShareDate: string;
}

const MAX_SHARES_PER_DAY = 3;
const MAX_LIKES_PER_DAY = 5;
const SHARE_ENERGY_REWARD = 10;
const LIKE_COIN_REWARD = 10;

/** 创建初始社交状态 */
export function createSocialState(): SocialState {
  return { sharesToday: 0, likesToday: 0, lastShareDate: '' };
}

/** 跨天重置，返回新状态（无需重置则 null） */
export function checkSocialNewDay(state: SocialState, today: string): SocialState | null {
  if (state.lastShareDate === today) return null;
  return { sharesToday: 0, likesToday: 0, lastShareDate: today };
}

/** 是否还能分享 */
export function canShare(state: SocialState): boolean {
  return state.sharesToday < MAX_SHARES_PER_DAY;
}

/** 执行分享，返回新状态和精力奖励；不可分享时返回 null */
export function doShare(state: SocialState): { state: SocialState; reward: number } | null {
  if (!canShare(state)) return null;
  return { state: { ...state, sharesToday: state.sharesToday + 1 }, reward: SHARE_ENERGY_REWARD };
}

/** 是否还能点赞 */
export function canLike(state: SocialState): boolean {
  return state.likesToday < MAX_LIKES_PER_DAY;
}

/** 点赞好友，返回新状态和金币奖励；不可点赞时返回 null */
export function doLike(state: SocialState): { state: SocialState; reward: number } | null {
  if (!canLike(state)) return null;
  return { state: { ...state, likesToday: state.likesToday + 1 }, reward: LIKE_COIN_REWARD };
}

/** 剩余分享次数 */
export function remainingShares(state: SocialState): number {
  return MAX_SHARES_PER_DAY - state.sharesToday;
}

/** 剩余点赞次数 */
export function remainingLikes(state: SocialState): number {
  return MAX_LIKES_PER_DAY - state.likesToday;
}
