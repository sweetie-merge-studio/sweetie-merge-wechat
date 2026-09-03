import { _decorator, Color, Component, Graphics, Label, Node, UITransform, Vec3 } from 'cc';

import { GameManager } from '../manager/GameManager';
import { openBundlePage, openBundleModal, showPageToast } from './bundle-pages';
import type { ModalShellOptions } from './modal-chrome';
import { playSfx } from '../manager/AudioManager';
import { TapZoneComponent } from './tap-zone';
import { createSpriteNode, UI_COLORS } from './ui-factory';
import { fontManager } from '../core/font-manager';

const { ccclass } = _decorator;

/* ═══ 尺寸（对齐 Web 版 BottomNav.vue，按 720p 设计分辨率缩放） ═══ */
const BAR_W = 720;
const BAR_H = 130;
const TAB_W = 130;
const ICON_SIZE = 88;
const LABEL_FONT = 22;
const EN_FONT = 13;
/** 选中态凸起卡片 */
const ACTIVE_CARD_W = 124;
const ACTIVE_CARD_H = 168;
const ACTIVE_CARD_RADIUS = 22;
/** 图标嵌入卡片顶部的距离 */
const ICON_EMBED = 12;
/** 图标从通栏顶边向上偏移的距离（选中与未选中一致） */
const ICON_OFFSET_TOP = 60;

/* ═══ 颜色（取自 Web 版 CSS） ═══ */
/** 通栏背景（暖棕黄，对齐 Web #EDCFA7） */
const BAR_BG = new Color(237, 207, 167, 255);
/** 选中态卡片渐变：顶部色 #FFF3DC */
const CARD_GRAD_TOP = new Color(255, 243, 220, 255);
/** 选中态卡片渐变：底部色 #F5DDB4 */
const CARD_GRAD_BOTTOM = new Color(245, 221, 180, 255);
/** 选中态卡片描边 #C4A06A */
const CARD_BORDER = new Color(196, 160, 106, 255);
/** 选中态卡片向上投影 rgba(160,120,40,0.2) */
const CARD_SHADOW = new Color(160, 120, 40, 51);

interface TabPage {
  bundle: string;
  component: string;
  /** 弹窗选项：有则以弹窗形式打开，无则全屏页 */
  modal?: ModalShellOptions;
}

/** page: 点击时打开的分包页面；enLabel 对齐 Web 端双语标签 */
const TABS: ReadonlyArray<{ key: string; label: string; enLabel: string; page?: TabPage }> = [
  {
    key: 'daily', label: '每日', enLabel: 'Daily',
    page: { bundle: 'daily', component: 'DailyPageComponent', modal: { width: 660, height: 1060, title: '每日小任务', iconPath: 'sprites/ui/nav/nav_daily' } },
  },
  {
    key: 'collection', label: '图鉴', enLabel: 'Journal',
    page: { bundle: 'collection', component: 'CollectionPageComponent', modal: { width: 660, height: 1000, title: '图鉴' } },
  },
  { key: 'home', label: '首页', enLabel: 'Home' },
  {
    key: 'backpack', label: '背包', enLabel: 'Backpack',
    page: { bundle: 'backpack', component: 'BackpackPageComponent', modal: { width: 660, height: 820, title: '我的小背包', iconPath: 'sprites/ui/nav/nav_backpack' } },
  },
  {
    key: 'shop', label: '商店', enLabel: 'Shop',
    page: { bundle: 'store', component: 'StorePageComponent', modal: { width: 660, height: 1000, title: '商店' } },
  },
];

/**
 * 底部导航（对齐 Web 版 BottomNav.vue）。
 *
 * 布局要点：
 * - 通栏暖米色，顶部圆角，贴屏幕底部
 * - 图标贴通栏顶边向上凸出，不在 tab 内垂直居中
 * - 选中态：浅色圆角卡片从通栏顶部凸出，图标坐在卡片上方（微嵌入）
 * - 未选中态：无卡片，图标直接贴通栏顶边
 * - 文字（中文+英文）在通栏内，图标下方
 * - 图标不降透明度，选中态靠卡片+放大+文字加粗区分
 */
@ccclass('BottomNavComponent')
export class BottomNavComponent extends Component {
  protected onLoad(): void {
    const ui = this.node.getComponent(UITransform) ?? this.node.addComponent(UITransform);
    ui.setContentSize(BAR_W, BAR_H);

    // 通栏顶边的 y 坐标（节点中心为原点，y 正方向向上）
    const barTopY = BAR_H / 2;

    // ── 通栏背景：顶部圆角、底部直角 ──
    const bg = this.node.addComponent(Graphics);
    const r = 28;
    bg.fillColor = BAR_BG;
    bg.moveTo(-BAR_W / 2, -BAR_H / 2);
    bg.lineTo(BAR_W / 2, -BAR_H / 2);
    bg.lineTo(BAR_W / 2, barTopY - r);
    bg.quadraticCurveTo(BAR_W / 2, barTopY, BAR_W / 2 - r, barTopY);
    bg.lineTo(-BAR_W / 2 + r, barTopY);
    bg.quadraticCurveTo(-BAR_W / 2, barTopY, -BAR_W / 2, barTopY - r);
    bg.lineTo(-BAR_W / 2, -BAR_H / 2);
    bg.fill();

    const step = BAR_W / TABS.length;
    for (let i = 0; i < TABS.length; i++) {
      const tab = TABS[i];
      const x = -BAR_W / 2 + step * (i + 0.5);
      const active = tab.key === 'home';

      const tabNode = new Node(`tab_${tab.key}`);
      tabNode.layer = this.node.layer;
      tabNode.addComponent(UITransform).setContentSize(TAB_W, BAR_H);
      tabNode.setPosition(new Vec3(x, 0, 0));
      this.node.addChild(tabNode);

      // 选中态：标签页风格（顶部圆角、底部直角与通栏融合、顶部+左右描边）
      if (active) {
        const iconTopY = barTopY + ICON_OFFSET_TOP;
        const cardTopY = iconTopY + ICON_EMBED;
        const cardBottomY = cardTopY - ACTIVE_CARD_H;
        const cr = ACTIVE_CARD_RADIUS;
        const cw = ACTIVE_CARD_W;

        // 卡片填充（#FFF3DC，不透明）
        const g = tabNode.addComponent(Graphics);
        g.fillColor = new Color(255, 243, 220, 255);
        // 顶部圆角、底部直角
        g.moveTo(-cw / 2, cardBottomY);
        g.lineTo(cw / 2, cardBottomY);
        g.lineTo(cw / 2, cardTopY - cr);
        g.quadraticCurveTo(cw / 2, cardTopY, cw / 2 - cr, cardTopY);
        g.lineTo(-cw / 2 + cr, cardTopY);
        g.quadraticCurveTo(-cw / 2, cardTopY, -cw / 2, cardTopY - cr);
        g.lineTo(-cw / 2, cardBottomY);
        g.fill();

        // 描边：仅顶部 + 左右（#C4A06A，不透明，底部不画与通栏融合）
        g.lineWidth = 3;
        g.strokeColor = new Color(196, 160, 106, 255);
        g.moveTo(-cw / 2, cardBottomY);
        g.lineTo(-cw / 2, cardTopY - cr);
        g.quadraticCurveTo(-cw / 2, cardTopY, -cw / 2 + cr, cardTopY);
        g.lineTo(cw / 2 - cr, cardTopY);
        g.quadraticCurveTo(cw / 2, cardTopY, cw / 2, cardTopY - cr);
        g.lineTo(cw / 2, cardBottomY);
        g.stroke();
      }

      // 图标：选中与未选中大小、位置完全一致
      const iconTopY = barTopY + ICON_OFFSET_TOP;
      const iconCenterY = iconTopY - ICON_SIZE / 2;
      createSpriteNode('icon', tabNode, tabNode.children.length, ICON_SIZE, ICON_SIZE,
        `sprites/ui/nav/nav_${tab.key}`, new Vec3(0, iconCenterY, 0));

      // 中文主标签（卡片内/通栏内，往上移）
      const labelNode = new Node('label');
      labelNode.layer = tabNode.layer;
      labelNode.addComponent(UITransform);
      labelNode.setPosition(new Vec3(0, 11, 0));
      tabNode.addChild(labelNode);
      const label = labelNode.addComponent(Label);
      label.string = tab.label;
      label.fontSize = LABEL_FONT;
      label.lineHeight = 26;
      label.isBold = active;
      label.color = active ? UI_COLORS.titleBrown : UI_COLORS.subTextBrown;

      // 英文副标题
      const enNode = new Node('enLabel');
      enNode.layer = tabNode.layer;
      enNode.addComponent(UITransform);
      enNode.setPosition(new Vec3(0, -13, 0));
      tabNode.addChild(enNode);
      const enLabel = enNode.addComponent(Label);
      enLabel.string = tab.enLabel;
      enLabel.fontSize = EN_FONT;
      enLabel.lineHeight = 16;
      enLabel.isBold = false;
      enLabel.color = active ? UI_COLORS.subTextBrown : new Color(155, 123, 90, 160);

      // 点击走全局输入版点击区
      const tabKey = tab.key;
      const staticPage = tab.page;
      if (tabKey !== 'home') {
        // 独立命中区：覆盖凸出的图标（顶端 y=125）+ 双行文字（底部 y≈-21）。
        // 中心上移到 y=50、高 220 → 范围 y∈[-60,160]，图标顶端留 35px 余量，
        // 避免 TapZoneComponent 在 touchEnd 二次命中检测时因手指微移而漏触发。
        // 宽度取 step(144) 让相邻 tab 命中区无缝衔接，消除间隙死区。
        const hitArea = new Node('hitArea');
        hitArea.layer = tabNode.layer;
        hitArea.addComponent(UITransform).setContentSize(step, 220);
        hitArea.setPosition(new Vec3(0, 50, 0));
        tabNode.addChild(hitArea);
        const zone = hitArea.addComponent(TapZoneComponent);
        zone.onTap = () => {
          playSfx('click');
          const canvas = this.node.parent;
          if (!canvas) return;
          // 先关闭已有的弹窗/分包页面，实现 tab 间切换（不必手动关一个再开另一个）
          for (const child of canvas.children) {
            if (child.isValid && (child.name.startsWith('BundlePage_') || child.name.startsWith('Modal_'))) {
              child.destroy();
            }
          }
          if (staticPage) {
            if (staticPage.modal) {
              openBundleModal(canvas, staticPage.bundle, staticPage.component, staticPage.modal);
            } else {
              openBundlePage(canvas, staticPage.bundle, staticPage.component);
            }
          } else {
            showPageToast(canvas, `「${tab.label}」还在准备中，敬请期待呀`);
          }
        };
      }
    }

    fontManager.applyFontToTree(this.node);
  }
}
