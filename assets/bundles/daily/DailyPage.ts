import { _decorator, Color, Component, Graphics, Label, Node, UITransform, Vec3 } from 'cc';

import { GameManager } from '../../scripts/manager/GameManager';
import { addAlignedWidget, createPageChrome, showPageToast } from '../../scripts/components/bundle-pages';
import { TapZoneComponent } from '../../scripts/components/tap-zone';
import { UI_COLORS } from '../../scripts/components/ui-factory';
import { LOGIN_REWARDS, allTasksDone } from '../../scripts/core/daily';
import type { DailyTask } from '../../scripts/core/daily';

const { ccclass } = _decorator;

const PAGE_W = 720;
/** 内容区左右边距 */
const MARGIN = 40;
const CONTENT_W = PAGE_W - MARGIN * 2;

/** 签到格 */
const SIGN_CELL = 88;
const SIGN_GAP = 6;

/** 任务行 */
const TASK_H = 96;
const TASK_GAP = 12;

/** 领取按钮 */
const BTN_W = 132;
const BTN_H = 56;

/** 已领取 / 不可领的暗色 */
const DIM_BG = new Color(180, 160, 140, 255);
/** 可领取的绿色（对齐 Web 版领取按钮） */
const CLAIM_BG = new Color(126, 191, 108, 255);
/** 今日签到格高亮 */
const TODAY_STROKE = new Color(255, 196, 60, 255);
/** 已签到格底色 */
const SIGNED_BG = new Color(126, 191, 108, 200);
/** 未签到格底色 */
const UNSIGNED_BG = new Color(96, 66, 46, 90);

/**
 * 每日页（daily 分包）：连续登录签到 + 三个每日任务 + 全完成宝箱。
 *
 * 与 Web 版 DailyReward.vue 同构：签到按 7 天循环，任务先逐个领取，
 * 三个都领完后宝箱才可领。
 */
@ccclass('DailyPageComponent')
export class DailyPageComponent extends Component {
  private _content: Node | null = null;
  private readonly _onChanged = (): void => this._render();

  protected onLoad(): void {
    createPageChrome(this.node, '每日');

    GameManager.instance.events.on('daily:changed', this._onChanged);

    const content = new Node('content');
    content.layer = this.node.layer;
    content.addComponent(UITransform).setContentSize(CONTENT_W, 900);
    this.node.addChild(content);
    addAlignedWidget(content, { isAlignTop: true, top: 240 });
    this._content = content;

    this._render();
  }

  protected onDestroy(): void {
    // GameManager 是常驻单例，页面销毁必须退订
    GameManager.instance.events.off('daily:changed', this._onChanged);
  }

  private _render(): void {
    const content = this._content;
    if (!content || !content.isValid) return;
    content.removeAllChildren();

    const gm = GameManager.instance;
    const top = (content.getComponent(UITransform)?.height ?? 0) / 2;

    let y = top;
    y = this._buildSignIn(content, y);
    y -= 40;
    y = this._buildTasks(content, y, gm.daily.tasks);
    y -= 24;
    this._buildChest(content, y);
  }

  // --- 连续登录 ---

  /** @returns 下一块内容的起始 y */
  private _buildSignIn(parent: Node, top: number): number {
    const gm = GameManager.instance;
    // streak 为 0 表示今天还没签到过（断签或首次），今日即第 1 天
    const todayDay = gm.daily.streak === 0 ? 1 : gm.daily.streak;

    this._buildSectionTitle(parent, top, `连续登录 第 ${todayDay} 天`);
    const rowY = top - 56 - SIGN_CELL / 2;
    const startX = -CONTENT_W / 2 + SIGN_CELL / 2;

    LOGIN_REWARDS.forEach((reward, i) => {
      // 7 格铺满内容宽度
      const step = (CONTENT_W - SIGN_CELL) / (LOGIN_REWARDS.length - 1);
      const cell = new Node(`sign_${reward.day}`);
      cell.layer = parent.layer;
      cell.addComponent(UITransform).setContentSize(SIGN_CELL, SIGN_CELL);
      cell.setPosition(new Vec3(startX + i * step, rowY, 0));
      parent.addChild(cell);

      // 已过去的天数算已签，今天当且仅当 signedIn
      const isToday = reward.day === todayDay;
      const signed = reward.day < todayDay || (isToday && gm.daily.signedIn);

      const g = cell.addComponent(Graphics);
      g.fillColor = signed ? SIGNED_BG : UNSIGNED_BG;
      g.roundRect(-SIGN_CELL / 2, -SIGN_CELL / 2, SIGN_CELL, SIGN_CELL, 12);
      g.fill();
      if (isToday && !gm.daily.signedIn) {
        g.lineWidth = 4;
        g.strokeColor = TODAY_STROKE;
        g.roundRect(-SIGN_CELL / 2, -SIGN_CELL / 2, SIGN_CELL, SIGN_CELL, 12);
        g.stroke();
      }

      this._buildLabel(cell, `D${reward.day}`, 20, new Vec3(0, SIGN_CELL / 2 - 18, 0), {
        bold: true,
        color: signed ? UI_COLORS.textBrown : new Color(255, 248, 238, 200),
      });
      this._buildLabel(cell, signed ? '已领' : reward.label, 15, new Vec3(0, -8, 0), {
        color: signed ? UI_COLORS.textBrown : new Color(255, 248, 238, 190),
        width: SIGN_CELL - 10,
      });
    });

    // 签到按钮
    const btnY = rowY - SIGN_CELL / 2 - 20 - BTN_H / 2;
    const canSign = !gm.daily.signedIn;
    this._buildButton(parent, new Vec3(0, btnY, 0), canSign ? '签到' : '今日已签到', canSign, () => {
      const reward = gm.signInDaily();
      if (reward) showPageToast(this.node, `签到成功，获得 ${reward.label}`);
    });

    return btnY - BTN_H / 2;
  }

  // --- 每日任务 ---

  private _buildTasks(parent: Node, top: number, tasks: readonly DailyTask[]): number {
    this._buildSectionTitle(parent, top, '每日任务');

    let y = top - 56;
    tasks.forEach(task => {
      const row = new Node(`task_${task.id}`);
      row.layer = parent.layer;
      row.addComponent(UITransform).setContentSize(CONTENT_W, TASK_H);
      row.setPosition(new Vec3(0, y - TASK_H / 2, 0));
      parent.addChild(row);

      const g = row.addComponent(Graphics);
      g.fillColor = UI_COLORS.cellLight;
      g.roundRect(-CONTENT_W / 2, -TASK_H / 2, CONTENT_W, TASK_H, 14);
      g.fill();

      const done = task.current >= task.target;
      const textX = -CONTENT_W / 2 + 24;
      this._buildLabel(row, task.label, 24, new Vec3(textX, 18, 0), {
        bold: true,
        anchorLeft: true,
        width: CONTENT_W - BTN_W - 60,
      });
      this._buildLabel(
        row,
        `${Math.min(task.current, task.target)}/${task.target}　奖励 ${task.rewardLabel}`,
        18,
        new Vec3(textX, -16, 0),
        { anchorLeft: true, width: CONTENT_W - BTN_W - 60 },
      );

      const btnX = CONTENT_W / 2 - BTN_W / 2 - 20;
      const claimable = done && !task.claimed;
      const label = task.claimed ? '已领取' : done ? '领取' : '未完成';
      this._buildButton(row, new Vec3(btnX, 0, 0), label, claimable, () => {
        const coins = GameManager.instance.claimDailyTask(task.id);
        if (coins != null) showPageToast(this.node, `领取成功 +${coins} 金币`);
      });

      y -= TASK_H + TASK_GAP;
    });

    return y;
  }

  // --- 全完成宝箱 ---

  private _buildChest(parent: Node, top: number): void {
    const gm = GameManager.instance;
    const row = new Node('chest');
    row.layer = parent.layer;
    row.addComponent(UITransform).setContentSize(CONTENT_W, TASK_H);
    row.setPosition(new Vec3(0, top - TASK_H / 2, 0));
    parent.addChild(row);

    const g = row.addComponent(Graphics);
    g.fillColor = UI_COLORS.cellLight;
    g.roundRect(-CONTENT_W / 2, -TASK_H / 2, CONTENT_W, TASK_H, 14);
    g.fill();

    const textX = -CONTENT_W / 2 + 24;
    this._buildLabel(row, '全部完成宝箱', 24, new Vec3(textX, 18, 0), {
      bold: true,
      anchorLeft: true,
      width: CONTENT_W - BTN_W - 60,
    });
    this._buildLabel(row, '奖励 200 金币', 18, new Vec3(textX, -16, 0), {
      anchorLeft: true,
      width: CONTENT_W - BTN_W - 60,
    });

    // 宝箱要求三个任务都「已领取」，与 core/daily.claimTaskReward 判定一致
    const allClaimed = gm.daily.tasks.every(t => t.claimed);
    const claimable = allTasksDone(gm.daily) && allClaimed && !gm.daily.tasksClaimed;
    const label = gm.daily.tasksClaimed ? '已领取' : claimable ? '领取' : '未完成';
    this._buildButton(row, new Vec3(CONTENT_W / 2 - BTN_W / 2 - 20, 0, 0), label, claimable, () => {
      const coins = GameManager.instance.claimDailyChest();
      if (coins != null) showPageToast(this.node, `宝箱开启 +${coins} 金币`);
    });
  }

  // --- 通用构件 ---

  private _buildSectionTitle(parent: Node, top: number, text: string): void {
    this._buildLabel(parent, text, 26, new Vec3(-CONTENT_W / 2 + 4, top - 20, 0), {
      bold: true,
      anchorLeft: true,
      width: CONTENT_W,
    });
  }

  private _buildButton(
    parent: Node,
    pos: Vec3,
    text: string,
    enabled: boolean,
    onTap: () => void,
  ): void {
    const btn = new Node('button');
    btn.layer = parent.layer;
    btn.addComponent(UITransform).setContentSize(BTN_W, BTN_H);
    btn.setPosition(pos);
    parent.addChild(btn);

    const g = btn.addComponent(Graphics);
    g.fillColor = enabled ? CLAIM_BG : DIM_BG;
    g.roundRect(-BTN_W / 2, -BTN_H / 2, BTN_W, BTN_H, 12);
    g.fill();

    this._buildLabel(btn, text, 22, new Vec3(0, 0, 0), {
      bold: true,
      color: new Color(255, 252, 245, enabled ? 255 : 200),
      width: BTN_W - 8,
    });

    // 不可领时不挂 TapZone，避免点击后无反馈
    if (enabled) btn.addComponent(TapZoneComponent).onTap = onTap;
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
