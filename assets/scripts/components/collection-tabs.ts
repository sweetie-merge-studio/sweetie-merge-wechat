import { Color, Node, UITransform, Vec3 } from 'cc';

import { addLabel, addSprite, paintRoundRect } from './collection-cells';
import { TapZoneComponent } from './tap-zone';
import { UI_COLORS } from './ui-factory';

/**
 * 图鉴页顶部 Tab 条（对齐 Web 版 Collection.vue 的 TabBar）。
 *
 * Web 版是 物品 / 经济 两段式分段控件：整条浅褐轨道，选中项贴白底。
 */

export type CollectionTab = 'items' | 'currency';

export interface TabDef {
  readonly id: CollectionTab;
  readonly label: string;
  readonly icon: string;
}

export const COLLECTION_TABS: readonly TabDef[] = [
  { id: 'items', label: '物品', icon: 'sprites/ui/nav/nav_collection' },
  { id: 'currency', label: '经济', icon: 'sprites/currency/coin_single' },
];

/** 轨道底色 #E4C292（Web .tab-track） */
const TRACK_BG = new Color(228, 194, 146, 255);
/** 选中项底色（Web .tab-btn.active） */
const ACTIVE_BG = new Color(255, 252, 245, 255);

const TRACK_H = 68;
const PAD = 6;

/**
 * 建 Tab 条。返回轨道节点，切换由 onSelect 回调驱动（调用方负责重建内容区）。
 */
export function buildTabBar(
  parent: Node,
  width: number,
  active: CollectionTab,
  onSelect: (tab: CollectionTab) => void,
): Node {
  const track = new Node('tabTrack');
  track.layer = parent.layer;
  track.addComponent(UITransform).setContentSize(width, TRACK_H);
  parent.addChild(track);
  paintRoundRect(track, width, TRACK_H, 16, TRACK_BG);

  const btnW = (width - PAD * 2) / COLLECTION_TABS.length;
  const startX = -width / 2 + PAD + btnW / 2;

  COLLECTION_TABS.forEach((tab, i) => {
    const btn = new Node(`tab_${tab.id}`);
    btn.layer = track.layer;
    btn.addComponent(UITransform).setContentSize(btnW, TRACK_H - PAD * 2);
    btn.setPosition(new Vec3(startX + i * btnW, 0, 0));
    track.addChild(btn);

    if (tab.id === active) {
      paintRoundRect(btn, btnW, TRACK_H - PAD * 2, 12, ACTIVE_BG);
    }

    // 图标在左、文字居中占满剩余宽度（节点内不做 flex 布局，靠 x 偏移错开）
    addSprite(btn, tab.icon, 30, 0).setPosition(new Vec3(-btnW / 2 + 26, 0, 0));
    addLabel(btn, tab.label, {
      size: 24,
      color: tab.id === active ? UI_COLORS.textBrown : new Color(139, 106, 74, 255),
      bold: tab.id === active,
      width: btnW - 52,
    }).node.setPosition(new Vec3(10, 0, 0));

    const zone = btn.addComponent(TapZoneComponent);
    zone.onTap = () => {
      if (tab.id !== active) onSelect(tab.id);
    };
  });

  return track;
}
