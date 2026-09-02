import { _decorator, Color, Component, EventTouch, Graphics, Input, Label, Node, Prefab, Sprite, tween, UIOpacity, UITransform, Vec3, input, instantiate } from 'cc';

import type { Order, OrderRequirement } from '../core/order';
import { isOrderComplete } from '../core/order';
import { getItemSpritePath } from '../data/items';
import { GameManager } from '../manager/GameManager';
import { hasOpenBundlePage, showPageToast } from './bundle-pages';
import { OrderDoubleModal } from './OrderDoubleModal';
import { TapZoneComponent } from './tap-zone';
import { createSpriteNode, UI_COLORS } from './ui-factory';
import { loadSpriteFrame, applySpriteFrame } from './sprite-loader';
import { spawnFlyingCoins } from './coin-fly';
import { BoardComponent } from './BoardComponent';
import { fontManager } from '../core/font-manager';
import { showSynthesisPathModal } from './SynthesisPathModal';

const { ccclass, property } = _decorator;

/* ═══ 尺寸（严格对齐 Web 版 OrderPanel.vue，按 140px 卡宽等比缩放） ═══ */
const CARD_WIDTH = 140;
const CARD_HEIGHT = 187; // 3:4
const CARD_GAP = 7;
/** 可视区宽度（小于节点宽度，左右留边距） */
const VIEW_W = 680;
/** 拖拽超过这个距离才算滚动，避免和点击抢事件 */
const DRAG_THRESHOLD = 8;

/** 滚动箭头按钮（对齐 web 版 .scroll-arrow） */
const ARROW_SIZE = 36;
const ARROW_BG = new Color(240, 232, 216, 255);
const ARROW_BORDER = new Color(212, 196, 168, 255);
const ARROW_COLOR = new Color(160, 120, 76, 255);
const ARROW_SHADOW = new Color(80, 50, 20, 51);
const ARROW_SHADOW_OFFSET_Y = -2;
const ARROW_SHADOW_BLUR = 8;
const ARROW_SHADOW_LAYERS = 6;

/** 顾客头像 — web 5.5dvh=44.7px × 1.724 = 77px，距顶 32.95px → y=37 */
const AVATAR_SIZE = 77;
const AVATAR_Y = 37;

/** 需求物品图标 — web 3dvh=24.4px × 1.724 = 42px，距顶 71.5px → y=-30 */
const REQ_ICON_SIZE = 42;
const REQ_ICON_Y = -30;
const REQ_GAP = 10;

/** 金币奖励药丸 — web 约20px高 × 1.724 = 34px，距底 6px → y=-66 */
const REWARD_PILL_H = 34;
const REWARD_PILL_Y = -66;
const REWARD_COIN_SIZE = 30;
const REWARD_TEXT_SIZE = 18;

/** 领取按钮 — web 约24px高 × 1.724 = 40px，距底 6px → y=-66 */
const COLLECT_BTN_W = 100;
const COLLECT_BTN_H = 40;
const COLLECT_BTN_Y = -66;
const COLLECT_BTN_FONT = 21;

/** 完成打勾徽章 — web 16px × 1.724 = 28px */
const CHECK_BADGE_SIZE = 28;

/* ═══ 颜色（严格取自 Web 版 CSS） ═══ */
const REWARD_PILL_TOP = new Color(255, 246, 224, 255);
const REWARD_PILL_BOT = new Color(245, 230, 200, 255);
const REWARD_PILL_BORDER = new Color(212, 184, 130, 255);
const REWARD_TEXT_COLOR = new Color(139, 107, 42, 255);
const COLLECT_BTN_TOP = new Color(255, 179, 71, 255);
const COLLECT_BTN_BOT = new Color(232, 146, 42, 255);
const COLLECT_BTN_BORDER = new Color(184, 114, 42, 255);
const COLLECT_BTN_HIGHLIGHT = new Color(255, 255, 255, 77);
const CHECK_BG = new Color(102, 187, 106, 255);

/**
 * 订单面板（对齐 Web 版 OrderPanel.vue）：
 * 横向可滚动的木牌卡片列表，每张卡片含顾客头像 + 需求物品小图标 + 金币药丸 / 橙色领取按钮。
 *
 * 输入处理：全局 input 监听实现「横向拖拽 + 点击」二合一，
 * 拖拽超 8px 算滚动，否则算点击。
 */
@ccclass('OrderPanelComponent')
export class OrderPanelComponent extends Component {
  @property({ type: Prefab, tooltip: 'OrderCard.prefab — 单张订单卡片' })
  orderCardPrefab: Prefab | null = null;

  /** 滚动内容容器（所有卡片挂在这里） */
  private _content: Node | null = null;
  /** 可视区 */
  private _viewport: Node | null = null;
  /** 左右滚动箭头 */
  private _arrowLeft: Node | null = null;
  private _arrowRight: Node | null = null;
  /** 当前渲染的订单列表 */
  private _visibleOrders: Order[] = [];
  /** 启动挂念 toast 只提示一次 */
  private _startHintShown = false;

  // 拖拽状态
  private _dragging = false;
  private _dragMoved = false;
  private _startX = 0;
  private _startContentX = 0;
  private _startCardIdx = -1;

  protected onEnable(): void {
    const gm = GameManager.instance;
    gm.events.on('orders:changed', this._onOrdersChanged);
    gm.events.on('save:loaded', this._onOrdersChanged);
    gm.events.on('save:loaded', this._onStartHint);

    // 全局 input 监听：自行做 hitTest，拖拽/点击二合一
    input.on(Input.EventType.TOUCH_START, this._onTouchStart, this);
    input.on(Input.EventType.TOUCH_MOVE, this._onTouchMove, this);
    input.on(Input.EventType.TOUCH_END, this._onTouchEnd, this);
    input.on(Input.EventType.TOUCH_CANCEL, this._onTouchCancel, this);

    this._ensureViewport();
    this._buildArrowButtons();
    this._render(gm.order.activeOrders);
  }

  protected onDisable(): void {
    const gm = GameManager.instance;
    gm.events.off('orders:changed', this._onOrdersChanged);
    gm.events.off('save:loaded', this._onOrdersChanged);
    gm.events.off('save:loaded', this._onStartHint);
    input.off(Input.EventType.TOUCH_START, this._onTouchStart, this);
    input.off(Input.EventType.TOUCH_MOVE, this._onTouchMove, this);
    input.off(Input.EventType.TOUCH_END, this._onTouchEnd, this);
    input.off(Input.EventType.TOUCH_CANCEL, this._onTouchCancel, this);
  }

  /** 确保可视区 + 内容容器已创建（只建一次） */
  private _ensureViewport(): void {
    if (this._viewport && this._viewport.isValid) return;

    const nodeUi = this.node.getComponent(UITransform);
    const nodeW = nodeUi?.width ?? 720;
    const nodeH = nodeUi?.height ?? 200;

    const viewport = new Node('viewport');
    viewport.layer = this.node.layer;
    viewport.addComponent(UITransform).setContentSize(VIEW_W, nodeH);
    this.node.addChild(viewport);
    this._viewport = viewport;

    const content = new Node('content');
    content.layer = viewport.layer;
    content.addComponent(UITransform);
    viewport.addChild(content);
    this._content = content;
  }

  /** 构建左右滚动箭头按钮 */
  private _buildArrowButtons(): void {
    const y = 0;
    this._arrowLeft = this._createArrowButton('arrowLeft', true);
    this._arrowLeft.setPosition(new Vec3(-VIEW_W / 2 + ARROW_SIZE / 2 - 2, y, 0));
    this.node.addChild(this._arrowLeft);
    this._arrowRight = this._createArrowButton('arrowRight', false);
    this._arrowRight.setPosition(new Vec3(VIEW_W / 2 - ARROW_SIZE / 2 + 2, y, 0));
    this.node.addChild(this._arrowRight);
  }

  /** 创建单个箭头按钮（带多层阴影模拟高斯模糊） */
  private _createArrowButton(name: string, isLeft: boolean): Node {
    const btn = new Node(name);
    btn.layer = this.node.layer;
    btn.addComponent(UITransform).setContentSize(ARROW_SIZE, ARROW_SIZE);

    const g = btn.addComponent(Graphics);
    const baseR = ARROW_SIZE / 2;
    const sy = ARROW_SHADOW_OFFSET_Y;
    for (let i = 0; i < ARROW_SHADOW_LAYERS; i++) {
      const t = i / (ARROW_SHADOW_LAYERS - 1);
      const r = baseR + t * ARROW_SHADOW_BLUR;
      const alpha = Math.floor(ARROW_SHADOW.a * Math.exp(-t * t * 2.2));
      if (alpha <= 0) continue;
      g.fillColor = new Color(ARROW_SHADOW.r, ARROW_SHADOW.g, ARROW_SHADOW.b, alpha);
      g.circle(0, sy, r);
      g.fill();
    }

    g.fillColor = ARROW_BG;
    g.circle(0, 0, ARROW_SIZE / 2);
    g.fill();
    g.lineWidth = 1.5;
    g.strokeColor = ARROW_BORDER;
    g.circle(0, 0, ARROW_SIZE / 2);
    g.stroke();

    const arrowX = isLeft ? 2 : -2;
    const arrowNode = new Node('arrow');
    arrowNode.layer = btn.layer;
    arrowNode.addComponent(UITransform).setContentSize(ARROW_SIZE, ARROW_SIZE);
    arrowNode.setPosition(new Vec3(arrowX, 3, 0));
    btn.addChild(arrowNode);
    const arrowLabel = arrowNode.addComponent(Label);
    arrowLabel.string = isLeft ? '‹' : '›';
    arrowLabel.fontSize = 26;
    arrowLabel.lineHeight = ARROW_SIZE;
    arrowLabel.isBold = true;
    arrowLabel.color = ARROW_COLOR;
    arrowLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
    arrowLabel.verticalAlign = Label.VerticalAlign.CENTER;
    arrowLabel.overflow = Label.Overflow.NONE;

    btn.addComponent(TapZoneComponent).onTap = () => {
      const step = CARD_WIDTH + CARD_GAP;
      this._scrollBy(isLeft ? step : -step);
    };

    return btn;
  }

  /** 滚动指定距离 */
  private _scrollBy(delta: number): void {
    if (!this._content) return;
    const x = this._content.position.x + delta;
    const clamped = Math.min(Math.max(x, -this._halfScroll), this._halfScroll);
    this._content.setPosition(new Vec3(clamped, 0, 0));
    this._updateArrowVisibility();
  }

  /** 根据当前滚动位置更新箭头可见性 */
  private _updateArrowVisibility(): void {
    if (!this._content) return;
    const x = this._content.position.x;
    const canScrollLeft = x < this._halfScroll - 0.5;
    const canScrollRight = x > -this._halfScroll + 0.5;
    if (this._arrowLeft) this._arrowLeft.active = canScrollLeft;
    if (this._arrowRight) this._arrowRight.active = canScrollRight;
  }

  /** 内容总宽度 */
  private get _contentWidth(): number {
    const n = this._visibleOrders.length;
    return n > 0 ? n * CARD_WIDTH + (n - 1) * CARD_GAP : 0;
  }

  /** 最大可滚动偏移 */
  private get _maxScroll(): number {
    return Math.max(0, this._contentWidth - VIEW_W);
  }

  /** 半幅滚动 */
  private get _halfScroll(): number {
    return this._maxScroll / 2;
  }

  /** 触点是否在可视区内（全局 input 需自行做命中检测） */
  private _hitTest(event: EventTouch): boolean {
    if (this._visibleOrders.length === 0) return false;
    const canvas = this.node.parent;
    if (canvas && hasOpenBundlePage(canvas)) return false;
    const vp = this._viewport;
    if (!vp?.isValid) return false;
    const ui = vp.getComponent(UITransform);
    if (!ui) return false;
    const p = event.getUILocation();
    const local = ui.convertToNodeSpaceAR(new Vec3(p.x, p.y, 0));
    return (
      local.x >= -ui.width / 2 &&
      local.x <= ui.width / 2 &&
      local.y >= -ui.height / 2 &&
      local.y <= ui.height / 2
    );
  }

  private _onTouchStart(event: EventTouch): void {
    if (!this._hitTest(event)) return;
    this._dragging = false;
    this._dragMoved = false;
    this._startX = event.getUILocation().x;
    this._startContentX = this._content?.position.x ?? 0;
    this._startCardIdx = this._cardIndexAt(event);
  }

  private _onTouchMove(event: EventTouch): void {
    if (this._startCardIdx < 0 && !this._dragMoved) return;
    const dx = event.getUILocation().x - this._startX;
    if (!this._dragMoved && Math.abs(dx) < DRAG_THRESHOLD) return;
    this._dragMoved = true;
    this._dragging = true;
    if (this._content) {
      const clamped = Math.min(Math.max(this._startContentX + dx, -this._halfScroll), this._halfScroll);
      this._content.setPosition(new Vec3(clamped, 0, 0));
      this._updateArrowVisibility();
    }
  }

  private _onTouchEnd(event: EventTouch): void {
    if (this._startCardIdx < 0 && !this._dragMoved) return;
    if (this._dragging) {
      if (this._content) {
        const x = this._content.position.x;
        const clamped = Math.min(Math.max(x, -this._halfScroll), this._halfScroll);
        this._content.setPosition(new Vec3(clamped, 0, 0));
        this._updateArrowVisibility();
      }
    } else {
      // 轻点：按下和抬起在同一张卡片上
      const endIdx = this._cardIndexAt(event);
      if (this._startCardIdx >= 0 && this._startCardIdx === endIdx) {
        const order = this._visibleOrders[this._startCardIdx];
        if (!order) return;
        if (isOrderComplete(order)) {
          // 已完成订单：先记录匹配物品位置，播放物品飞行动画，再领取奖励
          // (逻辑见下方)
          const card = this._content?.children[this._startCardIdx];
          const matchedItems: { idx: number; itemId: string }[] = [];
          for (const req of order.requirements) {
            if (req.matchedBoardIdx != null && req.itemId) {
              matchedItems.push({ idx: req.matchedBoardIdx, itemId: req.itemId });
            }
          }

          const coins = GameManager.instance.collectOrder(order.id);
          const canvas = this.node.parent;
          if (coins > 0) {
            // 播放物品飞向订单卡的动画
            if (card?.isValid && matchedItems.length > 0) {
              this._spawnOrderItemFly(matchedItems, card);
            }
            // 金币飞向状态栏特效（对齐 Web 版 spawnFlyingCoins）
            if (card?.isValid) {
              // 延迟一点，等物品飞到订单卡后再爆金币
              setTimeout(() => {
                if (card.isValid) {
                  spawnFlyingCoins(GameManager.instance.node, card.getWorldPosition(), coins);
                  // 订单卡星星爆发
                  this._spawnOrderStarBurst(card);
                }
              }, 350);
            }
            // 翻倍弹窗（微信端保留）
            if (canvas) OrderDoubleModal.show(canvas, coins);
          }
        }
      }
    }
    this._dragging = false;
    this._dragMoved = false;
    this._startCardIdx = -1;
  }

  private _onTouchCancel(): void {
    this._dragging = false;
    this._dragMoved = false;
    this._startCardIdx = -1;
  }

  /** 根据触点位置算出命中的卡片下标（基于 content 当前位移） */
  private _cardIndexAt(event: EventTouch): number {
    const content = this._content;
    if (!content?.isValid) return -1;
    const contentUi = content.getComponent(UITransform);
    if (!contentUi) return -1;
    const p = event.getUILocation();
    const local = contentUi.convertToNodeSpaceAR(new Vec3(p.x, p.y, 0));
    const step = CARD_WIDTH + CARD_GAP;
    const originX = -this._contentWidth / 2 + CARD_WIDTH / 2;
    for (let i = 0; i < this._visibleOrders.length; i++) {
      const centerX = originX + i * step;
      if (Math.abs(local.x - centerX) <= CARD_WIDTH / 2 && Math.abs(local.y) <= CARD_HEIGHT / 2) {
        return i;
      }
    }
    return -1;
  }

  private _onOrdersChanged = (): void => {
    this._render(GameManager.instance.order.activeOrders);
  };

  private _onStartHint = (): void => {
    if (this._startHintShown) return;
    this._startHintShown = true;
    const near = GameManager.instance.order.activeOrders.find(
      o => !isOrderComplete(o) && o.requirements.filter(r => r.matchedBoardIdx == null).length === 1,
    );
    if (!near) return;
    const canvas = this.node.parent;
    if (canvas) showPageToast(canvas, '有订单只差 1 个甜品就能交付！');
  };

  private _render(orders: readonly Order[]): void {
    this._ensureViewport();
    const content = this._content;
    if (!content || !this.orderCardPrefab) return;

    content.removeAllChildren();
    this._visibleOrders = [...orders];

    const totalW = this._contentWidth;
    content.getComponent(UITransform)?.setContentSize(Math.max(totalW, VIEW_W), CARD_HEIGHT);

    // 初始位置：第一张卡片完整显示在左边缘
    if (Math.abs(content.position.x) < 0.5) {
      content.setPosition(new Vec3(this._halfScroll, 0, 0));
    } else {
      const x = content.position.x;
      const clamped = Math.min(Math.max(x, -this._halfScroll), this._halfScroll);
      if (Math.abs(clamped - x) > 0.1) content.setPosition(new Vec3(clamped, 0, 0));
    }

    const step = CARD_WIDTH + CARD_GAP;
    const originX = -totalW / 2 + CARD_WIDTH / 2;

    for (let i = 0; i < orders.length; i++) {
      const order = orders[i];
      const card = instantiate(this.orderCardPrefab);
      card.getComponent(UITransform)?.setContentSize(CARD_WIDTH, CARD_HEIGHT);
      card.setPosition(new Vec3(originX + i * step, 0, 0));
      content.addChild(card);

      // 隐藏 prefab 自带的旧 Label
      const reqLabel = card.getChildByName('reqLabel');
      if (reqLabel) reqLabel.active = false;
      const rewardLabel = card.getChildByName('rewardLabel');
      if (rewardLabel) rewardLabel.active = false;

      // 木牌背景图垫底
      createSpriteNode('cardBg', card, 0, CARD_WIDTH, CARD_HEIGHT, 'sprites/bg/order-card');

      // 顾客头像（专门的顾客角色图，对齐抖音端）
      this._buildAvatar(card, order.avatar);

      // 需求物品小图标（无名称文字）
      this._buildRequirements(card, order.requirements);

      // 底部：金币药丸 或 领取按钮
      if (isOrderComplete(order)) {
        this._buildCollectButton(card);
      } else {
        this._buildRewardPill(card, order);
      }
    }

    // 夹取当前滚动位置并更新箭头可见性
    const x = content.position.x;
    const clamped = Math.min(Math.max(x, -this._halfScroll), this._halfScroll);
    if (clamped !== x) content.setPosition(new Vec3(clamped, 0, 0));
    this._updateArrowVisibility();

    // 今日首单 ×2 预告角标
    if (GameManager.instance.firstOrderBonusAvailable) {
      const badge = new Node('firstOrderBadge');
      badge.layer = this.node.layer;
      badge.addComponent(UITransform);
      const label = badge.addComponent(Label);
      label.string = '今日首单 ×2 奖励';
      label.fontSize = 20;
      label.isBold = true;
      label.color = new Color(46, 125, 50, 255);
      badge.setPosition(new Vec3(0, CARD_HEIGHT / 2 + 24, 0));
      this.node.addChild(badge);
    }

    fontManager.applyFontToTree(this.node);
  }

  /** 顾客头像（卡片顶部）— 专门的顾客角色图，对齐抖音端 */
  private _buildAvatar(card: Node, avatar: number): void {
    const avatarId = Math.max(1, Math.min(10, avatar || 1));
    createSpriteNode(
      'avatar', card, card.children.length,
      AVATAR_SIZE, AVATAR_SIZE,
      `sprites/characters/customer_${avatarId}`,
      new Vec3(0, AVATAR_Y, 0),
    );
  }

  /** 需求物品：小图标 + 完成打勾（无名称文字） */
  private _buildRequirements(card: Node, reqs: OrderRequirement[]): void {
    const n = reqs.length;
    const totalW = n * REQ_ICON_SIZE + (n - 1) * REQ_GAP;
    const startX = -totalW / 2 + REQ_ICON_SIZE / 2;

    for (let r = 0; r < n; r++) {
      const req = reqs[r];
      const x = startX + r * (REQ_ICON_SIZE + REQ_GAP);
      const icon = createSpriteNode(
        'reqIcon', card, card.children.length,
        REQ_ICON_SIZE, REQ_ICON_SIZE,
        getItemSpritePath(req.itemId),
        new Vec3(x, REQ_ICON_Y, 0),
      );

      if (req.fulfilled) {
        icon.addComponent(UIOpacity).opacity = 140;
        this._addCheckBadge(card, new Vec3(
          x + REQ_ICON_SIZE / 2 - 4,
          REQ_ICON_Y + REQ_ICON_SIZE / 2 - 4,
          0,
        ));
      }
    }
  }

  /** 绿色圆底白勾徽章（带白色描边） */
  private _addCheckBadge(card: Node, pos: Vec3): void {
    const node = new Node('checkBadge');
    node.layer = card.layer;
    node.addComponent(UITransform).setContentSize(CHECK_BADGE_SIZE, CHECK_BADGE_SIZE);
    node.setPosition(pos);
    card.addChild(node);

    const g = node.addComponent(Graphics);
    const r = CHECK_BADGE_SIZE / 2;
    const s = CHECK_BADGE_SIZE / 20;
    g.fillColor = CHECK_BG;
    g.circle(0, 0, r);
    g.fill();
    g.lineWidth = 2 * s;
    g.strokeColor = Color.WHITE;
    g.circle(0, 0, r);
    g.stroke();
    g.lineWidth = 2.5 * s;
    g.strokeColor = Color.WHITE;
    g.moveTo(-4 * s, 0);
    g.lineTo(-1.5 * s, -3 * s);
    g.lineTo(4.5 * s, 3.5 * s);
    g.stroke();
  }

  /** 金币奖励药丸（135deg 渐变 + 描边 + 金币图标 + 数字） */
  private _buildRewardPill(card: Node, order: Order): void {
    const coins = order.reward.coins;
    const text = String(coins);
    const textW = text.length * REWARD_TEXT_SIZE * 0.65;
    const pillW = REWARD_COIN_SIZE + 6 + textW + 20;

    const pill = new Node('rewardPill');
    pill.layer = card.layer;
    pill.addComponent(UITransform).setContentSize(pillW, REWARD_PILL_H);
    pill.setPosition(new Vec3(0, REWARD_PILL_Y, 0));
    card.addChild(pill);

    const g = pill.addComponent(Graphics);
    const r = REWARD_PILL_H / 2;
    const halfH = REWARD_PILL_H / 2;
    // 上半层渐变
    g.fillColor = REWARD_PILL_TOP;
    g.moveTo(-pillW / 2, 0);
    g.lineTo(-pillW / 2, halfH - r);
    g.quadraticCurveTo(-pillW / 2, halfH, -pillW / 2 + r, halfH);
    g.lineTo(pillW / 2 - r, halfH);
    g.quadraticCurveTo(pillW / 2, halfH, pillW / 2, halfH - r);
    g.lineTo(pillW / 2, 0);
    g.close();
    g.fill();
    // 下半层渐变
    g.fillColor = REWARD_PILL_BOT;
    g.moveTo(-pillW / 2, 0);
    g.lineTo(pillW / 2, 0);
    g.lineTo(pillW / 2, -halfH + r);
    g.quadraticCurveTo(pillW / 2, -halfH, pillW / 2 - r, -halfH);
    g.lineTo(-pillW / 2 + r, -halfH);
    g.quadraticCurveTo(-pillW / 2, -halfH, -pillW / 2, -halfH + r);
    g.close();
    g.fill();
    // 描边
    g.lineWidth = 1.5;
    g.strokeColor = REWARD_PILL_BORDER;
    g.moveTo(-pillW / 2, -halfH + r);
    g.quadraticCurveTo(-pillW / 2, -halfH, -pillW / 2 + r, -halfH);
    g.lineTo(pillW / 2 - r, -halfH);
    g.quadraticCurveTo(pillW / 2, -halfH, pillW / 2, -halfH + r);
    g.lineTo(pillW / 2, halfH - r);
    g.quadraticCurveTo(pillW / 2, halfH, pillW / 2 - r, halfH);
    g.lineTo(-pillW / 2 + r, halfH);
    g.quadraticCurveTo(-pillW / 2, halfH, -pillW / 2, halfH - r);
    g.close();
    g.stroke();

    const iconX = -pillW / 2 + 10 + REWARD_COIN_SIZE / 2;
    createSpriteNode(
      'coinIcon', pill, pill.children.length,
      REWARD_COIN_SIZE, REWARD_COIN_SIZE,
      'sprites/currency/coin',
      new Vec3(iconX, 0, 0),
    );

    const labelNode = new Node('coinValue');
    labelNode.layer = pill.layer;
    const lui = labelNode.addComponent(UITransform);
    lui.setContentSize(textW + 4, REWARD_PILL_H - 4);
    lui.setAnchorPoint(0, 0.5);
    labelNode.setPosition(new Vec3(iconX + REWARD_COIN_SIZE / 2 + 6, 0, 0));
    pill.addChild(labelNode);
    const label = labelNode.addComponent(Label);
    label.string = text;
    label.fontSize = REWARD_TEXT_SIZE;
    label.lineHeight = REWARD_TEXT_SIZE * 1.3;
    label.isBold = true;
    label.color = REWARD_TEXT_COLOR;
    label.horizontalAlign = Label.HorizontalAlign.LEFT;
    label.overflow = Label.Overflow.SHRINK;
  }

  /** 橙色领取按钮（180deg 渐变 + 描边 + 白色文字 + 顶部高光） */
  private _buildCollectButton(card: Node): void {
    const btn = new Node('collectBtn');
    btn.layer = card.layer;
    btn.addComponent(UITransform).setContentSize(COLLECT_BTN_W, COLLECT_BTN_H);
    btn.setPosition(new Vec3(0, COLLECT_BTN_Y, 0));
    card.addChild(btn);

    const g = btn.addComponent(Graphics);
    const r = COLLECT_BTN_H / 2;
    const halfH = COLLECT_BTN_H / 2;
    // 上半层渐变
    g.fillColor = COLLECT_BTN_TOP;
    g.moveTo(-COLLECT_BTN_W / 2, 0);
    g.lineTo(-COLLECT_BTN_W / 2, halfH - r);
    g.quadraticCurveTo(-COLLECT_BTN_W / 2, halfH, -COLLECT_BTN_W / 2 + r, halfH);
    g.lineTo(COLLECT_BTN_W / 2 - r, halfH);
    g.quadraticCurveTo(COLLECT_BTN_W / 2, halfH, COLLECT_BTN_W / 2, halfH - r);
    g.lineTo(COLLECT_BTN_W / 2, 0);
    g.close();
    g.fill();
    // 下半层渐变
    g.fillColor = COLLECT_BTN_BOT;
    g.moveTo(-COLLECT_BTN_W / 2, 0);
    g.lineTo(COLLECT_BTN_W / 2, 0);
    g.lineTo(COLLECT_BTN_W / 2, -halfH + r);
    g.quadraticCurveTo(COLLECT_BTN_W / 2, -halfH, COLLECT_BTN_W / 2 - r, -halfH);
    g.lineTo(-COLLECT_BTN_W / 2 + r, -halfH);
    g.quadraticCurveTo(-COLLECT_BTN_W / 2, -halfH, -COLLECT_BTN_W / 2, -halfH + r);
    g.close();
    g.fill();
    // 描边
    g.lineWidth = 2;
    g.strokeColor = COLLECT_BTN_BORDER;
    g.moveTo(-COLLECT_BTN_W / 2, -halfH + r);
    g.quadraticCurveTo(-COLLECT_BTN_W / 2, -halfH, -COLLECT_BTN_W / 2 + r, -halfH);
    g.lineTo(COLLECT_BTN_W / 2 - r, -halfH);
    g.quadraticCurveTo(COLLECT_BTN_W / 2, -halfH, COLLECT_BTN_W / 2, -halfH + r);
    g.lineTo(COLLECT_BTN_W / 2, halfH - r);
    g.quadraticCurveTo(COLLECT_BTN_W / 2, halfH, COLLECT_BTN_W / 2 - r, halfH);
    g.lineTo(-COLLECT_BTN_W / 2 + r, halfH);
    g.quadraticCurveTo(-COLLECT_BTN_W / 2, halfH, -COLLECT_BTN_W / 2, halfH - r);
    g.close();
    g.stroke();
    // 顶部高光
    g.fillColor = COLLECT_BTN_HIGHLIGHT;
    g.roundRect(-COLLECT_BTN_W / 2 + 4, COLLECT_BTN_H / 2 - 8, COLLECT_BTN_W - 8, 6, 3);
    g.fill();

    const labelNode = new Node('label');
    labelNode.layer = btn.layer;
    labelNode.addComponent(UITransform);
    btn.addChild(labelNode);
    const label = labelNode.addComponent(Label);
    label.string = '领取';
    label.fontSize = COLLECT_BTN_FONT;
    label.lineHeight = COLLECT_BTN_FONT * 1.3;
    label.isBold = true;
    label.color = Color.WHITE;
  }

  // ═══════════════════════════════════════════════════════════════
  // 订单交付特效：物品飞向订单卡 + 星星爆发
  // ═══════════════════════════════════════════════════════════════

  /**
   * 订单交付物品飞行动画：棋盘上匹配的物品沿弧线飞向订单卡，
   * 到达后缩小消失。collectOrder 已在调用前执行，棋盘原物品已被消耗。
   */
  private _spawnOrderItemFly(
    matchedItems: { idx: number; itemId: string }[],
    card: Node,
  ): void {
    const canvas = GameManager.instance.node;
    const boardNode = canvas.getChildByName('Board');
    const boardComp = boardNode?.getComponent(BoardComponent);
    if (!boardComp) return;

    const cardWorldPos = card.getWorldPosition();
    const spritePath = getItemSpritePath(matchedItems[0].itemId);
    // 统一用 canvas 本地坐标，避免 setWorldPosition 与 tween position 本地坐标混用导致飞偏
    const canvasTransform = canvas.getComponent(UITransform);
    const cardLocal = canvasTransform?.convertToNodeSpaceAR(cardWorldPos) ?? cardWorldPos;

    matchedItems.forEach((item, i) => {
      const fromWorldPos = boardComp.getCellWorldPosition(item.idx);
      if (!fromWorldPos) return;
      const fromLocal = canvasTransform?.convertToNodeSpaceAR(fromWorldPos) ?? fromWorldPos;

      // 创建飞行物品节点
      const flyNode = new Node('flyOrderItem');
      flyNode.layer = canvas.layer;
      const size = 48;
      flyNode.addComponent(UITransform).setContentSize(size, size);
      flyNode.setPosition(fromLocal);
      canvas.addChild(flyNode);
      flyNode.setSiblingIndex(canvas.children.length - 1);

      const sprite = flyNode.addComponent(Sprite);
      const op = flyNode.addComponent(UIOpacity);
      op.opacity = 0;
      flyNode.setScale(0.6, 0.6, 1);

      // 加载物品贴图
      if (spritePath) {
        loadSpriteFrame(spritePath, sf => {
          if (sf && sprite.isValid) applySpriteFrame(sprite, sf);
        });
      }

      // 计算弧线中点：起止点中间 + 向上拱起（本地坐标系）
      const mid = new Vec3(
        (fromLocal.x + cardLocal.x) / 2 + (Math.random() - 0.5) * 40,
        Math.min(fromLocal.y, cardLocal.y) - 60 - Math.random() * 30,
        0,
      );

      const delay = i * 0.08;
      const duration = 0.32;

      tween(flyNode)
        .delay(delay)
        .call(() => { op.opacity = 255; })
        .to(duration * 0.45, {
          position: mid,
          scale: new Vec3(1, 1, 1),
        }, { easing: 'sineOut' })
        .to(duration * 0.55, {
          position: cardLocal.clone(),
          scale: new Vec3(0.3, 0.3, 1),
        }, {
          easing: 'sineIn',
          onUpdate: (_t, ratio) => {
            op.opacity = Math.round(255 * (1 - ratio * 0.5));
          },
        })
        .call(() => { if (flyNode.isValid) flyNode.destroy(); })
        .start();
    });
  }

  /** 订单卡星星爆发：交付完成时在订单卡周围爆出彩色星星 */
  private _spawnOrderStarBurst(card: Node): void {
    const canvas = GameManager.instance.node;
    const cardWorldPos = card.getWorldPosition();
    // 世界坐标转 canvas 本地坐标
    const canvasTransform = canvas.getComponent(UITransform);
    const cardLocal = canvasTransform?.convertToNodeSpaceAR(cardWorldPos) ?? cardWorldPos;
    const colors = [
      new Color(255, 215, 0, 255),
      new Color(255, 107, 107, 255),
      new Color(100, 181, 246, 255),
      new Color(129, 199, 132, 255),
      new Color(206, 147, 216, 255),
    ];

    const count = 10;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
      const dist = 40 + Math.random() * 50;
      const color = colors[Math.floor(Math.random() * colors.length)];

      const node = new Node('orderStar');
      node.layer = canvas.layer;
      const size = 5 + Math.random() * 5;
      node.addComponent(UITransform).setContentSize(size, size);
      node.setPosition(cardLocal);
      canvas.addChild(node);
      node.setSiblingIndex(canvas.children.length - 1);

      const g = node.addComponent(Graphics);
      g.fillColor = color;
      // 画四角星
      const r = size / 2;
      g.moveTo(0, r);
      g.lineTo(r * 0.3, r * 0.3);
      g.lineTo(r, 0);
      g.lineTo(r * 0.3, -r * 0.3);
      g.lineTo(0, -r);
      g.lineTo(-r * 0.3, -r * 0.3);
      g.lineTo(-r, 0);
      g.lineTo(-r * 0.3, r * 0.3);
      g.close();
      g.fill();

      const op = node.addComponent(UIOpacity);
      op.opacity = 255;
      node.setScale(0.3, 0.3, 1);

      const dx = Math.cos(angle) * dist;
      const dy = Math.sin(angle) * dist;

      tween(node)
        .to(0.12, { scale: new Vec3(1.2, 1.2, 1) }, { easing: 'backOut' })
        .to(0.4, {
          position: new Vec3(cardLocal.x + dx, cardLocal.y + dy, 0),
          scale: new Vec3(0.2, 0.2, 1),
        }, {
          easing: 'quadOut',
          onUpdate: (_t, ratio) => {
            op.opacity = Math.round(255 * (1 - ratio));
          },
        })
        .call(() => { if (node.isValid) node.destroy(); })
        .start();
    }
  }
}
