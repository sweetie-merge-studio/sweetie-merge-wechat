import { Color, Graphics, Label, Node, UITransform, Vec3 } from 'cc';

import { TapZoneComponent } from './tap-zone';
import { UI_COLORS } from './ui-factory';
import { fontManager } from '../core/font-manager';

/**
 * 通用分段控件（对齐 Web 版 .inline-tabs 的样式）。
 *
 * 用于商店页「商店 / 盲盒」这类页内 Tab；选中态靠重建体现，
 * 调用方在 onSelect 里重建 Tab 条与内容区。
 */

export interface SegmentDef<T extends string> {
  readonly id: T;
  readonly label: string;
}

/** 轨道底色 #E4C292（Web .tab-track） */
const TRACK_BG = new Color(228, 194, 146, 255);
/** 选中项底色（Web .tab-btn.active） */
const ACTIVE_BG = new Color(255, 252, 245, 255);
/** 未选中文字 #8B6A4A */
const IDLE_TEXT = new Color(139, 106, 74, 255);

const TRACK_H = 68;
const PAD = 6;

/** 建分段控件，返回轨道节点。点击当前已选中的段不触发回调。 */
export function buildSegmentedTabs<T extends string>(
  parent: Node,
  width: number,
  segments: readonly SegmentDef<T>[],
  active: T,
  onSelect: (id: T) => void,
): Node {
  // 轨道带阴影+边框
  const track = new Node('segTrack');
  track.layer = parent.layer;
  track.addComponent(UITransform).setContentSize(width, TRACK_H);
  parent.addChild(track);
  const tg = track.addComponent(Graphics);
  // 底部阴影
  tg.fillColor = new Color(0, 0, 0, 30);
  tg.roundRect(-width / 2, -TRACK_H / 2 - 2, width, TRACK_H, 16);
  tg.fill();
  // 主底色
  tg.fillColor = TRACK_BG;
  tg.roundRect(-width / 2, -TRACK_H / 2, width, TRACK_H, 16);
  tg.fill();
  // 边框
  tg.lineWidth = 1.5;
  tg.strokeColor = new Color(180, 140, 90, 180);
  tg.roundRect(-width / 2, -TRACK_H / 2, width, TRACK_H, 16);
  tg.stroke();

  const btnW = (width - PAD * 2) / segments.length;
  const startX = -width / 2 + PAD + btnW / 2;

  segments.forEach((seg, i) => {
    const isActive = seg.id === active;
    const pos = new Vec3(startX + i * btnW, 0, 0);

    // 选中项贴白底（带阴影）；未选中的只放一个透明命中区
    const btn = isActive
      ? (() => {
          const n = new Node(`seg_${seg.id}`);
          n.layer = track.layer;
          n.addComponent(UITransform).setContentSize(btnW, TRACK_H - PAD * 2);
          n.setPosition(pos);
          track.addChild(n);
          const bg = n.addComponent(Graphics);
          // 选中项阴影
          bg.fillColor = new Color(0, 0, 0, 25);
          bg.roundRect(-btnW / 2, -(TRACK_H - PAD * 2) / 2 - 1, btnW, TRACK_H - PAD * 2, 12);
          bg.fill();
          // 选中项白底
          bg.fillColor = ACTIVE_BG;
          bg.roundRect(-btnW / 2, -(TRACK_H - PAD * 2) / 2, btnW, TRACK_H - PAD * 2, 12);
          bg.fill();
          return n;
        })()
      : (() => {
          const n = new Node(`seg_${seg.id}`);
          n.layer = track.layer;
          n.addComponent(UITransform).setContentSize(btnW, TRACK_H - PAD * 2);
          n.setPosition(pos);
          track.addChild(n);
          return n;
        })();

    const labelNode = new Node('label');
    labelNode.layer = btn.layer;
    labelNode.addComponent(UITransform);
    btn.addChild(labelNode);
    const label = labelNode.addComponent(Label);
    label.string = seg.label;
    label.fontSize = 24;
    label.lineHeight = 28;
    label.isBold = isActive;
    label.color = isActive ? UI_COLORS.textBrown : IDLE_TEXT;
    fontManager.applyFont(label);

    const zone = btn.addComponent(TapZoneComponent);
    zone.onTap = () => {
      if (!isActive) onSelect(seg.id);
    };
  });

  return track;
}
