/**
 * main.ts —— 入口
 * 创建 Phaser 游戏实例：Vite + TypeScript + Phaser 3。
 */

import Phaser from 'phaser';
import { GAME_W, GAME_H } from './config';
import { BootScene } from './scenes/BootScene';
import { TitleScene } from './scenes/TitleScene';
import { GameScene } from './scenes/GameScene';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_W,
  height: GAME_H,
  backgroundColor: '#000000',
  pixelArt: true,
  roundPixels: true,
  // 允许对 WebGL 画布做像素回读（自动化截图验证需要）
  preserveDrawingBuffer: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene, TitleScene, GameScene],
});

// 调试/自动化钩子：仅在地址栏带 ?debug 时暴露，正式游玩不挂全局变量
if (location.search.includes('debug')) {
  (window as unknown as { __BW: Phaser.Game }).__BW = game;
}
