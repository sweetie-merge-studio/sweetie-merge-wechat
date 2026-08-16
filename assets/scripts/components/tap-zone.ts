import { _decorator, Component, EventTouch, Input, input, UITransform, Vec3 } from 'cc';

const { ccclass } = _decorator;

/**
 * 全局输入版点击区。
 *
 * 本项目相机/适配调整后节点触摸命中链路失效（见棋盘 392a50c 的同款结论），
 * Node.on(TOUCH_END) 收不到事件，因此统一用 input 全局监听 + UITransform 自算命中。
 * 按下与抬起都落在节点矩形内才算一次点击，避免拖拽划过时误触。
 */
@ccclass('TapZoneComponent')
export class TapZoneComponent extends Component {
  /** 命中后的回调（由挂载方赋值） */
  onTap: (() => void) | null = null;

  private _startedInside = false;

  protected onEnable(): void {
    input.on(Input.EventType.TOUCH_START, this._onTouchStart, this);
    input.on(Input.EventType.TOUCH_END, this._onTouchEnd, this);
    input.on(Input.EventType.TOUCH_CANCEL, this._onTouchCancel, this);
  }

  protected onDisable(): void {
    input.off(Input.EventType.TOUCH_START, this._onTouchStart, this);
    input.off(Input.EventType.TOUCH_END, this._onTouchEnd, this);
    input.off(Input.EventType.TOUCH_CANCEL, this._onTouchCancel, this);
    this._startedInside = false;
  }

  /** 触点（UI 世界坐标）是否落在本节点矩形内（锚点感知） */
  private _hit(event: EventTouch): boolean {
    if (!this.node.activeInHierarchy) return false;
    const ui = this.node.getComponent(UITransform);
    if (!ui) return false;
    const pos = event.getUILocation();
    const local = ui.convertToNodeSpaceAR(new Vec3(pos.x, pos.y, 0));
    return (
      local.x >= -ui.anchorX * ui.width &&
      local.x <= (1 - ui.anchorX) * ui.width &&
      local.y >= -ui.anchorY * ui.height &&
      local.y <= (1 - ui.anchorY) * ui.height
    );
  }

  private _onTouchStart(event: EventTouch): void {
    this._startedInside = this._hit(event);
  }

  private _onTouchCancel(): void {
    this._startedInside = false;
  }

  private _onTouchEnd(event: EventTouch): void {
    const started = this._startedInside;
    this._startedInside = false;
    if (started && this._hit(event)) this.onTap?.();
  }
}
