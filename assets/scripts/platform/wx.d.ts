/**
 * 微信小游戏 wx 全局对象类型声明
 */

interface WxLoginSuccessResult {
  code: string;
}

interface WxRequestSuccessResult {
  data: unknown;
  statusCode: number;
  header: Record<string, string>;
}

interface WxRewardedVideoAd {
  load(): Promise<void>;
  show(): Promise<void>;
  onClose(cb: (res: { isEnded: boolean }) => void): void;
  offClose(cb?: () => void): void;
  onError(cb: (err: { errMsg: string; errCode: number }) => void): void;
  offError(cb?: () => void): void;
}

interface WxInterstitialAd {
  load(): Promise<void>;
  show(): Promise<void>;
  onClose(cb: () => void): void;
  offClose(cb?: () => void): void;
  onError(cb: (err: { errMsg: string; errCode: number }) => void): void;
  offError(cb?: () => void): void;
}

interface WxNetworkTypeResult {
  networkType: 'wifi' | '2g' | '3g' | '4g' | '5g' | 'unknown' | 'none';
}

interface WxNetworkStatusChangeResult {
  isConnected: boolean;
  networkType: string;
}

interface WxSystemInfo {
  brand: string;
  model: string;
  pixelRatio: number;
  screenWidth: number;
  screenHeight: number;
  windowWidth: number;
  windowHeight: number;
  statusBarHeight: number;
  language: string;
  version: string;
  system: string;
  platform: string;
  SDKVersion: string;
}

declare const wx: {
  // 存储
  setStorageSync(key: string, data: unknown): void;
  getStorageSync(key: string): unknown;
  removeStorageSync(key: string): void;

  // 自定义分析（事件需先在小程序后台「自定义分析」配置，未配置的会被平台静默丢弃）
  reportAnalytics?(eventName: string, data: Record<string, string | number | boolean>): void;

  // 启动参数（scene 场景值，埋点 session_start 用）
  getLaunchOptionsSync?(): { scene?: number };

  // 登录
  login(opts: {
    timeout?: number;
    success: (res: WxLoginSuccessResult) => void;
    fail: (err: { errMsg: string }) => void;
  }): void;

  // 网络请求
  request(opts: {
    url: string;
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    data?: string | Record<string, unknown>;
    header?: Record<string, string>;
    timeout?: number;
    success: (res: WxRequestSuccessResult) => void;
    fail: (err: { errMsg: string }) => void;
    complete?: () => void;
  }): void;

  // 分享
  showShareMenu(opts?: { withShareTicket?: boolean; menus?: string[] }): void;
  onShareAppMessage(cb: () => { title: string; imageUrl?: string }): void;
  shareAppMessage(opts: {
    title: string;
    imageUrl?: string;
    query?: string;
  }): void;

  // 广告
  createRewardedVideoAd(opts: { adUnitId: string }): WxRewardedVideoAd;
  createInterstitialAd(opts: { adUnitId: string }): WxInterstitialAd;

  // 网络
  getNetworkType(opts: {
    success: (res: WxNetworkTypeResult) => void;
    fail?: (err: { errMsg: string }) => void;
  }): void;
  onNetworkStatusChange(cb: (res: WxNetworkStatusChangeResult) => void): void;
  offNetworkStatusChange(cb?: (res: WxNetworkStatusChangeResult) => void): void;

  // 系统
  getSystemInfoSync(): WxSystemInfo;

  // 生命周期
  onShow(cb: () => void): void;
  onHide(cb: () => void): void;
  offShow(cb?: () => void): void;
  offHide(cb?: () => void): void;

  // 振动
  vibrateShort(opts?: { type?: 'heavy' | 'medium' | 'light'; success?: () => void; fail?: () => void }): void;
  vibrateLong(opts?: { success?: () => void; fail?: () => void }): void;

  // 剪贴板
  setClipboardData(opts: { data: string; success?: () => void; fail?: () => void }): void;
};
