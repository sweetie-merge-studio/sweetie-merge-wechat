import { _decorator, Component, EventTouch, Input, Node, input, UITransform, Vec3 } from 'cc';

const { ccclass } = _decorator;

/**
 * 当前置顶的模态根节点。非空时只有它子树内的点击区响应。
 *
 * 走全局 input 的点击区不吃 BlockInputEvents——遮罩挡得住渲染层级，
 * 挡不住别人的全局监听，弹窗开着时下层的返回键/格子照样会被点到。
 */
let modalRoot: Node | null = null;

/** 压入模态层：此后只有 root 子树内的 TapZone 生效 */
export function pushModalLayer(root: Node): void {
  modalRoot = root;
}

/** 弹出模态层（只有当前持有者能弹，避免后开先关时误清） */
export function popModalLayer(root: Node): void {
  if (modalRoot === root) modalRoot = null;
}

/** 调试用：获取当前模态根节点（null 表示无模态层） */
export function getModalRoot(): Node | null {
  return modalRoot;
}

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

  /** 非空时打印命中诊断日志（临时排障用） */
  debugName = '';

  private _startedInside = false;

  /** 有模态层时，只有模态子树内的点击区参与命中 */
  private _blockedByModal(): boolean {
    // 模态节点可能随页面一起被销毁而来不及 pop，这里顺手自愈，
    // 否则整个页面的点击区会被一个已死的节点永久挡住
    if (modalRoot && !modalRoot.isValid) modalRoot = null;
    if (!modalRoot) return false;
    for (let n: Node | null = this.node; n; n = n.parent) {
      if (n === modalRoot) return false;
    }
    return true;
  }

  /** 调试用：返回模态层阻挡的详细原因 */
  private _modalBlockDebug(): string {
    if (!modalRoot) return 'modalRoot=null';
    if (!modalRoot.isValid) return 'modalRoot=invalid(已销毁)';
    let found = false;
    for (let n: Node | null = this.node; n; n = n.parent) {
      if (n === modalRoot) { found = true; break; }
    }
    return found ? '在模态子树内(不阻挡)' : `被模态根阻挡 modalRoot=${modalRoot.name}(valid)`;
  }

  protected onEnable(): void {
    input.on(Input.EventType.TOUCH_START, this._onTouchStart, this);
    input.on(Input.EventType.TOUCH_END, this._onTouchEnd, this);
    input.on(Input.EventType.TOUCH_CANCEL, this._onTouchCancel, this);
    if (this.debugName) console.info(`[tap] ENABLE ${this.debugName} parent=${this.node.parent?.name} active=${this.node.activeInHierarchy}`);
  }

  protected onDisable(): void {
    input.off(Input.EventType.TOUCH_START, this._onTouchStart, this);
    input.off(Input.EventType.TOUCH_END, this._onTouchEnd, this);
    input.off(Input.EventType.TOUCH_CANCEL, this._onTouchCancel, this);
    this._startedInside = false;
    if (this.debugName) console.info(`[tap] DISABLE ${this.debugName} parent=${this.node.parent?.name}`);
  }

  /** 触点（UI 世界坐标）是否落在本节点矩形内（锚点感知） */
  private _hit(event: EventTouch): boolean {
    if (!this.node.activeInHierarchy) return false;
    if (this._blockedByModal()) return false;
    const ui = this.node.getComponent(UITransform);
    if (!ui) return false;

    // 同时取 UI 坐标与世界坐标：web 平台下深层节点（弹窗→滚动区→卡片）
    // 可能出现 getUILocation 与 worldPosition 坐标系不一致，两种都试，任一命中即算。
    const posUI = event.getUILocation();
    const posW = event.getLocation();

    const inLocalRect = (local: Vec3): boolean => (
      local.x >= -ui.anchorX * ui.width &&
      local.x <= (1 - ui.anchorX) * ui.width &&
      local.y >= -ui.anchorY * ui.height &&
      local.y <= (1 - ui.anchorY) * ui.height
    );

    // 方式 A：convertToNodeSpaceAR（两种坐标都试）
    const localUI = ui.convertToNodeSpaceAR(new Vec3(posUI.x, posUI.y, 0));
    const localW = ui.convertToNodeSpaceAR(new Vec3(posW.x, posW.y, 0));
    const hitA = inLocalRect(localUI) || inLocalRect(localW);

    // 方式 B：世界坐标矩形（两种坐标都试，不依赖 convertToNodeSpaceAR）
    const wp = this.node.worldPosition;
    const scale = this.node.worldScale;
    const w = ui.width * scale.x;
    const h = ui.height * scale.y;
    const left = wp.x - ui.anchorX * w;
    const bottom = wp.y - ui.anchorY * h;
    const inWorldRect = (px: number, py: number): boolean => (
      px >= left && px <= left + w && py >= bottom && py <= bottom + h
    );
    const hitB = inWorldRect(posUI.x, posUI.y) || inWorldRect(posW.x, posW.y);

    return hitA || hitB;
  }

  private _onTouchStart(event: EventTouch): void {
    this._startedInside = this._hit(event);
    if (this.debugName) {
      const p = event.getUILocation();
      const ui = this.node.getComponent(UITransform);
      const local = ui?.convertToNodeSpaceAR(new Vec3(p.x, p.y, 0));
      console.info(
        `[tap] START ${this.debugName} inside=${this._startedInside}`,
        `ui=(${p.x.toFixed(0)},${p.y.toFixed(0)})`,
        `local=(${local?.x.toFixed(0)},${local?.y.toFixed(0)})`,
        `size=(${ui?.width}x${ui?.height}) anchor=(${ui?.anchorX},${ui?.anchorY})`,
        `active=${this.node.activeInHierarchy}`,
        `worldPos=(${this.node.worldPosition.x.toFixed(0)},${this.node.worldPosition.y.toFixed(0)})`,
        `modal=${this._modalBlockDebug()}`,
      );
    }
  }

  private _onTouchCancel(): void {
    if (this.debugName) console.info(`[tap] CANCEL ${this.debugName}`);
    this._startedInside = false;
  }

  private _onTouchEnd(event: EventTouch): void {
    const started = this._startedInside;
    this._startedInside = false;
    const hitNow = this._hit(event);
    if (this.debugName) {
      console.info(`[tap] END ${this.debugName} started=${started} hitNow=${hitNow} willFire=${started && hitNow}`);
    }
    if (started && hitNow) this.onTap?.();
  }
}
