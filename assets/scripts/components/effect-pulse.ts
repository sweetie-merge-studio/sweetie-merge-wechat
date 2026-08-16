import { Component, UIOpacity, _decorator } from 'cc';

const { ccclass } = _decorator;

/**
 * 未领取格的呼吸高亮（对齐 Web Collection.vue 的 @keyframes unclaimed-pulse）。
 *
 * 只改 UIOpacity，不动节点尺寸——宿主节点常与 TapZoneComponent 共存，
 * 缩放会让渲染外观和命中矩形对不上。
 */
@ccclass('PulseEffect')
export class PulseEffect extends Component {
  /** 透明度区间与周期（秒） */
  min = 120;
  max = 255;
  period = 1.5;

  private _t = 0;
  private _op: UIOpacity | null = null;

  protected onLoad(): void {
    this._op = this.node.getComponent(UIOpacity) ?? this.node.addComponent(UIOpacity);
  }

  protected update(dt: number): void {
    if (!this._op?.isValid) return;
    this._t += dt;
    // 0..1..0 三角波，比 sin 更接近 CSS ease-in-out 的观感
    const phase = (this._t % this.period) / this.period;
    const k = phase < 0.5 ? phase * 2 : (1 - phase) * 2;
    this._op.opacity = Math.round(this.min + (this.max - this.min) * k);
  }
}
