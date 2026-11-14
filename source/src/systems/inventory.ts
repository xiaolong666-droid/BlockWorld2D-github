/**
 * inventory.ts —— 背包系统（总设定 1.4 / 1.8）
 * 36 格 = 9 快捷格（0~8）+ 27 储物格（9~35），堆叠上限 64。
 * 提供挖掘入包 / 放置消耗 / 合成扣料所需接口。
 */

import { MAX_STACK } from '../config';
import { isValidItemId } from '../blocks';

export interface Slot { id: number; count: number; }

export class Inventory {
  /** 变更计数器（UI 据此判断是否需要重绘） */
  version = 0;
  /** 快捷栏选中索引 0~8 */
  hotbarIndex = 0;
  slots: (Slot | null)[] = new Array(36).fill(null);

  private touch(): void {
    this.version++;
  }

  /** 快捷栏当前选中槽位 */
  selected(): Slot | null {
    return this.slots[this.hotbarIndex];
  }

  /**
   * 添加物品：先并入同类堆叠（快捷格优先），再放空格（快捷格优先）。
   * @returns 未装下的数量（0 = 全部入包）
   */
  addItem(id: number, count = 1): number {
    let left = count;
    // 1) 并入已有堆叠
    for (let i = 0; i < 36 && left > 0; i++) {
      const s = this.slots[i];
      if (s && s.id === id && s.count < MAX_STACK) {
        const add = Math.min(MAX_STACK - s.count, left);
        s.count += add;
        left -= add;
      }
    }
    // 2) 空格新堆
    for (let i = 0; i < 36 && left > 0; i++) {
      if (!this.slots[i]) {
        const add = Math.min(MAX_STACK, left);
        this.slots[i] = { id, count: add };
        left -= add;
      }
    }
    if (left !== count) this.touch();
    return left;
  }

  /** 消耗快捷栏选中物品 n 个 */
  consumeSelected(n = 1): boolean {
    const s = this.slots[this.hotbarIndex];
    if (!s || s.count < n) return false;
    s.count -= n;
    if (s.count <= 0) this.slots[this.hotbarIndex] = null;
    this.touch();
    return true;
  }

  /** 统计某物品总数 */
  countOf(id: number): number {
    let n = 0;
    for (const s of this.slots) if (s && s.id === id) n += s.count;
    return n;
  }

  /** 从任意位置扣除 n 个某物品（合成扣料） */
  consumeById(id: number, n = 1): boolean {
    if (this.countOf(id) < n) return false;
    let left = n;
    for (let i = 0; i < 36 && left > 0; i++) {
      const s = this.slots[i];
      if (s && s.id === id) {
        const take = Math.min(s.count, left);
        s.count -= take;
        left -= take;
        if (s.count <= 0) this.slots[i] = null;
      }
    }
    this.touch();
    return true;
  }

  /** 快捷栏选中是否为某物品 */
  selectedIs(id: number): boolean {
    const s = this.selected();
    return !!s && s.id === id;
  }

  clear(): void {
    this.slots = new Array(36).fill(null);
    this.hotbarIndex = 0;
    this.touch();
  }

  serialize(): (Slot | null)[] {
    return this.slots.map((s) => (s ? { id: s.id, count: s.count } : null));
  }

  deserialize(arr: (Slot | null)[]): void {
    if (!Array.isArray(arr)) return;
    this.slots = new Array(36).fill(null);
    for (let i = 0; i < Math.min(36, arr.length); i++) {
      const s = arr[i];
      if (s && Number.isInteger(s.id) && isValidItemId(s.id) && Number.isInteger(s.count) && s.count > 0) {
        this.slots[i] = { id: s.id, count: Math.min(MAX_STACK, s.count) };
      }
    }
    this.touch();
  }
}
