import { Color, Graphics, Node, UITransform, Vec3 } from 'cc';

/**
 * 图鉴页动效的公共常量与绘制函数。
 *
 * 动效组件本身一个文件一个（effect-*.ts）——Cocos 限制「每个脚本至多一个
 * Component」，多个 @ccclass 挤在同一文件会导致资源导入报错、组件注册失败。
 */

/** 稀有进度环：未完成金色 #D4A24E，完成紫色 #C86DD7（Web .ring-fill） */
export const RING_PROGRESS = new Color(212, 162, 78, 255);
export const RING_COMPLETE = new Color(200, 109, 215, 255);
/** 进度环底槽（Web .ring-bg） */
export const RING_TRACK = new Color(216, 200, 216, 64);

/**
 * 画圆形进度环（Web .showcase-ring 的 SVG stroke-dasharray 等价物）。
 *
 * Web 版把 SVG 整体旋转 -90° 让进度从 12 点开始，这里直接用 -π/2 作起始角。
 */
export function drawProgressRing(
  node: Node,
  radius: number,
  lineWidth: number,
  ratio: number,
  color: Color,
): Graphics {
  const g = node.addComponent(Graphics);
  g.lineWidth = lineWidth;

  g.strokeColor = RING_TRACK;
  g.circle(0, 0, radius);
  g.stroke();

  if (ratio > 0) {
    const start = -Math.PI / 2;
    g.strokeColor = color;
    g.arc(0, 0, radius, start, start + Math.PI * 2 * Math.min(1, ratio), false);
    g.stroke();
  }
  return g;
}

/** 建一个带尺寸的空节点（动效组件常用的宿主） */
export function makeNode(parent: Node, name: string, size: number, pos: Vec3): Node {
  const n = new Node(name);
  n.layer = parent.layer;
  n.addComponent(UITransform).setContentSize(size, size);
  n.setPosition(pos);
  parent.addChild(n);
  return n;
}
