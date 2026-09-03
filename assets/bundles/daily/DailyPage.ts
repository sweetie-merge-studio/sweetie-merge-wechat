import { _decorator, Color, Component, Graphics, Label, Node, Sprite, UITransform, Vec3 } from 'cc';

import { GameManager } from '../../scripts/manager/GameManager';
import { addAlignedWidget, showPageToast } from '../../scripts/components/bundle-pages';
import { TapZoneComponent } from '../../scripts/components/tap-zone';
import { loadSpriteFrame, applySpriteFrame } from '../../scripts/components/sprite-loader';
import { UI_COLORS } from '../../scripts/components/ui-factory';
import { LOGIN_REWARDS, allTasksDone } from '../../scripts/core/daily';
import type { DailyTask, LoginReward } from '../../scripts/core/daily';

const { ccclass } = _decorator;

/** 内容区宽度（弹窗 body 宽 660 - 左右各 20 边距 = 620，与商店/图鉴一致） */
const CONTENT_W = 620;

/* ═══ 签到便利贴（抖音小游戏风格：彩色底 + 图钉 + 微旋转，对齐 sweetie-merge-douyin） ═══ */
const STICKER_W = 120;
const STICKER_H = 128;
const STICKER_GAP = 20;
const STICKER_RADIUS = 4;
/** 图钉半径 */
const PIN_R = 7;

/** 7天便利贴底色（对齐抖音端配色） */
const STICKER_COLORS: readonly Color[] = [
  new Color(255, 248, 220, 255), // 第1天 亮黄
  new Color(235, 242, 248, 255), // 第2天 淡蓝
  new Color(248, 235, 238, 255), // 第3天 淡粉
  new Color(235, 248, 240, 255), // 第4天 淡绿
  new Color(248, 245, 232, 255), // 第5天 淡黄
  new Color(240, 235, 248, 255), // 第6天 淡紫
  new Color(238, 248, 228, 255), // 第7天 淡黄绿
];

/** 7天便利贴天数文字颜色（与底色配套） */
const STICKER_DAY_COLORS: readonly Color[] = [
  new Color(139, 95, 20, 255),
  new Color(140, 162, 185, 255),
  new Color(185, 140, 150, 255),
  new Color(140, 175, 145, 255),
  new Color(175, 165, 130, 255),
  new Color(155, 145, 180, 255),
  new Color(155, 175, 130, 255),
];

/** 7天便利贴奖励文字颜色（比天数更浅） */
const STICKER_REWARD_COLORS: readonly Color[] = [
  new Color(139, 95, 20, 200),
  new Color(150, 172, 195, 200),
  new Color(195, 150, 160, 200),
  new Color(150, 185, 155, 200),
  new Color(185, 175, 140, 200),
  new Color(165, 155, 190, 200),
  new Color(165, 185, 140, 200),
];

/** 便利贴轻微旋转角度（模拟真实便利贴的错落感，顺时针为正） */
const STICKER_ANGLES: readonly number[] = [-2, 1.5, -1, 2, -1.5, 1, -2.5];

/** 今日签到格高亮描边（金） */
const TODAY_STROKE = new Color(255, 196, 60, 255);
/** 已签到绿色覆盖 */
const SIGNED_OVERLAY = new Color(126, 191, 108, 200);
/** 图钉颜色（金棕色） */
const PIN_COLOR = new Color(180, 140, 70, 255);
/** 图钉阴影 */
const PIN_SHADOW = new Color(120, 85, 40, 200);
/** 提示文字金色 */
const TIP_GOLD = new Color(196, 154, 60, 255);
/** 药丸标签边框（金色） */
const PILL_BORDER = new Color(212, 162, 78, 255);

/* ═══ 任务行 ═══ */
const TASK_H = 80;
const TASK_GAP = 8;
const TASK_RADIUS = 14;

/** 进度条尺寸 */
const BAR_W = 72;
const BAR_H = 11;
const BAR_BG = new Color(220, 210, 190, 255);
const BAR_FG = new Color(126, 191, 108, 255);

/** 领取按钮 */
const BTN_W = 92;
const BTN_H = 44;
const BTN_RADIUS = 22;
const BTN_CLAIM = new Color(232, 168, 62, 255);
const BTN_CLAIM_TOP = new Color(245, 190, 80, 255);

/** 金币图标尺寸 */
const COIN_SIZE = 20;

/** 任务行纯白背景 */
const TASK_BG = new Color(255, 255, 255, 255);

/**
 * 每日小任务弹窗（daily 分包）：抖音便利贴风格签到 + 进度条任务 + 全勤宝箱。
 *
 * 以弹窗 body 形式挂载，签到样式对齐抖音小游戏每日任务弹窗。
 */
@ccclass('DailyPageComponent')
export class DailyPageComponent extends Component {
  private _content: Node | null = null;
  private readonly _onChanged = (): void => this._render();

  protected onLoad(): void {
    GameManager.instance.events.on('daily:changed', this._onChanged);

    const content = new Node('content');
    content.layer = this.node.layer;
    content.addComponent(UITransform).setContentSize(CONTENT_W, 750);
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
    y -= 26;
    this._buildSubtitle(content, y);
    y -= 16;
    y = this._buildSignIn(content, y);
    y -= 16;
    y = this._buildTasks(content, y, gm.daily.tasks);
    y -= 10;
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

  // ── 连续签到（抖音便利贴风格） ──

  private _buildSignIn(parent: Node, top: number): number {
    const gm = GameManager.instance;
    const todayDay = gm.daily.streak === 0 ? 1 : gm.daily.streak;

    // 标题行："连续签到" + "第X天"药丸标签
    const titleY = top - 18;
    this._buildLabel(parent, '连续签到', 22, new Vec3(-CONTENT_W / 2 + 4, titleY, 0), {
      bold: true, anchorLeft: true, width: 120,
    });
    const pillText = `第 ${todayDay} 天`;
    const pillW = pillText.length * 16 + 28;
    this._buildDayPill(parent, pillText, -CONTENT_W / 2 + 4 + 100 + pillW / 2, titleY, pillW);

    // 提示文字（金色，对齐抖音端）
    const tipY = top - 50;
    this._buildLabel(parent, '点今天的便利贴签到呀', 18, new Vec3(0, tipY, 0), {
      color: TIP_GOLD, width: CONTENT_W,
    });

    // 7天便利贴网格：第一行4个，第二行3个居中
    const row1Y = tipY - 28 - STICKER_H / 2;
    const row2Y = row1Y - STICKER_H - STICKER_GAP;

    const row1Count = 4;
    const row1TotalW = row1Count * STICKER_W + (row1Count - 1) * STICKER_GAP;
    const row1StartX = -row1TotalW / 2 + STICKER_W / 2;
    for (let i = 0; i < row1Count; i++) {
      this._buildSticker(parent, row1StartX + i * (STICKER_W + STICKER_GAP), row1Y, i, todayDay, gm);
    }

    const row2Count = 3;
    const row2TotalW = row2Count * STICKER_W + (row2Count - 1) * STICKER_GAP;
    const row2StartX = -row2TotalW / 2 + STICKER_W / 2;
    for (let i = 0; i < row2Count; i++) {
      const dayIdx = row1Count + i;
      this._buildSticker(parent, row2StartX + i * (STICKER_W + STICKER_GAP), row2Y, dayIdx, todayDay, gm);
    }

    return row2Y - STICKER_H / 2;
  }

  /** 构建"第N天"药丸标签（奶油底 + 金色边框 + 棕色文字） */
  private _buildDayPill(parent: Node, text: string, x: number, y: number, width: number): void {
    const pill = new Node('dayPill');
    pill.layer = parent.layer;
    pill.addComponent(UITransform).setContentSize(width, 30);
    pill.setPosition(new Vec3(x, y, 0));
    parent.addChild(pill);

    const g = pill.addComponent(Graphics);
    g.fillColor = new Color(255, 248, 238, 255);
    g.roundRect(-width / 2, -15, width, 30, 15);
    g.fill();
    g.lineWidth = 2;
    g.strokeColor = PILL_BORDER;
    g.roundRect(-width / 2, -15, width, 30, 15);
    g.stroke();

    this._buildLabel(pill, text, 17, new Vec3(0, 0, 0), {
      bold: true, color: UI_COLORS.textBrown, width: width - 12,
    });
  }

  /** 构建一个便利贴签到格（带图钉、微旋转、多色底、分色文字、奖励图标） */
  private _buildSticker(
    parent: Node,
    x: number,
    y: number,
    idx: number,
    todayDay: number,
    gm: GameManager,
  ): void {
    const reward = LOGIN_REWARDS[idx];
    const day = reward.day;
    const isToday = day === todayDay;
    const signed = day < todayDay || (isToday && gm.daily.signedIn);
    const canSign = isToday && !gm.daily.signedIn;

    const sticker = new Node(`sticker_${day}`);
    sticker.layer = parent.layer;
    sticker.addComponent(UITransform).setContentSize(STICKER_W, STICKER_H);
    sticker.setPosition(new Vec3(x, y, 0));
    sticker.angle = STICKER_ANGLES[idx % STICKER_ANGLES.length];
    parent.addChild(sticker);

    const g = sticker.addComponent(Graphics);

    // 彩色底色
    g.fillColor = STICKER_COLORS[idx % STICKER_COLORS.length];
    g.roundRect(-STICKER_W / 2, -STICKER_H / 2, STICKER_W, STICKER_H, STICKER_RADIUS);
    g.fill();

    // 今日可签：金色高亮描边
    if (canSign) {
      g.lineWidth = 3;
      g.strokeColor = TODAY_STROKE;
      g.roundRect(-STICKER_W / 2, -STICKER_H / 2, STICKER_W, STICKER_H, STICKER_RADIUS);
      g.stroke();
    }

    // 已签到：绿色半透明覆盖
    if (signed) {
      g.fillColor = SIGNED_OVERLAY;
      g.roundRect(-STICKER_W / 2, -STICKER_H / 2, STICKER_W, STICKER_H, STICKER_RADIUS);
      g.fill();
    }

    // 图钉（金棕色 + 阴影 + 高光）
    const pinY = STICKER_H / 2 - 10;
    g.fillColor = PIN_SHADOW;
    g.circle(1, pinY - 1.5, PIN_R);
    g.fill();
    g.fillColor = PIN_COLOR;
    g.circle(0, pinY, PIN_R);
    g.fill();
    g.fillColor = new Color(255, 230, 180, 180);
    g.circle(-2, pinY + 1.5, PIN_R * 0.4);
    g.fill();

    // 第X天
    this._buildLabel(sticker, `第${day}天`, 18, new Vec3(0, STICKER_H / 2 - 32, 0), {
      bold: true,
      color: signed ? new Color(255, 255, 255, 255) : STICKER_DAY_COLORS[idx % STICKER_DAY_COLORS.length],
      width: STICKER_W - 10,
    });

    if (signed) {
      // 已签到：白色大对勾
      this._buildLabel(sticker, '✓', 36, new Vec3(0, -4, 0), {
        bold: true,
        color: new Color(255, 255, 255, 255),
      });
    } else {
      // 未签到：奖励图标 + 奖励文字
      const iconPath = this._rewardIconPath(reward);
      const iconNode = new Node('rewardIcon');
      iconNode.layer = sticker.layer;
      iconNode.addComponent(UITransform).setContentSize(32, 32);
      iconNode.setPosition(new Vec3(0, 2, 0));
      sticker.addChild(iconNode);
      const sprite = iconNode.addComponent(Sprite);
      sprite.sizeMode = Sprite.SizeMode.CUSTOM;
      loadSpriteFrame(iconPath, sf => {
        if (sf && sprite.isValid) applySpriteFrame(sprite, sf);
      });

      this._buildLabel(sticker, reward.label, 12, new Vec3(0, -26, 0), {
        color: STICKER_REWARD_COLORS[idx % STICKER_REWARD_COLORS.length],
        width: STICKER_W - 12,
      });
    }

    // 今日未签到：点击整个便利贴签到
    if (canSign) {
      sticker.addComponent(TapZoneComponent).onTap = () => {
        const r = gm.signInDaily();
        if (r) showPageToast(this.node, `签到成功，获得 ${r.label}`);
      };
    }
  }

  /** 根据奖励类型返回图标路径 */
  private _rewardIconPath(reward: LoginReward): string {
    if (reward.unlockItem) return 'sprites/items/cake/cake_4';
    if (reward.energy) return 'sprites/ui/energy_bolt';
    return 'sprites/currency/coin';
  }

  // ── 每日小任务 ──

  private _buildTasks(parent: Node, top: number, tasks: readonly DailyTask[]): number {
    this._buildLabel(parent, '每日小任务', 23, new Vec3(-CONTENT_W / 2 + 8, top - 14, 0), {
      bold: true, anchorLeft: true, width: 200,
    });

    let y = top - 34;
    tasks.forEach(task => {
      const row = new Node(`task_${task.id}`);
      row.layer = parent.layer;
      row.addComponent(UITransform).setContentSize(CONTENT_W, TASK_H);
      row.setPosition(new Vec3(0, y - TASK_H / 2, 0));
      parent.addChild(row);

      const g = row.addComponent(Graphics);
      g.fillColor = TASK_BG;
      g.roundRect(-CONTENT_W / 2, -TASK_H / 2, CONTENT_W, TASK_H, TASK_RADIUS);
      g.fill();

      const done = task.current >= task.target;
      const claimable = done && !task.claimed;
      const textX = -CONTENT_W / 2 + 22;

      // 任务名
      this._buildLabel(row, task.label, 22, new Vec3(textX, 14, 0), {
        bold: true, anchorLeft: true, width: CONTENT_W - BTN_W - 80,
      });

      // 金币图标 + 奖励
      this._buildCoinIcon(row, new Vec3(textX + 4, -14, 0));
      this._buildLabel(row, `${task.rewardCoins} 金币`, 16, new Vec3(textX + 4 + COIN_SIZE + 5, -14, 0), {
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
    g.fillColor = TASK_BG;
    g.roundRect(-CONTENT_W / 2, -TASK_H / 2, CONTENT_W, TASK_H, TASK_RADIUS);
    g.fill();

    const textX = -CONTENT_W / 2 + 22;
    this._buildLabel(row, '全勤小宝箱', 22, new Vec3(textX, 14, 0), {
      bold: true, anchorLeft: true, width: 260,
    });
    this._buildCoinIcon(row, new Vec3(textX + 4, -14, 0));
    this._buildLabel(row, '200 金币', 16, new Vec3(textX + 4 + COIN_SIZE + 5, -14, 0), {
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

    this._buildLabel(btn, text, 19, new Vec3(0, 0, 0), {
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
