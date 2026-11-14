/**
 * GameScene —— 游戏主场景
 * 组装世界/玩家/系统/UI，管理控制模式与存档流程。
 * 双相机架构：worldCam（2 倍缩放跟随玩家）渲染世界；uiCam 渲染全部 UI。
 */

import Phaser from 'phaser';
import {
  TILE, WORLD_W, GAME_W, GAME_H, CAM_ZOOM,
  APPLE_FOOD, AUTOSAVE_MS, PARALLAX_CLOUD, PARALLAX_FAR, PARALLAX_NEAR,
} from '../config';
import { generateWorld } from '../world/worldgen';
import { World, WORLD_PX_W, WORLD_PX_H } from '../world/world';
import { ChunkManager } from '../world/chunk';
import { Player } from '../entities/player';
import { MiningSystem } from '../systems/mining';
import { Inventory } from '../systems/inventory';
import { Survival } from '../systems/survival';
import { Lighting } from '../systems/lighting';
import { writeSave, readSave, clearSave, SaveData, SAVE_VERSION } from '../systems/save';
import { sfx } from '../systems/sfx';
import { B, IT, itemName } from '../blocks';
import { Hud } from '../ui/hud';
import { InventoryUI } from '../ui/inventoryUI';
import { PauseMenu } from '../ui/pauseMenu';
import { DeathScreen } from '../ui/deathScreen';

type ControlMode = 'play' | 'inv' | 'craft' | 'pause' | 'dead';

/** 矿石掉落入包时的收集进度映射：key 是"掉落物 id"（不是矿石方块 id） */
const ORE_OF_DROP: Record<number, string> = {
  [IT.COAL]: 'coal',      // 煤矿石掉落煤（102）
  [B.IRON_ORE]: 'iron',   // 铁矿石掉落自身（11）
  [B.GOLD_ORE]: 'gold',
  [B.DIAMOND_ORE]: 'diamond',
};

export class GameScene extends Phaser.Scene {
  private controlMode: ControlMode = 'play';

  private world!: World;
  private chunks!: ChunkManager;
  private worldLayer!: Phaser.GameObjects.Layer;
  private worldCam!: Phaser.Cameras.Scene2D.Camera;
  private uiCam!: Phaser.Cameras.Scene2D.Camera;

  private player!: Player;
  private inventory = new Inventory();
  private survival!: Survival;
  private mining!: MiningSystem;
  private hud!: Hud;
  private invUI!: InventoryUI;
  private pauseMenu!: PauseMenu;
  private deathScreen!: DeathScreen;

  private stats: Record<string, boolean> = {};
  private seed = 0;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private prevLeftDown = false;
  /** 事件驱动的跳跃请求（keydown 置位，本帧消费） */
  private jumpQueued = false;
  /** 四矿集齐成就是否已提示 */
  private oreDinged = false;
  /** 存档失败提示只弹一次 */
  private saveWarned = false;
  /** 世界边缘提示节流计时 */
  private edgeToastT = 0;
  private lighting!: Lighting;
  private particles!: Phaser.GameObjects.Particles.ParticleEmitter;

  // 视差层（挂在主相机，每帧贴到屏幕位置）
  private sky!: Phaser.GameObjects.Image;
  private sun!: Phaser.GameObjects.Image;
  private clouds!: Phaser.GameObjects.TileSprite;
  private mtnFar!: Phaser.GameObjects.TileSprite;
  private mtnNear!: Phaser.GameObjects.TileSprite;

  // 受伤反馈
  private hurtFlash!: Phaser.GameObjects.Rectangle;
  private vignette!: Phaser.GameObjects.Graphics;
  private vignetteAlpha = 0;

  constructor() {
    super('Game');
  }

  create(): void {
    this.controlMode = 'play';
    this.prevLeftDown = false;

    // ---------- 读档 / 新世界 ----------
    const mode = (this.registry.get('mode') as string) ?? 'new';
    const save = mode === 'continue' ? readSave() : null;
    this.seed = save?.seed ?? ((Math.random() * 0x7fffffff) | 0);
    const gen = generateWorld(this.seed);
    this.world = new World(gen.blocks);
    if (save) this.world.applyDiffs(save.blockDiffs);

    // ---------- 相机 ----------
    this.worldCam = this.cameras.main;
    this.worldCam.setZoom(CAM_ZOOM);
    this.worldCam.setBounds(0, 0, WORLD_PX_W, WORLD_PX_H);
    this.worldCam.setRoundPixels(true);
    this.uiCam = this.cameras.add(0, 0, GAME_W, GAME_H, false, 'ui');

    // ---------- 世界渲染 ----------
    this.worldLayer = this.add.layer();
    this.chunks = new ChunkManager(this, this.world, this.worldLayer);
    this.uiCam.ignore(this.worldLayer);
    // 地下光照遮罩（火把提亮）
    this.lighting = new Lighting(this, this.world, this.worldCam, this.uiCam);
    // 复用同一粒子发射器（避免连续挖放时频繁创建对象）
    this.particles = this.add.particles(0, 0, 'particle', {
      speed: { min: 30, max: 110 },
      angle: { min: 200, max: 340 },
      gravityY: 900,
      lifespan: { min: 250, max: 550 },
      scale: { start: 1, end: 0.4 },
      emitting: false,
    });
    this.particles.setDepth(20);
    this.worldLayer.add(this.particles);

    // ---------- 视差背景（挂在 uiCam） ----------
    this.buildParallax();

    // ---------- 玩家与系统 ----------
    this.inventory = new Inventory();
    if (save?.inventory) this.inventory.deserialize(save.inventory);
    if (save && Number.isInteger(save.hotbarIndex)) {
      this.inventory.hotbarIndex = Math.min(8, Math.max(0, save.hotbarIndex));
    }
    this.stats = save?.stats ? { ...save.stats } : {};
    if (this.stats.coal && this.stats.iron && this.stats.gold && this.stats.diamond) this.oreDinged = true;

    const spawnTile = this.findSpawnTile();
    this.player = new Player(this, this.world, spawnTile, this.worldLayer);
    if (save?.player) this.player.teleport(save.player.x, save.player.y);
    this.worldCam.startFollow(this.player.sprite, true, 0.18, 0.18);

    this.survival = new Survival();
    if (save?.player) {
      this.survival.health = save.player.health;
      this.survival.hunger = save.player.hunger;
    }
    // 读档时若已是死亡状态（血量为 0），直接按重生处理，避免 0 血继续游玩
    if (this.survival.health <= 0) this.survival.respawn();
    this.survival.onDeath = () => this.onPlayerDeath();

    this.mining = new MiningSystem(this, this.world, this.chunks, this.player, this.inventory, this.worldLayer, {
      onBlockBroken: (_id, cx, cy, tint) => {
        sfx.play('break');
        this.burst(cx, cy, tint, 8);
      },
      onBlockPlaced: () => {
        sfx.play('place');
      },
      onDrop: (id, count) => {
        const left = this.inventory.addItem(id, count);
        const got = count - left;
        if (got > 0) {
          sfx.play('collect');
          const oreKey = ORE_OF_DROP[id];
          if (oreKey) {
            const first = !this.stats[oreKey];
            this.stats[oreKey] = true;
            if (first) this.checkAllOres();
          }
        }
        return got;
      },
      onDigTick: (tx, ty, tint) => {
        sfx.play('dig');
        this.burst(tx * TILE + TILE / 2, ty * TILE + TILE / 2, tint, 2);
      },
      onHint: (msg) => this.hud.toast(msg, '#ff9a9a'),
      onCraftTableClick: () => {
        if (this.controlMode !== 'play') return false;
        this.openPanel('craft');
        sfx.play('click');
        return true;
      },
    });

    // ---------- UI ----------
    this.hud = new Hud(this, this.inventory, this.survival, (i) => {
      if (this.controlMode !== 'play') return;
      this.inventory.hotbarIndex = i;
      this.announceHotbar();
    }, this.worldCam);

    this.hurtFlash = this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0xff2222, 0).setDepth(450);
    this.worldCam.ignore(this.hurtFlash);
    this.vignette = this.add.graphics().setDepth(440);
    this.worldCam.ignore(this.vignette);
    this.updateVignette();

    this.invUI = new InventoryUI(this, this.inventory, this.worldCam, () => {}, () => {},
      (name) => { this.hud.showItemName(`合成 ${name}`); sfx.play('craft'); },
      (name) => { if (name) this.hud.showItemName(name, 386); },
      (msg) => this.hud.toast(msg, '#ff9a9a'));
    this.pauseMenu = new PauseMenu(this, this.worldCam, {
      onResume: () => { this.controlMode = 'play'; },
      onSaveExit: () => {
        this.saveNow();
        this.scene.start('Title');
      },
      onRestart: () => {
        clearSave();
        this.registry.set('mode', 'new');
        this.scene.restart();
      },
    }, () => sfx.play('click'));
    this.deathScreen = new DeathScreen(this, this.worldCam, () => this.respawn(), () => sfx.play('click'));

    // ---------- 输入 ----------
    // 移动/潜行/疾跑用轮询；E/Esc/数字键/跳跃用事件驱动（避免极快敲击在同帧内被 onUp 清掉 justDown）
    this.setupKeys();

    this.input.on('wheel', (_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      if (this.controlMode !== 'play') return;
      const dir = dy > 0 ? 1 : dy < 0 ? -1 : 0;
      if (dir === 0) return;
      this.inventory.hotbarIndex = (this.inventory.hotbarIndex + dir + 9) % 9;
      this.announceHotbar();
    });

    // 首次交互解锁音频
    this.input.on('pointerdown', () => sfx.unlock());
    this.input.keyboard?.on('keydown', () => sfx.unlock());

    // ---------- 存档 ----------
    this.time.addEvent({
      delay: AUTOSAVE_MS,
      loop: true,
      callback: () => {
        if (this.controlMode !== 'dead') this.saveNow();
      },
    });

    // 场景销毁时清理区块纹理
    this.events.once('shutdown', () => {
      this.chunks.destroyTextures();
    });

    this.hud.refreshAll();
  }

  // ---------- 背景视差 ----------
  // 说明：uiCam 在主相机之后渲染，若把不透明天空放 uiCam 会盖住整个世界。
  // 因此背景挂主相机，每帧"贴屏"定位并做 zoom 补偿（世界坐标 = 相机中心 + (屏幕坐标-480/270)/2）。
  private buildParallax(): void {
    this.sky = this.add.image(0, 0, 'bg_sky').setDisplaySize(480, 270).setDepth(-200);
    this.sun = this.add.image(0, 0, 'bg_sun').setDisplaySize(32, 32).setDepth(-190);
    this.clouds = this.add.tileSprite(0, 0, 480, 135, 'bg_clouds').setTileScale(0.5).setDepth(-180);
    this.mtnFar = this.add.tileSprite(0, 0, 480, 135, 'bg_mtn_far').setTileScale(0.5).setDepth(-170);
    this.mtnNear = this.add.tileSprite(0, 0, 480, 135, 'bg_mtn_near').setTileScale(0.5).setDepth(-160);
    // 背景只属于主相机，避免 uiCam 在世界原点附近重复绘制
    this.uiCam.ignore([this.sky, this.sun, this.clouds, this.mtnFar, this.mtnNear]);
  }

  private updateParallax(time: number): void {
    const midX = this.worldCam.midPoint.x;
    const midY = this.worldCam.midPoint.y;
    const sx = this.worldCam.scrollX;
    // 屏幕锚点 → 世界坐标（zoom=2：偏移除以 2）
    this.sky.setPosition(midX, midY);
    this.sun.setPosition(midX + 160, midY - 93);          // 屏幕 (800, 84)
    this.clouds.setPosition(midX, midY - 67.5);           // 屏幕 y 0~270
    this.mtnFar.setPosition(midX, midY + 67.5);           // 屏幕 y 270~540
    this.mtnNear.setPosition(midX, midY + 67.5);
    // tileScale=0.5：纹理位移(纹理px) = 期望世界位移 / 0.5
    this.clouds.tilePositionX = sx * PARALLAX_CLOUD / 0.5 + time * 0.012;
    this.mtnFar.tilePositionX = sx * PARALLAX_FAR / 0.5;
    this.mtnNear.tilePositionX = sx * PARALLAX_NEAR / 0.5;
  }

  // ---------- 粒子（复用单个发射器） ----------
  private burst(x: number, y: number, tint: number, count: number): void {
    this.particles.setPosition(x, y);
    this.particles.setParticleTint(tint);
    this.particles.explode(count);
  }

  // ---------- 面板控制 ----------
  private openPanel(mode: 'inv' | 'craft'): void {
    this.invUI.open(mode);
    this.controlMode = mode === 'craft' ? 'craft' : 'inv';
    this.hud.setCoreVisible(false);
  }

  private closePanel(): void {
    this.invUI.close();
    this.controlMode = 'play';
    this.hud.setCoreVisible(true);
  }

  // ---------- 生存事件 ----------
  private onPlayerDeath(): void {
    if (this.invUI.isOpen) this.closePanel();
    if (this.pauseMenu.isOpen) this.pauseMenu.close();
    this.controlMode = 'dead';
    sfx.play('death');
    this.deathScreen.open();
  }

  private respawn(): void {
    const sp = this.player.spawnPos;
    this.player.teleport(sp.x, sp.y);
    this.survival.respawn();
    this.controlMode = 'play';
    this.updateVignette();
    this.hud.toast('已回到出生点，物品都还在！', '#aaffaa');
  }

  private flashHurt(): void {
    this.hurtFlash.setAlpha(0.35);
    this.tweens.add({ targets: this.hurtFlash, alpha: 0, duration: 260 });
  }

  private updateVignette(): void {
    const h = this.survival.health;
    const t = Math.max(0, Math.min(1, (14 - h) / 13)); // ≤1 血时最强
    this.vignetteAlpha = t * 0.4;
    this.vignette.clear();
    if (this.vignetteAlpha <= 0.01) return;
    this.vignette.fillStyle(0xaa0000, this.vignetteAlpha);
    const th = 46;
    this.vignette.fillRect(0, 0, GAME_W, th);
    this.vignette.fillRect(0, GAME_H - th, GAME_W, th);
    this.vignette.fillRect(0, 0, th, GAME_H);
    this.vignette.fillRect(GAME_W - th, 0, th, GAME_H);
  }

  // ---------- 存档 ----------
  private collectSave(): SaveData {
    return {
      version: SAVE_VERSION,
      seed: this.seed,
      blockDiffs: this.world.exportDiffs(),
      player: {
        x: this.player.body.x,
        y: this.player.body.y,
        health: this.survival.health,
        hunger: this.survival.hunger,
      },
      inventory: this.inventory.serialize(),
      hotbarIndex: this.inventory.hotbarIndex,
      stats: { ...this.stats },
    };
  }

  private saveNow(): void {
    // 静默保存；仅在写入失败时提示一次（隐私模式/空间不足等）
    const ok = writeSave(this.collectSave());
    if (!ok && !this.saveWarned) {
      this.saveWarned = true;
      this.hud.toast('存档写入失败（浏览器限制或空间不足）', '#ff9a9a');
    }
  }

  /** 四种矿石集齐的一次性提示（无额外 HUD，保持界面干净） */
  private checkAllOres(): void {
    if (this.oreDinged) return;
    if (!(this.stats.coal && this.stats.iron && this.stats.gold && this.stats.diamond)) return;
    this.oreDinged = true;
    sfx.play('craft');
    this.hud.toast('四种矿石已全部集齐！', '#ffd94a');
  }

  /**
   * 出生列：世界中央附近找一列地表平整、头顶三格无遮挡（避开树干/树叶）的地面。
   */
  private findSpawnTile(): number {
    const center = Math.floor(WORLD_W / 2);
    for (let d = 0; d < 40; d++) {
      const candidates = d === 0 ? [center] : [center - d, center + d];
      for (const x of candidates) {
        if (x < 2 || x >= WORLD_W - 2) continue;
        const sy = this.world.surfaceYAt(x);
        const ground = this.world.get(x, sy);
        if (ground !== B.GRASS && ground !== B.SAND) continue;
        if (this.world.get(x, sy - 1) !== 0 || this.world.get(x, sy - 2) !== 0 || this.world.get(x, sy - 3) !== 0) continue;
        if (Math.abs(this.world.surfaceYAt(x - 1) - sy) > 1) continue;
        if (Math.abs(this.world.surfaceYAt(x + 1) - sy) > 1) continue;
        return x;
      }
    }
    return center;
  }

  // ---------- 主循环 ----------
  update(time: number, delta: number): void {
    const dt = Math.min(delta / 1000, 1 / 30);

    // 区块：按相机视野创建/回收，然后重绘脏区块
    this.chunks.updateVisible(this.worldCam);
    this.chunks.flush();

    // 视差
    this.updateParallax(time);

    // 地下光照（按玩家深度；火把提亮）
    const playerTileY = Math.floor((this.player.body.y + this.player.body.h) / TILE);
    this.lighting.update(playerTileY - 64);

    // HUD 与面板
    this.hud.update(dt);
    this.hud.pulse(time);
    this.hud.setDepthTiles(Math.floor((this.player.body.y + this.player.body.h) / TILE));
    this.invUI.update();
    this.updateVignette();

    if (this.controlMode === 'play') {
      this.updatePlay(dt);
    } else {
      this.jumpQueued = false; // 非游戏态丢弃跳跃请求
    }
  }

  /** 事件驱动的按键：E / Esc / 数字键 / 跳跃（轮询键仅用于持续按住的移动类输入） */
  private setupKeys(): void {
    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('A,D,SPACE,SHIFT,CTRL,LEFT,RIGHT') as Record<string, Phaser.Input.Keyboard.Key>;
    // 屏蔽空格/方向键的页面滚动默认行为（Phaser 先入队游戏输入，再阻止默认，两不耽误）
    kb.addCapture([32, 37, 38, 39, 40]);

    // E：背包开关
    kb.on('keydown-E', () => {
      if (this.controlMode === 'play') {
        this.openPanel('inv');
        sfx.play('click');
      } else if (this.controlMode === 'inv' || this.controlMode === 'craft') {
        this.closePanel();
        sfx.play('click');
      }
    });

    // Esc：暂停 / 关闭面板
    kb.on('keydown-ESC', () => {
      if (this.controlMode === 'play') {
        this.pauseMenu.open();
        this.controlMode = 'pause';
        sfx.play('click');
      } else if (this.controlMode === 'pause') {
        this.pauseMenu.close();
        this.controlMode = 'play';
        sfx.play('click');
      } else if (this.controlMode === 'inv' || this.controlMode === 'craft') {
        this.closePanel();
        sfx.play('click');
      }
    });

    // 数字键 1~9 选择快捷栏
    const digits = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE'];
    digits.forEach((d, i) => {
      kb.on(`keydown-${d}`, () => {
        if (this.controlMode !== 'play') return;
        this.inventory.hotbarIndex = i;
        this.announceHotbar();
      });
    });

    // 跳跃请求（仅空格），本帧消费
    kb.on('keydown-SPACE', () => { this.jumpQueued = true; });

    // M：静音切换
    kb.on('keydown-M', () => {
      if (this.controlMode === 'dead') return;
      const muted = sfx.toggleMute();
      this.hud.toast(muted ? '已静音' : '已开启声音', '#cfe3ff');
    });
  }

  /** 快捷栏选中物品名（MC 式：快捷栏上方短暂显示） */
  private announceHotbar(): void {
    const s = this.inventory.selected();
    this.hud.showItemName(s ? itemName(s.id) : '空手');
  }

  private updatePlay(dt: number): void {
    const k = this.keys;
    const kd = Phaser.Input.Keyboard.JustDown;
    const p = this.input.activePointer;

    // ---- 玩家输入 ----
    const tapL = kd(k.A) || kd(k.LEFT);
    const tapR = kd(k.D) || kd(k.RIGHT);
    this.player.update(this.world, {
      left: k.A.isDown || k.LEFT.isDown,
      right: k.D.isDown || k.RIGHT.isDown,
      jumpJust: this.jumpQueued,
      sneak: k.SHIFT.isDown,
      sprintHold: k.CTRL.isDown,
    }, dt, tapL, tapR, (fallTiles) => {
      const dmg = this.survival.applyFall(fallTiles);
      if (dmg > 0) {
        sfx.play('hurt');
        this.flashHurt();
      }
    });
    this.jumpQueued = false;
    if (this.player.justJumped) sfx.play('jump');

    // ---- 进食：选中食物按住右键（可长按连吃），或左键点空处；不饿也能吃 ----
    const leftDown = p.leftButtonDown();
    const leftEdge = leftDown && !this.prevLeftDown;
    this.prevLeftDown = leftDown;
    let suppressMining = false;
    if (this.inventory.selectedIs(IT.APPLE)) {
      let eaten = false;
      // 长按右键进食（受 0.5 秒进食冷却限制）
      if (p.rightButtonDown() && this.survival.eat(APPLE_FOOD)) {
        eaten = true;
      }
      // 左键点空处进食
      if (!eaten && leftEdge) {
        const tx = Math.floor(p.worldX / TILE);
        const ty = Math.floor(p.worldY / TILE);
        if (this.world.get(tx, ty) === 0 && this.survival.eat(APPLE_FOOD)) {
          eaten = true;
          suppressMining = true;
        }
      }
      // 进食成功：消耗 1 个苹果
      if (eaten) {
        this.inventory.consumeSelected(1);
        sfx.play('eat');
      }
    }

    // ---- 挖掘/放置 ----
    this.mining.update(dt, true, suppressMining);

    // ---- 生存数值 ----
    const before = this.survival.version;
    this.survival.update({
      dt,
      moving: Math.abs(this.player.body.vx) > 5,
      sprinting: this.player.sprinting,
      jumped: this.player.justJumped,
    });
    if (this.survival.version !== before) this.updateVignette();

    // ---- 世界边缘反馈（5 秒最多提示一次） ----
    const b = this.player.body;
    this.edgeToastT = Math.max(0, this.edgeToastT - dt);
    if ((b.x <= 1 || b.x + b.w >= WORLD_PX_W - 1) && this.edgeToastT <= 0) {
      this.edgeToastT = 5;
      this.hud.toast('已到达世界边缘', '#cfe3ff');
    }
  }
}
