import { Component, Vec3, _decorator } from 'cc';

const { ccclass } = _decorator;

/**
 * 详情弹窗的弹出缩放（对齐 Web Collection.vue 的 @keyframes detail-pop）。
 * 末段回弹超过 1 再落回，等价于 cubic-bezier(0.34, 1.56, 0.64, 1)。
 */
@ccclass('PopInEffect')
export class PopInEffect extends Component {
  duration = 0.35;

  private _t = 0;
  private _scaleVec = new Vec3();

  protected onLoad(): void {
    this._scaleVec.set(0.5, 0.5, 1);
    this.node.setScale(this._scaleVec);
  }

  protected update(dt: number): void {
    if (this._t >= this.duration) return;
    this._t = Math.min(this.duration, this._t + dt);
    const x = this._t / this.duration;
    const s = 1 + 2.7 * Math.pow(x - 1, 3) + 1.7 * Math.pow(x - 1, 2);
    this._scaleVec.set(s, s, 1);
    this.node.setScale(this._scaleVec);
    if (this._t >= this.duration) {
      this._scaleVec.set(1, 1, 1);
      this.node.setScale(this._scaleVec);
    }
  }
}
