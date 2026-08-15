/**
 * 玩家 API — 存档同步、状态获取
 */

import { get, post } from './request';

export interface PlayerProfile {
  id: string;
  nickname: string;
  avatar: string;
  coins: number;
  diamonds: number;
  energy: number;
  lastEnergyRegenAt: string;
  exp: number;
  level: number;
  completedOrders: number;
  collectionRate: number;
  createdAt: string;
  lastLoginAt: string;
}

export interface PlayerProgress {
  boardState: unknown;
  backpackState: unknown;
  collectionData: unknown;
  coins: number;
  diamonds: number;
  energy: number;
  lastEnergyRegenAt: string;
  exp: number;
  level: number;
  completedOrders: number;
  collectionRate: number;
}

export interface PlayerFullState {
  profile: PlayerProfile;
  progress: {
    boardState: unknown;
    backpackState: unknown;
    collectionData: unknown;
  };
  activeOrders: unknown[];
  dailyTasks: unknown[];
  signin: {
    signedDays: number;
    todaySigned: boolean;
  };
}

export interface SaveProgressRequest {
  boardState?: unknown;
  backpackState?: unknown;
  collectionData?: unknown;
}

export function getProfile(): Promise<PlayerProfile> {
  return get<PlayerProfile>('/game/player/profile');
}

export function getProgress(): Promise<PlayerProgress> {
  return get<PlayerProgress>('/game/player/progress');
}

export function getFullState(): Promise<PlayerFullState> {
  return get<PlayerFullState>('/game/player/full-state');
}

export function saveProgress(data: SaveProgressRequest): Promise<PlayerProgress> {
  return post<PlayerProgress>('/game/player/progress', data, { offlineSilent: true });
}
