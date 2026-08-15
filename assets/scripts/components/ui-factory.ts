import { Color, Graphics, Node, Sprite, UITransform, Vec3 } from 'cc';
import { loadSpriteFrame, applySpriteFrame } from './sprite-loader';

/**
 * UI 节点工厂：用代码构建装饰性节点（背景图 / 圆角底板），
 * 与 Web 版（sweetie-merge App.vue）的视觉规范对齐。
 */

/** Web 版设计变量（对应 App.vue 里的 CSS 值） */
export const UI_COLORS = {
  /** 正文深棕 #6F4A39 */
  textBrown: new Color(111, 74, 57, 255),
  /** 格子奶油白 #FFF8EE */
  cellLight: new Color(255, 248, 238, 255),
  /** 格子浅褐 #F5E6D0（棋盘格交错） */
  cellAlt: new Color(245, 230, 208, 255),
  /** 药丸底 #FFF8EE */
  pillBg: new Color(255, 248, 238, 255),
  /** 药丸描边 #D4C0A0 */
  pillBorder: new Color(212, 192, 160, 255),
} as const;

/** 创建一个贴图节点（resources 路径），插入到 parent 的指定渲染层级 */
export function createSpriteNode(
  name: string,
  parent: Node,
  siblingIndex: number,
  width: number,
  height: number,
  spritePath: string,
  pos: Vec3 = new Vec3(0, 0, 0),
): Node {
  const node = new Node(name);
  node.layer = parent.layer;
  node.addComponent(UITransform).setContentSize(width, height);
  node.setPosition(pos);
  const sprite = node.addComponent(Sprite);
  parent.addChild(node);
  node.setSiblingIndex(siblingIndex);
  loadSpriteFrame(spritePath, sf => {
    if (sf && sprite.isValid) applySpriteFrame(sprite, sf);
  });
  return node;
}

/** 创建一个圆角矩形底板节点（可选描边） */
export function createRoundRectNode(
  name: string,
  parent: Node,
  siblingIndex: number,
  width: number,
  height: number,
  radius: number,
  fill: Color,
  stroke?: Color,
  pos: Vec3 = new Vec3(0, 0, 0),
): Node {
  const node = new Node(name);
  node.layer = parent.layer;
  node.addComponent(UITransform).setContentSize(width, height);
  node.setPosition(pos);
  const g = node.addComponent(Graphics);
  g.roundRect(-width / 2, -height / 2, width, height, radius);
  g.fillColor = fill;
  g.fill();
  if (stroke) {
    g.lineWidth = 3;
    g.strokeColor = stroke;
    g.roundRect(-width / 2, -height / 2, width, height, radius);
    g.stroke();
  }
  parent.addChild(node);
  node.setSiblingIndex(siblingIndex);
  return node;
}
