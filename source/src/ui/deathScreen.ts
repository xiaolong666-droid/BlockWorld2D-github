/**
 * deathScreen.ts —— 死亡界面（总设定 1.8）
 * 重生按钮：回出生点、生命饥饿重置、物品保留（友好化处理）
 */

import Phaser from 'phaser';
import { makeButton, makePanel, makeText, makeDim, Button } from './common';

export class DeathScreen {
  private scene: Phaser.Scene;
  private worldCam: Phaser.Cameras.Scene2D.Camera;
  private onRespawn: () => void;
  private clickSfx: () => void;
  private objs: Phaser.GameObjects.GameObject[] = [];
  isOpen = false;

  constructor(
    scene: Phaser.Scene, worldCam: Phaser.Cameras.Scene2D.Camera,
    onRespawn: () => void, clickSfx: () => void,
  ) {
    this.scene = scene;
    this.worldCam = worldCam;
    this.onRespawn = onRespawn;
    this.clickSfx = clickSfx;
  }

  private reg<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.objs.push(o);
    this.worldCam.ignore(o);
    (o as unknown as { setDepth?: (v: number) => void }).setDepth?.(300);
    return o;
  }

  open(): void {
    if (this.isOpen) return;
    this.isOpen = true;
    this.reg(makeDim(this.scene, 0.55, 0x660000));
    this.reg(makePanel(this.scene, 480, 270, 360, 220, 0x2a1418));
    this.reg(makeText(this.scene, 480, 220, '你死了', 34, '#ff6a6a'));
    this.reg(makeText(this.scene, 480, 268, '物品已保留 · 点击按钮回到出生点', 14, '#cccccc'));
    const btn = makeButton(this.scene, 480, 330, 220, '重生', 18, () => {
      this.close();
      this.onRespawn();
    }, this.clickSfx);
    this.reg(btn.root);
    this.reg(btn.label);
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    for (const o of this.objs) o.destroy();
    this.objs = [];
  }
}
