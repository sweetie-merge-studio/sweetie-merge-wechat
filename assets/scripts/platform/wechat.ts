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

/** 微信平台初始化（在 app 入口调用一次） */
export function wechatInit(): void {
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
      wx.setStorageSync(SAVE_KEY, JSON.stringify(data));
    } catch {
      console.warn('[wechat] 存档保存失败');
    }
  },

  load(): SaveData | null {
    try {
      const raw = wx.getStorageSync(SAVE_KEY);
      if (typeof raw !== 'string' || raw === '') return null;
      return deserialize(JSON.parse(raw));
    } catch {
      console.warn('[wechat] 存档加载失败');
      return null;
    }
  },

  showRewardedAd(): Promise<boolean> {
    return new Promise((resolve) => {
      const ad = getRewardedAd();

      ad.offClose();
      ad.offError();

      ad.onClose((res: { isEnded: boolean }) => {
        resolve(res.isEnded);
      });

      ad.onError((err: { errMsg: string; errCode: number }) => {
        console.warn('[wechat] 激励视频加载失败:', err.errMsg);
        resolve(false);
      });

      ad.load().then(() => ad.show()).catch(() => {
        console.warn('[wechat] 激励视频展示失败，请稍后重试');
        resolve(false);
      });
    });
  },

  showInterstitialAd(): Promise<void> {
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
