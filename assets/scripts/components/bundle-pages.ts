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

import { MODAL_PREFIX, createModalRoot, buildModalShell, type ModalShellOptions } from './modal-chrome';
import { TapZoneComponent } from './tap-zone';
import { UI_COLORS } from './ui-factory';
import { fontManager } from '../core/font-manager';
import { playSfx } from '../manager/AudioManager';

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

/* ═══ Toast 轻提示（公共组件，所有页面统一调用） ═══ */
const TOAST_MAX_W = 560;       // 最大宽度，避免撑满屏幕
const TOAST_PAD_X = 32;         // 左右内边距
const TOAST_PAD_Y = 14;         // 上下内边距
const TOAST_FONT = 24;          // 字号
const TOAST_LINE_H = 32;        // 行高
const TOAST_RADIUS = 18;        // 圆角
const TOAST_BG = new Color(60, 42, 30, 230); // 深棕半透明底
const TOAST_TEXT = new Color(255, 248, 238, 255);
const TOAST_BOTTOM_Y = -420;    // 距屏幕底部的位置（导航栏上方）
const TOAST_DURATION = 1600;    // 显示时长 ms

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
 * 把分包里的页面组件挂进指定容器（而非全屏 overlay），用于页内 Tab 切换。
 *
 * 与 openBundlePage 的区别：不建 overlay、不挡触摸、不加 BundlePage_ 前缀，
 * 因此宿主页面的顶部 Tab 条仍可点击。挂载前会清空容器原有子节点。
 *
 * @param onFail 加载或组件查找失败时回调（宿主页面自行提示）
 */
export function mountBundleSection(
  container: Node,
  bundleName: string,
  componentName: string,
  onFail?: () => void,
): void {
  if (!container.isValid) return;

  assetManager.loadBundle(bundleName, err => {
    if (!container.isValid) return;
    if (err) {
      console.warn(`[bundle-pages] 加载分包 ${bundleName} 失败`, err);
      onFail?.();
      return;
    }

    const cls = js.getClassByName(componentName) as (new () => Component) | null;
    if (!cls) {
      console.warn(`[bundle-pages] 分包 ${bundleName} 中未注册组件 ${componentName}`);
      onFail?.();
      return;
    }

    container.removeAllChildren();
    const section = new Node(`Section_${bundleName}`);
    section.layer = container.layer;
    const ui = container.getComponent(UITransform);
    section.addComponent(UITransform).setContentSize(ui?.width ?? 720, ui?.height ?? 900);
    container.addChild(section);
    section.addComponent(cls);
  });
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
  fontManager.applyFont(titleLabel);
  addAlignedWidget(titleNode, { isAlignTop: true, top: 180 });

  // 返回按钮 — 圆形图标按钮，奶油底+暖棕描边+柔和阴影，‹ 箭头
  const BACK_SIZE = 76;
  const back = new Node('backButton');
  back.layer = root.layer;
  back.addComponent(UITransform).setContentSize(BACK_SIZE, BACK_SIZE);
  root.addChild(back);
  const g = back.addComponent(Graphics);
  const R = BACK_SIZE / 2;
  // 底部阴影（向下偏移 3px）
  g.fillColor = new Color(92, 58, 30, 35);
  g.circle(0, -3, R);
  g.fill();
  // 主底色
  g.fillColor = UI_COLORS.pillBg;
  g.circle(0, 0, R);
  g.fill();
  // 顶部内高光（小圆偏上，营造立体感）
  g.fillColor = new Color(255, 255, 255, 60);
  g.circle(0, 8, R - 12);
  g.fill();
  // 描边
  g.lineWidth = 2.5;
  g.strokeColor = UI_COLORS.pillBorder;
  g.circle(0, 0, R);
  g.stroke();

  const backLabelNode = new Node('label');
  backLabelNode.layer = root.layer;
  backLabelNode.addComponent(UITransform);
  backLabelNode.setPosition(new Vec3(0, 6, 0));
  back.addChild(backLabelNode);
  const backLabel = backLabelNode.addComponent(Label);
  backLabel.string = '‹';
  backLabel.fontSize = 48;
  backLabel.lineHeight = 56;
  backLabel.isBold = true;
  backLabel.color = UI_COLORS.textBrown;
  fontManager.applyFont(backLabel);

  addAlignedWidget(back, { isAlignTop: true, isAlignLeft: true, top: 168, left: 24 });

  const backZone = back.addComponent(TapZoneComponent);
  backZone.onTap = () => {
    if (onBack) onBack();
    else closeBundlePage(root);
  };

  // 确保返回按钮和标题显示在最上层（避免被 Tab 栏等后添加的节点遮挡）
  back.setSiblingIndex(root.children.length - 1);
  titleNode.setSiblingIndex(root.children.length - 1);
}

/**
 * 页面内轻提示（公共组件）：底部浮现文字，1.6s 后自动消失。
 * 文字超长自动换行，背景尺寸随文字自适应，最大宽度 560 避免撑满屏幕。
 * 所有页面统一调用此函数，确保 toast 样式和位置一致。
 */
export function showPageToast(root: Node, text: string): void {
  const old = root.getChildByName('pageToast');
  if (old) old.destroy();

  // 估算文字尺寸（中文约等于字号，英文/数字约 0.6 字号，取 0.85 平均）
  const charW = TOAST_FONT * 0.85;
  const textAvailW = TOAST_MAX_W - TOAST_PAD_X * 2;
  const charsPerLine = Math.max(1, Math.floor(textAvailW / charW));
  const lines = Math.max(1, Math.ceil(text.length / charsPerLine));
  const textH = lines * TOAST_LINE_H;
  // 单行时宽度贴合文字，多行时用最大宽度
  const toastW = lines === 1
    ? Math.min(TOAST_MAX_W, text.length * charW + TOAST_PAD_X * 2)
    : TOAST_MAX_W;
  const toastH = textH + TOAST_PAD_Y * 2;

  const toast = new Node('pageToast');
  toast.layer = root.layer;
  toast.addComponent(UITransform).setContentSize(toastW, toastH);
  // 固定在底部导航栏上方，所有 toast 位置统一
  toast.setPosition(new Vec3(0, TOAST_BOTTOM_Y, 0));
  root.addChild(toast);

  // 背景（深棕半透明圆角）
  const g = toast.addComponent(Graphics);
  g.fillColor = TOAST_BG;
  g.roundRect(-toastW / 2, -toastH / 2, toastW, toastH, TOAST_RADIUS);
  g.fill();

  // 文字（居中、自动换行）
  const labelNode = new Node('label');
  labelNode.layer = root.layer;
  labelNode.addComponent(UITransform).setContentSize(textAvailW, textH);
  labelNode.setPosition(new Vec3(0, 0, 0));
  toast.addChild(labelNode);
  const label = labelNode.addComponent(Label);
  label.string = text;
  label.fontSize = TOAST_FONT;
  label.lineHeight = TOAST_LINE_H;
  label.color = TOAST_TEXT;
  label.isBold = false;
  label.enableWrapText = true;
  label.horizontalAlign = Label.HorizontalAlign.CENTER;
  label.verticalAlign = Label.VerticalAlign.CENTER;
  label.overflow = Label.Overflow.SHRINK;
  fontManager.applyFont(label);

  setTimeout(() => {
    if (toast.isValid) toast.destroy();
  }, TOAST_DURATION);
}

/**
 * 打开分包弹窗：加载 bundle → 建模态根节点 → 公共弹窗外壳 → 分包组件挂到 body。
 * 与 openBundlePage 的区别：不建全屏 overlay，用居中弹窗面板 + 遮罩 + 标题栏 + 关闭按钮。
 * 重复调用（同名弹窗已开）时直接忽略。
 */
export function openBundleModal(
  host: Node,
  bundleName: string,
  componentName: string,
  shellOpts: ModalShellOptions,
): void {
  if (host.getChildByName(`${MODAL_PREFIX}${bundleName}`)) return;

  const ret = assetManager.loadBundle(bundleName, err => {
    if (err) {
      console.warn(`[bundle-pages] 加载分包 ${bundleName} 失败`, err);
      return;
    }
    try {
      if (!host.isValid || host.getChildByName(`${MODAL_PREFIX}${bundleName}`)) return;

      const cls = js.getClassByName(componentName) as (new () => Component) | null;
      if (!cls) {
        console.warn(`[bundle-pages] 分包 ${bundleName} 中未注册组件 ${componentName}`);
        return;
      }

      const root = createModalRoot(host, bundleName);
      if (!root) return;

      const shell = buildModalShell(root, shellOpts);
      shell.body.addComponent(cls);
      playSfx('popup_open');
    } catch (e) {
      console.error(`[bundle-pages] 打开弹窗 ${bundleName} 失败:`, e);
    }
  }) as Promise<unknown> | void;
  if (ret && typeof ret.catch === 'function') {
    ret.catch(e => console.error(`[bundle-pages] loadBundle promise 失败 ${bundleName}:`, e));
  }
}
