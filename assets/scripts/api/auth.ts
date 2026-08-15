/**
 * 认证 API — 微信小游戏版
 * 使用 wx.login() 获取 code，通过服务端换取 JWT
 */

import { post, setToken, clearToken } from './request';

export interface LoginRequest {
  deviceId: string;
  platform?: string;
  appVersion?: string;
}

export interface LoginResponse {
  token: string;
  player: {
    id: string;
    nickname: string;
    level: number;
    coins: number;
    diamonds: number;
    energy: number;
  };
}

/**
 * 设备登录 — 自动注册 + 登录
 * 服务端根据 deviceId 查找/创建玩家，返回 JWT
 */
export async function login(req: LoginRequest): Promise<LoginResponse> {
  const res = await post<LoginResponse>('/auth/game/login', req, { noAuth: true });
  setToken(res.token);
  return res;
}

/** 登出（清除本地 token） */
export function logout(): void {
  clearToken();
}
