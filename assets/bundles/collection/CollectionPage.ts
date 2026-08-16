import { _decorator, Color, Component, Graphics, Label, Node, Sprite, UITransform, Vec3, Widget } from 'cc';

import { GameManager } from '../../scripts/manager/GameManager';
import { createPageChrome, showPageToast } from '../../scripts/components/bundle-pages';
import { loadSpriteFrame, applySpriteFrame } from '../../scripts/components/sprite-loader';
import { TapZoneComponent } from '../../scripts/components/tap-zone';
import { UI_COLORS } from '../../scripts/components/ui-factory';
import { CATEGORIES, RARE_ITEMS, getItemSpritePath } from '../../scripts/data/items';
import { completionRate } from '../../scripts/core/collection';
import { getShardCount, getShardsRequired } from '../../scripts/core/shard';

const { ccclass } = _decorator;

const CELL = 70;
const GAP = 8;
const COLS = 8;
const GRID_W = COLS * CELL + (COLS - 1) * GAP;

/** 锁定格底色（深棕半透明） */
const LOCKED_BG = new Color(96, 66, 46, 90);
/** 未领取高亮描边（Web 版金黄） */
const UNCLAIMED_STROKE = new Color(255, 196, 60, 255);

/**
 * 图鉴页（collection 分包）：8 品类 × 8 级 + 稀有物品行。
 * 已解锁显示贴图，未领取的格子高亮、点击领取 +1 钻石；
 * 稀有行未解锁时显示碎片进度。
 */
@ccclass('CollectionPageComponent')
export class CollectionPageComponent extends Component {
  private _content: Node | null = null;
  private _headerLabel: Label | null = null;
  private readonly _onChanged = (): void => this._render();

  protected onLoad(): void {
    createPageChrome(this.node, '图鉴');

    const gm = GameManager.instance;
    gm.events.on('collection:changed', this._onChanged);
    gm.events.on('shard:changed', this._onChanged);

    const header = new Node('completion');
    header.layer = this.node.layer;
    header.addComponent(UITransform);
    this.node.addChild(header);
    this._headerLabel = header.addComponent(Label);
    this._headerLabel.fontSize = 26;
    this._headerLabel.lineHeight = 32;
    this._headerLabel.color = UI_COLORS.textBrown;
    const hw = header.addComponent(Widget);
    hw.isAlignTop = true;
    hw.top = 246;
    hw.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;

    const content = new Node('grid');
    content.layer = this.node.layer;
    content.addComponent(UITransform).setContentSize(GRID_W, 9 * (CELL + GAP));
    this.node.addChild(content);
    const cw = content.addComponent(Widget);
    cw.isAlignTop = true;
    cw.top = 300;
    cw.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;
    this._content = content;

    this._render();
  }

  protected onDestroy(): void {
    // 页面销毁时必须退订，GameManager 是常驻单例
    const gm = GameManager.instance;
    gm.events.off('collection:changed', this._onChanged);
    gm.events.off('shard:changed', this._onChanged);
  }

  private _render(): void {
    const content = this._content;
    if (!content || !content.isValid) return;
    content.removeAllChildren();

    const gm = GameManager.instance;
    if (this._headerLabel && this._headerLabel.isValid) {
      this._headerLabel.string = `收集进度 ${completionRate(gm.collection)}%`;
    }

    const gridH = content.getComponent(UITransform)?.height ?? 0;
    const startX = -GRID_W / 2 + CELL / 2;
    const startY = gridH / 2 - CELL / 2;

    // 8 个品类行：itemId = `${category}_${level}`
    CATEGORIES.forEach((cat, row) => {
      for (let col = 0; col < COLS; col++) {
        const itemId = `${cat.id}_${col + 1}`;
        const pos = new Vec3(startX + col * (CELL + GAP), startY - row * (CELL + GAP), 0);
        this._buildCell(content, pos, {
          itemId,
          name: cat.items[col]?.name ?? itemId,
          unlocked: gm.collection.unlockedIds.has(itemId),
          unclaimed: gm.collection.unclaimedIds.has(itemId),
        });
      }
    });

    // 稀有物品行：未解锁时显示碎片进度
    RARE_ITEMS.forEach((rare, col) => {
      const pos = new Vec3(startX + col * (CELL + GAP), startY - 8 * (CELL + GAP), 0);
      const unlocked = gm.collection.unlockedIds.has(rare.id);
      this._buildCell(content, pos, {
        itemId: rare.id,
        name: rare.name,
        unlocked,
        unclaimed: gm.collection.unclaimedIds.has(rare.id),
        progress: unlocked
          ? undefined
          : `${getShardCount(gm.shard, rare.category)}/${getShardsRequired(rare.category)}`,
      });
    });
  }

  private _buildCell(
    parent: Node,
    pos: Vec3,
    info: { itemId: string; name: string; unlocked: boolean; unclaimed: boolean; progress?: string },
  ): void {
    const cell = new Node(`cell_${info.itemId}`);
    cell.layer = parent.layer;
    cell.addComponent(UITransform).setContentSize(CELL, CELL);
    cell.setPosition(pos);
    parent.addChild(cell);

    const g = cell.addComponent(Graphics);
    g.fillColor = info.unlocked ? UI_COLORS.cellLight : LOCKED_BG;
    g.roundRect(-CELL / 2, -CELL / 2, CELL, CELL, 12);
    g.fill();
    if (info.unclaimed) {
      g.lineWidth = 4;
      g.strokeColor = UNCLAIMED_STROKE;
      g.roundRect(-CELL / 2, -CELL / 2, CELL, CELL, 12);
      g.stroke();
    }

    if (info.unlocked) {
      this._mountItemVisual(cell, info.itemId, info.name);
      if (info.unclaimed) {
        cell.addComponent(TapZoneComponent).onTap = () => {
          if (GameManager.instance.claimCollectionDiamond(info.itemId)) {
            showPageToast(this.node, `${info.name} 奖励 +1 钻石`);
          }
        };
      }
      return;
    }

    // 未解锁：稀有格显示碎片进度，普通格显示 ?
    const labelNode = new Node('locked');
    labelNode.layer = cell.layer;
    labelNode.addComponent(UITransform);
    cell.addChild(labelNode);
    const label = labelNode.addComponent(Label);
    label.string = info.progress ?? '?';
    label.fontSize = info.progress ? 20 : 30;
    label.lineHeight = 34;
    label.isBold = true;
    label.color = new Color(255, 248, 238, 160);
  }

  /** 物品贴图，缺图时回退为名称文字 */
  private _mountItemVisual(cell: Node, itemId: string, name: string): void {
    const path = getItemSpritePath(itemId);
    const spriteNode = new Node('icon');
    spriteNode.layer = cell.layer;
    spriteNode.addComponent(UITransform).setContentSize(CELL - 14, CELL - 14);
    cell.addChild(spriteNode);
    const sprite = spriteNode.addComponent(Sprite);

    const fallback = (): void => {
      if (!spriteNode.isValid || !cell.isValid) return;
      spriteNode.destroy();
      const labelNode = new Node('name');
      labelNode.layer = cell.layer;
      const ui = labelNode.addComponent(UITransform);
      ui.setContentSize(CELL - 8, CELL - 8);
      cell.addChild(labelNode);
      const label = labelNode.addComponent(Label);
      label.string = name;
      label.fontSize = 16;
      label.lineHeight = 18;
      label.overflow = Label.Overflow.SHRINK;
      label.enableWrapText = true;
      label.color = UI_COLORS.textBrown;
    };

    if (!path) {
      fallback();
      return;
    }
    loadSpriteFrame(path, sf => {
      if (!sprite.isValid) return;
      if (sf) applySpriteFrame(sprite, sf);
      else fallback();
    });
  }
}
