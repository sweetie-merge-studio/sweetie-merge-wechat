import { Component, _decorator } from 'cc';

const { ccclass } = _decorator;

/**
 * 已完成稀有物的漂浮（对齐 Web Collection.vue 的 @keyframes rare-float）。
 */
@ccclass('FloatEffect')
export class FloatEffect extends Component {
  amplitude = 5;
  period = 3;

  /** 基准位置在 onLoad 时锁定，避免逐帧写回时累积漂移 */
  private _baseY = 0;
  private _t = 0;

  protected onLoad(): void {
    this._baseY = this.node.position.y;
  }

  protected update(dt: number): void {
    this._t += dt;
    const k = Math.sin((this._t / this.period) * Math.PI * 2);
    const p = this.node.position;
    this.node.setPosition(p.x, this._baseY + k * this.amplitude, p.z);
  }
}
