import { _decorator, Color, Component, Graphics, Label, Node, UITransform, Vec3, tween } from 'cc';

import { TapZoneComponent } from './tap-zone';
import { buildModalShell, createModalRoot } from './modal-chrome';
import { UI_COLORS } from './ui-factory';
import { isSoundEnabled, setSoundEnabled } from '../manager/AudioManager';
import { isVibrateEnabled, setVibrateEnabled } from '../platform/vibrate';
import { fontManager } from '../core/font-manager';

const { ccclass } = _decorator;

/* ═══ 尺寸 ═══ */
const MODAL_W = 560;
const MODAL_H = 320;

const ROW_H = 72;
const TOGGLE_W = 64;
const TOGGLE_H = 34;
const TOGGLE_RADIUS = TOGGLE_H / 2;
const KNOB_SIZE = 28;
const KNOB_PADDING = 3;

/* ═══ 颜色 ═══ */
/** 开关开启：橙色（对齐 Web 版 toggle on） */
const TOGGLE_ON = new Color(232, 148, 26, 255);
/** 开关关闭：灰褐（对齐药丸描边色） */
const TOGGLE_OFF = new Color(212, 192, 160, 255);
/** 滑块白 */
const KNOB_WHITE = new Color(255, 255, 255, 255);
/** 滑块阴影 */
const KNOB_SHADOW = new Color(0, 0, 0, 30);
/** 行分隔线 */
const DIVIDER_COLOR = new Color(232, 213, 184, 255);

/**
 * 设置弹窗：音效开关 + 振动反馈开关 + 版本信息。
 *
 * 对齐 Web 版 SettingsModal，但去掉了高画质和语言（小游戏端无意义）。
 */
@ccclass('SettingsModal')
export class SettingsModal extends Component {
  /** @returns 是否真的弹了 */
  static show(canvas: Node): boolean {
    const root = createModalRoot(canvas, 'settings');
    if (!root) {
      console.warn('[SettingsModal] createModalRoot 返回 null（同名弹窗可能已存在）');
      return false;
    }
    root.addComponent(SettingsModal);
    return true;
  }

  protected onLoad(): void {
    try {
      const shell = buildModalShell(this.node, {
        width: MODAL_W,
        height: MODAL_H,
        title: '小设置',
      });

      const body = shell.body;
      const bodyUi = body.getComponent(UITransform);
      const bodyH = bodyUi?.height ?? 376;
      const bodyW = bodyUi?.width ?? (MODAL_W - 40);

    // ── 开关行区域：从 body 顶部往下排列 ──
    const topY = bodyH / 2; // body 内顶部
    const rows: Array<{
      label: string;
      iconPath: string;
      getter: () => boolean;
      setter: (on: boolean) => void;
    }> = [
      {
        label: '甜甜音效',
        iconPath: 'sprites/ui/settings_sound',
        getter: isSoundEnabled,
        setter: setSoundEnabled,
      },
      {
        label: '震动反馈',
        iconPath: 'sprites/ui/settings_vibrate',
        getter: isVibrateEnabled,
        setter: setVibrateEnabled,
      },
    ];

    rows.forEach((row, i) => {
      const rowY = topY - ROW_H / 2 - i * ROW_H;
      this._buildToggleRow(body, rowY, bodyW, row.label, row.iconPath, row.getter, row.setter);

      // 行之间分隔线（最后一行不画）
      if (i < rows.length - 1) {
        const dividerY = topY - (i + 1) * ROW_H;
        this._buildDivider(body, dividerY, bodyW);
      }
    });

    } catch (err) {
      console.error('[SettingsModal] onLoad 异常:', err);
    }

    fontManager.applyFontToTree(this.node);
  }

  /** 构建一行开关：左文字，右 toggle */
  private _buildToggleRow(
    parent: Node,
    y: number,
    rowW: number,
    label: string,
    _iconPath: string,
    getter: () => boolean,
    setter: (on: boolean) => void,
  ): void {
    const row = new Node('row');
    row.layer = parent.layer;
    row.addComponent(UITransform).setContentSize(rowW, ROW_H);
    row.setPosition(new Vec3(0, y, 0));
    parent.addChild(row);

    // 左侧文字（左对齐，留出左边距）
    const labelX = -rowW / 2 + 16;
    const labelNode = new Node('label');
    labelNode.layer = row.layer;
    const lui = labelNode.addComponent(UITransform);
    lui.setContentSize(rowW - TOGGLE_W - 40, ROW_H);
    lui.setAnchorPoint(0, 0.5);
    labelNode.setPosition(new Vec3(labelX, 0, 0));
    row.addChild(labelNode);
    const labelComp = labelNode.addComponent(Label);
    labelComp.string = label;
    labelComp.fontSize = 26;
    labelComp.lineHeight = ROW_H;
    labelComp.isBold = true;
    labelComp.color = UI_COLORS.textBrown;
    labelComp.horizontalAlign = Label.HorizontalAlign.LEFT;
    labelComp.verticalAlign = Label.VerticalAlign.CENTER;

    // 右侧 toggle
    const toggleX = rowW / 2 - TOGGLE_W / 2 - 8;
    this._buildToggle(row, toggleX, getter, setter);
  }

  /** 构建 toggle 开关（轨道 + 滑块，点击切换） */
  private _buildToggle(
    parent: Node,
    x: number,
    getter: () => boolean,
    setter: (on: boolean) => void,
  ): void {
    const toggle = new Node('toggle');
    toggle.layer = parent.layer;
    toggle.addComponent(UITransform).setContentSize(TOGGLE_W, TOGGLE_H);
    toggle.setPosition(new Vec3(x, 0, 0));
    parent.addChild(toggle);

    // 轨道
    const track = new Node('track');
    track.layer = toggle.layer;
    track.addComponent(UITransform).setContentSize(TOGGLE_W, TOGGLE_H);
    track.setPosition(new Vec3(0, 0, 0));
    toggle.addChild(track);
    const trackG = track.addComponent(Graphics);

    // 滑块（带阴影层）
    const knob = new Node('knob');
    knob.layer = toggle.layer;
    knob.addComponent(UITransform).setContentSize(KNOB_SIZE, KNOB_SIZE);
    toggle.addChild(knob);
    const knobG = knob.addComponent(Graphics);

    // 滑块阴影（略向下偏移）
    const shadow = new Node('knobShadow');
    shadow.layer = knob.layer;
    shadow.addComponent(UITransform).setContentSize(KNOB_SIZE, KNOB_SIZE);
    shadow.setPosition(new Vec3(0, -2, 0));
    knob.addChild(shadow);
    const shadowG = shadow.addComponent(Graphics);
    shadowG.fillColor = KNOB_SHADOW;
    shadowG.circle(0, 0, KNOB_SIZE / 2);
    shadowG.fill();

    // 滑块本体
    const knobBody = new Node('knobBody');
    knobBody.layer = knob.layer;
    knobBody.addComponent(UITransform).setContentSize(KNOB_SIZE, KNOB_SIZE);
    knob.addChild(knobBody);
    const knobBodyG = knobBody.addComponent(Graphics);
    knobBodyG.fillColor = KNOB_WHITE;
    knobBodyG.circle(0, 0, KNOB_SIZE / 2);
    knobBodyG.fill();

    const paint = (on: boolean) => {
      // 重绘轨道
      trackG.clear();
      trackG.fillColor = on ? TOGGLE_ON : TOGGLE_OFF;
      trackG.roundRect(-TOGGLE_W / 2, -TOGGLE_H / 2, TOGGLE_W, TOGGLE_H, TOGGLE_RADIUS);
      trackG.fill();
      // 滑块位置：开启在右，关闭在左
      const knobX = on
        ? TOGGLE_W / 2 - KNOB_SIZE / 2 - KNOB_PADDING
        : -TOGGLE_W / 2 + KNOB_SIZE / 2 + KNOB_PADDING;
      knob.setPosition(new Vec3(knobX, 0, 0));
    };

    // 初始状态
    paint(getter());

    // 点击切换
    toggle.addComponent(TapZoneComponent).onTap = () => {
      const next = !getter();
      setter(next);
      // 滑动动画
      const targetX = next
        ? TOGGLE_W / 2 - KNOB_SIZE / 2 - KNOB_PADDING
        : -TOGGLE_W / 2 + KNOB_SIZE / 2 + KNOB_PADDING;
      tween(knob)
        .to(0.15, { position: new Vec3(targetX, 0, 0) })
        .start();
      // 重绘轨道颜色（延迟到动画开始）
      trackG.clear();
      trackG.fillColor = next ? TOGGLE_ON : TOGGLE_OFF;
      trackG.roundRect(-TOGGLE_W / 2, -TOGGLE_H / 2, TOGGLE_W, TOGGLE_H, TOGGLE_RADIUS);
      trackG.fill();
    };
  }

  /** 行分隔线 */
  private _buildDivider(parent: Node, y: number, w: number): void {
    const line = new Node('divider');
    line.layer = parent.layer;
    line.addComponent(UITransform).setContentSize(w - 16, 1);
    line.setPosition(new Vec3(0, y, 0));
    parent.addChild(line);
    const g = line.addComponent(Graphics);
    g.fillColor = DIVIDER_COLOR;
    g.rect(-w / 2 + 8, -0.5, w - 16, 1);
    g.fill();
  }
}
