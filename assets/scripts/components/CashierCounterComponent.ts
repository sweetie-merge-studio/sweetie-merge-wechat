import { _decorator, Color, Component, Graphics, Label, Node, Sprite, UITransform, Vec3 } from 'cc';

import { getLevelDef, getLevelExpInfo, getPendingLevelUpCost } from '../core/level';
import { GameManager } from '../manager/GameManager';
import { hasOpenBundlePage, openBundlePage, showPageToast } from './bundle-pages';
import { LevelModal } from './LevelModal';
import { TapZoneComponent } from './tap-zone';
import { createSpriteNode } from './ui-factory';
import { loadSpriteFrame } from './sprite-loader';
import { playSfx } from '../manager/AudioManager';
import { fontManager } from '../core/font-manager';

const { ccclass } = _decorator;

/* ═══ 尺寸（对齐抖音端 CashierCounterComponent，按 720p 设计分辨率缩放） ═══ */
const PANEL_W = 660;
/** 木纹台面高度 */
const COUNTER_H = 128;
/** 吊绳尺寸 */
const ROPE_W = 20;
const ROPE_H = 40;
/** 收银机图标 */
const CASHIER_W = 112;
const CASHIER_H = 100;
/** 信息面板 */
const INFO_PANEL_H = 84;
const INFO_PAD_X = 10;
const INFO_PAD_Y = 8;
/** 烘焙坊按钮 */
const BTN_W = 92;
const BTN_H = 52;
/** Lv 胶囊徽章 */
const LV_BADGE_W = 60;
const LV_BADGE_H = 28;
/** EXP 条 */
const EXP_BAR_H = 8;
/** 吊灯 */
const LAMP_W = 32;
const LAMP_H = 28;

/* ═══ 颜色（取自抖音端 / Web 版 CSS） ═══ */
/** 信息面板底（渐变上端 #FFF8EE） */
const INFO_PANEL_BG = new Color(255, 248, 238, 255);
/** 信息面板描边 rgba(180,140,90,0.3) */
const INFO_PANEL_BORDER = new Color(180, 140, 90, 77);
/** 信息面板顶部高光 */
const INFO_PANEL_HIGHLIGHT = new Color(255, 255, 255, 120);
/** Lv 徽章底（渐变下端 #E8941A） */
const LV_BADGE_BG = new Color(232, 148, 26, 255);
/** 称号颜色 #5C3A1E */
const TITLE_COLOR = new Color(92, 58, 30, 255);
/** EXP 标签色 #C4956A */
const EXP_LABEL_COLOR = new Color(196, 149, 106, 255);
/** EXP 槽底色 #E8DCC8 */
const EXP_TRACK = new Color(232, 220, 200, 255);
/** EXP 填充色（渐变右端 #F5A623） */
const EXP_FILL = new Color(245, 166, 35, 255);
/** EXP 数字色 #A8886A */
const EXP_TEXT_COLOR = new Color(168, 136, 106, 255);
/** 营业中标签底 #4CAF50 */
const STATUS_TAG_BG = new Color(76, 175, 80, 255);
/** 烘焙坊按钮橙（保留原有色调） */
const BAKERY_BTN_BG = new Color(240, 166, 74, 255);
/** 烘焙坊按钮描边 */
const BAKERY_BTN_BORDER = new Color(139, 94, 60, 255);
/** 灯泡光晕 */
const LAMP_GLOW = new Color(255, 235, 160, 180);
const LAMP_GLOW_OUTER = new Color(255, 220, 120, 60);

/**
 * 营业厅收银台（对齐抖音端 CashierCounterComponent）：
 * 吊绳 + 木纹台面 + 收银机图标 + 信息面板（Lv胶囊/称号/EXP条/升级按钮）+ 营业中标签 + 三盏吊灯 + 烘焙坊入口。
 */
@ccclass('CashierCounterComponent')
export class CashierCounterComponent extends Component {
  private _badgeLabel: Label | null = null;
  private _titleLabel: Label | null = null;
  private _expLabel: Label | null = null;
  private _barFill: Graphics | null = null;
  private _barFillNode: Node | null = null;
  private _levelUpBtn: Node | null = null;
  private _levelUpCostLabel: Label | null = null;

  private readonly _onRefresh = (): void => this._refresh();

  protected onLoad(): void {
    this._build();
    fontManager.applyFontToTree(this.node);
  }

  protected onEnable(): void {
    const gm = GameManager.instance;
    gm.events.on('orders:changed', this._onRefresh);
    gm.events.on('save:loaded', this._onRefresh);
    gm.events.on('level:changed', this._onRefresh);
    this._refresh();
  }

  protected onDisable(): void {
    const gm = GameManager.instance;
    gm.events.off('orders:changed', this._onRefresh);
    gm.events.off('save:loaded', this._onRefresh);
    gm.events.off('level:changed', this._onRefresh);
  }

  private _build(): void {
    const ui = this.node.getComponent(UITransform) ?? this.node.addComponent(UITransform);
    ui.setContentSize(PANEL_W, COUNTER_H);

    // ── 吊绳（左右各一，位于台面上方） ──
    this._buildRope(-PANEL_W / 2 + 60, ROPE_W, ROPE_H);
    this._buildRope(PANEL_W / 2 - 60, ROPE_W, ROPE_H);

    // ── 木纹台面底板 ──
    const counter = new Node('counterSurface');
    counter.layer = this.node.layer;
    counter.addComponent(UITransform).setContentSize(PANEL_W, COUNTER_H);
    this.node.addChild(counter);
    // 木纹贴图（拉伸填满，对齐 web 版 background-size:100% 100%）
    createSpriteNode(
      'woodGrainBg', counter, 0,
      PANEL_W, COUNTER_H, 'sprites/bg/order-bar',
      new Vec3(0, 0, 0),
    );

    // ── 左侧：收银机图标（纯装饰，点击无功能） ──
    const cashierX = -PANEL_W / 2 + CASHIER_W / 2 + 16;
    const cashierNode = new Node('cashierIcon');
    cashierNode.layer = counter.layer;
    cashierNode.addComponent(UITransform).setContentSize(CASHIER_W, CASHIER_H);
    cashierNode.setPosition(new Vec3(cashierX, 0, 0));
    counter.addChild(cashierNode);
    createSpriteNode(
      'cashierImg', cashierNode, 0,
      CASHIER_W, CASHIER_H, 'sprites/ui/cashier',
      new Vec3(0, 0, 0),
    );

    // ── 右侧：烘焙坊按钮（微信端保留） ──
    this._buildBakeryButton(counter);

    // ── 中间：信息面板（收银机和烘焙坊按钮之间） ──
    const bakeryBtnX = PANEL_W / 2 - BTN_W / 2 - 12;
    const infoRight = bakeryBtnX - BTN_W / 2 - 16;
    const infoLeft = cashierX + CASHIER_W / 2 + 20;
    const infoPanelW = infoRight - infoLeft;

    this._buildInfoPanel(counter, infoLeft + infoPanelW / 2, infoPanelW);

    // ── 营业中标签（台面右上角） ──
    this._buildStatusTag(counter);

    // ── 三盏吊灯（台面下方，不占布局高度）—— 对齐抖音端，按左边缘百分比定位 ──
    this._buildLamp(counter, -PANEL_W / 2 + PANEL_W * 0.25);
    this._buildLamp(counter, -PANEL_W / 2 + PANEL_W * 0.48);
    this._buildLamp(counter, -PANEL_W / 2 + PANEL_W * 0.72);
  }

  /** 吊绳 */
  private _buildRope(x: number, w: number, h: number): void {
    const rope = new Node('rope');
    rope.layer = this.node.layer;
    rope.addComponent(UITransform).setContentSize(w, h);
    rope.setPosition(new Vec3(x, COUNTER_H / 2 + h / 2 - 4, 0));
    this.node.addChild(rope);
    createSpriteNode(
      'ropeImg', rope, 0,
      w, h, 'sprites/bg/rope',
      new Vec3(0, 0, 0),
    );
  }

  /** 信息面板（Lv胶囊 + 称号 + EXP条 + 升级按钮） */
  private _buildInfoPanel(parent: Node, cx: number, w: number): void {
    const panel = new Node('infoPanel');
    panel.layer = parent.layer;
    panel.addComponent(UITransform).setContentSize(w, INFO_PANEL_H);
    panel.setPosition(new Vec3(cx, 0, 0));
    parent.addChild(panel);

    // 底板
    const g = panel.addComponent(Graphics);
    g.fillColor = INFO_PANEL_BG;
    g.roundRect(-w / 2, -INFO_PANEL_H / 2, w, INFO_PANEL_H, 10);
    g.fill();
    g.lineWidth = 1.5;
    g.strokeColor = INFO_PANEL_BORDER;
    g.roundRect(-w / 2, -INFO_PANEL_H / 2, w, INFO_PANEL_H, 10);
    g.stroke();
    // 顶部高光（模拟 inset shadow）
    g.fillColor = INFO_PANEL_HIGHLIGHT;
    g.roundRect(-w / 2 + 2, INFO_PANEL_H / 2 - 4, w - 4, 3, 1.5);
    g.fill();

    // 点击区域（查看等级详情）
    panel.addComponent(TapZoneComponent).onTap = () => {
      playSfx('click');
      const canvas = this.node.parent;
      if (canvas) LevelModal.show(canvas);
    };

    const contentLeft = -w / 2 + INFO_PAD_X;
    const contentRight = w / 2 - INFO_PAD_X;
    const contentW = contentRight - contentLeft;

    // ── 第一行：Lv 胶囊 + 称号 ──
    const headerY = INFO_PANEL_H / 2 - INFO_PAD_Y - 11;

    // Lv 胶囊徽章
    const badge = new Node('lvBadge');
    badge.layer = panel.layer;
    badge.addComponent(UITransform).setContentSize(LV_BADGE_W, LV_BADGE_H);
    badge.setPosition(new Vec3(contentLeft + LV_BADGE_W / 2, headerY, 0));
    panel.addChild(badge);
    const bg2 = badge.addComponent(Graphics);
    bg2.fillColor = LV_BADGE_BG;
    bg2.roundRect(-LV_BADGE_W / 2, -LV_BADGE_H / 2, LV_BADGE_W, LV_BADGE_H, LV_BADGE_H / 2);
    bg2.fill();
    const badgeLabelNode = new Node('badgeLabel');
    badgeLabelNode.layer = badge.layer;
    badgeLabelNode.addComponent(UITransform);
    badge.addChild(badgeLabelNode);
    this._badgeLabel = badgeLabelNode.addComponent(Label);
    this._badgeLabel.fontSize = 18;
    this._badgeLabel.lineHeight = 22;
    this._badgeLabel.isBold = true;
    this._badgeLabel.color = Color.WHITE;

    // 称号
    const LV_TITLE_GAP = 12;
    const titleX = contentLeft + LV_BADGE_W + LV_TITLE_GAP;
    const titleNode = new Node('title');
    titleNode.layer = panel.layer;
    const tui = titleNode.addComponent(UITransform);
    tui.setContentSize(contentW - LV_BADGE_W - LV_TITLE_GAP, 28);
    tui.setAnchorPoint(0, 0.5);
    titleNode.setPosition(new Vec3(titleX, headerY, 0));
    panel.addChild(titleNode);
    this._titleLabel = titleNode.addComponent(Label);
    this._titleLabel.fontSize = 24;
    this._titleLabel.lineHeight = 28;
    this._titleLabel.isBold = true;
    this._titleLabel.color = TITLE_COLOR;
    this._titleLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
    this._titleLabel.overflow = Label.Overflow.SHRINK;

    // ── 第二行：EXP 标签 + 进度条 + 数字 ──
    const expY = -INFO_PANEL_H / 2 + INFO_PAD_Y + 10;
    const EXP_LABEL_W = 28;
    const EXP_TEXT_W = 50;
    const barLeft = contentLeft + EXP_LABEL_W + 4;
    const barRight = contentRight - EXP_TEXT_W - 4;
    const barW = Math.max(20, barRight - barLeft);

    // EXP 标签
    const expTagNode = new Node('expTag');
    expTagNode.layer = panel.layer;
    const etui = expTagNode.addComponent(UITransform);
    etui.setContentSize(EXP_LABEL_W, 14);
    etui.setAnchorPoint(0, 0.5);
    expTagNode.setPosition(new Vec3(contentLeft, expY, 0));
    panel.addChild(expTagNode);
    const expTag = expTagNode.addComponent(Label);
    expTag.string = 'EXP';
    expTag.fontSize = 12;
    expTag.lineHeight = 14;
    expTag.isBold = true;
    expTag.color = EXP_LABEL_COLOR;
    expTag.horizontalAlign = Label.HorizontalAlign.LEFT;

    // 进度条轨道
    const barNode = new Node('expBar');
    barNode.layer = panel.layer;
    barNode.addComponent(UITransform).setContentSize(barW, EXP_BAR_H);
    barNode.setPosition(new Vec3(barLeft + barW / 2, expY, 0));
    panel.addChild(barNode);
    const track = barNode.addComponent(Graphics);
    track.fillColor = EXP_TRACK;
    track.roundRect(-barW / 2, -EXP_BAR_H / 2, barW, EXP_BAR_H, EXP_BAR_H / 2);
    track.fill();

    // 进度条填充
    const fillNode = new Node('expBarFill');
    fillNode.layer = barNode.layer;
    fillNode.addComponent(UITransform).setContentSize(barW, EXP_BAR_H);
    barNode.addChild(fillNode);
    this._barFill = fillNode.addComponent(Graphics);
    this._barFillNode = fillNode;

    // EXP 数字
    const expTextNode = new Node('expText');
    expTextNode.layer = panel.layer;
    const etxui = expTextNode.addComponent(UITransform);
    etxui.setContentSize(EXP_TEXT_W, 14);
    etxui.setAnchorPoint(1, 0.5);
    expTextNode.setPosition(new Vec3(contentRight, expY, 0));
    panel.addChild(expTextNode);
    this._expLabel = expTextNode.addComponent(Label);
    this._expLabel.fontSize = 12;
    this._expLabel.lineHeight = 14;
    this._expLabel.isBold = false;
    this._expLabel.color = EXP_TEXT_COLOR;
    this._expLabel.horizontalAlign = Label.HorizontalAlign.RIGHT;

    // 升级按钮（pendingLevelUp 时显示，替代 EXP 数字）
    const levelUpBtn = new Node('levelUpBtn');
    levelUpBtn.layer = panel.layer;
    levelUpBtn.addComponent(UITransform).setContentSize(84, 24);
    levelUpBtn.setPosition(new Vec3(contentRight - 42, expY, 0));
    levelUpBtn.active = false;
    panel.addChild(levelUpBtn);
    this._levelUpBtn = levelUpBtn;
    // 按钮背景（红色渐变胶囊）
    const btnBg = levelUpBtn.addComponent(Graphics);
    btnBg.fillColor = new Color(232, 69, 69, 255);
    btnBg.roundRect(-42, -12, 84, 24, 12);
    btnBg.fill();
    btnBg.fillColor = new Color(255, 107, 107, 255);
    btnBg.roundRect(-42, 0, 84, 12, 12);
    btnBg.fill();
    btnBg.lineWidth = 1.5;
    btnBg.strokeColor = new Color(255, 255, 255, 90);
    btnBg.roundRect(-42, -12, 84, 24, 12);
    btnBg.stroke();
    // "升级"文字
    const upLabelNode = new Node('upLabel');
    upLabelNode.layer = levelUpBtn.layer;
    upLabelNode.addComponent(UITransform).setContentSize(30, 20);
    upLabelNode.setPosition(new Vec3(-18, 0, 0));
    levelUpBtn.addChild(upLabelNode);
    const upLabel = upLabelNode.addComponent(Label);
    upLabel.string = '升级';
    upLabel.fontSize = 12;
    upLabel.lineHeight = 20;
    upLabel.isBold = true;
    upLabel.color = Color.WHITE;
    upLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
    // 金币图标
    const coinIconNode = new Node('coinIcon');
    coinIconNode.layer = levelUpBtn.layer;
    coinIconNode.addComponent(UITransform).setContentSize(12, 12);
    coinIconNode.setPosition(new Vec3(2, 0, 0));
    levelUpBtn.addChild(coinIconNode);
    const coinSprite = coinIconNode.addComponent(Sprite);
    coinSprite.sizeMode = Sprite.SizeMode.CUSTOM;
    loadSpriteFrame('sprites/currency/coin', sf => {
      if (sf && coinSprite.isValid) coinSprite.spriteFrame = sf;
    });
    // 花费数字
    const costLabelNode = new Node('costLabel');
    costLabelNode.layer = levelUpBtn.layer;
    costLabelNode.addComponent(UITransform).setContentSize(30, 20);
    costLabelNode.setPosition(new Vec3(24, 0, 0));
    levelUpBtn.addChild(costLabelNode);
    this._levelUpCostLabel = costLabelNode.addComponent(Label);
    this._levelUpCostLabel.fontSize = 12;
    this._levelUpCostLabel.lineHeight = 20;
    this._levelUpCostLabel.isBold = true;
    this._levelUpCostLabel.color = Color.WHITE;
    this._levelUpCostLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
    // 点击升级
    levelUpBtn.addComponent(TapZoneComponent).onTap = () => {
      const gm = GameManager.instance;
      if (gm.payLevelUp()) {
        playSfx('purchase');
      } else {
        playSfx('error');
        showPageToast(this.node, '金币不足哦');
      }
    };
  }

  /** 烘焙坊入口按钮 */
  private _buildBakeryButton(parent: Node): void {
    const btn = new Node('bakeryButton');
    btn.layer = parent.layer;
    btn.addComponent(UITransform).setContentSize(BTN_W, BTN_H);
    btn.setPosition(new Vec3(PANEL_W / 2 - BTN_W / 2 - 12, 0, 0));
    parent.addChild(btn);

    const g = btn.addComponent(Graphics);
    g.fillColor = BAKERY_BTN_BG;
    g.roundRect(-BTN_W / 2, -BTN_H / 2, BTN_W, BTN_H, 14);
    g.fill();
    g.lineWidth = 2.5;
    g.strokeColor = BAKERY_BTN_BORDER;
    g.roundRect(-BTN_W / 2, -BTN_H / 2, BTN_W, BTN_H, 14);
    g.stroke();
    // 顶部高光
    g.fillColor = new Color(255, 255, 255, 60);
    g.roundRect(-BTN_W / 2 + 3, BTN_H / 2 - 6, BTN_W - 6, 4, 2);
    g.fill();

    btn.addComponent(TapZoneComponent).onTap = () => {
      playSfx('click');
      const canvas = this.node.parent;
      if (canvas && !hasOpenBundlePage(canvas)) {
        openBundlePage(canvas, 'bakery', 'BakeryPage');
      }
    };
  }

  /** 营业中状态标签（台面右上角） */
  private _buildStatusTag(parent: Node): void {
    const tagW = 56;
    const tagH = 18;
    const tag = new Node('statusTag');
    tag.layer = parent.layer;
    tag.addComponent(UITransform).setContentSize(tagW, tagH);
    tag.setPosition(new Vec3(PANEL_W / 2 - tagW / 2 - 34, COUNTER_H / 2 - tagH / 2 - 28, 0));
    parent.addChild(tag);

    const g = tag.addComponent(Graphics);
    // 底部圆角（顶部直角贴台面）
    g.fillColor = STATUS_TAG_BG;
    const r = 5;
    g.moveTo(-tagW / 2, tagH / 2);
    g.lineTo(tagW / 2, tagH / 2);
    g.lineTo(tagW / 2, -tagH / 2 + r);
    g.quadraticCurveTo(tagW / 2, -tagH / 2, tagW / 2 - r, -tagH / 2);
    g.lineTo(-tagW / 2 + r, -tagH / 2);
    g.quadraticCurveTo(-tagW / 2, -tagH / 2, -tagW / 2, -tagH / 2 + r);
    g.lineTo(-tagW / 2, tagH / 2);
    g.fill();

    // 状态点
    const dot = new Node('dot');
    dot.layer = tag.layer;
    dot.addComponent(UITransform).setContentSize(5, 5);
    dot.setPosition(new Vec3(-tagW / 2 + 10, 0, 0));
    tag.addChild(dot);
    const dg = dot.addComponent(Graphics);
    dg.fillColor = new Color(165, 214, 167, 255);
    dg.circle(0, 0, 2.5);
    dg.fill();

    // 文字
    const labelNode = new Node('label');
    labelNode.layer = tag.layer;
    labelNode.addComponent(UITransform);
    labelNode.setPosition(new Vec3(4, 0, 0));
    tag.addChild(labelNode);
    const label = labelNode.addComponent(Label);
    label.string = '营业中～';
    label.fontSize = 11;
    label.lineHeight = 14;
    label.isBold = true;
    label.color = Color.WHITE;
  }

  /** 吊灯（图标 + 光晕） */
  private _buildLamp(parent: Node, x: number): void {
    const lampY = -COUNTER_H / 2 - LAMP_H / 2 + 4;

    // 光晕（底层，大圆）
    const glow = new Node('lampGlow');
    glow.layer = parent.layer;
    glow.addComponent(UITransform).setContentSize(50, 50);
    glow.setPosition(new Vec3(x, lampY - 4, 0));
    parent.addChild(glow);
    const gg = glow.addComponent(Graphics);
    gg.fillColor = LAMP_GLOW_OUTER;
    gg.circle(0, 0, 25);
    gg.fill();
    gg.fillColor = LAMP_GLOW;
    gg.circle(0, 0, 14);
    gg.fill();

    // 灯图标
    const lamp = new Node('lamp');
    lamp.layer = parent.layer;
    lamp.addComponent(UITransform).setContentSize(LAMP_W, LAMP_H);
    lamp.setPosition(new Vec3(x, lampY + 2, 0));
    parent.addChild(lamp);
    createSpriteNode(
      'lampImg', lamp, 0,
      LAMP_W, LAMP_H, 'sprites/ui/lamp',
      new Vec3(0, 0, 0),
    );
  }

  /** 刷新等级/经验显示 */
  private _refresh(): void {
    const gm = GameManager.instance;
    const def = getLevelDef(gm.level.level);
    const exp = getLevelExpInfo(gm.level);
    const pending = gm.level.pendingLevelUp;

    if (this._badgeLabel) {
      this._badgeLabel.string = `Lv.${gm.level.level}`;
    }
    if (this._titleLabel) {
      this._titleLabel.string = def.title;
    }
    // pendingLevelUp 时隐藏 EXP 数字，显示升级按钮
    if (this._expLabel) {
      this._expLabel.node.active = !pending;
      if (!pending) {
        this._expLabel.string = `${exp.current}/${exp.required}`;
      }
    }
    if (this._levelUpBtn) {
      this._levelUpBtn.active = pending;
    }
    if (this._levelUpCostLabel && pending) {
      const cost = getPendingLevelUpCost(gm.level);
      this._levelUpCostLabel.string = `${cost}`;
    }
    if (this._barFill && this._barFillNode) {
      const ui = this._barFillNode.getComponent(UITransform);
      const barW = ui ? ui.width : 100;
      const ratio = pending ? 1 : (exp.required > 0 ? Math.min(1, exp.current / exp.required) : 0);
      this._barFill.clear();
      if (ratio > 0.01) {
        const w = Math.max(barW * ratio, EXP_BAR_H);
        this._barFill.fillColor = EXP_FILL;
        this._barFill.roundRect(-barW / 2, -EXP_BAR_H / 2, w, EXP_BAR_H, EXP_BAR_H / 2);
        this._barFill.fill();
      }
    }
  }
}
