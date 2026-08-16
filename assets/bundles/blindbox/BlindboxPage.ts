import { _decorator, Color, Component, Graphics, Label, Node, UITransform, Vec3 } from 'cc';

import { GameManager } from '../../scripts/manager/GameManager';
import { addAlignedWidget, createPageChrome, showPageToast } from '../../scripts/components/bundle-pages';
import { TapZoneComponent } from '../../scripts/components/tap-zone';
import { UI_COLORS } from '../../scripts/components/ui-factory';
import type { BlindBoxResult } from '../../scripts/core/types';
import { NORMAL_BOX_COST, PREMIUM_BOX_COST } from '../../scripts/core/blindbox';
import { getDroppableCategories } from '../../scripts/core/shard';
import { CATEGORIES, INGREDIENT_BY_ID, getItemById, type Category } from '../../scripts/data/items';

const { ccclass } = _decorator;

const BOX_W = 300;
const BOX_H = 220;

/** 普通盲盒底色（暖棕） */
const NORMAL_BOX_BG = new Color(214, 168, 110, 255);
/** 高级盲盒底色（金黄） */
const PREMIUM_BOX_BG = new Color(255, 205, 92, 255);
/** 品类选择按钮底色 */
const PICK_BG = new Color(255, 232, 192, 255);

function categoryName(id: string | undefined): string {
  return CATEGORIES.find(c => c.id === id)?.name ?? '';
}

/** 盲盒结果 → 展示文案 */
function resultText(result: BlindBoxResult): string {
  switch (result.type) {
    case 'coins':
      return `金币 +${result.amount}`;
    case 'energy':
      return `精力 +${result.amount}`;
    case 'shard':
      return `${categoryName(result.category)}碎片 +${result.amount}`;
    case 'targetShard':
      return '抽中指定碎片！请选择品类';
    case 'ingredientShard': {
      const name = result.ingredientId
        ? INGREDIENT_BY_ID.get(result.ingredientId)?.name ?? '原料'
        : '原料';
      return `${name}碎片 +${result.amount}`;
    }
    case 'item': {
      if (!result.itemId) return '棋盘已满，物品奖励未能放下';
      const def = getItemById().get(result.itemId);
      return `获得物品：${def?.name ?? result.itemId}`;
    }
  }
}

/**
 * 盲盒页（blindbox 分包）：普通盲盒（金币）/ 高级盲盒（钻石），
 * 保底进度展示；抽中 targetShard 时弹出品类选择。
 */
@ccclass('BlindboxPageComponent')
export class BlindboxPageComponent extends Component {
  private _walletLabel: Label | null = null;
  private _normalPityLabel: Label | null = null;
  private _premiumPityLabel: Label | null = null;
  private _resultLabel: Label | null = null;
  private _pickerRow: Node | null = null;

  private readonly _onEconomy = (): void => this._refreshWallet();

  protected onLoad(): void {
    createPageChrome(this.node, '盲盒商店');
    GameManager.instance.events.on('economy:changed', this._onEconomy);

    this._walletLabel = this._mountTopLabel('wallet', 246, 26);
    this._mountBoxes();
    this._resultLabel = this._mountTopLabel('result', 700, 30);

    const picker = new Node('picker');
    picker.layer = this.node.layer;
    picker.addComponent(UITransform).setContentSize(660, 160);
    this.node.addChild(picker);
    addAlignedWidget(picker, { isAlignTop: true, top: 770 });
    this._pickerRow = picker;

    this._refreshWallet();
  }

  protected onDestroy(): void {
    GameManager.instance.events.off('economy:changed', this._onEconomy);
  }

  private _mountTopLabel(name: string, top: number, fontSize: number): Label {
    const node = new Node(name);
    node.layer = this.node.layer;
    node.addComponent(UITransform);
    this.node.addChild(node);
    const label = node.addComponent(Label);
    label.fontSize = fontSize;
    label.lineHeight = fontSize + 8;
    label.isBold = true;
    label.color = UI_COLORS.textBrown;
    addAlignedWidget(node, { isAlignTop: true, top });
    return label;
  }

  private _mountBoxes(): void {
    this._normalPityLabel = this._mountBox(
      'normalBox', -170, NORMAL_BOX_BG, '普通盲盒', `${NORMAL_BOX_COST} 金币`, 'normal',
    );
    this._premiumPityLabel = this._mountBox(
      'premiumBox', 170, PREMIUM_BOX_BG, '高级盲盒', `${PREMIUM_BOX_COST} 钻石`, 'premium',
    );
    this._refreshPity();
  }

  private _mountBox(
    name: string,
    x: number,
    bg: Color,
    title: string,
    costText: string,
    tier: 'normal' | 'premium',
  ): Label {
    const box = new Node(name);
    box.layer = this.node.layer;
    box.addComponent(UITransform).setContentSize(BOX_W, BOX_H);
    this.node.addChild(box);
    addAlignedWidget(box, { isAlignTop: true, top: 380, isAlignHorizontalCenter: true, horizontalCenter: x });

    const g = box.addComponent(Graphics);
    g.fillColor = bg;
    g.roundRect(-BOX_W / 2, -BOX_H / 2, BOX_W, BOX_H, 24);
    g.fill();
    g.lineWidth = 4;
    g.strokeColor = UI_COLORS.pillBorder;
    g.roundRect(-BOX_W / 2, -BOX_H / 2, BOX_W, BOX_H, 24);
    g.stroke();

    const lines: Array<{ text: string; y: number; size: number }> = [
      { text: title, y: 60, size: 34 },
      { text: costText, y: 10, size: 26 },
    ];
    for (const line of lines) {
      const node = new Node('label');
      node.layer = box.layer;
      node.addComponent(UITransform);
      node.setPosition(new Vec3(0, line.y, 0));
      box.addChild(node);
      const label = node.addComponent(Label);
      label.string = line.text;
      label.fontSize = line.size;
      label.lineHeight = line.size + 6;
      label.isBold = true;
      label.color = UI_COLORS.textBrown;
    }

    const pityNode = new Node('pity');
    pityNode.layer = box.layer;
    pityNode.addComponent(UITransform);
    pityNode.setPosition(new Vec3(0, -50, 0));
    box.addChild(pityNode);
    const pityLabel = pityNode.addComponent(Label);
    pityLabel.fontSize = 22;
    pityLabel.lineHeight = 28;
    pityLabel.color = UI_COLORS.textBrown;

    box.addComponent(TapZoneComponent).onTap = () => this._open(tier);
    return pityLabel;
  }

  private _open(tier: 'normal' | 'premium'): void {
    const gm = GameManager.instance;
    const result = gm.openBlindBox(tier);
    if (!result) {
      showPageToast(this.node, tier === 'normal' ? '金币不足' : '钻石不足');
      return;
    }
    if (this._resultLabel && this._resultLabel.isValid) {
      this._resultLabel.string = resultText(result);
    }
    this._refreshPity();
    if (result.type === 'targetShard') {
      this._showCategoryPicker();
    } else {
      this._clearPicker();
    }
  }

  /** targetShard：列出当前可掉落碎片的品类供选择 */
  private _showCategoryPicker(): void {
    const picker = this._pickerRow;
    if (!picker || !picker.isValid) return;
    picker.removeAllChildren();

    const gm = GameManager.instance;
    const cats = getDroppableCategories(gm.shard, gm.unlockedCategories);
    if (cats.length === 0) {
      if (this._resultLabel) this._resultLabel.string = '暂无可收集的碎片品类';
      return;
    }

    const size = 150;
    const gap = 16;
    const perRow = 4;
    cats.forEach((cat, i) => {
      const row = Math.floor(i / perRow);
      const col = i % perRow;
      const rowCount = Math.min(cats.length - row * perRow, perRow);
      const rowW = rowCount * size + (rowCount - 1) * gap;
      const btn = new Node(`pick_${cat}`);
      btn.layer = picker.layer;
      btn.addComponent(UITransform).setContentSize(size, 64);
      btn.setPosition(new Vec3(-rowW / 2 + size / 2 + col * (size + gap), 40 - row * 80, 0));
      picker.addChild(btn);

      const g = btn.addComponent(Graphics);
      g.fillColor = PICK_BG;
      g.roundRect(-size / 2, -32, size, 64, 16);
      g.fill();
      g.lineWidth = 3;
      g.strokeColor = UI_COLORS.pillBorder;
      g.roundRect(-size / 2, -32, size, 64, 16);
      g.stroke();

      const labelNode = new Node('label');
      labelNode.layer = btn.layer;
      labelNode.addComponent(UITransform);
      btn.addChild(labelNode);
      const label = labelNode.addComponent(Label);
      label.string = `${categoryName(cat)}碎片`;
      label.fontSize = 24;
      label.lineHeight = 30;
      label.isBold = true;
      label.color = UI_COLORS.textBrown;

      btn.addComponent(TapZoneComponent).onTap = () => this._pickCategory(cat);
    });
  }

  private _pickCategory(cat: Category): void {
    const gm = GameManager.instance;
    if (gm.confirmTargetShard(cat)) {
      if (this._resultLabel) this._resultLabel.string = `${categoryName(cat)}碎片 +1`;
      showPageToast(this.node, `${categoryName(cat)}碎片 +1`);
    }
    this._clearPicker();
  }

  private _clearPicker(): void {
    if (this._pickerRow && this._pickerRow.isValid) this._pickerRow.removeAllChildren();
  }

  private _refreshWallet(): void {
    const gm = GameManager.instance;
    if (this._walletLabel && this._walletLabel.isValid) {
      this._walletLabel.string = `金币 ${gm.economy.coins} · 钻石 ${gm.economy.diamonds}`;
    }
  }

  private _refreshPity(): void {
    const gm = GameManager.instance;
    if (this._normalPityLabel && this._normalPityLabel.isValid) {
      this._normalPityLabel.string = `保底 ${gm.blindBox.normalPity}/10`;
    }
    if (this._premiumPityLabel && this._premiumPityLabel.isValid) {
      this._premiumPityLabel.string = `保底 ${gm.blindBox.premiumPity}/5`;
    }
  }
}
