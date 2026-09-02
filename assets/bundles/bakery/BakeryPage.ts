import { _decorator, Color, Component, Graphics, Label, Node, UITransform, Vec3 } from 'cc';

import { GameManager } from '../../scripts/manager/GameManager';
import { addAlignedWidget, createPageChrome, showPageToast } from '../../scripts/components/bundle-pages';
import { TapZoneComponent } from '../../scripts/components/tap-zone';
import { UI_COLORS } from '../../scripts/components/ui-factory';
import { BAKERY_SLOTS, getSlotDeco } from '../../scripts/core/bakery';
import { DECORATIONS, DECORATION_BY_ID, getPlacedEffects, isOwned } from '../../scripts/core/shop';

const { ccclass } = _decorator;

/** 摆放区尺寸（BAKERY_SLOTS 的百分比坐标映射到这个区域） */
const SCENE_W = 660;
const SCENE_H = 600;

/** 摆放区底色（烘焙坊暖色地面） */
const SCENE_BG = new Color(238, 214, 178, 255);
/** 空槽位底色 */
const SLOT_BG = new Color(255, 248, 238, 140);
/** 已摆放槽位底色 */
const SLOT_FILLED_BG = new Color(255, 232, 192, 255);
/** 选中装饰的描边 */
const SELECTED_STROKE = new Color(255, 150, 70, 255);

const CHIP_W = 152;
const CHIP_H = 96;

/**
 * 烘焙坊页（bakery 分包）：槽位式装饰摆放。
 * 底部装饰栏：未拥有 → 金币购买；已拥有 → 选中后点槽位摆放；
 * 未选中装饰时点击已摆放的槽位 → 收起该装饰。
 */
@ccclass('BakeryPageComponent')
export class BakeryPageComponent extends Component {
  private _sceneArea: Node | null = null;
  private _decoStrip: Node | null = null;
  private _effectLabel: Label | null = null;
  private _selectedDecoId: string | null = null;

  private readonly _onChanged = (): void => this._render();

  protected onLoad(): void {
    createPageChrome(this.node, '');

    const gm = GameManager.instance;
    gm.events.on('bakery:changed', this._onChanged);
    gm.events.on('shop:changed', this._onChanged);
    gm.events.on('economy:changed', this._onChanged);

    // 加成汇总行
    const effectNode = new Node('effects');
    effectNode.layer = this.node.layer;
    effectNode.addComponent(UITransform);
    this.node.addChild(effectNode);
    this._effectLabel = effectNode.addComponent(Label);
    this._effectLabel.fontSize = 24;
    this._effectLabel.lineHeight = 30;
    this._effectLabel.color = UI_COLORS.textBrown;
    addAlignedWidget(effectNode, { isAlignTop: true, top: 246 });

    // 槽位摆放区
    const scene = new Node('scene');
    scene.layer = this.node.layer;
    scene.addComponent(UITransform).setContentSize(SCENE_W, SCENE_H);
    this.node.addChild(scene);
    addAlignedWidget(scene, { isAlignTop: true, top: 300 });
    this._sceneArea = scene;

    // 底部装饰栏
    const strip = new Node('decoStrip');
    strip.layer = this.node.layer;
    strip.addComponent(UITransform).setContentSize(SCENE_W, CHIP_H + 60);
    this.node.addChild(strip);
    addAlignedWidget(strip, { isAlignBottom: true, bottom: 60 });
    this._decoStrip = strip;

    this._render();
  }

  protected onDestroy(): void {
    const gm = GameManager.instance;
    gm.events.off('bakery:changed', this._onChanged);
    gm.events.off('shop:changed', this._onChanged);
    gm.events.off('economy:changed', this._onChanged);
  }

  private _render(): void {
    this._renderEffects();
    this._renderScene();
    this._renderStrip();
  }

  private _renderEffects(): void {
    if (!this._effectLabel || !this._effectLabel.isValid) return;
    const gm = GameManager.instance;
    const placedIds = gm.bakery.placed.map(p => p.decoId);
    const fx = getPlacedEffects(gm.shop, placedIds);
    const parts: string[] = [];
    if (fx.extraOrders > 0) parts.push(`订单 +${fx.extraOrders}`);
    if (fx.rareOrderBonus > 0) parts.push(`稀有 +${Math.round(fx.rareOrderBonus * 100)}%`);
    if (fx.coinBonus > 0) parts.push(`金币 +${Math.round(fx.coinBonus * 100)}%`);
    this._effectLabel.string = parts.length > 0 ? `当前加成：${parts.join(' · ')}` : '摆放装饰可获得经营加成';
  }

  /** 槽位：百分比坐标（x/y 为左上角、y 向下）映射到 SCENE_W×SCENE_H 区域 */
  private _renderScene(): void {
    const scene = this._sceneArea;
    if (!scene || !scene.isValid) return;
    scene.removeAllChildren();

    const bg = new Node('sceneBg');
    bg.layer = scene.layer;
    bg.addComponent(UITransform).setContentSize(SCENE_W, SCENE_H);
    scene.addChild(bg);
    const bgG = bg.addComponent(Graphics);
    bgG.fillColor = SCENE_BG;
    bgG.roundRect(-SCENE_W / 2, -SCENE_H / 2, SCENE_W, SCENE_H, 24);
    bgG.fill();

    const gm = GameManager.instance;
    for (const slot of BAKERY_SLOTS) {
      const w = (slot.width / 100) * SCENE_W;
      const h = (slot.height / 100) * SCENE_H;
      const cx = -SCENE_W / 2 + ((slot.x + slot.width / 2) / 100) * SCENE_W;
      const cy = SCENE_H / 2 - ((slot.y + slot.height / 2) / 100) * SCENE_H;

      const decoId = getSlotDeco(gm.bakery, slot.id);
      const deco = decoId ? DECORATION_BY_ID.get(decoId) : undefined;

      const slotNode = new Node(`slot_${slot.id}`);
      slotNode.layer = scene.layer;
      slotNode.addComponent(UITransform).setContentSize(w, h);
      slotNode.setPosition(new Vec3(cx, cy, 0));
      scene.addChild(slotNode);

      const g = slotNode.addComponent(Graphics);
      g.fillColor = deco ? SLOT_FILLED_BG : SLOT_BG;
      g.roundRect(-w / 2, -h / 2, w, h, 14);
      g.fill();
      g.lineWidth = 3;
      g.strokeColor = UI_COLORS.pillBorder;
      g.roundRect(-w / 2, -h / 2, w, h, 14);
      g.stroke();

      const labelNode = new Node('label');
      labelNode.layer = slotNode.layer;
      const lui = labelNode.addComponent(UITransform);
      lui.setContentSize(w - 8, h - 8);
      slotNode.addChild(labelNode);
      const label = labelNode.addComponent(Label);
      label.string = deco ? deco.name : slot.label;
      label.fontSize = deco ? 22 : 18;
      label.lineHeight = 24;
      label.isBold = !!deco;
      label.overflow = Label.Overflow.SHRINK;
      label.enableWrapText = true;
      label.color = deco ? UI_COLORS.textBrown : new Color(111, 74, 57, 150);

      slotNode.addComponent(TapZoneComponent).onTap = () => this._onSlotTap(slot.id, slot.category, decoId);
    }
  }

  private _onSlotTap(slotId: string, slotCategory: string, placedDecoId: string | undefined): void {
    const gm = GameManager.instance;
    const selectedId = this._selectedDecoId;

    if (selectedId) {
      const deco = DECORATION_BY_ID.get(selectedId);
      if (!deco) return;
      if (deco.slotCategory !== slotCategory) {
        showPageToast(this.node, `${deco.name} 只能摆在${slotCategoryName(deco.slotCategory)}`);
        return;
      }
      this._selectedDecoId = null;
      gm.placeDecoAt(selectedId, slotId);
      showPageToast(this.node, `已摆放 ${deco.name}`);
      return;
    }

    if (placedDecoId) {
      const deco = DECORATION_BY_ID.get(placedDecoId);
      gm.removeDecoFrom(placedDecoId);
      showPageToast(this.node, `已收起 ${deco?.name ?? '装饰'}`);
    }
  }

  private _renderStrip(): void {
    const strip = this._decoStrip;
    if (!strip || !strip.isValid) return;
    strip.removeAllChildren();

    const hintNode = new Node('hint');
    hintNode.layer = strip.layer;
    hintNode.addComponent(UITransform);
    hintNode.setPosition(new Vec3(0, CHIP_H / 2 + 28, 0));
    strip.addChild(hintNode);
    const hint = hintNode.addComponent(Label);
    hint.string = this._selectedDecoId
      ? '点击上方槽位摆放；再点装饰可取消选中'
      : '点击装饰选中后摆放；点击已摆放的槽位可收起';
    hint.fontSize = 20;
    hint.lineHeight = 26;
    hint.color = new Color(111, 74, 57, 180);

    const gm = GameManager.instance;
    const gap = (SCENE_W - DECORATIONS.length * CHIP_W) / (DECORATIONS.length - 1);
    DECORATIONS.forEach((deco, i) => {
      const x = -SCENE_W / 2 + CHIP_W / 2 + i * (CHIP_W + gap);
      const owned = isOwned(gm.shop, deco.id);
      const placed = gm.bakery.placed.some(p => p.decoId === deco.id);
      const selected = this._selectedDecoId === deco.id;

      const chip = new Node(`deco_${deco.id}`);
      chip.layer = strip.layer;
      chip.addComponent(UITransform).setContentSize(CHIP_W, CHIP_H);
      chip.setPosition(new Vec3(x, 0, 0));
      strip.addChild(chip);

      const g = chip.addComponent(Graphics);
      g.fillColor = owned ? SLOT_FILLED_BG : UI_COLORS.pillBg;
      g.roundRect(-CHIP_W / 2, -CHIP_H / 2, CHIP_W, CHIP_H, 16);
      g.fill();
      g.lineWidth = selected ? 5 : 3;
      g.strokeColor = selected ? SELECTED_STROKE : UI_COLORS.pillBorder;
      g.roundRect(-CHIP_W / 2, -CHIP_H / 2, CHIP_W, CHIP_H, 16);
      g.stroke();

      const lines: Array<{ text: string; y: number; size: number; bold: boolean }> = [
        { text: deco.name, y: 24, size: 24, bold: true },
        {
          text: owned ? (placed ? '摆放中' : selected ? '已选中' : '已拥有') : `${deco.price} 金币`,
          y: -6,
          size: 20,
          bold: false,
        },
      ];
      if (deco.effectLabel) {
        lines.push({ text: deco.effectLabel, y: -32, size: 18, bold: false });
      }
      for (const line of lines) {
        const node = new Node('label');
        node.layer = chip.layer;
        node.addComponent(UITransform);
        node.setPosition(new Vec3(0, line.y, 0));
        chip.addChild(node);
        const label = node.addComponent(Label);
        label.string = line.text;
        label.fontSize = line.size;
        label.lineHeight = line.size + 4;
        label.isBold = line.bold;
        label.color = UI_COLORS.textBrown;
      }

      chip.addComponent(TapZoneComponent).onTap = () => this._onChipTap(deco.id, owned);
    });
  }

  private _onChipTap(decoId: string, owned: boolean): void {
    const gm = GameManager.instance;
    if (!owned) {
      const deco = DECORATION_BY_ID.get(decoId);
      if (gm.buyDeco(decoId)) {
        showPageToast(this.node, `已购买 ${deco?.name ?? '装饰'}`);
      } else {
        showPageToast(this.node, '金币不足');
      }
      return;
    }
    this._selectedDecoId = this._selectedDecoId === decoId ? null : decoId;
    this._render();
  }
}

function slotCategoryName(category: string): string {
  switch (category) {
    case 'wall': return '墙面';
    case 'floor': return '地面';
    case 'counter': return '柜台';
    default: return '对应位置';
  }
}
