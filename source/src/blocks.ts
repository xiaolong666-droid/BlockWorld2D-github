/**
 * blocks.ts —— 方块与物品统一注册表（总设定 1.3 / 1.4）
 * - 方块 id：1~99（0 为空气）
 * - 物品 id：≥100（木棍/苹果/煤/四种镐）
 * - 挖掘时间表 breakTimes：[手挖, 木镐, 石镐, 铁镐, 钻镐]
 * - dropLevel：掉落所需最低镐等级（0 = 无门槛）
 */

/** 方块 id */
export const B = {
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  SAND: 3,
  STONE: 4,
  WOOD: 5,
  LEAVES: 6,
  PLANKS: 7,
  CRAFT: 8,
  TORCH: 9,
  COAL_ORE: 10,
  IRON_ORE: 11,
  GOLD_ORE: 12,
  DIAMOND_ORE: 13,
  BEDROCK: 14,
} as const;

/** 物品 id（非方块） */
export const IT = {
  STICK: 100,
  APPLE: 101,
  COAL: 102,
  WOOD_PICK: 110,
  STONE_PICK: 111,
  IRON_PICK: 112,
  DIAMOND_PICK: 113,
} as const;

export interface Drop { id: number; count: number; }

export interface BlockDef {
  id: number;
  name: string;
  /** 是否参与碰撞 */
  solid: boolean;
  /** 分工具等级的挖掘时间表 [手, 木, 石, 铁, 钻] */
  breakTimes?: number[];
  /** 与工具无关的固定挖掘时间 */
  baseTime?: number;
  /** 掉落所需最低工具等级 */
  dropLevel: number;
  /** 掉落物（rnd 用于概率掉落） */
  drops: (rnd: () => number) => Drop[];
  /** 粒子主色 */
  tint: number;
  /** 不可破坏 */
  unbreakable?: boolean;
}

export interface ItemDef {
  id: number;
  name: string;
  /** 作为工具时的镐等级 */
  toolLevel?: number;
  /** 食用回复的饥饿（20 单位制） */
  food?: number;
}

// ---------- 工具等级 ----------
export const TOOL_HAND = 0;
export const TOOL_WOOD = 1;
export const TOOL_STONE = 2;
export const TOOL_IRON = 3;
export const TOOL_DIAMOND = 4;

// ---------- 方块定义 ----------
const stoneTimes = [3.0, 1.2, 0.9, 0.7, 0.5];
const softTimes = [0.5, 0.4, 0.4, 0.4, 0.4];

export const BLOCKS: Record<number, BlockDef> = {
  [B.GRASS]: {
    id: B.GRASS, name: '草方块', solid: true,
    breakTimes: softTimes, dropLevel: 0,
    drops: () => [{ id: B.DIRT, count: 1 }], tint: 0x6aa340,
  },
  [B.DIRT]: {
    id: B.DIRT, name: '泥土', solid: true,
    breakTimes: softTimes, dropLevel: 0,
    drops: () => [{ id: B.DIRT, count: 1 }], tint: 0x866043,
  },
  [B.SAND]: {
    id: B.SAND, name: '沙子', solid: true,
    breakTimes: softTimes, dropLevel: 0,
    drops: () => [{ id: B.SAND, count: 1 }], tint: 0xdacb96,
  },
  [B.STONE]: {
    id: B.STONE, name: '石头', solid: true,
    breakTimes: stoneTimes, dropLevel: TOOL_WOOD,
    drops: () => [{ id: B.STONE, count: 1 }], tint: 0x7d7d7d,
  },
  [B.WOOD]: {
    id: B.WOOD, name: '木头', solid: true,
    baseTime: 0.8, dropLevel: 0,
    drops: () => [{ id: B.WOOD, count: 1 }], tint: 0x9c6e40,
  },
  [B.LEAVES]: {
    id: B.LEAVES, name: '树叶', solid: true,
    baseTime: 0.3, dropLevel: 0,
    // 15% 概率额外掉苹果
    drops: (rnd) => rnd() < 0.15
      ? [{ id: B.LEAVES, count: 1 }, { id: IT.APPLE, count: 1 }]
      : [{ id: B.LEAVES, count: 1 }],
    tint: 0x3a7a28,
  },
  [B.PLANKS]: {
    id: B.PLANKS, name: '木板', solid: true,
    baseTime: 0.8, dropLevel: 0,
    drops: () => [{ id: B.PLANKS, count: 1 }], tint: 0xa67846,
  },
  [B.CRAFT]: {
    id: B.CRAFT, name: '工作台', solid: true,
    baseTime: 0.8, dropLevel: 0,
    drops: () => [{ id: B.CRAFT, count: 1 }], tint: 0xba8c56,
  },
  [B.TORCH]: {
    id: B.TORCH, name: '火把', solid: false,
    baseTime: 0.1, dropLevel: 0,
    drops: () => [{ id: B.TORCH, count: 1 }], tint: 0xffb340,
  },
  [B.COAL_ORE]: {
    id: B.COAL_ORE, name: '煤矿石', solid: true,
    breakTimes: stoneTimes, dropLevel: TOOL_STONE,
    drops: () => [{ id: IT.COAL, count: 1 }], tint: 0x2a2a2a,
  },
  [B.IRON_ORE]: {
    id: B.IRON_ORE, name: '铁矿石', solid: true,
    breakTimes: stoneTimes, dropLevel: TOOL_STONE,
    drops: () => [{ id: B.IRON_ORE, count: 1 }], tint: 0xd8ad8c,
  },
  [B.GOLD_ORE]: {
    id: B.GOLD_ORE, name: '金矿石', solid: true,
    breakTimes: stoneTimes, dropLevel: TOOL_IRON,
    drops: () => [{ id: B.GOLD_ORE, count: 1 }], tint: 0xfcde70,
  },
  [B.DIAMOND_ORE]: {
    id: B.DIAMOND_ORE, name: '钻石矿石', solid: true,
    breakTimes: stoneTimes, dropLevel: TOOL_IRON,
    drops: () => [{ id: B.DIAMOND_ORE, count: 1 }], tint: 0x5cdbd5,
  },
  [B.BEDROCK]: {
    id: B.BEDROCK, name: '基岩', solid: true,
    breakTimes: stoneTimes, dropLevel: 99,
    drops: () => [], tint: 0x3c3c3c, unbreakable: true,
  },
};

// ---------- 物品定义 ----------
export const ITEMS: Record<number, ItemDef> = {
  [IT.STICK]: { id: IT.STICK, name: '木棍' },
  [IT.APPLE]: { id: IT.APPLE, name: '苹果', food: 6 },
  [IT.COAL]: { id: IT.COAL, name: '煤' },
  [IT.WOOD_PICK]: { id: IT.WOOD_PICK, name: '木镐', toolLevel: TOOL_WOOD },
  [IT.STONE_PICK]: { id: IT.STONE_PICK, name: '石镐', toolLevel: TOOL_STONE },
  [IT.IRON_PICK]: { id: IT.IRON_PICK, name: '铁镐', toolLevel: TOOL_IRON },
  [IT.DIAMOND_PICK]: { id: IT.DIAMOND_PICK, name: '钻石镐', toolLevel: TOOL_DIAMOND },
};

// ---------- 查询工具函数 ----------

/** 是否为方块 id（1~99） */
export function isBlock(id: number): boolean {
  return id > 0 && id < 100;
}

/** 是否为注册表内的合法方块 id（含空气 0） */
export function isValidBlockId(id: number): boolean {
  return id === 0 || (isBlock(id) && !!BLOCKS[id]);
}

/** 是否为注册表内的合法物品 id（方块或物品） */
export function isValidItemId(id: number): boolean {
  return isValidBlockId(id) || !!ITEMS[id];
}

/** 方块是否参与碰撞（未注册 id 视为实体，避免出现"看不见的通道"） */
export function isSolidBlock(id: number): boolean {
  if (id === 0) return false;
  return BLOCKS[id]?.solid ?? true;
}

/** 方块定义 */
export function blockDef(id: number): BlockDef | undefined {
  return BLOCKS[id];
}

/** 物品定义 */
export function itemDef(id: number): ItemDef | undefined {
  return ITEMS[id];
}

/** 统一名称查询 */
export function itemName(id: number): string {
  return isBlock(id) ? BLOCKS[id]?.name ?? '?' : ITEMS[id]?.name ?? '?';
}

/** 图标纹理键（背包/快捷栏/掉落通用） */
export function iconKey(id: number): string {
  return isBlock(id) ? `block_${id}` : `item_${id}`;
}

/** 物品作为工具的镐等级（非工具返回 0） */
export function toolLevelOf(itemId: number): number {
  return ITEMS[itemId]?.toolLevel ?? 0;
}

/**
 * 挖掘某方块所需时间（秒）
 * @param blockId 方块 id
 * @param toolLevel 当前工具等级
 */
export function breakTimeOf(blockId: number, toolLevel: number): number {
  const def = BLOCKS[blockId];
  if (!def) return Infinity;
  if (def.unbreakable) return Infinity;
  if (def.baseTime !== undefined) return def.baseTime;
  if (def.breakTimes) return def.breakTimes[Math.min(toolLevel, def.breakTimes.length - 1)];
  return 1;
}
