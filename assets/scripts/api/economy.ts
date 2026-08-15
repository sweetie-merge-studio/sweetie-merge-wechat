/**
 * 经济 API — 合成上报、出售上报
 */

import { post } from './request';

export interface MergeRequest {
  itemId: string;
}

export interface MergeResponse {
  mergeResultItem: {
    id: string;
    name: string;
    level: number;
    rarity: string;
    emoji: string;
  };
  coinsEarned: number;
  expEarned: number;
  leveledUp: boolean;
  newLevel: number;
  levelRewards: { coins: number; diamonds: number } | null;
}

export function reportMerge(req: MergeRequest): Promise<MergeResponse> {
  return post<MergeResponse>('/game/economy/merge', req, { offlineSilent: true });
}

export interface SellRequest {
  itemId: string;
}

export interface SellResponse {
  soldItemId: string;
  coinsEarned: number;
}

export function reportSell(req: SellRequest): Promise<SellResponse> {
  return post<SellResponse>('/game/economy/sell', req, { offlineSilent: true });
}
