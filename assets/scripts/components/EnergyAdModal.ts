import { _decorator, Color, Component, Node, Vec3 } from 'cc';

import { GameManager } from '../manager/GameManager';
import { getConfig } from '../core/config';
import { Events, trackEvent } from '../core/analytics';
import { showPageToast } from './bundle-pages';
import {
  BTN_DOUBLE,
  BTN_PLAIN,
  MODAL_BTN_H,
  buildModalButton,
  buildModalLabel,
  buildPanel,
  buildScrim,
  createModalRoot,
  setButtonBusy,
} from './modal-chrome';

const { ccclass } = _decorator;

const MODAL_W = 560;
const MODAL_H = 360;
const BTN_GAP = 16;

/** 精力条的青绿色 */
const ENERGY_GREEN = new Color(126, 148, 74, 255);

/**
 * 精力不足弹窗：看激励视频补精力。
 *
 * 对齐 core/ad-trigger 的「精力耗尽 → +20 精力」触发条件；
 * 补的点数取 config.energy.adReward，与 Web watchAdForEnergy 一致。
 */
@ccclass('EnergyAdModal')
export class EnergyAdModal extends Component {
  private _busy = false;
  private _adButton: Node | null = null;

  /** @returns 是否真的弹了 */
  static show(canvas: Node): boolean {
    const root = createModalRoot(canvas, 'energyAd');
    if (!root) return false;
    root.addComponent(EnergyAdModal);
    return true;
  }

  protected onLoad(): void {
    buildScrim(this.node);
    const panel = buildPanel(this.node, MODAL_W, MODAL_H);

    // 能量墙埋点：弹窗出现即一次能量耗尽拦截，等级分布决定调能量预算还是调难度
    trackEvent(Events.ENERGY_EMPTY, {
      player_level: GameManager.instance.level.level,
      orders_active: GameManager.instance.order.activeOrders.length,
    });

    const reward = getConfig().energy.adReward;
    // 频控达限（单日上限/冷却中）时不给广告入口，只留「再等等」——入口隐藏优于点了报错
    const adAvailable = GameManager.instance.energyAdAvailable;
    buildModalLabel(panel, '精力不足', 34, new Vec3(0, MODAL_H / 2 - 62, 0), { bold: true });
    buildModalLabel(
      panel,
      adAvailable ? `看广告补 +${reward} 精力` : '今日看广告次数已用完，精力会随时间恢复',
      24,
      new Vec3(0, MODAL_H / 2 - 118, 0),
    );
    buildModalLabel(panel, `+${reward}`, 44, new Vec3(0, 10, 0), {
      bold: true,
      color: ENERGY_GREEN,
    });

    if (adAvailable) {
      const btnY = -MODAL_H / 2 + 62 + MODAL_BTN_H + BTN_GAP;
      this._adButton = buildModalButton(panel, new Vec3(0, btnY, 0), '看广告', BTN_DOUBLE, () =>
        void this._onWatch(),
      );
    }
    buildModalButton(panel, new Vec3(0, -MODAL_H / 2 + 62, 0), '再等等', BTN_PLAIN, () =>
      this._onSkip(),
    );
  }

  private _onSkip(): void {
    if (this._busy) return;
    this.node.destroy();
  }

  private async _onWatch(): Promise<void> {
    if (this._busy) return;
    this._busy = true;
    setButtonBusy(this._adButton, '广告加载中…');

    let ok = false;
    try {
      ok = await GameManager.instance.watchAdForEnergy();
    } finally {
      const canvas = this.node.parent;
      if (this.node.isValid) this.node.destroy();
      // 广告没看完（关掉/加载失败）要给个交代，否则弹窗一闪而过像是白点
      if (!ok && canvas) showPageToast(canvas, '广告未看完，精力没有补上');
    }
  }
}
