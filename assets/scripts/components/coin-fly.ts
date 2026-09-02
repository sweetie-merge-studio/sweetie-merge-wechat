/**
 * 金币飞行动画（对齐 Web 版 App.vue 的 spawnFlyingCoins / fly-coin-arc）。
 *
 * 从领取位置生成多枚金币，沿二次贝塞尔弧线散射飞向状态栏金币图标，
 * 结束后在终点弹出「+N」浮动金额文字。
 *
 * 用法：
 *   spawnFlyingCoins(canvas, fromWorldPos, coinAmount);
 *
 * 依赖 StatusBarComponent 暴露金币图标世界坐标；状态栏未就绪时降级为
 * 只弹浮动金额、不做飞行。
 */

import { Color, Label, Node, Sprite, tween, UIOpacity, UITransform, Vec3 } from 'cc';
import { loadSpriteFrame, applySpriteFrame } from './sprite-loader';
import { StatusBarComponent } from './StatusBarComponent';
import { fontManager } from '../core/font-manager';

/* ═══ 参数（对齐 Web 端） ═══ */

/** 单枚金币尺寸（设计单位，Web 22px × 720p 缩放比≈1.6 → 35） */
const COIN_SIZE = 32;
/** 飞行总时长（秒），Web 450ms */
const FLY_DURATION = 0.45;
/** 中点占比（Web @keyframes 40% 到达 mid） */
const MID_RATIO = 0.4;
/** 每枚金币错开发射的间隔（秒），Web 40ms */
const STAGGER = 0.04;
/** 起点随机散布半径 */
const SPREAD_X = 20;
const SPREAD_Y = 15;
/** 弧线中点随机偏移 */
const MID_JITTER_X = 30;
const MID_JITTER_Y_MIN = 15;
const MID_JITTER_Y_MAX = 35;
/** 浮动金额持续时间（秒），Web 0.8s */
const FLOAT_DURATION = 0.8;
/** 浮动金额上浮距离 */
const FLOAT_RISE = 40;

/** 金币贴图路径 */
const COIN_SPRITE_PATH = 'sprites/currency/coin_single';

/**
 * 生成金币飞行动画。
 * @param canvas 画布根节点（飞行层挂在这里）
 * @param fromWorldPos 金币出发点的世界坐标
 * @param amount 获得的金币数量（决定生成几枚金币 + 浮动金额文字）
 */
export function spawnFlyingCoins(canvas: Node, fromWorldPos: Vec3, amount: number): void {
  if (!canvas?.isValid || amount <= 0) return;

  // 取终点：状态栏金币图标世界坐标；拿不到就降级
  const endWorld = StatusBarComponent.getGoldIconWorldPos();
  if (!endWorld) {
    // 降级：直接在出发点弹浮动金额
    spawnFloatAmount(canvas, fromWorldPos, amount);
    return;
  }

  const flyLayer = ensureFlyLayer(canvas);
  const flyUi = flyLayer.getComponent(UITransform)!;

  // 金币数量：4~10 枚（Web: min(max(ceil(amount/10), 4), 10)）
  const count = Math.min(Math.max(Math.ceil(amount / 10), 4), 10);

  const fromLocal = flyUi.convertToNodeSpaceAR(fromWorldPos);
  const endLocal = flyUi.convertToNodeSpaceAR(endWorld);

  for (let i = 0; i < count; i++) {
    // 起点随机散布
    const start = new Vec3(
      fromLocal.x + (Math.random() - 0.5) * SPREAD_X * 2,
      fromLocal.y + (Math.random() - 0.5) * SPREAD_Y * 2,
      0,
    );
    // 弧线中点：起止点中间 + 向上拱起 + 随机横向偏移
    const mid = new Vec3(
      (start.x + endLocal.x) / 2 + (Math.random() - 0.5) * MID_JITTER_X * 2,
      Math.min(start.y, endLocal.y) - MID_JITTER_Y_MIN - Math.random() * (MID_JITTER_Y_MAX - MID_JITTER_Y_MIN),
      0,
    );

    const delay = i * STAGGER;
    spawnOneCoin(flyLayer, start, mid, endLocal, delay);
  }

  // 最后一枚金币到达后弹浮动金额
  const totalDelay = (count - 1) * STAGGER;
  setTimeout(() => {
    if (flyLayer.isValid) {
      spawnFloatAmount(flyLayer, endLocal, amount, true);
    }
  }, (FLY_DURATION + totalDelay) * 1000);
}

/* ═══ 单枚金币飞行 ═══ */

function spawnOneCoin(parent: Node, start: Vec3, mid: Vec3, end: Vec3, delay: number): void {
  const node = new Node('flyCoin');
  node.layer = parent.layer;
  node.addComponent(UITransform).setContentSize(COIN_SIZE, COIN_SIZE);
  node.setPosition(start);
  node.setScale(0.5, 0.5, 1);
  const op = node.addComponent(UIOpacity);
  op.opacity = 0;

  const sprite = node.addComponent(Sprite);
  parent.addChild(node);

  loadSpriteFrame(COIN_SPRITE_PATH, sf => {
    if (sf && sprite.isValid) applySpriteFrame(sprite, sf);
  });

  const midDur = FLY_DURATION * MID_RATIO;
  const endDur = FLY_DURATION * (1 - MID_RATIO);

  // 延迟出发 → 起点淡入放大 → 飞中点 → 飞终点（缩小淡出）
  tween(node)
    .delay(delay)
    .call(() => { op.opacity = 255; })
    .to(midDur, { position: mid, scale: new Vec3(1, 1, 1) }, { easing: 'sineOut' })
    .to(endDur, { position: end, scale: new Vec3(0.4, 0.4, 1) }, {
      easing: 'sineIn',
      onUpdate: (_t, ratio) => {
        // 后半段逐渐淡出（Web 100% opacity: 0.6）
        op.opacity = Math.round(255 * (1 - ratio * 0.4));
      },
    })
    .call(() => {
      if (node.isValid) node.destroy();
    })
    .start();
}

/* ═══ 浮动金额文字（对齐 Web .float-amount / @keyframes float-up） ═══ */

function spawnFloatAmount(parent: Node, pos: Vec3, amount: number, isLocal = false): void {
  const node = new Node('floatAmount');
  node.layer = parent.layer;
  node.addComponent(UITransform);
  const parentUi = parent.getComponent(UITransform);
  const localPos = isLocal || !parentUi ? pos : parentUi.convertToNodeSpaceAR(pos);
  node.setPosition(localPos);
  node.setScale(0.5, 0.5, 1);
  const op = node.addComponent(UIOpacity);
  op.opacity = 0;
  parent.addChild(node);

  const label = node.addComponent(Label);
  label.string = `+${amount}`;
  label.fontSize = 22;
  label.lineHeight = 28;
  label.isBold = true;
  // Web .float-amount color: #F5A623
  label.color = new Color(245, 166, 35, 255);
  label.horizontalAlign = Label.HorizontalAlign.CENTER;
  fontManager.applyFont(label);

  // Web float-up: 0% opacity0 scale0.5 → 15% opacity1 scale1.2 → 30% scale1 → 100% opacity0 translateY(-40px) scale0.85
  const t1 = FLOAT_DURATION * 0.15;  // 0→15%
  const t2 = FLOAT_DURATION * 0.15;  // 15%→30%
  const t3 = FLOAT_DURATION * 0.70;  // 30%→100%
  const endPos = new Vec3(localPos.x, localPos.y + FLOAT_RISE, 0);

  tween(node)
    .to(t1, { scale: new Vec3(1.2, 1.2, 1) }, {
      easing: 'sineOut',
      onUpdate: (_t, ratio) => { op.opacity = Math.round(255 * ratio); },
    })
    .to(t2, { scale: new Vec3(1, 1, 1) }, { easing: 'sineInOut' })
    .to(t3, { position: endPos, scale: new Vec3(0.85, 0.85, 1) }, {
      easing: 'sineOut',
      onUpdate: (_t, ratio) => { op.opacity = Math.round(255 * (1 - ratio)); },
    })
    .call(() => {
      if (node.isValid) node.destroy();
    })
    .start();
}

/* ═══ 飞行层（懒建，挂在 canvas 下，全屏不拦截触摸） ═══ */

const FLY_LAYER_NAME = 'coinFlyLayer';

function ensureFlyLayer(canvas: Node): Node {
  const existing = canvas.getChildByName(FLY_LAYER_NAME);
  if (existing?.isValid) return existing;

  const layer = new Node(FLY_LAYER_NAME);
  layer.layer = canvas.layer;
  const ui = layer.addComponent(UITransform);
  const canvasUi = canvas.getComponent(UITransform);
  ui.setContentSize(canvasUi?.width ?? 720, canvasUi?.height ?? 1280);
  layer.setPosition(0, 0, 0);
  canvas.addChild(layer);
  // 置顶：在所有 UI 之上渲染
  layer.setSiblingIndex(canvas.children.length);
  return layer;
}
