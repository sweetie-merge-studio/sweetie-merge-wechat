import { Font, Label, Node, resources } from 'cc';

/**
 * 全局字体管理器：预加载圆润可爱风自定义字体（站酷快乐体），
 * 并提供 applyFont / createLabel 统一入口，确保所有文字风格一致。
 *
 * 字体文件位于 assets/resources/fonts/ZCOOLKuaiLe.ttf
 * （站酷快乐体，免费商用，圆润可爱风格，适配烘焙主题）
 */

const FONT_PATH = 'fonts/ZCOOLKuaiLe';

class FontManager {
  private _font: Font | null = null;
  private _loading = false;
  private _waiters: Array<(font: Font | null) => void> = [];

  /** 预加载字体（游戏启动时调用一次） */
  preload(): void {
    if (this._font || this._loading) return;
    this._loading = true;
    resources.load(FONT_PATH, Font, (err, font) => {
      this._loading = false;
      if (err) {
        console.warn('[FontManager] 字体加载失败，降级为系统默认字体:', err);
        this._font = null;
      } else {
        this._font = font;
        console.info('[FontManager] 自定义字体加载成功:', FONT_PATH);
      }
      const waiters = this._waiters;
      this._waiters = [];
      for (const cb of waiters) cb(this._font);
    });
  }

  /** 获取已加载的字体（未加载完成时返回 null） */
  get font(): Font | null {
    return this._font;
  }

  /**
   * 将自定义字体应用到指定 Label。
   * 若字体尚未加载完成，会等待加载后自动应用；
   * 加载失败则保持系统默认字体（不报错）。
   */
  applyFont(label: Label): void {
    if (this._font) {
      label.font = this._font;
      return;
    }
    if (this._loading) {
      this._waiters.push(f => {
        if (f && label.isValid) label.font = f;
      });
    }
    // 未开始加载时不主动触发 preload，由 GameManager 统一时机加载；
    // 此处静默降级为系统字体。
  }

  /**
   * 递归遍历节点树，将自定义字体应用到所有 Label 组件。
   * 适用于弹窗/页面构建完成后一次性统一字体风格。
   */
  applyFontToTree(root: Node): void {
    if (!root || !root.isValid) return;
    const label = root.getComponent(Label);
    if (label) this.applyFont(label);
    const children = root.children;
    if (children) {
      for (const child of children) {
        this.applyFontToTree(child);
      }
    }
  }
}

export const fontManager = new FontManager();
