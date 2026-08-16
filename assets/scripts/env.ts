/**
 * 运行环境配置（微信小游戏）。
 *
 * 这里是全项目唯一的环境注入点：GameManager.onLoad 调用 applyEnv()，
 * 把服务端地址与广告位 ID 灌进 api/request 与 platform/wechat 的模块级变量。
 *
 * 为什么需要它：request.ts 的 _baseUrl 默认值 '/api' 是相对路径，
 * 浏览器里能靠 origin 补全，但小游戏环境没有 origin，必须填绝对地址，
 * 否则所有请求（含 /auth/wechat 登录）直接失败。
 *
 * 上线前把下面的占位值替换成真实配置即可，代码无需改动。
 */

import { setBaseUrl } from './api/request';
import { setApiBaseUrl, setInterstitialAdId, setRewardedAdId } from './platform/wechat';

/** 服务端 API 根地址，必须是 https 绝对地址（小游戏不支持相对路径与 http） */
const API_BASE_URL = '';

/** 激励视频广告位 ID（微信公众平台「流量主 → 广告位管理」创建） */
const REWARDED_AD_ID = '';

/** 插屏广告位 ID */
const INTERSTITIAL_AD_ID = '';

/**
 * 注入环境配置（在 GameManager.onLoad 最早期调用一次）。
 * 未配置的项保持降级：无 API 地址则走离线模式，无广告位 ID 则广告直接放行。
 */
export function applyEnv(): void {
  if (API_BASE_URL) {
    setBaseUrl(API_BASE_URL);
    setApiBaseUrl(API_BASE_URL);
  } else {
    console.warn('[env] API_BASE_URL 未配置，服务端功能降级为离线模式');
  }

  if (REWARDED_AD_ID) setRewardedAdId(REWARDED_AD_ID);
  if (INTERSTITIAL_AD_ID) setInterstitialAdId(INTERSTITIAL_AD_ID);
}

/** 是否已配置服务端地址（供启动流程判断要不要尝试登录） */
export function hasApiBaseUrl(): boolean {
  return API_BASE_URL !== '';
}
