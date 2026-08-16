import { _decorator, BlockInputEvents, Color, Component, Graphics, Label, Node, UITransform, Vec3, Widget } from 'cc';

import { GameManager } from '../manager/GameManager';
import { TapZoneComponent } from './tap-zone';
import { buildModalLabel } from './modal-chrome';
import type { TutorialStepId } from '../core/tutorial';

const { ccclass } = _decorator;

/**
 * 引导层节点名不带 Modal_ 前缀：模态弹窗要挡住下层棋盘的触摸，
 * 而引导层恰恰相反——玩家必须能点到棋盘才能完成步骤。
 */
const OVERLAY_NAME = 'TutorialOverlay';

/** 半透明底色，压暗非高亮区域但仍看得见棋盘 */
const DIM = new Color(24, 16, 10, 140);

const TIP_W = 600;
const TIP_H = 108;
/** 提示条距屏幕底部的距离（避开底部导航） */
const TIP_BOTTOM = 210;

const SKIP_W = 116;
const SKIP_H = 48;

/**
 * 新手引导层（对齐 Web 版 TutorialOverlay.vue）。
 *
 * 只做两件事：显示当前步骤文案 + 提供跳过按钮。
 * 步骤推进由 GameManager 在玩家真正做出对应动作时触发，
 * 本层不拦截触摸——否则玩家点不到棋盘，引导会卡死。
 */
@ccclass('TutorialOverlay')
export class TutorialOverlay extends Component {
  private _tipLabel: Label | null = null;
  /** 自动推进步骤的定时器，与其对应的步骤 id（防重复排程） */
  private _autoTimer: ReturnType<typeof setTimeout> | null = null;
  private _autoStepId: TutorialStepId | null = null;
  private readonly _onChanged = (): void => this._refresh();

  /**
   * 引导未结束时挂出引导层。
   * @returns 是否真的挂了
   */
  static showIfActive(canvas: Node): boolean {
    const gm = GameManager.instance;
    if (!gm.tutorialActive) return false;
    if (canvas.getChildByName(OVERLAY_NAME)) return false;

    const root = new Node(OVERLAY_NAME);
    root.layer = canvas.layer;
    const canvasUi = canvas.getComponent(UITransform);
    const ui = root.addComponent(UITransform);
    if (canvasUi) ui.setContentSize(canvasUi.width, canvasUi.height);
    canvas.addChild(root);

    const widget = root.addComponent(Widget);
    widget.isAlignTop = widget.isAlignBottom = true;
    widget.isAlignLeft = widget.isAlignRight = true;
    widget.top = widget.bottom = widget.left = widget.right = 0;
    widget.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;

    root.addComponent(TutorialOverlay);
    return true;
  }

  protected onLoad(): void {
    GameManager.instance.events.on('tutorial:changed', this._onChanged);
    this._build();
    this._refresh();
  }

  protected onDestroy(): void {
    this._clearAutoTimer();
    GameManager.instance.events.off('tutorial:changed', this._onChanged);
  }

  private _build(): void {
    const ui = this.node.getComponent(UITransform);
    const h = ui?.height ?? 1280;

    // 提示条：压暗背景衬托文字，但不铺满全屏，棋盘保持可点
    const tip = new Node('tip');
    tip.layer = this.node.layer;
    tip.addComponent(UITransform).setContentSize(TIP_W, TIP_H);
    tip.setPosition(new Vec3(0, -h / 2 + TIP_BOTTOM, 0));
    this.node.addChild(tip);

    const g = tip.addComponent(Graphics);
    g.fillColor = DIM;
    g.roundRect(-TIP_W / 2, -TIP_H / 2, TIP_W, TIP_H, 20);
    g.fill();
    // 提示条自身挡住触摸，避免玩家点文字时误触下层
    tip.addComponent(BlockInputEvents);

    this._tipLabel = buildModalLabel(tip, '', 28, new Vec3(0, 6, 0), {
      bold: true,
      color: new Color(255, 250, 240, 255),
      width: TIP_W - 40,
    });

    // 跳过按钮
    const skip = new Node('skip');
    skip.layer = this.node.layer;
    skip.addComponent(UITransform).setContentSize(SKIP_W, SKIP_H);
    skip.setPosition(new Vec3(TIP_W / 2 - SKIP_W / 2 - 8, -TIP_H / 2 + 4, 0));
    tip.addChild(skip);

    const sg = skip.addComponent(Graphics);
    sg.fillColor = new Color(255, 250, 240, 60);
    sg.roundRect(-SKIP_W / 2, -SKIP_H / 2, SKIP_W, SKIP_H, 14);
    sg.fill();

    buildModalLabel(skip, '跳过引导', 18, new Vec3(0, 0, 0), {
      color: new Color(255, 250, 240, 230),
      width: SKIP_W - 8,
    });

    skip.addComponent(TapZoneComponent).onTap = () => {
      GameManager.instance.skipTutorial();
    };
  }

  /** 步骤变化时更新文案；引导结束即自毁 */
  private _refresh(): void {
    const step = GameManager.instance.tutorialStep;
    if (!step) {
      this._clearAutoTimer();
      this.node.destroy();
      return;
    }
    if (this._tipLabel?.isValid) this._tipLabel.string = step.text;

    // 纯展示步骤（如「有顾客下单啦」）没有对应动作，到点自动推进。
    // _refresh 每次 tutorial:changed 都会跑，同一步骤只排一次定时器，
    // 否则重复触发会连推好几步（completeTutorialStep 只认当前步，但计时器会堆积）。
    if (step.requireAction || this._autoStepId === step.id) return;
    this._clearAutoTimer();
    this._autoStepId = step.id;
    this._autoTimer = setTimeout(() => {
      this._autoTimer = null;
      if (this.node.isValid) GameManager.instance.completeTutorialStep(step.id);
    }, step.autoCompleteMs ?? 500);
  }

  /** 销毁或步骤切换时撤掉未触发的定时器，避免回调打到已销毁的节点 */
  private _clearAutoTimer(): void {
    if (this._autoTimer === null) return;
    clearTimeout(this._autoTimer);
    this._autoTimer = null;
  }
}
