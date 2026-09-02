import { screen, sys, view } from 'cc';
import { getCapsuleCenterYDesign } from '../platform/wechat';

/**
 * 首页各区块的垂直布局常量。
 *
 * 设计分辨率 720×1280 按宽度适配，高于 16:9 的机型可视高度会超过 1280。
 * 状态栏顶部由「微信胶囊按钮中心」和「系统安全区（刘海）」共同决定，
 * 取两者中更靠下的那个，保证药丸既和胶囊按钮对齐、又不被刘海遮挡。
 * 其余区块按设计稿的相对间距整体平移，多出来的可视高度全部由棋盘吃满。
 *
 * GameManager 用这些值做 Widget 锚定，BoardComponent 用它们算行高，
 * 两边必须同源：锚定值与行高一旦分叉，命中区就会与实际格子错位。
 */

/** 设计稿中状态栏上边缘到屏幕顶部的距离（1280 高上量得） */
export const STATUS_BAR_TOP_DESIGN = 173;
/** 状态栏内容区高度（药丸所在的条带高度），药丸中心 = 状态栏顶部 + 此值/2 */
export const STATUS_BAR_CONTENT_H = 60;
/** 等级面板（营业厅木牌）上边缘到屏幕顶部的距离（设计单位） */
export const CASHIER_TOP_DESIGN = 246;
/** 订单卡上边缘到屏幕顶部的距离（设计单位） */
export const ORDER_PANEL_TOP_DESIGN = 376;
/** 棋盘（含木托盘外边距）上边缘到屏幕顶部的距离（设计单位） */
export const BOARD_TOP_DESIGN = 610;
/** 底部导航 + 间距的预留高度 */
export const NAV_RESERVE = 145;

/**
 * 顶部安全区域高度（设计单位）。
 *
 * 优先以微信胶囊按钮为基准：状态栏药丸中心与胶囊按钮中心对齐，
 * 胶囊按钮位置本身已由系统适配，不会被刘海/灵动岛遮挡。
 * 取不到胶囊按钮时回退到系统安全区，再取不到用设计稿默认值。
 */
export const getTopSafeArea = (): number => {
  const visibleH = view.getVisibleSize().height;
  const frameH = screen.windowSize.height;
  const toDesign = visibleH > 0 && frameH > 0 ? visibleH / frameH : 1;

  // 1. 优先用微信胶囊按钮：药丸中心 = 胶囊中心 → 顶部 = 胶囊中心 - 内容区半高
  const capsuleCenter = getCapsuleCenterYDesign();
  if (capsuleCenter > 0) {
    return Math.max(0, capsuleCenter - STATUS_BAR_CONTENT_H / 2);
  }

  // 2. 回退：系统安全区顶部（刘海/灵动岛/状态栏）
  let safeTop = 0;
  try {
    const safe = sys.getSafeAreaRect();
    if (safe && safe.height > 0 && frameH > 0) {
      safeTop = (frameH - (safe.y + safe.height)) * toDesign;
    }
  } catch {
    // ignore
  }

  return safeTop > 0 ? safeTop : STATUS_BAR_TOP_DESIGN;
};

/**
 * 底部安全区域高度（设计单位），即 Home Indicator 区域高度。
 * 取不到时返回 0（普通设备无底部安全区）。
 */
export const getBottomSafeArea = (): number => {
  try {
    const visibleH = view.getVisibleSize().height;
    const frameH = screen.windowSize.height;
    if (visibleH <= 0 || frameH <= 0) return 0;
    const safe = sys.getSafeAreaRect();
    if (!safe || safe.y <= 0) return 0;
    const toDesign = visibleH / frameH;
    // safe.y 是安全区底部到屏幕底部的距离（像素），转换为设计单位
    return safe.y * toDesign;
  } catch {
    return 0;
  }
};

/**
 * 状态栏顶部的实际锚定值（设计单位）。
 *
 * @deprecated 请使用 getTopSafeArea()，该函数取系统安全区和胶囊位置的最大值，更可靠。
 */
export const getStatusBarTop = (): number => {
  return getTopSafeArea();
};

/**
 * 上方区块整体需要上移的距离（设计单位，>= 0）。
 * 各区块之间的紧凑间距是设计稿调好的，整体平移不动它们。
 */
export const getTopShift = (): number => {
  return Math.max(0, STATUS_BAR_TOP_DESIGN - getStatusBarTop());
};

/** 各区块实际的 top 锚定值（设计单位），整体上移抹平顶部多余空白 */
export const getSectionTops = () => {
  const shift = getTopShift();
  return {
    statusBar: STATUS_BAR_TOP_DESIGN - shift,
    cashier: CASHIER_TOP_DESIGN - shift,
    orderPanel: ORDER_PANEL_TOP_DESIGN - shift,
    board: BOARD_TOP_DESIGN - shift,
  };
};

/**
 * 棋盘顶部的实际偏移——BoardComponent 据此算行高。
 * 上方整体上移多少，棋盘可用高度就多出多少，全部转成更大的格子。
 */
export const getBoardTopOffset = (): number => BOARD_TOP_DESIGN - getTopShift();
