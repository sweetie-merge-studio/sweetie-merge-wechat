import {
  _decorator,
  Color,
  Component,
  Graphics,
  Label,
  Node,
  RichText,
  Sprite,
  UITransform,
  Vec3,
} from 'cc';

import { getPrivacyConsent, setPrivacyConsent } from '../platform/wechat';
import { openWebView } from '../platform/webview';
import { createScrollView, DragScrollComponent } from './drag-scroll';
import { TapZoneComponent, pushModalLayer, popModalLayer } from './tap-zone';
import { loadSpriteFrame, applySpriteFrame } from './sprite-loader';
import { fontManager } from '../core/font-manager';
import { getPrivacyDoc, getPrivacySummary } from '../core/privacy-config';

const { ccclass } = _decorator;

/* ═══════════════════════════════════════════════════════════════
 * 隐私协议与用户协议弹窗（精准还原 Web 端 PrivacyConsentModal.vue）
 *
 * 首次启动强制展示，用户同意后才允许初始化数据埋点。
 * 同意状态持久化到 tt storage / localStorage，后续启动不再弹窗。
 *
 * 样式基准：Web 端面板 max-width 400px，本端 720 设计分辨率下面板 620px，
 * 缩放比约 1.55，所有字号/间距按此比例换算并取整，确保视觉一致。
 * ═══════════════════════════════════════════════════════════════ */

const MODAL_NAME = 'Modal_PrivacyConsent';

// ── 面板尺寸（720 宽设计分辨率，缩放比 1.55，内容浓缩不滚动） ──
const PANEL_W = 560;
const PANEL_H = 940;
const PANEL_RADIUS = 28;

// ── 布局常量（紧凑版，间距全面缩小） ──
const HEADER_PAD_TOP = 22;
const HEADER_PAD_BOTTOM = 12;
const ICON_SIZE = 76;
const ICON_MARGIN_BOTTOM = 10;
const TITLE_MARGIN_BOTTOM = 3;
const FONT_TITLE = 32;
const FONT_SUBTITLE = 18;
const HEADER_H = HEADER_PAD_TOP + ICON_SIZE + ICON_MARGIN_BOTTOM + FONT_TITLE + TITLE_MARGIN_BOTTOM + FONT_SUBTITLE + HEADER_PAD_BOTTOM; // = 173

const CONTENT_SIDE_PAD = 32;
const SECTION_MARGIN_BOTTOM = 14;
const SECTION_TITLE_MARGIN_BOTTOM = 10;
const SECTION_TEXT_PADDING_LEFT = 8;
const SECTION_BORDER_W = 4;

const LEAD_PAD_X = 14;
const LEAD_PAD_Y = 10;
const LEAD_RADIUS = 12;

const LIST_PAD_Y = 4;
const LIST_GAP = 10;
const FOOTER_MARGIN_TOP = 6;

const ACTIONS_PAD_TOP = 14;
const ACTIONS_PAD_BOTTOM = 16;
const BTN_GAP = 16;
const BTN_H = 62;
const BTN_RADIUS = 31;
const BTN_W = (PANEL_W - CONTENT_SIDE_PAD * 2 - BTN_GAP) / 2;

const DECLINE_RESERVED_H = 32;

// ── 字号 ──
const FONT_LEAD = 19;
const LINE_H_LEAD = 30;
const FONT_SECTION = 20;
const FONT_LIST = 18;
const LINE_H_LIST = 30;
const FONT_FOOTER = 15;
const FONT_BTN = 22;
const DOT_SIZE = 16;

// ── 拒绝提示 Toast（悬浮居中，不再贴在面板底部） ──
const TOAST_MAX_W = 520;
const TOAST_PAD_X = 28;
const TOAST_PAD_Y = 16;
const TOAST_RADIUS = 16;
const TOAST_FONT = 18;
const TOAST_LINE_H = 28;
const TOAST_BG = new Color(60, 38, 20, 235);    // 深暖棕半透明
const TOAST_TEXT = new Color(255, 245, 230, 255); // 米白
const TOAST_DURATION = 3;                         // 自动消失秒数

// ── 颜色（精准对齐 Web 端 PrivacyConsentModal.vue） ──
const SCRIM_COLOR = new Color(80, 50, 20, 140);       // rgba(80,50,20,0.55)
const PANEL_BG = new Color(245, 237, 216, 255);       // #F5EDD8
const PANEL_BORDER = new Color(196, 168, 122, 255);   // #C4A87A
const TITLE_COLOR = new Color(92, 58, 30, 255);        // #5C3A1E
const SUBTITLE_COLOR = new Color(160, 120, 76, 255);   // #A0784C
const BODY_COLOR = new Color(107, 74, 42, 255);        // #6B4A2A
const LINK_COLOR = new Color(232, 148, 26, 255);       // #E8941A
const SECTION_TITLE_COLOR = new Color(92, 58, 30, 255); // #5C3A1E
const LEAD_BG = new Color(255, 248, 238, 255);         // #FFF8EE
const LEAD_BORDER = new Color(232, 213, 184, 255);     // #E8D5B8
const FOOTER_NOTE_COLOR = new Color(160, 120, 76, 255); // #A0784C

// 列表圆点颜色（替代 Web 端 emoji：🍰🧁🍩 / ❌ / ✅）
const DOT_COLLECT = new Color(232, 148, 26, 255);      // 橙
const DOT_FORBID = new Color(184, 80, 80, 255);         // 红
const DOT_RIGHT = new Color(100, 160, 80, 255);         // 绿

// 按钮
const BTN_PRIMARY = new Color(232, 148, 26, 255);       // #E8941A
const BTN_PRIMARY_TOP = new Color(245, 166, 35, 255);   // #F5A623
const BTN_SECONDARY = new Color(232, 213, 184, 255);    // #E8D5B8
const BTN_SECONDARY_BORDER = new Color(196, 168, 122, 255); // #C4A87A
const BTN_DANGER = new Color(245, 213, 213, 255);       // #F5D5D5
const BTN_DANGER_BORDER = new Color(216, 144, 144, 255); // #D89090
const BTN_DANGER_TEXT = new Color(184, 80, 80, 255);    // #B85050
const BTN_SECONDARY_TEXT = new Color(139, 99, 64, 255);  // #8B6340
const BTN_TEXT_WHITE = new Color(255, 255, 255, 255);

// 详情弹层
const DETAIL_PANEL_BG = new Color(255, 248, 238, 255);  // #FFF8EE
const DETAIL_BORDER = new Color(196, 168, 122, 255);    // #C4A87A
const DETAIL_HEADER_BORDER = new Color(232, 213, 184, 255); // #E8D5B8
const DETAIL_CLOSE_BG = new Color(232, 213, 184, 255);  // #E8D5B8
const DETAIL_CLOSE_BORDER = new Color(196, 168, 122, 255); // #C4A87A
const DETAIL_CLOSE_TEXT = new Color(139, 99, 64, 255);   // #8B6340

// 详情弹层字号（浓缩版）
const FONT_DETAIL_TITLE = 26;
const FONT_DETAIL_H4 = 20;
const FONT_DETAIL_P = 18;
const LINE_H_DETAIL = 30;

export interface PrivacyConsentCallbacks {
  onAgree: () => void;
  onDecline: () => void;
}

@ccclass('PrivacyConsentModal')
export class PrivacyConsentModal extends Component {
  private _declined = false;
  private _declineBtn: Node | null = null;
  private _declineBtnLabel: Label | null = null;
  private _declineHint: Node | null = null;
  private _detailLayer: Node | null = null;
  private _callbacks: PrivacyConsentCallbacks | null = null;

  /**
   * 未同意隐私协议时挂出弹窗。
   * @returns 是否真的弹了
   */
  static showIfNeeded(canvas: Node, callbacks?: PrivacyConsentCallbacks): boolean {
    if (getPrivacyConsent()) return false;
    if (canvas.getChildByName(MODAL_NAME)) return false;

    const root = new Node(MODAL_NAME);
    root.layer = canvas.layer;
    const canvasUi = canvas.getComponent(UITransform);
    const ui = root.addComponent(UITransform);
    if (canvasUi) ui.setContentSize(canvasUi.width, canvasUi.height);
    canvas.addChild(root);

    const modal = root.addComponent(PrivacyConsentModal);
    if (callbacks) modal._callbacks = callbacks;
    return true;
  }

  protected onLoad(): void {
    pushModalLayer(this.node);
    this._buildScrim();
    this._buildPanel();
    fontManager.applyFontToTree(this.node);
  }

  protected onDestroy(): void {
    popModalLayer(this.node);
  }

  // ── 遮罩 ──

  private _buildScrim(): void {
    const ui = this.node.getComponent(UITransform);
    if (!ui) return;
    const g = this.node.addComponent(Graphics);
    g.fillColor = SCRIM_COLOR;
    g.rect(-ui.width / 2, -ui.height / 2, ui.width, ui.height);
    g.fill();
  }

  // ── 主面板 ──

  private _buildPanel(): void {
    // 阴影
    const shadow = new Node('panelShadow');
    shadow.layer = this.node.layer;
    shadow.addComponent(UITransform).setContentSize(PANEL_W, PANEL_H);
    shadow.setPosition(new Vec3(3, -5, 0));
    this.node.addChild(shadow);
    const sg = shadow.addComponent(Graphics);
    sg.fillColor = new Color(80, 50, 20, 70);
    sg.roundRect(-PANEL_W / 2, -PANEL_H / 2, PANEL_W, PANEL_H, PANEL_RADIUS);
    sg.fill();

    // 面板
    const panel = new Node('panel');
    panel.layer = this.node.layer;
    panel.addComponent(UITransform).setContentSize(PANEL_W, PANEL_H);
    this.node.addChild(panel);
    const pg = panel.addComponent(Graphics);
    pg.fillColor = PANEL_BG;
    pg.roundRect(-PANEL_W / 2, -PANEL_H / 2, PANEL_W, PANEL_H, PANEL_RADIUS);
    pg.fill();
    pg.lineWidth = 3;
    pg.strokeColor = PANEL_BORDER;
    pg.roundRect(-PANEL_W / 2, -PANEL_H / 2, PANEL_W, PANEL_H, PANEL_RADIUS);
    pg.stroke();

    this._buildHeader(panel);
    // 内容区构建失败不应阻塞按钮渲染——否则用户既看不到内容也无法同意/拒绝，弹窗完全卡死
    try {
      this._buildContent(panel);
    } catch (err) {
      console.error('[PrivacyConsentModal] 内容区构建失败，降级为仅显示按钮:', err);
    }
    this._buildActions(panel);
    // Toast 挂在根节点上（panel 之后添加 → 渲染在上层），悬浮居中、脱离面板
    this._buildDeclineHint();
  }

  // ── 标题区（对齐 Web 端 .header：padding 20px 20px 12px，text-align center） ──

  private _buildHeader(panel: Node): void {
    const panelTop = PANEL_H / 2;

    // 图标圆形背景（Web .title-icon-wrap：56px 圆形，渐变背景，2px 边框，box-shadow）
    const iconY = panelTop - HEADER_PAD_TOP - ICON_SIZE / 2;
    const iconBg = new Node('titleIconBg');
    iconBg.layer = panel.layer;
    iconBg.addComponent(UITransform).setContentSize(ICON_SIZE, ICON_SIZE);
    iconBg.setPosition(new Vec3(0, iconY, 0));
    panel.addChild(iconBg);
    const ig = iconBg.addComponent(Graphics);
    // 阴影（Web box-shadow: 0 4px 12px rgba(200,150,80,0.3)）
    ig.fillColor = new Color(200, 150, 80, 50);
    ig.circle(0, -3, ICON_SIZE / 2 + 2);
    ig.fill();
    // 主底色 #F5DEB3
    ig.fillColor = new Color(245, 222, 179, 255);
    ig.circle(0, 0, ICON_SIZE / 2);
    ig.fill();
    // 顶部高光（模拟 linear-gradient(135deg, #FFE4B5, #F5DEB3)）
    ig.fillColor = new Color(255, 228, 181, 140);
    ig.circle(0, 8, ICON_SIZE / 2 - 3);
    ig.fill();
    // 边框 2px #C4A87A
    ig.lineWidth = 2;
    ig.strokeColor = PANEL_BORDER;
    ig.circle(0, 0, ICON_SIZE / 2);
    ig.stroke();

    // 面包图片（Web 端 🍪 emoji，font-size 30px / 容器 56px ≈ 54% 占比）
    const breadSize = Math.round(ICON_SIZE * 0.58);
    const iconSpriteNode = new Node('titleIcon');
    iconSpriteNode.layer = iconBg.layer;
    iconSpriteNode.addComponent(UITransform).setContentSize(breadSize, breadSize);
    iconBg.addChild(iconSpriteNode);
    const iconSprite = iconSpriteNode.addComponent(Sprite);
    iconSprite.sizeMode = Sprite.SizeMode.CUSTOM;
    loadSpriteFrame('sprites/mothers/mother_bread', sf => {
      if (sf && iconSprite.isValid) applySpriteFrame(iconSprite, sf);
    });

    // 标题（Web .title：ZCOOL KuaiLe, font-weight 800, 22px, #5C3A1E, margin-bottom 4px）
    const iconBottom = iconY - ICON_SIZE / 2;
    const titleY = iconBottom - ICON_MARGIN_BOTTOM - FONT_TITLE / 2;
    const titleNode = new Node('title');
    titleNode.layer = panel.layer;
    titleNode.addComponent(UITransform).setContentSize(PANEL_W - 48, FONT_TITLE + 6);
    titleNode.setPosition(new Vec3(0, titleY, 0));
    panel.addChild(titleNode);
    const titleLabel = titleNode.addComponent(Label);
    titleLabel.string = '隐私协议与用户协议';
    titleLabel.fontSize = FONT_TITLE;
    titleLabel.isBold = true;
    titleLabel.color = TITLE_COLOR;
    titleLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
    titleLabel.verticalAlign = Label.VerticalAlign.CENTER;
    fontManager.applyFont(titleLabel);

    // 副标题（Web .subtitle：13px, #A0784C）
    const titleBottom = titleY - FONT_TITLE / 2;
    const subY = titleBottom - TITLE_MARGIN_BOTTOM - FONT_SUBTITLE / 2;
    const subNode = new Node('subtitle');
    subNode.layer = panel.layer;
    subNode.addComponent(UITransform).setContentSize(PANEL_W - 48, FONT_SUBTITLE + 4);
    subNode.setPosition(new Vec3(0, subY, 0));
    panel.addChild(subNode);
    const subLabel = subNode.addComponent(Label);
    subLabel.string = '欢迎来到甜心合成乐园！';
    subLabel.fontSize = FONT_SUBTITLE;
    subLabel.color = SUBTITLE_COLOR;
    subLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
    subLabel.verticalAlign = Label.VerticalAlign.CENTER;
  }

  // ── 可滚动内容区 ──

  private _buildContent(panel: Node): void {
    // 布局：header(219) → content → actions(118) → decline预留(50)
    const headerBottom = PANEL_H / 2 - HEADER_H;
    const actionsHeight = ACTIONS_PAD_TOP + BTN_H + ACTIONS_PAD_BOTTOM;
    const actionsBottom = -PANEL_H / 2 + DECLINE_RESERVED_H;
    const actionsTop = actionsBottom + actionsHeight;
    const contentTop = headerBottom;
    const contentBottom = actionsTop;
    const contentH = contentTop - contentBottom;
    const contentY = (contentTop + contentBottom) / 2;
    const contentW = PANEL_W - CONTENT_SIDE_PAD * 2;

    const scroll = createScrollView(panel, contentW, contentH);
    scroll.view.setPosition(new Vec3(0, contentY, 0));

    const content = scroll.content;
    // content 锚点在中心，顶部 y = contentH/2；内容从顶部开始往下排列
    let currentTop = contentH / 2;

    // ── 引导语（Web .lead + .link） ──
    const leadH = this._buildLeadSection(content, currentTop, contentW);
    currentTop -= leadH + SECTION_MARGIN_BOTTOM;

    // 简版摘要内容从配置服务获取（后端可覆盖，默认本地值），避免硬编码与完整文档不一致
    const summary = getPrivacySummary();

    // ── 我们收集的信息（Web .section-title + .list） ──
    currentTop -= this._buildSection(
      content, currentTop, contentW,
      '我们收集的信息',
      summary.collectItems,
      DOT_COLLECT,
    );
    currentTop -= SECTION_MARGIN_BOTTOM;

    // ── 我们不会 ──
    currentTop -= this._buildSection(
      content, currentTop, contentW,
      '我们不会',
      summary.forbidItems,
      DOT_FORBID,
    );
    currentTop -= SECTION_MARGIN_BOTTOM;

    // ── 您的权利 ──
    currentTop -= this._buildSection(
      content, currentTop, contentW,
      '您的权利',
      summary.rightItems,
      DOT_RIGHT,
    );
    currentTop -= FOOTER_MARGIN_TOP;

    // ── 底部提示（Web .footer-note：11.5px, #A0784C, 居中, margin 8px 0 4px） ──
    const footerH = Math.round(FONT_FOOTER * 1.6);
    const footerNode = new Node('footerNote');
    footerNode.layer = content.layer;
    footerNode.addComponent(UITransform).setContentSize(contentW - 16, footerH);
    footerNode.setPosition(new Vec3(0, currentTop - footerH / 2, 0));
    content.addChild(footerNode);
    const footerLabel = footerNode.addComponent(Label);
    footerLabel.string = '点击「同意并继续」即表示您已阅读并同意上述全部条款。';
    footerLabel.fontSize = FONT_FOOTER;
    footerLabel.color = FOOTER_NOTE_COLOR;
    footerLabel.lineHeight = FONT_FOOTER * 1.5;
    footerLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
    footerLabel.verticalAlign = Label.VerticalAlign.CENTER;
    footerLabel.enableWrapText = true;
    currentTop -= footerH;

    // 总内容高度：从 content 顶部(contentH/2) 到内容底部(currentTop) 的距离
    const totalContentH = contentH / 2 - currentTop;
    const finalH = Math.max(totalContentH, contentH);
    scroll.setContentHeight(finalH);
    // content 高度从 contentH 变为 finalH 后，锚点在中心，顶部上移了 (finalH-contentH)/2，
    // 子节点需要同步上移同样距离，才能保持相对于 content 顶部的位置不变
    if (finalH > contentH) {
      const shift = (finalH - contentH) / 2;
      for (const child of content.children) {
        const p = child.position;
        child.setPosition(new Vec3(p.x, p.y + shift, p.z));
      }
    }
  }

  /**
   * 构建引导语区块（含可点击的《隐私政策》《用户协议》链接）。
   * 对齐 Web .lead：13px, #6B4A2A, line-height 1.7, #FFF8EE 背景, 1px #E8D5B8 边框, 10px 圆角, padding 10px 12px。
   * 链接对齐 Web .link：#E8941A, 600, underline。
   * 返回区块高度。
   */
  private _buildLeadSection(content: Node, topY: number, contentW: number): number {
    const padX = LEAD_PAD_X;
    const padY = LEAD_PAD_Y;
    const innerW = contentW - padX * 2;
    // 三行文字
    const totalH = padY * 2 + LINE_H_LEAD * 3;

    // 背景
    const bg = new Node('leadBg');
    bg.layer = content.layer;
    bg.addComponent(UITransform).setContentSize(contentW, totalH);
    bg.setPosition(new Vec3(0, topY - totalH / 2, 0));
    content.addChild(bg);
    const bgG = bg.addComponent(Graphics);
    bgG.fillColor = LEAD_BG;
    bgG.roundRect(-contentW / 2, -totalH / 2, contentW, totalH, LEAD_RADIUS);
    bgG.fill();
    bgG.lineWidth = 1.5;
    bgG.strokeColor = LEAD_BORDER;
    bgG.roundRect(-contentW / 2, -totalH / 2, contentW, totalH, LEAD_RADIUS);
    bgG.stroke();

    const leftX = -innerW / 2;
    const line1Y = totalH / 2 - padY - LINE_H_LEAD / 2;
    const line2Y = line1Y - LINE_H_LEAD;
    const line3Y = line2Y - LINE_H_LEAD;

    // 第一行："在开始游戏前，请仔细阅读并同意我们的"
    const line1Node = new Node('leadLine1');
    line1Node.layer = bg.layer;
    line1Node.addComponent(UITransform).setContentSize(innerW, LINE_H_LEAD);
    line1Node.setPosition(new Vec3(0, line1Y, 0));
    bg.addChild(line1Node);
    const line1Label = line1Node.addComponent(Label);
    line1Label.string = '在开始游戏前，请仔细阅读并同意我们的';
    line1Label.fontSize = FONT_LEAD;
    line1Label.color = BODY_COLOR;
    line1Label.lineHeight = LINE_H_LEAD;
    line1Label.horizontalAlign = Label.HorizontalAlign.LEFT;
    line1Label.verticalAlign = Label.VerticalAlign.CENTER;

    // 第二行：《隐私政策》(链接) + "、" + 《服务条款》(链接) + "和" + 《用户协议》(链接) + "。"
    // 计算各段宽度，左对齐排列
    const link1Text = '《隐私政策》';
    const link2Text = '《服务条款》';
    const link3Text = '《用户协议》';
    const sep1Text = '、';
    const sep2Text = '和';
    const dotText = '。';

    // 各段宽度 = 字符数 × 字号(CJK 等宽),不留 padding,避免段间出现异常空隙
    const link1W = link1Text.length * FONT_LEAD;
    const link2W = link2Text.length * FONT_LEAD;
    const link3W = link3Text.length * FONT_LEAD;
    const sep1W = sep1Text.length * FONT_LEAD;
    const sep2W = sep2Text.length * FONT_LEAD;
    const dotW = dotText.length * FONT_LEAD;

    let curX = leftX;

    // 链接1：《隐私政策》
    this._buildLinkLabel(bg, link1Text, new Vec3(curX + link1W / 2, line2Y, 0), link1W, () => this._showDetail('privacy'));
    curX += link1W;

    // "、"
    this._buildLeadSep(bg, sep1Text, sep1W, curX, line2Y);
    curX += sep1W;

    // 链接2：《服务条款》
    this._buildLinkLabel(bg, link2Text, new Vec3(curX + link2W / 2, line2Y, 0), link2W, () => this._showDetail('service'));
    curX += link2W;

    // "和"
    this._buildLeadSep(bg, sep2Text, sep2W, curX, line2Y);
    curX += sep2W;

    // 链接3：《用户协议》
    this._buildLinkLabel(bg, link3Text, new Vec3(curX + link3W / 2, line2Y, 0), link3W, () => this._showDetail('terms'));
    curX += link3W;

    // "。"
    this._buildLeadSep(bg, dotText, dotW, curX, line2Y);

    // 第三行："我们承诺保护您的个人信息安全。"
    const line3Node = new Node('leadLine3');
    line3Node.layer = bg.layer;
    line3Node.addComponent(UITransform).setContentSize(innerW, LINE_H_LEAD);
    line3Node.setPosition(new Vec3(0, line3Y, 0));
    bg.addChild(line3Node);
    const line3Label = line3Node.addComponent(Label);
    line3Label.string = '我们承诺保护您的个人信息安全。';
    line3Label.fontSize = FONT_LEAD;
    line3Label.color = BODY_COLOR;
    line3Label.lineHeight = LINE_H_LEAD;
    line3Label.horizontalAlign = Label.HorizontalAlign.LEFT;
    line3Label.verticalAlign = Label.VerticalAlign.CENTER;

    return totalH;
  }

  /** 构建引导语里的普通分隔符/句号文字节点（左对齐，与链接同基线） */
  private _buildLeadSep(parent: Node, text: string, width: number, leftX: number, y: number): void {
    const node = new Node('leadSep');
    node.layer = parent.layer;
    node.addComponent(UITransform).setContentSize(width, LINE_H_LEAD);
    node.setPosition(new Vec3(leftX + width / 2, y, 0));
    parent.addChild(node);
    const label = node.addComponent(Label);
    label.string = text;
    label.fontSize = FONT_LEAD;
    label.color = BODY_COLOR;
    label.horizontalAlign = Label.HorizontalAlign.LEFT;
    label.verticalAlign = Label.VerticalAlign.CENTER;
  }

  /** 构建一个可点击的链接文字节点（Web .link：#E8941A, 600, underline） */
  private _buildLinkLabel(parent: Node, text: string, pos: Vec3, width: number, onClick: () => void): Node {
    const node = new Node('link');
    node.layer = parent.layer;
    node.addComponent(UITransform).setContentSize(width, LINE_H_LEAD);
    node.setPosition(pos);
    parent.addChild(node);
    const label = node.addComponent(Label);
    label.string = text;
    label.fontSize = FONT_LEAD;
    label.isBold = true;
    label.color = LINK_COLOR;
    label.horizontalAlign = Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    // Cocos Label 无 underline 属性，用 Graphics 画一条下划线模拟
    const textW = text.length * FONT_LEAD;
    const underlineNode = new Node('underline');
    underlineNode.layer = node.layer;
    underlineNode.addComponent(UITransform).setContentSize(textW, 2);
    underlineNode.setPosition(new Vec3(0, -LINE_H_LEAD / 2 + 4, 0));
    node.addChild(underlineNode);
    const ug = underlineNode.addComponent(Graphics);
    ug.fillColor = LINK_COLOR;
    ug.rect(-textW / 2, -1, textW, 2);
    ug.fill();

    node.addComponent(TapZoneComponent).onTap = onClick;
    return node;
  }

  /**
   * 构建一个带标题和列表的 section。
   * 对齐 Web .section-title：14px, 700, #5C3A1E, padding-left 8px, border-left 3px solid #E8941A。
   * 对齐 Web .list li：12.5px, #6B4A2A, line-height 1.6, padding 4px 0。
   * 返回 section 高度。
   */
  private _buildSection(
    content: Node,
    topY: number,
    contentW: number,
    title: string,
    items: readonly string[],
    dotColor: Color,
  ): number {
    // 防御：items 非数组时降级为空列表，避免 forEach 抛异常中断整个弹窗渲染
    const safeItems = Array.isArray(items) ? items : [];
    const titleH = FONT_SECTION + 6;
    const itemH = LINE_H_LIST + LIST_PAD_Y * 2;  // Web padding: 4px 0 → 上下各 6px
    const totalH = titleH + SECTION_TITLE_MARGIN_BOTTOM + safeItems.length * itemH;

    // 标题（无左侧装饰竖线）
    const titleNode = new Node('sectionTitle');
    titleNode.layer = content.layer;
    titleNode.addComponent(UITransform).setContentSize(contentW, titleH);
    titleNode.setPosition(new Vec3(0, topY - titleH / 2, 0));
    content.addChild(titleNode);

    // 标题文字（左对齐，左边距 8px）
    const textLeft = SECTION_TEXT_PADDING_LEFT;
    const titleLabelNode = new Node('titleText');
    titleLabelNode.layer = titleNode.layer;
    titleLabelNode.addComponent(UITransform).setContentSize(contentW - textLeft - 8, titleH);
    titleLabelNode.setPosition(new Vec3(-contentW / 2 + textLeft + (contentW - textLeft - 8) / 2, 0, 0));
    titleNode.addChild(titleLabelNode);
    const titleLabel = titleLabelNode.addComponent(Label);
    titleLabel.string = title;
    titleLabel.fontSize = FONT_SECTION;
    titleLabel.isBold = true;
    titleLabel.color = SECTION_TITLE_COLOR;
    titleLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
    titleLabel.verticalAlign = Label.VerticalAlign.CENTER;

    // 列表项
    safeItems.forEach((item, i) => {
      const itemY = topY - titleH - SECTION_TITLE_MARGIN_BOTTOM - i * itemH - itemH / 2;
      const itemNode = new Node(`item${i}`);
      itemNode.layer = content.layer;
      itemNode.addComponent(UITransform).setContentSize(contentW, itemH);
      itemNode.setPosition(new Vec3(0, itemY, 0));
      content.addChild(itemNode);

      // 文字（无圆点，左对齐，左边距 8px）
      const textStart = SECTION_TEXT_PADDING_LEFT;
      const textW = contentW - textStart - 8;
      const textNode = new Node('text');
      textNode.layer = itemNode.layer;
      textNode.addComponent(UITransform).setContentSize(textW, itemH);
      textNode.setPosition(new Vec3(-contentW / 2 + textStart + textW / 2, 0, 0));
      itemNode.addChild(textNode);
      const textLabel = textNode.addComponent(Label);
      textLabel.string = item;
      textLabel.fontSize = FONT_LIST;
      textLabel.color = BODY_COLOR;
      textLabel.lineHeight = LINE_H_LIST;
      textLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
      textLabel.verticalAlign = Label.VerticalAlign.CENTER;
    });

    return totalH;
  }

  // ── 底部按钮区（Web .actions + .btn） ──

  private _buildActions(panel: Node): void {
    // 按钮在 actions 区域内垂直居中：actions 底部预留 decline 空间，padding-bottom 26px
    const btnY = -PANEL_H / 2 + DECLINE_RESERVED_H + ACTIONS_PAD_BOTTOM + BTN_H / 2;
    const btnX = (BTN_W + BTN_GAP) / 2;

    // 不同意 / 退出游戏 按钮（Web .btn-secondary）
    this._declineBtn = this._buildButton(
      panel,
      new Vec3(-btnX, btnY, 0),
      '不同意',
      BTN_SECONDARY,
      BTN_SECONDARY_TEXT,
      BTN_SECONDARY_BORDER,
      false,
      () => this._onDecline(),
    );
    this._declineBtnLabel = this._declineBtn.getChildByName('label')?.getComponent(Label) ?? null;

    // 同意并继续 按钮（Web .btn-primary：渐变 #F5A623→#E8941A，白色文字，阴影）
    const agreeBtn = this._buildButton(
      panel,
      new Vec3(btnX, btnY, 0),
      '同意并继续',
      BTN_PRIMARY,
      BTN_TEXT_WHITE,
      null,
      true,
      () => this._onAgree(),
    );
  }

  /**
   * 构建一个圆角按钮（带底部阴影、顶部高光、边框）。
   * 对齐 Web .btn：height 44px, border-radius 22px, font-size 15px, 700。
   * @param isPrimary 是否主按钮（主按钮有渐变+阴影，次按钮有边框）
   */
  private _buildButton(
    parent: Node,
    pos: Vec3,
    text: string,
    bg: Color,
    textColor: Color,
    border: Color | null,
    isPrimary: boolean,
    onTap: () => void,
  ): Node {
    const btn = new Node('button');
    btn.layer = parent.layer;
    btn.addComponent(UITransform).setContentSize(BTN_W, BTN_H);
    btn.setPosition(pos);
    parent.addChild(btn);

    const g = btn.addComponent(Graphics);
    this._paintButtonGraphics(g, bg, border, isPrimary);

    // 文字
    const labelNode = new Node('label');
    labelNode.layer = btn.layer;
    labelNode.addComponent(UITransform).setContentSize(BTN_W - 16, BTN_H);
    btn.addChild(labelNode);
    const label = labelNode.addComponent(Label);
    label.string = text;
    label.fontSize = FONT_BTN;
    label.isBold = true;
    label.color = textColor;
    label.horizontalAlign = Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER;

    btn.addComponent(TapZoneComponent).onTap = onTap;
    return btn;
  }

  /**
   * 按钮 Graphics 绘制（阴影 + 底色 + 顶部高光 + 边框）。
   * 提取自 _buildButton 与 _paintDeclineButtonDanger 的重复逻辑。
   */
  private _paintButtonGraphics(g: Graphics, bg: Color, border: Color | null, isPrimary: boolean): void {
    const r = BTN_H / 2;

    // 底部阴影（主按钮有 box-shadow: 0 4px 12px rgba(232,148,26,0.4)）
    g.fillColor = isPrimary
      ? new Color(232, 148, 26, 60)
      : new Color(0, 0, 0, 25);
    g.roundRect(-BTN_W / 2, -BTN_H / 2 - (isPrimary ? 3 : 2), BTN_W, BTN_H, r);
    g.fill();

    // 主底色
    g.fillColor = bg;
    g.roundRect(-BTN_W / 2, -BTN_H / 2, BTN_W, BTN_H, r);
    g.fill();

    // 顶部高光（主按钮渐变效果：顶部 #F5A623 更亮）
    g.fillColor = isPrimary ? BTN_PRIMARY_TOP : new Color(255, 255, 255, 20);
    g.roundRect(-BTN_W / 2 + 2, 0, BTN_W - 4, BTN_H / 2 - 2, r / 2);
    g.fill();

    // 边框（次按钮 border: 2px solid #C4A87A）
    if (border) {
      g.lineWidth = 2;
      g.strokeColor = border;
      g.roundRect(-BTN_W / 2, -BTN_H / 2, BTN_W, BTN_H, r);
      g.stroke();
    }
  }

  /** 重绘拒绝按钮为"退出游戏"危险态（Web .btn-danger：#F5D5D5, #B85050, border #D89090） */
  private _paintDeclineButtonDanger(): void {
    if (!this._declineBtn) return;
    const g = this._declineBtn.getComponent(Graphics);
    if (!g) return;
    g.clear();
    // 危险态按钮 = 次按钮样式（非主按钮）+ 危险色底色/边框
    this._paintButtonGraphics(g, BTN_DANGER, BTN_DANGER_BORDER, false);

    if (this._declineBtnLabel) {
      this._declineBtnLabel.string = '退出游戏';
      this._declineBtnLabel.color = BTN_DANGER_TEXT;
    }
  }

  // ── 拒绝提示 Toast（悬浮居中，带深色圆角背景，脱离面板独立显示） ──

  private _buildDeclineHint(): void {
    const text = '很抱歉，不同意隐私协议将无法进入游戏。您可以重新阅读后选择同意。';
    const toastW = TOAST_MAX_W;
    const maxTextW = toastW - TOAST_PAD_X * 2;
    // 固定两行高度（RESIZE_HEIGHT 自适应文字，背景用预估值兜底）
    const toastH = TOAST_LINE_H * 2 + TOAST_PAD_Y * 2;

    const toast = new Node('declineToast');
    toast.layer = this.node.layer;
    toast.addComponent(UITransform).setContentSize(toastW, toastH);
    toast.setPosition(new Vec3(0, 0, 0));
    toast.active = false;
    this.node.addChild(toast);

    // 背景
    const bg = toast.addComponent(Graphics);
    bg.fillColor = TOAST_BG;
    bg.roundRect(-toastW / 2, -toastH / 2, toastW, toastH, TOAST_RADIUS);
    bg.fill();

    // 文字（overflow=RESIZE_HEIGHT 确保 enableWrapText 换行生效）
    const labelNode = new Node('label');
    labelNode.layer = toast.layer;
    labelNode.addComponent(UITransform).setContentSize(maxTextW, toastH);
    labelNode.setPosition(new Vec3(0, 0, 0));
    toast.addChild(labelNode);
    const label = labelNode.addComponent(Label);
    label.fontSize = TOAST_FONT;
    label.color = TOAST_TEXT;
    label.lineHeight = TOAST_LINE_H;
    label.horizontalAlign = Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    label.enableWrapText = true;
    label.overflow = Label.Overflow.RESIZE_HEIGHT;
    label.string = text;

    this._declineHint = toast;
  }

  // ── 协议详情弹层（Web .detail-overlay + .detail-panel） ──

  private _showDetail(type: 'privacy' | 'terms' | 'service'): void {
    // 优先用 WebView 打开配置的网页 URL（排版更灵活，可远程更新）
    const doc = getPrivacyDoc(type);
    if (doc.url && openWebView(doc.url)) {
      return;
    }
    // WebView 不可用或未配置 URL，降级到 Cocos 原生详情弹窗

    if (this._detailLayer && this._detailLayer.isValid) {
      popModalLayer(this._detailLayer);
      this._detailLayer.destroy();
    }

    const detailW = 500;
    const detailH = 820;

    const layer = new Node('detailLayer');
    layer.layer = this.node.layer;
    const rootUi = this.node.getComponent(UITransform);
    layer.addComponent(UITransform).setContentSize(rootUi?.width ?? 720, rootUi?.height ?? 1280);
    this.node.addChild(layer);
    // 压入独立模态层：隔离底层隐私弹窗的滚动区/TapZone，避免触摸事件被抢走
    pushModalLayer(layer);

    // 统一关闭：先弹模态栈再销毁
    const closeDetail = (): void => {
      if (layer.isValid) {
        popModalLayer(layer);
        layer.destroy();
      }
    };

    // 遮罩（点击关闭）
    const scrim = layer.addComponent(Graphics);
    scrim.fillColor = new Color(80, 50, 20, 150);
    const lw = rootUi?.width ?? 720;
    const lh = rootUi?.height ?? 1280;
    scrim.rect(-lw / 2, -lh / 2, lw, lh);
    scrim.fill();
    layer.addComponent(TapZoneComponent).onTap = closeDetail;

    // 面板（Web .detail-panel：#FFF8EE, 3px #C4A87A, border-radius 20px）
    const panel = new Node('detailPanel');
    panel.layer = layer.layer;
    panel.addComponent(UITransform).setContentSize(detailW, detailH);
    layer.addChild(panel);
    const pg = panel.addComponent(Graphics);
    pg.fillColor = DETAIL_PANEL_BG;
    pg.roundRect(-detailW / 2, -detailH / 2, detailW, detailH, 20);
    pg.fill();
    pg.lineWidth = 3;
    pg.strokeColor = DETAIL_BORDER;
    pg.roundRect(-detailW / 2, -detailH / 2, detailW, detailH, 20);
    pg.stroke();

    // 头部（Web .detail-header：padding 14px 18px, border-bottom 2px #E8D5B8）
    const headerH = 46;
    const headerNode = new Node('detailHeader');
    headerNode.layer = panel.layer;
    headerNode.addComponent(UITransform).setContentSize(detailW, headerH);
    headerNode.setPosition(new Vec3(0, detailH / 2 - headerH / 2, 0));
    panel.addChild(headerNode);
    const hg = headerNode.addComponent(Graphics);
    hg.lineWidth = 2;
    hg.strokeColor = DETAIL_HEADER_BORDER;
    hg.moveTo(-detailW / 2 + 18, -headerH / 2);
    hg.lineTo(detailW / 2 - 18, -headerH / 2);
    hg.stroke();

    // 标题（Web .detail-title：ZCOOL KuaiLe, 18px, #5C3A1E），文本从配置服务获取
    const titleNode = new Node('detailTitle');
    titleNode.layer = headerNode.layer;
    titleNode.addComponent(UITransform).setContentSize(detailW - 80, headerH);
    titleNode.setPosition(new Vec3(-20, 0, 0));
    headerNode.addChild(titleNode);
    const titleLabel = titleNode.addComponent(Label);
    titleLabel.string = doc.title;
    titleLabel.fontSize = FONT_DETAIL_TITLE;
    titleLabel.isBold = true;
    titleLabel.color = TITLE_COLOR;
    titleLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
    titleLabel.verticalAlign = Label.VerticalAlign.CENTER;
    fontManager.applyFont(titleLabel);

    // 关闭按钮（Web .detail-close：圆形, #E8D5B8, border #C4A87A, #8B6340）
    const closeSize = 34;
    const closeBtn = new Node('detailClose');
    closeBtn.layer = headerNode.layer;
    closeBtn.addComponent(UITransform).setContentSize(closeSize, closeSize);
    closeBtn.setPosition(new Vec3(detailW / 2 - 28, 0, 0));
    headerNode.addChild(closeBtn);
    const cg = closeBtn.addComponent(Graphics);
    cg.fillColor = DETAIL_CLOSE_BG;
    cg.circle(0, 0, closeSize / 2);
    cg.fill();
    cg.lineWidth = 2;
    cg.strokeColor = DETAIL_CLOSE_BORDER;
    cg.circle(0, 0, closeSize / 2);
    cg.stroke();
    // Label 放在子节点上，避免与同节点 Graphics 渲染顺序冲突
    const closeLabelNode = new Node('label');
    closeLabelNode.layer = closeBtn.layer;
    closeLabelNode.addComponent(UITransform);
    closeBtn.addChild(closeLabelNode);
    const closeLabel = closeLabelNode.addComponent(Label);
    closeLabel.string = '✕';
    closeLabel.fontSize = 20;
    closeLabel.isBold = true;
    closeLabel.color = DETAIL_CLOSE_TEXT;
    closeLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
    closeLabel.verticalAlign = Label.VerticalAlign.CENTER;
    closeBtn.addComponent(TapZoneComponent).onTap = closeDetail;

    // 内容区：scroll view + RichText
    const contentTop = detailH / 2 - headerH - 12;
    const contentBottom = -detailH / 2 + 16;
    const contentH = contentTop - contentBottom;
    const contentY = (contentTop + contentBottom) / 2;
    const innerW = detailW - 48; // 左右各 24px 边距

    // 估算 RichText 内容高度（基于字符数，立即可用，不依赖异步排版）
    const estimateRtHeight = (html: string): number => {
      const breaks = (html.match(/<br\s*\/?>/gi) || []).length;
      const text = html.replace(/<[^>]+>/g, '');
      let totalW = 0;
      for (const ch of text) {
        if (/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(ch)) totalW += FONT_DETAIL_P;
        else if (ch !== '\n' && ch !== '\r') totalW += FONT_DETAIL_P * 0.55;
      }
      const lines = Math.max(1, Math.ceil(totalW / innerW)) + breaks;
      return lines * LINE_H_DETAIL;
    };
    const estimatedH = estimateRtHeight(doc.content);
    const initialTotalH = Math.max(estimatedH + 24, contentH);

    const scroll = createScrollView(panel, innerW, contentH);
    scroll.view.setPosition(new Vec3(0, contentY, 0));
    // 立即设置估算高度，确保滚动区从第一帧起就有 maxOff>0，能接收触摸事件
    // （如果等异步轮询，期间 maxOff=0，hitTest=false，事件被遮罩 TapZone 拦截导致无法滚动）
    scroll.setContentHeight(initialTotalH);
    // 提升详情弹层滚动区优先级（+60），确保优先于主弹窗滚动区和遮罩 TapZone 接收触摸事件
    const dragComp = scroll.view.getComponent(DragScrollComponent);
    if (dragComp) {
      dragComp.priorityBoost = 60;
      dragComp.enabled = false;
      dragComp.enabled = true; // 重新触发 onEnable，用新优先级重新注册
    }

    // RichText 节点（放在 scroll content 顶部，从顶部开始排列）
    const rtNode = new Node('detailRichText');
    rtNode.layer = scroll.content.layer;
    const rtUit = rtNode.addComponent(UITransform);
    // 顶部锚点：RichText 撑高后顶边固定不动，文字始终从 content 顶部开始（中心锚点会把整段文字抬高出可视区，导致顶部被裁）
    rtUit.setAnchorPoint(0.5, 1);
    rtUit.setContentSize(innerW, 100);
    rtNode.setPosition(new Vec3(0, initialTotalH / 2 - 12, 0));
    scroll.content.addChild(rtNode);
    const rt = rtNode.addComponent(RichText);
    // 布局属性必须在 string 之前设置，否则首次布局用默认 maxWidth(0) 不换行，
    // 后续设 maxWidth 后要等多帧 lateUpdate 才重新排版，一帧内取到的高度不准。
    rt.fontSize = FONT_DETAIL_P;
    rt.lineHeight = LINE_H_DETAIL;
    rt.maxWidth = innerW;
    rt.horizontalAlign = RichText.HorizontalAlign.LEFT;
    rt.string = doc.content;

    // 轮询获取 RichText 实际渲染高度（最多 30 帧），如果实际高度大于估算值则更新，确保长文档不被截断
    let lastH = 0;
    let stableFrames = 0;
    let tried = 0;
    const check = (): void => {
      if (!rtNode.isValid) return;
      tried++;
      const h = rtNode.getComponent(UITransform)?.height ?? 0;
      if (h > 100 && h === lastH) {
        stableFrames++;
      } else {
        stableFrames = 0;
        lastH = h;
      }
      // 高度连续 3 帧不变（且>100，排除初始值），或已尝试 30 帧，就定稿
      if ((stableFrames >= 3 && h > 100) || tried >= 30) {
        if (h > 100 && h + 24 > initialTotalH) {
          // 实际高度大于估算值，更新 content 并保持在顶部
          const totalH = h + 24;
          scroll.setContentHeight(totalH);
          rtNode.setPosition(new Vec3(0, totalH / 2 - 12, 0));
          scroll.scrollToTop();
        }
        return;
      }
      this.scheduleOnce(check, 0);
    };
    this.scheduleOnce(check, 0);

    this._detailLayer = layer;
  }

  // ── 交互 ──

  private _onAgree(): void {
    setPrivacyConsent(true);
    this._callbacks?.onAgree();
    if (this.node.isValid) this.node.destroy();
  }

  private _onDecline(): void {
    if (!this._declined) {
      // 第一次点击"不同意"：显示 toast，按钮变为"退出游戏"
      this._declined = true;
      this._paintDeclineButtonDanger();
      if (this._declineHint) {
        this._declineHint.active = true;
        this.scheduleOnce(() => {
          if (this._declineHint && this._declineHint.isValid) {
            this._declineHint.active = false;
          }
        }, TOAST_DURATION);
      }
    } else {
      // 第二次点击"退出游戏"：触发 decline
      setPrivacyConsent(false);
      this._callbacks?.onDecline();
      if (this.node.isValid) this.node.destroy();
    }
  }
}
