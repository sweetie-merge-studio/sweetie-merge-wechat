import { _decorator, Component, EventTouch, Graphics, Node, Prefab, instantiate, UITransform, Vec3 } from 'cc';

import type { Cell } from '../core/types';
import { BOARD_COLS, BOARD_ROWS, BOARD_LENGTH } from '../core/board';
import { isMother } from '../data/items';
import { GameManager } from '../manager/GameManager';
import { ItemComponent } from './ItemComponent';
import { createSpriteNode, UI_COLORS } from './ui-factory';

const { ccclass, property } = _decorator;

/** 矩形格子（对齐 Web 版：棋盘占满宽度、格子宽大于高） */
const CELL_W = 106;
const CELL_H = 68;
const CELL_GAP = 4;
const CELL_RADIUS = 10;
/** 木托盘图比棋盘四周各多出的边距 */
const TRAY_PADDING = 30;
/** 物品节点相对 prefab 原始尺寸（88）的缩放 */
const ITEM_SCALE = (CELL_H - 8) / 88;

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

  protected onLoad(): void {
    this._buildGrid();
  }

  protected onEnable(): void {
    const gm = GameManager.instance;
    gm.events.on('board:changed', this._onBoardChanged);
    gm.events.on('board:reset', this._onBoardChanged);
    gm.events.on('save:loaded', this._onBoardChanged);
    this.node.on(Node.EventType.TOUCH_START, this._onTouchStart, this);
    this.node.on(Node.EventType.TOUCH_MOVE, this._onTouchMove, this);
    this.node.on(Node.EventType.TOUCH_END, this._onTouchEnd, this);
    this.node.on(Node.EventType.TOUCH_CANCEL, this._onTouchEnd, this);
    this._render(gm.board);
  }

  protected onDisable(): void {
    const gm = GameManager.instance;
    gm.events.off('board:changed', this._onBoardChanged);
    gm.events.off('board:reset', this._onBoardChanged);
    gm.events.off('save:loaded', this._onBoardChanged);
    this.node.off(Node.EventType.TOUCH_START, this._onTouchStart, this);
    this.node.off(Node.EventType.TOUCH_MOVE, this._onTouchMove, this);
    this.node.off(Node.EventType.TOUCH_END, this._onTouchEnd, this);
    this.node.off(Node.EventType.TOUCH_CANCEL, this._onTouchEnd, this);
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
    const totalH = BOARD_ROWS * CELL_H + (BOARD_ROWS - 1) * CELL_GAP;
    const gx = local.x + totalW / 2;
    const gy = totalH / 2 - local.y;
    if (gx < 0 || gy < 0 || gx >= totalW + CELL_GAP || gy >= totalH + CELL_GAP) return -1;
    const col = Math.min(BOARD_COLS - 1, Math.floor(gx / (CELL_W + CELL_GAP)));
    const row = Math.min(BOARD_ROWS - 1, Math.floor(gy / (CELL_H + CELL_GAP)));
    return row * BOARD_COLS + col;
  }

  private _onTouchStart(event: EventTouch): void {
    const idx = this._cellIndexAt(this._touchToLocal(event));
    if (idx < 0) return;
    const gm = GameManager.instance;
    if (!gm.board[idx]?.itemId) return;
    this._dragFromIdx = idx;
    this._dragItemNode = this._cellNodes[idx]?.children[0] ?? null;
    this._dragItemNode?.setScale(ITEM_SCALE * 1.15, ITEM_SCALE * 1.15, 1);
  }

  private _onTouchMove(event: EventTouch): void {
    if (this._dragFromIdx < 0 || !this._dragItemNode?.isValid) return;
    const local = this._touchToLocal(event);
    const cellPos = this._cellNodes[this._dragFromIdx].getPosition();
    this._dragItemNode.setPosition(local.x - cellPos.x, local.y - cellPos.y, 0);
  }

  private _onTouchEnd(event: EventTouch): void {
    const fromIdx = this._dragFromIdx;
    this._dragFromIdx = -1;
    this._dragItemNode = null;
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
    const totalH = BOARD_ROWS * CELL_H + (BOARD_ROWS - 1) * CELL_GAP;
    ui.setContentSize(totalW, totalH);

    // 木托盘背景图（对齐 Web 版 .board-wrap .tray-bg）
    createSpriteNode(
      'trayBg', this.node, 0,
      totalW + TRAY_PADDING * 2, totalH + TRAY_PADDING * 2,
      'sprites/ui/board-tray',
    );

    for (let i = 0; i < BOARD_LENGTH; i++) {
      const row = Math.floor(i / BOARD_COLS);
      const col = i % BOARD_COLS;
      const cell = new Node(`cell_${i}`);
      cell.layer = this.node.layer;
      cell.addComponent(UITransform).setContentSize(CELL_W, CELL_H);
      const x = col * (CELL_W + CELL_GAP) - totalW / 2 + CELL_W / 2;
      const y = totalH / 2 - row * (CELL_H + CELL_GAP) - CELL_H / 2;
      cell.setPosition(new Vec3(x, y, 0));
      this._drawCellBackground(cell, (row + col) % 2 === 1);
      this.node.addChild(cell);
      this._cellNodes.push(cell);
    }
  }

  /** 奶油白 / 浅褐棋盘格交错底色（对齐 Web 版 .cell / .cell.alt） */
  private _drawCellBackground(cell: Node, alt: boolean): void {
    const g = cell.addComponent(Graphics);
    g.fillColor = alt ? UI_COLORS.cellAlt : UI_COLORS.cellLight;
    g.roundRect(-CELL_W / 2, -CELL_H / 2, CELL_W, CELL_H, CELL_RADIUS);
    g.fill();
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
      itemNode.setScale(ITEM_SCALE, ITEM_SCALE, 1);
      cellNode.addChild(itemNode);
      const itemComp = itemNode.getComponent(ItemComponent);
      itemComp?.bind(i, cell.itemId);
    }
  }
}
