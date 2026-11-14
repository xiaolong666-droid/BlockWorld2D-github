/**
 * config.ts —— 全局常量集中配置（总设定 1.1 世界参数 / 1.2 物理参数）
 * 所有可调参数集中在此，便于统一调整。
 */

// ---------- 世界参数（1.1） ----------
/** 格子尺寸（px） */
export const TILE = 16;
/** 世界宽（格） */
export const WORLD_W = 512;
/** 世界高（格） */
export const WORLD_H = 128;
/** 区块边长（格），区块 = 16×16 格 */
export const CHUNK = 16;
/** 区块横向数量 */
export const CHUNK_X = WORLD_W / CHUNK;
/** 区块纵向数量 */
export const CHUNK_Y = WORLD_H / CHUNK;
/** 地表基线（y 像素行） */
export const SURFACE_BASE = 64;
/** 地表起伏幅度（±格），实际生成范围钳制在 30~95 行 */
export const SURFACE_AMP = 12;
/** 最底部基岩行数 */
export const BEDROCK_ROWS = 2;

/** 洞穴噪声阈值（> 阈值挖空） */
export const CAVE_THRESHOLD = 0.65;

/**
 * 矿石埋深（世界绝对 y 行区间，自地表向下）。
 * 说明：原按「地表以下格数」定义时，高山列会超出世界高度导致深矿缺失。
 * 改用绝对 y 区间：四种矿石在全图任意列都保证可达（基岩上方）。
 */
export const ORE_Y_RANGES: Record<string, [number, number]> = {
  coal: [70, 106],
  iron: [80, 114],
  gold: [96, 121],
  diamond: [108, 125],
};
/** 矿石生成概率（每格） */
export const ORE_CHANCE: Record<string, number> = {
  coal: 0.016,
  iron: 0.012,
  gold: 0.010,
  diamond: 0.012,
};
/** 树生成概率（每列） */
export const TREE_CHANCE = 0.12;
/** 树最小间隔（格） */
export const TREE_GAP = 5;

// ---------- 物理参数（1.2） ----------
/** 玩家碰撞盒宽（px） */
export const PLAYER_W = 12;
/** 玩家碰撞盒高（px） */
export const PLAYER_H = 28;
/** 行走速度（px/s） */
export const WALK_SPEED = 80;
/** 疾跑速度（px/s） */
export const SPRINT_SPEED = 128;
/** 潜行速度（px/s） */
export const SNEAK_SPEED = 32;
/** 跳跃初速（px/s） */
export const JUMP_VY = -330;
/** 重力（px/s²） */
export const GRAVITY = 1600;
/** 最大下落速度（px/s） */
export const MAX_FALL = 480;
/** 地面加速度（px/s²） */
export const ACCEL_GROUND = 1400;
/** 空中加速度（px/s²） */
export const ACCEL_AIR = 800;
/** 地面摩擦（px/s²） */
export const FRICTION_GROUND = 1600;
/** 空中摩擦（px/s²） */
export const FRICTION_AIR = 200;
/** 挖掘/放置距离：以玩家为中心切比雪夫距离（格） */
export const REACH = 4;
/** 摔落伤害免伤高度（格），超过才扣血 */
export const SAFE_FALL_TILES = 3;
/** 双击方向键触发疾跑的判定窗口（ms） */
export const DOUBLE_TAP_MS = 280;

// ---------- 游戏规则（1.4/1.5/1.6） ----------
/** 物品堆叠上限 */
export const MAX_STACK = 64;
/** 苹果回复饥饿（20 单位制，+3 饥饿 = +6 单位） */
export const APPLE_FOOD = 6;
/** 生命最大值（20 单位 = 10 颗心） */
export const HEALTH_MAX = 20;
/** 饥饿最大值（20 单位 = 10 格） */
export const HUNGER_MAX = 20;
/** 饥饿自然回复的阈值（≥9 格 = 18 单位） */
export const REGEN_HUNGER_THRESHOLD = 18;
/** 回血/饿血判定间隔（秒） */
export const SURVIVAL_TICK = 4;
/** 进食冷却（秒） */
export const EAT_COOLDOWN = 0.5;
/** 走路饥饿消耗（单位/秒） */
export const HUNGER_WALK = 0.06;
/** 跳跃饥饿消耗（单位/次） */
export const HUNGER_JUMP = 0.12;
/** 疾跑消耗倍率 */
export const HUNGER_SPRINT_MULT = 3;

// ---------- 存档（1.9） ----------
/** localStorage 键名 */
export const SAVE_KEY = 'blockworld2d_save_v1';
/** 自动保存间隔（毫秒） */
export const AUTOSAVE_MS = 10000;

// ---------- 画面 ----------
/** 游戏设计分辨率宽 */
export const GAME_W = 960;
/** 游戏设计分辨率高 */
export const GAME_H = 540;
/** 世界相机缩放（16px 格子 → 32px 屏幕） */
export const CAM_ZOOM = 2;
/** 云层视差速度倍率 */
export const PARALLAX_CLOUD = 0.15;
/** 远山视差速度倍率 */
export const PARALLAX_FAR = 0.3;
/** 近山视差速度倍率 */
export const PARALLAX_NEAR = 0.6;
