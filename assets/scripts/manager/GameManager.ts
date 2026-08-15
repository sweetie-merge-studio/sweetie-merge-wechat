import { _decorator, Component, Node, ResolutionPolicy, UITransform, Vec3, Widget, director, profiler, view } from 'cc';

import type { Cell, EconomyState, EnergyState, Platform } from '../core/types';
import {
  BOARD_LENGTH,
  createBoard,
  dragMerge,
  activateMother,
  placeNewMothers,
} from '../core/board';
import { createEnergy, tickEnergy } from '../core/energy';
import { createEconomy } from '../core/economy';
import { createCollection } from '../core/collection';
import { createLevelState } from '../core/level';
import { createOrderState, isValidOrderState, type OrderState } from '../core/order';
import { serialize, deserialize } from '../core/storage';
import { wechatPlatform, wechatInit } from '../platform/wechat';
import { initOfflineQueue } from '../platform/offline-queue';
import { getToken } from '../api/request';
import { login } from '../api/auth';
import { EventBus } from '../core/EventBus';
import { createSpriteNode } from '../components/ui-factory';
import { CashierCounterComponent } from '../components/CashierCounterComponent';
import { BottomNavComponent } from '../components/BottomNavComponent';

const { ccclass } = _decorator;

const SAVE_DEBOUNCE_MS = 1500;
const ENERGY_TICK_MS = 1000;

/**
 * 游戏全局状态管家。
 *
 * 桥接两侧：
 * - core/      ：纯 TS 数据 + 规则（与 sweetie-merge 主仓库同构）
 * - cocos      ：Component / Scene / Node 生命周期
 *
 * 通过 director.addPersistRootNode() 跨场景保留实例。
 */
@ccclass('GameManager')
export class GameManager extends Component {
  private static _instance: GameManager | null = null;

  static get instance(): GameManager {
    if (!GameManager._instance) {
      throw new Error('[GameManager] 尚未挂载到场景中');
    }
    return GameManager._instance;
  }

  readonly events = new EventBus();

  board: Cell[] = createBoard();
  energy: EnergyState = createEnergy();
  economy: EconomyState = createEconomy();
  collection = createCollection();
  level = createLevelState();
  order: OrderState = createOrderState(1);

  platform: Platform = wechatPlatform;

  private _energyAccumMs = 0;
  private _saveTimer: ReturnType<typeof setTimeout> | null = null;

  protected onLoad(): void {
    if (GameManager._instance && GameManager._instance !== this) {
      this.destroy();
      return;
    }
    GameManager._instance = this;
    director.addPersistRootNode(this.node);

    // 强制按宽度适配：720 铺满屏宽，高度随机型延伸（构建配置的 policy 在运行时未生效，这里兜底）
    view.setDesignResolutionSize(720, 1280, ResolutionPolicy.FIXED_WIDTH);
    // 关闭 debug 构建自带的 FPS/DrawCall 浮层，避免遮挡 UI
    profiler.hideStats();
    wechatInit();
    initOfflineQueue();
    // 全屏烘焙背景（对齐 Web 版 body background: #F2E9CA + main_bg）
    createSpriteNode('mainBg', this.node, 0, 720, 1280, 'sprites/bg/main_bg');
    this._mountUiSections();
    this.loadFromPlatform();
    void this._loginToServer();
  }

  /** 服务端登录（异步、失败降级为离线模式，不阻塞启动） */
  private async _loginToServer(): Promise<void> {
    try {
      if (getToken()) return;
      const { openid } = await this.platform.login();
      await login({ deviceId: openid, platform: this.platform.name });
      console.info('[game] 服务端登录成功');
    } catch (err) {
      console.warn('[game] 服务端登录失败，继续离线模式', err);
    }
  }

  protected onDestroy(): void {
    if (GameManager._instance === this) {
      GameManager._instance = null;
    }
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
    }
    this.flushSave();
  }

  protected update(dt: number): void {
    this._energyAccumMs += dt * 1000;
    if (this._energyAccumMs < ENERGY_TICK_MS) return;
    this._energyAccumMs = 0;

    const before = this.energy.current;
    tickEnergy(this.energy, Date.now());
    if (this.energy.current !== before) {
      this.events.emit('energy:changed', this.energy);
    }
  }

  /** 营业厅木牌与底部导航（对齐 Web 版页面结构，纯代码构建） */
  private _mountUiSections(): void {
    const cashier = new Node('CashierCounter');
    cashier.layer = this.node.layer;
    cashier.addComponent(UITransform).setContentSize(660, 120);
    cashier.setPosition(new Vec3(0, 330, 0));
    this.node.addChild(cashier);
    cashier.addComponent(CashierCounterComponent);

    const nav = new Node('BottomNav');
    nav.layer = this.node.layer;
    nav.addComponent(UITransform).setContentSize(720, 130);
    nav.setPosition(new Vec3(0, -575, 0));
    this.node.addChild(nav);
    nav.addComponent(BottomNavComponent);

    this._anchorSections(cashier, nav);
  }

  /**
   * 用 Widget 把各区块锚定到屏幕边缘——设计分辨率 720×1280 按宽度适配，
   * 高于 16:9 的机型（如 19.5:9）可视高度会超过 1280，锚定保证不裁边、不悬空。
   * top/bottom 均为区块外边缘到屏幕边缘的距离（已避开刘海与微信胶囊按钮）。
   */
  private _anchorSections(cashier: Node, nav: Node): void {
    const anchorTop = (node: Node | null, top: number): void => {
      if (!node) return;
      const w = node.getComponent(Widget) ?? node.addComponent(Widget);
      w.isAlignTop = true;
      w.top = top;
      w.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;
    };

    // 背景铺满整个可视区域
    const bg = this.node.getChildByName('mainBg');
    if (bg) {
      const w = bg.getComponent(Widget) ?? bg.addComponent(Widget);
      w.isAlignTop = w.isAlignBottom = w.isAlignLeft = w.isAlignRight = true;
      w.top = w.bottom = w.left = w.right = 0;
      w.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;
    }

    anchorTop(this.node.getChildByName('StatusBar'), 173);
    anchorTop(cashier, 266);
    anchorTop(this.node.getChildByName('OrderPanel'), 396);
    anchorTop(this.node.getChildByName('Board'), 630);

    const navWidget = nav.getComponent(Widget) ?? nav.addComponent(Widget);
    navWidget.isAlignBottom = true;
    navWidget.bottom = 16;
    navWidget.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;
  }

  // --- 持久化 ---

  private loadFromPlatform(): void {
    const save = this.platform.load();
    if (!save) {
      placeNewMothers(this.board, 1);
      this.events.emit('board:reset', this.board);
      return;
    }
    if (Array.isArray(save.board) && save.board.length === BOARD_LENGTH) {
      this.board = save.board.map(c => ({ itemId: c.itemId }));
    }
    if (save.energy) this.energy = { ...save.energy };
    if (save.economy) this.economy = { ...save.economy };
    if (Array.isArray(save.collection)) {
      this.collection = {
        unlockedIds: new Set(save.collection),
        unclaimedIds: new Set(save.collectionUnclaimed ?? []),
      };
    }
    if (isValidOrderState(save.orders)) this.order = save.orders;
    this.events.emit('save:loaded', save);
  }

  /** 防抖保存：高频调用合并成一次写入。 */
  scheduleSave(): void {
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      this.flushSave();
    }, SAVE_DEBOUNCE_MS);
  }

  flushSave(): void {
    const data = serialize(this.board, this.energy, this.economy, this.collection, this.order);
    this.platform.save(data);
  }

  // --- 游戏动作（薄包装，只负责事件广播 + 自动存档） ---

  activateMotherAt(idx: number): boolean {
    const before = this.energy.current;
    activateMother(this.board, idx, this.energy, false);
    const triggered = this.energy.current !== before;
    if (triggered) {
      this.events.emit('board:changed', this.board);
      this.events.emit('energy:changed', this.energy);
      this.scheduleSave();
    }
    return triggered;
  }

  dragMergeAt(from: number, to: number): boolean {
    const ok = dragMerge(this.board, from, to);
    if (ok) {
      this.events.emit('board:changed', this.board);
      this.scheduleSave();
    }
    return ok;
  }
}

// `deserialize` 仅供后续 cloud-load 流程引用，主流程由 platform.load() 内部调用。
export { deserialize };
