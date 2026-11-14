/**
 * save.ts —— 存档系统（总设定 1.9）
 * localStorage 键名 blockworld2d_save_v1
 * 内容：{ version, seed, blockDiffs, player, inventory, hotbarIndex, stats }
 * 只存玩家改动过的方块 diff（叠加在地形上还原）。
 * 读取时做全字段白名单校验 + 数值钳制，损坏存档安全回退为新游戏。
 */

import {
  SAVE_KEY, WORLD_W, WORLD_H, TILE, HEALTH_MAX, HUNGER_MAX, MAX_STACK,
} from '../config';
import { Slot } from './inventory';
import { isValidBlockId, isValidItemId } from '../blocks';

/** 当前存档格式版本 */
export const SAVE_VERSION = 2;

/** 矿石进度键白名单 */
const STAT_KEYS = ['coal', 'iron', 'gold', 'diamond'] as const;

export interface SavePlayer {
  x: number;
  y: number;
  health: number;
  hunger: number;
}

export interface SaveData {
  version: number;
  seed: number;
  /** 格子索引（十进制字符串）→ 方块 id */
  blockDiffs: Record<string, number>;
  player: SavePlayer;
  inventory: (Slot | null)[];
  hotbarIndex: number;
  /** 矿石收集进度（coal/iron/gold/diamond → 是否已收集） */
  stats?: Record<string, boolean>;
  savedAt?: number;
}

export function writeSave(data: SaveData): boolean {
  try {
    data.savedAt = Date.now();
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

function clampNum(v: unknown, lo: number, hi: number, fallback: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, n));
}

function sanitizeInventory(raw: unknown): (Slot | null)[] {
  const out: (Slot | null)[] = new Array(36).fill(null);
  if (!Array.isArray(raw)) return out;
  for (let i = 0; i < Math.min(36, raw.length); i++) {
    const s = raw[i] as Partial<Slot> | null;
    if (!s || typeof s !== 'object') continue;
    const id = Number(s.id);
    const count = Number(s.count);
    if (!Number.isInteger(id) || !isValidItemId(id)) continue;
    if (!Number.isInteger(count) || count <= 0) continue;
    out[i] = { id, count: Math.min(MAX_STACK, count) };
  }
  return out;
}

function sanitizeStats(raw: unknown): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  if (!raw || typeof raw !== 'object') return out;
  const rec = raw as Record<string, unknown>;
  for (const k of STAT_KEYS) {
    if (rec[k] === true) out[k] = true;
  }
  return out;
}

export function readSave(): SaveData | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<SaveData>;
    if (!data || typeof data !== 'object') return null;

    const seed = Number(data.seed);
    if (!Number.isFinite(seed)) return null;

    // 方块 diff：只保留合法的格子索引与方块 id
    const diffs: Record<string, number> = {};
    if (data.blockDiffs && typeof data.blockDiffs === 'object') {
      for (const [k, v] of Object.entries(data.blockDiffs)) {
        const i = Number(k);
        if (!Number.isInteger(i) || i < 0 || i >= WORLD_W * WORLD_H) continue;
        if (!Number.isInteger(v) || !isValidBlockId(v)) continue;
        diffs[k] = v;
      }
    }

    // 玩家：坐标必须有效，生命/饥饿钳制到合法区间
    const p = data.player as Partial<SavePlayer> | undefined;
    const px = Number(p?.x);
    const py = Number(p?.y);
    if (!Number.isFinite(px) || !Number.isFinite(py)) return null;
    const player: SavePlayer = {
      x: clampNum(px, 0, WORLD_W * TILE, WORLD_W * TILE / 2),
      y: clampNum(py, 0, WORLD_H * TILE, 64 * TILE),
      health: clampNum(p?.health, 0, HEALTH_MAX, HEALTH_MAX),
      hunger: clampNum(p?.hunger, 0, HUNGER_MAX, HUNGER_MAX),
    };

    const hotbarIndex = Math.round(clampNum(data.hotbarIndex, 0, 8, 0));

    return {
      version: SAVE_VERSION,
      seed,
      blockDiffs: diffs,
      player,
      inventory: sanitizeInventory(data.inventory),
      hotbarIndex,
      stats: sanitizeStats(data.stats),
    };
  } catch {
    return null;
  }
}

export function hasSave(): boolean {
  return readSave() !== null;
}

export function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // 忽略清理失败
  }
}
