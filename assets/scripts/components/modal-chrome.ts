import { _decorator, BlockInputEvents, Color, Component, Graphics, Label, Node, RichText, Sprite, UITransform, Vec3, Widget } from 'cc';

import { TapZoneComponent, popModalLayer, pushModalLayer } from './tap-zone';
import { UI_COLORS } from './ui-factory';
import { loadSpriteFrame, applySpriteFrame } from './sprite-loader';
import { fontManager } from '../core/font-manager';
import { playSfx } from '../manager/AudioManager';

const { ccclass } = _decorator;

/**
 * 模态根节点组件：onLoad 压入模态层，onDestroy 弹出。
 * 与抖音端 ModalRoot 对齐，确保模态层生命周期与节点生命周期严格绑定。
 */
@ccclass('ModalRoot')
export class ModalRoot extends Component {
  protected onLoad(): void {
    pushModalLayer(this.node);
  }
  protected onDestroy(): void {
    popModalLayer(this.node);
  }
}

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

/** 遮罩（压住下层棋盘/导航）— 对齐 Web 版 rgba(111,74,57,0.4) */
const SCRIM = new Color(111, 74, 57, 102);
/** 简单弹层面板底色（对齐 Web 版 Modal.panel 底色 #F5EDD8，与 SHELL_PANEL_BG 同色） */
const PANEL_BG = new Color(245, 237, 216, 255);

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

  // 用 ModalRoot 组件管理模态层生命周期（onLoad push / onDestroy pop）
  root.addComponent(ModalRoot);

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

/** 居中的圆角面板 — 带阴影+边框，对齐 Web 版 Modal 风格 */
export function buildPanel(root: Node, width: number, height: number): Node {
  // 阴影（单独节点，偏移模拟投影）
  const shadow = new Node('panelShadow');
  shadow.layer = root.layer;
  shadow.addComponent(UITransform).setContentSize(width, height);
  shadow.setPosition(new Vec3(2, -4, 0));
  root.addChild(shadow);
  paintPanelShadow(shadow.addComponent(Graphics), width, height);

  // 面板（底色+高光+边框）
  const panel = new Node('panel');
  panel.layer = root.layer;
  panel.addComponent(UITransform).setContentSize(width, height);
  root.addChild(panel);
  paintPanelBorder(panel.addComponent(Graphics), width, height, PANEL_BG);
  return panel;
}

/** 重绘按钮底色（切禁用态时用）— 带底部阴影+边框，对齐 Web 版按钮风格 */
export function paintButton(btn: Node, bg: Color): void {
  const g = btn.getComponent(Graphics);
  if (!g) return;
  g.clear();
  const w = MODAL_BTN_W;
  const h = MODAL_BTN_H;
  const r = 14;
  // 底部阴影（深色偏移 2px）
  g.fillColor = new Color(0, 0, 0, 40);
  g.roundRect(-w / 2, -h / 2 - 2, w, h, r);
  g.fill();
  // 主底色
  g.fillColor = bg;
  g.roundRect(-w / 2, -h / 2, w, h, r);
  g.fill();
  // 顶部高光（半透明白色上半部分）
  g.fillColor = new Color(255, 255, 255, 30);
  g.roundRect(-w / 2 + 2, 0, w - 4, h / 2 - 2, r / 2);
  g.fill();
  // 边框
  g.lineWidth = 1.5;
  g.strokeColor = new Color(0, 0, 0, 30);
  g.roundRect(-w / 2, -h / 2, w, h, r);
  g.stroke();
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
  // 默认宽度 = 父节点宽度 - 40px 边距；未传 width 时避免 UITransform 宽度为 0 导致文字被截断换行
  const defaultWidth = (parent.getComponent(UITransform)?.width ?? 400) - 40;
  ui.setContentSize(opts.width ?? defaultWidth, fontSize * 1.6);
  node.setPosition(pos);
  parent.addChild(node);

  const label = node.addComponent(Label);
  label.string = text;
  label.fontSize = fontSize;
  label.lineHeight = fontSize * 1.3;
  label.isBold = opts.bold ?? false;
  label.color = opts.color ?? UI_COLORS.textBrown;
  label.overflow = Label.Overflow.SHRINK;
  fontManager.applyFont(label);
  return label;
}

/* ═══════════════════════════════════════════════════════════════
 * 公共弹窗外壳（对齐 Web 版 shared/Modal.vue）
 *
 * 所有需要"居中弹窗 + 遮罩 + 标题栏 + 关闭按钮"的页面统一走这里，
 * 不在各自页面里重复画面板、标题、关闭按钮。
 * ═══════════════════════════════════════════════════════════════ */

/** 弹窗面板底色 #F5EDD8 */
export const SHELL_PANEL_BG = new Color(245, 237, 216, 255);
/** 弹窗面板描边（深金棕，确保在浅色背景上四边都清晰可见） */
export const SHELL_PANEL_BORDER = new Color(160, 120, 64, 255);
/** 弹窗面板阴影颜色 */
const SHELL_SHADOW = new Color(80, 50, 20, 70);

/** 绘制面板阴影（圆角矩形，偏移由调用方通过节点 position 控制） */
function paintPanelShadow(g: Graphics, w: number, h: number): void {
  g.clear();
  g.fillColor = SHELL_SHADOW;
  g.roundRect(-w / 2, -h / 2, w, h, calcPanelRadius(w));
  g.fill();
}

/** 弹窗面板圆角（根据面板宽度动态计算） */
export function calcPanelRadius(panelWidth: number): number {
  return panelWidth * 180 / 2048;
}
/** 弹窗面板圆角 fallback（宽度未知时使用，约 600px 面板的圆角） */
export const SHELL_PANEL_RADIUS = 53;
/** 弹窗面板描边宽度（加粗到 4.5，确保四边清晰） */
export const SHELL_PANEL_BORDER_W = 4.5;

/** 标题文字 #5C3A1E */
const SHELL_TITLE_COLOR = new Color(92, 58, 30, 255);
/** 标题字号 */
const SHELL_TITLE_FONT = 40;
/** 标题描边色 */
const SHELL_TITLE_OUTLINE = new Color(255, 248, 238, 255);
/** 标题描边宽度 */
const SHELL_TITLE_OUTLINE_W = 3;
const SHELL_ICON_SIZE = 42;

/** 关闭按钮 */
const SHELL_CLOSE_SIZE = 44;
const SHELL_CLOSE_BG = new Color(232, 213, 184, 255);
const SHELL_CLOSE_BORDER = new Color(196, 168, 122, 255);
const SHELL_CLOSE_COLOR = new Color(139, 99, 64, 255);
const SHELL_CLOSE_FONT = 24;

/** 副标题气泡 */
export const SHELL_SUBTITLE_H = 42;
const SHELL_SUBTITLE_FONT = 18;
const SHELL_SUBTITLE_BG = new Color(255, 248, 238, 255);
const SHELL_SUBTITLE_BORDER = new Color(212, 184, 150, 255);
const SHELL_SUBTITLE_BORDER_W = 2;
const SHELL_SUBTITLE_DASH = 8;
const SHELL_SUBTITLE_GAP = 5;

/** 面板内边距 */
export const SHELL_PAD_TOP = 60;
export const SHELL_PAD_BOTTOM = 18;
export const SHELL_PAD_SIDE = 20;
export const SHELL_HEADER_H = 52;
export const SHELL_GAP_HEADER_SUB = 12;
export const SHELL_GAP_SUB_BODY = 14;
export const SHELL_GAP_HEADER_BODY = 16;

/** 节点名常量 */
export const SHELL_PANEL_NAME = 'modalPanel';
export const SHELL_HEADER_NAME = 'modalHeader';
export const SHELL_TITLE_LABEL_NAME = 'modalTitleLabel';
export const SHELL_SUBTITLE_NAME = 'modalSubtitle';
export const SHELL_SUBTITLE_LABEL_NAME = 'modalSubtitleLabel';
export const SHELL_BODY_NAME = 'modalBody';
export const SHELL_CLOSE_NAME = 'modalClose';

export interface ModalShellOptions {
  width: number;
  height: number;
  title: string;
  iconPath?: string;
  subtitle?: string;
}

export interface ModalShell {
  root: Node;
  panel: Node;
  body: Node;
  titleLabel: Label;
  subtitleLabel: RichText | null;
  close: () => void;
}

/** 绘制面板背景+边框 */
export function paintPanelBorder(g: Graphics, w: number, h: number, bgColor?: Color): void {
  const radius = calcPanelRadius(w);
  g.clear();
  if (bgColor) {
    g.fillColor = bgColor;
    g.roundRect(-w / 2, -h / 2, w, h, radius);
    g.fill();
  }
  g.fillColor = new Color(255, 255, 255, 14);
  g.roundRect(-w / 2 + 4, h / 2 - h / 3, w - 8, h / 3 - 6, radius / 2);
  g.fill();
  g.lineWidth = SHELL_PANEL_BORDER_W;
  g.strokeColor = SHELL_PANEL_BORDER;
  g.roundRect(-w / 2, -h / 2, w, h, radius);
  g.stroke();
}

/** 动态调整弹窗面板高度 */
export function resizeModalPanel(panel: Node, newHeight: number): void {
  if (!panel || panel.name !== SHELL_PANEL_NAME) return;
  const root = panel.parent;
  if (!root) return;

  const rootUi = root.getComponent(UITransform);
  const maxH = rootUi ? rootUi.height * 0.9 : newHeight;
  newHeight = Math.min(newHeight, maxH);

  const panelUi = panel.getComponent(UITransform);
  const w = panelUi?.width ?? 600;
  if (panelUi) panelUi.setContentSize(w, newHeight);

  const borderNode = panel.getChildByName('panelBorder');
  if (borderNode) {
    const borderUi = borderNode.getComponent(UITransform);
    if (borderUi) borderUi.setContentSize(w, newHeight);
    const pg = borderNode.getComponent(Graphics);
    if (pg) paintPanelBorder(pg, w, newHeight, SHELL_PANEL_BG);
  }

  const shadow = root.getChildByName('modalShadow');
  if (shadow) {
    const shadowUi = shadow.getComponent(UITransform);
    if (shadowUi) shadowUi.setContentSize(w, newHeight);
    const sg = shadow.getComponent(Graphics);
    if (sg) paintPanelShadow(sg, w, newHeight);
  }

  const hasSubtitle = !!panel.getChildByName(SHELL_SUBTITLE_NAME)?.active;
  let cursor = newHeight / 2 - SHELL_PAD_TOP;

  const header = panel.getChildByName(SHELL_HEADER_NAME);
  if (header) {
    const headerY = cursor - SHELL_HEADER_H / 2;
    header.setPosition(new Vec3(0, headerY, 0));
  }
  cursor -= SHELL_HEADER_H;

  if (hasSubtitle) {
    cursor -= SHELL_GAP_HEADER_SUB;
    const sub = panel.getChildByName(SHELL_SUBTITLE_NAME);
    if (sub) {
      const subY = cursor - SHELL_SUBTITLE_H / 2;
      sub.setPosition(new Vec3(0, subY, 0));
    }
    cursor -= SHELL_SUBTITLE_H;
    cursor -= SHELL_GAP_SUB_BODY;
  } else {
    cursor -= SHELL_GAP_HEADER_BODY;
  }

  const body = panel.getChildByName(SHELL_BODY_NAME);
  if (body) {
    const bodyBottom = -newHeight / 2 + SHELL_PAD_BOTTOM;
    const bodyH = cursor - bodyBottom;
    const bodyY = (cursor + bodyBottom) / 2;
    const bodyUi = body.getComponent(UITransform);
    if (bodyUi) bodyUi.setContentSize(w - SHELL_PAD_SIDE * 2, bodyH);
    body.setPosition(new Vec3(0, bodyY, 0));
  }
}

/** 构建公共弹窗外壳 */
export function buildModalShell(root: Node, opts: ModalShellOptions): ModalShell {
  buildScrim(root);

  const { width: pw, height: phInput } = opts;
  const rootUi = root.getComponent(UITransform);
  const maxH = rootUi ? rootUi.height * 0.9 : phInput;
  const ph = Math.min(phInput, maxH);
  const title = typeof opts.title === 'string' ? opts.title : '';

  // 阴影
  const shadow = new Node('modalShadow');
  shadow.layer = root.layer;
  shadow.addComponent(UITransform).setContentSize(pw, ph);
  shadow.setPosition(new Vec3(3, -5, 0));
  root.addChild(shadow);
  const sg = shadow.addComponent(Graphics);
  paintPanelShadow(sg, pw, ph);

  // 面板
  const panel = new Node(SHELL_PANEL_NAME);
  panel.layer = root.layer;
  panel.addComponent(UITransform).setContentSize(pw, ph);
  panel.setPosition(new Vec3(0, 0, 0));
  root.addChild(panel);

  const borderNode = new Node('panelBorder');
  borderNode.layer = panel.layer;
  borderNode.addComponent(UITransform).setContentSize(pw, ph);
  panel.addChild(borderNode);
  const borderG = borderNode.addComponent(Graphics);
  paintPanelBorder(borderG, pw, ph, SHELL_PANEL_BG);

  // 从顶部往下布局
  let cursor = ph / 2 - SHELL_PAD_TOP;

  const headerY = cursor - SHELL_HEADER_H / 2;
  const header = new Node(SHELL_HEADER_NAME);
  header.layer = panel.layer;
  header.addComponent(UITransform).setContentSize(pw - SHELL_PAD_SIDE * 2, SHELL_HEADER_H);
  header.setPosition(new Vec3(0, headerY, 0));
  panel.addChild(header);
  cursor -= SHELL_HEADER_H;

  const textWidth = title.length * SHELL_TITLE_FONT;
  const titleLabelPad = SHELL_TITLE_OUTLINE_W * 2 + 12;
  const iconGap = opts.iconPath ? SHELL_ICON_SIZE + 12 : 0;
  const titleTotalWidth = iconGap + textWidth;
  const titleLeft = -titleTotalWidth / 2;

  if (opts.iconPath) {
    const iconNode = new Node('titleIcon');
    iconNode.layer = header.layer;
    iconNode.addComponent(UITransform).setContentSize(SHELL_ICON_SIZE, SHELL_ICON_SIZE);
    iconNode.setPosition(new Vec3(titleLeft + SHELL_ICON_SIZE / 2, 0, 0));
    header.addChild(iconNode);
    const iconSprite = iconNode.addComponent(Sprite);
    loadSpriteFrame(opts.iconPath, sf => {
      if (sf && iconSprite.isValid) applySpriteFrame(iconSprite, sf);
    });
  }

  const titleLabelNode = new Node(SHELL_TITLE_LABEL_NAME);
  titleLabelNode.layer = header.layer;
  titleLabelNode.addComponent(UITransform).setContentSize(textWidth + titleLabelPad, SHELL_HEADER_H);
  const labelX = titleLeft + iconGap + textWidth / 2;
  titleLabelNode.setPosition(new Vec3(labelX, 0, 0));
  header.addChild(titleLabelNode);
  const titleLabel = titleLabelNode.addComponent(Label);
  titleLabel.string = title;
  titleLabel.fontSize = SHELL_TITLE_FONT;
  titleLabel.lineHeight = SHELL_HEADER_H;
  titleLabel.isBold = true;
  titleLabel.color = SHELL_TITLE_COLOR;
  fontManager.applyFont(titleLabel);
  titleLabel.enableOutline = true;
  titleLabel.outlineColor = SHELL_TITLE_OUTLINE;
  titleLabel.outlineWidth = SHELL_TITLE_OUTLINE_W;
  titleLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
  titleLabel.verticalAlign = Label.VerticalAlign.CENTER;
  titleLabel.overflow = Label.Overflow.SHRINK;

  // 关闭按钮
  const close = new Node(SHELL_CLOSE_NAME);
  close.layer = header.layer;
  close.addComponent(UITransform).setContentSize(SHELL_CLOSE_SIZE, SHELL_CLOSE_SIZE);
  close.setPosition(new Vec3(pw / 2 - SHELL_PAD_SIDE - SHELL_CLOSE_SIZE / 2, 0, 0));
  header.addChild(close);
  const cg = close.addComponent(Graphics);
  const cr = SHELL_CLOSE_SIZE / 2;
  cg.fillColor = SHELL_CLOSE_BG;
  cg.circle(0, 0, cr);
  cg.fill();
  cg.lineWidth = 2;
  cg.strokeColor = SHELL_CLOSE_BORDER;
  cg.circle(0, 0, cr);
  cg.stroke();
  const closeLabelNode = new Node('label');
  closeLabelNode.layer = close.layer;
  closeLabelNode.addComponent(UITransform);
  close.addChild(closeLabelNode);
  const closeLabel = closeLabelNode.addComponent(Label);
  closeLabel.string = '✕';
  closeLabel.fontSize = SHELL_CLOSE_FONT;
  closeLabel.isBold = true;
  closeLabel.color = SHELL_CLOSE_COLOR;
  closeLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
  closeLabel.verticalAlign = Label.VerticalAlign.CENTER;
  fontManager.applyFont(closeLabel);
  close.addComponent(TapZoneComponent).onTap = () => {
    if (root.isValid) {
      playSfx('popup_close');
      root.destroy();
    }
  };

  // 副标题气泡
  let subtitleLabel: RichText | null = null;
  const hasSubtitle = opts.subtitle !== undefined;
  if (hasSubtitle) {
    cursor -= SHELL_GAP_HEADER_SUB;
    const subY = cursor - SHELL_SUBTITLE_H / 2;
    const sub = new Node(SHELL_SUBTITLE_NAME);
    sub.layer = panel.layer;
    const subW = Math.min(pw - SHELL_PAD_SIDE * 2, 380);
    sub.addComponent(UITransform).setContentSize(subW, SHELL_SUBTITLE_H);
    sub.setPosition(new Vec3(0, subY, 0));
    panel.addChild(sub);
    cursor -= SHELL_SUBTITLE_H;

    const sgr = sub.addComponent(Graphics);
    sgr.fillColor = SHELL_SUBTITLE_BG;
    sgr.roundRect(-subW / 2, -SHELL_SUBTITLE_H / 2, subW, SHELL_SUBTITLE_H, SHELL_SUBTITLE_H / 2);
    sgr.fill();
    drawDashedRoundRect(
      sgr,
      -subW / 2, -SHELL_SUBTITLE_H / 2, subW, SHELL_SUBTITLE_H, SHELL_SUBTITLE_H / 2,
      SHELL_SUBTITLE_DASH, SHELL_SUBTITLE_GAP, SHELL_SUBTITLE_BORDER, SHELL_SUBTITLE_BORDER_W,
    );

    const subLabelNode = new Node(SHELL_SUBTITLE_LABEL_NAME);
    subLabelNode.layer = sub.layer;
    subLabelNode.addComponent(UITransform).setContentSize(subW - 24, SHELL_SUBTITLE_H);
    subLabelNode.setPosition(new Vec3(0, -18, 0));
    sub.addChild(subLabelNode);
    subtitleLabel = subLabelNode.addComponent(RichText);
    subtitleLabel.string = `<color=#8B6B4A>${opts.subtitle}</color>`;
    subtitleLabel.fontSize = SHELL_SUBTITLE_FONT;
    subtitleLabel.lineHeight = SHELL_SUBTITLE_H;
    subtitleLabel.horizontalAlign = RichText.HorizontalAlign.CENTER;
    subtitleLabel.maxWidth = subW - 24;
  }

  // 内容区
  cursor -= hasSubtitle ? SHELL_GAP_SUB_BODY : SHELL_GAP_HEADER_BODY;
  const bodyBottom = -ph / 2 + SHELL_PAD_BOTTOM;
  const bodyH = cursor - bodyBottom;
  const bodyY = (cursor + bodyBottom) / 2;
  const body = new Node(SHELL_BODY_NAME);
  body.layer = panel.layer;
  body.addComponent(UITransform).setContentSize(pw - SHELL_PAD_SIDE * 2, bodyH);
  body.setPosition(new Vec3(0, bodyY, 0));
  panel.addChild(body);

  fontManager.applyFontToTree(panel);

  return {
    root,
    panel,
    body,
    titleLabel,
    subtitleLabel,
    close: () => { if (root.isValid) root.destroy(); },
  };
}

/** 虚线圆角矩形描边 */
export function drawDashedRoundRect(
  g: Graphics,
  x: number, y: number, w: number, h: number, r: number,
  dash: number, gap: number, color: Color, lineWidth: number,
): void {
  g.lineWidth = lineWidth;
  g.strokeColor = color;
  const half = lineWidth / 2;
  const cornerR = r - half;

  const edges: Array<[number, number, number, number]> = [
    [x + r, y + h - half, x + w - r, y + h - half],
    [x + w - half, y + h - r, x + w - half, y + r],
    [x + w - r, y + half, x + r, y + half],
    [x + half, y + r, x + half, y + h - r],
  ];
  for (const [x1, y1, x2, y2] of edges) {
    addDashedLinePath(g, x1, y1, x2, y2, dash, gap);
  }

  const corners: Array<[number, number, number, number]> = [
    [x + w - r, y + h - r, Math.PI / 2, 0],
    [x + w - r, y + r, 0, -Math.PI / 2],
    [x + r, y + r, -Math.PI / 2, -Math.PI],
    [x + r, y + h - r, Math.PI, Math.PI / 2],
  ];
  for (const [cx, cy, sa, ea] of corners) {
    addDashedArcPath(g, cx, cy, cornerR, sa, ea, dash, gap);
  }

  g.stroke();
}

function addDashedLinePath(g: Graphics, x1: number, y1: number, x2: number, y2: number, dash: number, gap: number): void {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 0.5) return;
  const ux = dx / len;
  const uy = dy / len;
  let pos = 0;
  while (pos < len) {
    const segEnd = Math.min(pos + dash, len);
    g.moveTo(x1 + ux * pos, y1 + uy * pos);
    g.lineTo(x1 + ux * segEnd, y1 + uy * segEnd);
    pos += dash + gap;
  }
}

function addDashedArcPath(
  g: Graphics, cx: number, cy: number, r: number,
  startAngle: number, endAngle: number, dash: number, gap: number,
): void {
  const arcLen = Math.abs(endAngle - startAngle) * r;
  if (arcLen < 0.5) return;
  let pos = 0;
  while (pos < arcLen) {
    const segEnd = Math.min(pos + dash, arcLen);
    const a0 = startAngle + (endAngle - startAngle) * (pos / arcLen);
    const a1 = startAngle + (endAngle - startAngle) * (segEnd / arcLen);
    g.moveTo(cx + Math.cos(a0) * r, cy + Math.sin(a0) * r);
    const steps = 3;
    for (let s = 1; s <= steps; s++) {
      const a = a0 + (a1 - a0) * (s / steps);
      g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    pos += dash + gap;
  }
}
