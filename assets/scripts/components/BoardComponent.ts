import { _decorator, Color, Component, EventTouch, Graphics, Input, Node, Prefab, Sprite, Tween, UIOpacity, input, instantiate, tween, UITransform, Vec3, view } from 'cc';

import type { Cell, Rarity } from '../core/types';
import { BOARD_COLS, BOARD_ROWS, BOARD_LENGTH } from '../core/board';
import { isMother, getItemById, getDisplayName, getMergeResult } from '../data/items';
import { GameManager } from '../manager/GameManager';
import { getConfig } from '../core/config';
import { hasOpenBundlePage, showPageToast } from './bundle-pages';
import { EnergyAdModal } from './EnergyAdModal';
import { ItemComponent } from './ItemComponent';
import { createSpriteNode, UI_COLORS } from './ui-factory';
import { getBoardTopOffset, NAV_RESERVE } from './layout';
import { vibrateShort, vibrateLong } from '../platform/vibrate';
import { playSfx } from '../manager/AudioManager';
import { spawnShockwave, shakeNode, spawnComboText, squashItem, shakeInvalid } from './effects-util';
import {
  getNodeRect,
  mergeRects,
  registerTutorialHandPos,
  registerTutorialTargetDynamic,
  unregisterTutorialHandPos,
  unregisterTutorialTarget,
  type TutorialHandPos,
  type TutorialTargetRect,
} from '../core/tutorial-target';

const { ccclass, property } = _decorator;

/** 矩形格子（对齐 Web 版：棋盘占满宽度，高度随屏幕自适应） */
const CELL_W = 106;
const CELL_GAP = 4;
const CELL_RADIUS = 10;
/** 木托盘图比棋盘四周各多出的边距 */
const TRAY_PADDING = 20;
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
  /** 拖拽物品的原属格子（reparent 到顶层后需要记住，结束时放回去） */
  private _dragOriginalCell: Node | null = null;
  /** 背包图标是否处于拖拽悬停态（用于缩放反馈） */
  private _backpackHovered = false;
  /** 最后一次 TOUCH_MOVE 的 UI 坐标——touchend 坐标在小游戏平台可能异常，用此兜底 */
  private _lastMoveUIPos: { x: number; y: number } | null = null;

  /** 拖拽目标格高亮节点（常驻，随手指移动显隐） */
  private _highlightNode: Node | null = null;

  /** 格子高度随可视高度自适应（onLoad 时计算） */
  private _cellH = 68;
  private _itemScale = (68 - 8) / ITEM_BASE_SIZE;

  // --- 特效系统成员 ---
  /** 合成动画播放中标志：防止动画期间重复触发合成 */
  private _mergeAnimating = false;
  /** 可合成目标发光节点（拖拽经过同类物品时显示） */
  private _mergeGlowNode: Node | null = null;
  /** 当前高亮的可合成目标格子下标 */
  private _mergeGlowIdx = -1;
  /** 背景漂浮粒子清理函数 */
  private _cleanupParticles: (() => void) | null = null;
  /** 传说/神话合成全屏闪光节点（懒建，挂在 canvas 下） */
  private _legendaryFlashNode: Node | null = null;

  /** 各稀有度粒子配置：数量、颜色、扩散距离、粒子大小、持续时间 */
  private static readonly SPARKLE_CONFIG: Record<Rarity, { count: number; color: Color; distance: number; size: number; duration: number }> = {
    common:    { count: 5,  color: new Color(255, 215, 0, 255),   distance: 22, size: 4, duration: 0.5 },
    uncommon:  { count: 6,  color: new Color(76, 175, 80, 255),   distance: 24, size: 5, duration: 0.6 },
    rare:      { count: 7,  color: new Color(33, 150, 243, 255),  distance: 28, size: 6, duration: 0.7 },
    epic:      { count: 8,  color: new Color(156, 39, 176, 255),  distance: 32, size: 6, duration: 0.8 },
    legendary: { count: 10, color: new Color(255, 215, 0, 255),   distance: 36, size: 7, duration: 0.9 },
    mythic:    { count: 12, color: new Color(255, 107, 107, 255), distance: 40, size: 8, duration: 1.0 },
  };

  protected onLoad(): void {
    this._resize();
    this._buildGrid();
  }

  protected start(): void {
    // onLoad 时可视尺寸可能还没定型（小游戏首帧仍是 720×1280 的设计值，
    // Widget 对齐也尚未跑过），此时算出的行高会偏小，命中区随之与实际格子错位。
    // start 已在首次对齐之后，尺寸变了就按真实值重排一次。
    if (this._resize()) this._relayoutGrid();
    // 启动棋盘背景漂浮粒子（在格子构建完成后）
    this._spawnBackgroundParticles();
  }

  /**
   * 按当前可视高度重算行高与物品缩放。
   * @returns 行高是否发生变化
   */
  private _resize(): boolean {
    // 用可视高度（设计单位）而非 Canvas 节点高度：onLoad 早于 Widget 对齐，
    // 高屏机型 Canvas 此刻还停在 1280，直接读会把撑开的高度浪费掉
    const visibleH = view.getVisibleSize().height;
    const canvasH = visibleH > 0
      ? visibleH
      : this.node.parent?.getComponent(UITransform)?.height ?? 1280;
    const available = canvasH - getBoardTopOffset() - NAV_RESERVE;
    const raw = (available - TRAY_PADDING * 2 - (BOARD_ROWS - 1) * CELL_GAP) / BOARD_ROWS;
    // 高度上限放宽到宽度的 1.25 倍，允许竖长方形格子填满高屏多余空间；
    // 物品缩放基于宽度（见下），格子变高不会导致物品溢出左右边界。
    const next = Math.max(56, Math.min(Math.floor(CELL_W * 1.25), Math.floor(raw)));
    if (next === this._cellH) return false;
    this._cellH = next;
    // 物品等比缩放以宽度为基准：格子再高物品也不超出左右，垂直居中上下留空
    this._itemScale = (Math.min(CELL_W, this._cellH) - 8) / ITEM_BASE_SIZE;
    return true;
  }

  /** 行高变化后重排格子、托盘和高亮框（不重建节点，只改尺寸和位置） */
  private _relayoutGrid(): void {
    const totalW = BOARD_COLS * CELL_W + (BOARD_COLS - 1) * CELL_GAP;
    const totalH = BOARD_ROWS * this._cellH + (BOARD_ROWS - 1) * CELL_GAP;
    this.node.getComponent(UITransform)?.setContentSize(totalW, totalH);

    const tray = this.node.getChildByName('trayBg');
    tray?.getComponent(UITransform)?.setContentSize(
      totalW + TRAY_PADDING * 2,
      totalH + TRAY_PADDING * 2,
    );

    for (let i = 0; i < this._cellNodes.length; i++) {
      const cell = this._cellNodes[i];
      const row = Math.floor(i / BOARD_COLS);
      const col = i % BOARD_COLS;
      cell.getComponent(UITransform)?.setContentSize(CELL_W, this._cellH);
      const x = col * (CELL_W + CELL_GAP) - totalW / 2 + CELL_W / 2;
      const y = totalH / 2 - row * (this._cellH + CELL_GAP) - this._cellH / 2;
      cell.setPosition(new Vec3(x, y, 0));
      // 重绘格子背景（旧 Graphics 的 roundRect 尺寸是旧的）
      cell.getComponent(Graphics)?.destroy();
      this._drawCellBackground(cell, (row + col) % 2 === 1);
    }

    this._highlightNode?.getComponent(UITransform)?.setContentSize(CELL_W, this._cellH);
  }

  protected onEnable(): void {
    const gm = GameManager.instance;
    gm.events.on('board:changed', this._onBoardChanged);
    gm.events.on('board:reset', this._onBoardChanged);
    gm.events.on('save:loaded', this._onBoardChanged);
    gm.events.on('fx:spawn', this._onFxSpawn);
    gm.events.on('fx:merge', this._onFxMerge);
    gm.events.on('combo:changed', this._onComboChanged);
    // 全局输入监听：绕开节点命中检测（相机/适配变动后命中链路易失效），
    // 由 _cellIndexAt 自行判断触点是否落在棋盘内
    input.on(Input.EventType.TOUCH_START, this._onTouchStart, this);
    input.on(Input.EventType.TOUCH_MOVE, this._onTouchMove, this);
    input.on(Input.EventType.TOUCH_END, this._onTouchEnd, this);
    input.on(Input.EventType.TOUCH_CANCEL, this._onTouchEnd, this);
    this._render(gm.board);

    // 注册新手引导动态目标：board-mother（母体格子）、board-merge-pair（可合并的一对）
    registerTutorialTargetDynamic('board-mother', () => this._findMotherRect());
    registerTutorialTargetDynamic('board-merge-pair', () => this._findMergePairRect());
    // 呼吸灯精确位置：指向具体可交互元素，而非包围盒任意象限
    registerTutorialHandPos('board-mother', () => this._findMotherHandPos());
    registerTutorialHandPos('board-merge-pair', () => this._findMergePairHandPos());
  }

  protected onDisable(): void {
    const gm = GameManager.instance;
    gm.events.off('board:changed', this._onBoardChanged);
    gm.events.off('board:reset', this._onBoardChanged);
    gm.events.off('save:loaded', this._onBoardChanged);
    gm.events.off('fx:spawn', this._onFxSpawn);
    gm.events.off('fx:merge', this._onFxMerge);
    gm.events.off('combo:changed', this._onComboChanged);
    input.off(Input.EventType.TOUCH_START, this._onTouchStart, this);
    input.off(Input.EventType.TOUCH_MOVE, this._onTouchMove, this);
    input.off(Input.EventType.TOUCH_END, this._onTouchEnd, this);
    input.off(Input.EventType.TOUCH_CANCEL, this._onTouchEnd, this);
    // 注销新手引导动态目标
    unregisterTutorialTarget('board-mother');
    unregisterTutorialTarget('board-merge-pair');
    unregisterTutorialHandPos('board-mother');
    unregisterTutorialHandPos('board-merge-pair');
    // 清理传说全屏闪光节点
    if (this._legendaryFlashNode?.isValid) {
      Tween.stopAllByTarget(this._legendaryFlashNode);
      this._legendaryFlashNode.destroy();
      this._legendaryFlashNode = null;
    }
    // 清理可合成目标发光
    this._clearMergeGlow();
    // 清理背景漂浮粒子
    this._cleanupParticles?.();
    this._cleanupParticles = null;
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
    if (idx < 0) return;
    const gm = GameManager.instance;
    if (!gm.board[idx]?.itemId) return;
    this._dragFromIdx = idx;
    this._dragItemNode = this._cellNodes[idx]?.children[0] ?? null;
    this._dragOriginalCell = this._cellNodes[idx] ?? null;
    this._lastMoveUIPos = null;
    if (this._dragItemNode) {
      Tween.stopAllByTarget(this._dragItemNode);
      // 提到顶层容器：确保拖拽物品渲染在背包ICON等所有UI之上
      // （物品原本是棋盘格子的子节点，棋盘在底部导航之下，永远盖不住背包图标）
      const top = this.node.parent;
      if (top) {
        const worldPos = this._dragItemNode.getWorldPosition();
        this._dragItemNode.setParent(top);
        this._dragItemNode.setWorldPosition(worldPos);
      }
      this._dragItemNode.setScale(this._itemScale * 1.15, this._itemScale * 1.15, 1);
    }
  }

  private _onTouchMove(event: EventTouch): void {
    if (this._dragFromIdx < 0 || !this._dragItemNode?.isValid) return;
    const uiPos = event.getUILocation();
    // 记录最后一次有效移动坐标，供 touchend 兜底（小游戏平台 touchend 坐标可能异常）
    this._lastMoveUIPos = { x: uiPos.x, y: uiPos.y };
    // 物品已 reparent 到顶层容器，直接用世界坐标跟随手指
    this._dragItemNode.setWorldPosition(uiPos.x, uiPos.y, 0);
    const local = this._touchToLocal(event);
    const targetIdx = this._cellIndexAt(local);
    this._updateHighlight(targetIdx);
    // 可合成目标发光检测
    this._updateMergeGlow(targetIdx);
    // 背包图标悬停反馈
    this._updateBackpackHover(event);
  }

  private _onTouchEnd(event: EventTouch): void {
    // 合成动画播放中忽略新的操作
    if (this._mergeAnimating) return;

    const fromIdx = this._dragFromIdx;
    this._dragFromIdx = -1;
    if (fromIdx < 0) return;

    const gm = GameManager.instance;

    // ── 背包命中检测：放在 reparent 之前，坐标状态最干净 ──
    // 先用 touchend 事件坐标检测；小游戏平台 touchend 坐标可能异常，
    // 失败时用最后一次 TOUCH_MOVE 的有效坐标兜底（move 阶段悬停反馈已证明该坐标命中正常）。
    let overBackpack = this._isTouchOverBackpack(event);
    let fallbackHit = false;
    if (!overBackpack && this._lastMoveUIPos) {
      fallbackHit = this._isPointOverBackpack(this._lastMoveUIPos.x, this._lastMoveUIPos.y);
      overBackpack = fallbackHit;
    }

    if (BoardComponent.BACKPACK_HIT_DEBUG) {
      const endUI = event.getUILocation();
      const endW = event.getLocation();
      console.info(
        '[backpack-end]',
        `fromIdx=${fromIdx}`,
        `endUI=(${endUI.x.toFixed(0)},${endUI.y.toFixed(0)})`,
        `endW=(${endW.x.toFixed(0)},${endW.y.toFixed(0)})`,
        `lastMove=${this._lastMoveUIPos ? `(${this._lastMoveUIPos.x.toFixed(0)},${this._lastMoveUIPos.y.toFixed(0)})` : 'null'}`,
        `eventHit=${!fallbackHit && overBackpack} fallbackHit=${fallbackHit} overBackpack=${overBackpack}`,
      );
    }

    // ── 复位拖拽节点：放回原格子，早于任何 return 分支 ──
    if (this._dragItemNode?.isValid && this._dragOriginalCell?.isValid) {
      this._dragItemNode.setParent(this._dragOriginalCell);
      this._dragItemNode.setPosition(0, 0, 0);
      this._dragItemNode.setScale(this._itemScale, this._itemScale, 1);
    }
    this._dragItemNode = null;
    this._dragOriginalCell = null;
    this._lastMoveUIPos = null;

    // 清除背包图标悬停态
    this._updateBackpackHover(null);

    if (this._highlightNode) this._highlightNode.active = false;
    // 清理可合成目标发光
    this._clearMergeGlow();

    // ── 存入背包 ──
    if (overBackpack) {
      const itemId = gm.board[fromIdx]?.itemId;
      if (BoardComponent.BACKPACK_HIT_DEBUG) {
        console.info('[backpack-store]', `overBackpack=true itemId=${itemId ?? 'null'} fromIdx=${fromIdx}`, `backpackItems=${gm.backpack.items.length}/${gm.backpack.unlockedSlots}`);
      }
      if (itemId) {
        const ok = gm.storeToBackpack(fromIdx);
        if (BoardComponent.BACKPACK_HIT_DEBUG) {
          console.info('[backpack-store]', `storeToBackpack result=${ok}`, `after: backpackItems=${gm.backpack.items.length} boardItem=${gm.board[fromIdx]?.itemId ?? 'empty'}`);
        }
        if (ok) {
          const canvas = this.node.parent;
          if (canvas) showPageToast(canvas, `${getDisplayName(itemId)} 已收入背包`);
        } else {
          const canvas = this.node.parent;
          if (canvas) showPageToast(canvas, '背包已满，先解锁格子或取出物品');
        }
      }
      return;
    }

    const toIdx = this._cellIndexAt(this._touchToLocal(event));
    const itemId = gm.board[fromIdx]?.itemId;

    if (toIdx === fromIdx && itemId && isMother(itemId)) {
      // 母体产出：先播放挤压动画，再执行产出
      const motherNode = this._cellNodes[fromIdx]?.children[0];
      if (motherNode) {
        squashItem(motherNode, this._itemScale, 0.22);
      }
      // 延迟一帧执行产出，让挤压动画先开始
      setTimeout(() => {
        if (!this.node.isValid) return;
        if (!gm.activateMotherAt(fromIdx)) this._toastMotherFailure(gm);
      }, 60);
    } else if (toIdx >= 0 && toIdx !== fromIdx) {
      // 判断是否可合成：两个格子物品相同且非母体
      const fromItemId = gm.board[fromIdx]?.itemId;
      const toItemId = gm.board[toIdx]?.itemId;
      const canMerge = fromItemId && toItemId && !isMother(fromItemId) && !isMother(toItemId)
        && getMergeResult(fromItemId, toItemId);

      if (canMerge) {
        // 可合成：先播放吸引靠拢动画，动画结束后再执行合成
        this._playMergeAttraction(fromIdx, toIdx, () => {
          if (!this.node.isValid) return;
          gm.dragMergeAt(fromIdx, toIdx);
        });
      } else {
        // 不可合成：直接交换（或无效操作抖动）
        const hasItem = !!(fromItemId && toItemId);
        gm.dragMergeAt(fromIdx, toIdx);
        // 两个不同物品交换时，给目标物品一个轻微抖动反馈
        if (hasItem) {
          const targetNode = this._cellNodes[toIdx]?.children[0];
          if (targetNode) shakeInvalid(targetNode, 4, 0.2);
        }
      }
    }
    // 注意：不手动调 _render——操作成功时 board:changed 事件会触发 _render；
    // 操作失败（拖到自己/拖出棋盘）时拖拽节点已在上方复位。
  }

  /**
   * 母棋产出失败的反馈。
   * 判定顺序与 core/board.ts 的 activateMother 一致：先看有没有空位，再看精力。
   * 棋盘满只能靠玩家自己腾格子，精力不足则可以看广告补上，直接弹广告弹窗。
   */
  private _toastMotherFailure(gm: GameManager): void {
    const canvas = this.node.parent;
    if (!canvas) return;
    if (gm.board.every(c => c.itemId)) {
      showPageToast(canvas, '棋盘满了，先合成或交付订单腾出格子');
      return;
    }
    if (!EnergyAdModal.show(canvas)) {
      showPageToast(canvas, `精力不足，需要 ${getConfig().energy.motherCost} 点`);
    }
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

  // --- 特效事件回调 ---

  /** 产出：从 0 弹到正常大小 */
  private _onFxSpawn = (idx: number): void => {
    this._popItem(idx, 0.05);
  };

  /** 合成：从小弹出 + backOut 过冲（对齐 Web 版 merge-pop: 0.5→1.12→1） */
  private _onFxMerge = (idx: number, itemId?: string): void => {
    this._popItem(idx, 0.5);
    if (itemId) {
      this._spawnMergeSparkles(idx, itemId);
      const def = getItemById().get(itemId as any);
      const rarity: Rarity = def?.rarity ?? 'common';

      // 振动反馈：传说/神话级用长振动，其余用短振动
      if (rarity === 'legendary' || rarity === 'mythic') {
        vibrateLong();
      } else {
        vibrateShort();
      }

      // 连击衰减：连续合成越多，后续动画动静越小，避免刷屏式震动
      // comboCount 是上一轮合成后的值（fx:merge 在 _updateCombo 之前触发），
      // 所以 comboCount=0 是首次合成，comboCount>=3 是第4次及以后连击
      const combo = GameManager.instance.comboCount;
      const decay = combo >= 4 ? 0.4 : combo >= 2 ? 0.65 : combo >= 1 ? 0.85 : 1.0;

      // 环形冲击波：稀有及以上触发，半径随连击衰减
      if (rarity === 'rare' || rarity === 'epic' || rarity === 'legendary' || rarity === 'mythic') {
        const cellNode = this._cellNodes[idx];
        if (cellNode) {
          const baseRadius = rarity === 'legendary' || rarity === 'mythic' ? 60 : 44;
          spawnShockwave(
            cellNode,
            new Vec3(0, 0, 0),
            BoardComponent.SPARKLE_CONFIG[rarity].color,
            Math.round(baseRadius * decay),
            rarity === 'legendary' || rarity === 'mythic' ? 0.7 : 0.5,
            Math.max(1, Math.round(3 * decay)),
          );
        }
        // 稀有物品登场闪烁：只在前两次连击触发，后续连击不再重复闪烁
        if (combo < 2) {
          this._spawnRareItemFlash(idx, rarity);
        }
      }

      // 屏幕震动：史诗及以上触发，强度随连击衰减；高连击完全跳过避免头晕
      if ((rarity === 'epic' || rarity === 'legendary' || rarity === 'mythic') && combo < 3) {
        const baseIntensity = rarity === 'legendary' || rarity === 'mythic' ? 6 : 3;
        const baseDuration = rarity === 'legendary' || rarity === 'mythic' ? 0.35 : 0.2;
        shakeNode(this.node, baseIntensity * decay, baseDuration * decay);
      }

      // 连击增强：高连击时额外触发一次金色冲击波（不叠加震动，避免动静过大）
      if (combo >= 2) {
        const cellNode = this._cellNodes[idx];
        if (cellNode) {
          setTimeout(() => {
            if (!cellNode.isValid) return;
            spawnShockwave(
              cellNode,
              new Vec3(0, 0, 0),
              new Color(255, 193, 7, 255),
              Math.round((40 + combo * 2) * decay),
              0.4,
              2,
            );
          }, 80);
        }
      }
    } else {
      vibrateShort();
    }
  };

  private _popItem(idx: number, fromRatio: number): void {
    const itemNode = this._cellNodes[idx]?.children[0];
    if (!itemNode?.isValid) return;
    const s = this._itemScale;
    itemNode.setScale(s * fromRatio, s * fromRatio, 1);
    tween(itemNode)
      .to(0.22, { scale: new Vec3(s, s, 1) }, { easing: 'backOut' })
      .start();
  }

  /** 连击变化回调：在屏幕中央弹出连击文字，高连击播放额外音效 */
  private _onComboChanged = (combo: number): void => {
    if (combo < 2) return;
    const canvas = this.node.parent;
    if (!canvas) return;
    // 连击文字显示在棋盘上方
    const boardWorldPos = this.node.getWorldPosition();
    const pos = new Vec3(boardWorldPos.x, boardWorldPos.y + 80, 0);
    spawnComboText(canvas, combo, pos);

    // 高连击音效：档位越高音效越华丽
    if (combo >= 10) {
      playSfx('level_up');
    } else if (combo >= 5) {
      playSfx('sparkle');
    } else if (combo >= 3) {
      playSfx('reward');
    }
  };

  // --- 合成粒子特效（按稀有度分档）---

  /** 合成时在目标格子生成粒子爆发 */
  private _spawnMergeSparkles(idx: number, itemId: string): void {
    const cellNode = this._cellNodes[idx];
    if (!cellNode) return;
    const def = getItemById().get(itemId as any);
    const rarity: Rarity = def?.rarity ?? 'common';
    const cfg = BoardComponent.SPARKLE_CONFIG[rarity] ?? BoardComponent.SPARKLE_CONFIG.common;

    for (let i = 0; i < cfg.count; i++) {
      // 均匀分布角度 + 少量随机扰动，避免粒子排成完美圆环
      const baseAngle = (i / cfg.count) * Math.PI * 2;
      const jitter = (Math.random() - 0.5) * 0.4;
      const angle = baseAngle + jitter;
      const dist = cfg.distance * (0.7 + Math.random() * 0.6);

      const node = new Node('sparkle');
      node.layer = this.node.layer;
      const g = node.addComponent(Graphics);
      g.fillColor = cfg.color;
      g.circle(0, 0, cfg.size);
      g.fill();
      cellNode.addChild(node);
      node.setPosition(0, 0, 0);
      node.setScale(0.3, 0.3, 1);

      const dx = Math.cos(angle) * dist;
      const dy = Math.sin(angle) * dist;
      const expandTime = Math.min(0.15, cfg.duration * 0.3);
      const flyTime = cfg.duration - expandTime;

      tween(node)
        .to(expandTime, { scale: new Vec3(1.3, 1.3, 1) }, { easing: 'backOut' })
        .to(flyTime, {
          position: new Vec3(dx, dy, 0),
          scale: new Vec3(0.1, 0.1, 1),
        }, { easing: 'quadOut' })
        .call(() => { if (node.isValid) node.destroy(); })
        .start();
    }

    // 稀有及以上：金色光环（一个快速扩散的圆）
    if (rarity === 'rare' || rarity === 'epic' || rarity === 'legendary' || rarity === 'mythic') {
      this._spawnHalo(cellNode, cfg.color, rarity === 'legendary' || rarity === 'mythic' ? 56 : 40, cfg.duration * 0.8);
    }

    // 传说/神话：全屏闪光
    if (rarity === 'legendary' || rarity === 'mythic') {
      this._triggerLegendaryFlash();
    }
  }

  /** 稀有合成金色光环：从中心扩散（描边圆环，放在物品下方，带淡出） */
  private _spawnHalo(parent: Node, color: Color, size: number, duration: number): void {
    const node = new Node('halo');
    node.layer = parent.layer;
    node.addComponent(UITransform).setContentSize(size * 2, size * 2);
    const g = node.addComponent(Graphics);
    g.lineWidth = 3;
    g.strokeColor = new Color(color.r, color.g, color.b, 180);
    g.circle(0, 0, size * 0.3);
    g.stroke();
    parent.addChild(node);
    node.setPosition(0, 0, 0);
    node.setSiblingIndex(0);
    node.setScale(0.3, 0.3, 1);

    const op = node.addComponent(UIOpacity);
    op.opacity = 220;

    // 单条 tween：快速放大到 1.2，再缓慢放大到 2.2（越大约淡），最后销毁
    tween(node)
      .to(duration * 0.4, { scale: new Vec3(1.2, 1.2, 1) }, {
        easing: 'quadOut',
        onUpdate: (_t, ratio) => { op.opacity = Math.round(220 * (1 - ratio * 0.3)); },
      })
      .to(duration * 0.6, { scale: new Vec3(2.2, 2.2, 1) }, {
        easing: 'sineOut',
        onUpdate: (_t, ratio) => { op.opacity = Math.round(154 * (1 - ratio)); },
      })
      .call(() => { if (node.isValid) node.destroy(); })
      .start();
  }

  /** 传说合成全屏闪光：金色径向渐变覆盖，0.5s 淡出 */
  private _triggerLegendaryFlash(): void {
    const canvas = this.node.parent;
    if (!canvas) return;

    // 懒建：复用同一个节点，避免频繁创建销毁
    if (!this._legendaryFlashNode || !this._legendaryFlashNode.isValid) {
      const node = new Node('legendaryFlash');
      node.layer = canvas.layer;
      const ui = node.addComponent(UITransform);
      const canvasUi = canvas.getComponent(UITransform);
      ui.setContentSize(canvasUi ? canvasUi.width + 200 : 900, canvasUi ? canvasUi.height + 200 : 1600);
      const g = node.addComponent(Graphics);
      // 用多层同心圆模拟径向渐变（中心亮、边缘透明）
      for (let r = 0; r < 8; r++) {
        const radius = 50 + r * 80;
        const alpha = Math.max(0, 180 - r * 22);
        g.fillColor = new Color(255, 215, 0, alpha);
        g.circle(0, 0, radius);
        g.fill();
      }
      canvas.addChild(node);
      node.setPosition(0, 0, 0);
      this._legendaryFlashNode = node;
    }

    const flash = this._legendaryFlashNode;
    flash.active = true;
    flash.setScale(0.8, 0.8, 1);
    Tween.stopAllByTarget(flash);
    tween(flash)
      .to(0.15, { scale: new Vec3(1.1, 1.1, 1) }, { easing: 'quadOut' })
      .delay(0.1)
      .to(0.25, { scale: new Vec3(1.4, 1.4, 1) }, { easing: 'sineIn' })
      .call(() => { flash.active = false; })
      .start();
  }

  /**
   * 稀有物品登场闪烁：合成出 rare 及以上物品时，物品闪一下 + 3 层涟漪圆环依次扩散，
   * 持续约 0.8 秒后恢复正常，非常驻效果。圆环放在物品下方，不遮盖物品本身。
   */
  private _spawnRareItemFlash(idx: number, rarity: Rarity): void {
    const itemNode = this._cellNodes[idx]?.children[0];
    const cellNode = this._cellNodes[idx];
    if (!itemNode?.isValid || !cellNode) return;

    const colors: Record<string, Color> = {
      rare: new Color(33, 150, 243, 255),
      epic: new Color(156, 39, 176, 255),
      legendary: new Color(255, 215, 0, 255),
      mythic: new Color(255, 107, 107, 255),
    };
    const color = colors[rarity] ?? colors.rare;
    const baseSize = ITEM_BASE_SIZE * this._itemScale;

    // 1. 物品本身闪烁 3 次（透明度快速变化，模拟白光扫过）
    const op = itemNode.getComponent(UIOpacity) ?? itemNode.addComponent(UIOpacity);
    const baseOpacity = op.opacity;
    tween(itemNode)
      .delay(0.08)
      .to(0.06, {}, { onUpdate: () => { op.opacity = 80; } })
      .to(0.06, {}, { onUpdate: () => { op.opacity = baseOpacity; } })
      .to(0.06, {}, { onUpdate: () => { op.opacity = 120; } })
      .to(0.06, {}, { onUpdate: () => { op.opacity = baseOpacity; } })
      .to(0.08, {}, { onUpdate: () => { op.opacity = 160; } })
      .to(0.08, {}, { onUpdate: () => { op.opacity = baseOpacity; } })
      .start();

    // 2. 三层涟漪圆环：从内到外依次扩散，线宽递减，颜色从稀有度色过渡到白色
    const ringDefs = [
      { size: baseSize * 1.2, lineWidth: 5, delay: 0,    dur: 0.45, alpha: 230, whiteMix: 0 },
      { size: baseSize * 1.5, lineWidth: 3, delay: 0.06, dur: 0.5,  alpha: 180, whiteMix: 0.3 },
      { size: baseSize * 1.9, lineWidth: 2, delay: 0.12, dur: 0.55, alpha: 140, whiteMix: 0.6 },
    ];

    for (const def of ringDefs) {
      const ring = new Node('rareRing');
      ring.layer = cellNode.layer;
      ring.addComponent(UITransform).setContentSize(def.size, def.size);
      cellNode.addChild(ring);
      ring.setPosition(0, 0, 0);
      ring.setSiblingIndex(0);

      const r = Math.round(color.r + (255 - color.r) * def.whiteMix);
      const g = Math.round(color.g + (255 - color.g) * def.whiteMix);
      const b = Math.round(color.b + (255 - color.b) * def.whiteMix);

      const graphics = ring.addComponent(Graphics);
      graphics.lineWidth = def.lineWidth;
      graphics.strokeColor = new Color(r, g, b, def.alpha);
      graphics.circle(0, 0, def.size / 2);
      graphics.stroke();

      const ringOp = ring.addComponent(UIOpacity);
      ringOp.opacity = 0;
      ring.setScale(0.3, 0.3, 1);

      tween(ring)
        .delay(def.delay)
        .to(0.12, { scale: new Vec3(1.0, 1.0, 1) }, {
          easing: 'quadOut',
          onUpdate: (_t, ratio) => { ringOp.opacity = Math.round(def.alpha * ratio); },
        })
        .to(def.dur, { scale: new Vec3(1.5, 1.5, 1) }, {
          easing: 'sineOut',
          onUpdate: (_t, ratio) => { ringOp.opacity = Math.round(def.alpha * (1 - ratio)); },
        })
        .call(() => { if (ring.isValid) ring.destroy(); })
        .start();
    }

    // 3. 传说/神话额外加一次白色爆闪（更强烈的登场感，但只闪一下）
    if (rarity === 'legendary' || rarity === 'mythic') {
      const burst = new Node('rareBurst');
      burst.layer = cellNode.layer;
      const burstSize = baseSize * 1.6;
      burst.addComponent(UITransform).setContentSize(burstSize, burstSize);
      cellNode.addChild(burst);
      burst.setPosition(0, 0, 0);
      burst.setSiblingIndex(0);

      const bg = burst.addComponent(Graphics);
      bg.lineWidth = 6;
      bg.strokeColor = new Color(255, 255, 255, 240);
      bg.circle(0, 0, burstSize / 2);
      bg.stroke();

      const burstOp = burst.addComponent(UIOpacity);
      burstOp.opacity = 0;
      burst.setScale(0.5, 0.5, 1);

      tween(burst)
        .delay(0.1)
        .to(0.08, { scale: new Vec3(1.1, 1.1, 1) }, {
          easing: 'quadOut',
          onUpdate: (_t, ratio) => { burstOp.opacity = Math.round(240 * ratio); },
        })
        .to(0.3, { scale: new Vec3(1.7, 1.7, 1) }, {
          easing: 'sineOut',
          onUpdate: (_t, ratio) => { burstOp.opacity = Math.round(240 * (1 - ratio)); },
        })
        .call(() => { if (burst.isValid) burst.destroy(); })
        .start();
    }
  }

  // --- 合成吸引靠拢动画 ---

  /**
   * 合成吸引靠拢动画：两个物品快速向目标格中心移动并缩小，
   * 动画结束后调用 callback 执行实际合成（触发 board:changed + fx:merge）。
   */
  private _playMergeAttraction(fromIdx: number, toIdx: number, callback: () => void): void {
    const fromNode = this._cellNodes[fromIdx]?.children[0];
    const toNode = this._cellNodes[toIdx]?.children[0];
    if (!fromNode || !toNode) {
      callback();
      return;
    }

    this._mergeAnimating = true;
    const s = this._itemScale;
    const duration = 0.14;

    // 两个物品都向目标格中心靠拢，同时缩小
    // fromNode 在 fromCell 坐标系内，需要移动到 toCell 中心的偏移量
    const fromCellPos = this._cellNodes[fromIdx].position;
    const toCellPos = this._cellNodes[toIdx].position;
    const dx = toCellPos.x - fromCellPos.x;
    const dy = toCellPos.y - fromCellPos.y;

    // fromNode 移动到 toNode 位置（在 fromCell 坐标系内的偏移）
    tween(fromNode)
      .to(duration, {
        position: new Vec3(dx, dy, 0),
        scale: new Vec3(s * 0.3, s * 0.3, 1),
      }, { easing: 'quadIn' })
      .start();

    // toNode 轻微缩小，模拟被吸引
    tween(toNode)
      .to(duration, { scale: new Vec3(s * 0.4, s * 0.4, 1) }, { easing: 'quadIn' })
      .start();

    // 动画结束后执行合成
    setTimeout(() => {
      this._mergeAnimating = false;
      callback();
    }, duration * 1000 + 20);
  }

  // --- 可合成目标发光 ---

  /**
   * 更新可合成目标发光：拖拽经过相同物品时，目标物品发出淡色光晕+轻微抖动，
   * 明确告诉玩家"这里可以合"。经过不同物品则不发光。
   */
  private _updateMergeGlow(targetIdx: number): void {
    if (targetIdx < 0 || targetIdx === this._dragFromIdx) {
      this._clearMergeGlow();
      return;
    }

    const gm = GameManager.instance;
    const fromItemId = gm.board[this._dragFromIdx]?.itemId;
    const toItemId = gm.board[targetIdx]?.itemId;
    const canMerge = fromItemId && toItemId && !isMother(fromItemId) && !isMother(toItemId)
      && getMergeResult(fromItemId, toItemId);

    if (!canMerge) {
      this._clearMergeGlow();
      return;
    }

    // 同一个目标格已发光，不用重建
    if (this._mergeGlowIdx === targetIdx && this._mergeGlowNode?.isValid) return;

    this._clearMergeGlow();
    this._mergeGlowIdx = targetIdx;

    const cellNode = this._cellNodes[targetIdx];
    if (!cellNode) return;

    // 创建发光光晕：半透明圆，缓慢呼吸
    const glow = new Node('mergeGlow');
    glow.layer = cellNode.layer;
    const glowSize = ITEM_BASE_SIZE * this._itemScale * 1.6;
    glow.addComponent(UITransform).setContentSize(glowSize, glowSize);
    cellNode.addChild(glow);
    glow.setPosition(0, 0, 0);

    const g = glow.addComponent(Graphics);
    g.fillColor = new Color(255, 215, 0, 70);
    g.circle(0, 0, glowSize / 2);
    g.fill();

    const op = glow.addComponent(UIOpacity);
    op.opacity = 120;
    glow.setScale(0.8, 0.8, 1);

    // 呼吸动画：缩放 + 透明度
    tween(glow)
      .repeatForever(
        tween()
          .to(0.5, { scale: new Vec3(1.1, 1.1, 1) }, {
            easing: 'sineInOut',
            onUpdate: (_t, ratio) => { op.opacity = Math.round(120 + 80 * ratio); },
          })
          .to(0.5, { scale: new Vec3(0.8, 0.8, 1) }, {
            easing: 'sineInOut',
            onUpdate: (_t, ratio) => { op.opacity = Math.round(200 - 80 * ratio); },
          }),
      )
      .start();

    // 目标物品轻微抖动
    const targetItem = cellNode.children[0];
    if (targetItem) {
      const baseX = targetItem.position.x;
      let shakeT = 0;
      const shakeInterval = setInterval(() => {
        if (!glow.isValid || !targetItem.isValid) {
          clearInterval(shakeInterval);
          return;
        }
        shakeT += 1;
        const dir = shakeT % 2 === 0 ? 1 : -1;
        targetItem.setPosition(baseX + dir * 2, targetItem.position.y, targetItem.position.z);
      }, 80);
      // 保存 interval ID 以便清理
      (glow as any)._shakeInterval = shakeInterval;
    }

    this._mergeGlowNode = glow;
  }

  /** 清理可合成目标发光 */
  private _clearMergeGlow(): void {
    if (this._mergeGlowNode?.isValid) {
      const interval = (this._mergeGlowNode as any)._shakeInterval;
      if (interval) clearInterval(interval);
      Tween.stopAllByTarget(this._mergeGlowNode);
      this._mergeGlowNode.destroy();
    }
    this._mergeGlowNode = null;
    this._mergeGlowIdx = -1;
  }

  // --- 拖拽进背包 ---

  /** 临时排障开关：开启后在控制台打印背包命中检测的详细坐标，定位坐标系不一致问题 */
  private static readonly BACKPACK_HIT_DEBUG = false;

  /**
   * 获取背包命中目标节点（tab_backpack 下的 hitArea，取不到回退 icon）。
   */
  private _getBackpackHitTarget(): { node: Node; ui: UITransform } | null {
    const nav = this.node.parent?.getChildByName('BottomNav');
    const tab = nav?.getChildByName('tab_backpack');
    const target = tab?.getChildByName('hitArea') ?? tab?.getChildByName('icon');
    if (!target) return null;
    const ui = target.getComponent(UITransform);
    if (!ui) return null;
    return { node: target, ui };
  }

  /**
   * 单坐标点是否落在目标节点矩形内——用三种方式并行检测，任一命中即算。
   *
   * 与 TapZoneComponent._hit 同构：FIXED_WIDTH 适配下 getUILocation / getLocation
   * 与节点 worldPosition 可能坐标系不一致，单种方式会漏判，必须多方式兜底。
   */
  private _pointInNodeRect(px: number, py: number, node: Node, ui: UITransform): boolean {
    // 方式 A：convertToNodeSpaceAR（锚点感知的本地坐标）
    const local = ui.convertToNodeSpaceAR(new Vec3(px, py, 0));
    const hitA = local.x >= -ui.anchorX * ui.width
      && local.x <= (1 - ui.anchorX) * ui.width
      && local.y >= -ui.anchorY * ui.height
      && local.y <= (1 - ui.anchorY) * ui.height;

    // 方式 B：手动世界矩形（不依赖 convertToNodeSpaceAR）
    const wp = node.worldPosition;
    const scale = node.worldScale;
    const w = ui.width * scale.x;
    const h = ui.height * scale.y;
    const left = wp.x - ui.anchorX * w;
    const bottom = wp.y - ui.anchorY * h;
    const hitB = px >= left && px <= left + w && py >= bottom && py <= bottom + h;

    // 方式 C：引擎内置 getBoundingBoxToWorld（与渲染同一条世界变换管线，最可靠）
    let hitC = false;
    try {
      const box = ui.getBoundingBoxToWorld();
      hitC = px >= box.x && px <= box.x + box.width && py >= box.y && py <= box.y + box.height;
    } catch {
      // 节点未激活/无父节点时可能抛错，静默降级
    }

    return hitA || hitB || hitC;
  }

  /**
   * 原始坐标点是否落在背包图标命中区内（内部走三种检测方式，任一命中即算）。
   * 供 _isTouchOverBackpack 和 touchend 兜底（最后一次 move 坐标）共用。
   */
  private _isPointOverBackpack(x: number, y: number): boolean {
    const target = this._getBackpackHitTarget();
    if (!target) return false;
    const { node, ui } = target;
    return this._pointInNodeRect(x, y, node, ui);
  }

  /**
   * 触摸事件是否落在背包图标命中区内。
   * 同时用 getUILocation() 和 getLocation() 两种坐标口径，每种口径走三种检测方式，
   * 共 6 种组合任一命中即算——彻底覆盖 FIXED_WIDTH 适配下的坐标系不一致问题。
   */
  private _isTouchOverBackpack(event: EventTouch): boolean {
    const posUI = event.getUILocation();
    const posW = event.getLocation();

    const hitUI = this._isPointOverBackpack(posUI.x, posUI.y);
    const hitW = this._isPointOverBackpack(posW.x, posW.y);

    if (BoardComponent.BACKPACK_HIT_DEBUG) {
      const target = this._getBackpackHitTarget();
      console.info(
        '[backpack-hit]',
        `ui=(${posUI.x.toFixed(0)},${posUI.y.toFixed(0)}) hitUI=${hitUI}`,
        `world=(${posW.x.toFixed(0)},${posW.y.toFixed(0)}) hitW=${hitW}`,
        target ? `nodeWorld=(${target.node.worldPosition.x.toFixed(0)},${target.node.worldPosition.y.toFixed(0)}) size=${target.ui.width}x${target.ui.height}` : 'target=null',
      );
    }

    return hitUI || hitW;
  }

  /** 背包图标悬停缩放反馈：拖到背包上方时图标放大，离开/结束时恢复 */
  private _updateBackpackHover(event: EventTouch | null): void {
    const nav = this.node.parent?.getChildByName('BottomNav');
    const icon = nav?.getChildByName('tab_backpack')?.getChildByName('icon');
    if (!icon) return;
    const hovered = event ? this._isTouchOverBackpack(event) : false;
    if (hovered === this._backpackHovered) return;
    this._backpackHovered = hovered;
    const s = hovered ? 1.15 : 1.0;
    icon.setScale(s, s, 1);
  }

  /** 获取指定格子的世界坐标（供订单交付动画等外部组件使用） */
  getCellWorldPosition(idx: number): Vec3 | null {
    const cell = this._cellNodes[idx];
    if (!cell?.isValid) return null;
    return cell.getWorldPosition();
  }

  // --- 母体呼吸浮动 ---

  /** 母体呼吸浮动（循环） */
  private _startMotherPulse(itemNode: Node): void {
    const s = this._itemScale;
    tween(itemNode)
      .repeatForever(
        tween()
          .to(1.1, { scale: new Vec3(s * 1.05, s * 1.05, 1) }, { easing: 'sineInOut' })
          .to(1.1, { scale: new Vec3(s, s, 1) }, { easing: 'sineInOut' }),
      )
      .start();
  }

  // --- 背景漂浮粒子 ---

  /** 生成棋盘背景漂浮粒子：缓慢上浮的彩色光点，半透明，不干扰操作 */
  private _spawnBackgroundParticles(): void {
    if (this._cleanupParticles) return;

    const container = new Node('bgParticles');
    container.layer = this.node.layer;
    this.node.addChild(container);
    container.setSiblingIndex(1); // 在 trayBg 之上、格子之下

    const ui = this.node.getComponent(UITransform)!;
    const areaW = ui.width;
    const areaH = ui.height;

    const colors = [
      new Color(255, 215, 0, 50),
      new Color(255, 182, 193, 50),
      new Color(173, 216, 230, 50),
      new Color(144, 238, 144, 50),
      new Color(221, 160, 221, 50),
    ];

    const particles: Node[] = [];
    const count = 14;

    for (let i = 0; i < count; i++) {
      const node = new Node('bgParticle');
      node.layer = container.layer;
      const size = 2 + Math.random() * 4;
      node.addComponent(UITransform).setContentSize(size, size);
      const x = (Math.random() - 0.5) * areaW;
      const startY = (Math.random() - 0.5) * areaH;
      node.setPosition(x, startY, 0);
      container.addChild(node);

      const g = node.addComponent(Graphics);
      const color = colors[Math.floor(Math.random() * colors.length)];
      g.fillColor = color;
      g.circle(0, 0, size / 2);
      g.fill();

      const op = node.addComponent(UIOpacity);
      op.opacity = 0;

      const riseSpeed = 6 + Math.random() * 10;
      const swayAmplitude = 4 + Math.random() * 8;
      const swaySpeed = 0.3 + Math.random() * 0.5;
      const phase = Math.random() * Math.PI * 2;
      const lifetime = (areaH + 40) / riseSpeed;

      // 用 tween 循环：淡入 → 上升 → 淡出 → 重置
      const animate = () => {
        if (!node.isValid) return;
        const resetY = -areaH / 2 - 20;
        const resetX = (Math.random() - 0.5) * areaW;
        node.setPosition(resetX, resetY, 0);
        op.opacity = 0;
        tween(node)
          .to(0.8, {}, {
            onUpdate: (_t, ratio) => { op.opacity = Math.round(color.a * ratio); },
          })
          .to(lifetime, {}, {
            onUpdate: (_t, ratio) => {
              const curY = resetY + (areaH + 40) * ratio;
              const sway = Math.sin(phase + ratio * Math.PI * 2 * swaySpeed) * swayAmplitude;
              node.setPosition(resetX + sway, curY, 0);
            },
          })
          .to(0.8, {}, {
            onUpdate: (_t, ratio) => { op.opacity = Math.round(color.a * (1 - ratio)); },
          })
          .call(animate)
          .start();
      };
      // 错开启动时间
      setTimeout(animate, i * 300);
      particles.push(node);
    }

    this._cleanupParticles = () => {
      for (const p of particles) {
        if (p.isValid) {
          Tween.stopAllByTarget(p);
          p.destroy();
        }
      }
      if (container.isValid) container.destroy();
    };
  }

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
      // 母体呼吸浮动
      if (isMother(cell.itemId)) this._startMotherPulse(itemNode);
    }
  }

  // --- 新手引导目标定位 ---

  /** 找到棋盘上第一个母体格子的世界坐标矩形 */
  private _findMotherRect(): TutorialTargetRect | null {
    const gm = GameManager.instance;
    for (let i = 0; i < gm.board.length; i++) {
      const itemId = gm.board[i]?.itemId;
      if (itemId && isMother(itemId)) {
        return getNodeRect(this._cellNodes[i]);
      }
    }
    return null;
  }

  /** 找到棋盘上第一对可合并物品的世界坐标包围盒 */
  private _findMergePairRect(): TutorialTargetRect | null {
    const gm = GameManager.instance;
    const seen = new Map<string, number>();
    for (let i = 0; i < gm.board.length; i++) {
      const itemId = gm.board[i]?.itemId;
      if (!itemId || isMother(itemId)) continue;
      if (seen.has(itemId)) {
        const j = seen.get(itemId)!;
        return mergeRects([getNodeRect(this._cellNodes[j]), getNodeRect(this._cellNodes[i])]);
      }
      seen.set(itemId, i);
    }
    return null;
  }

  /** 母体呼吸灯位置：母体格子中心（点一点母体的指引） */
  private _findMotherHandPos(): TutorialHandPos | null {
    const gm = GameManager.instance;
    for (let i = 0; i < gm.board.length; i++) {
      const itemId = gm.board[i]?.itemId;
      if (itemId && isMother(itemId)) {
        const rect = getNodeRect(this._cellNodes[i]);
        return rect ? { x: rect.x, y: rect.y } : null;
      }
    }
    return null;
  }

  /** 合并对呼吸灯位置：第一个物品格子中心（拖拽起点，指引玩家从这里拖起） */
  private _findMergePairHandPos(): TutorialHandPos | null {
    const gm = GameManager.instance;
    const seen = new Map<string, number>();
    for (let i = 0; i < gm.board.length; i++) {
      const itemId = gm.board[i]?.itemId;
      if (!itemId || isMother(itemId)) continue;
      if (seen.has(itemId)) {
        const j = seen.get(itemId)!;
        const rect = getNodeRect(this._cellNodes[j]);
        return rect ? { x: rect.x, y: rect.y } : null;
      }
      seen.set(itemId, i);
    }
    return null;
  }
}
