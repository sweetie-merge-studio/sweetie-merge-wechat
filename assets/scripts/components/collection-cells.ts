import { Color, Graphics, Label, Node, Sprite, UITransform, Vec3 } from 'cc';

import { PulseEffect } from './effect-pulse';
import { loadSpriteFrame, applySpriteFrame } from './sprite-loader';
import { TapZoneComponent } from './tap-zone';
import { UI_COLORS } from './ui-factory';
import { getItemSpritePath } from '../data/items';

/**
 * 图鉴页公用的格子构件。
 *
 * 与 Web 版 Collection.vue 的视觉规范对齐：卡片圆角 14、未解锁虚线灰底 + lock 图标、
 * 未领取金色描边 + 钻石覆盖层。CollectionPage 只负责布局，具体格子长相都在这里。
 */

/** 卡片底色（Web .item 用 order-card 贴图，这里用等价的奶油白） */
export const CARD_BG = UI_COLORS.cellLight;
/** 未解锁底色 #F5F0E8 60%（Web .item.locked） */
export const LOCKED_BG = new Color(245, 240, 232, 150);
/** 未解锁虚线描边 #C8B9A0 50%（Web .item.locked border） */
export const LOCKED_BORDER = new Color(200, 185, 160, 128);
/** 未领取高亮描边 #D4A24E（Web .item.unclaimed box-shadow） */
export const UNCLAIMED_STROKE = new Color(212, 162, 78, 255);
/** 次级文字 #B8A080（Web .chain-node-level / .showcase-cat） */
export const TEXT_MUTED = new Color(184, 160, 128, 255);
/** 卡片描边 #D4B28C 30%（Web .category-card border） */
export const CARD_BORDER = new Color(212, 178, 140, 90);
/** 母棋条渐变底 #EDD0A8（Web .mother-strip） */
export const MOTHER_BG = new Color(237, 208, 168, 255);

export const LOCK_SPRITE = 'sprites/ui/lock';
export const DIAMOND_SPRITE = 'sprites/currency/diamond';

/** 在节点上画圆角底板（可选描边）——独立 Graphics，调用方不要复用宿主 Graphics */
export function paintRoundRect(
  node: Node,
  w: number,
  h: number,
  radius: number,
  fill: Color,
  stroke?: Color,
  strokeWidth = 3,
): Graphics {
  const g = node.addComponent(Graphics);
  g.fillColor = fill;
  g.roundRect(-w / 2, -h / 2, w, h, radius);
  g.fill();
  if (stroke) {
    g.lineWidth = strokeWidth;
    g.strokeColor = stroke;
    g.roundRect(-w / 2, -h / 2, w, h, radius);
    g.stroke();
  }
  return g;
}

/** 建一个居中文字节点 */
export function addLabel(
  parent: Node,
  text: string,
  opts: {
    size: number;
    color: Color;
    bold?: boolean;
    y?: number;
    width?: number;
    /** 定宽时的水平对齐，默认居中。左对齐用于「图标 + 标题」这类靠图标贴齐的排版 */
    align?: 'left' | 'center';
  },
): Label {
  const node = new Node('label');
  node.layer = parent.layer;
  const ui = node.addComponent(UITransform);
  if (opts.width) ui.setContentSize(opts.width, opts.size + 6);
  node.setPosition(new Vec3(0, opts.y ?? 0, 0));
  parent.addChild(node);

  const label = node.addComponent(Label);
  label.string = text;
  label.fontSize = opts.size;
  label.lineHeight = Math.round(opts.size * 1.2);
  label.isBold = opts.bold ?? false;
  label.color = opts.color;
  if (opts.width) {
    label.overflow = Label.Overflow.SHRINK;
    label.horizontalAlign =
      opts.align === 'left' ? Label.HorizontalAlign.LEFT : Label.HorizontalAlign.CENTER;
  }
  return label;
}

/** 建一个贴图节点；贴图缺失时调用 onMissing，未提供则静默留空 */
export function addSprite(
  parent: Node,
  path: string,
  size: number,
  y = 0,
  onMissing?: () => void,
): Node {
  const node = new Node('icon');
  node.layer = parent.layer;
  node.addComponent(UITransform).setContentSize(size, size);
  node.setPosition(new Vec3(0, y, 0));
  parent.addChild(node);

  const sprite = node.addComponent(Sprite);
  loadSpriteFrame(path, sf => {
    if (!sprite.isValid) return;
    if (sf) applySpriteFrame(sprite, sf);
    else onMissing?.();
  });
  return node;
}

export interface ItemCellInfo {
  readonly itemId: string;
  readonly name: string;
  readonly unlocked: boolean;
  readonly unclaimed: boolean;
}

/**
 * 物品格（Web .item）：未解锁显示锁、未领取显示钻石、已解锁显示贴图 + 名称。
 * onClaim / onDetail 分别对应 Web 版点击未领取领奖、点击已解锁看详情。
 */
export function buildItemCell(
  parent: Node,
  pos: Vec3,
  size: { w: number; h: number },
  info: ItemCellInfo,
  handlers: { onClaim?: () => void; onDetail?: () => void },
): Node {
  const cell = new Node(`cell_${info.itemId}`);
  cell.layer = parent.layer;
  cell.addComponent(UITransform).setContentSize(size.w, size.h);
  cell.setPosition(pos);
  parent.addChild(cell);

  if (!info.unlocked) {
    paintRoundRect(cell, size.w, size.h, 14, LOCKED_BG, LOCKED_BORDER, 2);
    addSprite(cell, LOCK_SPRITE, 32);
    return cell;
  }

  paintRoundRect(
    cell,
    size.w,
    size.h,
    14,
    CARD_BG,
    info.unclaimed ? UNCLAIMED_STROKE : undefined,
    4,
  );

  if (info.unclaimed) {
    // 未领取：钻石覆盖层取代物品图（与 Web .unclaimed-overlay 一致），并做呼吸高亮。
    // Pulse 挂在钻石子节点上而不是 cell：cell 上还有 TapZone，
    // 改 cell 的 UIOpacity 会连描边一起闪，也更容易和命中矩形纠缠。
    const diamond = addSprite(cell, DIAMOND_SPRITE, 30);
    diamond.addComponent(PulseEffect);
    const zone = cell.addComponent(TapZoneComponent);
    zone.onTap = () => handlers.onClaim?.();
    return cell;
  }

  const path = getItemSpritePath(info.itemId);
  if (path) addSprite(cell, path, size.h - 40, 10);
  addLabel(cell, info.name, {
    size: 16,
    color: UI_COLORS.textBrown,
    bold: true,
    y: -size.h / 2 + 16,
    width: size.w - 8,
  });

  if (handlers.onDetail) {
    const zone = cell.addComponent(TapZoneComponent);
    zone.onTap = () => handlers.onDetail?.();
  }
  return cell;
}
