import { _decorator, BlockInputEvents, Color, Component, Graphics, Label, Node, Sprite, UITransform, Vec3, view } from 'cc';

import { CATEGORIES, type Category, getItemSpritePath, getMotherItemId } from '../data/items';
import { getLevelDef } from '../core/level';
import { TapZoneComponent, pushModalLayer, popModalLayer } from './tap-zone';
import { UI_COLORS } from './ui-factory';
import { loadSpriteFrame, applySpriteFrame } from './sprite-loader';
import { fontManager } from '../core/font-manager';
import { playSfx } from '../manager/AudioManager';

const { ccclass } = _decorator;

/** 遮罩色 */
const OVERLAY_BG = new Color(60, 40, 20, 153);
/** 弹窗底色 */
const CARD_BG = new Color(255, 252, 245, 255);
/** 弹窗描边 */
const CARD_BORDER = new Color(212, 178, 140, 255);
/** 金色高亮 */
const GOLD = new Color(245, 166, 35, 255);
/** 奖励文字色 */
const REWARD_COLOR = new Color(139, 107, 74, 255);

const MODAL_W = 480;
const MODAL_H = 560;

const LEVEL_UP_NODE = 'levelUpModal';

export interface LevelUpInfo {
  newLevel: number;
  unlockedCategories: Category[];
  rewardEnergy: number;
  rewardCoins: number;
}

/**
 * 升级解锁弹窗：展示新等级、新解锁品类母棋、升级奖励。
 * 升级解锁新品类时弹出，点击任意处或确认按钮关闭。
 */
@ccclass('LevelUpModal')
export class LevelUpModal extends Component {
  static show(canvas: Node, info: LevelUpInfo): boolean {
    if (canvas.getChildByName(LEVEL_UP_NODE)) return false;

    const vs = view.getVisibleSize();
    const overlay = new Node(LEVEL_UP_NODE);
    overlay.layer = canvas.layer;
    overlay.addComponent(UITransform).setContentSize(vs.width, vs.height);
    canvas.addChild(overlay);
    overlay.addComponent(BlockInputEvents);

    const bg = overlay.addComponent(Graphics);
    bg.fillColor = OVERLAY_BG;
    bg.rect(-vs.width / 2, -vs.height / 2, vs.width, vs.height);
    bg.fill();

    pushModalLayer(overlay);
    overlay.addComponent(LevelUpModal)._build(info);
    return true;
  }

  private _build(info: LevelUpInfo): void {
    const overlay = this.node;

    // 弹窗主体
    const modal = new Node('card');
    modal.layer = overlay.layer;
    modal.addComponent(UITransform).setContentSize(MODAL_W, MODAL_H);
    overlay.addChild(modal);
    const g = modal.addComponent(Graphics);
    g.fillColor = CARD_BG;
    g.roundRect(-MODAL_W / 2, -MODAL_H / 2, MODAL_W, MODAL_H, 28);
    g.fill();
    g.lineWidth = 4;
    g.strokeColor = CARD_BORDER;
    g.roundRect(-MODAL_W / 2, -MODAL_H / 2, MODAL_W, MODAL_H, 28);
    g.stroke();

    // 标题：升级啦！
    this._addLabel(modal, '升级啦！', 36, GOLD, new Vec3(0, MODAL_H / 2 - 60, 0), true);

    // Lv.X
    this._addLabel(modal, `Lv.${info.newLevel}`, 48, UI_COLORS.textBrown, new Vec3(0, MODAL_H / 2 - 115, 0), true);

    // 新解锁品类展示
    if (info.unlockedCategories.length > 0) {
      const cat = info.unlockedCategories[0];
      const catDef = CATEGORIES.find(c => c.id === cat);
      const catName = catDef?.name ?? cat;

      this._addLabel(modal, '解锁新品类', 22, REWARD_COLOR, new Vec3(0, 60, 0), true);

      // 母棋大图
      const motherId = getMotherItemId(cat);
      const spritePath = getItemSpritePath(motherId);
      const iconNode = new Node('motherIcon');
      iconNode.layer = modal.layer;
      iconNode.addComponent(UITransform).setContentSize(140, 140);
      iconNode.setPosition(new Vec3(0, -10, 0));
      modal.addChild(iconNode);
      const sprite = iconNode.addComponent(Sprite);
      if (spritePath) {
        loadSpriteFrame(spritePath, sf => {
          if (sprite.isValid && sf) applySpriteFrame(sprite, sf);
        });
      }

      // 品类名称
      this._addLabel(modal, `${catName}工坊`, 28, UI_COLORS.textBrown, new Vec3(0, -105, 0), true);
    }

    // 升级奖励
    const rewardY = -MODAL_H / 2 + 130;
    this._addLabel(modal, `+${info.rewardEnergy} 精力  +${info.rewardCoins} 金币`, 22, REWARD_COLOR, new Vec3(0, rewardY, 0), true);

    // 确认按钮
    const btnW = 200;
    const btnH = 60;
    const btn = new Node('confirmBtn');
    btn.layer = modal.layer;
    btn.addComponent(UITransform).setContentSize(btnW, btnH);
    btn.setPosition(new Vec3(0, -MODAL_H / 2 + 60, 0));
    modal.addChild(btn);
    const bg2 = btn.addComponent(Graphics);
    bg2.fillColor = GOLD;
    bg2.roundRect(-btnW / 2, -btnH / 2, btnW, btnH, btnH / 2);
    bg2.fill();
    this._addLabel(btn, '太棒了', 26, Color.WHITE, new Vec3(0, 0, 0), true);

    const close = () => {
      playSfx('click');
      if (overlay.isValid) {
        popModalLayer(overlay);
        overlay.destroy();
      }
    };
    btn.addComponent(TapZoneComponent).onTap = close;
    overlay.addComponent(TapZoneComponent).onTap = close;

    fontManager.applyFontToTree(overlay);
  }

  private _addLabel(parent: Node, text: string, size: number, color: Color, pos: Vec3, bold = false): Label {
    const node = new Node('label');
    node.layer = parent.layer;
    const ui = node.addComponent(UITransform);
    ui.setContentSize(size * 8, size * 1.6);
    node.setPosition(pos);
    parent.addChild(node);
    const label = node.addComponent(Label);
    label.string = text;
    label.fontSize = size;
    label.lineHeight = size * 1.4;
    label.isBold = bold;
    label.color = color;
    label.overflow = Label.Overflow.SHRINK;
    label.horizontalAlign = Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    fontManager.applyFont(label);
    return label;
  }
}
