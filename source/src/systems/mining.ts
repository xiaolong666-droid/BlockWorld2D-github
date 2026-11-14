/**
 * mining.ts —— 挖掘/放置交互系统（总设定 1.3 / 1.7）
 * - 左键按住挖掘：裂纹进度反馈，时间 = 硬度/工具换算
 * - 距离限制：以玩家为中心切比雪夫距离 ≤ 4 格
 * - 右键放置：目标为空格 + 与实心方块相邻 + 不与玩家重叠
 * - 工具等级不足：可破坏但无掉落，并给出一次性提示
 */

import Phaser from 'phaser';
import { TILE, REACH } from '../config';
import { World } from '../world/world';
import { ChunkManager } from '../world/chunk';
import { Player } from '../entities/player';
import { tileOverlapsBody } from '../entities/physics';
import { Inventory } from './inventory';
import { blockDef, breakTimeOf, isBlock, toolLevelOf, B } from '../blocks';

export interface MiningHooks {
  /** 破坏方块完成：方块id、中心像素坐标、粒子色 */
  onBlockBroken: (blockId: number, cx: number, cy: number, tint: number) => void;
  /** 放置方块完成 */
  onBlockPlaced: (blockId: number, tx: number, ty: number) => void;
  /** 掉落物入包，返回实际入包数量 */
  onDrop: (id: number, count: number) => number;
  /** 挖掘进度中的敲击反馈（音效/微粒） */
  onDigTick: (tx: number, ty: number, tint: number) => void;
  /** 提示消息（工具不足 / 背包已满） */
  onHint: (msg: string) => void;
  /** 右键指向工作台且未潜行 → 返回 true 表示已消费本次右键（打开 3×3） */
  onCraftTableClick: () => boolean;
}

export class MiningSystem {
  private scene: Phaser.Scene;
  private world: World;
  private chunks: ChunkManager;
  private player: Player;
  private inventory: Inventory;
  private hooks: MiningHooks;

  private highlight: Phaser.GameObjects.Graphics;
  private crack: Phaser.GameObjects.Image;
  private preview: Phaser.GameObjects.Image;

  private targetTx = -1;
  private targetTy = -1;
  private progress = 0;
  private digTickT = 0;
  private prevLeft = false;
  private prevRight = false;
  private hinted = new Set<number>();

  constructor(
    scene: Phaser.Scene, world: World, chunks: ChunkManager,
    player: Player, inventory: Inventory,
    layer?: Phaser.GameObjects.Layer, hooks?: Partial<MiningHooks>,
  ) {
    this.scene = scene;
    this.world = world;
    this.chunks = chunks;
    this.player = player;
    this.inventory = inventory;
    this.hooks = {
      onBlockBroken: hooks?.onBlockBroken ?? (() => {}),
      onBlockPlaced: hooks?.onBlockPlaced ?? (() => {}),
      onDrop: hooks?.onDrop ?? (() => 0),
      onDigTick: hooks?.onDigTick ?? (() => {}),
      onHint: hooks?.onHint ?? (() => {}),
      onCraftTableClick: hooks?.onCraftTableClick ?? (() => false),
    };

    this.highlight = scene.add.graphics().setDepth(30);
    this.crack = scene.add.image(0, 0, 'crack_0').setOrigin(0, 0).setDepth(15).setVisible(false);
    this.preview = scene.add.image(0, 0, 'block_1').setOrigin(0, 0).setDepth(14).setAlpha(0.5).setVisible(false);
    if (layer) {
      layer.add(this.highlight);
      layer.add(this.crack);
      layer.add(this.preview);
    }
  }

  /** 当前工具等级（快捷栏选中物品） */
  private get toolLevel(): number {
    const s = this.inventory.selected();
    return s ? toolLevelOf(s.id) : 0;
  }

  private inReach(tx: number, ty: number): boolean {
    const c = this.player.centerTile;
    return Math.max(Math.abs(tx - c.tx), Math.abs(ty - c.ty)) <= REACH;
  }

  /**
   * 视线校验（Bresenham）：玩家中心到目标格之间不能有实心方块，
   * 防止隔着墙体挖到后方的方块/矿石。
   */
  private hasLineOfSight(tx: number, ty: number): boolean {
    const c = this.player.centerTile;
    let x = c.tx, y = c.ty;
    const dx = Math.abs(tx - c.tx);
    const dy = Math.abs(ty - c.ty);
    const sx = x < tx ? 1 : -1;
    const sy = y < ty ? 1 : -1;
    let err = dx - dy;
    while (!(x === tx && y === ty)) {
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 < dx) { err += dx; y += sy; }
      if (x === tx && y === ty) break;
      if (this.world.isSolid(x, y)) return false;
    }
    return true;
  }

  /**
   * 每帧更新：光标高亮、左键按住挖掘、右键放置。
   * @param dt 帧间隔（秒）
   * @param active 是否处于可交互状态（游戏中且无面板）
   * @param suppressMining 暂停挖掘（如进食帧）
   */
  update(dt: number, active: boolean, suppressMining: boolean): void {
    const p = this.scene.input.activePointer;
    const tx = Math.floor(p.worldX / TILE);
    const ty = Math.floor(p.worldY / TILE);

    const leftNow = active && p.leftButtonDown() && !suppressMining;
    const rightNow = active && p.rightButtonDown();
    const leftEdge = leftNow && !this.prevLeft;
    const rightEdge = rightNow && !this.prevRight;
    this.prevLeft = p.leftButtonDown();
    this.prevRight = p.rightButtonDown();

    // ---- 右键：优先工作台交互，其次放置 ----
    if (rightEdge) {
      if (this.pointingAtCraft()) {
        this.hooks.onCraftTableClick();
      } else {
        this.tryPlace(tx, ty);
      }
    }

    this.drawHighlight(tx, ty, active);

    // ---- 左键挖掘 ----
    if (!leftNow || !this.inReach(tx, ty) || !this.hasLineOfSight(tx, ty)) {
      this.resetProgress();
      return;
    }
    const id = this.world.get(tx, ty);
    const def = blockDef(id);
    if (!def || def.unbreakable) {
      this.resetProgress();
      return;
    }

    // 换目标重置进度
    if (tx !== this.targetTx || ty !== this.targetTy) {
      this.targetTx = tx;
      this.targetTy = ty;
      this.progress = 0;
      this.digTickT = 0.22; // 首次敲击立即出声
    }

    const time = breakTimeOf(id, this.toolLevel);
    if (!Number.isFinite(time)) {
      this.resetProgress();
      return;
    }
    this.progress += dt / time;

    // 敲击反馈
    this.digTickT += dt;
    if (this.digTickT >= 0.22) {
      this.digTickT = 0;
      this.hooks.onDigTick(tx, ty, def.tint);
    }

    // 裂纹（5 阶）
    if (this.progress > 0.02) {
      const stage = Math.min(4, Math.floor(this.progress * 5));
      this.crack.setTexture(`crack_${stage}`);
      this.crack.setPosition(tx * TILE, ty * TILE);
      this.crack.setVisible(true);
    }

    if (this.progress >= 1) {
      this.resetProgress();
      this.breakBlock(id, tx, ty);
    }
  }

  /** 光标当前是否指向可达范围内的工作台 */
  pointingAtCraft(): boolean {
    const p = this.scene.input.activePointer;
    const tx = Math.floor(p.worldX / TILE);
    const ty = Math.floor(p.worldY / TILE);
    return this.world.get(tx, ty) === B.CRAFT && this.inReach(tx, ty);
  }

  private resetProgress(): void {
    this.progress = 0;
    this.crack.setVisible(false);
    this.digTickT = 0;
  }

  private breakBlock(id: number, tx: number, ty: number): void {
    const def = blockDef(id)!;
    this.world.set(tx, ty, 0);
    this.chunks.markDirty(tx, ty);

    // 工具等级不足：破坏但不掉落（一次性提示）
    if (def.dropLevel > this.toolLevel) {
      if (!this.hinted.has(id)) {
        this.hinted.add(id);
        this.hooks.onHint(`${def.name}需要更高级的镐才能收集`);
      }
    } else {
      for (const d of def.drops(Math.random)) {
        const got = this.hooks.onDrop(d.id, d.count);
        if (got > 0 && this.inventoryFull()) {
          this.hooks.onHint('背包已满');
        }
      }
    }

    this.hooks.onBlockBroken(id, tx * TILE + TILE / 2, ty * TILE + TILE / 2, def.tint);
  }

  private inventoryFull(): boolean {
    return this.inventory.slots.every((s) => s !== null);
  }

  /** 右键放置 */
  private tryPlace(tx: number, ty: number): void {
    if (!this.inReach(tx, ty)) return;

    const sel = this.inventory.selected();
    if (!sel || !isBlock(sel.id)) return; // 必须手持方块

    if (this.world.get(tx, ty) !== 0) return; // 目标必须为空格

    // 与实心方块相邻（4 邻域）
    const near =
      this.world.isSolid(tx - 1, ty) || this.world.isSolid(tx + 1, ty) ||
      this.world.isSolid(tx, ty - 1) || this.world.isSolid(tx, ty + 1);
    if (!near) return;

    // 实心方块不能与玩家重叠（火把不受限）
    const def = blockDef(sel.id);
    if (def?.solid && tileOverlapsBody(tx, ty, this.player.body)) return;

    if (this.inventory.consumeSelected(1)) {
      this.world.set(tx, ty, sel.id);
      this.chunks.markDirty(tx, ty);
      this.hooks.onBlockPlaced(sel.id, tx, ty);
    }
  }

  /** 光标高亮 + 放置预览 */
  private drawHighlight(tx: number, ty: number, active: boolean): void {
    const g = this.highlight;
    g.clear();
    if (tx < 0 || ty < 0 || tx >= this.world.w || ty >= this.world.h) return;

    const reach = this.inReach(tx, ty);
    // 隔着墙体时边框变红，提示无法挖掘
    const losOk = this.world.get(tx, ty) === 0 || this.hasLineOfSight(tx, ty);
    g.lineStyle(2, reach && losOk ? 0xffffff : 0xff5555, 0.9);
    g.strokeRect(tx * TILE + 1, ty * TILE + 1, TILE - 2, TILE - 2);

    // 放置预览：手持方块、目标为空、可放置时显示半透明纹理
    const sel = this.inventory.selected();
    if (!active || !sel || !isBlock(sel.id)) { this.preview.setVisible(false); return; }
    if (this.world.get(tx, ty) !== 0 || !reach) { this.preview.setVisible(false); return; }

    const near =
      this.world.isSolid(tx - 1, ty) || this.world.isSolid(tx + 1, ty) ||
      this.world.isSolid(tx, ty - 1) || this.world.isSolid(tx, ty + 1);
    const def = blockDef(sel.id);
    const overlapOk = !def?.solid || !tileOverlapsBody(tx, ty, this.player.body);
    if (near && overlapOk) {
      this.preview.setTexture(`block_${sel.id}`);
      this.preview.setPosition(tx * TILE, ty * TILE);
      this.preview.setVisible(true);
    } else {
      this.preview.setVisible(false);
    }
  }
}
