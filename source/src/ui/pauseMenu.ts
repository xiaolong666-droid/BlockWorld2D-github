/**
 * pauseMenu.ts —— 暂停菜单（总设定 1.8）
 * 继续 / 保存并退出（回标题页）/ 重开新世界（确认后清档）
 */

import Phaser from 'phaser';
import { makeButton, makePanel, makeText, makeDim, Button } from './common';

export interface PauseCallbacks {
  onResume: () => void;
  onSaveExit: () => void;
  onRestart: () => void;
}

export class PauseMenu {
  private scene: Phaser.Scene;
  private worldCam: Phaser.Cameras.Scene2D.Camera;
  private cb: PauseCallbacks;
  private clickSfx: () => void;
  private objs: Phaser.GameObjects.GameObject[] = [];
  private buttons: Button[] = [];
  isOpen = false;

  constructor(
    scene: Phaser.Scene, worldCam: Phaser.Cameras.Scene2D.Camera,
    cb: PauseCallbacks, clickSfx: () => void,
  ) {
    this.scene = scene;
    this.worldCam = worldCam;
    this.cb = cb;
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
    this.reg(makeDim(this.scene, 0.6));
    this.reg(makePanel(this.scene, 480, 270, 340, 300));
    this.reg(makeText(this.scene, 480, 160, '游戏暂停', 26, '#ffd94a'));

    this.buttons = [
      makeButton(this.scene, 480, 230, 240, '继续游戏', 17, () => {
        this.close();
        this.cb.onResume();
      }, this.clickSfx),
      makeButton(this.scene, 480, 288, 240, '保存并退出', 17, () => {
        this.close();
        this.cb.onSaveExit();
      }, this.clickSfx),
      makeButton(this.scene, 480, 346, 240, '重开新世界', 17, () => this.confirmRestart(), this.clickSfx),
    ];
    for (const b of this.buttons) {
      this.reg(b.root);
      this.reg(b.label);
    }
  }

  /** 重开确认（防止误触清档） */
  private confirmRestart(): void {
    // 清除主菜单，显示确认层
    for (const b of this.buttons) b.destroy();
    this.buttons = [];
    this.reg(makeText(this.scene, 480, 250, '将清空当前存档并生成新世界', 16, '#ff9a9a'));
    this.reg(makeText(this.scene, 480, 278, '确定要重开吗？', 16, '#ff9a9a'));
    const yes = makeButton(this.scene, 420, 340, 150, '确定重开', 16, () => {
      this.destroy();
      this.cb.onRestart();
    }, this.clickSfx);
    const no = makeButton(this.scene, 560, 340, 150, '取消', 16, () => {
      this.destroy();
      this.cb.onResume();
    }, this.clickSfx);
    this.reg(yes.root); this.reg(yes.label);
    this.reg(no.root); this.reg(no.label);
  }

  close(): void {
    if (!this.isOpen) return;
    this.destroy();
  }

  private destroy(): void {
    this.isOpen = false;
    for (const o of this.objs) o.destroy();
    this.objs = [];
    this.buttons = [];
  }
}
