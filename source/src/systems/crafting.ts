/**
 * crafting.ts —— 合成系统（对齐原版 Minecraft）
 * 有形配方（shaped）：按图案匹配位置，支持水平镜像；
 * 图案能放进当前网格即可合成（2×2 可做小配方，3×3 全部可做）。
 * 每次点击结果格消耗一份材料，剩余材料留在格内可继续合成。
 */

import { B, IT } from '../blocks';
import { Slot } from './inventory';

export interface Ingredient { id: number; count: number; }

export interface Recipe {
  /** 图案行：字符对应 key 中的材料，'.' = 空格 */
  pattern: string[];
  /** 字符 → 材料id */
  key: Record<string, number>;
  out: Ingredient;
  /** 展示名（合成表用） */
  label: string;
}

export const RECIPES: Recipe[] = [
  {
    label: '木头 → 木板 ×4',
    pattern: ['W'], key: { W: B.WOOD },
    out: { id: B.PLANKS, count: 4 },
  },
  {
    label: '木板 → 木棍 ×4',
    pattern: ['P', 'P'], key: { P: B.PLANKS },
    out: { id: IT.STICK, count: 4 },
  },
  {
    label: '木板 → 工作台',
    pattern: ['PP', 'PP'], key: { P: B.PLANKS },
    out: { id: B.CRAFT, count: 1 },
  },
  {
    label: '煤 + 木棍 → 火把 ×4',
    pattern: ['C', 'S'], key: { C: IT.COAL, S: IT.STICK },
    out: { id: B.TORCH, count: 4 },
  },
  {
    label: '木板 + 木棍 → 木镐',
    pattern: ['PPP', '.S.', '.S.'], key: { P: B.PLANKS, S: IT.STICK },
    out: { id: IT.WOOD_PICK, count: 1 },
  },
  {
    label: '石头 + 木棍 → 石镐',
    pattern: ['MMM', '.S.', '.S.'], key: { M: B.STONE, S: IT.STICK },
    out: { id: IT.STONE_PICK, count: 1 },
  },
  {
    label: '铁矿石 + 木棍 → 铁镐',
    pattern: ['MMM', '.S.', '.S.'], key: { M: B.IRON_ORE, S: IT.STICK },
    out: { id: IT.IRON_PICK, count: 1 },
  },
  {
    label: '钻石矿石 + 木棍 → 钻石镐',
    pattern: ['MMM', '.S.', '.S.'], key: { M: B.DIAMOND_ORE, S: IT.STICK },
    out: { id: IT.DIAMOND_PICK, count: 1 },
  },
];

export interface MatchResult {
  recipe: Recipe;
  /** 网格中被占用的格子索引（合成时逐格扣除 1 个） */
  cells: number[];
  /** 网格尺寸 */
  size: 2 | 3;
}

/**
 * 有形匹配（原版规则）：
 * 1. 求网格内非空格子的包围盒
 * 2. 与配方图案（裁剪后）逐格比对，含水平镜像
 * 3. 图案必须完全放进网格，格子必须精确一致（不能有多余材料）
 */
export function matchRecipe(grid: (Slot | null)[], size: 2 | 3): MatchResult | null {
  // 网格非空包围盒
  let minR = 9, minC = 9, maxR = -1, maxC = -1;
  grid.forEach((s, i) => {
    if (!s) return;
    const r = Math.floor(i / size), c = i % size;
    if (r < minR) minR = r;
    if (r > maxR) maxR = r;
    if (c < minC) minC = c;
    if (c > maxC) maxC = c;
  });
  if (maxR < 0) return null;
  const boxH = maxR - minR + 1;
  const boxW = maxC - minC + 1;

  for (const recipe of RECIPES) {
    const ph = recipe.pattern.length;
    const pw = Math.max(...recipe.pattern.map((row) => row.length));
    // 图案必须放得进网格
    if (ph > size || pw > size) continue;
    // 包围盒尺寸必须与图案一致
    if (ph !== boxH || pw !== boxW) continue;

    for (const mirror of [false, true]) {
      let ok = true;
      const cells: number[] = [];
      for (let r = 0; r < ph && ok; r++) {
        const row = recipe.pattern[r];
        for (let c = 0; c < pw && ok; c++) {
          const ch = mirror ? row[pw - 1 - c] ?? '.' : row[c] ?? '.';
          const gi = (minR + r) * size + (minC + c);
          const s = grid[gi];
          const expected = ch === '.' ? 0 : recipe.key[ch];
          if (expected === undefined) { ok = false; break; }
          if (expected === 0) {
            if (s) ok = false;
          } else {
            if (!s || s.id !== expected) ok = false;
            else cells.push(gi);
          }
        }
      }
      if (ok) return { recipe, cells, size };
    }
  }
  return null;
}

/** 扣除网格中的配方材料（每个占用格扣 1 个） */
export function consumeGrid(grid: (Slot | null)[], cells: number[]): void {
  for (const i of cells) {
    const s = grid[i];
    if (!s) continue;
    s.count -= 1;
    if (s.count <= 0) grid[i] = null;
  }
}
