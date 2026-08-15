import { resources, Sprite, SpriteFrame, Texture2D } from 'cc';

/**
 * resources bundle 贴图加载器。
 *
 * 项目里的 PNG 以 texture 类型导入（meta 无 spriteFrame 子资源），
 * 所以运行时加载 Texture2D 后动态构造 SpriteFrame。
 *
 * - 同一路径的 SpriteFrame 全局缓存（棋盘每次刷新会重建 48 个格子节点）
 * - 并发请求合流：加载中的路径只发一次 resources.load
 */

type Callback = (sf: SpriteFrame | null) => void;

const cache = new Map<string, SpriteFrame>();
const pending = new Map<string, Callback[]>();

export function loadSpriteFrame(path: string, cb: Callback): void {
  if (!path) {
    cb(null);
    return;
  }
  const cached = cache.get(path);
  if (cached) {
    cb(cached);
    return;
  }
  const waiters = pending.get(path);
  if (waiters) {
    pending.set(path, [...waiters, cb]);
    return;
  }
  pending.set(path, [cb]);

  resources.load(`${path}/texture`, Texture2D, (err, texture) => {
    const callbacks = pending.get(path) ?? [];
    pending.delete(path);
    if (err || !texture) {
      console.warn(`[sprite-loader] 加载失败: ${path}`, err);
      callbacks.forEach(fn => fn(null));
      return;
    }
    const sf = new SpriteFrame();
    sf.texture = texture;
    cache.set(path, sf);
    callbacks.forEach(fn => fn(sf));
  });
}

/** 把贴图应用到 Sprite 上，保持节点原有尺寸（CUSTOM sizeMode） */
export function applySpriteFrame(sprite: Sprite, sf: SpriteFrame): void {
  sprite.sizeMode = Sprite.SizeMode.CUSTOM;
  sprite.spriteFrame = sf;
}
