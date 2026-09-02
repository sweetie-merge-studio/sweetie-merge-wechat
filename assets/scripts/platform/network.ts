/**
 * 统一网络状态管理 — api/request.ts 与 platform/offline-queue.ts 的唯一真相源
 *
 * 此前两处各自维护 _isOnline 与网络监听，可能出现状态不一致：
 * - request.ts 在 initNetworkListener() 中监听
 * - offline-queue.ts 在模块顶部直接监听
 * 本模块收口后，所有网络状态查询和恢复回调都走这里。
 */

let _isOnline = true;
let _reconnectCallback: (() => void) | null = null;

/** 当前是否在线 */
export function isOnline(): boolean {
  return _isOnline;
}

/** 手动设置在线状态（测试或特殊场景用），从离线切到在线时触发恢复回调 */
export function setOnlineStatus(online: boolean): void {
  const wasOffline = !_isOnline;
  _isOnline = online;
  if (online && wasOffline) {
    _reconnectCallback?.();
  }
}

/** 注册网络恢复回调（offline-queue 用于重放队列），返回取消注册函数 */
export function onReconnect(cb: () => void): () => void {
  _reconnectCallback = cb;
  return () => {
    if (_reconnectCallback === cb) _reconnectCallback = null;
  };
}

/** 初始化网络状态监听（在 app 启动时调用一次） */
export function initNetworkListener(): void {
  if (typeof wx === 'undefined') return;

  wx.getNetworkType({
    success(res: { networkType: string }) {
      _isOnline = res.networkType !== 'none';
    },
  });

  wx.onNetworkStatusChange((res: { isConnected: boolean }) => {
    const wasOffline = !_isOnline;
    _isOnline = res.isConnected;
    if (res.isConnected && wasOffline) {
      console.info('[network] 网络恢复，触发重连回调');
      _reconnectCallback?.();
    }
    if (!res.isConnected) {
      console.info('[network] 网络断开');
    }
  });
}
