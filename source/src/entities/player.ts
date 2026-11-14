/**
 * player.ts —— 玩家实体（总设定 1.2 / 1.7）
 * 12×28 碰撞盒，行走/疾跑/潜行/跳跃，
 * 潜行时移出方块边缘自动停在边缘（防坠落）。
 */

import Phaser from 'phaser';
import {
  TILE, PLAYER_W, PLAYER_H, WALK_SPEED, SPRINT_SPEED, SNEAK_SPEED,
  JUMP_VY, ACCEL_GROUND, ACCEL_AIR, FRICTION_GROUND, FRICTION_AIR,
  DOUBLE_TAP_MS,
} from '../config';
import { World } from '../world/world';
import { Body, makeBody, stepBody, hasGroundUnder } from './physics';

export interface PlayerInputState {
  left: boolean;
  right: boolean;
  jumpJust: boolean;
  sneak: boolean;
  sprintHold: boolean;
}

export class Player {
  readonly body: Body;
  sprite: Phaser.GameObjects.Image;
  /** 朝向：1 右 / -1 左 */
  facing = 1;
  sneaking = false;
  sprinting = false;
  /** 本帧是否起跳（供饥饿消耗统计） */
  justJumped = false;
  /** 腾空期间的最高点 y（最小 y），用于摔落伤害 */
  private airPeakY = 0;
  private wasOnGround = true;
  private walkCycle = 0;
  private animFrame = 0;
  /** 出生点快照（构造时记录，死亡重生回到这里） */
  private readonly spawnX: number;
  private readonly spawnY: number;
  /** 双击方向计时 */
  private lastTapLeft = -1e9;
  private lastTapRight = -1e9;
  private tapArmedLeft = false;
  private tapArmedRight = false;

  constructor(scene: Phaser.Scene, world: World, spawnTileX: number, layer?: Phaser.GameObjects.Layer) {
    const sy = world.surfaceYAt(spawnTileX);
    const pxX = spawnTileX * TILE + (TILE - PLAYER_W) / 2;
    const pxY = sy * TILE - PLAYER_H - 1;
    this.body = makeBody(pxX, pxY, PLAYER_W, PLAYER_H);
    this.airPeakY = pxY;
    this.spawnX = pxX;
    this.spawnY = pxY;

    this.sprite = scene.add.image(0, 0, 'player_idle');
    this.sprite.setDepth(10);
    if (layer) layer.add(this.sprite);
    this.syncSprite();
  }

  /** 出生点（像素坐标，供死亡重生；构造时的快照，不随移动变化） */
  get spawnPos(): { x: number; y: number } {
    return { x: this.spawnX, y: this.spawnY };
  }

  /**
   * 每帧更新。dirTapLeft/dirTapRight 为"本帧方向键刚按下"信号（双击疾跑检测）。
   * onLand 回调在落地时触发，参数为下落格数。
   */
  update(
    world: World, input: PlayerInputState,
    dt: number, dirTapLeft: boolean, dirTapRight: boolean,
    onLand: (fallTiles: number) => void,
  ): void {
    const b = this.body;
    this.justJumped = false;

    // ----- 双击疾跑检测 -----
    // 注意：松开方向键时不能再清 armed —— 正常"按下→松开→按下"必然经过
    // 双键均松开的帧，清掉就永远无法触发双击。armed 靠时间窗自然失效。
    const now = Date.now();
    if (dirTapLeft) {
      if (this.tapArmedLeft && now - this.lastTapLeft < DOUBLE_TAP_MS) this.sprinting = true;
      this.lastTapLeft = now;
      this.tapArmedLeft = true;
    }
    if (dirTapRight) {
      if (this.tapArmedRight && now - this.lastTapRight < DOUBLE_TAP_MS) this.sprinting = true;
      this.lastTapRight = now;
      this.tapArmedRight = true;
    }
    // armed 超时复位（长时间不按方向键则忘记上一次点击）
    if (now - this.lastTapLeft > DOUBLE_TAP_MS * 3) this.tapArmedLeft = false;
    if (now - this.lastTapRight > DOUBLE_TAP_MS * 3) this.tapArmedRight = false;
    // 反向或双键同按解除疾跑
    if (input.left && input.right) {
      this.sprinting = false;
    }

    // Ctrl+方向疾跑（绝不用 Ctrl+W）
    if (input.sprintHold && (input.left || input.right)) this.sprinting = true;
    if (!input.left && !input.right) this.sprinting = false;

    // ----- 潜行 -----
    this.sneaking = input.sneak;
    if (this.sneaking) this.sprinting = false;

    // ----- 水平目标速度 -----
    const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    let target = 0;
    if (dir !== 0) {
      this.facing = dir;
      target = this.sneaking ? SNEAK_SPEED : this.sprinting ? SPRINT_SPEED : WALK_SPEED;
      target *= dir;
    }

    // 加速度逼近目标速度
    const accel = b.onGround ? ACCEL_GROUND : ACCEL_AIR;
    const friction = b.onGround ? FRICTION_GROUND : FRICTION_AIR;
    const rate = dir !== 0 ? accel : friction;
    const dv = target - b.vx;
    const maxDv = rate * dt;
    b.vx += Phaser.Math.Clamp(dv, -maxDv, maxDv);

    // 潜行防坠落：若移动后脚下无支撑则停住
    if (this.sneaking && this.wasOnGround && b.vx !== 0) {
      const nextLeft = b.x + b.vx * dt;
      if (!hasGroundUnder(world, b, nextLeft)) {
        b.vx = 0;
      }
    }

    // ----- 跳跃 -----
    if (input.jumpJust && b.onGround) {
      b.vy = JUMP_VY;
      b.onGround = false;
      this.justJumped = true;
    }

    // ----- 物理推进 -----
    const prevGround = b.onGround;
    if (!prevGround) this.airPeakY = Math.min(this.airPeakY, b.y);
    stepBody(world, b, dt);

    // ----- 落地结算 -----
    if (!this.wasOnGround && b.onGround) {
      const fallTiles = (b.y - this.airPeakY) / TILE;
      this.airPeakY = b.y;
      if (fallTiles > 0.5) onLand(fallTiles);
    }
    if (b.onGround) {
      this.airPeakY = b.y;
      this.sprinting = this.sprinting && (input.left || input.right);
    }
    this.wasOnGround = b.onGround;

    // ----- 动画 -----
    this.walkCycle += Math.abs(b.vx) * dt;
    this.syncSprite();
  }

  private syncSprite(): void {
    const b = this.body;
    this.sprite.setPosition(Math.round(b.x + b.w / 2), Math.round(b.y + b.h / 2));
    this.sprite.setFlipX(this.facing < 0);
    let frame = 'player_idle';
    if (!b.onGround) {
      frame = 'player_idle';
    } else if (Math.abs(b.vx) > 8) {
      this.animFrame = Math.floor(this.walkCycle / 10) % 2;
      frame = this.animFrame === 0 ? 'player_walk1' : 'player_walk2';
    } else {
      this.walkCycle = 0;
    }
    this.sprite.setTexture(frame);
  }

  /** 玩家中心所在格子坐标 */
  get centerTile(): { tx: number; ty: number } {
    const b = this.body;
    return { tx: Math.floor((b.x + b.w / 2) / TILE), ty: Math.floor((b.y + b.h / 2) / TILE) };
  }

  /** 传送到指定像素位置并清零速度（重生用） */
  teleport(x: number, y: number): void {
    this.body.x = x;
    this.body.y = y;
    this.body.vx = 0;
    this.body.vy = 0;
    this.airPeakY = y;
    this.wasOnGround = true;
    this.syncSprite();
  }
}
