/**
 * 体力 API — 获取体力状态、消耗体力
 */

import { get, post } from './request';

export interface EnergyStatusResponse {
  energy: number;
  maxEnergy: number;
  regenIntervalSeconds: number;
  lastEnergyRegenAt: string;
  nextRegenAt: string | null;
}

export interface SpendEnergyRequest {
  amount: number;
}

export interface SpendEnergyResponse {
  energy: number;
  maxEnergy: number;
  spent: number;
}

export function getEnergyStatus(): Promise<EnergyStatusResponse> {
  return get<EnergyStatusResponse>('/game/energy/status');
}

export function spendEnergy(amount: number): Promise<SpendEnergyResponse> {
  return post<SpendEnergyResponse>('/game/energy/spend', { amount } as SpendEnergyRequest);
}

export type BuyCurrency = 'coins' | 'diamonds';
export type BuyEnergyType = 'fixed' | 'refill';

export interface BuyEnergyRequest {
  currency: BuyCurrency;
  type: BuyEnergyType;
  amount?: number;
}

export interface BuyEnergyResponse {
  energy: number;
  maxEnergy: number;
  granted: number;
  cost: number;
  currency: BuyCurrency;
  coins: number;
  diamonds: number;
}

export function buyEnergy(req: BuyEnergyRequest): Promise<BuyEnergyResponse> {
  return post<BuyEnergyResponse>('/game/energy/buy', req);
}
