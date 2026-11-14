/**
 * physics.ts —— 自定义 AABB 与瓦片分轴碰撞（总设定 1.2）
 * 先 X 后 Y 分轴移动，站在方块上判定准确，无穿墙。
 */

import { TILE, GRAVITY, MAX_FALL } from '../config';
import { World } from '../world/world';

const EPS = 0.001;

export interface Body {
  x: number; // 碰撞盒左上角
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  onGround: boolean;
}

export function makeBody(x: number, y: number, w: number, h: number): Body {
  return { x, y, w, h, vx: 0, vy: 0, onGround: false };
}

function solidRange(world: World, x0: number, y0: number, x1: number, y1: number): boolean {
  const tx0 = Math.floor(x0 / TILE), tx1 = Math.floor(x1 / TILE);
  const ty0 = Math.floor(y0 / TILE), ty1 = Math.floor(y1 / TILE);
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      if (world.isSolid(tx, ty)) return true;
    }
  }
  return false;
}

/**
 * 推进一个物理体一帧（dt 建议已钳制 ≤ 1/30）。
 * 含重力与 Y 轴积分；onGround 在每帧 Y 轴解算时维护。
 */
export function stepBody(world: World, b: Body, dt: number): void {
  // ---------- X 轴 ----------
  b.x += b.vx * dt;
  // 世界边界
  if (b.x < 0) { b.x = 0; b.vx = 0; }
  if (b.x + b.w > world.w * TILE) { b.x = world.w * TILE - b.w; b.vx = 0; }

  if (b.vx !== 0) {
    const y0 = b.y + EPS, y1 = b.y + b.h - EPS;
    if (b.vx > 0) {
      const edge = b.x + b.w - EPS;
      if (solidRange(world, edge, y0, edge, y1)) {
        b.x = Math.floor(edge / TILE) * TILE - b.w; // 贴到方块左侧
        b.vx = 0;
      }
    } else {
      const edge = b.x + EPS;
      if (solidRange(world, edge, y0, edge, y1)) {
        b.x = (Math.floor(edge / TILE) + 1) * TILE; // 贴到方块右侧
        b.vx = 0;
      }
    }
  }

  // ---------- Y 轴 ----------
  b.vy = Math.min(b.vy + GRAVITY * dt, MAX_FALL);
  b.y += b.vy * dt;

  const x0 = b.x + EPS, x1 = b.x + b.w - EPS;
  if (b.vy > 0) {
    const edge = b.y + b.h - EPS;
    if (solidRange(world, x0, edge, x1, edge)) {
      b.y = Math.floor(edge / TILE) * TILE - b.h; // 落到方块顶面
      b.vy = 0;
      b.onGround = true;
    } else {
      b.onGround = false;
    }
  } else if (b.vy < 0) {
    const edge = b.y + EPS;
    if (solidRange(world, x0, edge, x1, edge)) {
      b.y = (Math.floor(edge / TILE) + 1) * TILE; // 顶到方块底面
      b.vy = 0;
    }
    b.onGround = false;
  } else {
    b.onGround = false;
  }
}

/**
 * 潜行防坠落：判断实体以 newLeft 为左边界时脚下是否仍有支撑。
 */
export function hasGroundUnder(world: World, b: Body, newLeft: number): boolean {
  const ty = Math.floor((b.y + b.h + 1) / TILE);
  const tx0 = Math.floor((newLeft + EPS) / TILE);
  const tx1 = Math.floor((newLeft + b.w - EPS) / TILE);
  for (let tx = tx0; tx <= tx1; tx++) {
    if (world.isSolid(tx, ty)) return true;
  }
  return false;
}

/** 方块 AABB 是否与实体 AABB 重叠（放置校验用） */
export function tileOverlapsBody(tx: number, ty: number, b: Body): boolean {
  const rx = tx * TILE, ry = ty * TILE;
  return rx < b.x + b.w && rx + TILE > b.x && ry < b.y + b.h && ry + TILE > b.y;
}
