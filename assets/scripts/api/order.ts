/**
 * 订单 API — 生成订单、完成订单
 */

import { get, post } from './request';

export interface ServerOrder {
  id: string;
  playerId: string;
  orderItems: unknown;
  difficulty: string;
  rewardCoins: number;
  rewardExp: number;
  rewardDiamonds: number;
  status: 'active' | 'completed';
  createdAt: string;
}

export interface GenerateOrderRequest {
  difficulty?: 'easy' | 'normal' | 'hard';
}

export interface CompleteOrderResponse {
  order: ServerOrder;
  rewards: {
    coins: number;
    exp: number;
    diamonds: number;
  };
  leveledUp: boolean;
  levelRewards: {
    coins: number;
    diamonds: number;
    newLevel: number;
  } | null;
}

export function getActiveOrders(): Promise<ServerOrder[]> {
  return get<ServerOrder[]>('/game/orders');
}

export function generateOrder(req?: GenerateOrderRequest): Promise<ServerOrder> {
  return post<ServerOrder>('/game/orders', req);
}

export function completeOrder(orderId: string): Promise<CompleteOrderResponse> {
  return post<CompleteOrderResponse>(`/game/orders/${encodeURIComponent(orderId)}/complete`);
}
