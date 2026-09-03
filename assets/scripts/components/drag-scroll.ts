import { _decorator, Color, Component, EventTouch, Graphics, Input, input, Mask, Node, UITransform, Vec3 } from 'cc';

const { ccclass } = _decorator;

export type ScrollDirection = 'vertical' | 'horizontal';

/**
 * 拖拽滚动区（支持竖向 / 横向）。
 *
 * 为什么不用 Cocos 的 ScrollView：本项目相机/适配调整后节点触摸命中链路失效
 * （见 tap-zone.ts 与 RUNBOOK 的同款结论），ScrollView 依赖节点触摸事件驱动，
 * 在这里收不到。因此沿用 tap-zone 的做法——全局 input 监听 + UITransform 自算命中。
 *
 * 内容节点的命中判定走 convertToNodeSpaceAR，会跟随本组件对 content 的位移，
 * 所以滚动后子节点上的 TapZoneComponent 仍能正确命中，无需额外补偿。
 *
 * 用法：
 *   const sv = createScrollView(parent, w, h);                // 竖向
 *   const sv = createScrollView(parent, w, h, 'horizontal');   // 横向
 *   sv.content                                   // 往这里塞内容
 *   sv.setContentHeight(totalHeight);            // 竖向内容高度变化后调用
 *   sv.setContentWidth(totalWidth);              // 横向内容宽度变化后调用
 */
@ccclass('DragScrollComponent')
export class DragScrollComponent extends Component {
  /** 实际承载内容的子节点 */
  content: Node | null = null;
  /** 滚动方向（默认竖向） */
  direction: ScrollDirection = 'vertical';
  /** 内容总高（竖向用）；小于等于可视高时不滚动 */
  contentHeight = 0;
  /** 内容总宽（横向用）；小于等于可视宽时不滚动 */
  contentWidth = 0;
  /** 触摸优先级提升（占位兼容，微信端触摸优先级由 tap-zone 模态层管理） */
  priorityBoost = 0;

  /** 拖动超过这个距离才算滚动，避免和点击抢事件 */
  private static readonly DRAG_THRESHOLD = 8;

  private _dragging = false;
  private _startPos = 0;
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

  /** 触点是否落在可视区内（UI 坐标与世界坐标都试，任一命中即算） */
  private _inView(event: EventTouch): boolean {
    if (!this.node.activeInHierarchy) return false;
    const ui = this.node.getComponent(UITransform);
    if (!ui) return false;
    const inRect = (x: number, y: number): boolean => {
      const local = ui.convertToNodeSpaceAR(new Vec3(x, y, 0));
      return (
        local.x >= -ui.anchorX * ui.width &&
        local.x <= (1 - ui.anchorX) * ui.width &&
        local.y >= -ui.anchorY * ui.height &&
        local.y <= (1 - ui.anchorY) * ui.height
      );
    };
    const pUI = event.getUILocation();
    const pW = event.getLocation();
    return inRect(pUI.x, pUI.y) || inRect(pW.x, pW.y);
  }

  /** 可滚动的最大偏移（内容比可视区多出来的部分） */
  private get _maxOffset(): number {
    const ui = this.node.getComponent(UITransform);
    if (!ui) return 0;
    if (this.direction === 'horizontal') {
      return Math.max(0, this.contentWidth - ui.width);
    }
    return Math.max(0, this.contentHeight - ui.height);
  }

  private _apply(): void {
    const c = this.content;
    if (!c?.isValid) return;
    const clamped = Math.min(Math.max(this._offset, 0), this._maxOffset);
    this._offset = clamped;
    const ui = this.node.getComponent(UITransform);
    if (this.direction === 'horizontal') {
      // 横向：初始时 content 左边对齐 view 左边；offset 增大时 content 左移，露出右边内容
      const viewW = ui?.width ?? 0;
      const initialX = Math.max(0, (this.contentWidth - viewW) / 2);
      c.setPosition(new Vec3(initialX - clamped, c.position.y, 0));
    } else {
      // 竖向：初始时 content 顶部对齐 view 顶部；offset 增大时 content 下移，露出上方内容
      // （手指上滑 → offset 减小 → content 上移 → 露出下方内容，符合直觉）
      const viewH = ui?.height ?? 0;
      const initialY = -Math.max(0, (this.contentHeight - viewH) / 2);
      c.setPosition(new Vec3(c.position.x, initialY + clamped, 0));
    }
  }

  private _onStart(event: EventTouch): void {
    if (this._maxOffset <= 0 || !this._inView(event)) return;
    this._dragging = true;
    const p = event.getUILocation();
    this._startPos = this.direction === 'horizontal' ? p.x : p.y;
    this._startOffset = this._offset;
  }

  private _onMove(event: EventTouch): void {
    if (!this._dragging) return;
    const p = event.getUILocation();
    const cur = this.direction === 'horizontal' ? p.x : p.y;
    const d = cur - this._startPos;
    if (Math.abs(d) < DragScrollComponent.DRAG_THRESHOLD) return;
    if (this.direction === 'horizontal') {
      // 横向：手指左滑（dx 负）→ offset 增大 → content 左移，露出右边内容
      this._offset = this._startOffset - d;
    } else {
      // 竖向：手指上滑（dy 负）→ offset 减小 → content 上移，露出下方内容
      this._offset = this._startOffset + d;
    }
    this._apply();
  }

  private _onEnd(): void {
    this._dragging = false;
  }

  /** 内容高度变化后调用（竖向），会重新夹取当前偏移 */
  setContentHeight(h: number): void {
    this.contentHeight = h;
    if (this.content?.isValid) {
      const ui = this.content.getComponent(UITransform);
      if (ui) ui.height = h;
    }
    this._apply();
  }

  /** 内容宽度变化后调用（横向），会重新夹取当前偏移 */
  setContentWidth(w: number): void {
    this.contentWidth = w;
    if (this.content?.isValid) {
      const ui = this.content.getComponent(UITransform);
      if (ui) ui.width = w;
    }
    this._apply();
  }

  /** 回到顶部（竖向） */
  scrollToTop(): void {
    this._offset = 0;
    this._apply();
  }

  /** 回到起始位置（横向） */
  scrollToStart(): void {
    this._offset = 0;
    this._apply();
  }
}

export interface ScrollView {
  /** 可视区节点（已挂 Mask 与 DragScrollComponent） */
  view: Node;
  /** 内容容器，往这里加子节点 */
  content: Node;
  /** 内容高度变化后调用（竖向） */
  setContentHeight: (h: number) => void;
  /** 内容宽度变化后调用（横向） */
  setContentWidth: (w: number) => void;
  scrollToTop: () => void;
  scrollToStart: () => void;
}

/** 建一个滚动区：Mask 裁剪 + 拖拽位移。direction 默认竖向 */
export function createScrollView(
  parent: Node,
  width: number,
  height: number,
  direction: ScrollDirection = 'vertical',
): ScrollView {
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
  drag.direction = direction;

  return {
    view,
    content,
    setContentHeight: h => drag.setContentHeight(h),
    setContentWidth: w => drag.setContentWidth(w),
    scrollToTop: () => drag.scrollToTop(),
    scrollToStart: () => drag.scrollToStart(),
  };
}
