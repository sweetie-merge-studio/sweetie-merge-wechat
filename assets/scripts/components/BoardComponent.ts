import { _decorator, Color, Component, EventTouch, Graphics, Input, Node, Prefab, Tween, input, instantiate, tween, UITransform, Vec3, view } from 'cc';

import type { Cell } from '../core/types';
import { BOARD_COLS, BOARD_ROWS, BOARD_LENGTH } from '../core/board';
import { isMother } from '../data/items';
import { GameManager } from '../manager/GameManager';
import { hasOpenBundlePage } from './bundle-pages';
import { ItemComponent } from './ItemComponent';
import { createSpriteNode, UI_COLORS } from './ui-factory';

const { ccclass, property } = _decorator;

/** 矩形格子（对齐 Web 版：棋盘占满宽度，高度随屏幕自适应） */
const CELL_W = 106;
const CELL_GAP = 4;
const CELL_RADIUS = 10;
/** 木托盘图比棋盘四周各多出的边距 */
const TRAY_PADDING = 30;
/** 与 GameManager._anchorSections 的棋盘 top 锚定值保持一致 */
const BOARD_TOP_OFFSET = 630;
/** 底部导航 + 间距的预留高度 */
const NAV_RESERVE = 170;
/** Item.prefab 原始尺寸 */
const ITEM_BASE_SIZE = 88;
/** 格子描边（深棕低透明度，给平铺色块一点层次） */
const CELL_STROKE = new Color(139, 94, 60, 45);
/** 拖拽目标格高亮：橙描边 + 淡橙填充 */
const HIGHLIGHT_STROKE = new Color(240, 166, 74, 255);
const HIGHLIGHT_FILL = new Color(255, 232, 192, 90);

/**
 * 棋盘渲染组件。
 *
 * 由 8 行 × 6 列共 48 个格子节点构成，
 * 每次 board 状态变化时刷新对应格子上的 Item.prefab。
 */
@ccclass('BoardComponent')
export class BoardComponent extends Component {
  @property({ type: Prefab, tooltip: 'Item.prefab — 单个物品节点' })
  itemPrefab: Prefab | null = null;

  /** 48 个格子节点（顺序与 board 数组一致） */
  private _cellNodes: Node[] = [];

  /** 当前拖拽状态 */
  private _dragFromIdx = -1;
  private _dragItemNode: Node | null = null;

  /** 拖拽目标格高亮节点（常驻，随手指移动显隐） */
  private _highlightNode: Node | null = null;

  /** 格子高度随可视高度自适应（onLoad 时计算） */
  private _cellH = 68;
  private _itemScale = (68 - 8) / ITEM_BASE_SIZE;

  protected onLoad(): void {
    // 用可视高度（设计单位）而非 Canvas 节点高度：onLoad 早于 Widget 对齐，
    // 高屏机型 Canvas 此刻还停在 1280，直接读会把撑开的高度浪费掉
    const visibleH = view.getVisibleSize().height;
    const canvasH = visibleH > 0
      ? visibleH
      : this.node.parent?.getComponent(UITransform)?.height ?? 1280;
    const available = canvasH - BOARD_TOP_OFFSET - NAV_RESERVE;
    const raw = (available - TRAY_PADDING * 2 - (BOARD_ROWS - 1) * CELL_GAP) / BOARD_ROWS;
    this._cellH = Math.max(56, Math.min(96, Math.floor(raw)));
    this._itemScale = (this._cellH - 8) / ITEM_BASE_SIZE;
    this._buildGrid();
  }

  protected onEnable(): void {
    const gm = GameManager.instance;
    gm.events.on('board:changed', this._onBoardChanged);
    gm.events.on('board:reset', this._onBoardChanged);
    gm.events.on('save:loaded', this._onBoardChanged);
    // 全局输入监听：绕开节点命中检测（相机/适配变动后命中链路易失效），
    // 由 _cellIndexAt 自行判断触点是否落在棋盘内
    input.on(Input.EventType.TOUCH_START, this._onTouchStart, this);
    input.on(Input.EventType.TOUCH_MOVE, this._onTouchMove, this);
    input.on(Input.EventType.TOUCH_END, this._onTouchEnd, this);
    input.on(Input.EventType.TOUCH_CANCEL, this._onTouchEnd, this);
    this._render(gm.board);
  }

  protected onDisable(): void {
    const gm = GameManager.instance;
    gm.events.off('board:changed', this._onBoardChanged);
    gm.events.off('board:reset', this._onBoardChanged);
    gm.events.off('save:loaded', this._onBoardChanged);
    input.off(Input.EventType.TOUCH_START, this._onTouchStart, this);
    input.off(Input.EventType.TOUCH_MOVE, this._onTouchMove, this);
    input.off(Input.EventType.TOUCH_END, this._onTouchEnd, this);
    input.off(Input.EventType.TOUCH_CANCEL, this._onTouchEnd, this);
  }

  // --- 触摸输入：点击母体产出物品 / 拖拽物品合成 ---

  /** 触点（UI 世界坐标）→ 棋盘本地坐标 */
  private _touchToLocal(event: EventTouch): Vec3 {
    const ui = this.node.getComponent(UITransform)!;
    const pos = event.getUILocation();
    return ui.convertToNodeSpaceAR(new Vec3(pos.x, pos.y, 0));
  }

  /** 棋盘本地坐标 → 格子下标（不在棋盘内返回 -1） */
  private _cellIndexAt(local: Vec3): number {
    const totalW = BOARD_COLS * CELL_W + (BOARD_COLS - 1) * CELL_GAP;
    const totalH = BOARD_ROWS * this._cellH + (BOARD_ROWS - 1) * CELL_GAP;
    let gx = local.x + totalW / 2;
    let gy = totalH / 2 - local.y;
    // 贴边容差：点在托盘边缘附近时吸附到最近的格子（手指不会精确落在格子内）
    const tol = TRAY_PADDING + CELL_GAP;
    if (gx < -tol || gy < -tol || gx >= totalW + tol || gy >= totalH + tol) return -1;
    gx = Math.min(Math.max(gx, 0), totalW - 1);
    gy = Math.min(Math.max(gy, 0), totalH - 1);
    const col = Math.min(BOARD_COLS - 1, Math.floor(gx / (CELL_W + CELL_GAP)));
    const row = Math.min(BOARD_ROWS - 1, Math.floor(gy / (this._cellH + CELL_GAP)));
    return row * BOARD_COLS + col;
  }

  private _onTouchStart(event: EventTouch): void {
    // 分包页面开着时不吃触摸（全局输入不受页面 BlockInputEvents 拦截）
    const canvas = this.node.parent;
    if (canvas && hasOpenBundlePage(canvas)) return;
    const local = this._touchToLocal(event);
    const idx = this._cellIndexAt(local);
    console.info(`[board] touch (${local.x.toFixed(0)}, ${local.y.toFixed(0)}) -> cell ${idx}`);
    if (idx < 0) return;
    const gm = GameManager.instance;
    if (!gm.board[idx]?.itemId) return;
    this._dragFromIdx = idx;
    this._dragItemNode = this._cellNodes[idx]?.children[0] ?? null;
    this._dragItemNode?.setScale(this._itemScale * 1.15, this._itemScale * 1.15, 1);
    // 拖起的物品提到最上层，避免被相邻格子的物品盖住
    this._cellNodes[idx].setSiblingIndex(this.node.children.length - 1);
  }

  private _onTouchMove(event: EventTouch): void {
    if (this._dragFromIdx < 0 || !this._dragItemNode?.isValid) return;
    const local = this._touchToLocal(event);
    const cellPos = this._cellNodes[this._dragFromIdx].getPosition();
    this._dragItemNode.setPosition(local.x - cellPos.x, local.y - cellPos.y, 0);
    this._updateHighlight(this._cellIndexAt(local));
  }

  private _onTouchEnd(event: EventTouch): void {
    const fromIdx = this._dragFromIdx;
    this._dragFromIdx = -1;
    this._dragItemNode = null;
    if (this._highlightNode) this._highlightNode.active = false;
    if (fromIdx < 0) return;

    const gm = GameManager.instance;
    const toIdx = this._cellIndexAt(this._touchToLocal(event));
    const itemId = gm.board[fromIdx]?.itemId;

    if (toIdx === fromIdx && itemId && isMother(itemId)) {
      gm.activateMotherAt(fromIdx);
    } else if (toIdx >= 0 && toIdx !== fromIdx) {
      gm.dragMergeAt(fromIdx, toIdx);
    }
    // 无论动作是否成立都重渲染，把拖拽中的节点归位
    this._render(gm.board);
  }

  /** 构建 6×8 个空格子节点（仅一次） */
  private _buildGrid(): void {
    const ui = this.node.getComponent(UITransform) ?? this.node.addComponent(UITransform);
    const totalW = BOARD_COLS * CELL_W + (BOARD_COLS - 1) * CELL_GAP;
    const totalH = BOARD_ROWS * this._cellH + (BOARD_ROWS - 1) * CELL_GAP;
    ui.setContentSize(totalW, totalH);

    // 木托盘背景图（对齐 Web 版 .board-wrap .tray-bg）
    createSpriteNode(
      'trayBg', this.node, 0,
      totalW + TRAY_PADDING * 2, totalH + TRAY_PADDING * 2,
      'sprites/bg/board-tray',
    );

    for (let i = 0; i < BOARD_LENGTH; i++) {
      const row = Math.floor(i / BOARD_COLS);
      const col = i % BOARD_COLS;
      const cell = new Node(`cell_${i}`);
      cell.layer = this.node.layer;
      cell.addComponent(UITransform).setContentSize(CELL_W, this._cellH);
      const x = col * (CELL_W + CELL_GAP) - totalW / 2 + CELL_W / 2;
      const y = totalH / 2 - row * (this._cellH + CELL_GAP) - this._cellH / 2;
      cell.setPosition(new Vec3(x, y, 0));
      this._drawCellBackground(cell, (row + col) % 2 === 1);
      this.node.addChild(cell);
      this._cellNodes.push(cell);
    }

    this._buildHighlight();
  }

  /** 奶油白 / 浅褐棋盘格交错底色（对齐 Web 版 .cell / .cell.alt），细描边加一点层次 */
  private _drawCellBackground(cell: Node, alt: boolean): void {
    const g = cell.addComponent(Graphics);
    g.fillColor = alt ? UI_COLORS.cellAlt : UI_COLORS.cellLight;
    g.roundRect(-CELL_W / 2, -this._cellH / 2, CELL_W, this._cellH, CELL_RADIUS);
    g.fill();
    g.lineWidth = 2;
    g.strokeColor = CELL_STROKE;
    g.roundRect(-CELL_W / 2, -this._cellH / 2, CELL_W, this._cellH, CELL_RADIUS);
    g.stroke();
  }

  /** 常驻的拖拽目标格高亮节点（渲染在所有格子之上） */
  private _buildHighlight(): void {
    const node = new Node('dragHighlight');
    node.layer = this.node.layer;
    node.addComponent(UITransform).setContentSize(CELL_W, this._cellH);
    this.node.addChild(node);

    const g = node.addComponent(Graphics);
    g.fillColor = HIGHLIGHT_FILL;
    g.roundRect(-CELL_W / 2, -this._cellH / 2, CELL_W, this._cellH, CELL_RADIUS);
    g.fill();
    g.lineWidth = 4;
    g.strokeColor = HIGHLIGHT_STROKE;
    g.roundRect(-CELL_W / 2, -this._cellH / 2, CELL_W, this._cellH, CELL_RADIUS);
    g.stroke();

    node.active = false;
    this._highlightNode = node;
  }

  /** 拖拽中把高亮框对到目标格；不在拖拽或目标无效时隐藏 */
  private _updateHighlight(targetIdx: number): void {
    const node = this._highlightNode;
    if (!node) return;
    if (targetIdx < 0 || targetIdx === this._dragFromIdx) {
      node.active = false;
      return;
    }
    node.setPosition(this._cellNodes[targetIdx].getPosition());
    node.active = true;
  }

  private _onBoardChanged = (): void => {
    this._render(GameManager.instance.board);
  };

  /** 根据 board 状态刷新每个格子上的物品节点 */
  private _render(board: readonly Cell[]): void {
    for (let i = 0; i < this._cellNodes.length; i++) {
      const cellNode = this._cellNodes[i];
      const cell = board[i];
      cellNode.removeAllChildren();
      if (!cell?.itemId) continue;
      if (!this.itemPrefab) { console.warn('[BoardComponent] _render: itemPrefab is null at i=', i); continue; }

      const itemNode = instantiate(this.itemPrefab);
      itemNode.setScale(this._itemScale, this._itemScale, 1);
      cellNode.addChild(itemNode);
      const itemComp = itemNode.getComponent(ItemComponent);
      itemComp?.bind(i, cell.itemId);
    }
  }
}
