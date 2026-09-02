import { _decorator, Color, Component, Graphics, Label, Node, Sprite, UITransform, Vec3, Widget } from 'cc';

import { AD_DIAMOND_REWARD, GameManager } from '../../scripts/manager/GameManager';
import { addAlignedWidget, showPageToast } from '../../scripts/components/bundle-pages';
import { createScrollView, type ScrollView } from '../../scripts/components/drag-scroll';
import { TapZoneComponent } from '../../scripts/components/tap-zone';
import { getConfig } from '../../scripts/core/config';
import { loadSpriteFrame } from '../../scripts/components/sprite-loader';
import { CATEGORIES } from '../../scripts/data/items';
import type { ItemId } from '../../scripts/core/types';
import { playSfx } from '../../scripts/manager/AudioManager';
import { fontManager } from '../../scripts/core/font-manager';

const { ccclass } = _decorator;

/* ═══ 尺寸 ═══ */
const MARGIN = 16;
/** 内容区宽度（弹窗 body 宽 620 - 左右各 16 边距） */
const CONTENT_W = 620 - MARGIN * 2;
/** 顶部货币栏高度 */
const CURRENCY_BAR_H = 52;

const CARD_GAP = 12;
const CARD_RADIUS = 18;

/* 精力小卡片：2 列 */
const ENERGY_CARD_W = (CONTENT_W - CARD_GAP) / 2;
const ENERGY_CARD_H = 158;
/* 金币换精力：跨整行 */
const ENERGY_WIDE_H = 156;

/**
 * 精力卡片图标显示尺寸（保持原始宽高比，统一内容视觉大小）。
 * 经像素分析各图非透明内容区域，按内容高度 ≈68px 反推显示尺寸。
 */
const ENERGY_ICON_SIZES: Record<string, { w: number; h: number }> = {
  'play': { w: 51, h: 68 },
  'sprites/ui/energy_bolt': { w: 87, h: 87 },
  'sprites/currency/coin': { w: 90, h: 90 },
  'potion': { w: 51, h: 68 },
};

/* 钻石卡片：3 列 */
const DIAMOND_GAP = 24;
const DIAMOND_CARD_W = (CONTENT_W - DIAMOND_GAP * 2) / 3;
const DIAMOND_CARD_H = 210;
/* VIP 卡片跨两行高（对齐 Web 版特殊布局） */
const VIP_CARD_H = DIAMOND_CARD_H * 2 + CARD_GAP;

/* 物品商店卡片 — order-card 纹理背景（对齐 Web 版） */
const ITEM_CARD_W = 160;
const ITEM_CARD_H = 210;
const ITEM_CARD_GAP = 14;

/* ═══ 颜色（对齐 Web 版） ═══ */
const CARD_BG = new Color(255, 255, 255, 140);
const CARD_BORDER = new Color(212, 178, 140, 115);
const CARD_SHADOW = new Color(180, 140, 80, 25);

const TEXT_BROWN = new Color(92, 58, 30, 255);
const TEXT_LIGHT = new Color(155, 123, 90, 255);
const SECTION_LABEL = new Color(122, 82, 48, 255);
const SECTION_LINE = new Color(200, 170, 130, 80);

const DIM_BTN_BG = new Color(245, 166, 35, 150);
const DIM_TEXT = new Color(255, 255, 255, 200);

const PILL_BG = new Color(255, 248, 238, 255);
const PILL_BORDER = new Color(220, 200, 170, 255);

const BEST_VALUE_BG = new Color(220, 130, 80, 255);

/* ═══ 类型 ═══ */
type EnergyOption =
  | { id: string; label: string; amount: number; type: 'ad'; icon: string }
  | { id: string; label: string; amount: number; type: 'diamond'; diamondCost: number; icon: string }
  | { id: string; label: string; amount: number; type: 'coins'; coinCost: number; icon: string };

type DiamondIconType = 'play' | 'crown-diamond' | 'diamond-pile-small' | 'diamond-pile-large' | 'chest';

interface DiamondPackage {
  id: string;
  amount: number;
  label: string;
  price: number;
  currency: 'diamond' | 'coin' | 'free' | 'soon';
  badge?: 'vip' | 'best' | 'soon';
  subLabel?: string;
  iconType: DiamondIconType;
}

/* 钻石购买档位（对齐 Web 版：5 档 3 列布局） */
const DIAMOND_PACKAGES: readonly DiamondPackage[] = [
  { id: 'd3', amount: 3, label: '3 钻石', price: 0, currency: 'free', iconType: 'play' },
  { id: 'd15', amount: 15, label: '15 钻石', price: 0, currency: 'soon', badge: 'vip', subLabel: '每日领取', iconType: 'crown-diamond' },
  { id: 'd50', amount: 50, label: '50 钻石', price: 0, currency: 'soon', iconType: 'diamond-pile-small' },
  { id: 'd80', amount: 80, label: '80 钻石', price: 0, currency: 'soon', badge: 'best', iconType: 'diamond-pile-large' },
  { id: 'd120', amount: 120, label: '120 钻石', price: 0, currency: 'soon', iconType: 'chest' },
];

/* 物品商店：面包类 Lv.3~Lv.6（对齐 Web 版获取物品） */
const SHOP_ITEMS = CATEGORIES[0].items.slice(2, 6).map((item, i) => {
  const level = i + 3;
  return {
    name: item.name,
    level,
    price: 50 + i * 30,
    emoji: item.emoji,
    spritePath: `sprites/items/bread/bread_${level}`,
    itemId: `bread_${level}` as ItemId,
  };
});

/**
 * 商店页（store 分包）— 对齐 Web ShopFullView 视觉风格。
 * 顶部：货币栏（金币 + 钻石药丸）。
 * 内容：补充精力（4小卡+1大卡）、获取物品（横向滚动）、获取钻石（VIP跨两行布局）。
 *
 * 已移除盲盒 Tab，与抖音端商店逻辑与样式对齐。
 */
@ccclass('StorePageComponent')
export class StorePageComponent extends Component {
  private _content: Node | null = null;
  private _scroll: ScrollView | null = null;
  private _coinLabel: Label | null = null;
  private _diamondLabel: Label | null = null;
  private _busy = false;

  private readonly _onChanged = (): void => {
    this._updateCurrency();
    this._render();
  };

  protected onLoad(): void {
    try {
      console.info('[StorePage] onLoad start');
      const gm = GameManager.instance;
      gm.events.on('economy:changed', this._onChanged);
      gm.events.on('energy:changed', this._onChanged);
      gm.events.on('daily:changed', this._onChanged);

      // 顶部货币栏（金币 + 钻石药丸）
      this._buildCurrencyBar();

      // 滚动内容区：直接挂在 body 上，顶部对齐货币栏下方，底部留边距
      // （不用 viewport 中间层，避免嵌套 Widget 导致滚动视图尺寸/命中区域异常）
      const bodyUi = this.node.getComponent(UITransform)!;
      const viewH = Math.max(1, bodyUi.height - CURRENCY_BAR_H - 16 - 20);

      this._scroll = createScrollView(this.node, CONTENT_W, viewH);
      addAlignedWidget(this._scroll.view, {
        isAlignTop: true,
        isAlignBottom: true,
        top: CURRENCY_BAR_H + 8,
        bottom: 32,
      });
      this._content = this._scroll.content;

      this._render();
      console.info('[StorePage] render done');
    } catch (e) {
      console.error('[StorePage] onLoad failed:', e);
      try {
        const errNode = new Node('errorHint');
        errNode.layer = this.node.layer;
        errNode.addComponent(UITransform).setContentSize(CONTENT_W, 60);
        this.node.addChild(errNode);
        const errLabel = errNode.addComponent(Label);
        errLabel.string = '商店加载失败，请重试';
        errLabel.fontSize = 24;
        errLabel.color = new Color(150, 80, 60, 255);
        errLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
      } catch (_) { /* ignore */ }
    }
  }

  protected onDestroy(): void {
    const gm = GameManager.instance;
    gm.events.off('economy:changed', this._onChanged);
    gm.events.off('energy:changed', this._onChanged);
    gm.events.off('daily:changed', this._onChanged);
  }

  /** 向上找到弹窗根节点（用于 showPageToast，避免被面板裁剪） */
  private _getModalRoot(): Node {
    let n: Node | null = this.node;
    while (n && !n.name.startsWith('Modal_')) {
      n = n.parent;
    }
    return n ?? this.node;
  }

  /* ═══════════════════════════════════════
     顶部货币栏
     ═══════════════════════════════════════ */

  private _buildCurrencyBar(): void {
    const bar = new Node('currencyBar');
    bar.layer = this.node.layer;
    bar.addComponent(UITransform).setContentSize(CONTENT_W, CURRENCY_BAR_H);
    this.node.addChild(bar);
    const bw = bar.addComponent(Widget);
    bw.isAlignTop = true;
    bw.isAlignLeft = true;
    bw.isAlignRight = true;
    bw.top = 0;
    bw.left = MARGIN;
    bw.right = MARGIN;
    bw.alignMode = Widget.AlignMode.ALWAYS;
    bw.updateAlignment();

    // 金币药丸（靠右）
    const coinPill = this._buildCurrencyPill('coin', gm => gm.economy.coins);
    coinPill.setPosition(new Vec3(CONTENT_W / 2 - 40 - 5, 0, 0));
    bar.addChild(coinPill);

    // 钻石药丸（金币左边）
    const diamondPill = this._buildCurrencyPill('diamond', gm => gm.economy.diamonds);
    diamondPill.setPosition(new Vec3(CONTENT_W / 2 - 40 - 5 - 80 - 10, 0, 0));
    bar.addChild(diamondPill);
  }

  private _buildCurrencyPill(kind: 'coin' | 'diamond', getter: (gm: GameManager) => number): Node {
    const gm = GameManager.instance;
    const pill = new Node(`${kind}Pill`);
    pill.layer = this.node.layer;
    pill.addComponent(UITransform).setContentSize(80, 36);
    const g = pill.addComponent(Graphics);
    g.fillColor = PILL_BG;
    g.roundRect(-40, -18, 80, 36, 18);
    g.fill();
    g.lineWidth = 1.5;
    g.strokeColor = PILL_BORDER;
    g.roundRect(-40, -18, 80, 36, 18);
    g.stroke();

    // 货币图标
    const iconNode = new Node('icon');
    iconNode.layer = pill.layer;
    iconNode.addComponent(UITransform).setContentSize(22, 22);
    iconNode.setPosition(new Vec3(-24, 0, 0));
    pill.addChild(iconNode);
    const sprite = iconNode.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    loadSpriteFrame(kind === 'coin' ? 'sprites/currency/coin' : 'sprites/currency/diamond', sf => {
      if (sf && sprite.isValid) sprite.spriteFrame = sf;
    });

    // 数值
    const labelNode = new Node('value');
    labelNode.layer = pill.layer;
    labelNode.addComponent(UITransform).setContentSize(42, 30);
    labelNode.setPosition(new Vec3(8, 0, 0));
    pill.addChild(labelNode);
    const label = labelNode.addComponent(Label);
    label.string = String(getter(gm));
    label.fontSize = 16;
    label.lineHeight = 20;
    label.isBold = true;
    label.color = TEXT_BROWN;
    label.horizontalAlign = Label.HorizontalAlign.LEFT;

    if (kind === 'coin') this._coinLabel = label;
    else this._diamondLabel = label;

    return pill;
  }

  private _updateCurrency(): void {
    const gm = GameManager.instance;
    if (this._coinLabel) this._coinLabel.string = String(gm.economy.coins);
    if (this._diamondLabel) this._diamondLabel.string = String(gm.economy.diamonds);
  }

  /* ═══════════════════════════════════════
     内容渲染
     ═══════════════════════════════════════ */

  private _render(): void {
    const content = this._content;
    const scroll = this._scroll;
    if (!content || !content.isValid || !scroll) return;
    content.removeAllChildren();

    const viewH = scroll.view.getComponent(UITransform)?.height ?? 800;
    let y = viewH / 2 - 10;

    // ═══ 补充精力 ═══
    y = this._buildSectionHeader(content, y, 'sprites/currency/coin', '补充精力');
    y -= 20;
    y = this._buildEnergyGrid(content, y);
    y -= 24;

    // ═══ 获取物品 ═══
    y = this._buildSectionHeader(content, y, 'sprites/ui/energy_bolt', '获取物品');
    y -= 20;
    y = this._buildItemShop(content, y);
    y -= 24;

    // ═══ 获取钻石 ═══
    y = this._buildSectionHeader(content, y, 'sprites/currency/diamond', '获取钻石');
    y -= 20;
    y = this._buildDiamondGrid(content, y);

    const totalH = viewH / 2 - y + 56;
    const finalH = Math.max(totalH, viewH);
    scroll.setContentHeight(finalH);
    // content 高度从 viewH 变为 finalH 后，锚点在中心，顶部上移了 (finalH-viewH)/2，
    // 子节点需要同步上移同样距离，才能保持相对于 content 顶部的位置不变
    if (finalH > viewH) {
      const shift = (finalH - viewH) / 2;
      for (const child of content.children) {
        const p = child.position;
        child.setPosition(new Vec3(p.x, p.y + shift, p.z));
      }
    }

    fontManager.applyFontToTree(this.node);
  }

  /** 区块标题：图片图标 + 文字居中，两侧装饰线（对齐 Web 版 section-ico + section-label） */
  private _buildSectionHeader(parent: Node, topY: number, iconPath: string, label: string): number {
    const row = new Node('sectionHd');
    row.layer = parent.layer;
    row.addComponent(UITransform).setContentSize(CONTENT_W, 32);
    row.setPosition(new Vec3(0, topY - 16, 0));
    parent.addChild(row);

    // 左侧虚线
    const leftLine = new Node('lineL');
    leftLine.layer = row.layer;
    leftLine.addComponent(UITransform).setContentSize(100, 2);
    leftLine.setPosition(new Vec3(-145, 0, 0));
    row.addChild(leftLine);
    const lg = leftLine.addComponent(Graphics);
    for (let i = 0; i < 7; i++) {
      lg.fillColor = SECTION_LINE;
      lg.rect(-50 + i * 15, -1, 7, 2);
      lg.fill();
    }

    // 右侧虚线
    const rightLine = new Node('lineR');
    rightLine.layer = row.layer;
    rightLine.addComponent(UITransform).setContentSize(100, 2);
    rightLine.setPosition(new Vec3(145, 0, 0));
    row.addChild(rightLine);
    const rg = rightLine.addComponent(Graphics);
    for (let i = 0; i < 7; i++) {
      rg.fillColor = SECTION_LINE;
      rg.rect(-50 + i * 15, -1, 7, 2);
      rg.fill();
    }

    // 图片图标 + 文字（水平居中排列）
    const ICON_SIZE = 26;
    const ICON_LABEL_GAP = 8;
    const labelWidth = label.length * 19 + 10;
    const totalWidth = ICON_SIZE + ICON_LABEL_GAP + labelWidth;
    const startX = -totalWidth / 2;

    // 图片图标
    const iconNode = new Node('icon');
    iconNode.layer = row.layer;
    iconNode.addComponent(UITransform).setContentSize(ICON_SIZE, ICON_SIZE);
    iconNode.setPosition(new Vec3(startX + ICON_SIZE / 2, 0, 0));
    row.addChild(iconNode);
    const iconSprite = iconNode.addComponent(Sprite);
    iconSprite.sizeMode = Sprite.SizeMode.CUSTOM;
    loadSpriteFrame(iconPath, sf => {
      if (sf && iconSprite.isValid) iconSprite.spriteFrame = sf;
    });

    // 文字
    const labelNode = new Node('label');
    labelNode.layer = row.layer;
    labelNode.addComponent(UITransform).setContentSize(labelWidth, 32);
    labelNode.setPosition(new Vec3(startX + ICON_SIZE + ICON_LABEL_GAP + labelWidth / 2, 0, 0));
    row.addChild(labelNode);
    const labelComp = labelNode.addComponent(Label);
    labelComp.string = label;
    labelComp.fontSize = 19;
    labelComp.lineHeight = 24;
    labelComp.isBold = true;
    labelComp.color = SECTION_LABEL;

    return topY - 32;
  }

  /* ═══ 精力卡片：4 张小卡（2列）+ 1 张大卡（跨整行） ═══ */
  private _buildEnergyGrid(parent: Node, topY: number): number {
    const opts = this._energyOptions();
    let y = topY;

    // 前 4 个：2 列小卡
    const smallOpts = opts.slice(0, 4);
    for (let i = 0; i < smallOpts.length; i += 2) {
      const left = smallOpts[i];
      const right = smallOpts[i + 1];
      const cardY = y - ENERGY_CARD_H / 2;
      if (left) this._buildEnergyCard(parent, -CONTENT_W / 2 + ENERGY_CARD_W / 2, cardY, left);
      if (right) this._buildEnergyCard(parent, CONTENT_W / 2 - ENERGY_CARD_W / 2, cardY, right);
      y -= ENERGY_CARD_H + CARD_GAP;
    }

    // 最后 1 个：跨整行大卡（金币换精力）
    const wideOpt = opts[4] as Extract<EnergyOption, { type: 'coins' }> | undefined;
    if (wideOpt) {
      const cardY = y - ENERGY_WIDE_H / 2;
      this._buildWideEnergyCard(parent, cardY, wideOpt);
      y -= ENERGY_WIDE_H + CARD_GAP;
    }

    return y;
  }

  /** 精力小卡片：左侧大图标 + 右侧文字+按钮 */
  private _buildEnergyCard(parent: Node, x: number, y: number, opt: EnergyOption): void {
    const gm = GameManager.instance;
    const card = new Node(`energy_${opt.id}`);
    card.layer = parent.layer;
    card.addComponent(UITransform).setContentSize(ENERGY_CARD_W, ENERGY_CARD_H);
    card.setPosition(new Vec3(x, y, 0));
    parent.addChild(card);

    this._drawCardBg(card, ENERGY_CARD_W, ENERGY_CARD_H);

    // 左侧大图标（保持原始宽高比，统一内容视觉大小）
    const iconX = -ENERGY_CARD_W / 2 + 48;
    const sz = ENERGY_ICON_SIZES[opt.icon] ?? { w: 80, h: 80 };
    this._buildIcon(card, iconX, 6, 92, opt.icon, sz.w, sz.h);

    // 右侧文字区
    const rightCenterX = 42;
    const titleLabel = this._makeLabel(card, opt.label, 20, TEXT_BROWN, true);
    titleLabel.node.getComponent(UITransform)!.setContentSize(160, 26);
    titleLabel.node.getComponent(UITransform)!.setAnchorPoint(0.5, 0.5);
    titleLabel.node.setPosition(new Vec3(rightCenterX, 32, 0));
    titleLabel.horizontalAlign = Label.HorizontalAlign.CENTER;

    const descLabel = this._makeLabel(card, `+${opt.amount} 精力`, 15, TEXT_LIGHT, false);
    descLabel.node.getComponent(UITransform)!.setContentSize(160, 20);
    descLabel.node.getComponent(UITransform)!.setAnchorPoint(0.5, 0.5);
    descLabel.node.setPosition(new Vec3(rightCenterX, 6, 0));
    descLabel.horizontalAlign = Label.HorizontalAlign.CENTER;

    // 底部按钮
    let btnLabel: string;
    let btnIcon: 'play' | 'diamond' | 'coin';
    let enabled: boolean;
    const energyFull = gm.energy.current >= gm.energy.max;

    if (opt.type === 'ad') {
      btnLabel = '免费看';
      btnIcon = 'play';
      enabled = !energyFull;
    } else if (opt.type === 'diamond') {
      btnLabel = `${opt.diamondCost}`;
      btnIcon = 'diamond';
      enabled = !energyFull && gm.economy.diamonds >= opt.diamondCost;
    } else {
      btnLabel = `${opt.coinCost}`;
      btnIcon = 'coin';
      enabled = !energyFull && gm.coinRefillRemaining > 0 && gm.economy.coins >= opt.coinCost;
    }

    this._buildOrangeButton(card, rightCenterX, -34, 120, 38, btnLabel, btnIcon, enabled, () => void this._onBuy(opt));
    // 始终允许点击：钻石/金币不足时 _onBuy 会给出提示
    card.addComponent(TapZoneComponent).onTap = () => void this._onBuy(opt);
  }

  /** 金币换精力大卡片：左金币图标 + 中上文字居中 + 底部长按钮 */
  private _buildWideEnergyCard(parent: Node, y: number, opt: Extract<EnergyOption, { type: 'coins' }>): void {
    const gm = GameManager.instance;
    const card = new Node(`energy_${opt.id}`);
    card.layer = parent.layer;
    card.addComponent(UITransform).setContentSize(CONTENT_W, ENERGY_WIDE_H);
    card.setPosition(new Vec3(0, y, 0));
    parent.addChild(card);

    this._drawCardBg(card, CONTENT_W, ENERGY_WIDE_H);

    // 左侧金币图标
    const iconX = -CONTENT_W / 2 + 62;
    const coinSz = ENERGY_ICON_SIZES['sprites/currency/coin'] ?? { w: 80, h: 80 };
    const wideScale = 96 / 92;
    this._buildIcon(card, iconX, 0, 96, 'sprites/currency/coin',
      Math.round(coinSz.w * wideScale), Math.round(coinSz.h * wideScale),
    );

    // 右侧内容区
    const contentLeft = iconX + 76;
    const contentRight = CONTENT_W / 2 - 20;
    const contentW = contentRight - contentLeft;
    const contentCenterX = (contentLeft + contentRight) / 2;

    // 文字区
    const titleLabel = this._makeLabel(card, opt.label, 20, TEXT_BROWN, true);
    titleLabel.node.getComponent(UITransform)!.setContentSize(contentW, 26);
    titleLabel.node.getComponent(UITransform)!.setAnchorPoint(0.5, 0.5);
    titleLabel.node.setPosition(new Vec3(contentCenterX, 36, 0));
    titleLabel.horizontalAlign = Label.HorizontalAlign.CENTER;

    const descLabel = this._makeLabel(card, `+${opt.amount} 精力`, 15, TEXT_LIGHT, false);
    descLabel.node.getComponent(UITransform)!.setContentSize(contentW, 20);
    descLabel.node.getComponent(UITransform)!.setAnchorPoint(0.5, 0.5);
    descLabel.node.setPosition(new Vec3(contentCenterX, 10, 0));
    descLabel.horizontalAlign = Label.HorizontalAlign.CENTER;

    // 底部长按钮
    const left = gm.coinRefillRemaining;
    const limit = getConfig().energy.coinRefillDailyLimit;
    const btnText = `${opt.coinCost}  ${left}/${limit}`;
    const energyFull = gm.energy.current >= gm.energy.max;
    const enabled = !energyFull && left > 0 && gm.economy.coins >= opt.coinCost;
    this._buildOrangeButton(card, contentCenterX, -30, contentW, 42, btnText, 'coin', enabled, () => void this._onBuy(opt));
    card.addComponent(TapZoneComponent).onTap = () => void this._onBuy(opt);
  }

  /* ═══ 获取物品：横向滚动卡片 ═══ */
  private _buildItemShop(parent: Node, topY: number): number {
    const rowH = ITEM_CARD_H;

    // 横向滚动区
    const scroll = createScrollView(parent, CONTENT_W, rowH, 'horizontal');
    scroll.view.setPosition(new Vec3(0, topY - rowH / 2, 0));

    // 内容总宽度
    const totalW = SHOP_ITEMS.length * ITEM_CARD_W + (SHOP_ITEMS.length - 1) * ITEM_CARD_GAP;

    // 卡片从左到右排列
    const startX = -totalW / 2 + ITEM_CARD_W / 2;
    SHOP_ITEMS.forEach((item, i) => {
      const x = startX + i * (ITEM_CARD_W + ITEM_CARD_GAP);
      this._buildItemCard(scroll.content, x, item);
    });

    scroll.setContentWidth(totalW);

    return topY - rowH;
  }

  private _buildItemCard(parent: Node, x: number, item: { name: string; level: number; price: number; emoji: string; spritePath: string; itemId: ItemId }): void {
    const gm = GameManager.instance;
    const card = new Node(`item_${item.name}`);
    card.layer = parent.layer;
    card.addComponent(UITransform).setContentSize(ITEM_CARD_W, ITEM_CARD_H);
    card.setPosition(new Vec3(x, 0, 0));
    parent.addChild(card);

    // order-card 纹理背景
    const bgSprite = card.addComponent(Sprite);
    bgSprite.sizeMode = Sprite.SizeMode.CUSTOM;
    loadSpriteFrame('sprites/bg/order-card', sf => {
      if (sf && bgSprite.isValid) bgSprite.spriteFrame = sf;
    });

    // 物品大图
    const iconNode = new Node('icon');
    iconNode.layer = card.layer;
    iconNode.addComponent(UITransform).setContentSize(96, 96);
    iconNode.setPosition(new Vec3(0, ITEM_CARD_H / 2 - 70, 0));
    card.addChild(iconNode);
    const sprite = iconNode.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    loadSpriteFrame(item.spritePath, sf => {
      if (sf && sprite.isValid) sprite.spriteFrame = sf;
    });

    // 名称
    const nameLabel = this._makeLabel(card, item.name, 17, TEXT_BROWN, true);
    nameLabel.node.getComponent(UITransform)!.setContentSize(ITEM_CARD_W - 16, 20);
    nameLabel.node.setPosition(new Vec3(0, -18, 0));
    nameLabel.overflow = Label.Overflow.SHRINK;

    // 等级
    const lvLabel = this._makeLabel(card, `Lv.${item.level}`, 13, TEXT_LIGHT, false);
    lvLabel.node.setPosition(new Vec3(0, -40, 0));

    // 底部金币按钮
    const canAfford = gm.economy.coins >= item.price;
    this._buildGoldButton(card, 0, -ITEM_CARD_H / 2 + 22, 83, 28, item.price, canAfford, () => {
      const ok = gm.buyShopItem(item.itemId, item.price);
      if (ok) {
        playSfx('purchase');
        showPageToast(this._getModalRoot(), `${item.name} 已收进背包`);
      } else if (gm.economy.coins < item.price) {
        playSfx('error');
        showPageToast(this._getModalRoot(), '金币不足哦');
      } else {
        playSfx('error');
        showPageToast(this._getModalRoot(), '背包和棋盘都满啦，先腾点格子吧');
      }
    });
  }

  /* ═══ 获取钻石：特殊布局（VIP 卡片跨两行） ═══ */
  private _buildDiamondGrid(parent: Node, topY: number): number {
    const xLeft = -CONTENT_W / 2 + DIAMOND_CARD_W / 2;
    const xMid = 0;
    const xRight = CONTENT_W / 2 - DIAMOND_CARD_W / 2;

    // 第一行：d3(左)、d50(右)，中间留空给 VIP 卡片
    const y1 = topY - DIAMOND_CARD_H / 2;
    this._buildDiamondCard(parent, xLeft, y1, DIAMOND_PACKAGES[0]);
    this._buildDiamondCard(parent, xRight, y1, DIAMOND_PACKAGES[2]);

    // VIP 卡片（跨两行，占据中间列）
    const vipY = topY - VIP_CARD_H / 2;
    this._buildDiamondCard(parent, xMid, vipY, DIAMOND_PACKAGES[1]);

    // 第二行：d80(左)、d120(右)
    const y2 = topY - (DIAMOND_CARD_H + CARD_GAP) - DIAMOND_CARD_H / 2;
    this._buildDiamondCard(parent, xLeft, y2, DIAMOND_PACKAGES[3]);
    this._buildDiamondCard(parent, xRight, y2, DIAMOND_PACKAGES[4]);

    return topY - VIP_CARD_H;
  }

  private _buildDiamondCard(parent: Node, x: number, y: number, pkg: DiamondPackage): void {
    const isVip = pkg.badge === 'vip';
    const cardH = isVip ? VIP_CARD_H : DIAMOND_CARD_H;

    const card = new Node(`diamond_${pkg.id}`);
    card.layer = parent.layer;
    card.addComponent(UITransform).setContentSize(DIAMOND_CARD_W, cardH);
    card.setPosition(new Vec3(x, y, 0));
    parent.addChild(card);

    this._drawCardBg(card, DIAMOND_CARD_W, cardH);

    // VIP 丝带角标（左上角，代码绘制）
    if (pkg.badge === 'vip') {
      const badge = new Node('badge');
      badge.layer = card.layer;
      badge.addComponent(UITransform).setContentSize(44, 70);
      badge.setPosition(new Vec3(-DIAMOND_CARD_W / 2 + 12, cardH / 2 - 14, 0));
      card.addChild(badge);
      const bg = badge.addComponent(Graphics);
      // 丝带形状（简化为金色圆角矩形 + VIP 文字）
      bg.fillColor = new Color(255, 180, 60, 255);
      bg.roundRect(-22, -35, 44, 70, 8);
      bg.fill();
      bg.strokeColor = new Color(200, 130, 30, 255);
      bg.lineWidth = 1.5;
      bg.roundRect(-22, -35, 44, 70, 8);
      bg.stroke();
      const vipLabel = this._makeLabel(badge, 'VIP', 14, Color.WHITE, true);
      vipLabel.node.setPosition(new Vec3(0, 0, 0));
      vipLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
    }

    // Best Value 圆形角标（右上角）
    if (pkg.badge === 'best') {
      const bvBadge = new Node('bestValueBadge');
      bvBadge.layer = card.layer;
      bvBadge.addComponent(UITransform).setContentSize(44, 44);
      bvBadge.setPosition(new Vec3(DIAMOND_CARD_W / 2 - 6, cardH / 2 - 14, 0));
      card.addChild(bvBadge);
      const bvg = bvBadge.addComponent(Graphics);
      bvg.fillColor = new Color(190, 100, 60, 255);
      bvg.circle(0, 0, 22);
      bvg.fill();
      bvg.fillColor = BEST_VALUE_BG;
      bvg.circle(0, 0, 19.5);
      bvg.fill();
      bvg.fillColor = new Color(240, 200, 120, 255);
      for (let i = 0; i < 12; i++) {
        const ang = (i / 12) * Math.PI * 2;
        bvg.circle(Math.cos(ang) * 21, Math.sin(ang) * 21, 2);
        bvg.fill();
      }
      const bvLabel = this._makeLabel(bvBadge, 'Best\nValue', 8, Color.WHITE, true);
      bvLabel.node.setPosition(new Vec3(0, 0, 0));
      bvLabel.lineHeight = 9;
      bvLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
    }

    // 图标区
    const iconSize = isVip ? 136 : 104;
    const iconY = isVip ? cardH / 2 - 135 : cardH / 2 - 56;
    const iconNode = new Node('icon');
    iconNode.layer = card.layer;
    iconNode.addComponent(UITransform).setContentSize(iconSize, iconSize);
    iconNode.setPosition(new Vec3(0, iconY, 0));
    card.addChild(iconNode);
    this._drawDiamondIcon(iconNode, pkg.iconType);

    // 数量文字
    const amountY = isVip ? -10 : -14;
    const amountLabel = this._makeLabel(card, pkg.label, isVip ? 20 : 18, TEXT_BROWN, true);
    amountLabel.node.setPosition(new Vec3(0, amountY, 0));

    // 副文字
    if (pkg.subLabel) {
      const subY = isVip ? -32 : -34;
      const subLabel = this._makeLabel(card, pkg.subLabel, isVip ? 14 : 12, TEXT_LIGHT, false);
      subLabel.node.setPosition(new Vec3(0, subY, 0));
    }

    // 底部按钮
    const isSoon = pkg.currency === 'soon';
    const btnLabel = isSoon ? '敬请期待' : pkg.currency === 'free' ? '免费' : `${pkg.price}`;
    const btnIcon = isSoon ? null : pkg.currency === 'free' ? 'play' : 'diamond';
    const btnY = isVip ? -cardH / 2 + 95 : -cardH / 2 + 36;
    const btnW = isVip ? DIAMOND_CARD_W - 40 : DIAMOND_CARD_W - 56;
    const btnH = isVip ? 40 : 34;
    this._buildOrangeButton(card, 0, btnY, btnW, btnH, btnLabel, btnIcon, !isSoon, () => {
      if (pkg.currency === 'free') void this._onWatchAdForDiamonds();
      else showPageToast(this._getModalRoot(), `${pkg.label}（开发中）`);
    });
  }

  /* ═══════════════════════════════════════
     通用卡片/按钮构件
     ═══════════════════════════════════════ */

  /** 卡片底色 + 阴影 + 边框 */
  private _drawCardBg(node: Node, w: number, h: number): void {
    const g = node.addComponent(Graphics);
    g.fillColor = CARD_SHADOW;
    g.roundRect(-w / 2 + 2, -h / 2 - 5, w, h, CARD_RADIUS);
    g.fill();
    g.fillColor = CARD_BG;
    g.roundRect(-w / 2, -h / 2, w, h, CARD_RADIUS);
    g.fill();
    g.fillColor = new Color(255, 255, 255, 60);
    g.roundRect(-w / 2 + 3, h / 2 - 16, w - 6, 12, 6);
    g.fill();
    g.lineWidth = 1.5;
    g.strokeColor = CARD_BORDER;
    g.roundRect(-w / 2, -h / 2, w, h, CARD_RADIUS);
    g.stroke();
  }

  /** 橙色渐变按钮（精力/钻石用） */
  private _buildOrangeButton(
    parent: Node, x: number, y: number, w: number, h: number,
    label: string, iconKind: 'play' | 'diamond' | 'coin' | null,
    enabled: boolean, onTap: () => void,
  ): void {
    const btn = new Node('orangeBtn');
    btn.layer = parent.layer;
    btn.addComponent(UITransform).setContentSize(w, h);
    btn.setPosition(new Vec3(x, y, 0));
    parent.addChild(btn);

    const g = btn.addComponent(Graphics);
    const r = h / 2;
    if (enabled) {
      g.fillColor = new Color(170, 105, 25, 60);
      g.roundRect(-w / 2 + 1, -h / 2 - 2, w, h, r);
      g.fill();
      g.fillColor = new Color(245, 166, 35, 255);
      g.roundRect(-w / 2, -h / 2, w, h, r);
      g.fill();
      g.fillColor = new Color(255, 240, 200, 100);
      g.roundRect(-w / 2 + 4, h / 2 - 8, w - 8, 4, 2);
      g.fill();
      g.lineWidth = 1.5;
      g.strokeColor = new Color(210, 120, 30, 255);
      g.roundRect(-w / 2, -h / 2, w, h, r);
      g.stroke();
    } else {
      g.fillColor = DIM_BTN_BG;
      g.roundRect(-w / 2, -h / 2, w, h, r);
      g.fill();
    }

    // 图标 + 文字
    const iconSize = 18;
    const iconGap = 3;
    const fontSize = 14;
    const estimatedTextW = label.length * fontSize;
    const groupW = iconKind ? (iconSize + iconGap + estimatedTextW) : estimatedTextW;
    const groupLeft = -groupW / 2;

    if (iconKind) {
      const iconNode = new Node('icon');
      iconNode.layer = btn.layer;
      iconNode.addComponent(UITransform).setContentSize(iconSize, iconSize);
      iconNode.setPosition(new Vec3(groupLeft + iconSize / 2, 0, 0));
      btn.addChild(iconNode);
      if (iconKind === 'play') {
        const pg = iconNode.addComponent(Graphics);
        pg.fillColor = new Color(255, 193, 7, 255);
        pg.moveTo(-5, -8);
        pg.lineTo(7, 0);
        pg.lineTo(-5, 8);
        pg.close();
        pg.fill();
      } else {
        const sprite = iconNode.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        const path = iconKind === 'diamond' ? 'sprites/currency/diamond' : 'sprites/currency/coin';
        loadSpriteFrame(path, sf => {
          if (sf && sprite.isValid) sprite.spriteFrame = sf;
        });
      }
    }

    const labelNode = new Node('label');
    labelNode.layer = btn.layer;
    labelNode.addComponent(UITransform).setContentSize(estimatedTextW + 4, h - 4);
    const textX = iconKind ? (groupLeft + iconSize + iconGap + estimatedTextW / 2) : 0;
    labelNode.setPosition(new Vec3(textX, 0, 0));
    btn.addChild(labelNode);
    const labelComp = labelNode.addComponent(Label);
    labelComp.string = label;
    labelComp.fontSize = fontSize;
    labelComp.lineHeight = h - 4;
    labelComp.isBold = true;
    labelComp.color = enabled ? new Color(255, 248, 230, 255) : DIM_TEXT;
    labelComp.horizontalAlign = Label.HorizontalAlign.CENTER;
    labelComp.overflow = Label.Overflow.SHRINK;

    if (enabled) btn.addComponent(TapZoneComponent).onTap = onTap;
  }

  /** 金色购买按钮（物品用） */
  private _buildGoldButton(
    parent: Node, x: number, y: number, w: number, h: number,
    price: number, enabled: boolean, onTap: () => void,
  ): void {
    const btn = new Node('goldBtn');
    btn.layer = parent.layer;
    btn.addComponent(UITransform).setContentSize(w, h);
    btn.setPosition(new Vec3(x, y, 0));
    parent.addChild(btn);

    const g = btn.addComponent(Graphics);
    const r = h / 2;
    if (enabled) {
      g.fillColor = new Color(170, 105, 25, 60);
      g.roundRect(-w / 2 + 1, -h / 2 - 2, w, h, r);
      g.fill();
      g.fillColor = new Color(245, 166, 35, 255);
      g.roundRect(-w / 2, -h / 2, w, h, r);
      g.fill();
      g.fillColor = new Color(255, 240, 200, 100);
      g.roundRect(-w / 2 + 4, h / 2 - 8, w - 8, 4, 2);
      g.fill();
      g.lineWidth = 1.5;
      g.strokeColor = new Color(210, 120, 30, 255);
      g.roundRect(-w / 2, -h / 2, w, h, r);
      g.stroke();
    } else {
      g.fillColor = DIM_BTN_BG;
      g.roundRect(-w / 2, -h / 2, w, h, r);
      g.fill();
    }

    // 金币图标 + 价格文字
    const priceStr = String(price);
    const iconSize = 18;
    const iconGap = 6;
    const fontSize = 16;
    const estimatedTextW = priceStr.length * fontSize;
    const groupW = iconSize + iconGap + estimatedTextW;
    const groupLeft = -groupW / 2;

    const iconNode = new Node('icon');
    iconNode.layer = btn.layer;
    iconNode.addComponent(UITransform).setContentSize(iconSize, iconSize);
    iconNode.setPosition(new Vec3(groupLeft + iconSize / 2, 0, 0));
    btn.addChild(iconNode);
    const sprite = iconNode.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    loadSpriteFrame('sprites/currency/coin', sf => {
      if (sf && sprite.isValid) sprite.spriteFrame = sf;
    });

    const labelNode = new Node('label');
    labelNode.layer = btn.layer;
    labelNode.addComponent(UITransform).setContentSize(estimatedTextW + 4, h - 4);
    labelNode.setPosition(new Vec3(groupLeft + iconSize + iconGap + estimatedTextW / 2, 0, 0));
    btn.addChild(labelNode);
    const labelComp = labelNode.addComponent(Label);
    labelComp.string = priceStr;
    labelComp.fontSize = fontSize;
    labelComp.lineHeight = h - 4;
    labelComp.isBold = true;
    labelComp.color = enabled ? new Color(255, 248, 230, 255) : DIM_TEXT;
    labelComp.horizontalAlign = Label.HorizontalAlign.CENTER;
    labelComp.overflow = Label.Overflow.SHRINK;

    if (enabled) btn.addComponent(TapZoneComponent).onTap = onTap;
  }

  private _makeLabel(parent: Node, text: string, size: number, color: Color, bold: boolean): Label {
    const node = new Node('label');
    node.layer = parent.layer;
    node.addComponent(UITransform);
    parent.addChild(node);
    const label = node.addComponent(Label);
    label.string = text;
    label.fontSize = size;
    label.lineHeight = size * 1.3;
    label.isBold = bold;
    label.color = color;
    label.overflow = Label.Overflow.SHRINK;
    return label;
  }

  /**
   * 构建图标（无圆形底座，直接显示图标）。
   * @param size 外框区域尺寸（用于定位居中）
   * @param iconKey 图标标识：图片路径或 'play' / 'potion' 代码绘制
   * @param iconW 图标实际显示宽度
   * @param iconH 图标实际显示高度
   */
  private _buildIcon(
    parent: Node, x: number, y: number, size: number,
    iconKey: string, iconW: number, iconH: number,
  ): Node {
    const wrapper = new Node('circleIcon');
    wrapper.layer = parent.layer;
    wrapper.addComponent(UITransform).setContentSize(size, size);
    wrapper.setPosition(new Vec3(x, y, 0));
    parent.addChild(wrapper);

    if (iconKey === 'play') {
      const inner = new Node('inner');
      inner.layer = wrapper.layer;
      inner.addComponent(UITransform).setContentSize(iconW, iconH);
      wrapper.addChild(inner);
      this._drawPlayIcon(inner, iconH);
    } else if (iconKey === 'potion') {
      const inner = new Node('inner');
      inner.layer = wrapper.layer;
      inner.addComponent(UITransform).setContentSize(iconW, iconH);
      wrapper.addChild(inner);
      this._drawPotionIcon(inner);
    } else {
      const inner = new Node('icon');
      inner.layer = wrapper.layer;
      inner.addComponent(UITransform).setContentSize(iconW, iconH);
      wrapper.addChild(inner);
      const sprite = inner.addComponent(Sprite);
      sprite.sizeMode = Sprite.SizeMode.CUSTOM;
      loadSpriteFrame(iconKey, sf => {
        if (sf && sprite.isValid) {
          sprite.spriteFrame = sf;
          const rect = sf.rect;
          const origW = rect.width;
          const origH = rect.height;
          if (origW > 0 && origH > 0) {
            const ratio = origW / origH;
            let finalW = iconW;
            let finalH = iconH;
            if (ratio > 1) {
              finalW = iconW;
              finalH = iconW / ratio;
            } else {
              finalH = iconH;
              finalW = iconH * ratio;
            }
            inner.getComponent(UITransform)!.setContentSize(finalW, finalH);
          }
        }
      });
    }
    return wrapper;
  }

  /** 画黄色播放三角（看广告卡片图标，按显示高度 h 等比缩放并居中） */
  private _drawPlayIcon(node: Node, h: number = 68): void {
    const g = node.addComponent(Graphics);
    const scale = h / 48;
    g.fillColor = new Color(255, 193, 7, 255);
    g.moveTo(-18 * scale, -24 * scale);
    g.lineTo(18 * scale, 0);
    g.lineTo(-18 * scale, 24 * scale);
    g.close();
    g.fill();
  }

  /** 画一个紫色药水瓶图标 */
  private _drawPotionIcon(node: Node): void {
    const g = node.addComponent(Graphics);
    g.fillColor = new Color(160, 120, 220, 255);
    g.roundRect(-16, -22, 32, 36, 10);
    g.fill();
    g.fillColor = new Color(200, 170, 240, 200);
    g.roundRect(-12, -18, 10, 28, 5);
    g.fill();
    g.fillColor = new Color(140, 100, 200, 255);
    g.roundRect(-8, 10, 16, 10, 3);
    g.fill();
    g.fillColor = new Color(200, 160, 100, 255);
    g.roundRect(-10, 18, 20, 8, 3);
    g.fill();
    g.lineWidth = 2;
    g.strokeColor = new Color(100, 70, 160, 255);
    g.roundRect(-16, -22, 32, 36, 10);
    g.stroke();
  }

  /** 画一个金色圆形播放按钮（获取钻石免费档） */
  private _drawPlayButtonIcon(node: Node): void {
    const g = node.addComponent(Graphics);
    g.fillColor = new Color(200, 150, 40, 255);
    g.circle(0, 0, 26);
    g.fill();
    g.fillColor = new Color(255, 210, 80, 255);
    g.circle(0, 0, 22);
    g.fill();
    g.fillColor = new Color(255, 240, 180, 200);
    g.circle(-6, -6, 8);
    g.fill();
    g.fillColor = Color.WHITE;
    g.moveTo(-6, -10);
    g.lineTo(10, 0);
    g.lineTo(-6, 10);
    g.close();
    g.fill();
  }

  /** 根据类型绘制钻石卡片图标（全部代码绘制，不依赖缺失的图片资源） */
  private _drawDiamondIcon(node: Node, type: DiamondIconType): void {
    switch (type) {
      case 'play':
        this._drawPlayButtonIcon(node);
        break;
      case 'crown-diamond':
        this._drawCrownDiamondIcon(node);
        break;
      case 'diamond-pile-small':
        this._drawDiamondPileIcon(node, 3);
        break;
      case 'diamond-pile-large':
        this._drawDiamondPileIcon(node, 5);
        break;
      case 'chest':
        this._drawChestIcon(node);
        break;
    }
  }

  /** 皇冠钻石（15 钻石 VIP 档）：代码绘制皇冠 + 钻石 */
  private _drawCrownDiamondIcon(node: Node): void {
    // 钻石主体
    const g = node.addComponent(Graphics);
    g.fillColor = new Color(100, 180, 255, 255);
    g.moveTo(0, -20);
    g.lineTo(24, 0);
    g.lineTo(0, 28);
    g.lineTo(-24, 0);
    g.close();
    g.fill();
    g.fillColor = new Color(150, 210, 255, 255);
    g.moveTo(0, -20);
    g.lineTo(12, -4);
    g.lineTo(-12, -4);
    g.close();
    g.fill();
    g.strokeColor = new Color(60, 120, 200, 255);
    g.lineWidth = 2;
    g.moveTo(0, -20);
    g.lineTo(24, 0);
    g.lineTo(0, 28);
    g.lineTo(-24, 0);
    g.close();
    g.stroke();

    // 皇冠（顶部）
    g.fillColor = new Color(255, 200, 60, 255);
    g.moveTo(-18, -22);
    g.lineTo(-12, -36);
    g.lineTo(-6, -26);
    g.lineTo(0, -40);
    g.lineTo(6, -26);
    g.lineTo(12, -36);
    g.lineTo(18, -22);
    g.close();
    g.fill();
    g.strokeColor = new Color(200, 140, 30, 255);
    g.lineWidth = 1.5;
    g.moveTo(-18, -22);
    g.lineTo(-12, -36);
    g.lineTo(-6, -26);
    g.lineTo(0, -40);
    g.lineTo(6, -26);
    g.lineTo(12, -36);
    g.lineTo(18, -22);
    g.close();
    g.stroke();
  }

  /** 钻石堆（50/80 钻石档）：代码绘制多颗钻石 */
  private _drawDiamondPileIcon(node: Node, count: number): void {
    const g = node.addComponent(Graphics);
    const positions = count === 3
      ? [[-14, 8], [14, 8], [0, -10]]
      : [[-18, 10], [18, 10], [-8, -4], [8, -4], [0, -18]];
    const sz = count === 3 ? 16 : 13;

    for (const [px, py] of positions) {
      g.fillColor = new Color(100, 180, 255, 255);
      g.moveTo(px, py - sz * 0.7);
      g.lineTo(px + sz, py);
      g.lineTo(px, py + sz);
      g.lineTo(px - sz, py);
      g.close();
      g.fill();
      g.fillColor = new Color(160, 215, 255, 255);
      g.moveTo(px, py - sz * 0.7);
      g.lineTo(px + sz * 0.5, py - sz * 0.15);
      g.lineTo(px - sz * 0.5, py - sz * 0.15);
      g.close();
      g.fill();
      g.strokeColor = new Color(60, 120, 200, 255);
      g.lineWidth = 1.5;
      g.moveTo(px, py - sz * 0.7);
      g.lineTo(px + sz, py);
      g.lineTo(px, py + sz);
      g.lineTo(px - sz, py);
      g.close();
      g.stroke();
    }
  }

  /** 宝箱（120 钻石档）：代码绘制宝箱 */
  private _drawChestIcon(node: Node): void {
    const g = node.addComponent(Graphics);
    // 箱体
    g.fillColor = new Color(180, 120, 60, 255);
    g.roundRect(-24, -18, 48, 30, 4);
    g.fill();
    // 箱盖
    g.fillColor = new Color(200, 140, 70, 255);
    g.roundRect(-24, 6, 48, 16, 6);
    g.fill();
    // 金属条
    g.fillColor = new Color(255, 200, 60, 255);
    g.rect(-24, -2, 48, 5);
    g.fill();
    // 锁
    g.fillColor = new Color(255, 210, 80, 255);
    g.roundRect(-6, -6, 12, 14, 2);
    g.fill();
    g.fillColor = new Color(180, 130, 30, 255);
    g.circle(0, 0, 2.5);
    g.fill();
    // 边框
    g.strokeColor = new Color(140, 80, 30, 255);
    g.lineWidth = 2;
    g.roundRect(-24, -18, 48, 30, 4);
    g.stroke();
    g.roundRect(-24, 6, 48, 16, 6);
    g.stroke();
  }

  /* ═══════════════════════════════════════
     业务逻辑
     ═══════════════════════════════════════ */

  private _energyOptions(): EnergyOption[] {
    const cfg = getConfig();
    const opts: EnergyOption[] = [
      { id: 'en1', label: '看广告', amount: cfg.energy.adReward, type: 'ad', icon: 'play' },
    ];
    if (cfg.features.diamondSpend) {
      opts.push(
        { id: 'en2', label: '精力药水', amount: 20, type: 'diamond', diamondCost: 3, icon: 'sprites/ui/energy_bolt' },
        { id: 'en3', label: '精力药水', amount: 40, type: 'diamond', diamondCost: 5, icon: 'sprites/currency/coin' },
        { id: 'en4', label: '精力药水', amount: 60, type: 'diamond', diamondCost: 8, icon: 'potion' },
      );
    }
    opts.push({
      id: 'en5',
      label: '金币换精力',
      amount: cfg.energy.coinRefillAmount,
      type: 'coins',
      coinCost: cfg.energy.coinRefillCost,
      icon: 'sprites/currency/coin',
    });
    return opts;
  }

  private async _onWatchAdForDiamonds(): Promise<void> {
    if (this._busy) return;
    this._busy = true;
    try {
      const ok = await GameManager.instance.watchAdForDiamonds();
      if (this.node.isValid) {
        if (ok) playSfx('reward');
        showPageToast(this._getModalRoot(), ok ? `+${AD_DIAMOND_REWARD} 钻石` : '广告没看完，钻石没到账哦');
      }
    } finally {
      this._busy = false;
    }
  }

  private async _onBuy(opt: EnergyOption): Promise<void> {
    if (this._busy) return;
    const gm = GameManager.instance;

    if (gm.energy.current >= gm.energy.max) {
      playSfx('error');
      showPageToast(this._getModalRoot(), '精力已满，无需补充哦');
      return;
    }

    if (opt.type === 'ad') {
      this._busy = true;
      try {
        const ok = await gm.watchAdForEnergy();
        if (this.node.isValid) {
          if (ok) playSfx('reward');
          else playSfx('error');
          showPageToast(this._getModalRoot(), ok ? `+${opt.amount} 精力` : '广告没看完，精力没补上哦');
        }
      } finally {
        this._busy = false;
      }
      return;
    }

    if (opt.type === 'diamond') {
      const ok = gm.buyEnergyWithDiamonds(opt.diamondCost, opt.amount);
      if (ok) playSfx('purchase');
      else playSfx('error');
      showPageToast(this._getModalRoot(), ok ? `+${opt.amount} 精力` : '钻石不足');
      return;
    }

    if (gm.coinRefillRemaining <= 0) {
      playSfx('error');
      showPageToast(this._getModalRoot(), '今日金币购买次数用完啦');
      return;
    }
    const ok = gm.buyEnergyWithCoins();
    if (ok) playSfx('purchase');
    else playSfx('error');
    showPageToast(this._getModalRoot(), ok ? `+${opt.amount} 精力` : '金币不足');
  }
}
