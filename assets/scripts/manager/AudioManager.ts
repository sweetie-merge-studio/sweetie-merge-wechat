import { AudioClip, AudioSource, Node, resources } from 'cc';

/**
 * 音频管理（模块单例）。
 *
 * - 音频文件放 `assets/resources/audio/`，当前三个 mp3 为占位空声，
 *   替换同名文件即可生效，代码无需改动。
 * - 声音开关沿用 Web 版的存档键 `setting_sound`（布尔），默认开。
 */

type SfxName = 'merge' | 'order_complete' | 'click' | 'popup_close' | 'popup_open' | 'level_up' | 'coin' | 'diamond' | 'error' | 'success' | 'purchase' | 'reward';

let _sfxSource: AudioSource | null = null;
let _bgmSource: AudioSource | null = null;
let _enabled = true;

const _clips = new Map<string, AudioClip>();

function loadClip(name: string, cb: (clip: AudioClip | null) => void): void {
  const cached = _clips.get(name);
  if (cached) {
    cb(cached);
    return;
  }
  resources.load(`audio/${name}`, AudioClip, (err, clip) => {
    if (err || !clip) {
      console.warn(`[audio] 加载失败: ${name}`);
      cb(null);
      return;
    }
    _clips.set(name, clip);
    cb(clip);
  });
}

/** 在常驻节点上初始化音源（GameManager.onLoad 调用一次） */
export function initAudio(host: Node): void {
  _sfxSource = host.addComponent(AudioSource);
  _bgmSource = host.addComponent(AudioSource);
  try {
    const raw = wx.getStorageSync('setting_sound');
    if (typeof raw === 'boolean') _enabled = raw;
    if (raw === 'false') _enabled = false;
  } catch {
    // 读取失败视为默认开
  }
}

export function setSoundEnabled(on: boolean): void {
  _enabled = on;
  try {
    wx.setStorageSync('setting_sound', on);
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

/** 循环播放背景乐 */
export function playBgm(): void {
  if (!_enabled || !_bgmSource) return;
  loadClip('bgm', clip => {
    if (!clip || !_bgmSource || !_bgmSource.isValid) return;
    if (_bgmSource.playing) return;
    _bgmSource.clip = clip;
    _bgmSource.loop = true;
    _bgmSource.volume = 0.4;
    _bgmSource.play();
  });
}

/** 播放一次性音效 */
export function playSfx(name: SfxName): void {
  if (!_enabled || !_sfxSource) return;
  loadClip(name, clip => {
    if (!clip || !_sfxSource || !_sfxSource.isValid) return;
    _sfxSource.playOneShot(clip, 1);
  });
}
