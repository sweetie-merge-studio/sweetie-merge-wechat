import { _decorator, assetManager, Component, Game, Input, Node, ResolutionPolicy, UITransform, Vec3, Widget, director, game, input, profiler, view } from 'cc';

import type {
  BlindBoxResult,
  BlindBoxState,
  Cell,
  EconomyState,
  EnergyState,
  ItemId,
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
import { initAudio, notifyUserInteraction, playBgm, playSfx } from './AudioManager';
import { applyEnv } from '../env';
import { addEnergyUncapped, coinRefillEnergy, createEnergy, rewardEnergy, tickEnergy } from '../core/energy';
import { calcOfflineEnergy, formatOfflineDuration } from '../core/offline';
import { addCoins, addDiamonds, createEconomy, spendCoins, spendDiamonds } from '../core/economy';
import { claimCollectionReward, createCollection, unlockItem } from '../core/collection';
import { addExp, confirmLevelUp, createLevelState, getLevelDef, getPendingLevelUpCost, getUnlockedCategoriesByLevel, type LevelState } from '../core/level';
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
import {
  completeStep,
  createTutorialState,
  getCurrentStep,
  isTutorialActive,
  skipTutorial,
  type TutorialState,
  type TutorialStepDef,
  type TutorialStepId,
} from '../core/tutorial';
import {
  advanceTask,
  checkNewDay,
  claimSingleTask,
  claimTaskReward,
  createDailyState,
  isFirstDay,
  isFirstOrderBonusAvailable,
  markFirstOrderDoubled,
  signIn,
  type DailyState,
  type LoginReward,
} from '../core/daily';
import {
  addToBackpack,
  createBackpack,
  removeFromBackpack,
  unlockMoreSlots,
  unlockSlotsCost,
  type BackpackState,
} from '../core/backpack';
import { RARE_ITEM_BY_CATEGORY, getItemById, isMother, type Category } from '../data/items';
import { completeOrder, createOrderState, isOrderComplete, isValidOrderState, type OrderState } from '../core/order';
import { getConfig } from '../core/config';
import { serialize, deserialize } from '../core/storage';
import { wechatPlatform, wechatInit, getLaunchScene, getLastRewardedAdError } from '../platform/wechat';
import { initAnalyticsWechat } from '../platform/analytics-wechat';
import { enqueue, initOfflineQueue, isOnline } from '../platform/offline-queue';
import { initNetworkListener } from '../platform/network';
import { initVibrate } from '../platform/vibrate';
import { fontManager } from '../core/font-manager';
import { fetchPrivacyDocs } from '../core/privacy-config';
import { Events, trackEvent } from '../core/analytics';
import { canWatchEnergyAd, recordEnergyAdShown } from '../core/ad-trigger';
import { claimAdReward, type AdRewardType } from '../api/rewards';
import { buyEnergy, type BuyCurrency, type BuyEnergyType } from '../api/energy';
import { getToken } from '../api/request';
import { login } from '../api/auth';
import { EventBus } from '../core/EventBus';
import { createSpriteNode } from '../components/ui-factory';
import { getSectionTops } from '../components/layout';
import { CashierCounterComponent } from '../components/CashierCounterComponent';
import { BottomNavComponent } from '../components/BottomNavComponent';
import { OfflineRewardModal } from '../components/OfflineRewardModal';
import { TutorialOverlay } from '../components/TutorialOverlay';
import { PrivacyConsentModal } from '../components/PrivacyConsentModal';

const { ccclass } = _decorator;

const SAVE_DEBOUNCE_MS = 1500;
const ENERGY_TICK_MS = 1000;

/** 看广告得钻石的数量（对齐 Web DIAMOND_PACKS 的 dp1；商店页展示同一常量） */
export const AD_DIAMOND_REWARD = 3;

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
  daily: DailyState = createDailyState();
  backpack: BackpackState = createBackpack();
  tutorial: TutorialState = createTutorialState();

  platform: Platform = wechatPlatform;

  // --- 连击系统 ---
  /** 当前连击数（首次合成为 1，连续合成递增） */
  comboCount = 0;
  /** 上次合成时间戳（用于判断连击是否超时） */
  private _comboLastTime = 0;
  /** 连击时间窗口（毫秒），3 秒内继续合成算连击 */
  private static readonly COMBO_WINDOW_MS = 3000;
  /** 连击超时定时器 */
  private _comboTimer: ReturnType<typeof setTimeout> | null = null;

  private _energyAccumMs = 0;
  private _saveTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * 待领取的离线收益，读档时算出，领取后清空。
   * 未领取前不发放精力——发放时机由 UI 的领取/翻倍按钮决定。
   */
  offlineReward: { duration: string; energy: number } | null = null;

  /** 上次切后台的时间戳（回前台超 30s 判定为新会话，补打 session_start） */
  private _hiddenAt = 0;

  protected onLoad(): void {
    if (GameManager._instance && GameManager._instance !== this) {
      this.destroy();
      return;
    }
    GameManager._instance = this;
    director.addPersistRootNode(this.node);

    // 小游戏被系统杀进程不会走 onDestroy，切后台（onHide）时必须立即落盘，
    // 否则防抖窗口内（SAVE_DEBOUNCE_MS）的最近操作会丢
    game.on(Game.EVENT_HIDE, this._onGameHide, this);
    game.on(Game.EVENT_SHOW, this._onGameShow, this);

    // 强制按宽度适配：720 铺满屏宽，高度随机型延伸（构建配置的 policy 在运行时未生效，这里兜底）
    view.setDesignResolutionSize(720, 1280, ResolutionPolicy.FIXED_WIDTH);
    // 关闭 debug 构建自带的 FPS/DrawCall 浮层，避免遮挡 UI
    profiler.hideStats();
    // 环境注入必须在 wechatInit / 登录 / 广告之前：小游戏没有 origin，
    // request 的默认相对地址 '/api' 发不出去（见 env.ts）
    applyEnv();
    wechatInit();
    initAnalyticsWechat();
    initAudio(this.node);
    playBgm();
    // 微信小游戏平台要求音频在用户首次交互后才能播放，监听首次触摸解锁
    const onFirstTouch = () => {
      notifyUserInteraction();
      input.off(Input.EventType.TOUCH_START, onFirstTouch, this);
    };
    input.on(Input.EventType.TOUCH_START, onFirstTouch, this);
    initVibrate();
    initNetworkListener();
    initOfflineQueue();
    // 预加载自定义字体（所有弹窗/UI 文字统一风格）
    fontManager.preload();
    // 异步拉取隐私文档配置（后端可覆盖本地默认值，失败静默降级）
    void fetchPrivacyDocs();
    // 全屏烘焙背景（对齐 Web 版 body background: #F2E9CA + main_bg）
    createSpriteNode('mainBg', this.node, 0, 720, 1280, 'sprites/bg/main_bg');
    this._mountUiSections();
    this.loadFromPlatform();
    trackEvent(Events.SESSION_START, {
      platform: this.platform.name,
      is_first_day: isFirstDay(this.daily),
      scene: getLaunchScene(),
    });
    void this._loginToServer();
    // 异步预加载所有分包：首次打开分包弹窗时 loadBundle 约 800ms，
    // 启动时后台预加载后打开弹窗即可秒开。不阻塞启动，失败静默降级。
    this._preloadBundles();
  }

  /**
   * 异步预加载所有分包。
   *
   * 首次打开分包弹窗时 assetManager.loadBundle 约 800ms（从微信 CDN 下载分包代码），
   * 启动时后台预加载后打开弹窗即可秒开。不阻塞启动，失败静默降级（打开时再加载）。
   */
  private _preloadBundles(): void {
    const bundles = ['daily', 'backpack', 'store', 'collection', 'blindbox', 'bakery', 'game-audio'];
    let loaded = 0;
    for (const name of bundles) {
      assetManager.loadBundle(name, err => {
        loaded++;
        if (err) {
          console.warn(`[GameManager] 预加载分包 ${name} 失败:`, err);
        }
        if (loaded === bundles.length) {
          console.info(`[GameManager] 所有分包预加载完成（${bundles.length} 个）`);
        }
      });
    }
  }

  protected start(): void {
    // 放在 start：onLoad 里 Widget 尚未对齐，弹窗全屏遮罩会按未定型的尺寸绘制
    // 隐私协议优先：未同意时先弹隐私协议，同意后再弹离线收益/教程
    const privacyShown = PrivacyConsentModal.showIfNeeded(this.node, {
      onAgree: () => {
        // 同意后补弹离线收益和教程
        OfflineRewardModal.showIfAny(this.node);
        TutorialOverlay.showIfActive(this.node);
      },
      onDecline: () => {
        // 拒绝后不弹其他弹窗
      },
    });
    if (!privacyShown) {
      // 已同意过隐私协议，直接弹离线收益和教程
      OfflineRewardModal.showIfAny(this.node);
      TutorialOverlay.showIfActive(this.node);
    }
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
    game.off(Game.EVENT_HIDE, this._onGameHide, this);
    game.off(Game.EVENT_SHOW, this._onGameShow, this);
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
    }
    this.flushSave();
  }

  private _onGameHide(): void {
    this._hiddenAt = Date.now();
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
    }
    this.flushSave();
  }

  private _onGameShow(): void {
    if (this._hiddenAt && Date.now() - this._hiddenAt > 30_000) {
      trackEvent(Events.SESSION_START, {
        platform: this.platform.name,
        is_first_day: isFirstDay(this.daily),
        scene: getLaunchScene(),
      });
    }
    this._hiddenAt = 0;
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

    const tops = getSectionTops();
    anchorTop(this.node.getChildByName('StatusBar'), tops.statusBar);
    anchorTop(cashier, tops.cashier);
    anchorTop(this.node.getChildByName('OrderPanel'), tops.orderPanel);
    anchorTop(this.node.getChildByName('Board'), tops.board);

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
    // bakery / shop / daily / backpack 结构已由 deserialize 的 safeXxx 校验
    if (save.bakery) this.bakery = save.bakery as BakeryState;
    if (save.shop) this.shop = save.shop as ShopState;
    if (save.level) this.level = { ...createLevelState(), ...(save.level as Partial<LevelState>) };
    // 存档可能来自旧版本（缺字段），用默认态兜底后再覆盖
    if (save.daily) this.daily = { ...createDailyState(), ...(save.daily as Partial<DailyState>) };
    if (save.backpack) this.backpack = { ...createBackpack(), ...(save.backpack as Partial<BackpackState>) };
    if (save.tutorial) {
      this.tutorial = { ...createTutorialState(), ...(save.tutorial as Partial<TutorialState>) };
    } else {
      // 老存档没有 tutorial 字段：已在玩的玩家不该被倒回新手引导
      this.tutorial = skipTutorial(createTutorialState());
    }
    // 读档即结算跨天：重置任务、推进/断连续登录
    checkNewDay(this.daily);
    this._checkOfflineReward(save.lastOnline);
    this.autoMatchOrders();
    // 旧存档迁移：此前图鉴解锁逻辑漏调，棋盘中已有的物品从未进 unlockedIds。
    // 读档时遍历棋盘 + 背包，把已拥有的非母棋物品补进图鉴（同时进未领取列表，可补领钻石）。
    this._backfillCollectionFromInventory();
    this.events.emit('save:loaded', save);
  }

  /**
   * 从棋盘和背包中补全图鉴解锁状态（旧存档迁移用）。
   * 遍历所有已拥有的非母棋物品，调用 unlockItem 加入 unlockedIds + unclaimedIds。
   * 已解锁的物品 unlockItem 会静默跳过，不会重复发放。
   */
  private _backfillCollectionFromInventory(): void {
    const seen = new Set<string>();
    // 棋盘物品
    for (const cell of this.board) {
      const id = cell.itemId;
      if (!id || isMother(id) || seen.has(id)) continue;
      seen.add(id);
      unlockItem(this.collection, id);
    }
    // 背包物品
    for (const entry of this.backpack.items) {
      if (!entry.itemId || seen.has(entry.itemId)) continue;
      seen.add(entry.itemId);
      unlockItem(this.collection, entry.itemId);
    }
    if (seen.size > 0) {
      this.events.emit('collection:changed', this.collection);
      this.scheduleSave();
    }
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
      // level 此前漏传，等级与经验重启即回退到 Lv1
      level: this.level,
      daily: this.daily,
      backpack: this.backpack,
      tutorial: this.tutorial,
    });
    this.platform.save(data);
  }

  // --- 游戏动作（薄包装，只负责事件广播 + 自动存档） ---

  activateMotherAt(idx: number): boolean {
    // 引导期间产出位置要拉开距离，让「拖到一起」的手势演示看得清
    const spawnIdx = activateMother(this.board, idx, this.energy, this.tutorialActive);
    if (spawnIdx < 0) return false;

    // 点母体指引：棋盘上出现2个及以上相同的可合成物品时才完成，
    // 确保下一步「拖拽合成」有东西可拖，两步连贯不中断。
    const step = this.tutorialStep;
    if (step?.id === 'tapMother') {
      const counts = new Map<string, number>();
      for (const c of this.board) {
        if (c.itemId && !isMother(c.itemId)) {
          counts.set(c.itemId, (counts.get(c.itemId) ?? 0) + 1);
        }
      }
      if (Array.from(counts.values()).some(n => n >= 2)) {
        this.completeTutorialStep('tapMother');
      }
    }
    this.events.emit('board:changed', this.board);
    this.events.emit('energy:changed', this.energy);
    this.events.emit('fx:spawn', spawnIdx);
    // 母棋产出 Lv.1 物品时解锁图鉴（此前漏调）
    const spawnId = this.board[spawnIdx]?.itemId;
    if (spawnId) {
      unlockItem(this.collection, spawnId);
      this.events.emit('collection:changed', this.collection);
    }
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
      const resultId = this.board[to]?.itemId;
      this.events.emit('fx:merge', to, resultId);
      playSfx('merge');
      this._advanceDaily('merge_10');
      this.completeTutorialStep('dragMerge');
      this._updateCombo();
      // 合成产出新物品时解锁图鉴（此前漏调，导致图鉴始终全锁）
      if (resultId) {
        unlockItem(this.collection, resultId);
        this.events.emit('collection:changed', this.collection);
      }
    } else {
      // 合成失败（交换）时连击中断
      this._resetCombo();
    }
    this.autoMatchOrders();
    return merged;
  }

  /**
   * 更新连击计数：在时间窗口内连续合成则递增，否则重置为 1。
   * 触发 combo:changed 事件，UI 层据此显示连击文字并增强特效。
   */
  private _updateCombo(): void {
    const now = Date.now();
    if (now - this._comboLastTime <= GameManager.COMBO_WINDOW_MS && this.comboCount > 0) {
      this.comboCount += 1;
    } else {
      this.comboCount = 1;
    }
    this._comboLastTime = now;

    // 清除旧的超时定时器
    if (this._comboTimer) {
      clearTimeout(this._comboTimer);
      this._comboTimer = null;
    }
    // 设置新的超时：窗口结束后连击清零
    this._comboTimer = setTimeout(() => {
      this.comboCount = 0;
      this._comboTimer = null;
      this.events.emit('combo:changed', 0);
    }, GameManager.COMBO_WINDOW_MS);

    this.events.emit('combo:changed', this.comboCount);
  }

  /** 连击中断（合成失败/交换时）：清零并广播 */
  private _resetCombo(): void {
    if (this._comboTimer) {
      clearTimeout(this._comboTimer);
      this._comboTimer = null;
    }
    if (this.comboCount !== 0) {
      this.comboCount = 0;
      this.events.emit('combo:changed', 0);
    }
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

  /**
   * 领取已完成订单：消耗棋盘匹配物品 → 发奖励（金币/精力/经验）→ 补新订单。
   * @returns 实际发放的金币数（未领取成功返回 0），供订单翻倍弹窗计算等额加倍
   */
  collectOrder(orderId: string): number {
    // 引导期间阻止领取订单，让玩家专注核心操作（点母体+拖拽合成）
    if (this.tutorialStep) return 0;

    const order = this.order.activeOrders.find(o => o.id === orderId);
    if (!order || !isOrderComplete(order)) return 0;

    for (const req of order.requirements) {
      if (req.matchedBoardIdx != null && this.board[req.matchedBoardIdx]?.itemId === req.itemId) {
        this.board[req.matchedBoardIdx] = {};
      }
      req.matchedBoardIdx = undefined;
    }

    const difficulty = order.difficulty;
    const startedAt = order.createdAt;
    const beforeIds = new Set(this.order.activeOrders.map(o => o.id));
    const reward = completeOrder(this.order, orderId, getConfig().order.maxActive, this.level.level);
    if (!reward) return 0;

    let coins = Math.max(0, Math.min(Math.floor(reward.coins ?? 0), 10000));
    // 每日首单双倍（蓝图 01 §3 留存钩子）：当天第一个完成的订单，金币与精力 ×2
    const firstBonus = isFirstOrderBonusAvailable(this.daily);
    if (firstBonus) {
      coins *= 2;
      markFirstOrderDoubled(this.daily);
    }
    addCoins(this.economy, coins);
    if (reward.energy) rewardEnergy(this.energy, firstBonus ? reward.energy * 2 : reward.energy);

    // 订单经验：按难度（对齐 Web ORDER_EXP）
    const ORDER_EXP: Record<string, number> = { easy: 5, normal: 10, hard: 20, rare: 30 };
    const levelUp = addExp(this.level, ORDER_EXP[difficulty] ?? 10);
    if (levelUp?.leveledUp) {
      placeNewMothers(this.board, this.level.level);
      this.events.emit('level:changed', this.level);
    }

    playSfx('order_complete');
    trackEvent(Events.ORDER_COMPLETE, {
      difficulty,
      coins,
      doubled_first: firstBonus,
      player_level: this.level.level,
      duration_s: Math.max(0, Math.round((Date.now() - startedAt) / 1000)),
    });
    // 补充进来的新订单记 order_start，与 order_complete 组成漏斗
    for (const o of this.order.activeOrders) {
      if (!beforeIds.has(o.id)) {
        trackEvent(Events.ORDER_START, { difficulty: o.difficulty, player_level: this.level.level });
      }
    }
    this._advanceDaily('order_2');
    this.events.emit('board:changed', this.board);
    this.events.emit('economy:changed', this.economy);
    this.events.emit('energy:changed', this.energy);
    this.autoMatchOrders();
    this.scheduleSave();
    return coins;
  }

  // --- 等级升级 ---

  /**
   * 支付金币升级（经验已满 pendingLevelUp 时调用）。
   * 扣金币 → confirmLevelUp → 发放奖励（精力/金币）→ 放置新母棋 → 广播事件。
   * @returns 是否升级成功
   */
  payLevelUp(): boolean {
    const cost = getPendingLevelUpCost(this.level);
    if (cost <= 0) return false;
    if (!spendCoins(this.economy, cost)) return false;

    const result = confirmLevelUp(this.level);
    if (result?.leveledUp) {
      const def = getLevelDef(result.newLevel);
      rewardEnergy(this.energy, def.rewardEnergy);
      addCoins(this.economy, def.rewardCoins);
      if (result.unlockedCategories.length > 0) {
        addCoins(this.economy, result.unlockedCategories.length * 100);
      }
      // 升级后按新等级补母棋（与 collectOrder 中免费升级后的处理一致）
      placeNewMothers(this.board, this.level.level);
      this.events.emit('level:up', result.newLevel);
      this.events.emit('economy:changed', this.economy);
      this.events.emit('energy:changed', this.energy);
      this.events.emit('board:changed', this.board);
    }
    this.events.emit('level:changed', this.level);
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

  // --- 每日 ---

  /**
   * 推进每日任务进度并广播。
   * 任务不存在时 advanceTask 内部静默返回，这里无需另行判空。
   */
  private _advanceDaily(taskId: string, amount = 1): void {
    advanceTask(this.daily, taskId, amount);
    this.events.emit('daily:changed', this.daily);
  }

  /** 每日签到，返回当天的登录奖励（已签到返回 null） */
  signInDaily(): LoginReward | null {
    const reward = signIn(this.daily);
    if (!reward) return null;

    if (reward.coins) addCoins(this.economy, reward.coins);
    if (reward.energy) rewardEnergy(this.energy, reward.energy);
    // 第 7 天直接解锁图鉴物品
    if (reward.unlockItem) {
      unlockItem(this.collection, reward.unlockItem);
      this.events.emit('collection:changed', this.collection);
    }

    this.events.emit('daily:changed', this.daily);
    this.events.emit('economy:changed', this.economy);
    this.events.emit('energy:changed', this.energy);
    this.scheduleSave();
    return reward;
  }

  /** 领取单个每日任务奖励，返回获得的金币（不可领返回 null） */
  claimDailyTask(taskId: string): number | null {
    const coins = claimSingleTask(this.daily, taskId);
    if (coins == null) return null;
    addCoins(this.economy, coins);
    this.events.emit('daily:changed', this.daily);
    this.events.emit('economy:changed', this.economy);
    this.scheduleSave();
    return coins;
  }

  /** 领取全部任务完成的宝箱奖励，返回金币（不可领返回 null） */
  claimDailyChest(): number | null {
    const coins = claimTaskReward(this.daily);
    if (coins == null) return null;
    addCoins(this.economy, coins);
    this.events.emit('daily:changed', this.daily);
    this.events.emit('economy:changed', this.economy);
    this.scheduleSave();
    return coins;
  }

  // --- 离线收益 ---

  /**
   * 读档时结算离线恢复的精力。
   *
   * 无论是否够门槛都要把 lastTickAt 推进到当前，否则 update 里的 tickEnergy
   * 会把同一段离线时间再算一遍（与 Web checkOfflineReward 同一处理）。
   */
  private _checkOfflineReward(lastOnline: number): void {
    const now = Date.now();
    const gained = calcOfflineEnergy(this.energy, lastOnline, now);
    this.energy.lastTickAt = now;
    if (gained < 1) return;
    this.offlineReward = {
      duration: formatOfflineDuration(lastOnline, now),
      energy: gained,
    };
  }

  /**
   * 领取离线收益。
   * @param double 是否翻倍（由广告回调决定，广告未看完按 1x 发放）
   */
  collectOfflineReward(double = false): number {
    const data = this.offlineReward;
    if (!data) return 0;
    const amount = double ? data.energy * 2 : data.energy;
    rewardEnergy(this.energy, amount);
    this.offlineReward = null;
    this.events.emit('energy:changed', this.energy);
    this.events.emit('offline:claimed', amount);
    this.scheduleSave();
    return amount;
  }

  /** 看广告翻倍领取离线收益；广告未播完则按 1x 发放 */
  async collectOfflineRewardDouble(): Promise<number> {
    const ok = await this.platform.showRewardedAd();
    if (ok) this._afterAdWatched();
    return this.collectOfflineReward(ok);
  }

  // --- 广告激励 ---

  /**
   * 广告看完后的通用记账：推进每日任务。
   * 奖励发放各自处理，这里只做共通部分。
   */
  private _afterAdWatched(): void {
    this._advanceDaily('ad_2');
  }

  /**
   * 上报广告奖励给服务端，失败或离线时进离线队列。
   * 与 Web useGame 的 serverClaimAdReward 分支同构。
   */
  private _reportAdReward(rewardType: AdRewardType): void {
    if (isOnline()) {
      claimAdReward(rewardType).catch(() => {
        enqueue({ type: 'adReward', payload: { rewardType } });
      });
    } else {
      enqueue({ type: 'adReward', payload: { rewardType } });
    }
  }

  /** 能量位广告当前是否可看（单日上限 + 冷却），UI 据此决定是否显示入口 */
  get energyAdAvailable(): boolean {
    return canWatchEnergyAd(this.daily, Date.now());
  }

  /** 今日首单双倍是否还可用（订单卡片预告角标用） */
  get firstOrderBonusAvailable(): boolean {
    return isFirstOrderBonusAvailable(this.daily);
  }

  /** 精力耗尽时看广告补 20 点（不受上限限制） */
  async watchAdForEnergy(): Promise<boolean> {
    if (!canWatchEnergyAd(this.daily, Date.now())) return false;
    trackEvent(Events.AD_TRIGGER, { placement: 'energy', player_level: this.level.level });
    const ok = await this.platform.showRewardedAd();
    trackEvent(Events.AD_FINISH, { placement: 'energy', is_ended: ok, error_code: getLastRewardedAdError() });
    if (!ok) return false;
    addEnergyUncapped(this.energy, getConfig().energy.adReward);
    recordEnergyAdShown(this.daily, Date.now());
    this._afterAdWatched();
    this.events.emit('energy:changed', this.energy);
    this.scheduleSave();
    this._reportAdReward('energy');
    return true;
  }

  /** 看广告得钻石 */
  async watchAdForDiamonds(): Promise<boolean> {
    trackEvent(Events.AD_TRIGGER, { placement: 'diamonds', player_level: this.level.level });
    const ok = await this.platform.showRewardedAd();
    trackEvent(Events.AD_FINISH, { placement: 'diamonds', is_ended: ok, error_code: getLastRewardedAdError() });
    if (!ok) return false;
    addDiamonds(this.economy, AD_DIAMOND_REWARD);
    this._afterAdWatched();
    this.events.emit('economy:changed', this.economy);
    this.scheduleSave();
    this._reportAdReward('diamonds');
    return true;
  }

  /**
   * 看广告直接获得稀有物品。
   * 空位在广告播放前后各查一次：广告期间棋盘可能被订单占满（race condition）。
   */
  async watchAdForRareItem(itemId: string): Promise<boolean> {
    if (!getItemById().get(itemId)) return false;
    // 预检，避免白弹一次广告
    if (findEmptyCell(this.board) < 0) return false;

    trackEvent(Events.AD_TRIGGER, { placement: 'rare_item', item_id: itemId, player_level: this.level.level });
    const ok = await this.platform.showRewardedAd();
    trackEvent(Events.AD_FINISH, { placement: 'rare_item', is_ended: ok, error_code: getLastRewardedAdError() });
    if (!ok) return false;
    this._afterAdWatched();

    const slotIdx = findEmptyCell(this.board);
    // 广告已看完，棋盘满了也不回收奖励，只是这次落不下去
    if (slotIdx < 0) {
      this.scheduleSave();
      return true;
    }
    this.board[slotIdx] = { itemId };
    unlockItem(this.collection, itemId);
    this.events.emit('board:changed', this.board);
    this.events.emit('collection:changed', this.collection);
    this.autoMatchOrders();
    this.scheduleSave();
    return true;
  }

  /** 订单翻倍：看广告后再发一份等额金币 */
  async doubleOrderReward(baseCoins: number): Promise<boolean> {
    trackEvent(Events.AD_TRIGGER, { placement: 'double', coins: baseCoins, player_level: this.level.level });
    const ok = await this.platform.showRewardedAd();
    trackEvent(Events.AD_FINISH, { placement: 'double', is_ended: ok, error_code: getLastRewardedAdError() });
    if (!ok) return false;
    addCoins(this.economy, baseCoins);
    this._afterAdWatched();
    this.events.emit('economy:changed', this.economy);
    this.scheduleSave();
    return true;
  }

  // --- 新手引导 ---

  /** 当前应展示的引导步骤（null = 已结束/已跳过） */
  get tutorialStep(): TutorialStepDef | null {
    return getCurrentStep(this.tutorial);
  }

  /** 是否处于引导流程中 */
  get tutorialActive(): boolean {
    return isTutorialActive(this.tutorial);
  }

  /**
   * 标记引导步骤完成。
   * 只有「当前步骤」能被完成，避免动作乱序把后面的步骤提前打勾。
   */
  completeTutorialStep(stepId: TutorialStepId): void {
    if (this.tutorialStep?.id !== stepId) return;
    this.tutorial = completeStep(this.tutorial, stepId);
    trackEvent(Events.TUTORIAL_STEP, { step_id: stepId });
    this.events.emit('tutorial:changed', this.tutorial);
    this.scheduleSave();
  }

  /** 跳过全部引导 */
  skipTutorial(): void {
    if (this.tutorial.skipped) return;
    this.tutorial = skipTutorial(this.tutorial);
    this.events.emit('tutorial:changed', this.tutorial);
    this.scheduleSave();
  }

  // --- 商店：精力购买 ---

  /**
   * 上报购买精力，失败或离线时进离线队列。
   * 与 Web useGame 的 serverBuyEnergy 分支同构。
   */
  private _reportBuyEnergy(currency: BuyCurrency, buyType: BuyEnergyType, amount?: number): void {
    const payload = { currency, buyType, amount };
    if (isOnline()) {
      buyEnergy({ currency, type: buyType, amount }).catch(() => {
        enqueue({ type: 'buyEnergy', payload });
      });
    } else {
      enqueue({ type: 'buyEnergy', payload });
    }
  }

  /** 钻石买固定点数精力（不受上限限制） */
  buyEnergyWithDiamonds(cost: number, energyAmount: number): boolean {
    if (!spendDiamonds(this.economy, cost)) return false;
    addEnergyUncapped(this.energy, energyAmount);
    this.events.emit('economy:changed', this.economy);
    this.events.emit('energy:changed', this.energy);
    this.scheduleSave();
    this._reportBuyEnergy('diamonds', 'fixed', energyAmount);
    return true;
  }

  /** 钻石一键回满精力；已满则不消费 */
  refillEnergyWithDiamonds(cost: number): boolean {
    if (this.energy.current >= this.energy.max) return false;
    if (!spendDiamonds(this.economy, cost)) return false;
    this.energy.current = this.energy.max;
    this.events.emit('economy:changed', this.economy);
    this.events.emit('energy:changed', this.energy);
    this.scheduleSave();
    this._reportBuyEnergy('diamonds', 'refill');
    return true;
  }

  /** 今日金币购买精力的剩余次数 */
  get coinRefillRemaining(): number {
    return Math.max(0, getConfig().energy.coinRefillDailyLimit - this.daily.coinRefillCount);
  }

  /** 金币买精力，每日有次数上限 */
  buyEnergyWithCoins(): boolean {
    const cfg = getConfig().energy;
    if (this.daily.coinRefillCount >= cfg.coinRefillDailyLimit) return false;
    if (!spendCoins(this.economy, cfg.coinRefillCost)) return false;
    coinRefillEnergy(this.energy);
    this.daily.coinRefillCount += 1;
    this.events.emit('economy:changed', this.economy);
    this.events.emit('energy:changed', this.energy);
    this.events.emit('daily:changed', this.daily);
    this.scheduleSave();
    this._reportBuyEnergy('coins', 'fixed', cfg.coinRefillAmount);
    return true;
  }

  // --- 背包 ---

  /** 解锁下一个背包格子所需钻石 */
  get backpackUnlockCost(): number {
    return unlockSlotsCost(this.backpack.unlockedSlots);
  }

  /** 把棋盘上的物品收进背包，成功后清空原格 */
  storeToBackpack(boardIdx: number): boolean {
    const itemId = this.board[boardIdx]?.itemId;
    if (!itemId) return false;
    if (!addToBackpack(this.backpack, itemId)) return false;

    this.board[boardIdx] = {};
    this.events.emit('backpack:changed', this.backpack);
    this.events.emit('board:changed', this.board);
    this.autoMatchOrders();
    this.scheduleSave();
    return true;
  }

  /** 从背包取出物品放回棋盘空位；棋盘已满则保持原状 */
  takeFromBackpack(itemId: string): boolean {
    const emptyIdx = findEmptyCell(this.board);
    if (emptyIdx < 0) return false;
    if (!removeFromBackpack(this.backpack, itemId)) return false;

    this.board[emptyIdx] = { itemId };
    this.events.emit('backpack:changed', this.backpack);
    this.events.emit('board:changed', this.board);
    this.autoMatchOrders();
    this.scheduleSave();
    return true;
  }

  /** 花钻石解锁一个背包格子 */
  unlockBackpackSlot(): boolean {
    if (this.backpack.unlockedSlots >= this.backpack.maxSlots) return false;
    // 先扣费再解锁：unlockMoreSlots 成功后无法回滚扣款
    const cost = this.backpackUnlockCost;
    if (!spendDiamonds(this.economy, cost)) return false;
    if (!unlockMoreSlots(this.backpack)) {
      addDiamonds(this.economy, cost);
      return false;
    }
    this.events.emit('backpack:changed', this.backpack);
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

  // --- 商店购买 ---

  /**
   * 金币购买商店物品：扣金币后优先存进背包，背包满了才放棋盘空位，都满则失败。
   * 成功后触发 economy:changed + backpack:changed（或 board:changed），自动匹配订单。
   */
  buyShopItem(itemId: ItemId, price: number): boolean {
    if (this.economy.coins < price) return false;

    // 优先进背包
    if (addToBackpack(this.backpack, itemId)) {
      spendCoins(this.economy, price);
      unlockItem(this.collection, itemId);
      this.events.emit('economy:changed', this.economy);
      this.events.emit('backpack:changed', this.backpack);
      this.events.emit('collection:changed', this.collection);
      this.scheduleSave();
      return true;
    }

    // 背包满，尝试放棋盘空位
    const boardIdx = findEmptyCell(this.board);
    if (boardIdx >= 0) {
      spendCoins(this.economy, price);
      this.board[boardIdx] = { itemId };
      unlockItem(this.collection, itemId);
      this.events.emit('economy:changed', this.economy);
      this.events.emit('board:changed', this.board);
      this.events.emit('collection:changed', this.collection);
      this.events.emit('fx:spawn', boardIdx);
      this.autoMatchOrders();
      this.scheduleSave();
      return true;
    }

    return false;
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
