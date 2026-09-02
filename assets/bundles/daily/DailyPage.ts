import { _decorator, Color, Component, Graphics, Label, Node, Sprite, UITransform, Vec3 } from 'cc';

import { GameManager } from '../../scripts/manager/GameManager';
import { addAlignedWidget, showPageToast } from '../../scripts/components/bundle-pages';
import { TapZoneComponent } from '../../scripts/components/tap-zone';
import { loadSpriteFrame, applySpriteFrame } from '../../scripts/components/sprite-loader';
import { UI_COLORS } from '../../scripts/components/ui-factory';
import { LOGIN_REWARDS, allTasksDone } from '../../scripts/core/daily';
import type { DailyTask } from '../../scripts/core/daily';

const { ccclass } = _decorator;

/** 内容区宽度（弹窗 body 宽 660 - 左右各 20 边距 = 620，与商店/图鉴一致） */
const CONTENT_W = 620;

/* ═══ 签到便利贴 ═══ */
const STICKY_W = 124;
const STICKY_H = 96;
const STICKY_GAP = 14;
/** 图钉直径 */
const PIN_SIZE = 22;
/** 便利贴圆角 */
const STICKY_RADIUS = 10;

/** 便利贴底色（未签到时，按天依次，半透明模拟便签纸感） */
const STICKY_COLORS: readonly Color[] = [
  new Color(210, 226, 244, 210), // D1 浅蓝
  new Color(244, 218, 230, 210), // D2 浅粉
  new Color(214, 236, 214, 210), // D3 浅绿
  new Color(238, 232, 214, 210), // D4 米白
  new Color(226, 218, 242, 210), // D5 浅紫
  new Color(208, 234, 218, 210), // D6 浅绿
  new Color(210, 226, 244, 210), // D7 浅蓝
];
/** 已签到底色（绿） */
const SIGNED_BG = new Color(126, 191, 108, 255);
/** 今日未签到高亮描边（橙） */
const TODAY_STROKE = new Color(232, 150, 40, 255);
/** 图钉色 */
const PIN_COLOR = new Color(196, 156, 96, 255);
const PIN_HIGHLIGHT = new Color(245, 224, 180, 255);
const PIN_SHADOW = new Color(140, 100, 60, 100);

/* ═══ 任务行 ═══ */
const TASK_H = 84;
const TASK_GAP = 10;
const TASK_RADIUS = 14;

/** 进度条尺寸 */
const BAR_W = 84;
const BAR_H = 12;
const BAR_BG = new Color(220, 210, 190, 255);
const BAR_FG = new Color(126, 191, 108, 255);

/** 领取按钮 */
const BTN_W = 96;
const BTN_H = 46;
const BTN_RADIUS = 23;
const BTN_CLAIM = new Color(232, 168, 62, 255);
const BTN_CLAIM_TOP = new Color(245, 190, 80, 255);

/** 金币图标尺寸 */
const COIN_SIZE = 26;

/**
 * 每日小任务弹窗（daily 分包）：便利贴签到 + 进度条任务 + 全勤宝箱。
 *
 * 以弹窗 body 形式挂载，样式对齐抖音小游戏每日任务弹窗。
 */
@ccclass('DailyPageComponent')
export class DailyPageComponent extends Component {
  private _content: Node | null = null;
  private readonly _onChanged = (): void => this._render();

  protected onLoad(): void {
    GameManager.instance.events.on('daily:changed', this._onChanged);

    const content = new Node('content');
    content.layer = this.node.layer;
    content.addComponent(UITransform).setContentSize(CONTENT_W, 800);
    this.node.addChild(content);
    addAlignedWidget(content, { isAlignTop: true, top: 8 });
    this._content = content;

    this._render();
  }

  protected onDestroy(): void {
    GameManager.instance.events.off('daily:changed', this._onChanged);
  }

  private _render(): void {
    const content = this._content;
    if (!content || !content.isValid) return;
    content.removeAllChildren();

    const gm = GameManager.instance;
    const top = (content.getComponent(UITransform)?.height ?? 0) / 2;

    let y = top;
    // 副标题气泡（buildModalShell 的 subtitle 走 RichText 有兼容问题，这里用普通 Label 画）
    y -= 28;
    this._buildSubtitle(content, y);
    y -= 20;
    y = this._buildSignIn(content, y);
    y -= 20;
    y = this._buildTasks(content, y, gm.daily.tasks);
    y -= 12;
    this._buildChest(content, y);
  }

  /** 副标题气泡："做完任务有甜甜的奖励哦" */
  private _buildSubtitle(parent: Node, y: number): void {
    const w = 400;
    const h = 36;
    const node = new Node('subtitle');
    node.layer = parent.layer;
    node.addComponent(UITransform).setContentSize(w, h);
    node.setPosition(new Vec3(0, y, 0));
    parent.addChild(node);

    const g = node.addComponent(Graphics);
    g.fillColor = new Color(255, 248, 238, 255);
    g.roundRect(-w / 2, -h / 2, w, h, h / 2);
    g.fill();
    // 完整虚线描边（上下直线 + 左右半圆）
    g.lineWidth = 2;
    g.strokeColor = new Color(212, 184, 150, 255);
    this._drawDashedCapsule(g, w, h, 7, 4);
    g.stroke();

    this._buildLabel(node, '做完任务有甜甜的奖励哦', 18, new Vec3(0, 0, 0), {
      color: new Color(139, 107, 74, 255), width: w - 24,
    });
  }

  /** 画虚线胶囊形描边（参数化遍历周长，按 dash/gap 模式画线段） */
  private _drawDashedCapsule(g: Graphics, w: number, h: number, dash: number, gap: number): void {
    const r = h / 2;
    const straight = w - 2 * r;
    const halfCircle = Math.PI * r;
    const perimeter = 2 * straight + 2 * halfCircle;

    // 周长参数 t → 坐标 (x, y)
    const pointAt = (t: number): [number, number] => {
      if (t < straight) {
        return [-w / 2 + r + t, h / 2]; // 上边
      }
      t -= straight;
      if (t < halfCircle) {
        const a = Math.PI / 2 - t / r; // 右半圆，从 π/2 到 -π/2
        return [w / 2 - r + r * Math.cos(a), r * Math.sin(a)];
      }
      t -= halfCircle;
      if (t < straight) {
        return [w / 2 - r - t, -h / 2]; // 下边
      }
      t -= straight;
      const a = -Math.PI / 2 - t / r; // 左半圆，从 -π/2 到 -3π/2
      return [-w / 2 + r + r * Math.cos(a), r * Math.sin(a)];
    };

    const period = dash + gap;
    for (let start = 0; start < perimeter; start += period) {
      const end = Math.min(start + dash, perimeter);
      // 每段虚线用多段小直线近似（圆弧部分）
      const steps = Math.max(2, Math.ceil((end - start) / 3));
      const [sx, sy] = pointAt(start);
      g.moveTo(sx, sy);
      for (let i = 1; i <= steps; i++) {
        const t = start + (end - start) * (i / steps);
        const [px, py] = pointAt(t);
        g.lineTo(px, py);
      }
    }
  }

  // ── 连续签到（便利贴） ──

  private _buildSignIn(parent: Node, top: number): number {
    const gm = GameManager.instance;
    const todayDay = gm.daily.streak === 0 ? 1 : gm.daily.streak;

    // 标题行："连续签到" + "第X天"标签
    const titleH = 36;
    this._buildLabel(parent, '连续签到', 24, new Vec3(-CONTENT_W / 2 + 8, top - titleH / 2, 0), {
      bold: true, anchorLeft: true, width: 160,
    });
    // "第X天"圆角标签
    const tagW = 84;
    const tag = new Node('dayTag');
    tag.layer = parent.layer;
    tag.addComponent(UITransform).setContentSize(tagW, 32);
    tag.setPosition(new Vec3(-CONTENT_W / 2 + 8 + 160 + tagW / 2 + 8, top - titleH / 2, 0));
    parent.addChild(tag);
    const tg = tag.addComponent(Graphics);
    tg.fillColor = new Color(255, 248, 238, 255);
    tg.roundRect(-tagW / 2, -16, tagW, 32, 16);
    tg.fill();
    tg.lineWidth = 2;
    tg.strokeColor = new Color(212, 184, 150, 255);
    tg.roundRect(-tagW / 2, -16, tagW, 32, 16);
    tg.stroke();
    this._buildLabel(tag, `第 ${todayDay} 天`, 18, new Vec3(0, 0, 0), {
      bold: true, color: new Color(139, 99, 64, 255), width: tagW - 8,
    });
    let y = top - titleH;

    // 提示文字
    y -= 26;
    this._buildLabel(parent, '点今天的便利贴签到呀', 18, new Vec3(0, y, 0), {
      color: new Color(212, 148, 26, 255), width: 300,
    });
    y -= 14;

    // 便利贴：第一行 4 个，第二行 3 个居中
    const row1Y = y - STICKY_H / 2;
    const row2Y = row1Y - STICKY_H - STICKY_GAP;
    const row1StartX = -CONTENT_W / 2 + STICKY_W / 2;
    const row2TotalW = 3 * STICKY_W + 2 * STICKY_GAP;
    const row2StartX = -row2TotalW / 2 + STICKY_W / 2;

    LOGIN_REWARDS.forEach((reward, i) => {
      const isRow1 = i < 4;
      const col = isRow1 ? i : i - 4;
      const startX = isRow1 ? row1StartX : row2StartX;
      const posY = isRow1 ? row1Y : row2Y;
      const posX = startX + col * (STICKY_W + STICKY_GAP);

      this._buildSticky(parent, new Vec3(posX, posY, 0), reward, todayDay, gm.daily.signedIn);
    });

    return row2Y - STICKY_H / 2;
  }

  /** 构建一个便利贴 */
  private _buildSticky(
    parent: Node,
    pos: Vec3,
    reward: { day: number; label: string },
    todayDay: number,
    signedIn: boolean,
  ): void {
    const cell = new Node(`sticky_${reward.day}`);
    cell.layer = parent.layer;
    cell.addComponent(UITransform).setContentSize(STICKY_W, STICKY_H);
    cell.setPosition(pos);
    // 便利贴错落旋转，模拟真实便签感
    const rotations = [-2.5, 2, -1.5, 2.5, 1.5, -2, 1];
    cell.angle = rotations[(reward.day - 1) % rotations.length];
    parent.addChild(cell);

    const isToday = reward.day === todayDay;
    const isPast = reward.day < todayDay;
    const signed = isPast || (isToday && signedIn);
    const isTodayUnsigned = isToday && !signedIn;

    const g = cell.addComponent(Graphics);
    // 底色
    g.fillColor = signed ? SIGNED_BG : STICKY_COLORS[(reward.day - 1) % STICKY_COLORS.length];
    g.roundRect(-STICKY_W / 2, -STICKY_H / 2, STICKY_W, STICKY_H, STICKY_RADIUS);
    g.fill();
    // 今日未签到：金色描边高亮
    if (isTodayUnsigned) {
      g.lineWidth = 3.5;
      g.strokeColor = TODAY_STROKE;
      g.roundRect(-STICKY_W / 2, -STICKY_H / 2, STICKY_W, STICKY_H, STICKY_RADIUS);
      g.stroke();
    }

    // 图钉（顶部中央，带阴影和高光）
    const pinY = STICKY_H / 2 - 2;
    g.fillColor = PIN_SHADOW;
    g.circle(1, pinY - 2, PIN_SIZE / 2);
    g.fill();
    g.fillColor = PIN_COLOR;
    g.circle(0, pinY, PIN_SIZE / 2);
    g.fill();
    g.fillColor = PIN_HIGHLIGHT;
    g.circle(-3, pinY + 3, PIN_SIZE / 3.5);
    g.fill();

    if (signed) {
      // 已签到：白色对勾
      this._buildLabel(cell, '✓', 40, new Vec3(0, -2, 0), {
        bold: true, color: new Color(255, 255, 255, 255), width: 56,
      });
      this._buildLabel(cell, `第${reward.day}天`, 15, new Vec3(0, -STICKY_H / 2 + 16, 0), {
        color: new Color(255, 255, 255, 220), width: STICKY_W - 10,
      });
    } else {
      // 未签到：第X天 + 奖励
      this._buildLabel(cell, `第${reward.day}天`, 19, new Vec3(0, STICKY_H / 2 - 30, 0), {
        bold: true,
        color: isTodayUnsigned ? new Color(190, 96, 16, 255) : new Color(111, 74, 57, 200),
        width: STICKY_W - 10,
      });
      this._buildLabel(cell, reward.label, 14, new Vec3(0, -8, 0), {
        color: new Color(111, 74, 57, 180), width: STICKY_W - 12,
      });
    }

    // 今日未签到可点击签到
    if (isTodayUnsigned) {
      cell.addComponent(TapZoneComponent).onTap = () => {
        const r = GameManager.instance.signInDaily();
        if (r) showPageToast(this.node, `签到成功，获得 ${r.label}`);
      };
    }
  }

  // ── 每日小任务 ──

  private _buildTasks(parent: Node, top: number, tasks: readonly DailyTask[]): number {
    this._buildLabel(parent, '每日小任务', 23, new Vec3(-CONTENT_W / 2 + 8, top - 16, 0), {
      bold: true, anchorLeft: true, width: 200,
    });

    let y = top - 38;
    tasks.forEach(task => {
      const row = new Node(`task_${task.id}`);
      row.layer = parent.layer;
      row.addComponent(UITransform).setContentSize(CONTENT_W, TASK_H);
      row.setPosition(new Vec3(0, y - TASK_H / 2, 0));
      parent.addChild(row);

      const g = row.addComponent(Graphics);
      g.fillColor = UI_COLORS.cellLight;
      g.roundRect(-CONTENT_W / 2, -TASK_H / 2, CONTENT_W, TASK_H, TASK_RADIUS);
      g.fill();

      const done = task.current >= task.target;
      const claimable = done && !task.claimed;
      const textX = -CONTENT_W / 2 + 22;

      // 任务名
      this._buildLabel(row, task.label, 23, new Vec3(textX, 15, 0), {
        bold: true, anchorLeft: true, width: CONTENT_W - BTN_W - 80,
      });

      // 金币图标 + 奖励
      this._buildCoinIcon(row, new Vec3(textX + 6, -15, 0));
      this._buildLabel(row, `${task.rewardCoins} 金币`, 17, new Vec3(textX + 6 + COIN_SIZE + 5, -15, 0), {
        anchorLeft: true, color: new Color(180, 130, 40, 255), width: 120,
      });

      if (claimable) {
        // 可领取：橙色按钮
        this._buildClaimButton(row, new Vec3(CONTENT_W / 2 - BTN_W / 2 - 18, 0, 0), '领取', () => {
          const coins = GameManager.instance.claimDailyTask(task.id);
          if (coins != null) showPageToast(this.node, `领取成功 +${coins} 金币`);
        });
      } else if (task.claimed) {
        // 已领取：灰色文字
        this._buildLabel(row, '已领取', 19, new Vec3(CONTENT_W / 2 - 55, 0, 0), {
          color: new Color(160, 140, 120, 255), width: 100,
        });
      } else {
        // 未完成：进度条 + 进度数字（整体右对齐，避免数字溢出）
        const numW = 52;
        const numCenterX = CONTENT_W / 2 - 16 - numW / 2;
        const barX = numCenterX - numW / 2 - 10 - BAR_W / 2;
        this._buildProgressBar(row, new Vec3(barX, 0, 0), task.current, task.target);
        this._buildLabel(row, `${task.current}/${task.target}`, 17, new Vec3(numCenterX, 0, 0), {
          color: new Color(139, 99, 64, 255), width: numW,
        });
      }

      y -= TASK_H + TASK_GAP;
    });

    return y;
  }

  // ── 全勤小宝箱 ──

  private _buildChest(parent: Node, top: number): void {
    const gm = GameManager.instance;
    const row = new Node('chest');
    row.layer = parent.layer;
    row.addComponent(UITransform).setContentSize(CONTENT_W, TASK_H);
    row.setPosition(new Vec3(0, top - TASK_H / 2, 0));
    parent.addChild(row);

    const g = row.addComponent(Graphics);
    g.fillColor = UI_COLORS.cellLight;
    g.roundRect(-CONTENT_W / 2, -TASK_H / 2, CONTENT_W, TASK_H, TASK_RADIUS);
    g.fill();

    const textX = -CONTENT_W / 2 + 22;
    this._buildLabel(row, '全勤小宝箱', 23, new Vec3(textX, 15, 0), {
      bold: true, anchorLeft: true, width: 260,
    });
    this._buildCoinIcon(row, new Vec3(textX + 6, -15, 0));
    this._buildLabel(row, '200 金币', 17, new Vec3(textX + 6 + COIN_SIZE + 5, -15, 0), {
      anchorLeft: true, color: new Color(180, 130, 40, 255), width: 120,
    });

    const allClaimed = gm.daily.tasks.every(t => t.claimed);
    const claimable = allTasksDone(gm.daily) && allClaimed && !gm.daily.tasksClaimed;

    if (gm.daily.tasksClaimed) {
      this._buildLabel(row, '已领取', 19, new Vec3(CONTENT_W / 2 - 55, 0, 0), {
        color: new Color(160, 140, 120, 255), width: 100,
      });
    } else if (claimable) {
      this._buildClaimButton(row, new Vec3(CONTENT_W / 2 - BTN_W / 2 - 18, 0, 0), '领取', () => {
        const coins = GameManager.instance.claimDailyChest();
        if (coins != null) showPageToast(this.node, `宝箱开启 +${coins} 金币`);
      });
    } else {
      this._buildLabel(row, '未完成', 19, new Vec3(CONTENT_W / 2 - 55, 0, 0), {
        color: new Color(160, 140, 120, 255), width: 100,
      });
    }
  }

  // ── 通用构件 ──

  /** 进度条 */
  private _buildProgressBar(parent: Node, pos: Vec3, current: number, target: number): void {
    const bar = new Node('progressBar');
    bar.layer = parent.layer;
    bar.addComponent(UITransform).setContentSize(BAR_W, BAR_H);
    bar.setPosition(pos);
    parent.addChild(bar);

    const g = bar.addComponent(Graphics);
    // 背景
    g.fillColor = BAR_BG;
    g.roundRect(-BAR_W / 2, -BAR_H / 2, BAR_W, BAR_H, BAR_H / 2);
    g.fill();
    // 进度
    const ratio = Math.min(current / target, 1);
    if (ratio > 0) {
      const fillW = (BAR_W - 4) * ratio;
      g.fillColor = BAR_FG;
      g.roundRect(-BAR_W / 2 + 2, -BAR_H / 2 + 2, fillW, BAR_H - 4, (BAR_H - 4) / 2);
      g.fill();
    }
  }

  /** 橙色领取按钮 */
  private _buildClaimButton(parent: Node, pos: Vec3, text: string, onTap: () => void): void {
    const btn = new Node('button');
    btn.layer = parent.layer;
    btn.addComponent(UITransform).setContentSize(BTN_W, BTN_H);
    btn.setPosition(pos);
    parent.addChild(btn);

    const g = btn.addComponent(Graphics);
    // 底部阴影
    g.fillColor = new Color(200, 130, 30, 60);
    g.roundRect(-BTN_W / 2, -BTN_H / 2 - 3, BTN_W, BTN_H, BTN_RADIUS);
    g.fill();
    // 主色
    g.fillColor = BTN_CLAIM;
    g.roundRect(-BTN_W / 2, -BTN_H / 2, BTN_W, BTN_H, BTN_RADIUS);
    g.fill();
    // 顶部高光
    g.fillColor = BTN_CLAIM_TOP;
    g.roundRect(-BTN_W / 2 + 2, 0, BTN_W - 4, BTN_H / 2 - 2, BTN_RADIUS / 2);
    g.fill();

    this._buildLabel(btn, text, 20, new Vec3(0, 0, 0), {
      bold: true, color: new Color(255, 255, 255, 255), width: BTN_W - 8,
    });

    btn.addComponent(TapZoneComponent).onTap = onTap;
  }

  /** 金币图标 */
  private _buildCoinIcon(parent: Node, pos: Vec3): void {
    const node = new Node('coinIcon');
    node.layer = parent.layer;
    node.addComponent(UITransform).setContentSize(COIN_SIZE, COIN_SIZE);
    node.setPosition(pos);
    parent.addChild(node);
    const sprite = node.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    loadSpriteFrame('sprites/currency/coin_single', sf => {
      if (sf && sprite.isValid) applySpriteFrame(sprite, sf);
    });
  }

  private _buildLabel(
    parent: Node,
    text: string,
    fontSize: number,
    pos: Vec3,
    opts: { bold?: boolean; color?: Color; anchorLeft?: boolean; width?: number } = {},
  ): void {
    const node = new Node('label');
    node.layer = parent.layer;
    const ui = node.addComponent(UITransform);
    if (opts.width) ui.setContentSize(opts.width, fontSize * 1.6);
    if (opts.anchorLeft) ui.setAnchorPoint(0, 0.5);
    node.setPosition(pos);
    parent.addChild(node);

    const label = node.addComponent(Label);
    label.string = text;
    label.fontSize = fontSize;
    label.lineHeight = fontSize * 1.3;
    label.isBold = opts.bold ?? false;
    label.color = opts.color ?? UI_COLORS.textBrown;
    label.overflow = Label.Overflow.SHRINK;
    if (opts.anchorLeft) label.horizontalAlign = Label.HorizontalAlign.LEFT;
  }
}
