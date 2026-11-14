/**
 * BootScene —— 启动场景
 * 程序化生成全部纹理后进入标题页。
 */

import Phaser from 'phaser';
import { ensureTextures } from '../textures';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    // 屏蔽画布上的右键菜单（双重保险，index.html 已有全局拦截）
    this.input.mouse?.disableContextMenu();
    ensureTextures(this);
    this.scene.start('Title');
  }
}
