import { _decorator, Component, Node, ResolutionPolicy, UITransform, Vec3, Widget, director, profiler, view } from 'cc';

import type {
  BlindBoxResult,
  BlindBoxState,
  Cell,
  EconomyState,
  EnergyState,
  Platform,
  ShardState,
} from '../core/types';
import {
  BOARD_LENGTH,
  createBoard,
  dragMerge,
  activateMother,
  findEmptyCell,
  placeNewMothers,
} from '../core/board';
import { initAudio, playBgm, playSfx } from './AudioManager';
import { applyEnv } from '../env';
import { createEnergy, rewardEnergy, tickEnergy } from '../core/energy';
import { addCoins, addDiamonds, createEconomy, spendCoins, spendDiamonds } from '../core/economy';
import { claimCollectionReward, createCollection, unlockItem } from '../core/collection';
import { addExp, createLevelState, getUnlockedCategoriesByLevel } from '../core/level';
import { addIngredientShard, addShard, createShardState } from '../core/shard';
import {
  createBlindBoxState,
  NORMAL_BOX_COST,
  openNormalBox,
  openPremiumBox,
  PREMIUM_BOX_COST,
} from '../core/blindbox';
import { createBakeryState, placeDeco, removeDeco, type BakeryState } from '../core/bakery';
import { buyDecoration, createShopState, type ShopState } from '../core/shop';
import { RARE_ITEM_BY_CATEGORY, type Category } from '../data/items';
import { completeOrder, createOrderState, isOrderComplete, isValidOrderState, type OrderState } from '../core/order';
import { getConfig } from '../core/config';
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
  shard: ShardState = createShardState();
  blindBox: BlindBoxState = createBlindBoxState();
  bakery: BakeryState = createBakeryState();
  shop: ShopState = createShopState();

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
    // 环境注入必须在 wechatInit / 登录 / 广告之前：小游戏没有 origin，
    // request 的默认相对地址 '/api' 发不出去（见 env.ts）
    applyEnv();
    wechatInit();
    initAudio(this.node);
    playBgm();
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
    nav.addComponent(UITransform).setContentSize(720, 142);
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
      // 开局只放母棋，与 Web 一致：棋盘上预置可合成的物品会让新手引导第三步
      // 「拖到一起，合成」失去教学意义（玩家不点母棋也能直接合）
      placeNewMothers(this.board, 1);
      this.autoMatchOrders();
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
    if (save.shards || save.completedRareIds || save.ingredientShards) {
      this.shard = {
        shards: { ...(save.shards ?? {}) },
        completedRareIds: new Set(save.completedRareIds ?? []),
        ingredientShards: { ...(save.ingredientShards ?? {}) },
      };
    }
    if (save.blindBox) this.blindBox = { ...save.blindBox };
    // bakery / shop 结构已由 deserialize 的 safeBakery / safeShop 校验
    if (save.bakery) this.bakery = save.bakery as BakeryState;
    if (save.shop) this.shop = save.shop as ShopState;
    this.autoMatchOrders();
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
    const data = serialize(this.board, this.energy, this.economy, this.collection, this.order, {
      bakery: this.bakery,
      shop: this.shop,
      shardState: this.shard,
      blindBox: this.blindBox,
    });
    this.platform.save(data);
  }

  // --- 游戏动作（薄包装，只负责事件广播 + 自动存档） ---

  activateMotherAt(idx: number): boolean {
    const spawnIdx = activateMother(this.board, idx, this.energy, false);
    if (spawnIdx < 0) return false;
    this.events.emit('board:changed', this.board);
    this.events.emit('energy:changed', this.energy);
    this.events.emit('fx:spawn', spawnIdx);
    this.autoMatchOrders();
    this.scheduleSave();
    return true;
  }

  dragMergeAt(from: number, to: number): boolean {
    const merged = dragMerge(this.board, from, to);
    // dragMerge 未合成时会交换两格，同样属于棋盘变化，需要广播 + 存档
    this.events.emit('board:changed', this.board);
    this.scheduleSave();
    if (merged) {
      this.events.emit('fx:merge', to);
      playSfx('merge');
    }
    this.autoMatchOrders();
    return merged;
  }

  // --- 订单交付（对齐 Web useGame：自动匹配 + 手动领取） ---

  /** 棋盘物品与订单需求自动匹配；一个物品只服务一个需求 */
  autoMatchOrders(): void {
    const reserved = new Set<number>();
    const boardIndex = new Map<string, number[]>();
    for (let i = 0; i < this.board.length; i++) {
      const id = this.board[i].itemId;
      if (!id) continue;
      const arr = boardIndex.get(id);
      if (arr) arr.push(i);
      else boardIndex.set(id, [i]);
    }

    for (const order of this.order.activeOrders) {
      for (const req of order.requirements) {
        if (req.fulfilled) {
          if (req.matchedBoardIdx != null && this.board[req.matchedBoardIdx]?.itemId === req.itemId) {
            reserved.add(req.matchedBoardIdx);
            continue;
          }
          req.fulfilled = false;
          req.matchedBoardIdx = undefined;
        }
        const candidates = boardIndex.get(req.itemId);
        const boardIdx = candidates?.find(i => !reserved.has(i));
        if (boardIdx == null) {
          req.matchedBoardIdx = undefined;
          continue;
        }
        req.matchedBoardIdx = boardIdx;
        req.fulfilled = true;
        reserved.add(boardIdx);
      }
    }
    this.events.emit('orders:changed', this.order);
  }

  /** 领取已完成订单：消耗棋盘匹配物品 → 发奖励（金币/精力/经验）→ 补新订单 */
  collectOrder(orderId: string): boolean {
    const order = this.order.activeOrders.find(o => o.id === orderId);
    if (!order || !isOrderComplete(order)) return false;

    for (const req of order.requirements) {
      if (req.matchedBoardIdx != null && this.board[req.matchedBoardIdx]?.itemId === req.itemId) {
        this.board[req.matchedBoardIdx] = {};
      }
      req.matchedBoardIdx = undefined;
    }

    const difficulty = order.difficulty;
    const reward = completeOrder(this.order, orderId, getConfig().order.maxActive, this.level.level);
    if (!reward) return false;

    addCoins(this.economy, Math.max(0, Math.min(Math.floor(reward.coins ?? 0), 10000)));
    if (reward.energy) rewardEnergy(this.energy, reward.energy);

    // 订单经验：按难度（对齐 Web ORDER_EXP）
    const ORDER_EXP: Record<string, number> = { easy: 5, normal: 10, hard: 20, rare: 30 };
    const levelUp = addExp(this.level, ORDER_EXP[difficulty] ?? 10);
    if (levelUp?.leveledUp) {
      placeNewMothers(this.board, this.level.level);
      this.events.emit('level:changed', this.level);
    }

    playSfx('order_complete');
    this.events.emit('board:changed', this.board);
    this.events.emit('economy:changed', this.economy);
    this.events.emit('energy:changed', this.energy);
    this.autoMatchOrders();
    this.scheduleSave();
    return true;
  }


  // --- 图鉴 ---

  /** 当前等级已解锁的品类 */
  get unlockedCategories(): Set<Category> {
    return getUnlockedCategoriesByLevel(this.level.level);
  }

  /** 领取图鉴钻石奖励（与 Web 版 useGame.claimCollectionDiamond 同构：每件 +1 钻石） */
  claimCollectionDiamond(itemId: string): boolean {
    if (!claimCollectionReward(this.collection, itemId)) return false;
    addDiamonds(this.economy, 1);
    this.events.emit('collection:changed', this.collection);
    this.events.emit('economy:changed', this.economy);
    this.scheduleSave();
    return true;
  }

  // --- 盲盒 ---

  /** 开盲盒：扣费 → 抽取 → 应用结果。余额不足返回 null。 */
  openBlindBox(tier: 'normal' | 'premium'): BlindBoxResult | null {
    if (tier === 'normal') {
      if (!spendCoins(this.economy, NORMAL_BOX_COST)) return null;
    } else if (!spendDiamonds(this.economy, PREMIUM_BOX_COST)) {
      return null;
    }

    const open = tier === 'normal' ? openNormalBox : openPremiumBox;
    const { result, newState } = open(this.blindBox, this.shard, this.unlockedCategories);
    this.blindBox = newState;
    this._applyBlindBoxResult(result);

    this.events.emit('economy:changed', this.economy);
    this.events.emit('blindbox:opened', result, this.blindBox);
    this.scheduleSave();
    return result;
  }

  /** 确认指定碎片品类（高级盲盒 targetShard 结果，由 UI 弹品类选择后调用） */
  confirmTargetShard(category: Category): boolean {
    const result = addShard(this.shard, category, 1);
    if (result.added <= 0) return false;
    if (result.completed) {
      const rare = RARE_ITEM_BY_CATEGORY.get(category);
      if (rare) unlockItem(this.collection, rare.id);
      this.events.emit('collection:changed', this.collection);
    }
    this.events.emit('shard:changed', this.shard);
    this.scheduleSave();
    return true;
  }

  /** 应用盲盒结果到游戏状态（与 Web 版 applyBlindBoxResult 同构） */
  private _applyBlindBoxResult(result: BlindBoxResult): void {
    switch (result.type) {
      case 'coins':
        addCoins(this.economy, result.amount);
        break;
      case 'energy':
        rewardEnergy(this.energy, result.amount);
        this.events.emit('energy:changed', this.energy);
        break;
      case 'shard':
        if (result.category) {
          const shardResult = addShard(this.shard, result.category, result.amount);
          if (shardResult.completed) {
            const rare = RARE_ITEM_BY_CATEGORY.get(result.category as Category);
            if (rare) unlockItem(this.collection, rare.id);
            this.events.emit('collection:changed', this.collection);
          }
          this.events.emit('shard:changed', this.shard);
        }
        break;
      case 'targetShard':
        // UI 层弹品类选择，选定后走 confirmTargetShard()
        break;
      case 'ingredientShard':
        if (result.ingredientId) {
          addIngredientShard(this.shard, result.ingredientId, result.amount);
          this.events.emit('shard:changed', this.shard);
        }
        break;
      case 'item':
        if (result.itemId) {
          const slotIdx = findEmptyCell(this.board);
          if (slotIdx >= 0) {
            this.board[slotIdx] = { itemId: result.itemId };
            unlockItem(this.collection, result.itemId);
            this.events.emit('board:changed', this.board);
            this.events.emit('collection:changed', this.collection);
          }
        }
        break;
    }
  }

  // --- 烘焙坊 / 装饰 ---

  /** 购买装饰（金币），成功返回 true */
  buyDeco(decoId: string): boolean {
    const r = buyDecoration(this.shop, decoId, this.economy.coins);
    if (!r.success) return false;
    spendCoins(this.economy, r.cost);
    this.shop = r.newState;
    this.events.emit('economy:changed', this.economy);
    this.events.emit('shop:changed', this.shop);
    this.scheduleSave();
    return true;
  }

  /** 把已拥有的装饰摆放到槽位（重复摆放会自动从原槽位移走） */
  placeDecoAt(decoId: string, slotId: string): void {
    placeDeco(this.bakery, decoId, slotId);
    this.events.emit('bakery:changed', this.bakery);
    this.scheduleSave();
  }

  /** 从布局中收起某装饰 */
  removeDecoFrom(decoId: string): boolean {
    const ok = removeDeco(this.bakery, decoId);
    if (ok) {
      this.events.emit('bakery:changed', this.bakery);
      this.scheduleSave();
    }
    return ok;
  }
}

// `deserialize` 仅供后续 cloud-load 流程引用，主流程由 platform.load() 内部调用。
export { deserialize };
