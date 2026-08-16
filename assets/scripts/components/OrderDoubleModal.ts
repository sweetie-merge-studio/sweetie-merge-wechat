import { _decorator, Color, Component, Node, Vec3 } from 'cc';

import { GameManager } from '../manager/GameManager';
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
const MODAL_H = 380;
const BTN_GAP = 16;

/** 金币数字的暖金色 */
const COIN_GOLD = new Color(198, 142, 42, 255);

/**
 * 订单翻倍弹窗（对齐 Web 版 OrderDoubleModal.vue）。
 *
 * 订单领取后调起：看广告可再得一份等额金币，
 * 广告未播完则维持已发放的 1x（基础奖励在领取时就已入账）。
 */
@ccclass('OrderDoubleModal')
export class OrderDoubleModal extends Component {
  private _baseCoins = 0;
  /** 广告请求中：防止重复点击弹两次广告 */
  private _busy = false;
  private _doubleButton: Node | null = null;

  /**
   * 弹出订单翻倍询问。
   * @param baseCoins 本次订单已发放的金币，翻倍即再发等额
   * @returns 是否真的弹了
   */
  static show(canvas: Node, baseCoins: number): boolean {
    // 无金币奖励的订单没有可翻倍的部分
    if (baseCoins <= 0) return false;
    const root = createModalRoot(canvas, 'orderDouble');
    if (!root) return false;
    root.addComponent(OrderDoubleModal)._baseCoins = baseCoins;
    return true;
  }

  protected onLoad(): void {
    buildScrim(this.node);
    const panel = buildPanel(this.node, MODAL_W, MODAL_H);

    buildModalLabel(panel, '订单完成', 34, new Vec3(0, MODAL_H / 2 - 62, 0), { bold: true });
    buildModalLabel(panel, `+${this._baseCoins} 金币`, 44, new Vec3(0, 20, 0), {
      bold: true,
      color: COIN_GOLD,
    });

    const btnY = -MODAL_H / 2 + 62 + MODAL_BTN_H + BTN_GAP;
    this._doubleButton = buildModalButton(
      panel,
      new Vec3(0, btnY, 0),
      `看广告翻倍 +${this._baseCoins}`,
      BTN_DOUBLE,
      () => void this._onDouble(),
    );
    buildModalButton(panel, new Vec3(0, -MODAL_H / 2 + 62, 0), '不用了', BTN_PLAIN, () =>
      this._onSkip(),
    );
  }

  private _onSkip(): void {
    if (this._busy) return;
    this.node.destroy();
  }

  private async _onDouble(): Promise<void> {
    if (this._busy) return;
    this._busy = true;
    setButtonBusy(this._doubleButton, '广告加载中…');

    try {
      // 广告未播完时 doubleOrderReward 返回 false，基础奖励已在领取时入账，无需回补
      await GameManager.instance.doubleOrderReward(this._baseCoins);
    } finally {
      if (this.node.isValid) this.node.destroy();
    }
  }
}
