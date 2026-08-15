import { _decorator, Component, Sprite, Label } from 'cc';
import type { ItemId } from '../core/types';
import { getItemById, getItemSpritePath } from '../data/items';
import { loadSpriteFrame, applySpriteFrame } from './sprite-loader';

const { ccclass, property } = _decorator;

/**
 * 单个物品节点：优先渲染 resources 里的贴图，
 * 贴图缺失时回退到 emoji 文字（注意：小游戏运行时不渲染彩色 emoji，
 * 回退主要服务于浏览器预览与缺图排查）。
 */
@ccclass('ItemComponent')
export class ItemComponent extends Component {
  @property({ type: Sprite, tooltip: '物品图标 sprite' })
  itemSprite: Sprite | null = null;

  @property({ type: Label, tooltip: 'emoji 兜底 label' })
  emojiLabel: Label | null = null;

  private _index: number = -1;
  private _itemId: ItemId | null = null;

  bind(index: number, itemId: ItemId | undefined): void {
    this._index = index;
    this._itemId = itemId ?? null;

    if (!itemId) {
      this.clear();
      return;
    }

    const path = getItemSpritePath(itemId);
    if (path && this.itemSprite) {
      loadSpriteFrame(path, sf => {
        // 异步回调时节点可能已被复用/销毁，只在仍绑定同一物品时应用
        if (this._itemId !== itemId || !this.itemSprite || !this.itemSprite.isValid) return;
        if (sf) {
          applySpriteFrame(this.itemSprite, sf);
          this.itemSprite.node.active = true;
          if (this.emojiLabel) this.emojiLabel.node.active = false;
        } else {
          this._showEmojiFallback(itemId);
        }
      });
      return;
    }
    this._showEmojiFallback(itemId);
  }

  clear(): void {
    this._itemId = null;
    if (this.emojiLabel) {
      this.emojiLabel.string = '';
    }
    if (this.itemSprite) {
      this.itemSprite.node.active = false;
    }
  }

  private _showEmojiFallback(itemId: ItemId): void {
    const def = getItemById().get(itemId);
    if (this.emojiLabel) {
      this.emojiLabel.string = def?.emoji ?? '❓';
      this.emojiLabel.node.active = true;
    }
    if (this.itemSprite) {
      this.itemSprite.node.active = false;
    }
  }

  get index(): number {
    return this._index;
  }

  get itemId(): ItemId | null {
    return this._itemId;
  }
}
