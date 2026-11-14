/**
 * common.ts —— UI 公共工具：文本样式、按钮、面板
 * 所有 UI 挂在 uiCam（无缩放相机）上，由 GameScene 统一注册忽略世界相机。
 */

import Phaser from 'phaser';

export const FONT = '"Microsoft YaHei", "PingFang SC", "Segoe UI", sans-serif';

export function textStyle(size: number, color = '#ffffff', stroke = true): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontFamily: FONT,
    fontSize: `${size}px`,
    color,
    stroke: stroke ? '#1a1a24' : undefined,
    strokeThickness: stroke ? Math.max(2, size / 8) : 0,
  };
}

export function makeText(
  scene: Phaser.Scene, x: number, y: number, text: string,
  size: number, color = '#ffffff', origin = 0.5,
): Phaser.GameObjects.Text {
  return scene.add.text(x, y, text, textStyle(size, color)).setOrigin(origin, 0.5);
}

export interface Button {
  root: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
  setEnabled(v: boolean): void;
  destroy(): void;
}

/**
 * 生成标准按钮（图片底 + 文字），hover 高亮 + 点击音效。
 * @param onClick 回调；点击音效由本函数播放前先通过 sfxRef 解析
 */
export function makeButton(
  scene: Phaser.Scene, x: number, y: number, w: number,
  label: string, size: number, onClick: () => void,
  clickSfx: () => void,
): Button {
  const img = scene.add.image(x, y, 'btn').setDisplaySize(w, 44).setInteractive({ useHandCursor: true });
  const txt = makeText(scene, x, y, label, size);
  let enabled = true;

  img.on('pointerover', () => { if (enabled) img.setTexture('btn_hover'); });
  img.on('pointerout', () => { img.setTexture('btn'); });
  img.on('pointerdown', () => {
    if (!enabled) return;
    clickSfx();
    onClick();
  });

  return {
    root: img,
    label: txt,
    setEnabled(v: boolean) {
      enabled = v;
      img.setAlpha(v ? 1 : 0.4);
      txt.setAlpha(v ? 1 : 0.4);
    },
    destroy() {
      img.destroy();
      txt.destroy();
    },
  };
}

/** 深色半透明面板（含描边），返回 Graphics */
export function makePanel(
  scene: Phaser.Scene, cx: number, cy: number, w: number, h: number,
  bgColor = 0x22222e, bgAlpha = 0.96,
): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.35);
  g.fillRoundedRect(cx - w / 2 - 4, cy - h / 2 - 4, w + 8, h + 8, 8);
  g.fillStyle(bgColor, bgAlpha);
  g.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, 8);
  g.lineStyle(3, 0x8a8a9a, 1);
  g.strokeRoundedRect(cx - w / 2, cy - h / 2, w, h, 8);
  return g;
}

/** 全屏暗化矩形 */
export function makeDim(scene: Phaser.Scene, alpha = 0.55, color = 0x000000): Phaser.GameObjects.Rectangle {
  return scene.add.rectangle(480, 270, 960, 540, color, alpha);
}
