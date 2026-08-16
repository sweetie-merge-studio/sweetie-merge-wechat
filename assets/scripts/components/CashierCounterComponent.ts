import { _decorator, Color, Component, Graphics, Label, Node, UITransform, Vec3 } from 'cc';

import { getLevelDef, getLevelExpInfo } from '../core/level';
import { GameManager } from '../manager/GameManager';
import { openBundlePage } from './bundle-pages';
import { UI_COLORS } from './ui-factory';

const { ccclass } = _decorator;

const PANEL_W = 660;
const PANEL_H = 120;
const BAR_W = 380;
const BAR_H = 16;
const BAR_POS = new Vec3(60, -28, 0);
/** 木牌深棕描边 #8B5E3C */
const PANEL_BORDER = new Color(139, 94, 60, 255);
/** EXP 槽底色 #E4D9C8 */
const BAR_TRACK = new Color(228, 217, 200, 255);
/** EXP 填充 #F0A64A */
const BAR_FILL = new Color(240, 166, 74, 255);
/** 「营业中」标底 #4CAF50 与状态圆点 #C8F5CA */
const OPEN_BADGE_BG = new Color(76, 175, 80, 255);
const OPEN_DOT = new Color(200, 245, 202, 255);

/**
 * 营业厅收银台（对齐 Web 版 CashierCounter.vue）：
 * 木牌面板 + Lv 徽章 + 等级称号 + EXP 进度条。
 * 节点整体由代码构建，数据来自 core/level。
 */
@ccclass('CashierCounterComponent')
export class CashierCounterComponent extends Component {
  private _titleLabel: Label | null = null;
  private _expLabel: Label | null = null;
  private _barFill: Graphics | null = null;

  protected onLoad(): void {
    this._build();
    this._mountBakeryButton();
  }

  /** 烘焙坊入口（bakery 分包页，对齐 Web 版从营业厅进入布置视图） */
  private _mountBakeryButton(): void {
    const BTN_W = 120;
    const BTN_H = 56;
    const btn = new Node('bakeryButton');
    btn.layer = this.node.layer;
    btn.addComponent(UITransform).setContentSize(BTN_W, BTN_H);
    btn.setPosition(new Vec3(PANEL_W / 2 - BTN_W / 2 - 16, 22, 0));
    this.node.addChild(btn);

    const g = btn.addComponent(Graphics);
    g.fillColor = BAR_FILL;
    g.roundRect(-BTN_W / 2, -BTN_H / 2, BTN_W, BTN_H, 16);
    g.fill();
    g.lineWidth = 3;
    g.strokeColor = PANEL_BORDER;
    g.roundRect(-BTN_W / 2, -BTN_H / 2, BTN_W, BTN_H, 16);
    g.stroke();

    const labelNode = new Node('label');
    labelNode.layer = btn.layer;
    labelNode.addComponent(UITransform);
    btn.addChild(labelNode);
    const label = labelNode.addComponent(Label);
    label.string = '烘焙坊';
    label.fontSize = 24;
    label.lineHeight = 30;
    label.isBold = true;
    label.color = new Color(255, 248, 238, 255);

    btn.on(Node.EventType.TOUCH_END, () => {
      const canvas = this.node.parent;
      if (canvas) openBundlePage(canvas, 'bakery', 'BakeryPageComponent');
    });
  }

  protected onEnable(): void {
    const gm = GameManager.instance;
    gm.events.on('orders:changed', this._refresh);
    gm.events.on('save:loaded', this._refresh);
    this._refresh();
  }

  protected onDisable(): void {
    const gm = GameManager.instance;
    gm.events.off('orders:changed', this._refresh);
    gm.events.off('save:loaded', this._refresh);
  }

  /**
   * 「营业中」状态标：绿点 + 文字，纯 Graphics 绘制（无贴图素材）。
   * 位置在烘焙坊按钮正下方、EXP 数字右侧的空白处。
   */
  private _buildOpenBadge(): void {
    const BADGE_W = 104;
    const BADGE_H = 30;
    const badge = new Node('openBadge');
    badge.layer = this.node.layer;
    badge.addComponent(UITransform).setContentSize(BADGE_W, BADGE_H);
    // 左上角：称号左侧的空白处（右侧下方被 EXP 数字占着）
    badge.setPosition(new Vec3(-PANEL_W / 2 + BADGE_W / 2 + 16, 22, 0));
    this.node.addChild(badge);

    const g = badge.addComponent(Graphics);
    g.fillColor = OPEN_BADGE_BG;
    g.roundRect(-BADGE_W / 2, -BADGE_H / 2, BADGE_W, BADGE_H, BADGE_H / 2);
    g.fill();
    // 左侧状态圆点
    g.fillColor = OPEN_DOT;
    g.circle(-BADGE_W / 2 + 18, 0, 6);
    g.fill();

    const textNode = new Node('openText');
    textNode.layer = this.node.layer;
    textNode.addComponent(UITransform);
    textNode.setPosition(new Vec3(8, 0, 0));
    badge.addChild(textNode);
    const label = textNode.addComponent(Label);
    label.string = '营业中';
    label.fontSize = 17;
    label.lineHeight = 20;
    label.isBold = true;
    label.color = Color.WHITE;
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

    this._buildOpenBadge();

    // 称号（含 Lv 前缀）
    this._titleLabel = this._makeLabel('titleLabel', new Vec3(-40, 18, 0), 28, true);
    // EXP 数字
    this._expLabel = this._makeLabel('expLabel', new Vec3(285, -28, 0), 18, false);

    // EXP 条：槽 + 填充
    const barNode = new Node('expBar');
    barNode.layer = this.node.layer;
    barNode.addComponent(UITransform).setContentSize(BAR_W, BAR_H);
    barNode.setPosition(BAR_POS);
    this.node.addChild(barNode);
    const track = barNode.addComponent(Graphics);
    track.fillColor = BAR_TRACK;
    track.roundRect(-BAR_W / 2, -BAR_H / 2, BAR_W, BAR_H, BAR_H / 2);
    track.fill();

    const fillNode = new Node('expBarFill');
    fillNode.layer = this.node.layer;
    fillNode.addComponent(UITransform).setContentSize(BAR_W, BAR_H);
    barNode.addChild(fillNode);
    this._barFill = fillNode.addComponent(Graphics);

    // EXP 字样
    const expTag = this._makeLabel('expTag', new Vec3(-BAR_W / 2 + 60 - 34, -28, 0), 16, true);
    expTag.string = 'EXP';
  }

  private _makeLabel(name: string, pos: Vec3, fontSize: number, bold: boolean): Label {
    const node = new Node(name);
    node.layer = this.node.layer;
    node.addComponent(UITransform);
    node.setPosition(pos);
    this.node.addChild(node);
    const label = node.addComponent(Label);
    label.color = UI_COLORS.textBrown;
    label.fontSize = fontSize;
    label.lineHeight = fontSize + 6;
    label.isBold = bold;
    return label;
  }

  private _refresh = (): void => {
    const gm = GameManager.instance;
    const def = getLevelDef(gm.level.level);
    const exp = getLevelExpInfo(gm.level);

    if (this._titleLabel) {
      this._titleLabel.string = `Lv.${gm.level.level} ${def.title}`;
    }
    if (this._expLabel) {
      this._expLabel.string = `${exp.current}/${exp.required}`;
    }
    if (this._barFill) {
      const ratio = exp.required > 0 ? Math.min(1, exp.current / exp.required) : 0;
      this._barFill.clear();
      if (ratio > 0.01) {
        const w = BAR_W * ratio;
        this._barFill.fillColor = BAR_FILL;
        this._barFill.roundRect(-BAR_W / 2, -BAR_H / 2, w, BAR_H, BAR_H / 2);
        this._barFill.fill();
      }
    }
  };
}
