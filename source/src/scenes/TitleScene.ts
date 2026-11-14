/**
 * TitleScene —— 标题页（总设定 1.8）
 * 「2D方块世界」像素标题 + 开始新游戏 / 继续游戏（无存档置灰）/ 操作说明浮层。
 * 背景为程序化视差景观展示。
 */

import Phaser from 'phaser';
import { GAME_W, GAME_H, TILE } from '../config';
import { hasSave, clearSave } from '../systems/save';
import { RECIPES, Recipe } from '../systems/crafting';
import { sfx } from '../systems/sfx';
import { B, iconKey } from '../blocks';
import { makeButton, makePanel, makeText, makeDim, Button, textStyle } from '../ui/common';

export class TitleScene extends Phaser.Scene {
  private clouds!: Phaser.GameObjects.TileSprite;
  private mtnFar!: Phaser.GameObjects.TileSprite;
  private mtnNear!: Phaser.GameObjects.TileSprite;
  private helpOpen = false;

  constructor() {
    super('Title');
  }

  create(): void {
    this.helpOpen = false;
    const cam = this.cameras.main;

    // ----- 背景 -----
    this.add.image(480, 270, 'bg_sky').setDisplaySize(GAME_W, GAME_H);
    this.add.image(790, 84, 'bg_sun');
    this.clouds = this.add.tileSprite(480, 200, GAME_W, 270, 'bg_clouds');
    this.mtnFar = this.add.tileSprite(480, GAME_H - 135, GAME_W, 270, 'bg_mtn_far');
    this.mtnNear = this.add.tileSprite(480, GAME_H - 135, GAME_W, 270, 'bg_mtn_near');

    // ----- 地面装饰带（真实方块纹理） -----
    const groundY = GAME_H - 3 * TILE * 2; // 3 行草/泥，每格放大 2 倍
    for (let col = 0; col < GAME_W / (TILE * 2) + 1; col++) {
      const x = col * TILE * 2 + TILE;
      this.add.image(x, groundY + 16, `block_${B.GRASS}`).setScale(2);
      this.add.image(x, groundY + 48, `block_${B.DIRT}`).setScale(2);
      this.add.image(x, groundY + 80, `block_${B.DIRT}`).setScale(2);
    }
    // 两棵装饰树
    this.makeTree(6 * TILE * 2 + TILE, groundY);
    this.makeTree(22 * TILE * 2 + TILE, groundY);
    // 火把点缀
    this.add.image(14 * TILE * 2 + TILE, groundY - TILE, `block_${B.TORCH}`).setScale(2);

    // ----- 标题 -----
    const title = makeText(this, 480, 130, '2D方块世界', 72, '#ffffff');
    title.setStyle({
      ...textStyle(72, '#ffd94a', false),
      stroke: '#3a2b1e',
      strokeThickness: 10,
    });
    title.setShadow(0, 6, 'rgba(0,0,0,0.45)', 4, false, true);
    makeText(this, 480, 186, '挖掘 · 合成 · 建造 —— 你的横版沙盒', 17, '#e8f4ff');

    // ----- 按钮 -----
    makeButton(this, 480, 240, 260, '开始新游戏', 19, () => {
      if (hasSave()) this.confirmNew();
      else this.startNew();
    }, () => sfx.play('click'));

    const contBtn = makeButton(this, 480, 292, 260, '继续游戏', 19, () => {
      this.registry.set('mode', 'continue');
      this.scene.start('Game');
    }, () => sfx.play('click'));
    if (!hasSave()) contBtn.setEnabled(false);

    makeButton(this, 480, 344, 260, '合成表', 19, () => {
      this.showRecipes();
    }, () => sfx.play('click'));

    makeButton(this, 480, 396, 260, '操作说明', 19, () => {
      this.showHelp();
    }, () => sfx.play('click'));

    makeText(this, 12, GAME_H - 14, 'v1.0 · TRAE 好应用大赏赛参赛作品 · 全程由 TRAE 开发', 12, '#cfe3ff', 0);
  }

  /** 合成表浮层：图案缩略图 + 名称（与游戏实际配方完全一致） */
  private showRecipes(): void {
    if (this.helpOpen) return;
    this.helpOpen = true;
    const objs: (Phaser.GameObjects.GameObject | Button)[] = [];
    const dim = makeDim(this, 0.72);
    const panel = makePanel(this, 480, 270, 800, 448);
    objs.push(dim, panel);
    objs.push(makeText(this, 480, 86, '合成表', 24, '#ffd94a'));

    // 按图案能否放进 2×2 分组（与 crafting.ts 的判定一致）
    const fit = (p: string[]) => Math.max(...p.map((row) => row.length)) <= 2 && p.length <= 2;
    const basic = RECIPES.filter((r) => fit(r.pattern));
    const advanced = RECIPES.filter((r) => !fit(r.pattern));

    objs.push(makeText(this, 280, 128, '随身合成（2×2）', 16, '#9fe0ff'));
    let y = 166;
    for (const r of basic) {
      this.recipeRow(100, 176, y, r, objs);
      y += 56;
    }

    objs.push(makeText(this, 680, 128, '工作台合成（3×3）', 16, '#9fe0ff'));
    y = 166;
    for (const r of advanced) {
      this.recipeRow(520, 596, y, r, objs);
      y += 56;
    }

    objs.push(makeText(this, 480, 402, '按图案摆好材料（支持镜像）· 点击结果格领取', 12, '#9a9ab0'));
    const closeBtn = makeButton(this, 480, 438, 180, '关闭', 16, () => {
      this.helpOpen = false;
      for (const o of objs) {
        if ('destroy' in o) o.destroy();
      }
    }, () => sfx.play('click'));
    objs.push(closeBtn);
  }

  /**
   * 合成表一行：左侧图案缩略图（按配方图案摆放的迷你格子），右侧输出名称。
   * @param gx 缩略图格子左边界；@param labelX 名称左边界
   */
  private recipeRow(
    gx: number, labelX: number, y: number, r: Recipe,
    objs: (Phaser.GameObjects.GameObject | Button)[],
  ): void {
    const rows = r.pattern.length;
    const cols = Math.max(...r.pattern.map((s) => s.length));
    const size = Math.max(2, rows, cols) >= 3 ? 3 : 2; // 展示 2×2 或 3×3 网格
    const cell = 15;
    const gap = 2;
    const gridH = size * cell + (size - 1) * gap;
    const top = y - gridH / 2;
    for (let rr = 0; rr < size; rr++) {
      for (let cc = 0; cc < size; cc++) {
        const cx = gx + cc * (cell + gap) + cell / 2;
        const cy = top + rr * (cell + gap) + cell / 2;
        const ch = r.pattern[rr]?.[cc];
        if (ch && ch !== '.') {
          const id = r.key[ch];
          objs.push(this.add.image(cx, cy, iconKey(id)).setDisplaySize(13, 13));
        } else {
          objs.push(this.add.image(cx, cy, 'slot_bg').setDisplaySize(cell, cell).setAlpha(0.55));
        }
      }
    }
    objs.push(makeText(this, labelX, y, r.label, 13, '#ffffff', 0));
  }

  private makeTree(cx: number, groundTopY: number): void {
    const s = 2;
    const gy = groundTopY; // 草面像素 y（图片中心）
    // 干 3 格
    for (let i = 1; i <= 3; i++) {
      this.add.image(cx, gy - i * TILE * s + TILE, `block_${B.WOOD}`).setScale(s);
    }
    // 叶团
    const topY = gy - 3 * TILE * s;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (Math.abs(dx) === 2 && (dy === 1)) continue;
        this.add.image(cx + dx * TILE * s, topY + dy * TILE * s - TILE, `block_${B.LEAVES}`).setScale(s);
      }
    }
    this.add.image(cx, topY - 2 * TILE * s - TILE, `block_${B.LEAVES}`).setScale(s);
    this.add.image(cx, topY - TILE, `block_${B.LEAVES}`).setScale(s);
  }

  private startNew(): void {
    this.registry.set('mode', 'new');
    this.scene.start('Game');
  }

  private confirmNew(): void {
    const dim = makeDim(this, 0.6);
    const panel = makePanel(this, 480, 270, 380, 200);
    const t1 = makeText(this, 480, 230, '检测到已有存档', 19, '#ffd94a');
    const t2 = makeText(this, 480, 264, '开始新游戏将覆盖它，确定？', 15, '#dddddd');
    const yes = makeButton(this, 420, 330, 150, '确定覆盖', 16, () => {
      clearSave();
      this.clearConfirm([dim, panel, t1, t2, yes, no]);
      this.startNew();
    }, () => sfx.play('click'));
    const no = makeButton(this, 560, 330, 150, '取消', 16, () => {
      this.clearConfirm([dim, panel, t1, t2, yes, no]);
    }, () => sfx.play('click'));
  }

  private clearConfirm(objs: { destroy(): void }[]): void {
    for (const o of objs) o.destroy();
  }

  /** 操作说明浮层 */
  private showHelp(): void {
    if (this.helpOpen) return;
    this.helpOpen = true;
    const objs: (Phaser.GameObjects.GameObject | Button)[] = [];
    const dim = makeDim(this, 0.7);
    const panel = makePanel(this, 480, 270, 640, 470);
    objs.push(dim, panel);
    objs.push(makeText(this, 480, 92, '操作说明', 24, '#ffd94a'));

    const lines: [string, string][] = [
      ['移动', 'A / D 或 ← / →'],
      ['跳跃', '空格'],
      ['潜行（防坠落）', 'Shift'],
      ['疾跑', '双击方向键，或 Ctrl+方向'],
      ['挖掘', '鼠标左键按住'],
      ['放置', '鼠标右键'],
      ['快捷栏', '数字键 1~9 / 滚轮'],
      ['背包 / 2×2 合成', 'E'],
      ['物品分堆', '拿物品后按左键扫过格子；右键拿一半'],
      ['食用食物', '选中食物按住右键（不饿也能吃）'],
      ['使用工作台', '右键已放置的工作台'],
      ['静音 / 取消静音', 'M'],
      ['暂停', 'Esc'],
    ];
    let y = 120;
    for (const [k, v] of lines) {
      objs.push(makeText(this, 240, y, k, 15, '#cfe3ff', 0));
      objs.push(makeText(this, 620, y, v, 15, '#ffffff', 0).setOrigin(1, 0.5));
      y += 24;
    }
    const closeBtn = makeButton(this, 480, 448, 200, '知道了', 16, () => {
      this.helpOpen = false;
      for (const o of objs) {
        if ('destroy' in o) o.destroy();
      }
    }, () => sfx.play('click'));
    objs.push(closeBtn);
    for (const o of objs) {
      if (o instanceof Phaser.GameObjects.Image) this.tweens.add({ targets: o, alpha: { from: 0.6, to: 1 }, duration: 150 });
    }
  }

  update(time: number): void {
    // 云缓慢自动漂移
    this.clouds.tilePositionX = time * 0.006;
  }
}
