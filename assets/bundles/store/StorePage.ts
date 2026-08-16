import { _decorator, Color, Component, Graphics, Label, Node, UITransform, Vec3 } from 'cc';

import { AD_DIAMOND_REWARD, GameManager } from '../../scripts/manager/GameManager';
import { addAlignedWidget, createPageChrome, showPageToast } from '../../scripts/components/bundle-pages';
import { TapZoneComponent } from '../../scripts/components/tap-zone';
import { UI_COLORS } from '../../scripts/components/ui-factory';
import { getConfig } from '../../scripts/core/config';

const { ccclass } = _decorator;

const PAGE_W = 720;
const MARGIN = 40;
const CONTENT_W = PAGE_W - MARGIN * 2;

const ROW_H = 100;
const ROW_GAP = 12;

const BTN_W = 150;
const BTN_H = 60;

/** 可购买（绿） */
const BUY_BG = new Color(126, 191, 108, 255);
/** 不可购买（灰） */
const DIM_BG = new Color(180, 160, 140, 255);
/** 看广告（暖金） */
const AD_BG = new Color(232, 168, 62, 255);

/** 精力购买档位 —— 对齐 Web StoreTab 的 ENERGY_OPTIONS */
type EnergyOption =
  | { id: string; label: string; amount: number; type: 'ad' }
  | { id: string; label: string; amount: number; type: 'diamond'; diamondCost: number }
  | { id: string; label: string; amount: number; type: 'coins'; coinCost: number };


/**
 * 商店页（store 分包）：精力购买 + 看广告得钻石。
 *
 * 与 Web ShopFullView → StoreTab 同构。精力的钻石档位受 features.diamondSpend
 * 控制、钻石礼包与月卡受 features.iap 控制，V1.0 两者都关；
 * 因此当前实际出三档：看广告得精力、金币换精力、看广告得钻石
 * （最后一档在 Web 侧同样是免费档，不受 iap 开关限制）。
 */
@ccclass('StorePageComponent')
export class StorePageComponent extends Component {
  private _content: Node | null = null;
  private _busy = false;
  private readonly _onChanged = (): void => this._render();

  protected onLoad(): void {
    createPageChrome(this.node, '商店');

    const gm = GameManager.instance;
    gm.events.on('economy:changed', this._onChanged);
    gm.events.on('energy:changed', this._onChanged);
    // 金币换精力有每日次数上限，次数变化要刷新按钮
    gm.events.on('daily:changed', this._onChanged);

    const content = new Node('content');
    content.layer = this.node.layer;
    content.addComponent(UITransform).setContentSize(CONTENT_W, 700);
    this.node.addChild(content);
    addAlignedWidget(content, { isAlignTop: true, top: 250 });
    this._content = content;

    this._render();
  }

  protected onDestroy(): void {
    const gm = GameManager.instance;
    gm.events.off('economy:changed', this._onChanged);
    gm.events.off('energy:changed', this._onChanged);
    gm.events.off('daily:changed', this._onChanged);
  }

  /** 当前开放的精力档位（按 feature flag 过滤） */
  private _energyOptions(): EnergyOption[] {
    const cfg = getConfig();
    const opts: EnergyOption[] = [
      { id: 'en1', label: '看广告得精力', amount: cfg.energy.adReward, type: 'ad' },
    ];
    // 钻石消费未开放时不出钻石档，避免玩家点了才发现不能买
    if (cfg.features.diamondSpend) {
      opts.push(
        { id: 'en2', label: '精力药水', amount: 20, type: 'diamond', diamondCost: 3 },
        { id: 'en3', label: '精力药水', amount: 40, type: 'diamond', diamondCost: 5 },
        { id: 'en4', label: '精力药水', amount: 60, type: 'diamond', diamondCost: 8 },
      );
    }
    opts.push({
      id: 'en5',
      label: '金币换精力',
      amount: cfg.energy.coinRefillAmount,
      type: 'coins',
      coinCost: cfg.energy.coinRefillCost,
    });
    return opts;
  }

  private _render(): void {
    const content = this._content;
    if (!content || !content.isValid) return;
    content.removeAllChildren();

    const gm = GameManager.instance;
    const top = (content.getComponent(UITransform)?.height ?? 0) / 2;

    this._buildLabel(
      content,
      `金币 ${gm.economy.coins}　钻石 ${gm.economy.diamonds}`,
      24,
      new Vec3(-CONTENT_W / 2 + 4, top - 18, 0),
      { anchorLeft: true, width: CONTENT_W },
    );
    this._buildLabel(
      content,
      `精力 ${gm.energy.current}/${gm.energy.max}`,
      24,
      new Vec3(-CONTENT_W / 2 + 4, top - 54, 0),
      { anchorLeft: true, width: CONTENT_W },
    );

    let y = top - 96;
    for (const opt of this._energyOptions()) {
      this._buildRow(content, y, opt);
      y -= ROW_H + ROW_GAP;
    }

    // 钻石区：iap / 月卡档位 V1.0 未开放，这里只出「看广告得钻石」
    y -= 16;
    this._buildDiamondAdRow(content, y);
  }

  private _buildRow(parent: Node, top: number, opt: EnergyOption): void {
    const gm = GameManager.instance;

    const row = new Node(`opt_${opt.id}`);
    row.layer = parent.layer;
    row.addComponent(UITransform).setContentSize(CONTENT_W, ROW_H);
    row.setPosition(new Vec3(0, top - ROW_H / 2, 0));
    parent.addChild(row);

    const g = row.addComponent(Graphics);
    g.fillColor = UI_COLORS.cellLight;
    g.roundRect(-CONTENT_W / 2, -ROW_H / 2, CONTENT_W, ROW_H, 14);
    g.fill();

    const textX = -CONTENT_W / 2 + 24;
    this._buildLabel(row, opt.label, 24, new Vec3(textX, 18, 0), {
      bold: true,
      anchorLeft: true,
      width: CONTENT_W - BTN_W - 60,
    });

    let desc: string;
    let btnLabel: string;
    let enabled: boolean;
    let bg: Color;

    if (opt.type === 'ad') {
      desc = `+${opt.amount} 精力`;
      btnLabel = '免费';
      enabled = true;
      bg = AD_BG;
    } else if (opt.type === 'diamond') {
      desc = `+${opt.amount} 精力`;
      btnLabel = `${opt.diamondCost} 钻石`;
      enabled = gm.economy.diamonds >= opt.diamondCost;
      bg = enabled ? BUY_BG : DIM_BG;
    } else {
      const left = gm.coinRefillRemaining;
      desc = `+${opt.amount} 精力　今日剩余 ${left}/${getConfig().energy.coinRefillDailyLimit}`;
      btnLabel = `${opt.coinCost} 金币`;
      enabled = left > 0 && gm.economy.coins >= opt.coinCost;
      bg = enabled ? BUY_BG : DIM_BG;
    }

    this._buildLabel(row, desc, 18, new Vec3(textX, -16, 0), {
      anchorLeft: true,
      width: CONTENT_W - BTN_W - 60,
    });

    this._buildButton(row, new Vec3(CONTENT_W / 2 - BTN_W / 2 - 20, 0, 0), btnLabel, bg, enabled, () =>
      void this._onBuy(opt),
    );
  }

  /** 看广告得钻石（Web DIAMOND_PACKS 的 dp1，免费档，不受 iap 开关限制） */
  private _buildDiamondAdRow(parent: Node, top: number): void {
    const row = new Node('opt_dp1');
    row.layer = parent.layer;
    row.addComponent(UITransform).setContentSize(CONTENT_W, ROW_H);
    row.setPosition(new Vec3(0, top - ROW_H / 2, 0));
    parent.addChild(row);

    const g = row.addComponent(Graphics);
    g.fillColor = UI_COLORS.cellLight;
    g.roundRect(-CONTENT_W / 2, -ROW_H / 2, CONTENT_W, ROW_H, 14);
    g.fill();

    const textX = -CONTENT_W / 2 + 24;
    this._buildLabel(row, '看广告得钻石', 24, new Vec3(textX, 18, 0), {
      bold: true,
      anchorLeft: true,
      width: CONTENT_W - BTN_W - 60,
    });
    this._buildLabel(row, `+${AD_DIAMOND_REWARD} 钻石`, 18, new Vec3(textX, -16, 0), {
      anchorLeft: true,
      width: CONTENT_W - BTN_W - 60,
    });

    this._buildButton(row, new Vec3(CONTENT_W / 2 - BTN_W / 2 - 20, 0, 0), '免费', AD_BG, true, () =>
      void this._onWatchAdForDiamonds(),
    );
  }

  private async _onWatchAdForDiamonds(): Promise<void> {
    if (this._busy) return;
    this._busy = true;
    try {
      const ok = await GameManager.instance.watchAdForDiamonds();
      // 广告期间玩家可能已经返回关掉本页，节点没了就别再挂 toast
      if (this.node.isValid) {
        showPageToast(this.node, ok ? `+${AD_DIAMOND_REWARD} 钻石` : '广告未看完，钻石没有到账');
      }
    } finally {
      this._busy = false;
    }
  }

  private async _onBuy(opt: EnergyOption): Promise<void> {
    // 广告是异步的，期间禁止再次下单，避免连点弹两次广告 / 重复扣费
    if (this._busy) return;
    const gm = GameManager.instance;

    if (opt.type === 'ad') {
      this._busy = true;
      try {
        const ok = await gm.watchAdForEnergy();
        // 广告期间玩家可能已经返回关掉本页，节点没了就别再挂 toast
        if (this.node.isValid) {
          showPageToast(this.node, ok ? `+${opt.amount} 精力` : '广告未看完，精力没有补上');
        }
      } finally {
        this._busy = false;
      }
      return;
    }

    if (opt.type === 'diamond') {
      const ok = gm.buyEnergyWithDiamonds(opt.diamondCost, opt.amount);
      showPageToast(this.node, ok ? `+${opt.amount} 精力` : '钻石不足');
      return;
    }

    if (gm.coinRefillRemaining <= 0) {
      showPageToast(this.node, '今日金币购买次数已用完');
      return;
    }
    const ok = gm.buyEnergyWithCoins();
    showPageToast(this.node, ok ? `+${opt.amount} 精力` : '金币不足');
  }

  // --- 构件 ---

  private _buildButton(
    parent: Node,
    pos: Vec3,
    text: string,
    bg: Color,
    enabled: boolean,
    onTap: () => void,
  ): void {
    const btn = new Node('button');
    btn.layer = parent.layer;
    btn.addComponent(UITransform).setContentSize(BTN_W, BTN_H);
    btn.setPosition(pos);
    parent.addChild(btn);

    const g = btn.addComponent(Graphics);
    g.fillColor = enabled ? bg : DIM_BG;
    g.roundRect(-BTN_W / 2, -BTN_H / 2, BTN_W, BTN_H, 12);
    g.fill();

    this._buildLabel(btn, text, 22, new Vec3(0, 0, 0), {
      bold: true,
      color: new Color(255, 252, 245, enabled ? 255 : 200),
      width: BTN_W - 10,
    });

    // 不可购买时不挂点击区，避免点了没反馈
    if (enabled) btn.addComponent(TapZoneComponent).onTap = onTap;
  }

  private _buildLabel(
    parent: Node,
    text: string,
    fontSize: number,
    pos: Vec3,
    opts: { bold?: boolean; color?: Color; anchorLeft?: boolean; width?: number } = {},
  ): void {
    const node = new Node('label');
    node.layer = parent.layer;
    const ui = node.addComponent(UITransform);
    if (opts.width) ui.setContentSize(opts.width, fontSize * 1.6);
    if (opts.anchorLeft) ui.setAnchorPoint(0, 0.5);
    node.setPosition(pos);
    parent.addChild(node);

    const label = node.addComponent(Label);
    label.string = text;
    label.fontSize = fontSize;
    label.lineHeight = fontSize * 1.3;
    label.isBold = opts.bold ?? false;
    label.color = opts.color ?? UI_COLORS.textBrown;
    label.overflow = Label.Overflow.SHRINK;
    if (opts.anchorLeft) label.horizontalAlign = Label.HorizontalAlign.LEFT;
  }
}
