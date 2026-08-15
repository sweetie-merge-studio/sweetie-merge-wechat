import { _decorator, Component, Graphics, Node, Prefab, instantiate, UITransform, Vec3 } from 'cc';

import type { Cell } from '../core/types';
import { BOARD_COLS, BOARD_ROWS, BOARD_LENGTH } from '../core/board';
import { GameManager } from '../manager/GameManager';
import { ItemComponent } from './ItemComponent';
import { createSpriteNode, UI_COLORS } from './ui-factory';

const { ccclass, property } = _decorator;

const CELL_SIZE = 96;
const CELL_GAP = 4;
const CELL_RADIUS = 10;
/** 木托盘图比棋盘四周各多出的边距 */
const TRAY_PADDING = 36;

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

  protected onLoad(): void {
    this._buildGrid();
  }

  protected onEnable(): void {
    const gm = GameManager.instance;
    gm.events.on('board:changed', this._onBoardChanged);
    gm.events.on('board:reset', this._onBoardChanged);
    gm.events.on('save:loaded', this._onBoardChanged);
    this._render(gm.board);
  }

  protected onDisable(): void {
    const gm = GameManager.instance;
    gm.events.off('board:changed', this._onBoardChanged);
    gm.events.off('board:reset', this._onBoardChanged);
    gm.events.off('save:loaded', this._onBoardChanged);
  }

  /** 构建 6×8 个空格子节点（仅一次） */
  private _buildGrid(): void {
    const ui = this.node.getComponent(UITransform) ?? this.node.addComponent(UITransform);
    const totalW = BOARD_COLS * CELL_SIZE + (BOARD_COLS - 1) * CELL_GAP;
    const totalH = BOARD_ROWS * CELL_SIZE + (BOARD_ROWS - 1) * CELL_GAP;
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
      cell.addComponent(UITransform).setContentSize(CELL_SIZE, CELL_SIZE);
      const x = col * (CELL_SIZE + CELL_GAP) - totalW / 2 + CELL_SIZE / 2;
      const y = totalH / 2 - row * (CELL_SIZE + CELL_GAP) - CELL_SIZE / 2;
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
    g.roundRect(-CELL_SIZE / 2, -CELL_SIZE / 2, CELL_SIZE, CELL_SIZE, CELL_RADIUS);
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
      cellNode.addChild(itemNode);
      const itemComp = itemNode.getComponent(ItemComponent);
      itemComp?.bind(i, cell.itemId);
    }
  }
}
