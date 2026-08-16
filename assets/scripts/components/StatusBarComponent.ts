import { _decorator, Color, Component, Graphics, Label, Node, UITransform, Vec3 } from 'cc';

import type { EconomyState, EnergyState } from '../core/types';
import { GameManager } from '../manager/GameManager';
import { openBundlePage, hasOpenBundlePage, showPageToast } from './bundle-pages';
import { TapZoneComponent } from './tap-zone';
import { createRoundRectNode, createSpriteNode, UI_COLORS } from './ui-factory';

const { ccclass, property } = _decorator;

const PILL_WIDTH = 170;
const PILL_HEIGHT = 46;
const ICON_SIZE = 30;
/** 图标在药丸内的横向偏移（相对 label 节点中心，贴药丸左缘避免压字） */
const ICON_OFFSET_X = -66;

/** 「+」圆钮：骑在药丸右缘上（一半探出药丸外，对齐设计稿） */
const PLUS_SIZE = 30;
const PLUS_OFFSET_X = PILL_WIDTH / 2;
/** 「+」按钮橙 #EFA23C（与订单领取按钮同色系） */
const PLUS_BG = new Color(239, 162, 60, 255);
/** 右上角设置齿轮 */
const GEAR_SIZE = 40;
/** 齿轮占位后，三个药丸整体左移的距离（避免金币「+」与齿轮相撞） */
const PILL_SHIFT_X = -46;

/**
 * 顶部状态栏：金币 / 钻石 / 精力。
 *
 * 三个 Label 由场景绑定；药丸底板与资源图标在运行时动态构建，
 * 视觉对齐 Web 版 StatusBar.vue 的 .pill 规范。
 */
@ccclass('StatusBarComponent')
export class StatusBarComponent extends Component {
  @property({ type: Label, tooltip: '金币显示 Label' })
  coinsLabel: Label | null = null;

  @property({ type: Label, tooltip: '钻石显示 Label' })
  diamondsLabel: Label | null = null;

  @property({ type: Label, tooltip: '精力显示 Label，例如 32/100' })
  energyLabel: Label | null = null;

  private _decorated = false;

  protected onEnable(): void {
    this._decorateOnce();
    const gm = GameManager.instance;
    gm.events.on('energy:changed', this._onEnergyChanged);
    gm.events.on('economy:changed', this._onEconomyChanged);
    gm.events.on('save:loaded', this._refreshAll);
    this._refreshAll();
  }

  protected onDisable(): void {
    const gm = GameManager.instance;
    gm.events.off('energy:changed', this._onEnergyChanged);
    gm.events.off('economy:changed', this._onEconomyChanged);
    gm.events.off('save:loaded', this._refreshAll);
  }

  /** 为三个 Label 构建药丸底板与图标（仅一次） */
  private _decorateOnce(): void {
    if (this._decorated) return;
    this._decorated = true;

    const entries: Array<{ label: Label | null; icon: string; plus: 'shop' | 'energy' }> = [
      { label: this.coinsLabel, icon: 'sprites/currency/coin', plus: 'shop' },
      { label: this.diamondsLabel, icon: 'sprites/currency/diamond', plus: 'shop' },
      { label: this.energyLabel, icon: 'sprites/ui/energy_bolt', plus: 'energy' },
    ];

    for (const { label, icon, plus } of entries) {
      if (!label) continue;
      const labelNode = label.node;
      const labelIndex = labelNode.getSiblingIndex();
      // 整排左移，给右上角齿轮腾位（药丸/图标/文字/「+」都以此为基准）
      const pillPos = labelNode.getPosition().clone().add(new Vec3(PILL_SHIFT_X, 0, 0));
      // 药丸底板插到 label 之前（渲染在文字下方）
      createRoundRectNode(
        `${labelNode.name}_pill`, this.node, labelIndex,
        PILL_WIDTH, PILL_HEIGHT, PILL_HEIGHT / 2,
        UI_COLORS.pillBg, UI_COLORS.pillBorder,
        pillPos,
      );
      // 图标放在药丸左侧、文字上层
      const iconPos = pillPos.clone().add(new Vec3(ICON_OFFSET_X, 0, 0));
      createSpriteNode(
        `${labelNode.name}_icon`, this.node, labelNode.getSiblingIndex() + 1,
        ICON_SIZE, ICON_SIZE, icon, iconPos,
      );
      // 文字紧跟图标左对齐，长短数字都不会压到图标
      labelNode.getComponent(UITransform)?.setAnchorPoint(0, 0.5);
      labelNode.setPosition(new Vec3(pillPos.x + ICON_OFFSET_X + ICON_SIZE / 2 + 8, pillPos.y, 0));
      label.horizontalAlign = Label.HorizontalAlign.LEFT;
      label.color = UI_COLORS.textBrown;
      label.isBold = true;

      this._buildPlusButton(labelNode.name, pillPos, plus);
    }

    this._buildGearButton();
  }

  /** 药丸右端的橙色「+」圆钮：金币/钻石进商店，精力提示（补给玩法未就绪） */
  private _buildPlusButton(ownerName: string, pillPos: Vec3, kind: 'shop' | 'energy'): void {
    const pos = pillPos.clone().add(new Vec3(PLUS_OFFSET_X, 0, 0));
    const node = createRoundRectNode(
      `${ownerName}_plus`, this.node, this.node.children.length,
      PLUS_SIZE, PLUS_SIZE, PLUS_SIZE / 2,
      PLUS_BG, undefined, pos,
    );

    // 「+」十字画在独立子节点上：createRoundRectNode 已在 node 上用掉了 Graphics，
    // 复用同一实例会让圆底的 fill 与十字的 stroke 互相干扰
    const cross = new Node('plusCross');
    cross.layer = node.layer;
    cross.addComponent(UITransform).setContentSize(PLUS_SIZE, PLUS_SIZE);
    node.addChild(cross);
    const g = cross.addComponent(Graphics);
    g.lineWidth = 3.5;
    g.strokeColor = Color.WHITE;
    const arm = PLUS_SIZE / 4;
    g.moveTo(-arm, 0); g.lineTo(arm, 0);
    g.moveTo(0, -arm); g.lineTo(0, arm);
    g.stroke();

    const zone = node.addComponent(TapZoneComponent);
    zone.onTap = () => {
      const canvas = this.node.parent;
      if (!canvas || hasOpenBundlePage(canvas)) return;
      if (kind === 'shop') openBundlePage(canvas, 'blindbox', 'BlindboxPageComponent');
      else showPageToast(canvas, '精力补给开发中，敬请期待');
    };
  }

  /** 右上角设置齿轮（设置面板未就绪，先提示） */
  private _buildGearButton(): void {
    const ui = this.node.getComponent(UITransform);
    const halfW = (ui?.width ?? 720) / 2;
    const pos = new Vec3(halfW - GEAR_SIZE / 2 - 12, 0, 0);
    const node = createSpriteNode(
      'settings_gear', this.node, this.node.children.length,
      GEAR_SIZE, GEAR_SIZE, 'sprites/ui/settings', pos,
    );
    const zone = node.addComponent(TapZoneComponent);
    zone.onTap = () => {
      const canvas = this.node.parent;
      if (!canvas || hasOpenBundlePage(canvas)) return;
      showPageToast(canvas, '设置面板开发中，敬请期待');
    };
  }

  // 数字纯文本，资源含义由图标表达（对齐 Web 版 pill：icon + 数字）
  private _onEnergyChanged = (energy: EnergyState): void => {
    if (this.energyLabel) {
      this.energyLabel.string = `${Math.floor(energy.current)}/${energy.max}`;
    }
  };

  private _onEconomyChanged = (eco: EconomyState): void => {
    if (this.coinsLabel) this.coinsLabel.string = String(eco.coins);
    if (this.diamondsLabel) this.diamondsLabel.string = String(eco.diamonds);
  };

  private _refreshAll = (): void => {
    const gm = GameManager.instance;
    this._onEnergyChanged(gm.energy);
    this._onEconomyChanged(gm.economy);
  };
}
