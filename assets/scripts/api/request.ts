/**
 * HTTP 请求封装 — 微信小游戏版
 * 使用 wx.request 替代 fetch，wx.setStorageSync 替代 localStorage
 */

const TOKEN_KEY = 'sweetie_jwt';

// --- Token 管理 ---

export function getToken(): string | null {
  try {
    const val = wx.getStorageSync(TOKEN_KEY);
    return typeof val === 'string' ? val : null;
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  try {
    wx.setStorageSync(TOKEN_KEY, token);
  } catch {
    console.warn('[api] token 存储失败');
  }
}

export function clearToken(): void {
  try {
    wx.removeStorageSync(TOKEN_KEY);
  } catch {
    // ignore
  }
}

// --- 基础 URL ---

// 微信小游戏中无 import.meta.env，由初始化时设置
let _baseUrl = '/api';

export function setBaseUrl(url: string): void {
  _baseUrl = url.replace(/\/+$/, '');
}

function getBaseUrl(): string {
  return _baseUrl;
}

// --- 错误类型 ---

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class OfflineError extends Error {
  constructor() {
    super('Network unavailable');
    this.name = 'OfflineError';
  }
}

// --- 网络状态 ---

let _isOnline = true;

export function setOnlineStatus(online: boolean): void {
  _isOnline = online;
}

/** 初始化网络监听（在 app 启动时调用一次） */
export function initNetworkListener(): void {
  wx.getNetworkType({
    success(res) {
      _isOnline = res.networkType !== 'none';
    },
  });
  wx.onNetworkStatusChange((res) => {
    _isOnline = res.isConnected;
  });
}

// --- 核心请求 ---

interface RequestOptions {
  noAuth?: boolean;
  timeout?: number;
  offlineSilent?: boolean;
}

export function request<T>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
  opts: RequestOptions = {},
): Promise<T> {
  // 离线检测
  if (!_isOnline) {
    if (opts.offlineSilent) return Promise.resolve(null as T);
    return Promise.reject(new OfflineError());
  }

  const url = `${getBaseUrl()}${path}`;
  const header: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (!opts.noAuth) {
    const token = getToken();
    if (token) {
      header['Authorization'] = `Bearer ${token}`;
    }
  }

  return new Promise<T>((resolve, reject) => {
    wx.request({
      url,
      method,
      data: body != null ? JSON.stringify(body) : undefined,
      header,
      timeout: opts.timeout ?? 10_000,
      success(res) {
        // 401 → 清除 token
        if (res.statusCode === 401) {
          clearToken();
          reject(new ApiError(401, 'UNAUTHORIZED', 'Token expired or invalid'));
          return;
        }

        if (res.statusCode < 200 || res.statusCode >= 300) {
          // 服务端错误 envelope：{ success: false, error: 消息, errorCode: 错误码 }
          const data = res.data as Record<string, unknown> | undefined;
          const msg = data?.error ?? data?.message ?? `HTTP ${res.statusCode}`;
          const code = data?.errorCode ?? 'SERVER_ERROR';
          reject(new ApiError(res.statusCode, String(code), String(msg)));
          return;
        }

        resolve(unwrapEnvelope<T>(res.data));
      },
      fail(err) {
        if (opts.offlineSilent) {
          resolve(null as T);
          return;
        }
        reject(new OfflineError());
      },
    });
  });
}

/** 服务端成功 envelope：{ success: true, data }；历史裸响应原样返回 */
function unwrapEnvelope<T>(data: unknown): T {
  if (
    data !== null &&
    typeof data === 'object' &&
    'success' in data &&
    (data as { success: unknown }).success === true &&
    'data' in data
  ) {
    return (data as { data: T }).data;
  }
  return data as T;
}

// --- 快捷方法 ---

export function get<T>(path: string, opts?: RequestOptions): Promise<T> {
  return request<T>('GET', path, undefined, opts);
}

export function post<T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T> {
  return request<T>('POST', path, body, opts);
}

export function put<T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T> {
  return request<T>('PUT', path, body, opts);
}
