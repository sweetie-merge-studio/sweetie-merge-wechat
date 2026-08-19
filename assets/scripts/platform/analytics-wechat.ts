/**
 * 微信端埋点初始化 — 接入 wx.reportAnalytics（自定义分析）
 *
 * 与 Web 端 analytics-web.ts（Mixpanel + DataRangers）同位：
 * 平台层负责初始化通道并注入 core/analytics 的 send 实现，
 * 业务代码只调 trackEvent，不感知 SDK。
 *
 * 平台约束：
 * - 事件名与参数需先在小程序后台「统计 → 自定义分析」配置，
 *   未配置的事件会被平台静默丢弃（代码侧不报错，联调时先在后台建事件）
 * - 参数值只支持 string / number / boolean，其余类型序列化为 JSON 字符串
 */
import { registerAnalytics } from '../core/analytics';

const hasWx = typeof wx !== 'undefined';

function sanitizeProps(props?: Record<string, unknown>): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  if (!props) return out;
  for (const [key, value] of Object.entries(props)) {
    if (value == null) continue;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      out[key] = value;
    } else {
      out[key] = JSON.stringify(value);
    }
  }
  return out;
}

export function initAnalyticsWechat(): void {
  if (!hasWx || typeof wx.reportAnalytics !== 'function') {
    console.warn('[analytics] wx.reportAnalytics 不可用，埋点保持 no-op');
    return;
  }
  registerAnalytics(
    (event, props) => {
      try {
        wx.reportAnalytics!(event, sanitizeProps(props));
      } catch (err) {
        console.warn('[analytics] 上报失败', event, err);
      }
    },
    // 微信自定义分析没有用户属性概念，profileSet 为 no-op
    () => {},
  );
  console.info('[analytics] wx.reportAnalytics 通道已注册');
}
