/**
 * hud.ts —— 游戏 HUD（总设定 1.8）
 * 9 格快捷栏（选中高亮+呼吸效果）、生命心 ×10、饥饿 ×10、当前深度、消息浮层。
 */

import Phaser from 'phaser';
import { iconKey } from '../blocks';
import { Inventory } from '../systems/inventory';
import { Survival } from '../systems/survival';
import { makeText } from './common';

const SLOT = 44;
const GAP = 4;
const HOTBAR_W = 9 * SLOT + 8 * GAP;

interface HotbarCell {
  bg: Phaser.GameObjects.Image;
  icon: Phaser.GameObjects.Image;
  count: Phaser.GameObjects.Text;
}

export class Hud {
  private scene: Phaser.Scene;
  private worldCam: Phaser.Cameras.Scene2D.Camera;
  /** 全部 HUD 对象（注册给世界相机忽略） */
  private parts: Phaser.GameObjects.GameObject[] = [];
  private hotbar: HotbarCell[] = [];
  private hearts: Phaser.GameObjects.Image[] = [];
  private hunger: Phaser.GameObjects.Image[] = [];
  private depthText: Phaser.GameObjects.Text;
  private toastText: Phaser.GameObjects.Text | null = null;
  private toastTween: Phaser.Tweens.Tween | null = null;
  private itemNameText: Phaser.GameObjects.Text | null = null;
  private itemNameTween: Phaser.Tweens.Tween | null = null;

  private invVersion = -1;
  private surVersion = -1;
  private lastDepth = -1;
  private lastHotbarIndex = -1;
  private pulseT = 0;
  /** 面板打开时核心 HUD 隐藏标记（重绘时也要遵守，否则会冒出"幽灵格"） */
  private coreVisible = true;

  private reg<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.parts.push(o);
    this.worldCam.ignore(o);
    return o;
  }

  /** 从注册表移除（动态文本销毁时调用，避免数组无限增长） */
  private unreg(o: Phaser.GameObjects.GameObject): void {
    const i = this.parts.indexOf(o);
    if (i >= 0) this.parts.splice(i, 1);
  }

  /** 世界相机需忽略的全部 UI 对象 */
  get objects(): Phaser.GameObjects.GameObject[] {
    return this.parts;
  }

  constructor(
    scene: Phaser.Scene,
    private inventory: Inventory,
    private survival: Survival,
    onSlotClick: (index: number) => void,
    worldCam: Phaser.Cameras.Scene2D.Camera,
  ) {
    this.scene = scene;
    this.worldCam = worldCam;
    const hbX = 480 - HOTBAR_W / 2;
    const hbY = 540 - 62;

    // 快捷栏
    for (let i = 0; i < 9; i++) {
      const x = hbX + i * (SLOT + GAP) + SLOT / 2;
      const bg = this.reg(scene.add.image(x, hbY, 'slot_bg').setDepth(200).setInteractive({ useHandCursor: true }));
      bg.on('pointerdown', () => onSlotClick(i));
      const icon = this.reg(scene.add.image(x, hbY, 'block_1').setDisplaySize(32, 32).setDepth(201).setVisible(false));
      const count = this.reg(makeText(scene, x + SLOT / 2 - 6, hbY + SLOT / 2 - 6, '', 13, '#ffffff')
        .setDepth(202).setOrigin(1, 1));
      this.hotbar.push({ bg, icon, count });
    }

    // 生命（快捷栏左上方）与饥饿（右上方）
    const rowY = hbY - SLOT / 2 - 14;
    for (let i = 0; i < 10; i++) {
      const hx = hbX + 8 + i * 17;
      this.hearts.push(this.reg(scene.add.image(hx, rowY, 'heart_full').setOrigin(0, 0.5).setDepth(200)));
    }
    for (let i = 0; i < 10; i++) {
      const gx = hbX + HOTBAR_W - 8 - i * 17;
      this.hunger.push(this.reg(scene.add.image(gx, rowY, 'hunger_full').setOrigin(1, 0.5).setDepth(200)));
    }

    // 深度（左上角）
    this.depthText = this.reg(makeText(scene, 12, 14, '深度 0m', 15, '#ffffff', 0).setDepth(200));
  }

  /** 每帧刷新（按版本号 + 选中索引差量重绘） */
  update(dt: number): void {
    // --- 快捷栏（物品变化或选中格变化都要重绘，否则高亮不跟随） ---
    if (this.invVersion !== this.inventory.version || this.lastHotbarIndex !== this.inventory.hotbarIndex) {
      this.invVersion = this.inventory.version;
      this.lastHotbarIndex = this.inventory.hotbarIndex;
      this.redrawHotbar();
    }
    // --- 生命/饥饿 ---
    if (this.surVersion !== this.survival.version) {
      this.surVersion = this.survival.version;
      this.redrawSurvival();
    }
    // --- 深度 ---
    void dt;
  }
  /** 设置深度显示 */
  setDepthTiles(ty: number): void {
    const d = Math.max(0, Math.round(ty - 64));
    if (d !== this.lastDepth) {
      this.lastDepth = d;
      this.depthText.setText(d > 0 ? `深度 ${d}m` : '地表');
    }
  }

  private redrawHotbar(): void {
    const inv = this.inventory;
    for (let i = 0; i < 9; i++) {
      const cell = this.hotbar[i];
      const s = inv.slots[i];
      const selected = i === inv.hotbarIndex;
      cell.bg.setTexture(selected ? 'slot_sel' : 'slot_bg');
      cell.bg.setVisible(this.coreVisible);
      // 只有真实有物品的格子才显示图标（否则会出现"幽灵草方块"）
      if (s) {
        cell.icon.setTexture(iconKey(s.id)).setVisible(this.coreVisible);
        cell.count.setText(s.count > 1 ? String(s.count) : '').setVisible(this.coreVisible);
      } else {
        cell.icon.setVisible(false);
        cell.count.setText('');
      }
    }
  }

  private redrawSurvival(): void {
    const hearts = this.survival.hearts;
    for (let i = 0; i < 10; i++) {
      const v = hearts - i;
      const tex = v >= 1 ? 'heart_full' : v >= 0.5 ? 'heart_half' : 'heart_empty';
      this.hearts[i].setTexture(tex);
    }
    const bars = this.survival.hungerBars;
    for (let i = 0; i < 10; i++) {
      const v = bars - i;
      const tex = v >= 1 ? 'hunger_full' : v >= 0.5 ? 'hunger_half' : 'hunger_empty';
      this.hunger[i].setTexture(tex);
    }
  }

  /** 强制立即重绘全部（初始化/读档后调用） */
  refreshAll(): void {
    this.invVersion = -1;
    this.surVersion = -1;
    this.update(0);
    this.redrawSurvival();
  }

  /** 面板打开时隐藏核心 HUD（快捷栏/生命/饥饿），避免与面板重叠 */
  setCoreVisible(v: boolean): void {
    this.coreVisible = v;
    const core: (Phaser.GameObjects.Image | Phaser.GameObjects.Text)[] = [];
    for (const c of this.hotbar) core.push(c.bg, c.icon, c.count);
    core.push(...this.hearts, ...this.hunger);
    for (const o of core) o.setVisible(v);
    if (v) this.redrawHotbar();
  }

  /** 快捷栏选中框呼吸高亮 */
  pulse(timeMs: number): void {
    if (!this.coreVisible) return;
    const idx = this.inventory.hotbarIndex;
    if (idx < 0 || idx >= 9) return;
    const cell = this.hotbar[idx];
    const s = 1 + Math.sin(timeMs / 300) * 0.04;
    cell.bg.setScale(s);
  }

  /** 顶部消息浮层 */
  toast(msg: string, color = '#ffe27a'): void {
    if (this.toastText) {
      this.unreg(this.toastText);
      this.toastText.destroy();
      this.toastTween?.remove();
    }
    const t = this.reg(makeText(this.scene, 480, 90, msg, 18, color).setDepth(400));
    t.setOrigin(0.5, 0.5);
    this.toastText = t;
    this.toastTween = this.scene.tweens.add({
      targets: t,
      y: 70,
      alpha: { from: 1, to: 0 },
      duration: 1800,
      delay: 900,
      onComplete: () => {
        if (this.toastText === t) this.toastText = null;
        this.unreg(t);
        t.destroy();
      },
    });
  }

  /** MC 式物品名提示：指定 y 位置短暂显示后淡出 */
  showItemName(name: string, y = 438): void {
    if (this.itemNameText) {
      this.unreg(this.itemNameText);
      this.itemNameText.destroy();
      this.itemNameTween?.remove();
    }
    const t = this.reg(makeText(this.scene, 480, y, name, 15, '#ffffff').setDepth(400));
    this.itemNameText = t;
    this.itemNameTween = this.scene.tweens.add({
      targets: t,
      alpha: { from: 1, to: 0 },
      y: '-=8',
      delay: 1000,
      duration: 450,
      onComplete: () => {
        if (this.itemNameText === t) this.itemNameText = null;
        this.unreg(t);
        t.destroy();
      },
    });
  }
}
