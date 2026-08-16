import { _decorator, Color, Component, Label, Node, UITransform, Vec3, view } from 'cc';

import { GameManager } from '../../scripts/manager/GameManager';
import { addAlignedWidget, createPageChrome, showPageToast } from '../../scripts/components/bundle-pages';
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
import {
  RING_COMPLETE,
  RING_PROGRESS,
  drawProgressRing,
  makeNode,
} from '../../scripts/components/collection-effects';
import { FloatEffect } from '../../scripts/components/effect-float';
import { RainbowBorderEffect } from '../../scripts/components/effect-rainbow-border';
import { SparkleEffect } from '../../scripts/components/effect-sparkle';
import { levelSubtitle, showItemDetail } from '../../scripts/components/collection-detail';
import { TapZoneComponent } from '../../scripts/components/tap-zone';
import { UI_COLORS } from '../../scripts/components/ui-factory';
import { CATEGORIES, RARE_ITEM_BY_CATEGORY, getItemSpritePath } from '../../scripts/data/items';
import { getShardCount, getShardsRequired, isRareCompleted } from '../../scripts/core/shard';

const { ccclass } = _decorator;

/** 内容区宽度（720 设计宽 - 左右各 24 边距） */
const CONTENT_W = 672;

/** 品类卡：4 列网格（Web .cat-grid grid-template-columns: repeat(4, 1fr)） */
const GRID_COLS = 4;
const CARD_PAD = 16;
const CELL_GAP = 10;
const CELL_W = (CONTENT_W - CARD_PAD * 2 - CELL_GAP * (GRID_COLS - 1)) / GRID_COLS;
const CELL_H = 110;
const MOTHER_H = 64;
/** 品类卡总高：两行子棋 + 母棋条 */
const CATEGORY_CARD_H = CARD_PAD * 2 + CELL_H * 2 + CELL_GAP + MOTHER_H + 8;

/** 稀有卡：2 列（Web .rare-grid repeat(2, 1fr)） */
const RARE_COLS = 2;
const RARE_GAP = 16;
const RARE_W = (CONTENT_W - RARE_GAP) / RARE_COLS;
const RARE_H = 250;
/** 进度环半径与线宽（Web .showcase-ring r=42 stroke-width=5 等比放大） */
const RING_R = 46;
const RING_W = 8;

/** 完成卡的四颗粒子（对应 Web .s-particle p1..p4 的位置与延迟差） */
const RARE_PARTICLES: readonly { x: number; y: number; size: number; color: Color; delay: number }[] = [
  { x: 74, y: 34, size: 20, color: new Color(255, 138, 181, 255), delay: 0 },
  { x: -80, y: -18, size: 24, color: new Color(139, 164, 255, 255), delay: 0.8 },
  { x: -66, y: 40, size: 18, color: new Color(200, 109, 215, 255), delay: 1.5 },
  { x: 82, y: -24, size: 22, color: new Color(255, 184, 108, 255), delay: 2.2 },
];

/** 经济卡：合成链一行 4 级 */
const CHAIN_CARD_H = 190;

/** 一屏内容的可视高度上限，超出部分靠翻页 */
const VIEW_TOP = 380;
/** 底部翻页条占用的高度（按钮 64 + 上下留白） */
const PAGER_H = 84;
/** 底部安全边距（避开 home indicator）。留太多会白白挤掉一整张品类卡 */
const BOTTOM_SAFE = 60;

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
 * 布局对齐 Web 版 Collection.vue：顶部三段 Tab（物品 / 稀有 / 经济），
 * - 物品：每个品类一张卡，内含 4×2 子棋网格 + 底部母棋条；
 * - 稀有：2 列展示卡，碎片点阵 + 进度数字；
 * - 经济：金币 / 钻石 / 精力三条合成链，箭头连接。
 *
 * 小游戏侧没有 DOM 滚动，内容超出一屏时用上下翻页按钮分页。
 */
@ccclass('CollectionPageComponent')
export class CollectionPageComponent extends Component {
  private _content: Node | null = null;
  private _tabRow: Node | null = null;
  private _headerLabel: Label | null = null;
  private _activeTab: CollectionTab = 'items';
  private _page = 0;
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
    this._headerLabel.fontSize = 24;
    this._headerLabel.lineHeight = 30;
    this._headerLabel.color = TEXT_MUTED;
    addAlignedWidget(header, { isAlignTop: true, top: 250 });

    const tabRow = new Node('tabRow');
    tabRow.layer = this.node.layer;
    tabRow.addComponent(UITransform).setContentSize(CONTENT_W, 68);
    this.node.addChild(tabRow);
    addAlignedWidget(tabRow, { isAlignTop: true, top: 292 });
    this._tabRow = tabRow;

    // 高度必须恒为 0：Widget 按节点中心做 top 对齐，节点一变高中心就下沉，
    // 子节点会被整体推走。这里当成一个「顶部锚点」，卡片全部按负 y 往下排。
    const content = new Node('content');
    content.layer = this.node.layer;
    content.addComponent(UITransform).setContentSize(CONTENT_W, 0);
    this.node.addChild(content);
    addAlignedWidget(content, { isAlignTop: true, top: VIEW_TOP });
    this._content = content;

    this._render();
  }

  protected onDestroy(): void {
    // 页面销毁时必须退订，GameManager 是常驻单例
    const gm = GameManager.instance;
    gm.events.off('collection:changed', this._onChanged);
    gm.events.off('shard:changed', this._onChanged);
  }

  private _switchTab(tab: CollectionTab): void {
    this._activeTab = tab;
    this._page = 0;
    this._render();
  }

  private _render(): void {
    const content = this._content;
    const tabRow = this._tabRow;
    if (!content?.isValid || !tabRow?.isValid) return;

    content.removeAllChildren();
    tabRow.removeAllChildren();
    buildTabBar(tabRow, CONTENT_W, this._activeTab, t => this._switchTab(t));

    const gm = GameManager.instance;
    if (this._headerLabel?.isValid) {
      const total = gm.collection.unlockedIds.size;
      this._headerLabel.string = `已收集 ${total} 件`;
    }

    const cards =
      this._activeTab === 'items'
        ? this._buildItemsTab()
        : this._activeTab === 'rare'
          ? this._buildRareTab()
          : this._buildCurrencyTab();

    this._layoutPaged(content, cards);
  }

  /**
   * 把卡片按分页塞进内容区。
   * 每页装满为止，底部留出翻页按钮的位置。
   */
  private _layoutPaged(content: Node, cards: { h: number; build: (parent: Node, y: number) => void }[]): void {
    const pages = this._paginate(cards);

    if (pages.length === 0) return;
    this._page = Math.max(0, Math.min(this._page, pages.length - 1));

    let y = 0;
    for (const card of pages[this._page]) {
      y -= card.h / 2;
      card.build(content, y);
      y -= card.h / 2 + CELL_GAP;
    }

    if (pages.length > 1) this._buildPager(content, y - 20, pages.length);
  }

  /**
   * 内容区可用高度：可视高度减去顶部 chrome 与底部安全边距。
   *
   * 必须读 view.getVisibleSize()——项目跑 FIXED_WIDTH，真机可视高度（如 1559）
   * 远大于设计高度 1280，用设计高度算会少排一整张卡。
   */
  private _availableHeight(): number {
    return view.getVisibleSize().height - VIEW_TOP - BOTTOM_SAFE;
  }

  /**
   * 按可用高度切页。
   *
   * 先按整屏切一次，只要切出多于一页，就说明底部要放翻页条——此时可用高度
   * 要扣掉 PAGER_H 再重切，否则每页最后一张卡会压在翻页按钮上。
   */
  private _paginate(
    cards: { h: number; build: (parent: Node, y: number) => void }[],
  ): { h: number; build: (parent: Node, y: number) => void }[][] {
    const split = (viewH: number): typeof cards[] => {
      const pages: typeof cards[] = [];
      let cur: typeof cards = [];
      let curH = 0;
      for (const card of cards) {
        if (curH + card.h > viewH && cur.length > 0) {
          pages.push(cur);
          cur = [];
          curH = 0;
        }
        cur.push(card);
        curH += card.h + CELL_GAP;
      }
      if (cur.length > 0) pages.push(cur);
      return pages;
    };

    const full = split(this._availableHeight());
    return full.length > 1 ? split(this._availableHeight() - PAGER_H) : full;
  }

  private _buildPager(parent: Node, y: number, pageCount: number): void {
    const row = new Node('pager');
    row.layer = parent.layer;
    row.addComponent(UITransform).setContentSize(CONTENT_W, 64);
    row.setPosition(new Vec3(0, y, 0));
    parent.addChild(row);

    const mkBtn = (label: string, x: number, enabled: boolean, delta: number): void => {
      const btn = new Node(`page_${label}`);
      btn.layer = row.layer;
      btn.addComponent(UITransform).setContentSize(96, 56);
      btn.setPosition(new Vec3(x, 0, 0));
      row.addChild(btn);
      paintRoundRect(
        btn,
        96,
        56,
        16,
        enabled ? UI_COLORS.pillBg : LOCKED_BG,
        enabled ? UI_COLORS.pillBorder : LOCKED_BORDER,
      );
      addLabel(btn, label, {
        size: 26,
        color: enabled ? UI_COLORS.textBrown : TEXT_MUTED,
        bold: true,
      });
      if (!enabled) return;
      const zone = btn.addComponent(TapZoneComponent);
      zone.onTap = () => {
        this._page += delta;
        this._render();
      };
    };

    mkBtn('∧', -110, this._page > 0, -1);
    addLabel(row, `${this._page + 1}/${pageCount}`, { size: 24, color: TEXT_MUTED, bold: true });
    mkBtn('∨', 110, this._page < pageCount - 1, 1);
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
                  showPageToast(this.node, `${cat.items[i]?.name ?? itemId} 奖励 +1 钻石`);
                }
              },
              onDetail: () =>
                showItemDetail(this.node, {
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
      showItemDetail(this.node, {
        spritePath: getItemSpritePath(`mother_${catId}`),
        emoji: '',
        name: `${catName}工坊`,
        subtitle: '母棋',
      });
  }

  /* ─── 稀有 Tab：2 列展示卡 + 碎片点阵 ─── */

  private _buildRareTab(): { h: number; build: (parent: Node, y: number) => void }[] {
    const gm = GameManager.instance;
    const rares = CATEGORIES.filter(c => RARE_ITEM_BY_CATEGORY.has(c.id));
    const rows: { h: number; build: (parent: Node, y: number) => void }[] = [];

    for (let i = 0; i < rares.length; i += RARE_COLS) {
      const rowCats = rares.slice(i, i + RARE_COLS);
      rows.push({
        h: RARE_H,
        build: (parent: Node, y: number): void => {
          rowCats.forEach((cat, col) => {
            const rare = RARE_ITEM_BY_CATEGORY.get(cat.id)!;
            const x = -CONTENT_W / 2 + RARE_W / 2 + col * (RARE_W + RARE_GAP);
            this._buildRareCard(parent, new Vec3(x, y, 0), {
              id: rare.id,
              name: rare.name,
              emoji: rare.emoji,
              categoryName: cat.name,
              count: getShardCount(gm.shard, cat.id),
              required: getShardsRequired(cat.id),
              completed: isRareCompleted(gm.shard, cat.id),
            });
          });
        },
      });
    }
    return rows;
  }

  private _buildRareCard(
    parent: Node,
    pos: Vec3,
    info: {
      id: string;
      name: string;
      emoji: string;
      categoryName: string;
      count: number;
      required: number;
      completed: boolean;
    },
  ): void {
    const card = new Node(`rare_${info.id}`);
    card.layer = parent.layer;
    card.addComponent(UITransform).setContentSize(RARE_W, RARE_H);
    card.setPosition(pos);
    parent.addChild(card);

    const started = info.count > 0;
    paintRoundRect(
      card,
      RARE_W,
      RARE_H,
      22,
      info.completed ? new Color(255, 250, 255, 220) : started ? new Color(255, 255, 255, 140) : LOCKED_BG,
      // 完成态的描边交给流光组件逐帧重绘，这里不画静态描边
      info.completed ? undefined : started ? new Color(200, 160, 220, 110) : LOCKED_BORDER,
      2,
    );

    if (info.completed) {
      const border = makeNode(card, 'rainbow', RARE_W, new Vec3(0, 0, 0));
      const fx = border.addComponent(RainbowBorderEffect);
      fx.width = RARE_W;
      fx.height = RARE_H;
    }

    this._buildRareRing(card, info);

    addLabel(card, info.name, {
      size: 22,
      color: info.completed ? new Color(156, 39, 176, 255) : UI_COLORS.textBrown,
      bold: true,
      y: -6,
      width: RARE_W - 20,
    });
    addLabel(card, info.categoryName, {
      size: 18,
      color: TEXT_MUTED,
      y: -34,
      width: RARE_W - 20,
    });

    if (info.completed) {
      const badge = new Node('badge');
      badge.layer = card.layer;
      badge.addComponent(UITransform).setContentSize(120, 36);
      badge.setPosition(new Vec3(0, -RARE_H / 2 + 34, 0));
      card.addChild(badge);
      paintRoundRect(badge, 120, 36, 12, new Color(200, 109, 215, 255));
      addLabel(badge, '已收集', { size: 20, color: new Color(255, 255, 255, 255), bold: true });

      // 完成卡可点开详情（未完成的还不知道长什么样，保持不可点）
      const zone = card.addComponent(TapZoneComponent);
      zone.onTap = () =>
        showItemDetail(this.node, {
          spritePath: getItemSpritePath(info.id),
          emoji: info.emoji,
          name: info.name,
          subtitle: levelSubtitle(0, info.categoryName),
        });
      return;
    }

    this._buildShardDots(card, info.count, info.required);
    addLabel(card, `${info.count}/${info.required}`, {
      size: 20,
      color: started ? UNCLAIMED_STROKE : TEXT_MUTED,
      bold: true,
      y: -RARE_H / 2 + 24,
    });
  }

  /**
   * 稀有卡的圆形进度环 + 中心展示（Web .showcase-ring-wrap）。
   * 完成后中心 emoji 漂浮，四角撒粒子。
   */
  private _buildRareRing(
    card: Node,
    info: { id: string; emoji: string; count: number; required: number; completed: boolean },
  ): void {
    const ringY = RARE_H / 2 - 66;
    const ring = makeNode(card, 'ring', RING_R * 2 + RING_W, new Vec3(0, ringY, 0));
    drawProgressRing(
      ring,
      RING_R,
      RING_W,
      info.completed ? 1 : info.count / info.required,
      info.completed ? RING_COMPLETE : RING_PROGRESS,
    );

    if (!info.completed) {
      // 未完成：环心放锁，进度靠环 + 点阵表达
      addSprite(ring, LOCK_SPRITE, 40);
      return;
    }

    // 完成：环心 emoji 漂浮（稀有物品暂无贴图，emoji 即 Web .showcase-emoji）
    const center = makeNode(ring, 'center', RING_R * 2, new Vec3(0, 0, 0));
    center.addComponent(FloatEffect);
    addLabel(center, info.emoji, { size: 56, color: UI_COLORS.textBrown });

    RARE_PARTICLES.forEach((p, i) => {
      const node = makeNode(card, `particle_${i}`, p.size, new Vec3(p.x, ringY + p.y, 0));
      const fx = node.addComponent(SparkleEffect);
      fx.delay = p.delay;
      addLabel(node, i % 2 === 0 ? '✦' : '✧', { size: p.size, color: p.color });
    });
  }

  /** 碎片点阵（Web .shard-dots）：已得的点填金色 */
  private _buildShardDots(card: Node, count: number, required: number): void {
    const dot = 14;
    const gap = 6;
    const totalW = required * dot + (required - 1) * gap;
    const startX = -totalW / 2 + dot / 2;
    for (let i = 0; i < required; i++) {
      const d = new Node(`dot_${i}`);
      d.layer = card.layer;
      d.addComponent(UITransform).setContentSize(dot, dot);
      d.setPosition(new Vec3(startX + i * (dot + gap), -RARE_H / 2 + 54, 0));
      card.addChild(d);
      paintRoundRect(
        d,
        dot,
        dot,
        dot / 2,
        i < count ? UNCLAIMED_STROKE : new Color(216, 200, 216, 80),
        undefined,
      );
    }
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
          const headY = CHAIN_CARD_H / 2 - 30;
          addSprite(card, cg.icon, 32, headY).setPosition(
            new Vec3(-CONTENT_W / 2 + 40, headY, 0),
          );
          addLabel(card, cg.name, {
            size: 24,
            color: UI_COLORS.textBrown,
            bold: true,
            y: headY,
            width: 160,
            align: 'left',
            // 左对齐时 x 是节点中心，节点左缘 = x - width/2，要落在图标右侧
          }).node.setPosition(new Vec3(-CONTENT_W / 2 + 70 + 160 / 2, headY, 0));
          addLabel(card, `${unlockedCount}/${CHAIN_LEN}`, {
            size: 20,
            color: TEXT_MUTED,
            bold: true,
            y: headY,
            width: 100,
          }).node.setPosition(new Vec3(CONTENT_W / 2 - 60, headY, 0));

          this._buildChainNodes(card, cg.prefix, cg.icon);
        },
      };
    });
  }

  /** 合成链节点行：4 级方块 + 中间箭头 */
  private _buildChainNodes(card: Node, prefix: string, icon: string): void {
    const gm = GameManager.instance;
    const nodeW = 96;
    const span = (CONTENT_W - 80) / CHAIN_LEN;
    const startX = -CONTENT_W / 2 + 40 + span / 2;
    const rowY = -18;

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
      addSprite(box, unlocked ? icon : LOCK_SPRITE, unlocked ? 52 : 30);
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
