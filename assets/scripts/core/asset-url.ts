/**
 * 资源 URL 辅助 — 微信小游戏版
 *
 * 在 Cocos Creator 中，资源通过 cc.resources.load 加载，
 * 但远程 CDN 资源仍需 URL 拼接。
 */

// 微信小游戏中 import.meta.env 不可用，使用编译时注入或硬编码
let CDN_BASE = '';

export function setCdnBase(url: string): void {
  CDN_BASE = url.replace(/\/+$/, '');
}

export function assetUrl(path: string): string {
  if (!CDN_BASE) return path;
  return `${CDN_BASE}${path}`;
}
