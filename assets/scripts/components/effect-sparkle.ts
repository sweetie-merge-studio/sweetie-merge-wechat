import { Component, UIOpacity, _decorator } from 'cc';

const { ccclass } = _decorator;

/**
 * 完成卡的闪烁粒子（对齐 Web Collection.vue 的 @keyframes sparkle-orbit）。
 * 淡入淡出 + 上浮，靠各自的 delay 错开成环绕感。
 */
@ccclass('SparkleEffect')
export class SparkleEffect extends Component {
  period = 3;
  delay = 0;
  rise = 8;

  private _baseY = 0;
  private _t = 0;
  private _op: UIOpacity | null = null;
  private _started = false;

  protected onLoad(): void {
    this._baseY = this.node.position.y;
    this._op = this.node.getComponent(UIOpacity) ?? this.node.addComponent(UIOpacity);
  }

  protected update(dt: number): void {
    if (!this._op?.isValid) return;
    // 起播延迟只能在首帧套用：调用方是 addComponent 之后才赋 delay 的，
    // onLoad 里读到的还是默认值 0，四颗粒子会齐闪而不是错开环绕。
    if (!this._started) {
      this._started = true;
      this._t = -this.delay;
    }
    this._t += dt;
    if (this._t < 0) {
      this._op.opacity = 0;
      return;
    }
    const phase = (this._t % this.period) / this.period;
    // 亮度包络只占前 60% 周期，后段留空档，避免四颗粒子长期同时亮着
    const k = phase > 0.6 ? 0 : Math.sin((phase / 0.6) * Math.PI);
    this._op.opacity = Math.round(255 * k);
    const p = this.node.position;
    this.node.setPosition(p.x, this._baseY + this.rise * (1 - k), p.z);
  }
}
