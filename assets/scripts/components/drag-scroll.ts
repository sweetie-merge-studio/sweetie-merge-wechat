import { _decorator, Color, Component, EventTouch, Graphics, Input, input, Mask, Node, UITransform, Vec3 } from 'cc';

const { ccclass } = _decorator;

/**
 * 竖向拖拽滚动区。
 *
 * 为什么不用 Cocos 的 ScrollView：本项目相机/适配调整后节点触摸命中链路失效
 * （见 tap-zone.ts 与 RUNBOOK 的同款结论），ScrollView 依赖节点触摸事件驱动，
 * 在这里收不到。因此沿用 tap-zone 的做法——全局 input 监听 + UITransform 自算命中。
 *
 * 内容节点的命中判定走 convertToNodeSpaceAR，会跟随本组件对 content 的位移，
 * 所以滚动后子节点上的 TapZoneComponent 仍能正确命中，无需额外补偿。
 *
 * 用法：
 *   const view = createScrollView(parent, w, h);   // 返回可视区节点
 *   view.content                                   // 往这里塞内容
 *   view.setContentHeight(totalHeight);            // 内容高度变化后调用
 */
@ccclass('DragScrollComponent')
export class DragScrollComponent extends Component {
  /** 实际承载内容的子节点 */
  content: Node | null = null;
  /** 内容总高；小于等于可视高时不滚动 */
  contentHeight = 0;
  /** 触摸优先级提升（占位兼容，微信端触摸优先级由 tap-zone 模态层管理） */
  priorityBoost = 0;

  /** 拖动超过这个距离才算滚动，避免和点击抢事件 */
  private static readonly DRAG_THRESHOLD = 8;

  private _dragging = false;
  private _startY = 0;
  private _startOffset = 0;
  private _offset = 0;

  protected onEnable(): void {
    input.on(Input.EventType.TOUCH_START, this._onStart, this);
    input.on(Input.EventType.TOUCH_MOVE, this._onMove, this);
    input.on(Input.EventType.TOUCH_END, this._onEnd, this);
    input.on(Input.EventType.TOUCH_CANCEL, this._onEnd, this);
  }

  protected onDisable(): void {
    input.off(Input.EventType.TOUCH_START, this._onStart, this);
    input.off(Input.EventType.TOUCH_MOVE, this._onMove, this);
    input.off(Input.EventType.TOUCH_END, this._onEnd, this);
    input.off(Input.EventType.TOUCH_CANCEL, this._onEnd, this);
    this._dragging = false;
  }

  /** 触点是否落在可视区内 */
  private _inView(event: EventTouch): boolean {
    if (!this.node.activeInHierarchy) return false;
    const ui = this.node.getComponent(UITransform);
    if (!ui) return false;
    const p = event.getUILocation();
    const local = ui.convertToNodeSpaceAR(new Vec3(p.x, p.y, 0));
    return (
      local.x >= -ui.anchorX * ui.width &&
      local.x <= (1 - ui.anchorX) * ui.width &&
      local.y >= -ui.anchorY * ui.height &&
      local.y <= (1 - ui.anchorY) * ui.height
    );
  }

  /** 可滚动的最大偏移（内容比可视区高出来的部分） */
  private get _maxOffset(): number {
    const viewH = this.node.getComponent(UITransform)?.height ?? 0;
    return Math.max(0, this.contentHeight - viewH);
  }

  private _apply(): void {
    const c = this.content;
    if (!c?.isValid) return;
    const clamped = Math.min(Math.max(this._offset, 0), this._maxOffset);
    this._offset = clamped;
    // content 顶部对齐可视区顶部，向下增大 y 即把后面的内容拉上来
    c.setPosition(new Vec3(c.position.x, clamped, 0));
  }

  private _onStart(event: EventTouch): void {
    if (this._maxOffset <= 0 || !this._inView(event)) return;
    this._dragging = true;
    this._startY = event.getUILocation().y;
    this._startOffset = this._offset;
  }

  private _onMove(event: EventTouch): void {
    if (!this._dragging) return;
    const dy = event.getUILocation().y - this._startY;
    if (Math.abs(dy) < DragScrollComponent.DRAG_THRESHOLD) return;
    // 手指上滑（dy 为负）时看后面的内容，所以偏移取反向
    this._offset = this._startOffset - dy;
    this._apply();
  }

  private _onEnd(): void {
    this._dragging = false;
  }

  /** 内容高度变化后调用，会重新夹取当前偏移 */
  setContentHeight(h: number): void {
    this.contentHeight = h;
    this._apply();
  }

  /** 回到顶部 */
  scrollToTop(): void {
    this._offset = 0;
    this._apply();
  }
}

export interface ScrollView {
  /** 可视区节点（已挂 Mask 与 DragScrollComponent） */
  view: Node;
  /** 内容容器，往这里加子节点 */
  content: Node;
  /** 内容高度变化后调用 */
  setContentHeight: (h: number) => void;
  scrollToTop: () => void;
}

/** 建一个竖向滚动区：Mask 裁剪 + 拖拽位移 */
export function createScrollView(parent: Node, width: number, height: number): ScrollView {
  const view = new Node('scrollView');
  view.layer = parent.layer;
  view.addComponent(UITransform).setContentSize(width, height);
  parent.addChild(view);

  // 提前挂 Graphics：Mask.Type.GRAPHICS_RECT 在 onLoad 时会尝试给节点 addComponent(Graphics)，
  // 在微信小游戏灰度基础库 3.17.1 下这一步会抛错误 3804 导致整个 addComponent(Mask) 失败。
  // 提前创建好 Graphics 并画好矩形，Mask onLoad 时 getComponent(Graphics) 能直接拿到已有实例，
  // 不再触发 addComponent，从而绕过 3804。
  const g = view.addComponent(Graphics);
  g.fillColor = new Color(0, 0, 0, 0);
  g.rect(-width / 2, -height / 2, width, height);
  g.fill();

  const mask = view.addComponent(Mask);
  mask.type = Mask.Type.GRAPHICS_RECT;

  const content = new Node('scrollContent');
  content.layer = view.layer;
  content.addComponent(UITransform).setContentSize(width, height);
  view.addChild(content);

  const drag = view.addComponent(DragScrollComponent);
  drag.content = content;

  return {
    view,
    content,
    setContentHeight: h => drag.setContentHeight(h),
    scrollToTop: () => drag.scrollToTop(),
  };
}
