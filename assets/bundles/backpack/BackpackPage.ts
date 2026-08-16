import { _decorator, Color, Component, Graphics, Label, Node, Sprite, UITransform, Vec3 } from 'cc';

import { GameManager } from '../../scripts/manager/GameManager';
import { addAlignedWidget, createPageChrome, showPageToast } from '../../scripts/components/bundle-pages';
import { loadSpriteFrame, applySpriteFrame } from '../../scripts/components/sprite-loader';
import { TapZoneComponent } from '../../scripts/components/tap-zone';
import { UI_COLORS } from '../../scripts/components/ui-factory';
import { getDisplayName, getItemSpritePath } from '../../scripts/data/items';

const { ccclass } = _decorator;

const COLS = 6;
const CELL = 92;
const GAP = 10;
const GRID_W = COLS * CELL + (COLS - 1) * GAP;

/** 未解锁格底色（深棕半透明） */
const LOCKED_BG = new Color(96, 66, 46, 90);
/** 已解锁但空置的格底色 */
const EMPTY_BG = new Color(255, 248, 238, 120);

const BTN_W = 240;
const BTN_H = 60;
const CLAIM_BG = new Color(126, 191, 108, 255);
const DIM_BG = new Color(180, 160, 140, 255);

/**
 * 背包页（backpack 分包）：6×6 格，展示已收纳的物品。
 *
 * 点击物品放回棋盘空位；点击锁定格花钻石解锁。
 * 与 core/backpack 同构：每个物品独占一格，不堆叠。
 */
@ccclass('BackpackPageComponent')
export class BackpackPageComponent extends Component {
  private _content: Node | null = null;
  private _headerLabel: Label | null = null;
  private _footer: Node | null = null;
  private readonly _onChanged = (): void => this._render();

  protected onLoad(): void {
    createPageChrome(this.node, '背包');

    const gm = GameManager.instance;
    gm.events.on('backpack:changed', this._onChanged);
    // 钻石变化会影响解锁按钮的可用态
    gm.events.on('economy:changed', this._onChanged);

    const header = new Node('capacity');
    header.layer = this.node.layer;
    header.addComponent(UITransform);
    this.node.addChild(header);
    this._headerLabel = header.addComponent(Label);
    this._headerLabel.fontSize = 26;
    this._headerLabel.lineHeight = 32;
    this._headerLabel.color = UI_COLORS.textBrown;
    addAlignedWidget(header, { isAlignTop: true, top: 246 });

    const content = new Node('grid');
    content.layer = this.node.layer;
    content.addComponent(UITransform).setContentSize(GRID_W, COLS * (CELL + GAP));
    this.node.addChild(content);
    addAlignedWidget(content, { isAlignTop: true, top: 300 });
    this._content = content;

    const footer = new Node('footer');
    footer.layer = this.node.layer;
    footer.addComponent(UITransform).setContentSize(GRID_W, BTN_H);
    this.node.addChild(footer);
    addAlignedWidget(footer, { isAlignTop: true, top: 300 + COLS * (CELL + GAP) + 24 });
    this._footer = footer;

    this._render();
  }

  protected onDestroy(): void {
    const gm = GameManager.instance;
    gm.events.off('backpack:changed', this._onChanged);
    gm.events.off('economy:changed', this._onChanged);
  }

  private _render(): void {
    const content = this._content;
    if (!content || !content.isValid) return;
    content.removeAllChildren();

    const gm = GameManager.instance;
    const { items, unlockedSlots, maxSlots } = gm.backpack;

    if (this._headerLabel?.isValid) {
      this._headerLabel.string = `容量 ${items.length}/${unlockedSlots}（上限 ${maxSlots}）`;
    }

    const gridH = content.getComponent(UITransform)?.height ?? 0;
    const startX = -GRID_W / 2 + CELL / 2;
    const startY = gridH / 2 - CELL / 2;

    for (let i = 0; i < maxSlots; i++) {
      const row = Math.floor(i / COLS);
      const col = i % COLS;
      const pos = new Vec3(startX + col * (CELL + GAP), startY - row * (CELL + GAP), 0);
      this._buildSlot(content, pos, i, items[i]?.itemId);
    }

    this._renderFooter();
  }

  private _buildSlot(parent: Node, pos: Vec3, idx: number, itemId?: string): void {
    const gm = GameManager.instance;
    const unlocked = idx < gm.backpack.unlockedSlots;

    const cell = new Node(`slot_${idx}`);
    cell.layer = parent.layer;
    cell.addComponent(UITransform).setContentSize(CELL, CELL);
    cell.setPosition(pos);
    parent.addChild(cell);

    const g = cell.addComponent(Graphics);
    g.fillColor = unlocked ? EMPTY_BG : LOCKED_BG;
    g.roundRect(-CELL / 2, -CELL / 2, CELL, CELL, 12);
    g.fill();

    if (!unlocked) {
      this._buildLabel(cell, '🔒', 28, new Vec3(0, 0, 0));
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

  /** 底部解锁按钮：显示下一格的钻石价格 */
  private _renderFooter(): void {
    const footer = this._footer;
    if (!footer || !footer.isValid) return;
    footer.removeAllChildren();

    const gm = GameManager.instance;
    const full = gm.backpack.unlockedSlots >= gm.backpack.maxSlots;
    const cost = gm.backpackUnlockCost;
    const affordable = !full && gm.economy.diamonds >= cost;

    const btn = new Node('unlock');
    btn.layer = footer.layer;
    btn.addComponent(UITransform).setContentSize(BTN_W, BTN_H);
    footer.addChild(btn);

    const g = btn.addComponent(Graphics);
    g.fillColor = affordable ? CLAIM_BG : DIM_BG;
    g.roundRect(-BTN_W / 2, -BTN_H / 2, BTN_W, BTN_H, 12);
    g.fill();

    const label = full ? '已全部解锁' : `解锁格子 ${cost} 钻石`;
    this._buildLabel(btn, label, 22, new Vec3(0, 0, 0), {
      bold: true,
      color: new Color(255, 252, 245, affordable ? 255 : 200),
      width: BTN_W - 12,
    });

    if (full) return;
    // 钻石不足也挂监听：给出「不足」提示，比点了没反应好
    btn.addComponent(TapZoneComponent).onTap = () => {
      if (GameManager.instance.unlockBackpackSlot()) {
        showPageToast(this.node, '解锁成功，+1 格');
      } else {
        showPageToast(this.node, `钻石不足，需要 ${cost} 钻石`);
      }
    };
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
