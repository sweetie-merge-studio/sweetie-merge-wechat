/**
 * 烘焙坊布局系统 — 槽位式装饰摆放
 */

/** 摆件放置位置 */
export interface PlacedDecoration {
  decoId: string;
  slotId: string;
}

/** 烘焙坊布局状态（纳入存档） */
export interface BakeryState {
  placed: PlacedDecoration[];
  backgroundId: string;
}

/** 槽位定义 */
export interface SlotDef {
  id: string;
  label: string;
  category: 'wall' | 'floor' | 'counter';
  /** CSS 定位（百分比） */
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 预设槽位 — 位置对应烘焙坊背景图中的墙面/柜台/地面区域 */
export const BAKERY_SLOTS: readonly SlotDef[] = [
  // 墙面：壁炉左侧空墙 / 黑板区域 / 窗户旁
  { id: 'wall_left',     label: '左墙',     category: 'wall',    x: 5,  y: 18, width: 16, height: 16 },
  { id: 'wall_center',   label: '正墙中央', category: 'wall',    x: 43, y: 14, width: 18, height: 18 },
  { id: 'wall_right',    label: '右墙',     category: 'wall',    x: 76, y: 16, width: 16, height: 16 },
  // 柜台：展柜左侧台面 / 展柜右侧台面
  { id: 'counter_left',  label: '柜台左',   category: 'counter', x: 8,  y: 46, width: 18, height: 14 },
  { id: 'counter_right', label: '柜台右',   category: 'counter', x: 66, y: 46, width: 18, height: 14 },
  // 地面：棋盘砖地面左 / 木地板中央（地毯区域）/ 木地板右
  { id: 'floor_1',       label: '地面左',   category: 'floor',   x: 6,  y: 70, width: 20, height: 18 },
  { id: 'floor_2',       label: '地面中',   category: 'floor',   x: 38, y: 74, width: 22, height: 18 },
  { id: 'floor_3',       label: '地面右',   category: 'floor',   x: 70, y: 70, width: 20, height: 18 },
];

export const SLOT_BY_ID: ReadonlyMap<string, SlotDef> = new Map(
  BAKERY_SLOTS.map(s => [s.id, s])
);

/** 创建初始烘焙坊状态 */
export function createBakeryState(): BakeryState {
  return { placed: [], backgroundId: 'default' };
}

/** 获取某槽位当前摆放的装饰 ID，无则返回 undefined */
export function getSlotDeco(state: BakeryState, slotId: string): string | undefined {
  return state.placed.find(p => p.slotId === slotId)?.decoId;
}

/** 放置摆件到槽位。如果槽位已有摆件则替换，返回被替换的 decoId（无则 undefined） */
export function placeDeco(state: BakeryState, decoId: string, slotId: string): string | undefined {
  // 先把该 decoId 从所有槽位移除（防止重复放置）
  removeDeco(state, decoId);

  const existIdx = state.placed.findIndex(p => p.slotId === slotId);
  let replaced: string | undefined;
  if (existIdx >= 0) {
    replaced = state.placed[existIdx].decoId;
    state.placed[existIdx] = { decoId, slotId };
  } else {
    state.placed.push({ decoId, slotId });
  }
  return replaced;
}

/** 从布局中移除某摆件，返回是否成功 */
export function removeDeco(state: BakeryState, decoId: string): boolean {
  const idx = state.placed.findIndex(p => p.decoId === decoId);
  if (idx < 0) return false;
  state.placed.splice(idx, 1);
  return true;
}

/** 某摆件是否已摆放 */
export function isPlaced(state: BakeryState, decoId: string): boolean {
  return state.placed.some(p => p.decoId === decoId);
}
