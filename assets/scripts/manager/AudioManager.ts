import { assetManager, AudioClip, AudioSource, Node, resources } from 'cc';

/**
 * 音频管理（模块单例）。
 *
 * - 音频文件放 `assets/bundles/game-audio/audio/`（子包），文件名与 SfxName 一一对应。
 *   生成脚本见仓库根 `scripts/gen-audio.mjs`，按 Web 端 core/audio.ts 的
 *   WebAudio 合成参数离线渲染为 WAV，再由 Cocos 导入时自动转码。
 * - 声音开关沿用 Web 版的存档键 `setting_sound`（布尔），默认开。
 * - 音效列表 v3 共 22 种 SFX + 1 首 BGM，全部由 scripts/gen-audio.mjs
 *   离线合成，面包甜品店风格（温暖钢琴+手风琴+尤克里里+响板沙锤）。
 *   基础：tap / click / drag / drop / page_switch / popup_open / popup_close
 *   玩法：merge / order_complete / level_up / unlock / error / energy_low / backpack
 *   经济：coin / diamond / purchase / reward
 *   子系统：blindbox / bake_done / checkin / sparkle
 *   背景：bgm（甜品店循环，17.9s）
 */

type SfxName =
  // —— 基础交互 ——
  | 'tap'           // 通用选中/轻点（水晶高音"叮"）
  | 'click'         // 有实际后果的确认点击（双音"叮咚"+铃铛尾音）
  | 'drag'          // 拖拽起（轻柔"噗"）
  | 'drop'          // 放置（柔和"咚"）
  | 'page_switch'   // 页面切换（轻柔滑音）
  | 'popup_open'    // 弹窗打开（上升"唰"）
  | 'popup_close'   // 弹窗关闭（下降"唰"）
  // —— 核心玩法 ——
  | 'merge'         // 合成成功（上升三音+闪光泛音+滑音）
  | 'order_complete'// 订单交付（大三和弦琶音+铃铛尾音+低音垫底）
  | 'level_up'      // 升级/重要奖励（四音上行琶音+高音闪光+颤音）
  | 'unlock'        // 新物品解锁（上升琶音+闪光）
  | 'error'         // 操作失败（温和下行双音，不刺耳）
  | 'energy_low'    // 体力不足（温和提醒三音）
  // —— 经济系统 ——
  | 'coin'          // 金币获得（经典"叮铃"金币声）
  | 'diamond'       // 钻石获得（水晶感"叮叮"）
  | 'purchase'      // 花钱（金币叮当+高音确认+低音"咚"）
  | 'reward'        // 白拿奖励（三音上行+铃铛尾音+闪光）
  // —— 子系统 ——
  | 'blindbox'      // 盲盒开启（神秘上升音→爆发闪光）
  | 'bake_done'     // 烘焙完成（温暖的"叮~"烤箱定时器感）
  | 'checkin'       // 签到打卡（轻快的"哒哒叮"）
  | 'sparkle'      // 闪光/特效（撒糖霜/糖粉，高频闪亮）
  | 'backpack'      // 拖入背包（放进面包篮/纸袋）
  | 'bubble'        // 泡泡音（导航打开页面/轻快冒出感）
  | 'knead';        // 揉面/擀面杖声（点击母棋生成子棋，案板滚动+面粉沙沙+生成确认）

let _sfxSource: AudioSource | null = null;
let _bgmSource: AudioSource | null = null;
let _enabled = true;
let _bgmWanted = false;       // 用户是否希望播放 BGM
let _userInteracted = false;  // 是否已发生首次用户交互（小游戏平台需交互后才能播音频）
let _bgmLoadRetrying = false; // BGM 加载失败重试中

const _clips = new Map<string, AudioClip>();
let _audioBundle: typeof resources | null = null;
let _audioBundleLoading = false;
const _audioBundleWaiters: Array<(b: typeof resources | null) => void> = [];

/** 确保 game-audio 子包已加载 */
function ensureAudioBundle(cb: (bundle: typeof resources | null) => void): void {
  if (_audioBundle) {
    cb(_audioBundle);
    return;
  }
  _audioBundleWaiters.push(cb);
  if (_audioBundleLoading) return;
  _audioBundleLoading = true;
  assetManager.loadBundle('game-audio', (err, bundle) => {
    _audioBundleLoading = false;
    if (err || !bundle) {
      console.error('[audio] 加载 game-audio 子包失败', err);
      _audioBundleWaiters.splice(0).forEach(fn => fn(null));
      return;
    }
    _audioBundle = bundle;
    _audioBundleWaiters.splice(0).forEach(fn => fn(bundle));
  });
}

/** 浏览器预览环境下降级到 localStorage */
const hasWx = typeof wx !== 'undefined';

function loadClip(name: string, cb: (clip: AudioClip | null) => void): void {
  const cached = _clips.get(name);
  if (cached) {
    cb(cached);
    return;
  }
  ensureAudioBundle(bundle => {
    if (!bundle) {
      cb(null);
      return;
    }
    bundle.load(`audio/${name}`, AudioClip, (err, clip) => {
      if (err || !clip) {
        console.warn(`[audio] 加载失败: ${name}`, err?.message ?? '');
        cb(null);
        return;
      }
      _clips.set(name, clip);
      cb(clip);
    });
  });
}

/** 通知发生了用户交互（首次触摸后调用，解锁小游戏平台的音频播放） */
export function notifyUserInteraction(): void {
  if (_userInteracted) return;
  _userInteracted = true;
  console.log('[audio] 首次用户交互，解锁音频播放');
  if (_bgmWanted) {
    _doPlayBgm();
  }
}

/** 在常驻节点上初始化音源（GameManager.onLoad 调用一次） */
export function initAudio(host: Node): void {
  _sfxSource = host.addComponent(AudioSource);
  _bgmSource = host.addComponent(AudioSource);
  try {
    const raw = hasWx ? wx.getStorageSync('setting_sound') : localStorage.getItem('setting_sound');
    if (typeof raw === 'boolean') _enabled = raw;
    if (raw === 'false') _enabled = false;
  } catch {
    // 读取失败视为默认开
  }
}

export function setSoundEnabled(on: boolean): void {
  _enabled = on;
  try {
    if (hasWx) wx.setStorageSync('setting_sound', on);
    else localStorage.setItem('setting_sound', String(on));
  } catch {
    console.warn('[audio] 声音开关保存失败');
  }
  if (!on) {
    _bgmSource?.stop();
  } else {
    playBgm();
  }
}

export function isSoundEnabled(): boolean {
  return _enabled;
}

/** 请求播放背景乐（如果还没用户交互，会延迟到首次交互后播放） */
export function playBgm(): void {
  _bgmWanted = true;
  if (!_enabled) {
    console.log('[audio] BGM 请求被忽略：声音开关关闭');
    return;
  }
  if (!_userInteracted) {
    console.log('[audio] BGM 请求已记录，等待首次用户交互后播放');
    return;
  }
  _doPlayBgm();
}

/** 实际执行 BGM 播放（内部函数） */
function _doPlayBgm(): void {
  if (!_enabled || !_bgmSource) return;
  if (_bgmSource.playing) return;
  loadClip('bgm', clip => {
    if (!clip || !_bgmSource || !_bgmSource.isValid) {
      // 加载失败，1秒后重试一次
      if (!_bgmLoadRetrying) {
        _bgmLoadRetrying = true;
        console.warn('[audio] BGM 加载失败，1秒后重试');
        setTimeout(() => {
          _bgmLoadRetrying = false;
          if (_bgmWanted && _enabled) _doPlayBgm();
        }, 1000);
      }
      return;
    }
    _bgmSource.clip = clip;
    _bgmSource.loop = true;
    _bgmSource.volume = 0.4;
    _bgmSource.play();
    console.log('[audio] BGM 开始播放');
  });
}

/** 播放一次性音效 */
export function playSfx(name: SfxName): void {
  // 播放 SFX 意味着有用户交互，解锁音频
  if (!_userInteracted) {
    _userInteracted = true;
    // 如果之前请求了 BGM，现在也启动
    if (_bgmWanted && _enabled) _doPlayBgm();
  }
  if (!_enabled || !_sfxSource) return;
  loadClip(name, clip => {
    if (!clip || !_sfxSource || !_sfxSource.isValid) return;
    _sfxSource.playOneShot(clip, 1);
  });
}
