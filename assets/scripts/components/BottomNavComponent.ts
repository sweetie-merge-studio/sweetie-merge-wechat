import { _decorator, Color, Component, Graphics, Label, Node, UITransform, Vec3 } from 'cc';

import { hasOpenBundlePage, openBundlePage, showPageToast } from './bundle-pages';
import { TapZoneComponent } from './tap-zone';
import { createSpriteNode, UI_COLORS } from './ui-factory';

const { ccclass } = _decorator;

const BAR_W = 720;
const BAR_H = 130;
const TAB_W = 120;
const TAB_H = 96;
/** 选中态底色 #FFE8C0 */
const TAB_ACTIVE_BG = new Color(255, 232, 192, 255);
/** 未开放文字 #A0784C */
const TAB_DIM_TEXT = new Color(160, 120, 76, 255);

/** page: 点击时打开的分包页面（对齐 Web 版 onNavigate：商店 tab 进盲盒视图） */
const TABS: ReadonlyArray<{ key: string; label: string; page?: { bundle: string; component: string } }> = [
  { key: 'daily', label: '每日' },
  { key: 'collection', label: '图鉴', page: { bundle: 'collection', component: 'CollectionPageComponent' } },
  { key: 'home', label: '首页' },
  { key: 'backpack', label: '背包' },
  { key: 'shop', label: '商店', page: { bundle: 'blindbox', component: 'BlindboxPageComponent' } },
];

/**
 * 底部导航（对齐 Web 版 BottomNav.vue 的五格结构）。
 * 图鉴/商店已接分包页面；每日/背包玩法未就绪，点击提示敬请期待。
 */
@ccclass('BottomNavComponent')
export class BottomNavComponent extends Component {
  protected onLoad(): void {
    const ui = this.node.getComponent(UITransform) ?? this.node.addComponent(UITransform);
    ui.setContentSize(BAR_W, BAR_H);

    // 通栏底
    const bg = this.node.addComponent(Graphics);
    bg.fillColor = UI_COLORS.pillBg;
    bg.roundRect(-BAR_W / 2, -BAR_H / 2, BAR_W, BAR_H, 24);
    bg.fill();
    bg.lineWidth = 3;
    bg.strokeColor = UI_COLORS.pillBorder;
    bg.roundRect(-BAR_W / 2, -BAR_H / 2, BAR_W, BAR_H, 24);
    bg.stroke();

    const step = BAR_W / TABS.length;
    for (let i = 0; i < TABS.length; i++) {
      const tab = TABS[i];
      const x = -BAR_W / 2 + step * (i + 0.5);
      const active = tab.key === 'home';

      const tabNode = new Node(`tab_${tab.key}`);
      tabNode.layer = this.node.layer;
      tabNode.addComponent(UITransform).setContentSize(TAB_W, TAB_H);
      tabNode.setPosition(new Vec3(x, 4, 0));
      this.node.addChild(tabNode);

      if (active) {
        const g = tabNode.addComponent(Graphics);
        g.fillColor = TAB_ACTIVE_BG;
        g.roundRect(-TAB_W / 2, -TAB_H / 2, TAB_W, TAB_H, 16);
        g.fill();
      }

      // 图标（Web 版 nav_*.png 原图）+ 下方文字
      createSpriteNode('icon', tabNode, tabNode.children.length, 52, 52,
        `sprites/ui/nav/nav_${tab.key}`, new Vec3(0, 16, 0));

      const labelNode = new Node('label');
      labelNode.layer = this.node.layer;
      labelNode.addComponent(UITransform);
      labelNode.setPosition(new Vec3(0, -30, 0));
      tabNode.addChild(labelNode);
      const label = labelNode.addComponent(Label);
      label.string = tab.label;
      label.fontSize = active ? 24 : 22;
      label.lineHeight = 28;
      label.isBold = active;
      label.color = active || tab.page ? UI_COLORS.textBrown : TAB_DIM_TEXT;

      // 点击走全局输入版点击区（节点触摸事件在本项目收不到，见 tap-zone.ts）
      const page = tab.page;
      if (tab.key !== 'home') {
        const zone = tabNode.addComponent(TapZoneComponent);
        zone.onTap = () => {
          const canvas = this.node.parent;
          if (!canvas || hasOpenBundlePage(canvas)) return;
          if (page) openBundlePage(canvas, page.bundle, page.component);
          else showPageToast(canvas, `「${tab.label}」玩法开发中，敬请期待`);
        };
      }
    }
  }
}
