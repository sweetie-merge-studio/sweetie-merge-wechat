/**
 * 振动反馈管理（模块单例）。
 *
 * - 封装微信 wx.vibrateShort / wx.vibrateLong，浏览器预览环境下降级为 no-op。
 * - 开关沿用存档键 setting_vibrate（布尔），默认开。
 * - 所有需要触觉反馈的地方统一走这里，方便全局开关控制。
 */

const STORAGE_KEY = 'setting_vibrate';

let _enabled = true;

/** 浏览器预览环境下没有 wx 对象 */
const hasWx = typeof wx !== 'undefined';

/** 在 GameManager.onLoad 调用一次，读取存档中的开关状态 */
export function initVibrate(): void {
  try {
    const raw = hasWx ? wx.getStorageSync(STORAGE_KEY) : localStorage.getItem(STORAGE_KEY);
    if (typeof raw === 'boolean') _enabled = raw;
    if (raw === 'false') _enabled = false;
  } catch {
    // 读取失败视为默认开
  }
}

export function setVibrateEnabled(on: boolean): void {
  _enabled = on;
  try {
    if (hasWx) wx.setStorageSync(STORAGE_KEY, on);
    else localStorage.setItem(STORAGE_KEY, String(on));
  } catch {
    console.warn('[vibrate] 振动开关保存失败');
  }
}

export function isVibrateEnabled(): boolean {
  return _enabled;
}

/** 短振动（按钮点击、普通合成等轻量反馈） */
export function vibrateShort(): void {
  if (!_enabled) return;
  if (!hasWx) return; // 浏览器预览不振动
  try {
    wx.vibrateShort({ type: 'light' });
  } catch {
    // 部分设备或低版本 SDK 可能不支持，静默失败
  }
}

/** 长振动（高级合成、升级、奖励等重要反馈） */
export function vibrateLong(): void {
  if (!_enabled) return;
  if (!hasWx) return;
  try {
    wx.vibrateLong();
  } catch {
    // 静默失败
  }
}
