import {
  assetManager,
  BlockInputEvents,
  Color,
  Component,
  Graphics,
  js,
  Label,
  Node,
  UITransform,
  Vec3,
  Widget,
} from 'cc';

import { MODAL_PREFIX } from './modal-chrome';
import { TapZoneComponent } from './tap-zone';
import { UI_COLORS } from './ui-factory';

/**
 * 分包页面调度：loadBundle 后在 Canvas 上叠一层全屏 overlay，
 * 页面组件类由分包脚本注册（ccclass 名），主包不静态 import 分包代码，
 * 保证分包脚本真正留在 subpackage 里按需加载。
 *
 * 不用 director.loadScene 切场景：GameManager 把整个 Canvas 设为常驻节点，
 * 切场景会把主界面一起带走并在回来时产生重影。
 */

const PAGE_W = 720;
const PAGE_H = 1280;

/** 页面背景奶油色 #F2E9CA（对齐 Web 版 body 背景） */
const PAGE_BG = new Color(242, 233, 202, 255);

function pageNodeName(bundleName: string): string {
  return `BundlePage_${bundleName}`;
}

/**
 * 给节点加一个立即生效的 Widget。
 *
 * 必须用 ALWAYS 而不是 ON_WINDOW_RESIZE：项目跑 FIXED_WIDTH（见 GameManager
 * setDesignResolutionSize），可视高度随机型大于设计高度 1280，而小游戏启动后
 * 不会再触发 window resize，ON_WINDOW_RESIZE 的节点会停在按 1280 算出的位置。
 *
 * 页面里的按钮走 TapZoneComponent（全局 input + UITransform 自算命中），
 * 渲染用的是 Widget 对齐后的变换、命中用的是 UITransform，两者一旦不同步，
 * 按钮就会"看得见、点不到"。所以这里建完立刻 updateAlignment() 同步一次。
 */
export function addAlignedWidget(node: Node, align: Partial<Widget>): Widget {
  const w = node.addComponent(Widget);
  Object.assign(w, align);
  w.alignMode = Widget.AlignMode.ALWAYS;
  w.updateAlignment();
  return w;
}

/**
 * 覆盖全屏、需要挡住下层主界面触摸的节点名前缀。
 * 分包页面之外，主场景内的模态弹窗（离线收益、订单翻倍等）同样要挡。
 */
const OVERLAY_PREFIXES = ['BundlePage_', MODAL_PREFIX] as const;

/**
 * 是否有分包页面或模态弹窗正开着。
 * 主界面的全局输入监听（棋盘/订单/导航等）不吃 BlockInputEvents，
 * 需要各自用这个判断挡掉覆盖层下方的误触。
 */
export function hasOpenBundlePage(host: Node): boolean {
  return host.children.some(
    c => c.isValid && OVERLAY_PREFIXES.some(p => c.name.startsWith(p)),
  );
}

/**
 * 打开分包页面：加载 bundle → 建全屏 overlay → 挂上分包里注册的页面组件。
 * 重复调用（页面已开）时直接忽略。
 */
export function openBundlePage(host: Node, bundleName: string, componentName: string): void {
  if (!host.isValid || host.getChildByName(pageNodeName(bundleName))) return;

  assetManager.loadBundle(bundleName, err => {
    if (err) {
      console.warn(`[bundle-pages] 加载分包 ${bundleName} 失败`, err);
      return;
    }
    if (!host.isValid || host.getChildByName(pageNodeName(bundleName))) return;

    const cls = js.getClassByName(componentName) as (new () => Component) | null;
    if (!cls) {
      console.warn(`[bundle-pages] 分包 ${bundleName} 中未注册组件 ${componentName}`);
      return;
    }

    const page = new Node(pageNodeName(bundleName));
    page.layer = host.layer;
    page.addComponent(UITransform).setContentSize(PAGE_W, PAGE_H);
    // 挡住下层棋盘/导航的触摸
    page.addComponent(BlockInputEvents);
    host.addChild(page);

    // 先把页面撑到真实可视尺寸，再挂页面组件——组件 onLoad 会读父节点尺寸建 UI
    addAlignedWidget(page, {
      isAlignTop: true, isAlignBottom: true, isAlignLeft: true, isAlignRight: true,
      top: 0, bottom: 0, left: 0, right: 0,
    });

    page.addComponent(cls);
  });
}

/** 关闭页面：销毁 overlay 根节点（页面组件在自己的返回按钮里调用） */
export function closeBundlePage(pageRoot: Node): void {
  if (pageRoot.isValid) pageRoot.destroy();
}

/**
 * 页面公共外壳：全屏底色 + 标题 + 左上角返回按钮。
 * 返回按钮回调默认销毁页面根节点。
 */
export function createPageChrome(root: Node, title: string, onBack?: () => void): void {
  const ui = root.getComponent(UITransform);
  const w = ui?.width ?? PAGE_W;
  const h = ui?.height ?? PAGE_H;

  const bg = root.addComponent(Graphics);
  bg.fillColor = PAGE_BG;
  bg.rect(-w / 2 - 40, -h / 2 - 200, w + 80, h + 400);
  bg.fill();

  // 标题（避开刘海区，与主场景 StatusBar 同高）
  const titleNode = new Node('pageTitle');
  titleNode.layer = root.layer;
  titleNode.addComponent(UITransform);
  titleNode.setPosition(new Vec3(0, 0, 0));
  root.addChild(titleNode);
  const titleLabel = titleNode.addComponent(Label);
  titleLabel.string = title;
  titleLabel.fontSize = 44;
  titleLabel.lineHeight = 52;
  titleLabel.isBold = true;
  titleLabel.color = UI_COLORS.textBrown;
  addAlignedWidget(titleNode, { isAlignTop: true, top: 180 });

  // 返回按钮
  const back = new Node('backButton');
  back.layer = root.layer;
  back.addComponent(UITransform).setContentSize(120, 64);
  root.addChild(back);
  const g = back.addComponent(Graphics);
  g.fillColor = UI_COLORS.pillBg;
  g.roundRect(-60, -32, 120, 64, 20);
  g.fill();
  g.lineWidth = 3;
  g.strokeColor = UI_COLORS.pillBorder;
  g.roundRect(-60, -32, 120, 64, 20);
  g.stroke();

  const backLabelNode = new Node('label');
  backLabelNode.layer = root.layer;
  backLabelNode.addComponent(UITransform);
  back.addChild(backLabelNode);
  const backLabel = backLabelNode.addComponent(Label);
  backLabel.string = '< 返回';
  backLabel.fontSize = 28;
  backLabel.lineHeight = 34;
  backLabel.isBold = true;
  backLabel.color = UI_COLORS.textBrown;

  addAlignedWidget(back, { isAlignTop: true, isAlignLeft: true, top: 172, left: 24 });

  const backZone = back.addComponent(TapZoneComponent);
  backZone.onTap = () => {
    if (onBack) onBack();
    else closeBundlePage(root);
  };
}

/** 页面内轻提示：顶部浮现文字，1.6s 后自动消失 */
export function showPageToast(root: Node, text: string): void {
  const old = root.getChildByName('pageToast');
  if (old) old.destroy();

  const toast = new Node('pageToast');
  toast.layer = root.layer;
  toast.addComponent(UITransform).setContentSize(400, 60);
  toast.setPosition(new Vec3(0, 360, 0));
  root.addChild(toast);

  const g = toast.addComponent(Graphics);
  g.fillColor = new Color(60, 42, 30, 230);
  g.roundRect(-200, -30, 400, 60, 18);
  g.fill();

  const labelNode = new Node('label');
  labelNode.layer = root.layer;
  labelNode.addComponent(UITransform);
  toast.addChild(labelNode);
  const label = labelNode.addComponent(Label);
  label.string = text;
  label.fontSize = 26;
  label.lineHeight = 32;
  label.color = new Color(255, 248, 238, 255);

  setTimeout(() => {
    if (toast.isValid) toast.destroy();
  }, 1600);
}
