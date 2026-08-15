import { _decorator, Component, Prefab, UITransform, Vec3, instantiate, Label } from 'cc';

import type { Order } from '../core/order';
import { getOrderItemName } from '../core/order';
import { GameManager } from '../manager/GameManager';
import { createSpriteNode, UI_COLORS } from './ui-factory';

const { ccclass, property } = _decorator;

/** 竖版木牌卡片（对齐 Web 版 OrderPanel.vue .card：order-card 背景图、约 3:4 比例） */
const CARD_WIDTH = 110;
const CARD_HEIGHT = 150;
const CARD_GAP = 12;
const REQ_LABEL_Y = 20;
const REWARD_LABEL_Y = -42;

/**
 * 订单面板：渲染当前 activeOrders 列表。
 *
 * 每个订单实例化一份 OrderCard.prefab，运行时套用木牌背景图，
 * 卡片内的 Label 子节点（reqLabel / rewardLabel）填充文本。
 */
@ccclass('OrderPanelComponent')
export class OrderPanelComponent extends Component {
  @property({ type: Prefab, tooltip: 'OrderCard.prefab — 单张订单卡片' })
  orderCardPrefab: Prefab | null = null;

  protected onEnable(): void {
    const gm = GameManager.instance;
    gm.events.on('orders:changed', this._onOrdersChanged);
    gm.events.on('save:loaded', this._onOrdersChanged);
    this._render(gm.order.activeOrders);
  }

  protected onDisable(): void {
    const gm = GameManager.instance;
    gm.events.off('orders:changed', this._onOrdersChanged);
    gm.events.off('save:loaded', this._onOrdersChanged);
  }

  private _onOrdersChanged = (): void => {
    this._render(GameManager.instance.order.activeOrders);
  };

  private _render(orders: readonly Order[]): void {
    this.node.removeAllChildren();
    if (!this.orderCardPrefab) return;

    const step = CARD_WIDTH + CARD_GAP;
    const originX = -((orders.length - 1) * step) / 2;

    for (let i = 0; i < orders.length; i++) {
      const order = orders[i];
      const card = instantiate(this.orderCardPrefab);
      card.getComponent(UITransform)?.setContentSize(CARD_WIDTH, CARD_HEIGHT);
      card.setPosition(new Vec3(originX + i * step, 0, 0));
      this.node.addChild(card);

      // 木牌背景图垫底
      createSpriteNode('cardBg', card, 0, CARD_WIDTH, CARD_HEIGHT, 'sprites/bg/order-card');

      // 文案用中文文本：小游戏运行时不渲染彩色 emoji
      const reqLabel = card.getChildByName('reqLabel')?.getComponent(Label);
      if (reqLabel) {
        reqLabel.node.setPosition(new Vec3(0, REQ_LABEL_Y, 0));
        reqLabel.color = UI_COLORS.textBrown;
        reqLabel.fontSize = 18;
        reqLabel.lineHeight = 23;
        reqLabel.string = order.requirements
          .map(r => `${getOrderItemName(r.itemId)}${r.fulfilled ? '（已交）' : ''}`)
          .join('\n');
      }
      const rewardLabel = card.getChildByName('rewardLabel')?.getComponent(Label);
      if (rewardLabel) {
        rewardLabel.node.setPosition(new Vec3(0, REWARD_LABEL_Y, 0));
        rewardLabel.color = UI_COLORS.textBrown;
        rewardLabel.fontSize = 16;
        rewardLabel.lineHeight = 20;
        const energy = order.reward.energy ? `\n精力+${order.reward.energy}` : '';
        rewardLabel.string = `金币+${order.reward.coins}${energy}`;
      }
    }
  }
}
