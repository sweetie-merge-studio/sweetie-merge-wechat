/**
 * WebView 网页打开封装
 *
 * 不同平台的网页打开能力不同：
 * - 抖音小游戏：tt.openWebview（主要用于支付，通用网页可能受限）
 * - 微信小游戏：不支持直接打开外部网页（无 web-view 组件），统一返回 false 走原生弹窗降级
 * - 浏览器预览：window.open 新标签页
 * - 其他平台：降级返回 false，由调用方决定 fallback 策略
 *
 * 用法：
 *   const ok = openWebView('https://example.com/privacy');
 *   if (!ok) { /* 降级到原生弹窗 *\/ }
 */

const hasWx = typeof wx !== 'undefined';
const hasWindow = typeof window !== 'undefined';

/**
 * 尝试用系统 WebView 打开 URL。
 * @returns true 表示已调用平台 API 打开（不保证一定成功展示），
 *          false 表示当前平台不支持或 URL 无效，调用方应走降级方案。
 */
export function openWebView(url: string): boolean {
  if (!url || !/^https?:\/\//i.test(url)) {
    console.warn('[webview] URL 无效，仅支持 http/https 协议:', url);
    return false;
  }

  // 微信小游戏：不支持直接打开外部网页，返回 false 让调用方走原生 RichText 弹窗
  if (hasWx) {
    console.info('[webview] 微信小游戏不支持打开外部网页，调用方应走原生弹窗降级');
    return false;
  }

  // 浏览器预览环境
  if (hasWindow && typeof window.open === 'function') {
    try {
      window.open(url, '_blank', 'noopener,noreferrer');
      return true;
    } catch (e) {
      console.warn('[webview] window.open 调用失败:', e);
      return false;
    }
  }

  console.warn('[webview] 当前平台不支持打开外部网页');
  return false;
}
