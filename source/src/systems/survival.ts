/**
 * survival.ts —— 生存系统（总设定 1.6）
 * 生命 10 颗心 / 饥饿 10 格，内部均用 20 单位制（1 单位 = 半格）。
 * - 摔落：>3 格，每超 1 格扣 0.5 心（1 单位）
 * - 饥饿 ≥9：每 4 秒回 0.5 心；=0：每 4 秒扣 0.5 心（不低于半颗心）
 * - 苹果 +3 饥饿（6 单位）
 */

import {
  HEALTH_MAX, HUNGER_MAX, REGEN_HUNGER_THRESHOLD, SURVIVAL_TICK,
  HUNGER_WALK, HUNGER_JUMP, HUNGER_SPRINT_MULT, EAT_COOLDOWN, TILE,
} from '../config';

export interface SurvivalOpts {
  moving: boolean;
  sprinting: boolean;
  jumped: boolean;
  dt: number;
}

export class Survival {
  version = 0;
  health = HEALTH_MAX;
  hunger = HUNGER_MAX;
  dead = false;
  /** 死亡回调（由 GameScene 注入） */
  onDeath: () => void = () => {};

  private tickT = 0;
  private eatCd = 0;

  private touch(): void {
    this.version++;
  }

  update(o: SurvivalOpts): void {
    if (this.dead) return;
    this.eatCd = Math.max(0, this.eatCd - o.dt);

    // ----- 饥饿消耗 -----
    if (o.moving) {
      const rate = HUNGER_WALK * (o.sprinting ? HUNGER_SPRINT_MULT : 1);
      const before = this.hunger;
      this.hunger = Math.max(0, this.hunger - rate * o.dt);
      if (this.hunger !== before) this.touch();
    }
    if (o.jumped) {
      const cost = HUNGER_JUMP * (o.sprinting ? HUNGER_SPRINT_MULT : 1);
      this.hunger = Math.max(0, this.hunger - cost);
      this.touch();
    }

    // ----- 每 4 秒判定：回血 / 饿血 -----
    this.tickT += o.dt;
    if (this.tickT >= SURVIVAL_TICK) {
      this.tickT -= SURVIVAL_TICK;
      if (this.hunger >= REGEN_HUNGER_THRESHOLD && this.health < HEALTH_MAX) {
        this.health = Math.min(HEALTH_MAX, this.health + 1);
        this.touch();
      } else if (this.hunger <= 0) {
        // 饿血不低于半颗心（1 单位）
        if (this.health > 1) {
          this.health = Math.max(1, this.health - 1);
          this.touch();
        }
      }
    }
  }

  /** 吃食物：不饿也能吃（饥饿溢出自动封顶），仅受进食冷却限制 */
  eat(foodValue = 6): boolean {
    if (this.dead || this.eatCd > 0) return false;
    this.hunger = Math.min(HUNGER_MAX, this.hunger + foodValue);
    this.eatCd = EAT_COOLDOWN;
    this.touch();
    return true;
  }

  /**
   * 落地结算摔落伤害。
   * @param fallTiles 下落格数
   * @returns 实际扣血单位数（0 表示无伤）
   */
  applyFall(fallTiles: number): number {
    if (this.dead) return 0;
    const over = fallTiles - 3;
    if (over < 1) return 0;
    const dmg = Math.floor(over); // 每超 1 格扣 0.5 心 = 1 单位
    return this.damage(dmg);
  }

  /** 通用扣血，返回实际扣血量 */
  damage(units: number): number {
    if (this.dead || units <= 0) return 0;
    const before = this.health;
    this.health = Math.max(0, this.health - units);
    const dealt = before - this.health;
    if (dealt > 0) this.touch();
    if (this.health <= 0) {
      this.dead = true;
      this.onDeath();
    }
    return dealt;
  }

  /** 重生：生命饥饿重置 */
  respawn(): void {
    this.health = HEALTH_MAX;
    this.hunger = HUNGER_MAX;
    this.dead = false;
    this.tickT = 0;
    this.touch();
  }

  /** 便于 HUD 绘制的 0~10 显示值 */
  get hearts(): number { return this.health / 2; }
  get hungerBars(): number { return this.hunger / 2; }
}

/** 由下落像素距离换算格数（工具函数） */
export function pxToTiles(py: number): number {
  return py / TILE;
}
