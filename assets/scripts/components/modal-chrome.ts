import { BlockInputEvents, Color, Graphics, Label, Node, UITransform, Vec3, Widget } from 'cc';

import { TapZoneComponent, popModalLayer, pushModalLayer } from './tap-zone';
import { UI_COLORS } from './ui-factory';

/**
 * 主场景模态弹窗的共用构件。
 *
 * 节点名一律以 Modal_ 开头：主界面的全局输入监听（棋盘/订单/导航）不吃
 * BlockInputEvents，靠 bundle-pages.hasOpenBundlePage 按前缀识别覆盖层来挡触摸。
 *
 * 触摸独占则另走 tap-zone 的模态层：走全局 input 的点击区不受 BlockInputEvents
 * 约束，必须由 pushModalLayer 把命中范围限死在弹窗子树内（见 tap-zone.ts）。
 */
export const MODAL_PREFIX = 'Modal_';

/** 遮罩（压住下层棋盘/导航） */
const SCRIM = new Color(30, 20, 14, 170);
const PANEL_BG = new Color(255, 248, 238, 255);

export const MODAL_BTN_W = 240;
export const MODAL_BTN_H = 64;

/** 普通领取（棕） */
export const BTN_PLAIN = new Color(168, 128, 88, 255);
/** 看广告翻倍（绿，主行动） */
export const BTN_DOUBLE = new Color(126, 191, 108, 255);
/** 广告播放中的禁用态 */
export const BTN_BUSY = new Color(180, 160, 140, 255);

/**
 * 建一个铺满 canvas 的模态根节点。
 *
 * 建成即压入 tap-zone 的模态层，独占点击；节点销毁时自动弹出，
 * 调用方无需手动配对 popModalLayer（弹窗都是 destroy 自己了事）。
 *
 * @returns 已挂到 canvas 下的根节点；同名弹窗已存在时返回 null
 */
export function createModalRoot(canvas: Node, name: string): Node | null {
  const nodeName = `${MODAL_PREFIX}${name}`;
  if (canvas.getChildByName(nodeName)) return null;

  const root = new Node(nodeName);
  root.layer = canvas.layer;
  const canvasUi = canvas.getComponent(UITransform);
  const ui = root.addComponent(UITransform);
  if (canvasUi) ui.setContentSize(canvasUi.width, canvasUi.height);
  canvas.addChild(root);

  const widget = root.addComponent(Widget);
  widget.isAlignTop = widget.isAlignBottom = true;
  widget.isAlignLeft = widget.isAlignRight = true;
  widget.top = widget.bottom = widget.left = widget.right = 0;
  // ALWAYS + 立即对齐：FIXED_WIDTH 下可视高度大于设计高度，而小游戏启动后
  // 不再触发 window resize，ON_WINDOW_RESIZE 会让遮罩停在按 1280 算出的尺寸
  widget.alignMode = Widget.AlignMode.ALWAYS;
  widget.updateAlignment();

  pushModalLayer(root);
  root.on(Node.EventType.NODE_DESTROYED, () => popModalLayer(root));

  return root;
}

/** 在模态根节点上铺半透明遮罩，并挡掉节点触摸链路 */
export function buildScrim(root: Node): void {
  const ui = root.getComponent(UITransform);
  if (!ui) return;
  const g = root.addComponent(Graphics);
  g.fillColor = SCRIM;
  g.rect(-ui.width / 2, -ui.height / 2, ui.width, ui.height);
  g.fill();
  root.addComponent(BlockInputEvents);
}

/** 居中的圆角面板 */
export function buildPanel(root: Node, width: number, height: number): Node {
  const panel = new Node('panel');
  panel.layer = root.layer;
  panel.addComponent(UITransform).setContentSize(width, height);
  root.addChild(panel);

  const g = panel.addComponent(Graphics);
  g.fillColor = PANEL_BG;
  g.roundRect(-width / 2, -height / 2, width, height, 28);
  g.fill();
  return panel;
}

/** 重绘按钮底色（切禁用态时用） */
export function paintButton(btn: Node, bg: Color): void {
  const g = btn.getComponent(Graphics);
  if (!g) return;
  g.clear();
  g.fillColor = bg;
  g.roundRect(-MODAL_BTN_W / 2, -MODAL_BTN_H / 2, MODAL_BTN_W, MODAL_BTN_H, 14);
  g.fill();
}

/** 带文字与点击区的圆角按钮 */
export function buildModalButton(
  parent: Node,
  pos: Vec3,
  text: string,
  bg: Color,
  onTap: () => void,
): Node {
  const btn = new Node('button');
  btn.layer = parent.layer;
  btn.addComponent(UITransform).setContentSize(MODAL_BTN_W, MODAL_BTN_H);
  btn.setPosition(pos);
  parent.addChild(btn);
  btn.addComponent(Graphics);
  paintButton(btn, bg);

  buildModalLabel(btn, text, 24, new Vec3(0, 0, 0), {
    bold: true,
    color: new Color(255, 252, 245, 255),
    width: MODAL_BTN_W - 16,
  });

  btn.addComponent(TapZoneComponent).onTap = onTap;
  return btn;
}

/** 把按钮切成禁用态（广告请求中），并摘掉点击区 */
export function setButtonBusy(btn: Node | null, text: string): void {
  if (!btn?.isValid) return;
  btn.getComponent(TapZoneComponent)?.destroy();
  paintButton(btn, BTN_BUSY);
  const label = btn.getChildByName('label')?.getComponent(Label);
  if (label) label.string = text;
}

export interface ModalLabelOpts {
  bold?: boolean;
  color?: Color;
  width?: number;
}

/** 居中文字 */
export function buildModalLabel(
  parent: Node,
  text: string,
  fontSize: number,
  pos: Vec3,
  opts: ModalLabelOpts = {},
): Label {
  const node = new Node('label');
  node.layer = parent.layer;
  const ui = node.addComponent(UITransform);
  if (opts.width) ui.setContentSize(opts.width, fontSize * 1.6);
  node.setPosition(pos);
  parent.addChild(node);

  const label = node.addComponent(Label);
  label.string = text;
  label.fontSize = fontSize;
  label.lineHeight = fontSize * 1.3;
  label.isBold = opts.bold ?? false;
  label.color = opts.color ?? UI_COLORS.textBrown;
  label.overflow = Label.Overflow.SHRINK;
  return label;
}
