import { _decorator, Color, Component, Graphics, Label, Node, UITransform, Vec3 } from 'cc';

import { getLevelDef, getLevelExpInfo } from '../core/level';
import { GameManager } from '../manager/GameManager';
import { openBundlePage } from './bundle-pages';
import { TapZoneComponent } from './tap-zone';
import { UI_COLORS } from './ui-factory';
import { fontManager } from '../core/font-manager';

const { ccclass } = _decorator;

const PANEL_W = 660;
const PANEL_H = 120;
/** 信息面板（白底圆角，对齐抖音端） */
const INFO_PANEL_H = 84;
const INFO_PAD_X = 12;
const INFO_PAD_Y = 8;
/** Lv 胶囊徽章 */
const LV_BADGE_W = 60;
const LV_BADGE_H = 28;
/** EXP 条 */
const EXP_BAR_H = 8;
/** 烘焙坊按钮 */
const BTN_W = 92;
const BTN_H = 52;

/* ═══ 颜色（对齐抖音端 CashierCounter） ═══ */
/** 木牌深棕描边 #8B5E3C */
const PANEL_BORDER = new Color(139, 94, 60, 255);
/** 信息面板底 #FFF8EE */
const INFO_PANEL_BG = new Color(255, 248, 238, 255);
/** 信息面板描边 rgba(180,140,90,0.3) */
const INFO_PANEL_BORDER = new Color(180, 140, 90, 77);
/** 信息面板顶部高光 */
const INFO_PANEL_HIGHLIGHT = new Color(255, 255, 255, 120);
/** Lv 徽章底 #E8941A */
const LV_BADGE_BG = new Color(232, 148, 26, 255);
/** 称号颜色 #5C3A1E */
const TITLE_COLOR = new Color(92, 58, 30, 255);
/** EXP 标签色 #C4956A */
const EXP_LABEL_COLOR = new Color(196, 149, 106, 255);
/** EXP 槽底色 #E8DCC8 */
const EXP_TRACK = new Color(232, 220, 200, 255);
/** EXP 填充色 #F5A623 */
const EXP_FILL = new Color(245, 166, 35, 255);
/** EXP 数字色 #A8886A */
const EXP_TEXT_COLOR = new Color(168, 136, 106, 255);
/** 营业中标签底 #4CAF50 */
const STATUS_TAG_BG = new Color(76, 175, 80, 255);
/** 烘焙坊按钮橙 #F0A64A */
const BAKERY_BTN_BG = new Color(240, 166, 74, 255);
/** 烘焙坊按钮描边 #8B5E3C */
const BAKERY_BTN_BORDER = new Color(139, 94, 60, 255);

/**
 * 营业厅收银台（对齐抖音端样式）：
 * 木牌底 + 信息面板（Lv胶囊/称号/EXP条）+ 营业中标签 + 烘焙坊入口。
 */
@ccclass('CashierCounterComponent')
export class CashierCounterComponent extends Component {
  private _badgeLabel: Label | null = null;
  private _titleLabel: Label | null = null;
  private _expLabel: Label | null = null;
  private _barFill: Graphics | null = null;
  private _barFillNode: Node | null = null;

  protected onLoad(): void {
    this._build();
    fontManager.applyFontToTree(this.node);
  }

  protected onEnable(): void {
    const gm = GameManager.instance;
    gm.events.on('orders:changed', this._refresh);
    gm.events.on('save:loaded', this._refresh);
    gm.events.on('level:changed', this._refresh);
    this._refresh();
  }

  protected onDisable(): void {
    const gm = GameManager.instance;
    gm.events.off('orders:changed', this._refresh);
    gm.events.off('save:loaded', this._refresh);
    gm.events.off('level:changed', this._refresh);
  }

  private _build(): void {
    const ui = this.node.getComponent(UITransform) ?? this.node.addComponent(UITransform);
    ui.setContentSize(PANEL_W, PANEL_H);

    // 木牌底
    const bg = this.node.addComponent(Graphics);
    bg.fillColor = UI_COLORS.pillBg;
    bg.roundRect(-PANEL_W / 2, -PANEL_H / 2, PANEL_W, PANEL_H, 18);
    bg.fill();
    bg.lineWidth = 4;
    bg.strokeColor = PANEL_BORDER;
    bg.roundRect(-PANEL_W / 2, -PANEL_H / 2, PANEL_W, PANEL_H, 18);
    bg.stroke();

    // 营业中标签（左上角）
    this._buildStatusTag();

    // 信息面板（居中偏左，右侧留给烘焙坊按钮）
    const infoW = PANEL_W - BTN_W - 60;
    const infoX = -BTN_W / 2 - 10;
    this._buildInfoPanel(infoX, infoW);

    // 烘焙坊按钮（右侧）
    this._buildBakeryButton();
  }

  /** 营业中状态标签（左上角，对齐抖音端样式） */
  private _buildStatusTag(): void {
    const tagW = 64;
    const tagH = 22;
    const tag = new Node('statusTag');
    tag.layer = this.node.layer;
    tag.addComponent(UITransform).setContentSize(tagW, tagH);
    tag.setPosition(new Vec3(-PANEL_W / 2 + tagW / 2 + 14, PANEL_H / 2 - tagH / 2 - 8, 0));
    this.node.addChild(tag);

    const g = tag.addComponent(Graphics);
    g.fillColor = STATUS_TAG_BG;
    g.roundRect(-tagW / 2, -tagH / 2, tagW, tagH, tagH / 2);
    g.fill();
    // 状态点
    g.fillColor = new Color(165, 214, 167, 255);
    g.circle(-tagW / 2 + 12, 0, 4);
    g.fill();

    const labelNode = new Node('label');
    labelNode.layer = tag.layer;
    labelNode.addComponent(UITransform);
    labelNode.setPosition(new Vec3(6, 0, 0));
    tag.addChild(labelNode);
    const label = labelNode.addComponent(Label);
    label.string = '营业中';
    label.fontSize = 13;
    label.lineHeight = 16;
    label.isBold = true;
    label.color = Color.WHITE;
  }

  /** 信息面板（Lv胶囊 + 称号 + EXP条，对齐抖音端） */
  private _buildInfoPanel(cx: number, w: number): void {
    const panel = new Node('infoPanel');
    panel.layer = this.node.layer;
    panel.addComponent(UITransform).setContentSize(w, INFO_PANEL_H);
    panel.setPosition(new Vec3(cx, 0, 0));
    this.node.addChild(panel);

    // 底板（白底圆角 + 描边 + 顶部高光）
    const g = panel.addComponent(Graphics);
    g.fillColor = INFO_PANEL_BG;
    g.roundRect(-w / 2, -INFO_PANEL_H / 2, w, INFO_PANEL_H, 10);
    g.fill();
    g.lineWidth = 1.5;
    g.strokeColor = INFO_PANEL_BORDER;
    g.roundRect(-w / 2, -INFO_PANEL_H / 2, w, INFO_PANEL_H, 10);
    g.stroke();
    g.fillColor = INFO_PANEL_HIGHLIGHT;
    g.roundRect(-w / 2 + 2, INFO_PANEL_H / 2 - 4, w - 4, 3, 1.5);
    g.fill();

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
    const EXP_TEXT_W = 56;
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
  }

  /** 烘焙坊入口按钮（对齐抖音端样式：橙色圆角+描边+高光） */
  private _buildBakeryButton(): void {
    const btn = new Node('bakeryButton');
    btn.layer = this.node.layer;
    btn.addComponent(UITransform).setContentSize(BTN_W, BTN_H);
    btn.setPosition(new Vec3(PANEL_W / 2 - BTN_W / 2 - 14, 0, 0));
    this.node.addChild(btn);

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

    const labelNode = new Node('label');
    labelNode.layer = btn.layer;
    labelNode.addComponent(UITransform);
    btn.addChild(labelNode);
    const label = labelNode.addComponent(Label);
    label.string = '烘焙坊';
    label.fontSize = 20;
    label.lineHeight = 24;
    label.isBold = true;
    label.color = new Color(255, 248, 238, 255);

    btn.addComponent(TapZoneComponent).onTap = () => {
      const canvas = this.node.parent;
      if (canvas) openBundlePage(canvas, 'bakery', 'BakeryPageComponent');
    };
  }

  private _refresh = (): void => {
    const gm = GameManager.instance;
    const def = getLevelDef(gm.level.level);
    const exp = getLevelExpInfo(gm.level);

    if (this._badgeLabel) {
      this._badgeLabel.string = `Lv.${gm.level.level}`;
    }
    if (this._titleLabel) {
      this._titleLabel.string = def.title;
    }
    if (this._expLabel) {
      this._expLabel.string = `${exp.current}/${exp.required}`;
    }
    if (this._barFill && this._barFillNode) {
      const ui = this._barFillNode.getComponent(UITransform);
      const barW = ui ? ui.width : 100;
      const ratio = exp.required > 0 ? Math.min(1, exp.current / exp.required) : 0;
      this._barFill.clear();
      if (ratio > 0.01) {
        const w = Math.max(barW * ratio, EXP_BAR_H);
        this._barFill.fillColor = EXP_FILL;
        this._barFill.roundRect(-barW / 2, -EXP_BAR_H / 2, w, EXP_BAR_H, EXP_BAR_H / 2);
        this._barFill.fill();
      }
    }
  };
}
