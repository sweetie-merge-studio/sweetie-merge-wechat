import { Color, Component, Graphics, _decorator } from 'cc';

const { ccclass } = _decorator;

/** Web 版 linear-gradient(#FF8AB5, #C86DD7, #8BA4FF) 的三个锚点 */
const STOPS: readonly Color[] = [
  new Color(255, 138, 181, 255),
  new Color(200, 109, 215, 255),
  new Color(139, 164, 255, 255),
];

/**
 * 完成卡的流光描边（对齐 Web Collection.vue 的 @keyframes rare-border-flow）。
 *
 * Cocos Graphics 没有 CSS 那样的渐变描边，这里改成在彩虹色带里循环取色
 * 重绘整圈描边，观感上同样是「边框在流动」。
 */
@ccclass('RainbowBorderEffect')
export class RainbowBorderEffect extends Component {
  width = 0;
  height = 0;
  radius = 22;
  lineWidth = 4;
  period = 5;

  private _t = 0;
  private _g: Graphics | null = null;
  private _strokeColor = new Color();

  protected onLoad(): void {
    this._g = this.node.addComponent(Graphics);
  }

  protected update(dt: number): void {
    const g = this._g;
    if (!g?.isValid) return;
    this._t += dt;

    const pos = ((this._t / this.period) % 1) * STOPS.length;
    const i = Math.floor(pos);
    const from = STOPS[i % STOPS.length];
    const to = STOPS[(i + 1) % STOPS.length];
    const k = pos - i;

    g.clear();
    g.lineWidth = this.lineWidth;
    this._strokeColor.set(
      Math.round(from.r + (to.r - from.r) * k),
      Math.round(from.g + (to.g - from.g) * k),
      Math.round(from.b + (to.b - from.b) * k),
      255,
    );
    g.strokeColor = this._strokeColor;
    g.roundRect(-this.width / 2, -this.height / 2, this.width, this.height, this.radius);
    g.stroke();
  }
}
