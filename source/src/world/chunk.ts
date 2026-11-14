/**
 * chunk.ts —— 区块渲染（总设定 1.1 / 1.10）
 * 16×16 格为一个 chunk，渲染到离屏 Canvas 并作为纹理显示。
 * 按相机视野动态创建 / 回收区块纹理（只保留视野附近），
 * setBlock 时只把所在 chunk 标脏，flush 时仅重绘脏区块。
 */

import Phaser from 'phaser';
import { CHUNK, CHUNK_X, CHUNK_Y, TILE } from '../config';
import { World } from './world';
import { B } from '../blocks';
import { getBlockCanvas } from '../textures';

/** 地下空腔的背景色（洞穴内显示暗岩壁，而不是透出天空） */
const CAVE_BG = '#191a22';

interface ActiveChunk {
  img: Phaser.GameObjects.Image;
  dirty: boolean;
}

export class ChunkManager {
  private scene: Phaser.Scene;
  private world: World;
  private layer: Phaser.GameObjects.Layer | null;
  /** 当前已创建的区块（视野附近） */
  private active = new Map<number, ActiveChunk>();

  constructor(scene: Phaser.Scene, world: World, layer?: Phaser.GameObjects.Layer) {
    this.scene = scene;
    this.world = world;
    this.layer = layer ?? null;
  }

  static texKey(cx: number, cy: number): string {
    return `chk_${cx}_${cy}`;
  }

  /** 按格子坐标标脏所在区块（未创建的区块重新创建时会整体绘制，无需标记） */
  markDirty(tx: number, ty: number): void {
    const cx = Math.floor(tx / CHUNK);
    const cy = Math.floor(ty / CHUNK);
    if (cx < 0 || cx >= CHUNK_X || cy < 0 || cy >= CHUNK_Y) return;
    const a = this.active.get(cy * CHUNK_X + cx);
    if (a) a.dirty = true;
  }

  /**
   * 按相机视野创建 / 回收区块纹理（超出视野 1 个区块的回收）。
   * 每帧调用，视野未变化时开销极小。
   */
  updateVisible(cam: Phaser.Cameras.Scene2D.Camera): void {
    const px = CHUNK * TILE;
    const view = cam.worldView;
    const cx0 = Math.max(0, Math.floor(view.x / px) - 1);
    const cy0 = Math.max(0, Math.floor(view.y / px) - 1);
    const cx1 = Math.min(CHUNK_X - 1, Math.floor((view.right - 1) / px) + 1);
    const cy1 = Math.min(CHUNK_Y - 1, Math.floor((view.bottom - 1) / px) + 1);
    const inRange = (cx: number, cy: number) => cx >= cx0 && cx <= cx1 && cy >= cy0 && cy <= cy1;

    // 回收视野外区块
    for (const [ci, a] of this.active) {
      const cx = ci % CHUNK_X;
      const cy = Math.floor(ci / CHUNK_X);
      if (inRange(cx, cy)) continue;
      a.img.destroy();
      const key = ChunkManager.texKey(cx, cy);
      if (this.scene.textures.exists(key)) this.scene.textures.remove(key);
      this.active.delete(ci);
    }

    // 创建视野内缺失区块
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const ci = cy * CHUNK_X + cx;
        if (!this.active.has(ci)) this.createChunk(cx, cy, ci);
      }
    }
  }

  private createChunk(cx: number, cy: number, ci: number): void {
    const key = ChunkManager.texKey(cx, cy);
    const tex = this.scene.textures;
    if (tex.exists(key)) tex.remove(key);
    const chunkPx = CHUNK * TILE;
    const cv = document.createElement('canvas');
    cv.width = chunkPx;
    cv.height = chunkPx;
    tex.addCanvas(key, cv);
    const img = this.scene.add.image(cx * chunkPx, cy * chunkPx, key).setOrigin(0, 0);
    if (this.layer) this.layer.add(img);
    this.active.set(ci, { img, dirty: true });
  }

  /** 重绘所有脏区块（通常每帧调用一次；空集合时零开销） */
  flush(): void {
    for (const [ci, a] of this.active) {
      if (!a.dirty) continue;
      a.dirty = false;
      this.redraw(ci % CHUNK_X, Math.floor(ci / CHUNK_X));
    }
  }

  /** 把区块内所有非空气方块绘制到其离屏 Canvas 并刷新纹理 */
  private redraw(cx: number, cy: number): void {
    const key = ChunkManager.texKey(cx, cy);
    if (!this.scene.textures.exists(key)) return;
    const tex = this.scene.textures.get(key) as Phaser.Textures.CanvasTexture;
    if (!tex || !tex.source[0]) return;
    const cv = tex.source[0].image as HTMLCanvasElement;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, cv.width, cv.height);

    const gx0 = cx * CHUNK, gy0 = cy * CHUNK;

    // 先铺"地下岩层背景"：地表以下的空腔显示暗色，而不是透出天空/远山。
    // 地表取每列自上而下第一个非树木实体方块（忽略树干/树叶/火把）。
    ctx.fillStyle = CAVE_BG;
    const isTerrain = (id: number) => id !== 0 && id !== B.WOOD && id !== B.LEAVES && id !== B.TORCH;
    for (let lx = 0; lx < CHUNK; lx++) {
      const gx = gx0 + lx;
      let surf = this.world.h;
      for (let y = 0; y < this.world.h; y++) {
        if (isTerrain(this.world.get(gx, y))) { surf = y; break; }
      }
      const startY = Math.max(gy0, surf);
      const h = gy0 + CHUNK - startY;
      if (h > 0) ctx.fillRect(lx * TILE, (startY - gy0) * TILE, TILE, h * TILE);
    }

    for (let ly = 0; ly < CHUNK; ly++) {
      for (let lx = 0; lx < CHUNK; lx++) {
        const id = this.world.get(gx0 + lx, gy0 + ly);
        if (id === 0) continue;
        const src = getBlockCanvas(id);
        if (src) ctx.drawImage(src, lx * TILE, ly * TILE);
      }
    }
    tex.refresh();
  }

  /** 场景销毁时清理区块纹理，避免残留 */
  destroyTextures(): void {
    for (const [ci, a] of this.active) {
      a.img.destroy();
      const key = ChunkManager.texKey(ci % CHUNK_X, Math.floor(ci / CHUNK_X));
      if (this.scene.textures.exists(key)) this.scene.textures.remove(key);
    }
    this.active.clear();
  }
}
