import { _decorator, Color, Component, Node, UITransform, Vec3 } from 'cc';

import { GameManager } from '../../scripts/manager/GameManager';
import { addAlignedWidget, showPageToast } from '../../scripts/components/bundle-pages';
import {
  CARD_BORDER,
  LOCKED_BG,
  LOCKED_BORDER,
  LOCK_SPRITE,
  MOTHER_BG,
  TEXT_MUTED,
  UNCLAIMED_STROKE,
  addLabel,
  addSprite,
  buildItemCell,
  paintRoundRect,
} from '../../scripts/components/collection-cells';
import { buildTabBar, type CollectionTab } from '../../scripts/components/collection-tabs';
import { levelSubtitle, showItemDetail } from '../../scripts/components/collection-detail';
import { TapZoneComponent } from '../../scripts/components/tap-zone';
import { UI_COLORS } from '../../scripts/components/ui-factory';
import { createScrollView, type ScrollView } from '../../scripts/components/drag-scroll';
import { CATEGORIES, getItemSpritePath } from '../../scripts/data/items';
import { playSfx } from '../../scripts/manager/AudioManager';
import { fontManager } from '../../scripts/core/font-manager';

const { ccclass } = _decorator;

/** 内容区宽度（弹窗 body 宽 660 - 左右各 20 边距 = 620） */
const CONTENT_W = 620;

/** 品类卡：4 列网格（Web .cat-grid grid-template-columns: repeat(4, 1fr)） */
const GRID_COLS = 4;
const CARD_PAD = 16;
const CELL_GAP = 10;
/** 卡片之间的垂直间距（大于格子间距，让大卡片之间有呼吸感） */
const CARD_GAP = 14;
const CELL_W = (CONTENT_W - CARD_PAD * 2 - CELL_GAP * (GRID_COLS - 1)) / GRID_COLS;
const CELL_H = 150;
const MOTHER_H = 64;
/** 品类卡总高：两行子棋 + 母棋条 */
const CATEGORY_CARD_H = CARD_PAD * 2 + CELL_H * 2 + CELL_GAP + MOTHER_H + 8;

/** 经济卡：合成链一行 4 级 */
const CHAIN_CARD_H = 240;

/** 滚动区顶部距页面顶部（tabRow 占 8+68=76，下方留 20px 呼吸间距 → 96） */
const VIEW_TOP = 96;
/** 底部安全边距 */
const BOTTOM_SAFE = 20;

const CURRENCY_GROUPS: readonly { prefix: string; name: string; icon: string }[] = [
  { prefix: 'coin', name: '金币', icon: 'sprites/currency/coin_single' },
  { prefix: 'diamond', name: '钻石', icon: 'sprites/currency/diamond' },
  { prefix: 'energy', name: '精力', icon: 'sprites/ui/energy_bolt' },
];
/** 货币合成链长度（coin_1..coin_4） */
const CHAIN_LEN = 4;

/**
 * 图鉴页（collection 分包）。
 *
 * 布局对齐 Web 版 Collection.vue：顶部两段 Tab（物品 / 经济），
 * - 物品：每个品类一张卡，内含 4×2 子棋网格 + 底部母棋条；
 * - 经济：金币 / 钻石 / 精力三条合成链，箭头连接。
 *
 * 小游戏侧没有 DOM 滚动，内容超出一屏时用上下翻页按钮分页。
 */
@ccclass('CollectionPageComponent')
export class CollectionPageComponent extends Component {
  private _content: Node | null = null;
  private _tabRow: Node | null = null;
  private _scroll: ScrollView | null = null;
  private _activeTab: CollectionTab = 'items';
  private readonly _onChanged = (): void => this._render();

  protected onLoad(): void {
    const gm = GameManager.instance;
    gm.events.on('collection:changed', this._onChanged);

    // 顶部 Tab 行
    const tabRow = new Node('tabRow');
    tabRow.layer = this.node.layer;
    tabRow.addComponent(UITransform).setContentSize(CONTENT_W, 68);
    this.node.addChild(tabRow);
    addAlignedWidget(tabRow, { isAlignTop: true, top: 8 });
    this._tabRow = tabRow;

    // 滚动区：固定可视高度 + top 对齐
    const bodyUi = this.node.getComponent(UITransform)!;
    const viewH = Math.max(1, bodyUi.height - VIEW_TOP - BOTTOM_SAFE);
    const scroll = createScrollView(this.node, CONTENT_W, viewH);
    addAlignedWidget(scroll.view, { isAlignTop: true, top: VIEW_TOP });
    this._scroll = scroll;
    this._content = scroll.content;

    this._render();
  }

  protected onDestroy(): void {
    // 页面销毁时必须退订，GameManager 是常驻单例
    const gm = GameManager.instance;
    gm.events.off('collection:changed', this._onChanged);
  }

  private _switchTab(tab: CollectionTab): void {
    this._activeTab = tab;
    this._scroll?.scrollToTop();
    this._render();
  }

  private _render(): void {
    const content = this._content;
    const tabRow = this._tabRow;
    if (!content?.isValid || !tabRow?.isValid) return;

    content.removeAllChildren();
    tabRow.removeAllChildren();
    buildTabBar(tabRow, CONTENT_W, this._activeTab, t => this._switchTab(t));

    const cards =
      this._activeTab === 'items'
        ? this._buildItemsTab()
        : this._buildCurrencyTab();

    this._layoutScroll(cards);

    fontManager.applyFontToTree(this.node);
  }

  /**
   * 把所有卡片按顺序塞进滚动内容区，从上到下排列。
   *
   * 注意：必须先 setContentHeight 再布局子节点。Cocos 节点 position 相对于锚点（中心），
   * 若先按 viewH 布局再改 content 高度，content 变高后子节点相对顶部会下移
   * (finalH - viewH)/2，导致超一屏的内容全部跑到可视区外。
   */
  private _layoutScroll(cards: { h: number; build: (parent: Node, y: number) => void }[]): void {
    const scroll = this._scroll;
    const content = this._content;
    if (!scroll || !content?.isValid) return;

    content.removeAllChildren();
    if (cards.length === 0) {
      scroll.setContentHeight(1);
      return;
    }

    const viewH = scroll.view.getComponent(UITransform)!.height;
    // 先算总高并设置 content 高度，布局时 y 从 finalH/2（content 顶部）开始
    let usedH = 0;
    for (let i = 0; i < cards.length; i++) {
      usedH += cards[i].h;
      if (i < cards.length - 1) usedH += CARD_GAP;
    }
    const finalH = Math.max(usedH, viewH);
    scroll.setContentHeight(finalH);

    let y = finalH / 2;
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      y -= card.h / 2;
      card.build(content, y);
      y -= card.h / 2;
      if (i < cards.length - 1) y -= CARD_GAP;
    }
  }

  /** 向上找到弹窗根节点（用于 showPageToast / showItemDetail，避免被面板裁剪） */
  private _getModalRoot(): Node {
    let n: Node | null = this.node;
    while (n && !n.name.startsWith('Modal_')) {
      n = n.parent;
    }
    return n ?? this.node;
  }

  /* ─── 物品 Tab：品类卡 + 母棋条 ─── */

  private _buildItemsTab(): { h: number; build: (parent: Node, y: number) => void }[] {
    const gm = GameManager.instance;
    return CATEGORIES.map(cat => ({
      h: CATEGORY_CARD_H,
      build: (parent: Node, y: number): void => {
        const card = new Node(`cat_${cat.id}`);
        card.layer = parent.layer;
        card.addComponent(UITransform).setContentSize(CONTENT_W, CATEGORY_CARD_H);
        card.setPosition(new Vec3(0, y, 0));
        parent.addChild(card);
        paintRoundRect(card, CONTENT_W, CATEGORY_CARD_H, 20, new Color(255, 255, 255, 100), CARD_BORDER, 2);

        // 4×2 子棋网格
        const startX = -CONTENT_W / 2 + CARD_PAD + CELL_W / 2;
        const startY = CATEGORY_CARD_H / 2 - CARD_PAD - CELL_H / 2;
        for (let i = 0; i < GRID_COLS * 2; i++) {
          const itemId = `${cat.id}_${i + 1}`;
          const col = i % GRID_COLS;
          const row = Math.floor(i / GRID_COLS);
          const unclaimed = gm.collection.unclaimedIds.has(itemId);
          buildItemCell(
            card,
            new Vec3(startX + col * (CELL_W + CELL_GAP), startY - row * (CELL_H + CELL_GAP), 0),
            { w: CELL_W, h: CELL_H },
            {
              itemId,
              name: cat.items[i]?.name ?? itemId,
              unlocked: gm.collection.unlockedIds.has(itemId),
              unclaimed,
            },
            {
              onClaim: () => {
                if (GameManager.instance.claimCollectionDiamond(itemId)) {
                  playSfx('diamond');
                  playSfx('coin');
                  showPageToast(this._getModalRoot(), `${cat.items[i]?.name ?? itemId} 奖励 +1 钻石`);
                }
              },
              onDetail: () =>
                showItemDetail(this._getModalRoot(), {
                  spritePath: getItemSpritePath(itemId),
                  emoji: cat.items[i]?.emoji ?? '',
                  name: cat.items[i]?.name ?? itemId,
                  subtitle: levelSubtitle(i + 1, cat.name),
                }),
            },
          );
        }

        this._buildMotherStrip(card, cat.id, cat.name, gm.unlockedCategories.has(cat.id));
      },
    }));
  }

  /** 母棋条（Web .mother-strip）：卡片底部整条，左图右文 */
  private _buildMotherStrip(card: Node, catId: string, catName: string, unlocked: boolean): void {
    const strip = new Node('mother');
    strip.layer = card.layer;
    const w = CONTENT_W - CARD_PAD * 2;
    strip.addComponent(UITransform).setContentSize(w, MOTHER_H);
    strip.setPosition(new Vec3(0, -CATEGORY_CARD_H / 2 + CARD_PAD + MOTHER_H / 2 - 4, 0));
    card.addChild(strip);
    paintRoundRect(strip, w, MOTHER_H, 14, unlocked ? MOTHER_BG : LOCKED_BG, unlocked ? undefined : LOCKED_BORDER, 2);

    const icon = unlocked ? getItemSpritePath(`mother_${catId}`) : LOCK_SPRITE;
    if (icon) {
      addSprite(strip, icon, 40).setPosition(new Vec3(-w / 2 + 36, 0, 0));
    }
    addLabel(strip, `${catName}工坊`, {
      size: 24,
      color: unlocked ? UI_COLORS.textBrown : TEXT_MUTED,
      bold: true,
      width: w - 100,
      align: 'left',
    }).node.setPosition(new Vec3(-w / 2 + 76 + (w - 100) / 2, 0, 0));

    if (!unlocked) return;
    const zone = strip.addComponent(TapZoneComponent);
    zone.onTap = () =>
      showItemDetail(this._getModalRoot(), {
        spritePath: getItemSpritePath(`mother_${catId}`),
        emoji: '',
        name: `${catName}工坊`,
        subtitle: '母棋',
      });
  }

  /* ─── 经济 Tab：合成链 ─── */

  private _buildCurrencyTab(): { h: number; build: (parent: Node, y: number) => void }[] {
    const gm = GameManager.instance;
    return CURRENCY_GROUPS.map(cg => {
      const unlockedCount = Array.from({ length: CHAIN_LEN }).filter((_, i) =>
        gm.collection.unlockedIds.has(`${cg.prefix}_${i + 1}`),
      ).length;
      return {
        h: CHAIN_CARD_H,
        build: (parent: Node, y: number): void => {
          const card = new Node(`chain_${cg.prefix}`);
          card.layer = parent.layer;
          card.addComponent(UITransform).setContentSize(CONTENT_W, CHAIN_CARD_H);
          card.setPosition(new Vec3(0, y, 0));
          parent.addChild(card);
          paintRoundRect(card, CONTENT_W, CHAIN_CARD_H, 20, new Color(255, 255, 255, 120), CARD_BORDER, 2);

          // 头部：图标 + 名称 + 进度
          const headY = CHAIN_CARD_H / 2 - 40;
          addSprite(card, cg.icon, 28, headY).setPosition(
            new Vec3(-CONTENT_W / 2 + 36, headY, 0),
          );
          addLabel(card, cg.name, {
            size: 22,
            color: UI_COLORS.textBrown,
            bold: true,
            y: headY,
            width: 140,
            align: 'left',
            // 左对齐时 x 是节点中心，节点左缘 = x - width/2，要落在图标右侧
          }).node.setPosition(new Vec3(-CONTENT_W / 2 + 62 + 140 / 2, headY, 0));
          addLabel(card, `${unlockedCount}/${CHAIN_LEN}`, {
            size: 18,
            color: TEXT_MUTED,
            bold: true,
            y: headY,
            width: 80,
          }).node.setPosition(new Vec3(CONTENT_W / 2 - 50, headY, 0));

          this._buildChainNodes(card, cg.prefix, cg.icon);
        },
      };
    });
  }

  /** 合成链节点行：4 级方块 + 中间箭头 */
  private _buildChainNodes(card: Node, prefix: string, icon: string): void {
    const gm = GameManager.instance;
    const nodeW = 96;
    const span = (CONTENT_W - 48) / CHAIN_LEN;
    const startX = -CONTENT_W / 2 + 24 + span / 2;
    const rowY = -10;

    for (let i = 0; i < CHAIN_LEN; i++) {
      const itemId = `${prefix}_${i + 1}`;
      const unlocked = gm.collection.unlockedIds.has(itemId);
      const x = startX + i * span;

      const box = new Node(`chain_${itemId}`);
      box.layer = card.layer;
      box.addComponent(UITransform).setContentSize(nodeW, nodeW);
      box.setPosition(new Vec3(x, rowY, 0));
      card.addChild(box);
      paintRoundRect(
        box,
        nodeW,
        nodeW,
        16,
        unlocked ? UI_COLORS.cellLight : LOCKED_BG,
        unlocked ? CARD_BORDER : LOCKED_BORDER,
        2,
      );
      addSprite(box, unlocked ? icon : LOCK_SPRITE, unlocked ? 52 : 32);
      addLabel(box, `Lv.${i + 1}`, {
        size: 18,
        color: unlocked ? UNCLAIMED_STROKE : TEXT_MUTED,
        bold: true,
        y: -nodeW / 2 - 18,
        width: nodeW,
      });

      // 箭头：画在两个方块之间的独立节点上
      if (i < CHAIN_LEN - 1) {
        addLabel(card, '›', {
          size: 34,
          color: TEXT_MUTED,
          bold: true,
          y: rowY,
          width: 40,
        }).node.setPosition(new Vec3(x + span / 2, rowY, 0));
      }
    }
  }
}
