import { _decorator, Component, Label, Vec3 } from 'cc';

import type { EconomyState, EnergyState } from '../core/types';
import { GameManager } from '../manager/GameManager';
import { createRoundRectNode, createSpriteNode, UI_COLORS } from './ui-factory';

const { ccclass, property } = _decorator;

const PILL_WIDTH = 170;
const PILL_HEIGHT = 46;
const ICON_SIZE = 30;
/** 图标在药丸内的横向偏移（相对 label 节点中心，贴药丸左缘避免压字） */
const ICON_OFFSET_X = -66;

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

    const entries: Array<{ label: Label | null; icon: string }> = [
      { label: this.coinsLabel, icon: 'sprites/currency/coin' },
      { label: this.diamondsLabel, icon: 'sprites/currency/diamond' },
      { label: this.energyLabel, icon: 'sprites/ui/energy_bolt' },
    ];

    for (const { label, icon } of entries) {
      if (!label) continue;
      const labelNode = label.node;
      const labelIndex = labelNode.getSiblingIndex();
      // 药丸底板插到 label 之前（渲染在文字下方）
      createRoundRectNode(
        `${labelNode.name}_pill`, this.node, labelIndex,
        PILL_WIDTH, PILL_HEIGHT, PILL_HEIGHT / 2,
        UI_COLORS.pillBg, UI_COLORS.pillBorder,
        labelNode.getPosition().clone(),
      );
      // 图标放在药丸左侧、文字上层
      const iconPos = labelNode.getPosition().clone().add(new Vec3(ICON_OFFSET_X, 0, 0));
      createSpriteNode(
        `${labelNode.name}_icon`, this.node, labelNode.getSiblingIndex() + 1,
        ICON_SIZE, ICON_SIZE, icon, iconPos,
      );
      label.color = UI_COLORS.textBrown;
      label.isBold = true;
    }
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
