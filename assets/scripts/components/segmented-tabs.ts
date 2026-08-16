import { Color, Node, UITransform, Vec3 } from 'cc';

import { addLabel, addSprite, paintRoundRect } from './collection-cells';
import { TapZoneComponent } from './tap-zone';
import { UI_COLORS } from './ui-factory';

/**
 * 通用分段控件（对齐 Web 版 .inline-tabs 的样式）。
 *
 * 与 collection-tabs.ts 的区别：那份把 tab 类型写死成 CollectionTab、
 * 且直接引用 COLLECTION_TABS 常量，只能给图鉴页用。这份接受任意 id，
 * 供商店页「商店 / 盲盒」等场景复用。
 */

export interface SegmentDef<T extends string> {
  readonly id: T;
  readonly label: string;
  /** 可选图标；不传则文字居中 */
  readonly icon?: string;
}

/** 轨道底色 #E4C292（Web .tab-track） */
const TRACK_BG = new Color(228, 194, 146, 255);
/** 选中项底色（Web .tab-btn.active） */
const ACTIVE_BG = new Color(255, 252, 245, 255);
/** 未选中文字 #8B6A4A */
const IDLE_TEXT = new Color(139, 106, 74, 255);

const TRACK_H = 68;
const PAD = 6;

/**
 * 建分段控件。返回轨道节点；切换由 onSelect 回调驱动（调用方负责重建内容区）。
 * 点击当前已选中的段不会触发回调。
 */
export function buildSegmentedTabs<T extends string>(
  parent: Node,
  width: number,
  segments: readonly SegmentDef<T>[],
  active: T,
  onSelect: (id: T) => void,
): Node {
  const track = new Node('segTrack');
  track.layer = parent.layer;
  track.addComponent(UITransform).setContentSize(width, TRACK_H);
  parent.addChild(track);
  paintRoundRect(track, width, TRACK_H, 16, TRACK_BG);

  const btnW = (width - PAD * 2) / segments.length;
  const startX = -width / 2 + PAD + btnW / 2;

  segments.forEach((seg, i) => {
    const isActive = seg.id === active;
    const btn = new Node(`seg_${seg.id}`);
    btn.layer = track.layer;
    btn.addComponent(UITransform).setContentSize(btnW, TRACK_H - PAD * 2);
    btn.setPosition(new Vec3(startX + i * btnW, 0, 0));
    track.addChild(btn);

    if (isActive) paintRoundRect(btn, btnW, TRACK_H - PAD * 2, 12, ACTIVE_BG);

    // 有图标时图标靠左、文字右移让位；无图标时文字居中占满
    if (seg.icon) {
      addSprite(btn, seg.icon, 30, 0).setPosition(new Vec3(-btnW / 2 + 26, 0, 0));
    }
    addLabel(btn, seg.label, {
      size: 24,
      color: isActive ? UI_COLORS.textBrown : IDLE_TEXT,
      bold: isActive,
      width: seg.icon ? btnW - 52 : btnW - 16,
    }).node.setPosition(new Vec3(seg.icon ? 10 : 0, 0, 0));

    const zone = btn.addComponent(TapZoneComponent);
    zone.onTap = () => {
      if (!isActive) onSelect(seg.id);
    };
  });

  return track;
}
