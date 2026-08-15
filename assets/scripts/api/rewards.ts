/**
 * 奖励 API — 广告奖励服务端验证
 */

import { post } from './request';

export type AdRewardType = 'energy' | 'diamonds';

export interface ClaimAdRewardRequest {
  rewardType: AdRewardType;
}

export interface AdEnergyRewardResponse {
  rewardType: 'energy';
  granted: number;
  energy: number;
  maxEnergy: number;
}

export interface AdDiamondRewardResponse {
  rewardType: 'diamonds';
  granted: number;
  diamonds: number;
}

export type ClaimAdRewardResponse = AdEnergyRewardResponse | AdDiamondRewardResponse;

export function claimAdReward(rewardType: AdRewardType): Promise<ClaimAdRewardResponse> {
  return post<ClaimAdRewardResponse>('/game/rewards/ad', { rewardType } as ClaimAdRewardRequest);
}
