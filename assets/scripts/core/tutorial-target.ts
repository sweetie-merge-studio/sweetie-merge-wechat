import { Node, UITransform, Vec3 } from 'cc';

/**
 * 新手引导目标注册表。
 *
 * 各组件在创建/更新目标节点时调用 register，销毁时调用 unregister。
 * TutorialOverlay 通过 getTargetRect 获取目标的世界坐标矩形，用于精确定位高亮。
 *
 * 对齐 Web 版的 data-tutorial 属性机制。
 */

export interface TutorialTargetRect {
  /** 世界坐标中心点 */
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 呼吸灯/手指精确位置（世界坐标点） */
export interface TutorialHandPos {
  x: number;
  y: number;
}

type TargetProvider = () => TutorialTargetRect | null;
type HandPosProvider = () => TutorialHandPos | null;

const registry = new Map<string, TargetProvider>();
const handRegistry = new Map<string, HandPosProvider>();

/** 注册一个目标节点（按节点名自动获取位置） */
export function registerTutorialTarget(target: string, node: Node): void {
  registry.set(target, () => getNodeRect(node));
}

/** 注册一个动态目标（通过回调获取位置，适用于棋盘格子等动态元素） */
export function registerTutorialTargetDynamic(target: string, provider: TargetProvider): void {
  registry.set(target, provider);
}

/** 注销目标 */
export function unregisterTutorialTarget(target: string): void {
  registry.delete(target);
}

/** 获取目标的世界坐标矩形（多个同名目标合并为包围盒） */
export function getTutorialTargetRect(target: string): TutorialTargetRect | null {
  const provider = registry.get(target);
  if (!provider) return null;
  return provider();
}

// ─── 呼吸灯精确位置 ────────────────────────────────────

/** 注册呼吸灯精确位置（动态回调，适用于棋盘格子等动态元素） */
export function registerTutorialHandPos(target: string, provider: HandPosProvider): void {
  handRegistry.set(target, provider);
}

/** 注销呼吸灯位置 */
export function unregisterTutorialHandPos(target: string): void {
  handRegistry.delete(target);
}

/** 获取呼吸灯精确位置（未注册时返回 null，调用方回退到高亮中心） */
export function getTutorialHandPos(target: string): TutorialHandPos | null {
  const provider = handRegistry.get(target);
  if (!provider) return null;
  return provider();
}

/** 从节点获取世界坐标矩形 */
export function getNodeRect(node: Node): TutorialTargetRect | null {
  if (!node?.isValid) return null;
  const ui = node.getComponent(UITransform);
  if (!ui) return null;
  const worldPos = new Vec3();
  node.getWorldPosition(worldPos);
  return {
    x: worldPos.x,
    y: worldPos.y,
    width: ui.width,
    height: ui.height,
  };
}

/** 合并多个矩形为包围盒 */
export function mergeRects(rects: (TutorialTargetRect | null)[]): TutorialTargetRect | null {
  const valid = rects.filter((r): r is TutorialTargetRect => r !== null);
  if (valid.length === 0) return null;
  if (valid.length === 1) return valid[0];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const r of valid) {
    minX = Math.min(minX, r.x - r.width / 2);
    maxX = Math.max(maxX, r.x + r.width / 2);
    minY = Math.min(minY, r.y - r.height / 2);
    maxY = Math.max(maxY, r.y + r.height / 2);
  }
  return {
    x: (minX + maxX) / 2,
    y: (minY + maxY) / 2,
    width: maxX - minX,
    height: maxY - minY,
  };
}
