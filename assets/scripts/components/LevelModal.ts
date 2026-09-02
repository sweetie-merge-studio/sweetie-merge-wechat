import { _decorator, Color, Component, Graphics, Label, Node, UITransform, Vec3 } from 'cc';

import { CATEGORIES, type Category } from '../data/items';
import { GameManager } from '../manager/GameManager';
import { LEVEL_TABLE, getLevelDef, getLevelExpInfo, type LevelDef } from '../core/level';
import {
  SHELL_HEADER_NAME,
  buildModalShell,
  createModalRoot,
} from './modal-chrome';
import { createScrollView } from './drag-scroll';
import { fontManager } from '../core/font-manager';

const { ccclass } = _decorator;

/* ═══ 尺寸（对齐 Web 版 LevelModal.vue，720p 设计分辨率） ═══ */
const MODAL_W = 620;
const MODAL_H = 820;
const SIDE_PAD = 24;

/* 标题栏 */
const LV_BADGE_W = 64;
const LV_BADGE_H = 30;

/* 卡片通用 */
const CARD_RADIUS = 14;
const CARD_PAD_X = 18;
const CARD_PAD_Y = 14;

/* 当前经验卡片 */
const EXP_CARD_H = 96;
const EXP_BAR_H = 12;

/* 里程碑卡片 */
const CARD_GAP = 16;
const MILESTONE_TITLE_H = 26;
const ROW_H = 64;
const TIMELINE_DOT_R = 8;
const TIMELINE_LINE_W = 2;

/* ═══ 颜色（对齐 Web 版 CSS 变量） ═══ */
const CARD_BG = new Color(255, 248, 238, 255);
const CARD_BORDER = new Color(232, 213, 184, 255);

const LV_BADGE_BG = new Color(232, 148, 26, 255);
const TITLE_COLOR = new Color(92, 58, 30, 255);
const TEXT_BROWN = new Color(92, 58, 30, 255);
const TEXT_MUTED = new Color(168, 136, 106, 255);
const TEXT_LIGHT = new Color(196, 168, 130, 255);

const EXP_LABEL_COLOR = new Color(139, 107, 74, 255);
const EXP_TRACK = new Color(232, 220, 200, 255);
const EXP_FILL = new Color(245, 166, 35, 255);

const DOT_CURRENT = new Color(224, 74, 62, 255);
const DOT_CURRENT_GLOW = new Color(224, 74, 62, 45);
const DOT_UNLOCKED = new Color(196, 168, 122, 255);
const DOT_LOCKED = new Color(210, 190, 160, 255);
const TIMELINE_LINE = new Color(220, 200, 170, 255);

const UNLOCK_GOLD = new Color(196, 140, 70, 255);

interface LabelOpts {
  anchor?: number; // 0=左, 0.5=中, 1=右
  bold?: boolean;
  width?: number;
}

/** 品类中文名称映射 */
const CATEGORY_NAMES: Record<Category, string> = (() => {
  const map = {} as Record<Category, string>;
  for (const c of CATEGORIES) {
    map[c.id] = c.name;
  }
  return map;
})();

/**
 * 等级详情弹窗：显示当前等级/经验进度 + 等级里程碑时间轴。
 *
 * 入口：CashierCounterComponent 点击信息面板。
 * 面板外壳走项目标准 buildModalShell（纹理背景+圆角+描边+阴影+关闭按钮），
 * 标题自定义为 Lv 胶囊 + 称号，内容区放经验卡和里程碑卡。
 */
@ccclass('LevelModal')
export class LevelModal extends Component {
  /** @returns 是否真的弹了（同名已存在则不重复弹） */
  static show(canvas: Node): boolean {
    const root = createModalRoot(canvas, 'level');
    if (!root) return false;
    root.addComponent(LevelModal);
    return true;
  }

  protected onLoad(): void {
    // 用项目标准弹窗外壳（自动处理圆角纹理、描边、阴影、关闭按钮）
    const shell = buildModalShell(this.node, {
      width: MODAL_W,
      height: MODAL_H,
      title: '', // 隐藏默认居中标题，改用左对齐 Lv 胶囊 + 称号
    });
    shell.titleLabel.node.active = false;

    this._buildCustomHeader(shell.panel);
    this._buildContent(shell.body);
  }

  /* ── 自定义标题栏：Lv 胶囊 + 称号（左对齐） ── */
  private _buildCustomHeader(panel: Node): void {
    const gm = GameManager.instance;
    const def = getLevelDef(gm.level.level);
    const header = panel.getChildByName(SHELL_HEADER_NAME);
    if (!header) return;

    const headerUi = header.getComponent(UITransform)!;
    const headerW = headerUi.width;
    const headerH = headerUi.height;

    // Lv 胶囊（左对齐）
    const badgeX = -headerW / 2 + LV_BADGE_W / 2;
    const badge = new Node('lvBadge');
    badge.layer = header.layer;
    badge.addComponent(UITransform).setContentSize(LV_BADGE_W, LV_BADGE_H);
    badge.setPosition(new Vec3(badgeX, 0, 0));
    header.addChild(badge);
    const bg = badge.addComponent(Graphics);
    bg.fillColor = LV_BADGE_BG;
    bg.roundRect(-LV_BADGE_W / 2, -LV_BADGE_H / 2, LV_BADGE_W, LV_BADGE_H, LV_BADGE_H / 2);
    bg.fill();

    // 等级文字（独立子节点，避免与 Graphics 同节点渲染异常）
    const badgeLabelNode = new Node('label');
    badgeLabelNode.layer = badge.layer;
    const blUi = badgeLabelNode.addComponent(UITransform);
    blUi.setContentSize(LV_BADGE_W, LV_BADGE_H);
    badge.addChild(badgeLabelNode);
    const badgeLabel = badgeLabelNode.addComponent(Label);
    badgeLabel.string = `Lv.${gm.level.level}`;
    badgeLabel.fontSize = 16;
    badgeLabel.lineHeight = LV_BADGE_H;
    badgeLabel.isBold = true;
    badgeLabel.color = Color.WHITE;
    badgeLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
    badgeLabel.verticalAlign = Label.VerticalAlign.CENTER;
    badgeLabel.overflow = Label.Overflow.SHRINK;
    fontManager.applyFont(badgeLabel);

    // 称号（胶囊右侧，左对齐）
    const titleX = -headerW / 2 + LV_BADGE_W + 10;
    const titleNode = new Node('title');
    titleNode.layer = header.layer;
    const tui = titleNode.addComponent(UITransform);
    // 右侧留关闭按钮的位置（buildModalShell 的关闭按钮在右上角，约 44px + 20px 边距）
    const closeReserve = 44 + 16;
    tui.setContentSize(headerW - LV_BADGE_W - 10 - closeReserve, headerH);
    tui.setAnchorPoint(0, 0.5);
    titleNode.setPosition(new Vec3(titleX, 0, 0));
    header.addChild(titleNode);
    const title = titleNode.addComponent(Label);
    title.string = def.title;
    title.fontSize = 28;
    title.lineHeight = headerH;
    title.isBold = true;
    title.color = TITLE_COLOR;
    title.horizontalAlign = Label.HorizontalAlign.LEFT;
    title.verticalAlign = Label.VerticalAlign.CENTER;
    title.overflow = Label.Overflow.SHRINK;
    fontManager.applyFont(title);
  }

  /* ── 内容区：当前经验卡片 + 等级里程碑卡片 ── */
  private _buildContent(body: Node): void {
    const bodyUi = body.getComponent(UITransform)!;
    const bodyW = bodyUi.width;
    const bodyH = bodyUi.height;

    // 当前经验卡片（顶部）
    const expCardW = bodyW;
    const expCardY = bodyH / 2 - EXP_CARD_H / 2;
    this._buildExpCard(body, expCardW, EXP_CARD_H, new Vec3(0, expCardY, 0));

    // 等级里程碑卡片（剩余空间）
    const milestoneTop = expCardY - EXP_CARD_H / 2 - CARD_GAP;
    const milestoneBottom = -bodyH / 2;
    const milestoneH = milestoneTop - milestoneBottom;
    const milestoneY = (milestoneTop + milestoneBottom) / 2;
    this._buildMilestoneCard(body, bodyW, milestoneH, new Vec3(0, milestoneY, 0));
  }

  /* ── 当前经验卡片 ── */
  private _buildExpCard(parent: Node, w: number, h: number, pos: Vec3): void {
    const gm = GameManager.instance;
    const exp = getLevelExpInfo(gm.level);
    const card = this._buildCard(parent, w, h, pos);

    // 第一行：当前经验 + 数字
    const row1Y = h / 2 - CARD_PAD_Y - 12;
    this._addLabel(card, '当前经验', 18, EXP_LABEL_COLOR,
      new Vec3(-w / 2 + CARD_PAD_X, row1Y, 0),
      { anchor: 0 });
    this._addLabel(card, `${exp.current} / ${exp.required}`, 22, TEXT_BROWN,
      new Vec3(w / 2 - CARD_PAD_X, row1Y, 0),
      { anchor: 1, bold: true });

    // 第二行：进度条
    const barY = -h / 2 + CARD_PAD_Y + EXP_BAR_H / 2;
    const barX = -w / 2 + CARD_PAD_X;
    const barW = w - CARD_PAD_X * 2;

    // 轨道
    const track = new Node('track');
    track.layer = card.layer;
    track.addComponent(UITransform).setContentSize(barW, EXP_BAR_H);
    track.setPosition(new Vec3(barX + barW / 2, barY, 0));
    card.addChild(track);
    const tg = track.addComponent(Graphics);
    tg.fillColor = EXP_TRACK;
    tg.roundRect(-barW / 2, -EXP_BAR_H / 2, barW, EXP_BAR_H, EXP_BAR_H / 2);
    tg.fill();

    // 填充
    const ratio = exp.required > 0 ? Math.min(1, exp.current / exp.required) : 0;
    if (ratio > 0.01) {
      const fillW = Math.max(barW * ratio, EXP_BAR_H);
      const fill = new Node('fill');
      fill.layer = track.layer;
      fill.addComponent(UITransform).setContentSize(fillW, EXP_BAR_H);
      fill.setPosition(new Vec3(-barW / 2 + fillW / 2, 0, 0));
      track.addChild(fill);
      const fg = fill.addComponent(Graphics);
      fg.fillColor = EXP_FILL;
      fg.roundRect(-fillW / 2, -EXP_BAR_H / 2, fillW, EXP_BAR_H, EXP_BAR_H / 2);
      fg.fill();
    }
  }

  /* ── 等级里程碑卡片（含滚动时间轴） ── */
  private _buildMilestoneCard(parent: Node, w: number, h: number, pos: Vec3): void {
    const gm = GameManager.instance;
    const card = this._buildCard(parent, w, h, pos);

    // 标题
    const titleY = h / 2 - CARD_PAD_Y - MILESTONE_TITLE_H / 2;
    this._addLabel(card, '成长里程碑', 20, TEXT_BROWN,
      new Vec3(-w / 2 + CARD_PAD_X, titleY, 0),
      { anchor: 0, bold: true });

    // 滚动区
    const scrollTop = titleY - MILESTONE_TITLE_H / 2 - 8;
    const scrollBottom = -h / 2 + CARD_PAD_Y;
    const scrollH = scrollTop - scrollBottom;
    const scrollX = -w / 2 + CARD_PAD_X;
    const scrollW = w - CARD_PAD_X * 2;

    const sv = createScrollView(card, scrollW, scrollH);
    sv.view.setPosition(new Vec3(scrollX + scrollW / 2, (scrollTop + scrollBottom) / 2, 0));

    // 里程碑数据：只取有 unlockCategory 的等级（对齐 Web 端展示）
    const milestones = LEVEL_TABLE.filter(d => d.unlockCategory) as Array<LevelDef & { unlockCategory: Category }>;
    const currentLevel = gm.level.level;

    const content = sv.content;
    const totalH = milestones.length * ROW_H;
    const cui = content.getComponent(UITransform)!;
    cui.setContentSize(scrollW, totalH);
    // 内容从顶部开始排列
    content.setPosition(new Vec3(0, totalH / 2 - scrollH / 2, 0));
    sv.setContentHeight(totalH);

    // 时间轴竖线（贯穿所有里程碑圆点中心）
    // dotX 表示圆点距离 content 左边缘的水平偏移；content 锚点在中心，左边缘 x = -scrollW/2，
    // 所以竖线在 content 坐标系里的 x = -scrollW/2 + dotX，与每行圆点严格对齐。
    const dotX = TIMELINE_DOT_R + 2;
    if (milestones.length > 1) {
      const lineNode = new Node('timelineLine');
      lineNode.layer = content.layer;
      lineNode.addComponent(UITransform).setContentSize(TIMELINE_LINE_W, totalH - ROW_H);
      lineNode.setPosition(new Vec3(-scrollW / 2 + dotX, 0, 0));
      content.addChild(lineNode);
      const lg = lineNode.addComponent(Graphics);
      lg.fillColor = TIMELINE_LINE;
      lg.rect(-TIMELINE_LINE_W / 2, -(totalH - ROW_H) / 2, TIMELINE_LINE_W, totalH - ROW_H);
      lg.fill();
    }

    // 每个里程碑行：从顶部往下依次排列，行高 ROW_H
    milestones.forEach((m, i) => {
      const rowY = totalH / 2 - ROW_H / 2 - i * ROW_H;
      const isCurrent = m.level === currentLevel;
      const isUnlocked = m.level <= currentLevel;
      this._buildMilestoneRow(content, m, rowY, dotX, isCurrent, isUnlocked, scrollW);
    });
  }

  /**
   * 构建单个里程碑行。
   *
   * 布局（从左到右）：
   *   圆点 ── Lv.X / 称号（左对齐） ──────────── 解锁品类 / EXP（右对齐）
   *
   * @param parent  content 节点
   * @param def     等级定义（含 unlockCategory）
   * @param rowY    行在 content 坐标系里的 y 坐标
   * @param dotX    圆点距离行左边缘的水平偏移
   * @param isCurrent 是否为当前等级（红色高亮）
   * @param isUnlocked 是否已解锁（深色文字）
   * @param rowW    行宽（= scrollW）
   */
  private _buildMilestoneRow(
    parent: Node,
    def: LevelDef & { unlockCategory: Category },
    rowY: number,
    dotX: number,
    isCurrent: boolean,
    isUnlocked: boolean,
    rowW: number,
  ): void {
    const row = new Node(`row_${def.level}`);
    row.layer = parent.layer;
    row.addComponent(UITransform).setContentSize(rowW, ROW_H);
    // 行锚点在中心，x=0 使行居中于 content（左边缘在 -rowW/2，右边缘在 rowW/2）
    row.setPosition(new Vec3(0, rowY, 0));
    parent.addChild(row);

    // 圆点：位于行左边缘往右 dotX 处（即 x = -rowW/2 + dotX）
    const dot = new Node('dot');
    dot.layer = row.layer;
    dot.addComponent(UITransform).setContentSize(TIMELINE_DOT_R * 2, TIMELINE_DOT_R * 2);
    dot.setPosition(new Vec3(-rowW / 2 + dotX, 0, 0));
    row.addChild(dot);
    const dg = dot.addComponent(Graphics);
    if (isCurrent) {
      // 当前等级：红色光晕外圈 + 红色实心
      dg.fillColor = DOT_CURRENT_GLOW;
      dg.circle(0, 0, TIMELINE_DOT_R + 3);
      dg.fill();
      dg.fillColor = DOT_CURRENT;
      dg.circle(0, 0, TIMELINE_DOT_R);
      dg.fill();
    } else if (isUnlocked) {
      dg.fillColor = DOT_UNLOCKED;
      dg.circle(0, 0, TIMELINE_DOT_R);
      dg.fill();
    } else {
      // 未解锁：空心圆
      dg.lineWidth = 2;
      dg.strokeColor = DOT_LOCKED;
      dg.circle(0, 0, TIMELINE_DOT_R - 1);
      dg.stroke();
    }

    // 文字区：圆点右侧到行右边缘之间
    // textLeft = 行左边缘 + dotX + 圆点直径 + 间距
    const textLeft = -rowW / 2 + dotX + TIMELINE_DOT_R * 2 + 14;
    const textRight = rowW / 2 - 4;
    const textW = textRight - textLeft;

    // 左侧：Lv.X（上，粗体）+ 称号（下，常规）—— 左对齐
    const leftColor = isUnlocked ? TEXT_BROWN : TEXT_LIGHT;
    this._addLabel(row, `Lv.${def.level}`, 18, leftColor,
      new Vec3(textLeft, 11, 0),
      { anchor: 0, bold: true, width: textW * 0.45 });
    this._addLabel(row, def.title, 14, isUnlocked ? TEXT_MUTED : TEXT_LIGHT,
      new Vec3(textLeft, -11, 0),
      { anchor: 0, width: textW * 0.45 });

    // 右侧：解锁品类（上，金棕色粗体）+ EXP（下，常规）—— 右对齐
    const catName = CATEGORY_NAMES[def.unlockCategory] ?? def.unlockCategory;
    const rightColor = isUnlocked ? UNLOCK_GOLD : TEXT_LIGHT;
    this._addLabel(row, `解锁 ${catName}`, 16, rightColor,
      new Vec3(textRight, 11, 0),
      { anchor: 1, bold: true });
    this._addLabel(row, `${def.expRequired} EXP`, 13, isUnlocked ? TEXT_MUTED : TEXT_LIGHT,
      new Vec3(textRight, -11, 0),
      { anchor: 1 });
  }

  /* ── 工具方法 ── */

  /** 画一张圆角卡片（浅米色底 + 细描边） */
  private _buildCard(parent: Node, w: number, h: number, pos: Vec3): Node {
    const card = new Node('card');
    card.layer = parent.layer;
    card.addComponent(UITransform).setContentSize(w, h);
    card.setPosition(pos);
    parent.addChild(card);
    const g = card.addComponent(Graphics);
    g.fillColor = CARD_BG;
    g.roundRect(-w / 2, -h / 2, w, h, CARD_RADIUS);
    g.fill();
    g.lineWidth = 1.5;
    g.strokeColor = CARD_BORDER;
    g.roundRect(-w / 2, -h / 2, w, h, CARD_RADIUS);
    g.stroke();
    return card;
  }

  /** 添加一个 Label 节点 */
  private _addLabel(
    parent: Node,
    text: string,
    fontSize: number,
    color: Color,
    pos: Vec3,
    opts: LabelOpts = {},
  ): Label {
    const node = new Node('label');
    node.layer = parent.layer;
    const ui = node.addComponent(UITransform);
    const w = opts.width ?? fontSize * 6;
    ui.setContentSize(w, fontSize * 1.6);
    const anchor = opts.anchor ?? 0.5;
    ui.setAnchorPoint(anchor, 0.5);
    node.setPosition(pos);
    parent.addChild(node);
    const label = node.addComponent(Label);
    label.string = text;
    label.fontSize = fontSize;
    label.lineHeight = fontSize * 1.4;
    label.isBold = opts.bold ?? false;
    label.color = color;
    label.overflow = Label.Overflow.SHRINK;
    if (anchor <= 0.1) label.horizontalAlign = Label.HorizontalAlign.LEFT;
    else if (anchor >= 0.9) label.horizontalAlign = Label.HorizontalAlign.RIGHT;
    else label.horizontalAlign = Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    fontManager.applyFont(label);
    return label;
  }
}
