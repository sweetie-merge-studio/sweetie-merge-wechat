import { _decorator, Color, Component, Graphics, Label, Node, Sprite, Tween, UITransform, Vec3, Widget, tween } from 'cc';

import { GameManager } from '../manager/GameManager';
import { TapZoneComponent } from './tap-zone';
import { buildModalLabel } from './modal-chrome';
import { getTutorialTargetRect, getTutorialHandPos, TutorialTargetRect } from '../core/tutorial-target';
import type { TutorialStepId } from '../core/tutorial';

const { ccclass } = _decorator;

/**
 * 新手引导层（对齐 Web 版 TutorialOverlay.vue）。
 *
 * 功能：
 * 1. 全屏遮罩 + 圆角挖洞，高亮目标区域
 * 2. 三层同心圆金色光圈（外→内渐变）+ 明亮边框，呼吸缩放动画
 * 3. 文案气泡（智能定位在高亮下方/上方）
 * 4. 手势点击动画
 * 5. 右上角跳过按钮
 * 6. 洞口区域触摸穿透到下层
 * 7. 持续追踪目标位置
 */
const OVERLAY_NAME = 'TutorialOverlay';

/** 半透明遮罩底色 */
const DIM = new Color(24, 16, 10, 50);

/** 气泡尺寸 */
const BUBBLE_MAX_W = 520;
const BUBBLE_PAD_X = 36;
const BUBBLE_PAD_Y = 24;

/** 跳过按钮尺寸 */
const SKIP_W = 140;
const SKIP_H = 56;

/** 发光边框颜色（明亮金色，清晰可见） */
const SPOTLIGHT_COLOR = new Color(255, 230, 150, 235);
/** 光圈内层光晕（紧贴边框，最亮） */
const GLOW_INNER = new Color(255, 215, 100, 90);
/** 光圈中层光晕 */
const GLOW_MID = new Color(255, 200, 80, 50);
/** 光圈外层光晕（最宽最淡，营造扩散感） */
const GLOW_OUTER = new Color(255, 190, 60, 22);

@ccclass('TutorialOverlay')
export class TutorialOverlay extends Component {
  private _mask: Graphics | null = null;
  private _spotGroup: Node | null = null;
  private _spotlight: Graphics | null = null;
  private _spotlightGlow: Graphics | null = null;
  private _bubble: Node | null = null;
  private _bubbleLabel: Label | null = null;
  private _hand: Node | null = null;
  private _skipBtn: Node | null = null;
  private _breathing: Tween<Node> | null = null;

  /** 当前高亮区域（世界坐标） */
  private _spotRect: TutorialTargetRect | null = null;
  /** 自动推进定时器 */
  private _autoTimer: ReturnType<typeof setTimeout> | null = null;
  private _autoStepId: TutorialStepId | null = null;

  private readonly _onChanged = (): void => this._refresh();

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
    if (this._hand?.isValid) Tween.stopAllByTarget(this._hand);
    if (this._breathing) this._breathing.stop();
    GameManager.instance.events.off('tutorial:changed', this._onChanged);
  }

  protected update(): void {
    // 持续追踪目标位置（目标可能动态变化，如棋盘格子）
    this._updateSpot();
  }

  private _build(): void {
    const ui = this.node.getComponent(UITransform) as UITransform | null;
    const w = ui?.width ?? 720;
    const h = ui?.height ?? 1280;

    // 1. 全屏遮罩（带挖洞）
    const maskNode = new Node('mask');
    maskNode.layer = this.node.layer;
    maskNode.addComponent(UITransform).setContentSize(w, h);
    this.node.addChild(maskNode);
    this._mask = maskNode.addComponent(Graphics);

    // 2. 光圈组（光晕 + 边框，统一做呼吸动画）
    this._spotGroup = new Node('spotGroup');
    this._spotGroup.layer = this.node.layer;
    this._spotGroup.addComponent(UITransform);
    this.node.addChild(this._spotGroup);

    // 2a. 发光边框外层光晕
    const glowNode = new Node('spotlightGlow');
    glowNode.layer = this.node.layer;
    glowNode.addComponent(UITransform);
    this._spotGroup.addChild(glowNode);
    this._spotlightGlow = glowNode.addComponent(Graphics);

    // 2b. 发光边框
    const spotNode = new Node('spotlight');
    spotNode.layer = this.node.layer;
    spotNode.addComponent(UITransform);
    this._spotGroup.addChild(spotNode);
    this._spotlight = spotNode.addComponent(Graphics);

    // 2c. 光圈呼吸动画（缩放脉冲，让高亮区域更吸引注意力）
    this._breathing = tween(this._spotGroup)
      .to(1.1, { scale: new Vec3(1.04, 1.04, 1) }, { easing: 'sineInOut' })
      .to(1.1, { scale: new Vec3(1.0, 1.0, 1) }, { easing: 'sineInOut' })
      .union()
      .repeatForever();
    this._breathing.start();

    // 4. 文案气泡
    this._bubble = new Node('bubble');
    this._bubble.layer = this.node.layer;
    this._bubble.addComponent(UITransform);
    this.node.addChild(this._bubble);
    const bg = this._bubble.addComponent(Graphics);
    this._bubbleLabel = buildModalLabel(this._bubble, '', 26, new Vec3(0, 0, 0), {
      bold: true,
      color: new Color(92, 58, 30, 255),
      width: BUBBLE_MAX_W - BUBBLE_PAD_X * 2,
    });

    // 5. 手势动画节点
    this._hand = new Node('hand');
    this._hand.layer = this.node.layer;
    this._hand.addComponent(UITransform).setContentSize(60, 60);
    this._hand.active = false;
    this.node.addChild(this._hand);
    // 用 Graphics 画一个简单的手指图标
    const handG = this._hand.addComponent(Graphics);
    handG.fillColor = new Color(255, 255, 255, 240);
    handG.circle(0, 0, 24);
    handG.fill();
    handG.lineWidth = 3;
    handG.strokeColor = new Color(92, 58, 30, 200);
    handG.circle(0, 0, 24);
    handG.stroke();
    // 手指尖
    handG.fillColor = new Color(92, 58, 30, 200);
    handG.circle(0, 0, 8);
    handG.fill();

    // 6. 跳过按钮（右上角）
    this._skipBtn = new Node('skip');
    this._skipBtn.layer = this.node.layer;
    this._skipBtn.addComponent(UITransform).setContentSize(SKIP_W, SKIP_H);
    this._skipBtn.setPosition(new Vec3(w / 2 - SKIP_W / 2 - 20, h / 2 - SKIP_H / 2 - 40, 0));
    this.node.addChild(this._skipBtn);
    const skipG = this._skipBtn.addComponent(Graphics);
    skipG.fillColor = new Color(255, 255, 255, 40);
    skipG.roundRect(-SKIP_W / 2, -SKIP_H / 2, SKIP_W, SKIP_H, 20);
    skipG.fill();
    skipG.lineWidth = 1.5;
    skipG.strokeColor = new Color(255, 255, 255, 80);
    skipG.roundRect(-SKIP_W / 2, -SKIP_H / 2, SKIP_W, SKIP_H, 20);
    skipG.stroke();
    buildModalLabel(this._skipBtn, '先跳过', 20, new Vec3(0, 0, 0), {
      color: new Color(255, 255, 255, 200),
      width: SKIP_W - 16,
    });
    this._skipBtn.addComponent(TapZoneComponent).onTap = () => {
      GameManager.instance.skipTutorial();
    };
  }

  /** 更新高亮位置 */
  private _updateSpot(): void {
    const step = GameManager.instance.tutorialStep;
    if (!step) return;

    const rect = getTutorialTargetRect(step.target);
    if (!rect) {
      this._spotRect = null;
      this._mask?.clear();
      this._spotlight?.clear();
      this._spotlightGlow?.clear();
      this._bubble && (this._bubble.active = false);
      this._hand && (this._hand.active = false);
      return;
    }

    // 位置变化时才重绘
    if (this._spotRect &&
        Math.abs(this._spotRect.x - rect.x) < 0.5 &&
        Math.abs(this._spotRect.y - rect.y) < 0.5 &&
        Math.abs(this._spotRect.width - rect.width) < 0.5 &&
        Math.abs(this._spotRect.height - rect.height) < 0.5) {
      return;
    }
    this._spotRect = rect;
    this._redrawSpot();
  }

  /** 重绘高亮区域（遮罩挖洞 + 发光边框 + 气泡定位） */
  private _redrawSpot(): void {
    const rect = this._spotRect;
    if (!rect) return;

    const ui = this.node.getComponent(UITransform) as UITransform | null;
    const w = ui?.width ?? 720;
    const h = ui?.height ?? 1280;

    // 把目标的世界坐标转换为 overlay 本地坐标（getNodeRect 返回世界坐标，
    // Graphics 绘制用本地坐标，不转换会导致高亮区域定位错误）
    const localPos = ui?.convertToNodeSpaceAR(new Vec3(rect.x, rect.y, 0)) ?? new Vec3(rect.x, rect.y, 0);
    const holeX = localPos.x;
    const holeY = localPos.y;

    const step = GameManager.instance.tutorialStep;
    const pad = step?.spotPadding ?? 10;
    const holeW = rect.width + pad * 2;
    const holeH = rect.height + pad * 2;
    const radius = Math.min(24, holeW / 4, holeH / 4);

    // 1. 遮罩挖洞（even-odd 填充规则）
    const mask = this._mask;
    if (mask) {
      mask.clear();
      mask.fillColor = DIM;
      // 全屏矩形
      mask.rect(-w / 2, -h / 2, w, h);
      // 挖洞（圆角矩形）
      mask.roundRect(holeX - holeW / 2, holeY - holeH / 2, holeW, holeH, radius);
      mask.fill();
    }

    // 2. 光圈 — 三层同心圆光晕（外→内：宽淡→中→窄亮），模拟径向发光
    const glow = this._spotlightGlow;
    if (glow) {
      glow.clear();
      // 外层：最宽最淡，营造扩散感
      glow.fillColor = GLOW_OUTER;
      glow.roundRect(holeX - holeW / 2 - 16, holeY - holeH / 2 - 16, holeW + 32, holeH + 32, radius + 12);
      glow.fill();
      // 中层
      glow.fillColor = GLOW_MID;
      glow.roundRect(holeX - holeW / 2 - 10, holeY - holeH / 2 - 10, holeW + 20, holeH + 20, radius + 8);
      glow.fill();
      // 内层：紧贴边框，最亮
      glow.fillColor = GLOW_INNER;
      glow.roundRect(holeX - holeW / 2 - 5, holeY - holeH / 2 - 5, holeW + 10, holeH + 10, radius + 4);
      glow.fill();
    }

    // 3. 发光边框（明亮金色，线宽 3.5）
    const spot = this._spotlight;
    if (spot) {
      spot.clear();
      spot.lineWidth = 3.5;
      spot.strokeColor = SPOTLIGHT_COLOR;
      spot.roundRect(holeX - holeW / 2, holeY - holeH / 2, holeW, holeH, radius);
      spot.stroke();
    }

    // 4. 气泡定位：优先放在高亮下方，不够则上方
    const bubble = this._bubble;
    if (bubble && this._bubbleLabel) {
      bubble.active = true;
      const text = this._bubbleLabel.string;
      // 估算气泡高度（按文字行数）
      const lines = Math.max(1, Math.ceil(text.length / 18));
      const bubbleH = lines * 36 + BUBBLE_PAD_Y * 2;
      const bubbleW = Math.min(BUBBLE_MAX_W, Math.max(280, text.length * 26 + BUBBLE_PAD_X * 2));

      bubble.getComponent(UITransform)?.setContentSize(bubbleW, bubbleH);

      // 重绘气泡背景
      const bg = bubble.getComponent(Graphics);
      if (bg) {
        bg.clear();
        // 阴影
        bg.fillColor = new Color(0, 0, 0, 40);
        bg.roundRect(-bubbleW / 2 + 2, -bubbleH / 2 - 3, bubbleW, bubbleH, 18);
        bg.fill();
        // 渐变底色（用两层模拟）
        bg.fillColor = new Color(255, 248, 238, 255);
        bg.roundRect(-bubbleW / 2, -bubbleH / 2, bubbleW, bubbleH, 18);
        bg.fill();
        bg.fillColor = new Color(253, 235, 208, 120);
        bg.roundRect(-bubbleW / 2 + 4, 0, bubbleW - 8, bubbleH / 2 - 4, 14);
        bg.fill();
        // 金色边框
        bg.lineWidth = 2.5;
        bg.strokeColor = new Color(245, 200, 122, 255);
        bg.roundRect(-bubbleW / 2, -bubbleH / 2, bubbleW, bubbleH, 18);
        bg.stroke();
      }

      // 定位：优先放在高亮下方，空间不够则放上方；Y 坐标钳制在屏幕内防止飞出
      const belowY = holeY - holeH / 2 - bubbleH / 2 - 16;
      const aboveY = holeY + holeH / 2 + bubbleH / 2 + 16;
      const minY = -h / 2 + bubbleH / 2 + 24;
      const maxY = h / 2 - bubbleH / 2 - 24;
      let bubbleY = belowY >= minY ? belowY : aboveY;
      bubbleY = Math.max(minY, Math.min(maxY, bubbleY));
      // 水平居中对齐高亮区域，限制在屏幕内
      const bubbleX = Math.max(-w / 2 + bubbleW / 2 + 16, Math.min(w / 2 - bubbleW / 2 - 16, holeX));
      bubble.setPosition(new Vec3(bubbleX, bubbleY, 0));
    }

    // 5. 手势/呼吸灯动画
    const hand = this._hand;
    if (hand) {
      const step = GameManager.instance.tutorialStep;
      if (step?.requireAction) {
        hand.active = true;
        // 优先使用注册的精确呼吸灯位置（指向具体可交互元素），
        // 未注册时回退到高亮区域中心（不再用任意象限偏移，避免定位不准）
        const handPos = getTutorialHandPos(step.target);
        let hx: number, hy: number;
        if (handPos) {
          const localHand = ui?.convertToNodeSpaceAR(new Vec3(handPos.x, handPos.y, 0))
            ?? new Vec3(handPos.x, handPos.y, 0);
          hx = localHand.x;
          hy = localHand.y;
        } else {
          hx = holeX;
          hy = holeY;
        }
        hand.setPosition(new Vec3(hx, hy, 0));
        // 呼吸灯动画：先停掉旧 tween 防止叠加，再用更柔和的缩放脉冲
        Tween.stopAllByTarget(hand);
        tween(hand)
          .to(0.8, { scale: new Vec3(0.75, 0.75, 1) }, { easing: 'sineIn' })
          .to(0.8, { scale: new Vec3(1.05, 1.05, 1) }, { easing: 'sineOut' })
          .union()
          .repeatForever()
          .start();
      } else {
        hand.active = false;
      }
    }
  }

  /** 步骤变化时更新文案 */
  private _refresh(): void {
    const step = GameManager.instance.tutorialStep;
    if (!step) {
      this._clearAutoTimer();
      this.node.destroy();
      return;
    }
    if (this._bubbleLabel?.isValid) this._bubbleLabel.string = step.text;
    // 强制重绘（文案变化可能导致气泡尺寸变化）
    this._spotRect = null;
    this._updateSpot();

    // 纯展示步骤自动推进
    if (step.requireAction || this._autoStepId === step.id) return;
    this._clearAutoTimer();
    this._autoStepId = step.id;
    this._autoTimer = setTimeout(() => {
      this._autoTimer = null;
      if (this.node.isValid) GameManager.instance.completeTutorialStep(step.id);
    }, step.autoCompleteMs ?? 500);
  }

  private _clearAutoTimer(): void {
    if (this._autoTimer === null) return;
    clearTimeout(this._autoTimer);
    this._autoTimer = null;
  }
}
