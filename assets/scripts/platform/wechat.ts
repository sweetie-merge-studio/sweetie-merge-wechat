import type { Platform, SaveData } from '../core/types';
import { assetUrl } from '../core/asset-url';
import { deserialize } from '../core/storage';
import { get, post, setToken } from '../api/request';

// --- 环境变量：通过 setter 注入 ---

let _apiBaseUrl = '';
let _rewardedAdId = '';
let _interstitialAdId = '';

export function setApiBaseUrl(url: string) { _apiBaseUrl = url; }
export function setRewardedAdId(id: string) { _rewardedAdId = id; }
export function setInterstitialAdId(id: string) { _interstitialAdId = id; }

const SAVE_KEY = 'sweetie_merge_save';
const PRIVACY_KEY = 'sweetie_privacy_consent';

/**
 * 非微信环境标记（web-mobile 构建 / 浏览器本地验证）。
 * wx 全局不存在时所有平台能力降级：存档走 localStorage、广告直接放行、登录走离线。
 */
const hasWx = typeof wx !== 'undefined';

/**
 * 读取隐私协议同意状态。
 * 存储值：'1' = 已同意，'0' = 已拒绝，未存过/非法值回退 false（未同意）。
 */
export function getPrivacyConsent(): boolean {
  try {
    let raw: unknown;
    if (hasWx) {
      raw = wx.getStorageSync(PRIVACY_KEY);
    } else {
      raw = localStorage.getItem(PRIVACY_KEY);
    }
    if (raw === null || raw === undefined || raw === '') return false;
    return String(raw) === '1';
  } catch {
    return false;
  }
}

/**
 * 写入隐私协议同意状态并持久化。
 * 同意（true）后后续启动不再弹窗；拒绝（false）同样持久化，但下次启动仍弹窗。
 */
export function setPrivacyConsent(val: boolean): void {
  try {
    const v = val ? '1' : '0';
    if (hasWx) {
      wx.setStorageSync(PRIVACY_KEY, v);
    } else {
      localStorage.setItem(PRIVACY_KEY, v);
    }
  } catch {
    console.warn('[wechat] 隐私同意状态保存失败');
  }
}

/** 启动场景值（埋点 session_start 的 scene），取不到返回空串 */
export function getLaunchScene(): string {
  try {
    if (!hasWx || typeof wx.getLaunchOptionsSync !== 'function') return '';
    return String(wx.getLaunchOptionsSync().scene ?? '');
  } catch {
    return '';
  }
}

// --- onShow 监听 ---

let _lastShowOpts: Record<string, unknown> = {};

/** 获取最近一次 onShow 参数 */
export function getLastShowOpts(): Record<string, unknown> {
  return _lastShowOpts;
}

// --- 胶囊按钮位置 ---

/**
 * 微信胶囊按钮中心线距屏幕顶部的距离（设计单位，720 宽基准）。
 * 取不到时返回 0，由调用方决定回退策略。
 */
export function getCapsuleCenterYDesign(): number {
  try {
    if (!hasWx) return 0;
    const sysInfo = wx.getSystemInfoSync();
    const screenW = sysInfo?.screenWidth ?? 0;
    if (screenW <= 0) return 0;
    const toDesign = 720 / screenW;

    const wxAny = wx as unknown as { getMenuButtonBoundingClientRect?: () => { top: number; height: number } };
    if (typeof wxAny.getMenuButtonBoundingClientRect === 'function') {
      const rect = wxAny.getMenuButtonBoundingClientRect();
      if (rect && rect.top >= 0 && rect.height > 0) {
        return (rect.top + rect.height / 2) * toDesign;
      }
    }
    // 回退：胶囊按钮 ≈ statusBarHeight + 4(间距) + 16(半高)
    if (sysInfo.statusBarHeight > 0) {
      return (sysInfo.statusBarHeight + 20) * toDesign;
    }
  } catch {
    // ignore
  }
  return 0;
}

/** 微信平台初始化（在 app 入口调用一次） */
export function wechatInit(): void {
  if (!hasWx) {
    console.warn('[wechat] 非微信环境，平台能力降级（浏览器验证模式）');
    return;
  }
  // 尽早监听 onShow（从后台切回前台时触发，用于刷新状态）
  if (typeof wx.onShow === 'function') {
    wx.onShow((opts?: Record<string, unknown>) => {
      _lastShowOpts = opts ?? {};
      console.info('[wechat] onShow:', JSON.stringify(opts));
    });
  }
  // 注册全局转发菜单
  wx.showShareMenu({ withShareTicket: false });

  wx.onShareAppMessage(() => ({
    title: '甜心合成乐园 — 快来合成甜品吧！',
    imageUrl: assetUrl('/assets/share/default.webp'),
  }));
}

// --- 广告实例缓存（避免事件泄漏） ---

let cachedRewardedAd: WxRewardedVideoAd | null = null;
let cachedInterstitialAd: WxInterstitialAd | null = null;

// 最近一次激励视频的错误码（埋点 ad_finish.error_code 用；正常播完/中途关闭为空串）
let _lastRewardedAdError = '';
export function getLastRewardedAdError(): string { return _lastRewardedAdError; }

function getRewardedAd(): WxRewardedVideoAd {
  if (!cachedRewardedAd) {
    if (!_rewardedAdId) {
      console.warn('[wechat] 激励视频广告位 ID 未配置');
    }
    cachedRewardedAd = wx.createRewardedVideoAd({ adUnitId: _rewardedAdId });
  }
  return cachedRewardedAd;
}

function getInterstitialAd(): WxInterstitialAd {
  if (!cachedInterstitialAd) {
    if (!_interstitialAdId) {
      console.warn('[wechat] 插屏广告位 ID 未配置');
    }
    cachedInterstitialAd = wx.createInterstitialAd({ adUnitId: _interstitialAdId });
  }
  return cachedInterstitialAd;
}

// --- Platform 实现 ---

export const wechatPlatform: Platform = {
  name: 'wechat',
  save(data: SaveData): void {
    try {
      if (!hasWx) {
        localStorage.setItem(SAVE_KEY, JSON.stringify(data));
        return;
      }
      wx.setStorageSync(SAVE_KEY, JSON.stringify(data));
    } catch {
      console.warn('[wechat] 存档保存失败');
    }
  },

  load(): SaveData | null {
    try {
      const raw = hasWx ? wx.getStorageSync(SAVE_KEY) : localStorage.getItem(SAVE_KEY);
      if (typeof raw !== 'string' || raw === '') return null;
      return deserialize(JSON.parse(raw));
    } catch {
      console.warn('[wechat] 存档加载失败');
      return null;
    }
  },

  showRewardedAd(): Promise<boolean> {
    _lastRewardedAdError = '';
    if (!hasWx) {
      console.warn('[wechat] 非微信环境，激励视频直接放行');
      return Promise.resolve(true);
    }
    return new Promise((resolve) => {
      const ad = getRewardedAd();

      ad.offClose();
      ad.offError();

      ad.onClose((res: { isEnded: boolean }) => {
        resolve(res.isEnded);
      });

      ad.onError((err: { errMsg: string; errCode: number }) => {
        console.warn('[wechat] 激励视频加载失败:', err.errMsg);
        _lastRewardedAdError = String(err.errCode ?? err.errMsg ?? 'unknown');
        resolve(false);
      });

      ad.load().then(() => ad.show()).catch(() => {
        console.warn('[wechat] 激励视频展示失败，请稍后重试');
        _lastRewardedAdError = _lastRewardedAdError || 'load_or_show_failed';
        resolve(false);
      });
    });
  },

  showInterstitialAd(): Promise<void> {
    if (!hasWx) return Promise.resolve();
    return new Promise((resolve) => {
      const ad = getInterstitialAd();

      ad.offClose();
      ad.offError();

      ad.onClose(() => resolve());
      ad.onError(() => resolve());

      ad.load().then(() => ad.show()).catch(() => resolve());
    });
  },

  login(): Promise<{ openid: string }> {
    if (!hasWx) {
      return Promise.reject(new Error('[wechat] 非微信环境，跳过服务端登录（离线模式）'));
    }
    return new Promise((resolve, reject) => {
      const apiBase = _apiBaseUrl || '/api';
      wx.login({
        success(res: WxLoginSuccessResult) {
          // 用 code 换取 openid — 通过服务端 /auth/wechat 接口
          wx.request({
            url: `${apiBase}/auth/wechat`,
            method: 'POST',
            data: JSON.stringify({ code: res.code }),
            header: { 'Content-Type': 'application/json' },
            success(resp) {
              // 服务端响应带 envelope：{ success: true, data: { token, openid, player } }
              const body = resp.data as {
                success?: boolean;
                data?: { token?: string; openid?: string };
              };
              const result = body?.data ?? (resp.data as { token?: string; openid?: string });
              if (result?.token) {
                setToken(result.token);
              }
              if (result?.openid) {
                // 返回 wx_ 前缀标识 — 与服务端 /auth/wechat 注册的 deviceId 一致
                resolve({ openid: 'wx_' + result.openid });
              } else {
                // 降级：用 code 作为临时标识
                resolve({ openid: 'wx_' + res.code });
              }
            },
            fail() {
              // 降级：用 code 作为临时标识
              resolve({ openid: 'wx_' + res.code });
            },
          });
        },
        fail(err: { errMsg: string }) {
          reject(new Error('微信登录失败: ' + err.errMsg));
        },
      });
    });
  },

  share(title: string, imageUrl?: string): Promise<boolean> {
    if (!hasWx) return Promise.resolve(false);
    return new Promise((resolve) => {
      // 微信小游戏的主动转发不提供成功/失败回调，调用即视为已发起
      wx.shareAppMessage({
        title: title || '甜心合成乐园 — 快来合成甜品吧！',
        imageUrl: imageUrl || assetUrl('/assets/share/default.webp'),
      });
      resolve(true);
    });
  },

  async cloudSave(data: SaveData): Promise<boolean> {
    try {
      await post('/player/save', { save: data });
      return true;
    } catch {
      console.warn('[wechat] 云存档上传失败');
      return false;
    }
  },

  async cloudLoad(): Promise<SaveData | null> {
    try {
      const result = await get<{ save?: unknown }>('/player/save');
      if (!result?.save) return null;
      return deserialize(result.save);
    } catch {
      console.warn('[wechat] 云存档拉取失败');
      return null;
    }
  },
};
