import { _decorator, Color, Component, Graphics, Label, Node, Sprite, UITransform, Vec3 } from 'cc';

import { GameManager } from '../../scripts/manager/GameManager';
import { showPageToast } from '../../scripts/components/bundle-pages';
import { drawDashedRoundRect, resizeModalPanel } from '../../scripts/components/modal-chrome';
import { loadSpriteFrame, applySpriteFrame } from '../../scripts/components/sprite-loader';
import { TapZoneComponent } from '../../scripts/components/tap-zone';
import { UI_COLORS } from '../../scripts/components/ui-factory';
import { getDisplayName, getItemSpritePath } from '../../scripts/data/items';

const { ccclass } = _decorator;

/* ═══ 尺寸 ═══ */
const COLS = 6;
const CELL = 88;
const GAP = 10;
const GRID_W = COLS * CELL + (COLS - 1) * GAP;
const ROWS = 6;
const GRID_H = ROWS * CELL + (ROWS - 1) * GAP;

const SUBTITLE_W = 400;
const SUBTITLE_H = 44;
const SUBTITLE_FONT = 20;
const GAP_SUBTITLE_GRID = 18;

/* ═══ 颜色（对齐抖音端） ═══ */
/** 空格子填充（米白） */
const CELL_EMPTY_BG = new Color(255, 248, 238, 255);
/** 空格子描边（浅棕） */
const CELL_EMPTY_BORDER = new Color(226, 212, 188, 255);
/** 锁定格填充（浅灰棕） */
const CELL_LOCKED_BG = new Color(214, 202, 186, 140);
/** 解锁入口虚线边框（暖金） */
const UNLOCK_DASH = new Color(214, 170, 80, 255);
/** 解锁入口文字/符号颜色（金棕） */
const UNLOCK_TEXT = new Color(184, 132, 54, 255);
/** 副标题胶囊背景 */
const SUBTITLE_BG = new Color(255, 250, 240, 255);
/** 副标题胶囊边框（实线浅棕） */
const SUBTITLE_BORDER = new Color(224, 208, 184, 255);
/** 副标题文字色 */
const SUBTITLE_TEXT = new Color(139, 107, 74, 255);

/**
 * 背包页（backpack 分包）：6×6 格，对齐抖音端样式。
 *
 * - 标题栏由 modal shell 渲染（"我的小背包" + 背包图标，与底部导航一致）
 * - 自建副标题胶囊："点击物品放回棋盘·已用 X/Y 格"（实线边框）
 * - 空格子：米白底 + 浅棕细描边
 * - 锁定格：浅灰棕底 + 锁图标
 * - 第一个未解锁格 = 解锁入口：空格底 + 金色虚线边框 + "+ 💎N"
 * - 点击物品放回棋盘；点击解锁入口花钻石解锁
 */
@ccclass('BackpackPageComponent')
export class BackpackPageComponent extends Component {
  private _grid: Node | null = null;
  private _subtitleLabel: Label | null = null;
  private readonly _onChanged = (): void => this._render();

  protected onLoad(): void {
    const gm = GameManager.instance;
    gm.events.on('backpack:changed', this._onChanged);
    gm.events.on('economy:changed', this._onChanged);

    const bodyUi = this.node.getComponent(UITransform);
    const bodyW = bodyUi?.width ?? GRID_W;

    // ── 副标题胶囊（自建，实线边框，不用 modal-chrome 的虚线版） ──
    const subtitle = new Node('subtitle');
    subtitle.layer = this.node.layer;
    subtitle.addComponent(UITransform).setContentSize(SUBTITLE_W, SUBTITLE_H);
    this.node.addChild(subtitle);

    const sg = subtitle.addComponent(Graphics);
    const r = SUBTITLE_H / 2;
    sg.fillColor = SUBTITLE_BG;
    sg.roundRect(-SUBTITLE_W / 2, -SUBTITLE_H / 2, SUBTITLE_W, SUBTITLE_H, r);
    sg.fill();
    sg.lineWidth = 1.5;
    sg.strokeColor = SUBTITLE_BORDER;
    sg.roundRect(-SUBTITLE_W / 2, -SUBTITLE_H / 2, SUBTITLE_W, SUBTITLE_H, r);
    sg.stroke();

    const subLabelNode = new Node('label');
    subLabelNode.layer = subtitle.layer;
    subLabelNode.addComponent(UITransform).setContentSize(SUBTITLE_W - 24, SUBTITLE_H);
    subtitle.addChild(subLabelNode);
    const subLabel = subLabelNode.addComponent(Label);
    subLabel.fontSize = SUBTITLE_FONT;
    subLabel.lineHeight = SUBTITLE_H;
    subLabel.color = SUBTITLE_TEXT;
    subLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
    subLabel.verticalAlign = Label.VerticalAlign.CENTER;
    subLabel.overflow = Label.Overflow.SHRINK;
    this._subtitleLabel = subLabel;

    // ── 网格 ──
    const grid = new Node('grid');
    grid.layer = this.node.layer;
    grid.addComponent(UITransform).setContentSize(GRID_W, GRID_H);
    this.node.addChild(grid);
    this._grid = grid;

    this._render();
  }

  protected onDestroy(): void {
    const gm = GameManager.instance;
    gm.events.off('backpack:changed', this._onChanged);
    gm.events.off('economy:changed', this._onChanged);
  }

  /* ══════════════════════════════════════════════ */

  private _render(): void {
    const grid = this._grid;
    if (!grid || !grid.isValid) return;
    grid.removeAllChildren();

    const gm = GameManager.instance;
    const { items, unlockedSlots, maxSlots } = gm.backpack;

    // 副标题
    if (this._subtitleLabel?.isValid) {
      this._subtitleLabel.string = `点击物品放回棋盘·已用 ${items.length}/${unlockedSlots} 格`;
    }

    const startX = -GRID_W / 2 + CELL / 2;
    const startY = GRID_H / 2 - CELL / 2;

    for (let i = 0; i < maxSlots; i++) {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const pos = new Vec3(startX + col * (CELL + GAP), startY - row * (CELL + GAP), 0);
      this._buildSlot(grid, pos, i, items[i]?.itemId);
    }

    this._layout();
  }

  /** subtitle 在上、grid 在下，整体居中；并动态调整弹窗面板高度 */
  private _layout(): void {
    const subtitle = this.node.getChildByName('subtitle');
    const grid = this._grid;
    if (!subtitle || !grid) return;

    const contentH = SUBTITLE_H + GAP_SUBTITLE_GRID + GRID_H;
    // 以内容中心为原点，从上往下排
    const top = contentH / 2;
    subtitle.setPosition(new Vec3(0, top - SUBTITLE_H / 2, 0));
    grid.setPosition(new Vec3(0, top - SUBTITLE_H - GAP_SUBTITLE_GRID - GRID_H / 2, 0));

    // 外壳开销（无 modal subtitle）：顶部padding60 + header52 + gap16 + 底部padding18 = 146
    let panel: Node | null = this.node;
    while (panel && panel.name !== 'modalPanel') panel = panel.parent;
    if (panel) resizeModalPanel(panel, contentH + 146);
  }

  /* ══════════════════════════════════════════════ */

  private _buildSlot(parent: Node, pos: Vec3, idx: number, itemId?: string): void {
    const gm = GameManager.instance;
    const unlocked = idx < gm.backpack.unlockedSlots;
    const full = gm.backpack.unlockedSlots >= gm.backpack.maxSlots;
    const isUnlockEntry = !unlocked && !full && idx === gm.backpack.unlockedSlots;

    const cell = new Node(`slot_${idx}`);
    cell.layer = parent.layer;
    cell.addComponent(UITransform).setContentSize(CELL, CELL);
    cell.setPosition(pos);
    parent.addChild(cell);

    const g = cell.addComponent(Graphics);

    if (isUnlockEntry) {
      // 解锁入口：底层同空格（米白+浅棕描边），叠加金色虚线描边
      this._paintEmptyCell(g);
      drawDashedRoundRect(g, -CELL / 2, -CELL / 2, CELL, CELL, 12, 6, 4, UNLOCK_DASH, 2.5);
      this._buildUnlockEntry(cell);
      return;
    }

    if (unlocked) {
      this._paintEmptyCell(g);
    } else {
      // 锁定格：浅灰棕底，无描边
      g.fillColor = CELL_LOCKED_BG;
      g.roundRect(-CELL / 2, -CELL / 2, CELL, CELL, 12);
      g.fill();
      this._mountLockIcon(cell);
      return;
    }

    if (!itemId) return;

    this._mountItemVisual(cell, itemId);
    cell.addComponent(TapZoneComponent).onTap = () => {
      if (GameManager.instance.takeFromBackpack(itemId)) {
        showPageToast(this.node, `${getDisplayName(itemId)} 已放回棋盘`);
      } else {
        showPageToast(this.node, '棋盘已满，先合成或交付订单');
      }
    };
  }

  /** 空格子底色 + 浅棕细描边 */
  private _paintEmptyCell(g: Graphics): void {
    g.fillColor = CELL_EMPTY_BG;
    g.roundRect(-CELL / 2, -CELL / 2, CELL, CELL, 12);
    g.fill();
    g.lineWidth = 1.5;
    g.strokeColor = CELL_EMPTY_BORDER;
    g.roundRect(-CELL / 2, -CELL / 2, CELL, CELL, 12);
    g.stroke();
  }

  /** 解锁入口格内容：+号（上） + 钻石图标+数字（下） */
  private _buildUnlockEntry(cell: Node): void {
    const gm = GameManager.instance;
    const cost = gm.backpackUnlockCost;

    // +号（偏上）
    this._buildLabel(cell, '+', 34, new Vec3(0, 14, 0), {
      bold: true,
      color: UNLOCK_TEXT,
    });

    // 钻石图标（偏下，左）
    const diamondNode = new Node('diamond');
    diamondNode.layer = cell.layer;
    diamondNode.addComponent(UITransform).setContentSize(20, 20);
    diamondNode.setPosition(new Vec3(-13, -16, 0));
    cell.addChild(diamondNode);
    const diamondSprite = diamondNode.addComponent(Sprite);
    loadSpriteFrame('sprites/currency/diamond', sf => {
      if (sf && diamondSprite.isValid) applySpriteFrame(diamondSprite, sf);
    });

    // 数字（偏下，右）
    this._buildLabel(cell, `${cost}`, 20, new Vec3(8, -16, 0), {
      bold: true,
      color: UNLOCK_TEXT,
    });

    cell.addComponent(TapZoneComponent).onTap = () => {
      if (GameManager.instance.unlockBackpackSlot()) {
        showPageToast(this.node, '解锁成功，+1 格');
      } else {
        showPageToast(this.node, `钻石不足，需要 ${cost} 钻石`);
      }
    };
  }

  /** 锁定格的锁图标（小尺寸居中） */
  private _mountLockIcon(cell: Node): void {
    const lockNode = new Node('lock');
    lockNode.layer = cell.layer;
    lockNode.addComponent(UITransform).setContentSize(26, 26);
    cell.addChild(lockNode);
    const lockSprite = lockNode.addComponent(Sprite);
    loadSpriteFrame('sprites/ui/lock', sf => {
      if (sf && lockSprite.isValid) {
        applySpriteFrame(lockSprite, sf);
        // 锁图标本身偏浅棕，在浅灰棕底上略灰一点更接近抖音端
        lockSprite.color = new Color(170, 160, 145, 220);
      }
    });
  }

  /** 物品贴图，缺图时回退为名称文字 */
  private _mountItemVisual(cell: Node, itemId: string): void {
    const path = getItemSpritePath(itemId);
    const name = getDisplayName(itemId);

    const fallback = (): void => {
      if (!cell.isValid) return;
      this._buildLabel(cell, name, 16, new Vec3(0, 0, 0), { width: CELL - 8, wrap: true });
    };

    if (!path) {
      fallback();
      return;
    }

    const spriteNode = new Node('icon');
    spriteNode.layer = cell.layer;
    spriteNode.addComponent(UITransform).setContentSize(CELL - 16, CELL - 16);
    cell.addChild(spriteNode);
    const sprite = spriteNode.addComponent(Sprite);

    loadSpriteFrame(path, sf => {
      if (!sprite.isValid) return;
      if (sf) {
        applySpriteFrame(sprite, sf);
      } else {
        spriteNode.destroy();
        fallback();
      }
    });
  }

  private _buildLabel(
    parent: Node,
    text: string,
    fontSize: number,
    pos: Vec3,
    opts: { bold?: boolean; color?: Color; width?: number; wrap?: boolean } = {},
  ): void {
    const node = new Node('label');
    node.layer = parent.layer;
    const ui = node.addComponent(UITransform);
    if (opts.width) ui.setContentSize(opts.width, fontSize * 2);
    node.setPosition(pos);
    parent.addChild(node);

    const label = node.addComponent(Label);
    label.string = text;
    label.fontSize = fontSize;
    label.lineHeight = fontSize * 1.2;
    label.isBold = opts.bold ?? false;
    label.color = opts.color ?? UI_COLORS.textBrown;
    label.overflow = Label.Overflow.SHRINK;
    label.enableWrapText = opts.wrap ?? false;
  }
}
