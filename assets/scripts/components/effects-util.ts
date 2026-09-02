import { Color, Graphics, Label, Node, tween, UIOpacity, UITransform, Vec3 } from 'cc';
import { fontManager } from '../core/font-manager';

/**
 * 通用特效工具库：冲击波、屏幕震动、连击文字、拖拽残影等。
 * 所有函数都是无状态的，接收父节点和参数，生成临时节点播放后自动销毁。
 */

/* ═══════════════════════════════════════════════════════════════
 * 环形冲击波：只有描边的圆快速扩散+淡出（比实心圆更有爆炸冲击力）
 * ═══════════════════════════════════════════════════════════════ */

export function spawnShockwave(
  parent: Node,
  pos: Vec3,
  color: Color,
  maxRadius: number,
  duration: number,
  lineWidth = 4,
): void {
  const node = new Node('shockwave');
  node.layer = parent.layer;
  node.addComponent(UITransform).setContentSize(maxRadius * 2, maxRadius * 2);
  node.setPosition(pos);
  parent.addChild(node);

  const g = node.addComponent(Graphics);
  g.lineWidth = lineWidth;
  g.strokeColor = new Color(color.r, color.g, color.b, 220);
  g.circle(0, 0, maxRadius * 0.2);
  g.stroke();

  node.setScale(0.3, 0.3, 1);
  const op = node.addComponent(UIOpacity);
  op.opacity = 230;

  tween(node)
    .to(duration * 0.35, { scale: new Vec3(1, 1, 1) }, {
      easing: 'quadOut',
      onUpdate: (_t, ratio) => {
        op.opacity = Math.round(230 * (1 - ratio * 0.4));
      },
    })
    .to(duration * 0.65, { scale: new Vec3(1.5, 1.5, 1) }, {
      easing: 'sineOut',
      onUpdate: (_t, ratio) => {
        op.opacity = Math.round(138 * (1 - ratio));
      },
    })
    .call(() => { if (node.isValid) node.destroy(); })
    .start();
}

/* ═══════════════════════════════════════════════════════════════
 * 屏幕震动：让目标节点在指定强度和时长内随机偏移，然后恢复
 * ═══════════════════════════════════════════════════════════════ */

export function shakeNode(
  target: Node,
  intensity: number,
  duration: number,
): void {
  const basePos = target.position.clone();
  const startTime = Date.now();
  const endTime = startTime + duration * 1000;

  const tick = () => {
    if (!target.isValid) return;
    const now = Date.now();
    if (now >= endTime) {
      target.setPosition(basePos);
      return;
    }
    const elapsed = (now - startTime) / 1000;
    const decay = 1 - elapsed / duration;
    const dx = (Math.random() - 0.5) * intensity * 2 * decay;
    const dy = (Math.random() - 0.5) * intensity * 2 * decay;
    target.setPosition(basePos.x + dx, basePos.y + dy, basePos.z);
    setTimeout(tick, 16);
  };
  tick();
}

/** 连击档位文案：不同连击数显示不同文字，避免千篇一律 */
const COMBO_TEXTS: { min: number; text: (n: number) => string }[] = [
  { min: 10, text: (n) => `超神连击 x${n}!` },
  { min: 7,  text: (n) => `连击狂潮 x${n}!` },
  { min: 5,  text: (n) => `太棒了! x${n}` },
  { min: 3,  text: (n) => `连击中! x${n}` },
  { min: 2,  text: (n) => `连击 x${n}!` },
];

function getComboText(combo: number): string {
  for (const tier of COMBO_TEXTS) {
    if (combo >= tier.min) return tier.text(combo);
  }
  return `连击 x${combo}!`;
}

/* ═══════════════════════════════════════════════════════════════
 * 连击文字：在指定位置弹出连击提示，放大后上浮淡出
 * ═══════════════════════════════════════════════════════════════ */

export function spawnComboText(
  parent: Node,
  combo: number,
  worldPos: Vec3,
): void {
  if (combo < 2) return;

  const node = new Node('comboText');
  node.layer = parent.layer;
  node.addComponent(UITransform);
  // 世界坐标转父节点本地坐标，否则会跑到屏幕角落
  const localPos = parent.getComponent(UITransform)?.convertToNodeSpaceAR(worldPos) ?? worldPos;
  node.setPosition(localPos);
  parent.addChild(node);

  const label = node.addComponent(Label);
  label.string = getComboText(combo);
  label.fontSize = combo >= 10 ? 56 : combo >= 7 ? 50 : combo >= 5 ? 44 : 36;
  label.isBold = true;
  if (combo >= 10) {
    label.color = new Color(255, 87, 34, 255);
  } else if (combo >= 7) {
    label.color = new Color(255, 152, 0, 255);
  } else if (combo >= 5) {
    label.color = new Color(255, 193, 7, 255);
  } else {
    label.color = new Color(255, 235, 59, 255);
  }
  label.horizontalAlign = Label.HorizontalAlign.CENTER;
  fontManager.applyFont(label);

  node.setScale(0.5, 0.5, 1);
  const op = node.addComponent(UIOpacity);
  op.opacity = 0;

  // 上浮终点在本地坐标系中计算
  const endPos = new Vec3(localPos.x, localPos.y + 60, localPos.z);

  tween(node)
    .to(0.15, { scale: new Vec3(1.35, 1.35, 1) }, {
      easing: 'backOut',
      onUpdate: (_t, ratio) => { op.opacity = Math.round(255 * ratio); },
    })
    .to(0.1, { scale: new Vec3(1, 1, 1) }, { easing: 'sineInOut' })
    .delay(0.4)
    .to(0.45, { position: endPos, scale: new Vec3(0.8, 0.8, 1) }, {
      easing: 'sineOut',
      onUpdate: (_t, ratio) => { op.opacity = Math.round(255 * (1 - ratio)); },
    })
    .call(() => { if (node.isValid) node.destroy(); })
    .start();
}

/* ═══════════════════════════════════════════════════════════════
 * 物品挤压动画：先压扁再弹回（用于母体产出、按钮点击等）
 * ═══════════════════════════════════════════════════════════════ */

export function squashItem(
  node: Node,
  baseScale: number,
  duration = 0.25,
): void {
  if (!node?.isValid) return;
  tween(node)
    .to(duration * 0.4, { scale: new Vec3(baseScale * 1.2, baseScale * 0.7, 1) }, { easing: 'sineIn' })
    .to(duration * 0.6, { scale: new Vec3(baseScale, baseScale, 1) }, { easing: 'backOut' })
    .start();
}

/* ═══════════════════════════════════════════════════════════════
 * 无效操作抖动：左右快速抖动 + 闪红（用于拖到不能合成的格子）
 * ═══════════════════════════════════════════════════════════════ */

export function shakeInvalid(
  node: Node,
  intensity = 6,
  duration = 0.3,
): void {
  if (!node?.isValid) return;
  const baseX = node.position.x;
  const startTime = Date.now();
  const endTime = startTime + duration * 1000;
  const freq = 40; // ms per shake cycle

  const tick = () => {
    if (!node.isValid) return;
    const now = Date.now();
    if (now >= endTime) {
      node.setPosition(baseX, node.position.y, node.position.z);
      return;
    }
    const elapsed = now - startTime;
    const decay = 1 - elapsed / (duration * 1000);
    const cycle = Math.floor(elapsed / freq);
    const dir = cycle % 2 === 0 ? 1 : -1;
    node.setPosition(baseX + dir * intensity * decay, node.position.y, node.position.z);
    setTimeout(tick, 16);
  };
  tick();
}
