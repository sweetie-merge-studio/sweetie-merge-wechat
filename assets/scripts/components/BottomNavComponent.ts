import { _decorator, Color, Component, Graphics, Label, Node, UIOpacity, UITransform, Vec3 } from 'cc';

import { hasOpenBundlePage, openBundlePage, showPageToast } from './bundle-pages';
import { TapZoneComponent } from './tap-zone';
import { createSpriteNode, UI_COLORS } from './ui-factory';

const { ccclass } = _decorator;

const BAR_W = 720;
const BAR_H = 142;
const TAB_W = 120;
/** 三行内容（图标 48 + 中文 26 + 英文 18）+ 上下留白 */
const TAB_H = 108;
/** 选中态底色 #FFE8C0 */
const TAB_ACTIVE_BG = new Color(255, 232, 192, 255);
/** 选中胶囊描边 #E8B87A（比通栏描边深一档，压住底色） */
const TAB_ACTIVE_BORDER = new Color(232, 184, 122, 255);
/** 未开放文字 #A0784C */
const TAB_DIM_TEXT = new Color(160, 120, 76, 255);
/** 通栏投影（半透明暖棕，垫在栏底下方模拟悬浮） */
const BAR_SHADOW = new Color(111, 74, 57, 38);
/** 通栏顶部高光 #FFFDF8 */
const BAR_HILIGHT = new Color(255, 253, 248, 255);
/** 选中胶囊投影 */
const TAB_SHADOW = new Color(180, 130, 80, 46);
/** 未开放项整体降透明度，和可点项拉开层次 */
const DIM_OPACITY = 150;

/** 取（或补挂）节点的 UIOpacity——整棵子树一起变淡 */
function opacityOf(node: Node): UIOpacity {
  return node.getComponent(UIOpacity) ?? node.addComponent(UIOpacity);
}

/** page: 点击时打开的分包页面（对齐 Web 版 onNavigate：商店 tab 进盲盒视图） */
const TABS: ReadonlyArray<{
  key: string;
  label: string;
  en: string;
  page?: { bundle: string; component: string };
}> = [
  { key: 'daily', label: '每日', en: 'Daily' },
  { key: 'collection', label: '图鉴', en: 'Journal', page: { bundle: 'collection', component: 'CollectionPageComponent' } },
  { key: 'home', label: '首页', en: 'Home' },
  { key: 'backpack', label: '背包', en: 'Backpack' },
  { key: 'shop', label: '商店', en: 'Shop', page: { bundle: 'blindbox', component: 'BlindboxPageComponent' } },
];

/**
 * 底部导航（对齐 Web 版 BottomNav.vue 的五格结构）。
 * 图鉴/商店已接分包页面；每日/背包玩法未就绪，点击提示敬请期待。
 */
@ccclass('BottomNavComponent')
export class BottomNavComponent extends Component {
  /**
   * 新建一个与通栏同尺寸的子节点并挂上自己的 Graphics。
   * 宿主节点的 Graphics 已被通栏底占用，投影/高光必须各自独立（见 RUNBOOK 三·六）。
   */
  private _addLayer(name: string): Graphics {
    const node = new Node(name);
    node.layer = this.node.layer;
    node.addComponent(UITransform).setContentSize(BAR_W, BAR_H);
    this.node.addChild(node);
    return node.addComponent(Graphics);
  }

  protected onLoad(): void {
    const ui = this.node.getComponent(UITransform) ?? this.node.addComponent(UITransform);
    ui.setContentSize(BAR_W, BAR_H);

    // 三层各自独立成子节点，按添加顺序自下而上叠：投影 → 通栏底 → 高光。
    // 子节点必然渲染在宿主 Graphics 之上，所以通栏底也走子节点，层序才可控。
    const shadow = this._addLayer('barShadow');
    shadow.fillColor = BAR_SHADOW;
    shadow.roundRect(-BAR_W / 2, -BAR_H / 2 - 6, BAR_W, BAR_H, 26);
    shadow.fill();

    // 通栏底
    const bg = this._addLayer('barBg');
    bg.fillColor = UI_COLORS.pillBg;
    bg.roundRect(-BAR_W / 2, -BAR_H / 2, BAR_W, BAR_H, 24);
    bg.fill();
    bg.lineWidth = 3;
    bg.strokeColor = UI_COLORS.pillBorder;
    bg.roundRect(-BAR_W / 2, -BAR_H / 2, BAR_W, BAR_H, 24);
    bg.stroke();

    // 顶沿高光：一条贴着上边缘的浅色细线，让栏体像有厚度而不是一块平色
    const hilite = this._addLayer('barHilite');
    hilite.lineWidth = 2;
    hilite.strokeColor = BAR_HILIGHT;
    hilite.moveTo(-BAR_W / 2 + 26, BAR_H / 2 - 2);
    hilite.lineTo(BAR_W / 2 - 26, BAR_H / 2 - 2);
    hilite.stroke();

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
        // 选中态：投影 + 描边胶囊，整体上抬 2pt 做「凸起」观感
        tabNode.setPosition(new Vec3(x, 6, 0));

        const tabShadow = tabNode.addComponent(Graphics);
        tabShadow.fillColor = TAB_SHADOW;
        tabShadow.roundRect(-TAB_W / 2, -TAB_H / 2 - 4, TAB_W, TAB_H, 18);
        tabShadow.fill();

        const pill = new Node('activePill');
        pill.layer = tabNode.layer;
        pill.addComponent(UITransform).setContentSize(TAB_W, TAB_H);
        tabNode.addChild(pill);
        const g = pill.addComponent(Graphics);
        g.fillColor = TAB_ACTIVE_BG;
        g.roundRect(-TAB_W / 2, -TAB_H / 2, TAB_W, TAB_H, 18);
        g.fill();
        g.lineWidth = 2;
        g.strokeColor = TAB_ACTIVE_BORDER;
        g.roundRect(-TAB_W / 2, -TAB_H / 2, TAB_W, TAB_H, 18);
        g.stroke();
      } else if (!tab.page) {
        // 未开放玩法整体降透明度（图标同步变淡，仅靠文字色区分不够明显）
        tabNode.setPosition(new Vec3(x, 2, 0));
        opacityOf(tabNode).opacity = DIM_OPACITY;
      }

      // 图标 + 中文 + 英文小字三行，纵向让位后整体上移
      createSpriteNode('icon', tabNode, tabNode.children.length, 48, 48,
        `sprites/ui/nav/nav_${tab.key}`, new Vec3(0, 22, 0));

      const textColor = active || tab.page ? UI_COLORS.textBrown : TAB_DIM_TEXT;

      const labelNode = new Node('label');
      labelNode.layer = this.node.layer;
      labelNode.addComponent(UITransform);
      labelNode.setPosition(new Vec3(0, -16, 0));
      tabNode.addChild(labelNode);
      const label = labelNode.addComponent(Label);
      label.string = tab.label;
      label.fontSize = active ? 23 : 21;
      label.lineHeight = 26;
      label.isBold = active;
      label.color = textColor;

      // 英文副标（设计稿：中文下方一行小字）
      const enNode = new Node('labelEn');
      enNode.layer = this.node.layer;
      enNode.addComponent(UITransform);
      enNode.setPosition(new Vec3(0, -38, 0));
      tabNode.addChild(enNode);
      const enLabel = enNode.addComponent(Label);
      enLabel.string = tab.en;
      enLabel.fontSize = 15;
      enLabel.lineHeight = 18;
      enLabel.isBold = active;
      enLabel.color = textColor;

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
