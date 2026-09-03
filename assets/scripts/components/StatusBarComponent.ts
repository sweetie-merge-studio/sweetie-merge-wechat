import { _decorator, Color, Component, Graphics, Label, Node, Sprite, UITransform, Vec3, Widget } from 'cc';

import type { EconomyState, EnergyState } from '../core/types';
import { GameManager } from '../manager/GameManager';
import { createSpriteNode, createLabel, UI_COLORS } from './ui-factory';
import { TapZoneComponent } from './tap-zone';
import { openBundleModal, showPageToast } from './bundle-pages';
import { SettingsModal } from './SettingsModal';
import { EnergyAdModal } from './EnergyAdModal';
import { getSectionTops } from './layout';
import { playSfx } from '../manager/AudioManager';
import { fontManager } from '../core/font-manager';

const { ccclass, property } = _decorator;

/* ═══ 尺寸（对齐 Web 版 StatusBar.vue，按 720p 设计分辨率缩放） ═══ */
const TOP_BAR_H = 60;
const PILL_H = 38;
const PILL_RADIUS = PILL_H / 2;
const ICON_SIZE = 28;
const PLUS_SIZE = 28;
const SETTINGS_SIZE = 40;
const GAP = 8;
const PILL_PAD_X = 10;
/** 药丸组左边距（左对齐，右侧让给微信胶囊按钮） */
const LEFT_PAD = 20;

/* 各药丸固定宽度（文字用 SHRINK 自适应） */
const ENERGY_PILL_W = 156;
const DIA_PILL_W = 128;
const GOLD_PILL_W = 116;

/* ═══ 颜色（取自 Web 版 CSS） ═══ */
/** 顶栏底色（透明，让全屏主背景图片透出） */
const TOP_BAR_BG = new Color(232, 200, 156, 0);
/** 药丸底 #FFF8EE */
const PILL_BG = new Color(255, 248, 238, 255);
/** 药丸描边 #D4C0A0 */
const PILL_BORDER = new Color(212, 192, 160, 255);
/** 精力药丸底（渐变下端 #F5E0B8） */
const ENERGY_PILL_BG = new Color(245, 224, 184, 255);
/** 精力药丸描边 #C4A87A */
const ENERGY_PILL_BORDER = new Color(196, 168, 122, 255);
/** 正文深棕 #5C3A1E */
const TEXT_COLOR = new Color(92, 58, 30, 255);
/** 精力 + 按钮 #E8941A */
const PLUS_ENERGY_BG = new Color(232, 148, 26, 255);
/** 钻石 + 按钮 #C4956A */
const PLUS_DIA_BG = new Color(196, 149, 106, 255);

interface PillEntry {
  key: 'energy' | 'dia' | 'gold';
  width: number;
  iconPath: string;
  hasPlus: boolean;
  plusColor: Color;
}

const PILL_ENTRIES: PillEntry[] = [
  { key: 'energy', width: ENERGY_PILL_W, iconPath: 'sprites/ui/energy_bolt', hasPlus: true, plusColor: PLUS_ENERGY_BG },
  { key: 'dia', width: DIA_PILL_W, iconPath: 'sprites/currency/diamond', hasPlus: true, plusColor: PLUS_DIA_BG },
  { key: 'gold', width: GOLD_PILL_W, iconPath: 'sprites/currency/coin', hasPlus: false, plusColor: PLUS_ENERGY_BG },
];

/**
 * 顶部状态栏（对齐 Web 版 StatusBar.vue）：
 * 顶栏渐变底 + 三枚药丸（精力/钻石/金币）+ 精力&钻石 +按钮 + 设置按钮。
 * 场景中绑定的 Label 仅作数据占位，实际 UI 由代码构建。
 */
@ccclass('StatusBarComponent')
export class StatusBarComponent extends Component {
  /** 当前激活的状态栏实例（供 coin-fly 等全局特效查询金币图标坐标） */
  private static _instance: StatusBarComponent | null = null;

  /** 获取状态栏金币图标的世界坐标，未就绪返回 null */
  static getGoldIconWorldPos(): Vec3 | null {
    const inst = StatusBarComponent._instance;
    if (!inst?.isValid || !inst._goldPillNode?.isValid) return null;
    // 金币图标位于药丸左侧，取药丸中心偏左作为飞行终点
    const worldPos = inst._goldPillNode.getWorldPosition();
    return new Vec3(worldPos.x - 30, worldPos.y, worldPos.z);
  }

  @property({ type: Label, tooltip: '金币显示 Label（场景绑定，运行时隐藏）' })
  coinsLabel: Label | null = null;

  @property({ type: Label, tooltip: '钻石显示 Label（场景绑定，运行时隐藏）' })
  diamondsLabel: Label | null = null;

  @property({ type: Label, tooltip: '精力显示 Label（场景绑定，运行时隐藏）' })
  energyLabel: Label | null = null;

  private _energyVal: Label | null = null;
  private _diaVal: Label | null = null;
  private _goldVal: Label | null = null;
  private _energyPillNode: Node | null = null;
  private _goldPillNode: Node | null = null;
  private _built = false;
  /** StatusBar 节点顶部距屏幕顶端的距离（设计单位），背景需向上延伸这么多以贴顶 */
  private _topInset = 0;

  protected onEnable(): void {
    StatusBarComponent._instance = this;
    this._buildOnce();
    const gm = GameManager.instance;
    gm.events.on('energy:changed', this._onEnergyChanged);
    gm.events.on('economy:changed', this._onEconomyChanged);
    gm.events.on('save:loaded', this._refreshAll);
    this._refreshAll();
  }

  protected onDisable(): void {
    if (StatusBarComponent._instance === this) {
      StatusBarComponent._instance = null;
    }
    const gm = GameManager.instance;
    gm.events.off('energy:changed', this._onEnergyChanged);
    gm.events.off('economy:changed', this._onEconomyChanged);
    gm.events.off('save:loaded', this._refreshAll);
  }

  /** 构建完整顶栏 UI（仅一次） */
  private _buildOnce(): void {
    if (this._built) return;
    this._built = true;

    // 隐藏场景中绑定的占位 Label
    for (const lbl of [this.coinsLabel, this.diamondsLabel, this.energyLabel]) {
      if (lbl) lbl.node.active = false;
    }

    const ui = this.node.getComponent(UITransform) ?? this.node.addComponent(UITransform);
    const barW = ui.width > 0 ? ui.width : 720;

    // StatusBar 节点被锚定在距屏幕顶端 _topInset 处，
    // 背景向上延伸这段距离贴顶，药丸位于内容区垂直中心。
    this._topInset = getSectionTops().statusBar;
    const totalH = this._topInset + TOP_BAR_H;
    const contentY = -this._topInset / 2; // 药丸区域相对于 topBar 中心的偏移

    // ── 顶栏底板（渐变底 + 底部圆角 + 阴影），向上延伸至屏幕顶端 ──
    const bar = new Node('topBar');
    bar.layer = this.node.layer;
    bar.addComponent(UITransform).setContentSize(barW, totalH);
    this.node.addChild(bar);
    const barWg = bar.addComponent(Widget);
    barWg.isAlignTop = true;
    barWg.isAlignLeft = true;
    barWg.isAlignRight = true;
    barWg.top = -this._topInset;
    barWg.left = 0;
    barWg.right = 0;
    barWg.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;

    // 主底板（底部圆角，顶部直角贴屏幕顶）
    const bg = new Node('topBarBg');
    bg.layer = bar.layer;
    bg.addComponent(UITransform).setContentSize(barW, totalH);
    bar.addChild(bg);
    const bgG = bg.addComponent(Graphics);
    bgG.fillColor = TOP_BAR_BG;
    // 手动画底部圆角矩形（顶部直角），高度覆盖延伸区 + 内容区
    const r = 16;
    bgG.moveTo(-barW / 2, totalH / 2);
    bgG.lineTo(barW / 2, totalH / 2);
    bgG.lineTo(barW / 2, -totalH / 2 + r);
    bgG.quadraticCurveTo(barW / 2, -totalH / 2, barW / 2 - r, -totalH / 2);
    bgG.lineTo(-barW / 2 + r, -totalH / 2);
    bgG.quadraticCurveTo(-barW / 2, -totalH / 2, -barW / 2, -totalH / 2 + r);
    bgG.lineTo(-barW / 2, totalH / 2);
    bgG.fill();

    // ── 药丸 + 设置按钮，左对齐排列（右侧让给微信胶囊按钮），垂直位于内容区中心 ──
    let cursorX = -barW / 2 + LEFT_PAD;

    for (const entry of PILL_ENTRIES) {
      const pillX = cursorX + entry.width / 2;
      const pillNode = this._buildPill(bar, entry, pillX, contentY);
      if (entry.key === 'energy') this._energyPillNode = pillNode;
      else if (entry.key === 'gold') this._goldPillNode = pillNode;
      cursorX += entry.width + GAP;
    }

    // 设置按钮（药丸组右侧）
    const settingsX = cursorX + SETTINGS_SIZE / 2;
    this._buildSettingsButton(bar, settingsX, contentY);

    fontManager.applyFontToTree(this.node);
  }

  /** 构建单枚药丸 */
  private _buildPill(parent: Node, entry: PillEntry, x: number, y: number): Node {
    const isEnergy = entry.key === 'energy';
    const bgColor = isEnergy ? ENERGY_PILL_BG : PILL_BG;
    const borderColor = isEnergy ? ENERGY_PILL_BORDER : PILL_BORDER;

    const pill = new Node(`pill_${entry.key}`);
    pill.layer = parent.layer;
    pill.addComponent(UITransform).setContentSize(entry.width, PILL_H);
    pill.setPosition(new Vec3(x, y, 0));
    parent.addChild(pill);

    const g = pill.addComponent(Graphics);
    g.fillColor = bgColor;
    g.roundRect(-entry.width / 2, -PILL_H / 2, entry.width, PILL_H, PILL_RADIUS);
    g.fill();
    g.lineWidth = 2;
    g.strokeColor = borderColor;
    g.roundRect(-entry.width / 2, -PILL_H / 2, entry.width, PILL_H, PILL_RADIUS);
    g.stroke();

    // 图标（贴药丸左侧，统一使用图片资源，与 Web 版一致）
    const iconX = -entry.width / 2 + PILL_PAD_X + ICON_SIZE / 2;
    createSpriteNode(
      `icon_${entry.key}`, pill, pill.children.length,
      ICON_SIZE, ICON_SIZE, entry.iconPath,
      new Vec3(iconX, 0, 0),
    );

    // 数值 Label（图标右侧，左对齐，Shrink 自适应，自动应用圆润可爱字体）
    const textX = iconX + ICON_SIZE / 2 + 6;
    const textRight = entry.hasPlus
      ? entry.width / 2 - PILL_PAD_X - PLUS_SIZE - 4
      : entry.width / 2 - PILL_PAD_X;
    const textW = Math.max(20, textRight - textX);

    const label = createLabel(
      'val', pill, pill.children.length,
      textW, PILL_H - 6,
      new Vec3(textX, 0, 0),
      {
        fontSize: 20,
        lineHeight: 24,
        isBold: true,
        color: TEXT_COLOR,
        horizontalAlign: Label.HorizontalAlign.LEFT,
        overflow: Label.Overflow.SHRINK,
        anchorX: 0,
      },
    );

    if (entry.key === 'energy') this._energyVal = label;
    else if (entry.key === 'dia') this._diaVal = label;
    else this._goldVal = label;

    // + 按钮
    if (entry.hasPlus) {
      const plusX = entry.width / 2 - PILL_PAD_X - PLUS_SIZE / 2;
      const plus = new Node('plus');
      plus.layer = pill.layer;
      plus.addComponent(UITransform).setContentSize(PLUS_SIZE, PLUS_SIZE);
      plus.setPosition(new Vec3(plusX, 0, 0));
      pill.addChild(plus);
      const pg = plus.addComponent(Graphics);
      // 加号（无圆形底，避免药丸右端出现突兀的"圆点"）
      pg.lineWidth = 3;
      pg.lineCap = Graphics.LineCap.ROUND;
      pg.strokeColor = new Color(140, 100, 60, 255);
      const arm = PLUS_SIZE * 0.22;
      pg.moveTo(-arm, 0);
      pg.lineTo(arm, 0);
      pg.moveTo(0, -arm);
      pg.lineTo(0, arm);
      pg.stroke();
      // 点击：精力加号弹广告补精力弹窗，钻石加号打开商店
      plus.addComponent(TapZoneComponent).onTap = () => {
        playSfx('click');
        const canvas = this.node.parent;
        if (!canvas) return;
        if (isEnergy) {
          const energy = GameManager.instance.energy;
          if (energy.current >= energy.max) {
            showPageToast(canvas, '精力已满啦');
          } else {
            EnergyAdModal.show(canvas);
          }
        } else {
          openBundleModal(canvas, 'store', 'StorePageComponent', {
            width: 660,
            height: 1100,
            title: '甜心商店',
            iconPath: 'sprites/ui/nav/nav_shop',
            subtitle: '补充精力，获取稀有道具',
          });
        }
      };
    }

    return pill;
  }

  /** 构建设置按钮 */
  private _buildSettingsButton(parent: Node, x: number, y: number): void {
    const btn = new Node('settingsBtn');
    btn.layer = parent.layer;
    btn.addComponent(UITransform).setContentSize(SETTINGS_SIZE, SETTINGS_SIZE);
    btn.setPosition(new Vec3(x, y, 0));
    parent.addChild(btn);

    const g = btn.addComponent(Graphics);
    g.fillColor = PILL_BG;
    g.circle(0, 0, SETTINGS_SIZE / 2);
    g.fill();
    g.lineWidth = 2;
    g.strokeColor = PILL_BORDER;
    g.circle(0, 0, SETTINGS_SIZE / 2);
    g.stroke();

    createSpriteNode(
      'settingsIcon', btn, btn.children.length,
      24, 24, 'sprites/ui/settings',
      new Vec3(0, 0, 0),
    );

    btn.addComponent(TapZoneComponent).onTap = () => {
      playSfx('click');
      const canvas = this.node.parent;
      if (canvas) {
        SettingsModal.show(canvas);
      }
    };
  }

  // ── 数据刷新 ──

  private _onEnergyChanged = (energy: EnergyState): void => {
    if (this._energyVal) {
      this._energyVal.string = `${Math.floor(energy.current)}/${energy.max}`;
    }
  };

  private _onEconomyChanged = (eco: EconomyState): void => {
    if (this._goldVal) this._goldVal.string = String(eco.coins);
    if (this._diaVal) this._diaVal.string = String(eco.diamonds);
  };

  private _refreshAll = (): void => {
    const gm = GameManager.instance;
    this._onEnergyChanged(gm.energy);
    this._onEconomyChanged(gm.economy);
  };

}
