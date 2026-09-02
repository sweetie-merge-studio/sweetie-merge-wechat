import { Color, Graphics, Label, Node, Sprite, UITransform, Vec3 } from 'cc';
import { loadSpriteFrame, applySpriteFrame } from './sprite-loader';
import { fontManager } from '../core/font-manager';

/**
 * UI 节点工厂：用代码构建装饰性节点（背景图 / 圆角底板），
 * 与 Web 版（sweetie-merge App.vue）的视觉规范对齐。
 */

/** Web 版设计变量（对应 App.vue / ShopFullView.vue 里的 CSS 值） */
export const UI_COLORS = {
  /** 正文深棕 #6F4A39 */
  textBrown: new Color(111, 74, 57, 255),
  /** 标题深棕 #5C3A1E */
  titleBrown: new Color(92, 58, 30, 255),
  /** 次要文字棕 #9B7B5A */
  subTextBrown: new Color(155, 123, 90, 255),
  /** 金色 #D4A24E */
  gold: new Color(212, 162, 78, 255),
  /** 浅金色 #F0D68A */
  goldLight: new Color(240, 214, 138, 255),
  /** 格子奶油白 #FFF8EE */
  cellLight: new Color(255, 248, 238, 255),
  /** 格子浅褐 #F5E6D0（棋盘格交错） */
  cellAlt: new Color(245, 230, 208, 255),
  /** 药丸底 #FFF8EE */
  pillBg: new Color(255, 248, 238, 255),
  /** 药丸描边 #D4C0A0 */
  pillBorder: new Color(212, 192, 160, 255),
  /** 面板描边 #E8D5B8 */
  panelBorder: new Color(232, 213, 184, 255),
  /** 页面背景奶油色 #F2E9CA */
  pageBg: new Color(242, 233, 202, 255),
  /** 绿色按钮 #7EBF6C */
  btnGreen: new Color(126, 191, 108, 255),
  /** 棕色按钮 #A88058 */
  btnBrown: new Color(168, 128, 88, 255),
  /** 按钮文字白 #FFFDF5 */
  btnText: new Color(255, 253, 245, 255),
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

export interface LabelOptions {
  text?: string;
  fontSize?: number;
  color?: Color;
  isBold?: boolean;
  lineHeight?: number;
  /** Label.HorizontalAlign 枚举值 */
  horizontalAlign?: number;
  /** Label.Overflow 枚举值 */
  overflow?: number;
  enableWrapText?: boolean;
  /** 锚点 x（0~1），默认 0.5 */
  anchorX?: number;
  /** 锚点 y（0~1），默认 0.5 */
  anchorY?: number;
}

/**
 * 创建一个 Label 节点，自动应用全局圆润可爱风自定义字体。
 * 插入到 parent 的指定渲染层级。
 */
export function createLabel(
  name: string,
  parent: Node,
  siblingIndex: number,
  width: number,
  height: number,
  pos: Vec3 = new Vec3(0, 0, 0),
  options: LabelOptions = {},
): Label {
  const node = new Node(name);
  node.layer = parent.layer;
  const ui = node.addComponent(UITransform);
  ui.setContentSize(width, height);
  ui.setAnchorPoint(options.anchorX ?? 0.5, options.anchorY ?? 0.5);
  node.setPosition(pos);
  parent.addChild(node);
  node.setSiblingIndex(siblingIndex);

  const label = node.addComponent(Label);
  if (options.text !== undefined) label.string = options.text;
  if (options.fontSize !== undefined) label.fontSize = options.fontSize;
  if (options.color !== undefined) label.color = options.color;
  if (options.isBold !== undefined) label.isBold = options.isBold;
  if (options.lineHeight !== undefined) label.lineHeight = options.lineHeight;
  if (options.horizontalAlign !== undefined) label.horizontalAlign = options.horizontalAlign;
  if (options.overflow !== undefined) label.overflow = options.overflow;
  if (options.enableWrapText !== undefined) label.enableWrapText = options.enableWrapText;

  // 自动应用全局圆润可爱风字体
  fontManager.applyFont(label);
  return label;
}
