import { Color, Component, Graphics, Label, Node, UIOpacity, UITransform, Vec3, _decorator } from 'cc';
import { fontManager } from '../core/font-manager';

const { ccclass } = _decorator;

/* ═══ 气泡样式常量 ═══ */
const BUBBLE_FONT = 17;
const BUBBLE_LINE_H = 23;
const BUBBLE_MAX_W = 280;
const BUBBLE_PAD_X = 16;
const BUBBLE_PAD_TOP = 12;
const BUBBLE_PAD_BOTTOM = 12;
const BUBBLE_RADIUS = 12;
/** 小尾巴尺寸（底边宽 × 高） */
const TAIL_W = 14;
const TAIL_H = 8;
/** 气泡距头像顶部的间距 */
const BUBBLE_GAP = 8;
/** 气泡距屏幕左右边缘的最小距离 */
const SCREEN_MARGIN = 14;
/** 顾客台词与店主答复之间的分隔区高度（含线+上下间距） */
const DIVIDER_H = 14;
/** 顾客台词打完后，等待多久开始打答复（秒） */
const REPLY_DELAY = 0.55;
/** 答复打完后持续展示时长（秒） */
const HOLD_AFTER_REPLY = 1.6;
/** 最短总展示时长（秒） */
const MIN_TOTAL_DURATION = 3.2;
/** 淡出时长（秒） */
const FADE_DURATION = 0.3;

/* 颜色 — 对齐项目奶油风 */
const BUBBLE_BG_TOP = new Color(255, 253, 245, 255);   // #FFFDF5
const BUBBLE_BG_BOT = new Color(250, 244, 230, 255);   // #FAF4E6
const BUBBLE_BORDER = new Color(212, 192, 160, 255);   // #D4C0A0
const CUSTOMER_TEXT = new Color(111, 74, 57, 255);      // #6F4A39 顾客台词（深棕）
const REPLY_TEXT = new Color(155, 123, 90, 255);        // #9B7B5A 店主答复（浅棕）
const DIVIDER_COLOR = new Color(220, 205, 180, 200);    // 分隔线

/**
 * 对话气泡动画组件（一问一答模式）。
 *
 * 动画时间线：
 *   弹出阶段 (0~0.35s) ：缩放 0→1.2→1 回弹 + 旋转晃动 + 淡入
 *   顾客打字 (0.1s~)    ：逐字显示顾客台词，小尾巴快速摆动
 *   等待 (0.55s)         ：让玩家读完顾客的话
 *   店主打字             ：分隔线淡入 + 逐字显示店主幽默回复
 *   持续 (约 1.6s)       ：整体呼吸浮动 + 尾巴缓慢摆动
 *   淡出 (0.3s)          ：缩小 + 上飘 + 淡出，结束后销毁
 */
@ccclass('SpeechBubbleEffect')
class SpeechBubbleEffect extends Component {
  /** 顾客台词（外部设置） */
  fullText = '';
  /** 店主答复（外部设置） */
  replyText = '';

  /* ── 阶段时长 ── */
  private readonly _popDuration = 0.35;
  /** 打字机每字间隔（秒） */
  private readonly _charInterval = 0.055;
  /** 打字机最短时长（秒） */
  private readonly _minTypeDuration = 0.4;
  /** 打字机最长时长（秒） */
  private readonly _maxTypeDuration = 1.6;

  /* ── 运行时状态 ── */
  private _phase: 'pop' | 'customerTyping' | 'waitReply' | 'replyTyping' | 'hold' | 'fade' = 'pop';
  private _t = 0;
  private _fadeTimer = 0;
  private _uiOpacity: UIOpacity | null = null;
  private _customerLabel: Label | null = null;
  private _replyLabel: Label | null = null;
  private _dividerNode: Node | null = null;
  private _tailNode: Node | null = null;
  /** 顾客台词已显示的字符数 */
  private _customerTyped = 0;
  /** 店主答复已显示的字符数 */
  private _replyTyped = 0;
  /** 打字机累计时间 */
  private _typeTimer = 0;
  /** 顾客台词打字总时长 */
  private _customerTypeDuration = 0;
  /** 店主答复打字总时长 */
  private _replyTypeDuration = 0;
  /** 等待答复的累计时间 */
  private _waitTimer = 0;
  /** 持续阶段时长 */
  private _holdDuration = 1.6;
  /** 基准位置（呼吸浮动用，避免累积漂移） */
  private _baseY = 0;
  /** 全局时间（用于 sin 波动） */
  private _globalT = 0;

  protected onLoad(): void {
    this.node.setScale(new Vec3(0.1, 0.1, 1));
    this.node.angle = 0;
    this._uiOpacity = this.node.getComponent(UIOpacity) ?? this.node.addComponent(UIOpacity);
    this._uiOpacity.opacity = 0;
    this._baseY = this.node.position.y;

    // 查找子节点
    const body = this.node.getChildByName('bubbleBody');
    if (body) {
      const cNode = body.getChildByName('customerText');
      if (cNode) this._customerLabel = cNode.getComponent(Label);
      const rNode = body.getChildByName('replyText');
      if (rNode) this._replyLabel = rNode.getComponent(Label);
      this._dividerNode = body.getChildByName('divider');
    }
    this._tailNode = this.node.getChildByName('bubbleTail');

    // 初始清空文字、隐藏分隔线
    if (this._customerLabel) this._customerLabel.string = '';
    if (this._replyLabel) this._replyLabel.string = '';
    if (this._dividerNode) this._dividerNode.active = false;

    // 计算打字时长
    this._customerTypeDuration = this._calcTypeDuration(this.fullText);
    this._replyTypeDuration = this._calcTypeDuration(this.replyText);
  }

  /** start 兜底：如果 onLoad 时文字为空，这里重算 */
  protected start(): void {
    if (this._customerTypeDuration <= 0 && this.fullText.length > 0) {
      this._customerTypeDuration = this._calcTypeDuration(this.fullText);
    }
    if (this._replyTypeDuration <= 0 && this.replyText.length > 0) {
      this._replyTypeDuration = this._calcTypeDuration(this.replyText);
    }
  }

  private _calcTypeDuration(text: string): number {
    return Math.max(this._minTypeDuration, Math.min(this._maxTypeDuration, text.length * this._charInterval));
  }

  protected update(dt: number): void {
    this._globalT += dt;

    switch (this._phase) {
      case 'pop': this._updatePop(dt); break;
      case 'customerTyping': this._updateCustomerTyping(dt); break;
      case 'waitReply': this._updateWaitReply(dt); break;
      case 'replyTyping': this._updateReplyTyping(dt); break;
      case 'hold': this._updateHold(dt); break;
      case 'fade': this._updateFade(dt); break;
    }
  }

  /* ── 弹出阶段：缩放回弹 + 旋转晃动 + 淡入，0.1s 后开始顾客打字 ── */
  private _updatePop(dt: number): void {
    this._t = Math.min(this._popDuration, this._t + dt);
    const x = this._t / this._popDuration;

    const s = 1 + 2.9 * Math.pow(x - 1, 3) + 1.9 * Math.pow(x - 1, 2);
    const scale = Math.max(0.1, s);
    this.node.setScale(new Vec3(scale, scale, 1));

    const wobble = Math.sin(x * Math.PI * 1.5) * (1 - x) * -5;
    this.node.angle = wobble;

    if (this._uiOpacity) this._uiOpacity.opacity = Math.floor(255 * Math.min(1, x * 1.5));

    // 0.1s 后开始顾客打字（并行）
    if (this._t >= 0.1) {
      this._updateCustomerTyping(dt);
    }

    if (this._t >= this._popDuration) {
      this.node.setScale(new Vec3(1, 1, 1));
      this.node.angle = 0;
      if (this._uiOpacity) this._uiOpacity.opacity = 255;
      if (this._customerTyped < this.fullText.length) {
        this._phase = 'customerTyping';
      } else {
        this._phase = 'waitReply';
        this._waitTimer = 0;
      }
    }
  }

  /* ── 顾客台词打字：逐字显示 + 尾巴快速摆动 ── */
  private _updateCustomerTyping(dt: number): void {
    this._typeTimer += dt;
    const progress = Math.min(1, this._typeTimer / this._customerTypeDuration);
    const target = Math.floor(progress * this.fullText.length);

    if (target > this._customerTyped) {
      this._customerTyped = target;
      if (this._customerLabel) this._customerLabel.string = this.fullText.substring(0, target);
    }

    // 尾巴快速摆动
    if (this._tailNode) {
      this._tailNode.angle = Math.sin(this._globalT * 18) * 4;
    }

    if (this._customerTyped >= this.fullText.length) {
      this._phase = 'waitReply';
      this._waitTimer = 0;
    }
  }

  /* ── 等待答复：让玩家读完顾客的话，尾巴缓慢摆动 ── */
  private _updateWaitReply(dt: number): void {
    this._waitTimer += dt;

    if (this._tailNode) {
      this._tailNode.angle = Math.sin(this._globalT * 5) * 1.5;
    }

    if (this._waitTimer >= REPLY_DELAY) {
      // 显示分隔线，开始店主打字
      if (this._dividerNode) this._dividerNode.active = true;
      this._phase = 'replyTyping';
      this._typeTimer = 0;
    }
  }

  /* ── 店主答复打字：逐字显示 + 尾巴快速摆动 ── */
  private _updateReplyTyping(dt: number): void {
    this._typeTimer += dt;
    const progress = Math.min(1, this._typeTimer / this._replyTypeDuration);
    const target = Math.floor(progress * this.replyText.length);

    if (target > this._replyTyped) {
      this._replyTyped = target;
      if (this._replyLabel) this._replyLabel.string = this.replyText.substring(0, target);
    }

    if (this._tailNode) {
      this._tailNode.angle = Math.sin(this._globalT * 16) * 3.5;
    }

    if (this._replyTyped >= this.replyText.length) {
      this._enterHold();
    }
  }

  /* ── 持续阶段：呼吸浮动 + 尾巴缓慢摆动 ── */
  private _updateHold(dt: number): void {
    this._t += dt;

    const floatY = Math.sin(this._globalT * 2.85) * 3;
    this.node.setPosition(this.node.position.x, this._baseY + floatY, this.node.position.z);

    if (this._tailNode) {
      this._tailNode.angle = Math.sin(this._globalT * 3.5) * 2;
    }

    if (this._t >= this._holdDuration) {
      this._phase = 'fade';
      this._fadeTimer = 0;
    }
  }

  /** 进入持续阶段，计算持续时长（保证总时长不低于最小值） */
  private _enterHold(): void {
    this._phase = 'hold';
    this._t = 0;
    const elapsed = this._popDuration + this._customerTypeDuration + REPLY_DELAY + this._replyTypeDuration;
    this._holdDuration = Math.max(HOLD_AFTER_REPLY, MIN_TOTAL_DURATION - elapsed);
  }

  /* ── 淡出阶段：缩小 + 上飘 + 淡出 ── */
  private _updateFade(dt: number): void {
    this._fadeTimer += dt;
    const k = Math.max(0, 1 - this._fadeTimer / FADE_DURATION);
    const easeK = k * k;

    const scale = 0.75 + 0.25 * easeK;
    this.node.setScale(new Vec3(scale, scale, 1));

    if (this._uiOpacity) this._uiOpacity.opacity = Math.floor(255 * easeK);

    const p = this.node.position;
    this.node.setPosition(p.x, p.y + dt * 60 * (1 + (1 - k) * 2), p.z);

    if (this._tailNode) this._tailNode.angle *= 0.85;

    if (this._fadeTimer >= FADE_DURATION) {
      this.node.destroy();
    }
  }
}

/**
 * 在头像上方弹出顾客对话气泡（一问一答模式）。
 *
 * 气泡挂在 Canvas 根节点下（最高渲染层级），位置基于头像世界坐标动态计算，
 * 自动做屏幕边界检测。气泡内先显示顾客台词，延迟后店主自动幽默回复。
 *
 * @param canvas Canvas 根节点
 * @param avatarWorldPos 头像中心的世界坐标
 * @param avatarSize 头像尺寸
 * @param customerText 顾客说的话
 * @param replyText 店主的幽默回复
 */
export function showCustomerSpeechBubble(
  canvas: Node,
  avatarWorldPos: Vec3,
  avatarSize: number,
  customerText: string,
  replyText: string,
): void {
  if (!canvas?.isValid) return;

  // 顶掉旧气泡
  const old = canvas.getChildByName('customerSpeechBubble');
  if (old) old.destroy();

  /* ── 估算文字尺寸，决定气泡宽高 ── */
  const charW = BUBBLE_FONT * 0.88;
  const textAvailW = BUBBLE_MAX_W - BUBBLE_PAD_X * 2;
  const charsPerLine = Math.max(1, Math.floor(textAvailW / charW));

  const customerLines = Math.max(1, Math.ceil(customerText.length / charsPerLine));
  const replyLines = Math.max(1, Math.ceil(replyText.length / charsPerLine));

  const customerTextH = customerLines * BUBBLE_LINE_H;
  const replyTextH = replyLines * BUBBLE_LINE_H;

  // 气泡宽度：取较长文字决定，但不超过最大值
  const maxTextLen = Math.max(customerText.length, replyText.length);
  const bubbleW = Math.min(BUBBLE_MAX_W, maxTextLen * charW + BUBBLE_PAD_X * 2);
  // 气泡高度：顾客区 + 分隔区 + 答复区 + 上下内边距
  const bubbleH = customerTextH + DIVIDER_H + replyTextH + BUBBLE_PAD_TOP + BUBBLE_PAD_BOTTOM;

  /* ── 把头像世界坐标转成 canvas 本地坐标 ── */
  const canvasUi = canvas.getComponent(UITransform);
  const canvasW = canvasUi?.width ?? 720;
  const avatarLocal = canvasUi
    ? canvasUi.convertToNodeSpaceAR(new Vec3(avatarWorldPos.x, avatarWorldPos.y, 0))
    : new Vec3(avatarWorldPos.x, avatarWorldPos.y, 0);

  /* ── 计算气泡位置 + 边界检测 ── */
  let bubbleCenterX = avatarLocal.x;
  const halfCanvasW = canvasW / 2;
  const leftLimit = -halfCanvasW + SCREEN_MARGIN + bubbleW / 2;
  const rightLimit = halfCanvasW - SCREEN_MARGIN - bubbleW / 2;
  if (bubbleCenterX < leftLimit) bubbleCenterX = leftLimit;
  if (bubbleCenterX > rightLimit) bubbleCenterX = rightLimit;

  // 尾巴水平偏移（气泡偏移时尾巴仍指向头像）
  const tailMaxOffset = bubbleW / 2 - TAIL_W / 2 - 4;
  const tailOffsetX = Math.max(-tailMaxOffset, Math.min(tailMaxOffset, avatarLocal.x - bubbleCenterX));

  // 气泡 y：尾巴尖端对准头像顶部 + 间距
  const avatarTopY = avatarLocal.y + avatarSize / 2;
  const rootY = avatarTopY + BUBBLE_GAP + (bubbleH + TAIL_H) / 2;

  /* ── 气泡根节点（先建子节点，最后挂到 canvas） ── */
  const root = new Node('customerSpeechBubble');
  root.layer = canvas.layer;
  root.addComponent(UITransform).setContentSize(bubbleW, bubbleH + TAIL_H);
  root.setPosition(new Vec3(bubbleCenterX, rootY, 0));

  /* ── 气泡体（圆角矩形 + 小尾巴，合并到一个 Graphics，彻底消除缝隙） ── */
  const body = new Node('bubbleBody');
  body.layer = root.layer;
  body.addComponent(UITransform).setContentSize(bubbleW, bubbleH);
  body.setPosition(new Vec3(0, TAIL_H / 2, 0));
  root.addChild(body);

  const g = body.addComponent(Graphics);
  const halfW = bubbleW / 2;
  const halfH = bubbleH / 2;
  const r = BUBBLE_RADIUS;

  // 尾巴在 body 坐标系中的位置（body 中心在 root 的 TAIL_H/2 处）
  // 尾巴顶部接在 body 底部中心，尾巴尖端在 body 底部下方 TAIL_H 处
  const tailTopY = -halfH;           // 尾巴顶部 = body 底部
  const tailTipY = -halfH - TAIL_H;  // 尾巴尖端
  const tailLeftX = tailOffsetX - TAIL_W / 2;
  const tailRightX = tailOffsetX + TAIL_W / 2;

  // 整个气泡轮廓路径（圆角矩形 + 底部三角形尾巴，一笔画完）
  g.moveTo(-halfW + r, halfH);
  // 顶边 + 右上角
  g.lineTo(halfW - r, halfH);
  g.quadraticCurveTo(halfW, halfH, halfW, halfH - r);
  // 右边 + 右下角
  g.lineTo(halfW, -halfH + r);
  g.quadraticCurveTo(halfW, -halfH, halfW - r, -halfH);
  // 底部到尾巴右侧
  g.lineTo(tailRightX, tailTopY);
  // 尾巴右斜边 → 尖端
  g.lineTo(tailOffsetX, tailTipY);
  // 尾巴左斜边
  g.lineTo(tailLeftX, tailTopY);
  // 底部到左下角
  g.lineTo(-halfW + r, -halfH);
  g.quadraticCurveTo(-halfW, -halfH, -halfW, -halfH + r);
  // 左边 + 左上角
  g.lineTo(-halfW, halfH - r);
  g.quadraticCurveTo(-halfW, halfH, -halfW + r, halfH);
  g.close();

  // 底层填充（深色，覆盖整个形状含尾巴）
  g.fillColor = BUBBLE_BG_BOT;
  g.fill();

  // 上层浅色（只覆盖气泡体上半部分，底部平直，模拟渐变）
  g.moveTo(-halfW, 0);
  g.lineTo(-halfW, halfH - r);
  g.quadraticCurveTo(-halfW, halfH, -halfW + r, halfH);
  g.lineTo(halfW - r, halfH);
  g.quadraticCurveTo(halfW, halfH, halfW, halfH - r);
  g.lineTo(halfW, 0);
  g.close();
  g.fillColor = BUBBLE_BG_TOP;
  g.fill();

  // 描边（整个轮廓）
  g.lineWidth = 1.5;
  g.strokeColor = BUBBLE_BORDER;
  g.moveTo(-halfW + r, halfH);
  g.lineTo(halfW - r, halfH);
  g.quadraticCurveTo(halfW, halfH, halfW, halfH - r);
  g.lineTo(halfW, -halfH + r);
  g.quadraticCurveTo(halfW, -halfH, halfW - r, -halfH);
  g.lineTo(tailRightX, tailTopY);
  g.lineTo(tailOffsetX, tailTipY);
  g.lineTo(tailLeftX, tailTopY);
  g.lineTo(-halfW + r, -halfH);
  g.quadraticCurveTo(-halfW, -halfH, -halfW, -halfH + r);
  g.lineTo(-halfW, halfH - r);
  g.quadraticCurveTo(-halfW, halfH, -halfW + r, halfH);
  g.close();
  g.stroke();

  /* ── 顾客台词（上半部分，深棕加粗） ── */
  const customerNode = new Node('customerText');
  customerNode.layer = body.layer;
  customerNode.addComponent(UITransform).setContentSize(bubbleW - BUBBLE_PAD_X * 2, customerTextH);
  // 顾客区顶部 = 气泡体顶部 - 上内边距，中心 = 顶部 - 文字高度/2
  const customerY = halfH - BUBBLE_PAD_TOP - customerTextH / 2;
  customerNode.setPosition(new Vec3(0, customerY, 0));
  body.addChild(customerNode);

  const customerLabel = customerNode.addComponent(Label);
  customerLabel.string = customerText;
  customerLabel.fontSize = BUBBLE_FONT;
  customerLabel.lineHeight = BUBBLE_LINE_H;
  customerLabel.color = CUSTOMER_TEXT;
  customerLabel.isBold = true;
  customerLabel.enableWrapText = true;
  customerLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
  customerLabel.verticalAlign = Label.VerticalAlign.TOP;
  customerLabel.overflow = Label.Overflow.SHRINK;
  fontManager.applyFont(customerLabel);

  /* ── 分隔线（顾客与答复之间，初始隐藏） ── */
  const dividerNode = new Node('divider');
  dividerNode.layer = body.layer;
  dividerNode.addComponent(UITransform).setContentSize(bubbleW - BUBBLE_PAD_X * 2, 1);
  const dividerY = customerY - customerTextH / 2 - DIVIDER_H / 2;
  dividerNode.setPosition(new Vec3(0, dividerY, 0));
  body.addChild(dividerNode);
  dividerNode.active = false;

  const dg = dividerNode.addComponent(Graphics);
  dg.lineWidth = 1;
  dg.strokeColor = DIVIDER_COLOR;
  dg.moveTo(-(bubbleW - BUBBLE_PAD_X * 2) / 2, 0);
  dg.lineTo((bubbleW - BUBBLE_PAD_X * 2) / 2, 0);
  dg.stroke();

  /* ── 店主答复（下半部分，浅棕正常，左对齐） ── */
  const replyNode = new Node('replyText');
  replyNode.layer = body.layer;
  replyNode.addComponent(UITransform).setContentSize(bubbleW - BUBBLE_PAD_X * 2, replyTextH);
  // 答复区底部 = 气泡体底部 + 下内边距，中心 = 底部 + 文字高度/2
  const replyY = -halfH + BUBBLE_PAD_BOTTOM + replyTextH / 2;
  replyNode.setPosition(new Vec3(0, replyY, 0));
  body.addChild(replyNode);

  const replyLabel = replyNode.addComponent(Label);
  replyLabel.string = replyText;
  replyLabel.fontSize = BUBBLE_FONT;
  replyLabel.lineHeight = BUBBLE_LINE_H;
  replyLabel.color = REPLY_TEXT;
  replyLabel.isBold = false;
  replyLabel.enableWrapText = true;
  replyLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
  replyLabel.verticalAlign = Label.VerticalAlign.TOP;
  replyLabel.overflow = Label.Overflow.SHRINK;
  fontManager.applyFont(replyLabel);

  /* ── 小尾巴节点（用于摆动动画，不绘制，绘制已合并到 body Graphics） ── */
  const tail = new Node('bubbleTail');
  tail.layer = root.layer;
  tail.addComponent(UITransform).setContentSize(TAIL_W, TAIL_H);
  // 尾巴节点位置与绘制的尾巴中心对齐（body 坐标系 → root 坐标系）
  tail.setPosition(new Vec3(tailOffsetX, -bubbleH / 2 - TAIL_H / 2, 0));
  root.addChild(tail);

  /* ── 所有子节点就绪后，挂到 canvas 最上层并启动动画 ── */
  const effect = root.addComponent(SpeechBubbleEffect);
  effect.fullText = customerText;
  effect.replyText = replyText;
  canvas.addChild(root);
  root.setSiblingIndex(canvas.children.length - 1);
}
