import { BlockInputEvents, Color, Graphics, Node, UIOpacity, UITransform, Vec3, view } from 'cc';

import { makeNode } from './collection-effects';
import { PopInEffect } from './effect-pop-in';
import { addLabel, addSprite } from './collection-cells';
import { TapZoneComponent, popModalLayer, pushModalLayer } from './tap-zone';
import { UI_COLORS } from './ui-factory';

/**
 * 物品详情弹窗（对齐 Web 版 Collection.vue 的 .detail-overlay / .detail-modal）。
 *
 * Web 版点整块弹窗任意处关闭，这里同构：遮罩全屏 TapZone 直接关。
 */

/** 遮罩色 rgba(60,40,20,0.6)（Web .detail-overlay） */
const OVERLAY_BG = new Color(60, 40, 20, 153);

const DETAIL_NODE = 'collectionDetail';

export interface DetailInfo {
  /** 贴图路径，空字符串时退化为 emoji 展示 */
  readonly spritePath: string;
  readonly emoji: string;
  readonly name: string;
  readonly subtitle: string;
}

/**
 * 打开详情弹窗。同一时刻只保留一个，重复调用会先关掉旧的。
 * 挂在 pageRoot 上，页面关闭时随之销毁。
 */
export function showItemDetail(pageRoot: Node, info: DetailInfo): void {
  closeItemDetail(pageRoot);

  const vs = view.getVisibleSize();
  const overlay = new Node(DETAIL_NODE);
  overlay.layer = pageRoot.layer;
  // 铺满整屏并吃掉穿透点击，避免点弹窗时误触底下的格子
  overlay.addComponent(UITransform).setContentSize(vs.width, vs.height);
  pageRoot.addChild(overlay);
  overlay.addComponent(BlockInputEvents);

  const bg = overlay.addComponent(Graphics);
  bg.fillColor = OVERLAY_BG;
  bg.rect(-vs.width / 2, -vs.height / 2, vs.width, vs.height);
  bg.fill();

  const close = overlay.addComponent(TapZoneComponent);
  close.onTap = () => closeItemDetail(pageRoot);

  // 弹窗期间独占点击：否则下层返回键/Tab/格子的全局点击区照样会响应
  pushModalLayer(overlay);

  buildModal(overlay, info);
}

/** 关闭详情弹窗（没开则什么都不做） */
export function closeItemDetail(pageRoot: Node): void {
  const old = pageRoot.getChildByName(DETAIL_NODE);
  if (!old?.isValid) return;
  popModalLayer(old);
  old.destroy();
}

/** 弹窗主体：大图 + 名称 + 副标题，整体做一次 back-out 弹出 */
function buildModal(overlay: Node, info: DetailInfo): void {
  const modal = makeNode(overlay, 'modal', 360, new Vec3(0, 0, 0));
  modal.getComponent(UITransform)?.setContentSize(360, 420);
  modal.addComponent(PopInEffect);

  const card = makeNode(modal, 'card', 360, new Vec3(0, 0, 0));
  card.getComponent(UITransform)?.setContentSize(360, 420);
  const g = card.addComponent(Graphics);
  g.fillColor = new Color(255, 252, 245, 250);
  g.roundRect(-180, -210, 360, 420, 28);
  g.fill();
  g.lineWidth = 4;
  g.strokeColor = UI_COLORS.pillBorder;
  g.roundRect(-180, -210, 360, 420, 28);
  g.stroke();

  // 贴图缺失时退回 emoji：稀有物品有 spritePath 但目前没有对应美术资源，
  // 光判断路径非空会得到一个空白 Sprite，必须等加载结果回来才知道。
  const showEmoji = (): void => {
    if (!card.isValid) return;
    addLabel(card, info.emoji, { size: 120, color: UI_COLORS.textBrown, y: 50 });
  };
  if (info.spritePath) {
    const icon = addSprite(card, info.spritePath, 200, 50, () => {
      if (icon.isValid) icon.destroy();
      showEmoji();
    });
  } else {
    showEmoji();
  }

  addLabel(card, info.name, {
    size: 32,
    color: UI_COLORS.textBrown,
    bold: true,
    y: -90,
    width: 320,
  });
  addLabel(card, info.subtitle, {
    size: 22,
    color: new Color(184, 160, 128, 255),
    y: -134,
    width: 320,
  });

  const hint = addLabel(card, '点击任意处关闭', {
    size: 20,
    color: new Color(184, 160, 128, 255),
    y: -178,
    width: 320,
  });
  hint.node.addComponent(UIOpacity).opacity = 180;
}

/** 供外部构建副标题：品类名 · Lv.n */
export function levelSubtitle(level: number, categoryName: string): string {
  return level > 0 ? `${categoryName} · Lv.${level}` : categoryName;
}
