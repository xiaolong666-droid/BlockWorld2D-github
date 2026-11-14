/**
 * world.ts —— 世界数据层
 * 512×128 的 Uint8Array 方块数组与读写接口，
 * 并维护玩家改动 diff（供存档增量保存）。
 */

import { TILE, WORLD_W, WORLD_H } from '../config';
import { B, BLOCKS, isValidBlockId } from '../blocks';

export class World {
  readonly w = WORLD_W;
  readonly h = WORLD_H;
  readonly blocks: Uint8Array;
  /** 玩家改动记录：格子索引 → 方块 id */
  readonly diffs = new Map<number, number>();

  constructor(blocks: Uint8Array) {
    this.blocks = blocks;
  }

  /** 一维索引 */
  static index(x: number, y: number): number {
    return y * WORLD_W + x;
  }

  /**
   * 读方块。越界规则：顶部（y<0）为空气，
   * 左右与底部视为基岩（实体），阻止玩家走出世界。
   */
  get(x: number, y: number): number {
    if (x < 0 || x >= this.w) return B.BEDROCK;
    if (y >= this.h) return B.BEDROCK;
    if (y < 0) return B.AIR;
    return this.blocks[y * this.w + x];
  }

  /**
   * 写方块（写入即记录 diff）。
   * @returns 是否发生了变化
   */
  set(x: number, y: number, id: number): boolean {
    if (x < 0 || x >= this.w || y < 0 || y >= this.h) return false;
    const i = y * this.w + x;
    if (this.blocks[i] === id) return false;
    this.blocks[i] = id;
    this.diffs.set(i, id);
    return true;
  }

  /**
   * 是否实体（用于碰撞）。
   * 以注册表 solid 字段为准（火把等非实体方块可穿过）；
   * 越界视为实体，阻止玩家走出世界。
   */
  isSolid(x: number, y: number): boolean {
    if (x < 0 || x >= this.w || y >= this.h) return true;
    if (y < 0) return false;
    const def = BLOCKS[this.blocks[y * this.w + x]];
    return def?.solid ?? false;
  }

  /** 应用存档 diff（读档时叠加在地形之上；非法 id 直接忽略） */
  applyDiffs(diffs: Record<string, number>): void {
    if (!diffs || typeof diffs !== 'object') return;
    for (const key of Object.keys(diffs)) {
      const i = Number(key);
      if (!Number.isInteger(i) || i < 0 || i >= this.blocks.length) continue;
      const id = diffs[key];
      if (!Number.isInteger(id) || !isValidBlockId(id)) continue;
      this.blocks[i] = id;
      this.diffs.set(i, id);
    }
  }

  /** 导出 diff 为存档格式 */
  exportDiffs(): Record<string, number> {
    const out: Record<string, number> = {};
    this.diffs.forEach((id, i) => { out[String(i)] = id; });
    return out;
  }

  /** 某列地表 y（自顶向下找到第一个实体格），找不到返回 WORLD_H-1 */
  surfaceYAt(x: number): number {
    for (let y = 0; y < this.h; y++) {
      if (this.isSolid(x, y)) return y;
    }
    return this.h - 1;
  }
}

/** 世界像素尺寸 */
export const WORLD_PX_W = WORLD_W * TILE;
export const WORLD_PX_H = WORLD_H * TILE;
