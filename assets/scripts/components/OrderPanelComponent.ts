import { _decorator, Color, Component, EventTouch, Graphics, Input, Label, Node, Prefab, UIOpacity, UITransform, Vec3, input, instantiate } from 'cc';

import type { Order, OrderRequirement } from '../core/order';
import { getOrderItemName, isOrderComplete } from '../core/order';
import { getItemSpritePath } from '../data/items';
import { GameManager } from '../manager/GameManager';
import { hasOpenBundlePage } from './bundle-pages';
import { createRoundRectNode, createSpriteNode, UI_COLORS } from './ui-factory';

const { ccclass, property } = _decorator;

/** 竖版木牌卡片（对齐 Web 版 OrderPanel.vue .card：order-card 背景图、约 3:4 比例） */
const CARD_WIDTH = 160;
const CARD_HEIGHT = 214;
const CARD_GAP = 14;
/** 一屏最多展示的卡片数（Web 版靠横向滚动，这里先截断） */
const MAX_VISIBLE_CARDS = 4;

/** 需求物品图标 */
const REQ_ICON_SIZE = 56;
const REQ_ICON_Y = 48;
const REQ_NAME_Y = 8;
/** 双需求时图标列的横向偏移 */
const REQ_COL_OFFSET = 38;

/** 完成态绿色（勾徽章 / 领取按钮） */
const GREEN = new Color(88, 168, 92, 255);
const GREEN_DARK = new Color(46, 125, 50, 255);

/**
 * 订单面板：渲染当前 activeOrders 列表。
 *
 * 每个订单实例化一份 OrderCard.prefab，运行时套用木牌背景图；
 * 卡片内容全部代码构建：需求物品图标（完成打勾）+ 奖励行 / 领取按钮。
 */
@ccclass('OrderPanelComponent')
export class OrderPanelComponent extends Component {
  @property({ type: Prefab, tooltip: 'OrderCard.prefab — 单张订单卡片' })
  orderCardPrefab: Prefab | null = null;

  /** 当前渲染的订单（下标与卡片位置一致，供点击命中） */
  private _visibleOrders: Order[] = [];

  protected onEnable(): void {
    const gm = GameManager.instance;
    gm.events.on('orders:changed', this._onOrdersChanged);
    gm.events.on('save:loaded', this._onOrdersChanged);
    input.on(Input.EventType.TOUCH_END, this._onTouchEnd, this);
    this._render(gm.order.activeOrders);
  }

  protected onDisable(): void {
    const gm = GameManager.instance;
    gm.events.off('orders:changed', this._onOrdersChanged);
    gm.events.off('save:loaded', this._onOrdersChanged);
    input.off(Input.EventType.TOUCH_END, this._onTouchEnd, this);
  }

  /** 点击已完成的订单卡 → 领取（全局输入 + 自算命中，与棋盘同方案） */
  private _onTouchEnd(event: EventTouch): void {
    if (this._visibleOrders.length === 0) return;
    // 分包页面开着时不吃触摸（全局输入不受页面 BlockInputEvents 拦截）
    const canvas = this.node.parent;
    if (canvas && hasOpenBundlePage(canvas)) return;
    const ui = this.node.getComponent(UITransform);
    if (!ui) return;
    const pos = event.getUILocation();
    const local = ui.convertToNodeSpaceAR(new Vec3(pos.x, pos.y, 0));
    if (Math.abs(local.y) > CARD_HEIGHT / 2) return;

    const step = CARD_WIDTH + CARD_GAP;
    const originX = -((this._visibleOrders.length - 1) * step) / 2;
    for (let i = 0; i < this._visibleOrders.length; i++) {
      const centerX = originX + i * step;
      if (Math.abs(local.x - centerX) > CARD_WIDTH / 2) continue;
      const order = this._visibleOrders[i];
      if (isOrderComplete(order)) {
        GameManager.instance.collectOrder(order.id);
      }
      return;
    }
  }

  private _onOrdersChanged = (): void => {
    this._render(GameManager.instance.order.activeOrders);
  };

  private _render(orders: readonly Order[]): void {
    this.node.removeAllChildren();
    if (!this.orderCardPrefab) return;

    const visible = orders.slice(0, MAX_VISIBLE_CARDS);
    this._visibleOrders = [...visible];
    const step = CARD_WIDTH + CARD_GAP;
    const originX = -((visible.length - 1) * step) / 2;

    for (let i = 0; i < visible.length; i++) {
      const order = visible[i];
      const card = instantiate(this.orderCardPrefab);
      card.getComponent(UITransform)?.setContentSize(CARD_WIDTH, CARD_HEIGHT);
      card.setPosition(new Vec3(originX + i * step, 0, 0));
      this.node.addChild(card);

      // 旧版 prefab 自带的文字 Label 不再使用，全部内容代码构建
      const reqLabel = card.getChildByName('reqLabel');
      if (reqLabel) reqLabel.active = false;
      const rewardLabel = card.getChildByName('rewardLabel');
      if (rewardLabel) rewardLabel.active = false;

      // 木牌背景图垫底
      createSpriteNode('cardBg', card, 0, CARD_WIDTH, CARD_HEIGHT, 'sprites/bg/order-card');

      // 需求物品：图标 +（完成时）打勾徽章 + 名称
      const reqs = order.requirements;
      const colStep = reqs.length > 1 ? (REQ_COL_OFFSET * 2) / (reqs.length - 1) : 0;
      const colOrigin = reqs.length > 1 ? -REQ_COL_OFFSET : 0;
      for (let r = 0; r < reqs.length; r++) {
        this._buildRequirement(card, reqs[r], colOrigin + colStep * r);
      }

      if (isOrderComplete(order)) {
        this._buildCollectButton(card);
      } else {
        this._buildRewardRows(card, order);
      }
    }
  }

  /** 单个需求：物品贴图 + 名称，已交付时图标压暗并盖绿色勾徽章 */
  private _buildRequirement(card: Node, req: OrderRequirement, x: number): void {
    const icon = createSpriteNode(
      'reqIcon', card, card.children.length,
      REQ_ICON_SIZE, REQ_ICON_SIZE,
      getItemSpritePath(req.itemId), new Vec3(x, REQ_ICON_Y, 0),
    );

    const name = getOrderItemName(req.itemId);
    // 两列布局下每列可用约 72px，按字数缩小字号避免溢出
    const fontSize = Math.min(15, Math.floor(72 / Math.max(1, name.length)));
    this._makeLabel(card, 'reqName', new Vec3(x, REQ_NAME_Y, 0), fontSize, false, UI_COLORS.textBrown).string = name;

    if (req.fulfilled) {
      icon.addComponent(UIOpacity).opacity = 130;
      this._addCheckBadge(card, new Vec3(x + REQ_ICON_SIZE / 2 - 8, REQ_ICON_Y + REQ_ICON_SIZE / 2 - 8, 0));
    }
  }

  /** 绿色圆底白勾徽章 */
  private _addCheckBadge(card: Node, pos: Vec3): void {
    const node = new Node('checkBadge');
    node.layer = card.layer;
    node.addComponent(UITransform).setContentSize(26, 26);
    node.setPosition(pos);
    card.addChild(node);

    const g = node.addComponent(Graphics);
    g.fillColor = GREEN;
    g.circle(0, 0, 12);
    g.fill();
    g.lineWidth = 2;
    g.strokeColor = Color.WHITE;
    g.circle(0, 0, 12);
    g.stroke();
    g.lineWidth = 3;
    g.moveTo(-5, 0);
    g.lineTo(-1.5, -4);
    g.lineTo(5.5, 4.5);
    g.stroke();
  }

  /** 奖励区：金币行 +（稀有单）精力行，图标 + 数字 */
  private _buildRewardRows(card: Node, order: Order): void {
    const hasEnergy = (order.reward.energy ?? 0) > 0;
    const coinsY = hasEnergy ? -44 : -58;
    this._makeRewardRow(card, coinsY, 'sprites/currency/coin', `+${order.reward.coins}`);
    if (hasEnergy) {
      this._makeRewardRow(card, -78, 'sprites/ui/energy_bolt', `+${order.reward.energy}`);
    }
  }

  /** 一行「图标 + 数字」，整体在卡片内水平居中 */
  private _makeRewardRow(card: Node, y: number, iconPath: string, text: string): void {
    const iconSize = 26;
    const fontSize = 22;
    const gap = 4;
    const textWidth = text.length * fontSize * 0.6;
    const totalWidth = iconSize + gap + textWidth;
    const iconX = -totalWidth / 2 + iconSize / 2;
    createSpriteNode('rewardIcon', card, card.children.length, iconSize, iconSize, iconPath, new Vec3(iconX, y, 0));
    const label = this._makeLabel(
      card, 'rewardValue',
      new Vec3(iconX + iconSize / 2 + gap, y, 0),
      fontSize, true, UI_COLORS.textBrown, true,
    );
    label.string = text;
  }

  /** 全部凑齐 → 绿色「领取」按钮（对齐 Web 版 .collect-btn） */
  private _buildCollectButton(card: Node): void {
    const btn = createRoundRectNode(
      'collectBtn', card, card.children.length,
      104, 42, 21, GREEN, GREEN_DARK, new Vec3(0, -58, 0),
    );
    const label = this._makeLabel(btn, 'label', new Vec3(0, 0, 0), 24, true, Color.WHITE);
    label.string = '领取';
  }

  private _makeLabel(
    parent: Node, name: string, pos: Vec3,
    fontSize: number, bold: boolean, color: Color, anchorLeft = false,
  ): Label {
    const node = new Node(name);
    node.layer = parent.layer;
    const ui = node.addComponent(UITransform);
    if (anchorLeft) ui.setAnchorPoint(0, 0.5);
    node.setPosition(pos);
    parent.addChild(node);
    const label = node.addComponent(Label);
    label.fontSize = fontSize;
    label.lineHeight = fontSize + 6;
    label.isBold = bold;
    label.color = color;
    if (anchorLeft) label.horizontalAlign = Label.HorizontalAlign.LEFT;
    return label;
  }
}
