import type { Cell, ItemId } from './types';
import { getMergeResult, getItemById, isMother, getMotherSpawnId, getMotherItemId } from '../data/items';
import { getUnlockedCategoriesByLevel } from './level';
import type { Category } from '../data/items';
import { consumeEnergy } from './energy';
import type { EnergyState } from './types';
import { getConfig } from './config';

export const BOARD_COLS = 6;
export const BOARD_SIZE = BOARD_COLS; // 列数，兼容旧引用

// @platform-specific:start Web 按窗口高度动态定行数；Cocos 画布固定，双端各返回定值
/**
 * Cocos Canvas 环境固定返回 8 行
 */
export function getBoardRows(): number {
  return 8;
}
// @platform-specific:end

/** 当前设备的行数（应用启动时确定，不随窗口变化） */
export const BOARD_ROWS = getBoardRows();
export const BOARD_LENGTH = BOARD_COLS * BOARD_ROWS;

/** 创建空棋盘 */
export function createBoard(): Cell[] {
  return Array.from({ length: BOARD_LENGTH }, () => ({}));
}

/** 找到第一个空格索引，没有返回 -1 */
export function findEmptyCell(board: readonly Cell[]): number {
  return board.findIndex(c => !c.itemId);
}

/**
 * 找到一个更自然（偏中心）的空格放置位置。
 * 优先选择靠近棋盘中心的空格，加入少量随机偏移模拟人类放置习惯。
 * @param excludeIndices 需要排除的索引（如母棋位置），用于新手引导时拉远距离
 * @param minDistance     与 excludeIndices 的最小曼哈顿距离（新手引导用）
 */
export function findNaturalEmptyCell(
  board: readonly Cell[],
  excludeIndices: number[] = [],
  minDistance = 0,
): number {
  const empties: number[] = [];
  for (let i = 0; i < board.length; i++) {
    if (!board[i].itemId) empties.push(i);
  }
  if (empties.length === 0) return -1;

  // 棋盘中心坐标
  const centerRow = (BOARD_ROWS - 1) / 2;
  const centerCol = (BOARD_COLS - 1) / 2;

  // 按离中心的距离排序（加随机扰动避免太规律）
  const scored = empties.map(idx => {
    const row = Math.floor(idx / BOARD_COLS);
    const col = idx % BOARD_COLS;
    const distToCenter = Math.abs(row - centerRow) + Math.abs(col - centerCol);
    // 随机扰动 ±1.5，让同距离的格子不总是同一个被选中
    const jitter = (Math.random() - 0.5) * 3;
    return { idx, score: distToCenter + jitter };
  });

  // 如果有最小距离要求，先过滤掉太近的格子
  if (minDistance > 0 && excludeIndices.length > 0) {
    const farEnough = scored.filter(({ idx }) => {
      const row = Math.floor(idx / BOARD_COLS);
      const col = idx % BOARD_COLS;
      return excludeIndices.every(exIdx => {
        const exRow = Math.floor(exIdx / BOARD_COLS);
        const exCol = exIdx % BOARD_COLS;
        return Math.abs(row - exRow) + Math.abs(col - exCol) >= minDistance;
      });
    });
    if (farEnough.length > 0) {
      farEnough.sort((a, b) => a.score - b.score);
      return farEnough[0].idx;
    }
  }

  scored.sort((a, b) => a.score - b.score);
  return scored[0].idx;
}

/** 尝试合成（母棋不参与合成） */
export function tryMerge(board: Cell[], targetIdx: number, sourceIdx: number): boolean {
  const target = board[targetIdx];
  const source = board[sourceIdx];
  if (!target?.itemId || !source?.itemId) return false;
  if (isMother(target.itemId) || isMother(source.itemId)) return false;

  const resultId = getMergeResult(target.itemId, source.itemId);
  if (!resultId) return false;

  // 验证合成结果物品存在于注册表中
  if (!getItemById().has(resultId)) return false;

  board[targetIdx] = { itemId: resultId };
  board[sourceIdx] = {};
  return true;
}

/** 交换两个格子 */
export function swapCells(board: Cell[], idxA: number, idxB: number): void {
  const temp = board[idxA];
  board[idxA] = board[idxB];
  board[idxB] = temp;
}

/** 拖拽操作：能合成就合成，不能就交换 */
export function dragMerge(board: Cell[], fromIdx: number, targetIdx: number): boolean {
  if (fromIdx === targetIdx) return false;
  if (fromIdx < 0 || fromIdx >= board.length || targetIdx < 0 || targetIdx >= board.length) return false;
  const merged = tryMerge(board, targetIdx, fromIdx);
  if (!merged) {
    swapCells(board, fromIdx, targetIdx);
  }
  return merged;
}

/**
 * 点击母棋：消耗精力，在空格生成该品类 Lv.1 物品。返回生成位置索引，-1 表示失败。
 * @param isTutorial 新手引导模式下，生成物品会离母棋更远（方便手势引导展示）
 */
export function activateMother(board: Cell[], motherIdx: number, energy: EnergyState, isTutorial = false): number {
  const motherId = board[motherIdx]?.itemId;
  if (!motherId || !isMother(motherId)) return -1;

  const spawnId = getMotherSpawnId(motherId);
  if (!spawnId) return -1;

  // 收集已有子棋子的位置，用于分散放置
  const occupiedIndices = [motherIdx];
  for (let i = 0; i < board.length; i++) {
    if (board[i].itemId && i !== motherIdx) occupiedIndices.push(i);
  }

  // 新手引导：至少 4 格曼哈顿距离，保证手势引导看起来真实
  // 普通模式：偏中心放置，无最小距离要求
  const minDist = isTutorial ? 4 : 0;
  const emptyIdx = findNaturalEmptyCell(board, occupiedIndices, minDist);
  if (emptyIdx < 0) return -1;
  if (!consumeEnergy(energy, getConfig().energy.motherCost)) return -1;

  board[emptyIdx] = { itemId: spawnId };
  return emptyIdx;
}

/** 检查并放置新解锁的母棋（旧逻辑，保留兼容） */
export function placeNewMothers(board: Cell[], playerLevel: number): string[] {
  const unlocked = getUnlockedCategoriesByLevel(playerLevel);
  const placed: string[] = [];

  const existingMothers = new Set<string>();
  for (const cell of board) {
    if (cell.itemId && isMother(cell.itemId)) {
      existingMothers.add(cell.itemId);
    }
  }

  for (const catId of unlocked) {
    const motherId = getMotherItemId(catId);
    if (existingMothers.has(motherId)) continue;

    const emptyIdx = findEmptyCell(board);
    if (emptyIdx < 0) break;
    board[emptyIdx] = { itemId: motherId };
    placed.push(motherId);
  }

  return placed;
}

/** 移除棋盘上所有母棋 */
export function removeAllMothers(board: Cell[]): void {
  for (let i = 0; i < board.length; i++) {
    if (board[i].itemId && isMother(board[i].itemId!)) {
      board[i] = {};
    }
  }
}

/** 放置单个母棋到棋盘（先清除旧母棋） */
export function placeSingleMother(board: Cell[], category: string): boolean {
  removeAllMothers(board);
  const motherId = getMotherItemId(category as import('../data/items').Category);
  const emptyIdx = findEmptyCell(board);
  if (emptyIdx < 0) return false;
  board[emptyIdx] = { itemId: motherId };
  return true;
}

/** 添加一个母棋到棋盘（同类型母棋只能存在一个） */
export function addMotherToBoard(board: Cell[], category: string): boolean {
  const motherId = getMotherItemId(category as import('../data/items').Category);
  // 已存在同类型母棋则跳过
  if (board.some(c => c.itemId === motherId)) return false;
  const emptyIdx = findRandomEmptyCell(board);
  if (emptyIdx < 0) return false;
  board[emptyIdx] = { itemId: motherId };
  return true;
}

/** 随机选择一个空格 */
export function findRandomEmptyCell(board: readonly Cell[]): number {
  const empties: number[] = [];
  for (let i = 0; i < board.length; i++) {
    if (!board[i].itemId) empties.push(i);
  }
  if (empties.length === 0) return -1;
  return empties[Math.floor(Math.random() * empties.length)];
}

/** 从棋盘移除指定格子的物品 */
export function removeItem(board: Cell[], idx: number): ItemId | undefined {
  const itemId = board[idx]?.itemId;
  if (!itemId) return undefined;
  board[idx] = {};
  return itemId;
}

/** 放置物品到棋盘空格 */
export function placeItem(board: Cell[], itemId: ItemId): boolean {
  const emptyIdx = findEmptyCell(board);
  if (emptyIdx < 0) return false;
  board[emptyIdx] = { itemId };
  return true;
}

/** 是否是满级物品（无法继续合成） */
export function isMaxLevel(itemId: ItemId): boolean {
  const def = getItemById().get(itemId);
  if (!def) return false;
  return !def.nextId;
}
