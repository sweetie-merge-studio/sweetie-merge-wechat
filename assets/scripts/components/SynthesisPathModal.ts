import { Color, Graphics, Label, Node, Sprite, UITransform, Vec3 } from 'cc';

import { CATEGORIES, getCategory, getItemById, getItemSpritePath, getMotherItemId, getMotherDisplay } from '../data/items';
import type { Category } from '../data/items';
import type { ItemId, Rarity } from '../core/types';
import { buildModalShell, createModalRoot } from './modal-chrome';
import { loadSpriteFrame, applySpriteFrame } from './sprite-loader';
import { fontManager } from '../core/font-manager';

/**
 * 合成路径弹窗（对齐 Web 版 SynthesisPathModal.vue）。
 *
 * 点击订单中未完成的需求物品时弹出，展示该物品所属品类的完整合成链，
 * 帮助玩家了解如何一步步合成目标物品。
 *
 * 布局：
 * - 顶部：标题"合成路径" + 副标题"品类名 · 物品名"
 * - 中部：该品类 8 级合成链（4列×2行），当前物品高亮，步骤间用"x2 ▶"连接
 * - 底部：产出行（母棋工坊 → 产出 → Lv.1 物品）
 */

/* ═══ 尺寸 ═══ */
const PANEL_W = 620;
const PANEL_H = 620;

/** 合成链：4 列 */
const CHAIN_COLS = 4;
/** 每列宽度 */
const COL_W = 130;
/** 行高（步骤节点 + 名称 + 间距） */
const ROW_H = 130;
/** 两行之间的间距 */
const ROW_GAP = 8;

/** 步骤节点尺寸 */
const STEP_NODE_SIZE = 76;
/** 步骤图标尺寸 */
const STEP_ICON_SIZE = 56;
/** 步骤名称字号 */
const STEP_NAME_FONT = 18;
/** 步骤名称最大宽度 */
const STEP_NAME_W = 90;

/** 合并箭头尺寸 */
const ARROW_W = 28;
const ARROW_FORMULA_FONT = 14;
const ARROW_ICON_FONT = 18;

/** 产出行 */
const SUMMARY_ICON_SIZE = 64;
const SUMMARY_NAME_FONT = 18;
const SUMMARY_ARROW_FONT = 20;
const SUMMARY_ROW_H = 110;

/* ═══ 颜色（对齐 Web 版 CSS） ═══ */
/** 步骤节点底色 #E8D8C0 */
const STEP_BG = new Color(232, 216, 192, 255);
/** 步骤节点默认描边 #B8A080 */
const STEP_BORDER_COMMON = new Color(184, 160, 128, 255);
/** uncommon 描边 #D2B464 */
const STEP_BORDER_UNCOMMON = new Color(210, 180, 100, 255);
/** rare 描边 #2196F3 */
const STEP_BORDER_RARE = new Color(33, 150, 243, 255);
/** epic 描边 #9C27B0 */
const STEP_BORDER_EPIC = new Color(156, 39, 176, 255);
/** legendary 描边 #FFC107 */
const STEP_BORDER_LEGENDARY = new Color(255, 193, 7, 255);

/** 当前高亮描边 #F5A623 */
const CURRENT_BORDER = new Color(245, 166, 35, 255);
/** 当前高亮底色 #FFF6E0 */
const CURRENT_BG = new Color(255, 246, 224, 255);
/** 当前高亮阴影色 rgba(245,166,35,0.25) */
const CURRENT_SHADOW = new Color(245, 166, 35, 64);

/** 等级角标底色 #8B6844 */
const LEVEL_BG = new Color(139, 104, 68, 255);
/** 等级角标文字白 */
const LEVEL_TEXT = Color.WHITE;
/** 等级角标字号 */
const LEVEL_FONT = 14;

/** 合并公式文字色 #E8941A */
const FORMULA_COLOR = new Color(232, 148, 26, 255);
/** 箭头图标色 #C4A050 */
const ARROW_COLOR = new Color(196, 160, 80, 255);

/** 步骤名称色 #8B6B4A */
const STEP_NAME_COLOR = new Color(139, 107, 74, 255);

/** 产出行分隔线色 #E8D5B8 */
const DIVIDER_COLOR = new Color(232, 213, 184, 255);
/** 产出文字色 #C4A050 */
const SUMMARY_ARROW_COLOR = new Color(196, 160, 80, 255);
/** 产出名称色 #8B6B4A */
const SUMMARY_NAME_COLOR = new Color(139, 107, 74, 255);

/** 产出图标底色 #E8D8C0 */
const SUMMARY_ICON_BG = new Color(232, 216, 192, 255);
/** 产出图标描边 #C4A050 */
const SUMMARY_ICON_BORDER = new Color(196, 160, 80, 255);

const MODAL_NAME = 'SynthesisPath';

/** 根据稀有度获取描边颜色 */
function rarityBorder(rarity: Rarity): Color {
  switch (rarity) {
    case 'uncommon': return STEP_BORDER_UNCOMMON;
    case 'rare': return STEP_BORDER_RARE;
    case 'epic': return STEP_BORDER_EPIC;
    case 'legendary': return STEP_BORDER_LEGENDARY;
    case 'mythic': return STEP_BORDER_LEGENDARY;
    default: return STEP_BORDER_COMMON;
  }
}

/**
 * 打开合成路径弹窗。
 * @param parent 用于定位 Canvas 的节点（通常是订单面板或其父节点）
 * @param itemId 目标物品 ID（弹窗展示该物品所属品类的合成链）
 */
export function showSynthesisPathModal(parent: Node, itemId: ItemId): void {
  const canvas = findCanvas(parent);
  // 同名弹窗已存在则先关闭
  const old = canvas.getChildByName(`Modal_${MODAL_NAME}`);
  if (old?.isValid) old.destroy();

  const root = createModalRoot(canvas, MODAL_NAME);
  if (!root) return;

  const itemDef = getItemById().get(itemId);
  const cat = getCategory(itemId);
  const catDef = cat ? CATEGORIES.find(c => c.id === cat) : undefined;

  if (!itemDef || !cat || !catDef) {
    console.warn('[SynthesisPathModal] 无效物品 ID:', itemId);
    root.destroy();
    return;
  }

  const subtitle = `${catDef.name} · ${itemDef.name}`;

  const shell = buildModalShell(root, {
    width: PANEL_W,
    height: PANEL_H,
    title: '合成路径',
    subtitle,
  });

  buildContent(shell.body, itemId, cat, catDef);

  fontManager.applyFontToTree(root);
}

/** 从任意节点向上找到 Canvas 根节点 */
function findCanvas(node: Node): Node {
  let n: Node | null = node;
  while (n) {
    if (n.name === 'Canvas' || n.getComponent('cc.Canvas')) return n;
    n = n.parent;
  }
  return node;
}

/** 构建弹窗主体内容：合成链 + 产出行 */
function buildContent(body: Node, targetItemId: ItemId, cat: Category, catDef: typeof CATEGORIES[number]): void {
  const bodyUi = body.getComponent(UITransform);
  const bodyW = bodyUi?.width ?? PANEL_W - 40;

  // 布局参数
  const chainH = ROW_H * 2 + ROW_GAP;
  const SECTION_GAP = 24; // 合成链与产出行之间的间距（含分隔线）
  const totalContentH = chainH + SECTION_GAP + SUMMARY_ROW_H;

  // ── 合成链区域 ──
  const chainArea = new Node('chainArea');
  chainArea.layer = body.layer;
  chainArea.addComponent(UITransform).setContentSize(bodyW, chainH);
  chainArea.setPosition(new Vec3(0, totalContentH / 2 - chainH / 2, 0));
  body.addChild(chainArea);

  // 构建完整合成链（Lv.1 ~ Lv.8）
  const fullChain: ItemId[] = [];
  for (let lv = 1; lv <= catDef.items.length; lv++) {
    fullChain.push(`${cat}_${lv}` as ItemId);
  }

  const totalColsW = CHAIN_COLS * COL_W;
  const startX = -totalColsW / 2 + COL_W / 2;

  for (let i = 0; i < fullChain.length; i++) {
    const id = fullChain[i];
    const col = i % CHAIN_COLS;
    const row = Math.floor(i / CHAIN_COLS);
    const x = startX + col * COL_W;
    const y = (ROW_H / 2 + ROW_GAP / 2) - row * (ROW_H + ROW_GAP);

    buildChainCell(chainArea, id, x, y, id === targetItemId, i > 0);
  }

  // ── 分隔线 ──
  const dividerY = (chainArea.position.y - chainH / 2 + (-(totalContentH / 2 - SUMMARY_ROW_H / 2)) + SUMMARY_ROW_H / 2) / 2;
  const divider = new Node('divider');
  divider.layer = body.layer;
  divider.addComponent(UITransform).setContentSize(bodyW - 40, 2);
  divider.setPosition(new Vec3(0, dividerY, 0));
  body.addChild(divider);
  const dg = divider.addComponent(Graphics);
  const divW = divider.getComponent(UITransform)!.width;
  dg.fillColor = DIVIDER_COLOR;
  dg.rect(-divW / 2, -1, divW, 2);
  dg.fill();

  // ── 产出行 ──
  const summaryRow = new Node('summaryRow');
  summaryRow.layer = body.layer;
  summaryRow.addComponent(UITransform).setContentSize(bodyW, SUMMARY_ROW_H);
  summaryRow.setPosition(new Vec3(0, -(totalContentH / 2 - SUMMARY_ROW_H / 2), 0));
  body.addChild(summaryRow);

  buildSummaryRow(summaryRow, cat, catDef, targetItemId);
}

/** 构建单个合成链格子（箭头 + 步骤节点 + 名称） */
function buildChainCell(
  parent: Node,
  itemId: ItemId,
  x: number,
  y: number,
  isCurrent: boolean,
  hasArrow: boolean,
): void {
  const cell = new Node(`chainCell_${itemId}`);
  cell.layer = parent.layer;
  cell.addComponent(UITransform).setContentSize(COL_W, ROW_H);
  cell.setPosition(new Vec3(x, y, 0));
  parent.addChild(cell);

  const itemDef = getItemById().get(itemId);
  if (!itemDef) return;

  // 计算箭头 + 步骤的总宽度，居中对齐
  const stepX = hasArrow ? ARROW_W / 2 : 0;
  const arrowX = hasArrow ? -STEP_NODE_SIZE / 2 - ARROW_W / 2 : 0;

  // ── 合并箭头（x2 + ▶）──
  if (hasArrow) {
    const arrow = new Node('mergeArrow');
    arrow.layer = cell.layer;
    arrow.addComponent(UITransform).setContentSize(ARROW_W, STEP_NODE_SIZE);
    arrow.setPosition(new Vec3(arrowX, 6, 0));
    cell.addChild(arrow);

    // x2 文字
    const formulaNode = new Node('formula');
    formulaNode.layer = arrow.layer;
    formulaNode.addComponent(UITransform).setContentSize(ARROW_W, ARROW_FORMULA_FONT + 4);
    formulaNode.setPosition(new Vec3(0, 10, 0));
    arrow.addChild(formulaNode);
    const formulaLabel = formulaNode.addComponent(Label);
    formulaLabel.string = 'x2';
    formulaLabel.fontSize = ARROW_FORMULA_FONT;
    formulaLabel.isBold = true;
    formulaLabel.color = FORMULA_COLOR;
    formulaLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
    fontManager.applyFont(formulaLabel);

    // 箭头（Graphics 绘制填充三角，替代系统字体 ▶ 字符，确保各设备渲染一致）
    const arrowIconNode = new Node('arrowIcon');
    arrowIconNode.layer = arrow.layer;
    arrowIconNode.addComponent(UITransform).setContentSize(ARROW_W, ARROW_ICON_FONT + 4);
    arrowIconNode.setPosition(new Vec3(0, -8, 0));
    arrow.addChild(arrowIconNode);
    const arrowG = arrowIconNode.addComponent(Graphics);
    arrowG.fillColor = ARROW_COLOR;
    arrowG.moveTo(-7, -7);
    arrowG.lineTo(7, 0);
    arrowG.lineTo(-7, 7);
    arrowG.close();
    arrowG.fill();
  }

  // ── 步骤节点（图标 + 等级角标）──
  const stepNode = new Node('stepNode');
  stepNode.layer = cell.layer;
  const nodeSize = isCurrent ? STEP_NODE_SIZE * 1.08 : STEP_NODE_SIZE;
  stepNode.addComponent(UITransform).setContentSize(nodeSize, nodeSize);
  stepNode.setPosition(new Vec3(stepX, 12, 0));
  cell.addChild(stepNode);

  // 当前高亮：外层阴影
  if (isCurrent) {
    const shadow = new Node('currentShadow');
    shadow.layer = stepNode.layer;
    shadow.addComponent(UITransform).setContentSize(nodeSize + 12, nodeSize + 12);
    shadow.setPosition(new Vec3(0, 0, 0));
    stepNode.addChild(shadow);
    const sg = shadow.addComponent(Graphics);
    sg.fillColor = CURRENT_SHADOW;
    sg.roundRect(-(nodeSize + 12) / 2, -(nodeSize + 12) / 2, nodeSize + 12, nodeSize + 12, 14);
    sg.fill();
  }

  // 背景 + 描边
  const bg = stepNode.addComponent(Graphics);
  const r = 12;
  bg.fillColor = isCurrent ? CURRENT_BG : STEP_BG;
  bg.roundRect(-nodeSize / 2, -nodeSize / 2, nodeSize, nodeSize, r);
  bg.fill();
  bg.lineWidth = isCurrent ? 3 : 2.5;
  bg.strokeColor = isCurrent ? CURRENT_BORDER : rarityBorder(itemDef.rarity);
  bg.roundRect(-nodeSize / 2, -nodeSize / 2, nodeSize, nodeSize, r);
  bg.stroke();

  // 物品图标
  const iconPath = getItemSpritePath(itemId);
  const iconNode = new Node('icon');
  iconNode.layer = stepNode.layer;
  iconNode.addComponent(UITransform).setContentSize(STEP_ICON_SIZE, STEP_ICON_SIZE);
  stepNode.addChild(iconNode);
  const iconSprite = iconNode.addComponent(Sprite);

  const showEmoji = (): void => {
    if (!iconNode.isValid) return;
    iconSprite.node.active = false;
    const emojiLabel = iconNode.addComponent(Label);
    emojiLabel.string = itemDef.emoji;
    emojiLabel.fontSize = STEP_ICON_SIZE * 0.7;
    emojiLabel.lineHeight = STEP_ICON_SIZE;
    emojiLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
    emojiLabel.verticalAlign = Label.VerticalAlign.CENTER;
  };

  if (iconPath) {
    loadSpriteFrame(iconPath, sf => {
      if (!iconSprite.isValid) return;
      if (sf) {
        applySpriteFrame(iconSprite, sf);
      } else {
        showEmoji();
      }
    });
  } else {
    showEmoji();
  }

  // 等级角标（右下角）
  const levelBadge = new Node('levelBadge');
  levelBadge.layer = stepNode.layer;
  const badgeW = 26;
  const badgeH = 20;
  levelBadge.addComponent(UITransform).setContentSize(badgeW, badgeH);
  levelBadge.setPosition(new Vec3(nodeSize / 2 - 4, -nodeSize / 2 + 4, 0));
  stepNode.addChild(levelBadge);
  const lbg = levelBadge.addComponent(Graphics);
  lbg.fillColor = isCurrent ? CURRENT_BORDER : LEVEL_BG;
  lbg.roundRect(-badgeW / 2, -badgeH / 2, badgeW, badgeH, 5);
  lbg.fill();

  // 数字 Label 放在独立子节点上，避免与 Graphics 同节点渲染冲突
  const levelLabelNode = new Node('levelLabel');
  levelLabelNode.layer = levelBadge.layer;
  levelLabelNode.addComponent(UITransform).setContentSize(badgeW, badgeH);
  levelBadge.addChild(levelLabelNode);
  const levelLabel = levelLabelNode.addComponent(Label);
  levelLabel.string = String(itemDef.level);
  levelLabel.fontSize = LEVEL_FONT;
  levelLabel.lineHeight = badgeH;
  levelLabel.isBold = true;
  levelLabel.color = LEVEL_TEXT;
  levelLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
  levelLabel.verticalAlign = Label.VerticalAlign.CENTER;
  fontManager.applyFont(levelLabel);

  // ── 步骤名称 ──
  const nameNode = new Node('stepName');
  nameNode.layer = cell.layer;
  nameNode.addComponent(UITransform).setContentSize(STEP_NAME_W, STEP_NAME_FONT + 6);
  nameNode.setPosition(new Vec3(stepX, -nodeSize / 2 - 16, 0));
  cell.addChild(nameNode);
  const nameLabel = nameNode.addComponent(Label);
  nameLabel.string = itemDef.name;
  nameLabel.fontSize = STEP_NAME_FONT;
  nameLabel.isBold = true;
  nameLabel.color = STEP_NAME_COLOR;
  nameLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
  nameLabel.overflow = Label.Overflow.SHRINK;
  fontManager.applyFont(nameLabel);
}

/** 构建产出行：母棋工坊 → 产出 → Lv.1 物品 */
function buildSummaryRow(
  parent: Node,
  cat: Category,
  catDef: typeof CATEGORIES[number],
  targetItemId: ItemId,
): void {
  const motherId = getMotherItemId(cat);
  const motherDisplay = getMotherDisplay(motherId);
  const lv1Id = `${cat}_1` as ItemId;
  const lv1Def = getItemById().get(lv1Id);

  if (!motherDisplay || !lv1Def) return;

  const centerY = 0;

  // ── 左侧：母棋工坊 ──
  const motherItem = buildSummaryItem(parent, -140, centerY, motherDisplay.emoji, motherDisplay.name, cat);

  // ── 中间：产出文字 ──
  const arrowNode = new Node('summaryArrow');
  arrowNode.layer = parent.layer;
  arrowNode.addComponent(UITransform).setContentSize(60, SUMMARY_ARROW_FONT + 6);
  arrowNode.setPosition(new Vec3(0, centerY, 0));
  parent.addChild(arrowNode);
  const arrowLabel = arrowNode.addComponent(Label);
  arrowLabel.string = '产出';
  arrowLabel.fontSize = SUMMARY_ARROW_FONT;
  arrowLabel.isBold = true;
  arrowLabel.color = SUMMARY_ARROW_COLOR;
  arrowLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
  fontManager.applyFont(arrowLabel);

  // ── 右侧：Lv.1 物品（实际产出的是该品类 Lv.1，不是 targetItemId）──
  // 注意：web 端底部右侧显示的是 itemId（传入的目标物品），但语义上母棋产出的是 Lv.1
  // 对齐 web 端行为：显示传入的 itemId
  const targetDef = getItemById().get(targetItemId);
  if (targetDef) {
    buildSummaryItem(parent, 140, centerY, targetDef.emoji, targetDef.name, cat, targetItemId);
  }
}

/** 构建产出项（图标 + 名称） */
function buildSummaryItem(
  parent: Node,
  x: number,
  y: number,
  emoji: string,
  name: string,
  cat: Category,
  itemId?: ItemId,
): Node {
  const item = new Node('summaryItem');
  item.layer = parent.layer;
  item.addComponent(UITransform).setContentSize(SUMMARY_ICON_SIZE + 20, SUMMARY_ICON_SIZE + SUMMARY_NAME_FONT + 16);
  item.setPosition(new Vec3(x, y, 0));
  parent.addChild(item);

  // 图标背景
  const iconBg = new Node('iconBg');
  iconBg.layer = item.layer;
  iconBg.addComponent(UITransform).setContentSize(SUMMARY_ICON_SIZE, SUMMARY_ICON_SIZE);
  iconBg.setPosition(new Vec3(0, SUMMARY_NAME_FONT / 2 + 8, 0));
  item.addChild(iconBg);
  const ig = iconBg.addComponent(Graphics);
  ig.fillColor = SUMMARY_ICON_BG;
  ig.roundRect(-SUMMARY_ICON_SIZE / 2, -SUMMARY_ICON_SIZE / 2, SUMMARY_ICON_SIZE, SUMMARY_ICON_SIZE, 12);
  ig.fill();
  ig.lineWidth = 2.5;
  ig.strokeColor = SUMMARY_ICON_BORDER;
  ig.roundRect(-SUMMARY_ICON_SIZE / 2, -SUMMARY_ICON_SIZE / 2, SUMMARY_ICON_SIZE, SUMMARY_ICON_SIZE, 12);
  ig.stroke();

  // 图标内容
  if (itemId) {
    // 物品：尝试加载贴图
    const iconPath = getItemSpritePath(itemId);
    const iconNode = new Node('icon');
    iconNode.layer = iconBg.layer;
    iconNode.addComponent(UITransform).setContentSize(SUMMARY_ICON_SIZE - 12, SUMMARY_ICON_SIZE - 12);
    iconBg.addChild(iconNode);
    const iconSprite = iconNode.addComponent(Sprite);

    if (iconPath) {
      loadSpriteFrame(iconPath, sf => {
        if (!iconSprite.isValid) return;
        if (sf) applySpriteFrame(iconSprite, sf);
        else {
          iconSprite.node.active = false;
          const label = iconNode.addComponent(Label);
          label.string = emoji;
          label.fontSize = (SUMMARY_ICON_SIZE - 12) * 0.7;
          label.lineHeight = SUMMARY_ICON_SIZE - 12;
          label.horizontalAlign = Label.HorizontalAlign.CENTER;
          label.verticalAlign = Label.VerticalAlign.CENTER;
        }
      });
    } else {
      iconSprite.node.active = false;
      const label = iconNode.addComponent(Label);
      label.string = emoji;
      label.fontSize = (SUMMARY_ICON_SIZE - 12) * 0.7;
      label.lineHeight = SUMMARY_ICON_SIZE - 12;
      label.horizontalAlign = Label.HorizontalAlign.CENTER;
      label.verticalAlign = Label.VerticalAlign.CENTER;
    }
  } else {
    // 母棋：尝试加载母棋贴图
    const motherPath = `sprites/mothers/mother_${cat}`;
    const iconNode = new Node('icon');
    iconNode.layer = iconBg.layer;
    iconNode.addComponent(UITransform).setContentSize(SUMMARY_ICON_SIZE - 8, SUMMARY_ICON_SIZE - 8);
    iconBg.addChild(iconNode);
    const iconSprite = iconNode.addComponent(Sprite);

    loadSpriteFrame(motherPath, sf => {
      if (!iconSprite.isValid) return;
      if (sf) {
        applySpriteFrame(iconSprite, sf);
      } else {
        iconSprite.node.active = false;
        const label = iconNode.addComponent(Label);
        label.string = emoji;
        label.fontSize = (SUMMARY_ICON_SIZE - 8) * 0.6;
        label.lineHeight = SUMMARY_ICON_SIZE - 8;
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
      }
    });
  }

  // 名称
  const nameNode = new Node('summaryName');
  nameNode.layer = item.layer;
  nameNode.addComponent(UITransform).setContentSize(100, SUMMARY_NAME_FONT + 6);
  nameNode.setPosition(new Vec3(0, -SUMMARY_ICON_SIZE / 2 - 12, 0));
  item.addChild(nameNode);
  const nameLabel = nameNode.addComponent(Label);
  nameLabel.string = name;
  nameLabel.fontSize = SUMMARY_NAME_FONT;
  nameLabel.isBold = true;
  nameLabel.color = SUMMARY_NAME_COLOR;
  nameLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
  nameLabel.overflow = Label.Overflow.SHRINK;
  fontManager.applyFont(nameLabel);

  return item;
}
