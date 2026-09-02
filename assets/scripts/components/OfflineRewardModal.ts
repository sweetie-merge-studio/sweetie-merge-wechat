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
const MODAL_H = 420;
const BTN_GAP = 16;

/**
 * 离线收益弹窗（对齐 Web 版 OfflineReward.vue）。
 *
 * 由 GameManager 在读档算出 offlineReward 后调起；
 * 「看广告翻倍」走激励视频，广告未播完自动按 1x 发放。
 */
@ccclass('OfflineRewardModal')
export class OfflineRewardModal extends Component {
  /** 广告请求中：防止重复点击弹两次广告 */
  private _busy = false;
  private _doubleButton: Node | null = null;

  /**
   * 有待领取的离线收益时挂出弹窗。
   * @returns 是否真的弹了
   */
  static showIfAny(canvas: Node): boolean {
    if (!GameManager.instance.offlineReward) return false;
    const root = createModalRoot(canvas, 'offlineReward');
    if (!root) return false;
    root.addComponent(OfflineRewardModal);
    return true;
  }

  protected onLoad(): void {
    const data = GameManager.instance.offlineReward;
    // 理论上 showIfAny 已经判过，这里兜底避免空弹窗
    if (!data) {
      this.node.destroy();
      return;
    }

    buildScrim(this.node);
    const panel = buildPanel(this.node, MODAL_W, MODAL_H);

    buildModalLabel(panel, '欢迎回来呀', 34, new Vec3(0, MODAL_H / 2 - 62, 0), { bold: true });
    buildModalLabel(panel, `离开 ${data.duration} 啦`, 24, new Vec3(0, MODAL_H / 2 - 118, 0));
    buildModalLabel(panel, `+${data.energy} 精力`, 44, new Vec3(0, 26, 0), {
      bold: true,
      color: new Color(126, 148, 74, 255),
    });

    const btnY = -MODAL_H / 2 + 62 + MODAL_BTN_H + BTN_GAP;
    this._doubleButton = buildModalButton(
      panel,
      new Vec3(0, btnY, 0),
      `看广告翻倍 +${data.energy * 2}`,
      BTN_DOUBLE,
      () => void this._onDouble(),
    );
    buildModalButton(panel, new Vec3(0, -MODAL_H / 2 + 62, 0), '开心收下', BTN_PLAIN, () =>
      this._onPlain(),
    );
  }

  // --- 交互 ---

  private _onPlain(): void {
    if (this._busy) return;
    GameManager.instance.collectOfflineReward(false);
    this.node.destroy();
  }

  private async _onDouble(): Promise<void> {
    if (this._busy) return;
    this._busy = true;
    setButtonBusy(this._doubleButton, '广告加载中…');

    try {
      // 广告未播完时 collectOfflineRewardDouble 内部按 1x 发放
      await GameManager.instance.collectOfflineRewardDouble();
    } finally {
      // 广告 SDK 异常也要关弹窗，否则奖励已发但弹窗卡住
      if (this.node.isValid) this.node.destroy();
    }
  }

}
