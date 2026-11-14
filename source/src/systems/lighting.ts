/**
 * lighting.ts —— 简易光照（P1-3）
 * 地下按深度叠加暗色遮罩，火把周围用径向渐变在遮罩上"抠洞"提亮。
 * 遮罩挂在 uiCam 渲染（世界相机忽略），不影响 HUD。
 */

import Phaser from 'phaser';
import { TILE, GAME_W, GAME_H } from '../config';
import { World } from '../world/world';
import { B } from '../blocks';

export class Lighting {
  private world: World;
  private worldCam: Phaser.Cameras.Scene2D.Camera;
  private rt: Phaser.GameObjects.RenderTexture;
  private light: Phaser.GameObjects.Image;

  constructor(
    scene: Phaser.Scene, world: World,
    worldCam: Phaser.Cameras.Scene2D.Camera, uiCam: Phaser.Cameras.Scene2D.Camera,
  ) {
    this.world = world;
    this.worldCam = worldCam;
    this.rt = scene.add.renderTexture(0, 0, GAME_W, GAME_H).setOrigin(0, 0).setDepth(140);
    worldCam.ignore(this.rt);
    void uiCam;
    this.light = scene.make.image({ key: 'light_glow', add: false }).setOrigin(0.5);
  }

  /**
   * @param depthTiles 玩家位于地表以下的格数（0 = 地表）
   */
  update(depthTiles: number): void {
    const alpha = Phaser.Math.Clamp((depthTiles - 8) / 46, 0, 0.88);
    if (alpha <= 0.01) {
      if (this.rt.visible) this.rt.setVisible(false);
      return;
    }
    if (!this.rt.visible) this.rt.setVisible(true);
    this.rt.clear();
    this.rt.fill(0x060a18, alpha);

    // 视野内的火把逐个抠出光圈
    const cam = this.worldCam;
    const view = cam.worldView;
    const zoom = cam.zoom;
    const tx0 = Math.max(0, Math.floor(view.x / TILE) - 1);
    const ty0 = Math.max(0, Math.floor(view.y / TILE) - 1);
    const tx1 = Math.min(this.world.w - 1, Math.ceil(view.right / TILE) + 1);
    const ty1 = Math.min(this.world.h - 1, Math.ceil(view.bottom / TILE) + 1);
    const size = 7 * TILE * zoom;
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        if (this.world.get(tx, ty) !== B.TORCH) continue;
        const wx = (tx + 0.5) * TILE;
        const wy = (ty + 0.5) * TILE;
        const sx = (wx - view.x) * zoom;
        const sy = (wy - view.y) * zoom;
        this.light.setDisplaySize(size, size);
        this.rt.erase(this.light, sx, sy);
      }
    }
  }
}
