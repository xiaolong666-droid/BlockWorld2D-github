/**
 * worldgen.ts —— 地形生成器（总设定 1.1）
 * 输入 seed，输出 512×128 的方块数组：
 * - 两阶价值噪声叠加生成地表起伏（基线 64 ± 12）
 * - 沙地斑块、2D 噪声阈值洞穴、四种矿石按埋深分布
 * - 地表随机种树（木干 3~5 格 + 树叶团），最底 2 行基岩
 * 同一 seed 生成结果完全一致（所有随机均来自确定性哈希）。
 */

import {
  TILE, WORLD_W, WORLD_H, SURFACE_BASE, BEDROCK_ROWS,
  CAVE_THRESHOLD, ORE_Y_RANGES, ORE_CHANCE, TREE_CHANCE, TREE_GAP,
} from '../config';
import { B } from '../blocks';

/** 2D 整数哈希 → [0,1) */
function hash2i(x: number, y: number, seed: number): number {
  let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1) ^ Math.imul(seed, 0x9e3779b9);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** 2D 价值噪声（平滑插值） */
function vnoise2(x: number, y: number, seed: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const a = hash2i(xi, yi, seed);
  const b = hash2i(xi + 1, yi, seed);
  const c = hash2i(xi, yi + 1, seed);
  const d = hash2i(xi + 1, yi + 1, seed);
  const u = smooth(xf), v = smooth(yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** 某列的地表高度（该行即第一个实体方块的 y） */
export function surfaceHeightAt(x: number, seed: number): number {
  // 大起伏（幅度 ±8）+ 细节（±4），合计 ±12
  const n1 = vnoise2(x / 48, 0.5, seed);
  const n2 = vnoise2(x / 16, 7.5, seed ^ 0x9e37);
  const h = SURFACE_BASE + (n1 - 0.5) * 16 + (n2 - 0.5) * 8;
  return Math.round(clamp(h, 30, 95));
}

/** 是否为沙地列 */
function isSandColumn(x: number, seed: number): boolean {
  return vnoise2(x / 24, 33.3, seed ^ 0x55aa) > 0.78;
}

/** 洞穴判定 */
function isCave(x: number, y: number, seed: number): boolean {
  const c =
    0.62 * vnoise2(x / 16, y / 11, seed ^ 0xcafe) +
    0.38 * vnoise2(x / 7, y / 5, seed ^ 0xbeef);
  return c > CAVE_THRESHOLD;
}

/** 矿石判定（返回 0 表示非矿石）；y 为世界绝对行，保证深矿在高山下也能生成 */
function oreAt(x: number, y: number, seed: number): number {
  // 脉状门控：以 2×2 粗粒度哈希聚簇
  const vein = hash2i(x >> 1, y >> 1, seed ^ 0x20240) < 0.3;
  if (!vein) return 0;
  const tryOre = (key: string, id: number): number => {
    const [y0, y1] = ORE_Y_RANGES[key];
    if (y >= y0 && y <= y1 && hash2i(x, y, seed ^ hashStr(key)) < ORE_CHANCE[key]) return id;
    return 0;
  };
  let r = tryOre('coal', B.COAL_ORE);
  if (r) return r;
  r = tryOre('iron', B.IRON_ORE);
  if (r) return r;
  r = tryOre('gold', B.GOLD_ORE);
  if (r) return r;
  r = tryOre('diamond', B.DIAMOND_ORE);
  return r;
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 2654435761);
  return h >>> 0;
}

export interface GenWorldResult {
  blocks: Uint8Array;
  /** 每列地表高度（生成树时使用） */
  heights: number[];
}

/**
 * 生成完整世界
 * @param seed 种子（同一 seed 结果一致）
 */
export function generateWorld(seed: number): GenWorldResult {
  const blocks = new Uint8Array(WORLD_W * WORLD_H);
  const heights = new Array<number>(WORLD_W);
  const idx = (x: number, y: number) => y * WORLD_W + x;

  // 1) 地表高度线
  for (let x = 0; x < WORLD_W; x++) heights[x] = surfaceHeightAt(x, seed);

  // 2) 按列填充：空气/草或沙/泥土/石头/基岩 + 洞穴 + 矿石
  for (let x = 0; x < WORLD_W; x++) {
    const h = heights[x];
    const sand = isSandColumn(x, seed);
    for (let y = 0; y < WORLD_H; y++) {
      let id: number = B.AIR;
      if (y >= WORLD_H - BEDROCK_ROWS) {
        id = B.BEDROCK;
      } else if (y === h) {
        id = sand ? B.SAND : B.GRASS;
      } else if (y > h && y <= h + 3) {
        id = sand ? B.SAND : B.DIRT;
      } else if (y > h + 3) {
        id = B.STONE;
      }

      // 洞穴：地表以下挖空（保底不穿透地表与基岩层）
      if (id !== B.AIR && id !== B.BEDROCK && y > h + 2 && y < WORLD_H - BEDROCK_ROWS - 1) {
        if (isCave(x, y, seed)) id = B.AIR;
      }

      // 矿石：仅替换石头
      if (id === B.STONE) {
        const ore = oreAt(x, y, seed);
        if (ore) id = ore;
      }

      blocks[idx(x, y)] = id;
    }
  }

  // 3) 种树：地表草方块上随机生成，保持间距
  let lastTree = -TREE_GAP;
  for (let x = 2; x < WORLD_W - 2; x++) {
    if (x - lastTree < TREE_GAP) continue;
    if (hash2i(x, 777, seed) >= TREE_CHANCE) continue;
    const h = heights[x];
    // 地表必须是草，且上方留有空间
    if (blocks[idx(x, h)] !== B.GRASS) continue;
    if (Math.abs(heights[x - 1] - h) > 1 || Math.abs(heights[x + 1] - h) > 1) continue;
    lastTree = x;

    const trunkH = 3 + Math.floor(hash2i(x, 778, seed) * 3); // 3~5 格
    // 木干
    for (let i = 1; i <= trunkH; i++) {
      const y = h - i;
      if (y > 0) blocks[idx(x, y)] = B.WOOD;
    }
    // 树叶团：顶上一行收窄，中间两行宽 5，贴干一行宽 3
    const topY = h - trunkH;
    const putLeaf = (lx: number, ly: number) => {
      if (lx < 0 || lx >= WORLD_W || ly < 0 || ly >= WORLD_H) return;
      if (blocks[idx(lx, ly)] === B.AIR) blocks[idx(lx, ly)] = B.LEAVES;
    };
    for (let dx = -1; dx <= 1; dx++) putLeaf(x + dx, topY - 1);
    for (let dy = 0; dy <= 1; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (Math.abs(dx) === 2 && hash2i(x * 4 + dx, topY + dy, seed) < 0.4) continue; // 角部随机缺角
        putLeaf(x + dx, topY + dy);
      }
    }
    for (let dx = -1; dx <= 1; dx++) {
      if (dx !== 0) putLeaf(x + dx, topY + 2);
    }
  }

  return { blocks, heights };
}

/** 便于外部使用的常量重导出 */
export const TILE_SIZE = TILE;
