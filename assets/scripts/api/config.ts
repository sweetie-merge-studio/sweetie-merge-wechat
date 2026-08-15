/**
 * 远程配置 API — 启动时拉取最新配置、物品定义、功能开关
 */

import { get } from './request';
import type { AppConfig } from '../core/config';

export interface ServerCategoryDef {
  id: string;
  name: string;
  emoji: string;
  unlockAt: number;
  items: Array<{ name: string; emoji: string }>;
}

export interface RemoteConfigResponse {
  config?: Partial<AppConfig>;
  categories?: ServerCategoryDef[];
  version?: number;
}

export function getRemoteConfig(): Promise<RemoteConfigResponse | null> {
  return get<RemoteConfigResponse>('/game/config', { offlineSilent: true });
}
