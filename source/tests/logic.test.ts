/**
 * 逻辑回归测试（不依赖浏览器）：npm test
 * 覆盖：配方匹配 / 背包堆叠 / 生存数值 / 地形生成与矿石分布 / 方块实体判定
 */

import { B, IT, isValidBlockId, BLOCKS } from '../src/blocks';
import { Inventory } from '../src/systems/inventory';
import { matchRecipe, consumeGrid, RECIPES } from '../src/systems/crafting';
import { Survival } from '../src/systems/survival';
import { World } from '../src/world/world';
import { generateWorld } from '../src/world/worldgen';
import { writeSave, readSave, clearSave, SaveData } from '../src/systems/save';
import { WORLD_W, WORLD_H, BEDROCK_ROWS, SAVE_KEY, HEALTH_MAX, HUNGER_MAX } from '../src/config';
import { Slot } from '../src/systems/inventory';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean): void {
  if (cond) { pass++; return; }
  fail++;
  console.error('  ✗ ' + name);
}

function grid(size: 2 | 3, puts: [number, number, number][]): (Slot | null)[] {
  const g: (Slot | null)[] = new Array(size * size).fill(null);
  for (const [r, c, id] of puts) g[r * size + c] = { id, count: 1 };
  return g;
}

// ---------- 配方 ----------
{
  const m = matchRecipe(grid(3, [[0, 0, B.WOOD]]), 3);
  check('木头→木板', !!m && m.recipe.out.id === B.PLANKS && m.recipe.out.count === 4);

  const stick = matchRecipe(grid(3, [[1, 1, B.PLANKS], [2, 1, B.PLANKS]]), 3);
  check('木板竖放→木棍', !!stick && stick.recipe.out.id === IT.STICK);

  const table = matchRecipe(grid(2, [[0, 0, B.PLANKS], [0, 1, B.PLANKS], [1, 0, B.PLANKS], [1, 1, B.PLANKS]]), 2);
  check('木板2×2→工作台', !!table && table.recipe.out.id === B.CRAFT);

  const pick = matchRecipe(grid(3, [
    [0, 0, B.STONE], [0, 1, B.STONE], [0, 2, B.STONE],
    [1, 1, IT.STICK], [2, 1, IT.STICK],
  ]), 3);
  check('石镐配方', !!pick && pick.recipe.out.id === IT.STONE_PICK);

  // 对称图案的镜像仍应正常匹配（图案本身左右对称）
  const mirror = matchRecipe(grid(3, [
    [0, 0, B.STONE], [0, 1, B.STONE], [0, 2, B.STONE],
    [1, 1, IT.STICK], [2, 1, IT.STICK],
  ]), 3);
  check('对称图案匹配', !!mirror && mirror.recipe.out.id === IT.STONE_PICK);

  // 形状不对（木棍偏到左列）不出货
  const wrongShape = matchRecipe(grid(3, [
    [0, 0, B.STONE], [0, 1, B.STONE], [0, 2, B.STONE],
    [1, 0, IT.STICK], [2, 0, IT.STICK],
  ]), 3);
  check('形状不对不出货', wrongShape === null);

  // 多余材料不出货
  const extra = matchRecipe(grid(2, [[0, 0, B.WOOD], [1, 1, B.WOOD]]), 2);
  check('多余材料不出货', extra === null);

  // 扣料只扣占用格
  const g2 = grid(3, [[0, 0, B.WOOD]]);
  g2[0]!.count = 3;
  const m2 = matchRecipe(g2, 3)!;
  consumeGrid(g2, m2.cells);
  check('合成扣料', g2[0] !== null && g2[0]!.count === 2);

  check('配方数量 8 条', RECIPES.length === 8);
}

// ---------- 背包 ----------
{
  const inv = new Inventory();
  inv.addItem(B.DIRT, 70);
  check('堆叠上限 64 + 溢出新堆', inv.slots[0]?.count === 64 && inv.slots[1]?.count === 6);
  check('总数统计', inv.countOf(B.DIRT) === 70);
  inv.consumeById(B.DIRT, 66);
  check('按 id 扣料', inv.countOf(B.DIRT) === 4);
  inv.slots = new Array(36).fill(null);
  const left = inv.addItem(B.STONE, 36 * 64 + 5);
  check('背包满返回剩余', left === 5);

  const inv2 = new Inventory();
  inv2.deserialize([{ id: 9999, count: 3 }, { id: B.DIRT, count: 2 }] as (Slot | null)[]);
  check('读档过滤非法 id', inv2.slots[0] === null && inv2.slots[1]?.id === B.DIRT);
}

// ---------- 生存 ----------
{
  const s = new Survival();
  check('初始满血满饥饿', s.health === 20 && s.hunger === 20);
  const dmg = s.applyFall(6);
  check('摔落 6 格扣 3 单位', dmg === 3 && s.health === 17);
  check('3 格内不摔伤', s.applyFall(3) === 0);
  s.eat(6);
  check('吃苹果回饥饿', s.hunger === 20);
  s.hunger = 0;
  s.health = 3;
  s.update({ dt: 4, moving: false, sprinting: false, jumped: false });
  check('饥饿归零不掉到 0 血', s.health === 2);
  s.health = 19;
  s.hunger = 20;
  s.update({ dt: 4, moving: false, sprinting: false, jumped: false });
  check('饥饿充足缓慢回血', s.health === 20);
}

// ---------- 地形与矿石 ----------
{
  const gen = generateWorld(12345);
  const again = generateWorld(12345);
  let same = gen.blocks.length === again.blocks.length;
  for (let i = 0; i < gen.blocks.length && same; i++) if (gen.blocks[i] !== again.blocks[i]) same = false;
  check('同 seed 地形一致', same);

  const counts: Record<number, number> = {};
  for (const id of gen.blocks) counts[id] = (counts[id] ?? 0) + 1;
  check('煤生成', (counts[B.COAL_ORE] ?? 0) > 20);
  check('铁生成', (counts[B.IRON_ORE] ?? 0) > 10);
  check('金生成', (counts[B.GOLD_ORE] ?? 0) > 5);
  check('钻石生成', (counts[B.DIAMOND_ORE] ?? 0) > 5);

  const world = new World(gen.blocks);
  let bedrockOk = true;
  for (let x = 0; x < WORLD_W; x += 7) {
    for (let k = 1; k <= BEDROCK_ROWS; k++) {
      if (world.get(x, WORLD_H - k) !== B.BEDROCK) bedrockOk = false;
    }
  }
  check('底部基岩层', bedrockOk);

  // 火把非实体 / 空气非实体 / 石头实体
  const tx = 100;
  const sy = world.surfaceYAt(tx);
  world.set(tx, sy - 1, B.TORCH);
  check('火把非实体', world.isSolid(tx, sy - 1) === false);
  check('空气非实体', world.isSolid(tx, sy - 2) === false);
  world.set(tx, sy + 4, B.STONE);
  check('石头实心', world.isSolid(tx, sy + 4) === true);
  check('非法方块 id 校验', isValidBlockId(B.WOOD) && !isValidBlockId(9999));
  check('方块注册表完整', Object.keys(BLOCKS).length >= 14);
}

// ---------- 存档（用内存版 localStorage 模拟） ----------
{
  const store: Record<string, string> = {};
  let failWrite = false;
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { if (failWrite) throw new Error('QuotaExceeded'); store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { for (const k of Object.keys(store)) delete store[k]; },
    key: () => null,
    get length() { return Object.keys(store).length; },
  } as Storage;

  const data: SaveData = {
    version: 2,
    seed: 777,
    blockDiffs: { '100': B.AIR, '101': B.PLANKS },
    player: { x: 1234, y: 567, health: 14, hunger: 9 },
    inventory: [{ id: B.DIRT, count: 12 }, null],
    hotbarIndex: 3,
    stats: { coal: true },
  };
  check('存档写入', writeSave(data) === true);
  const back = readSave();
  check('存档往返', !!back && back.seed === 777 && back.player.health === 14 && back.player.hunger === 9
    && back.inventory[0]?.count === 12 && back.hotbarIndex === 3 && back.stats?.coal === true);

  // 损坏 JSON → 安全返回 null
  store[SAVE_KEY] = '{oops';
  check('损坏 JSON 回退', readSave() === null);

  // 非法字段：越界数值钳制、非法 id 过滤
  store[SAVE_KEY] = JSON.stringify({
    seed: 5,
    blockDiffs: { '0': 9999, '1': B.WOOD },
    player: { x: 0, y: 0, health: 999, hunger: -5 },
    inventory: [{ id: 4242, count: 3 }],
    hotbarIndex: 99,
    stats: { coal: 'yes', diamond: true, hacked: true },
  });
  const san = readSave();
  check('非法存档钳制', !!san && san.player.health === HEALTH_MAX && san.player.hunger === 0
    && san.hotbarIndex === 8 && san.inventory[0] === null
    && !('0' in san.blockDiffs) && '1' in san.blockDiffs
    && san.stats?.diamond === true && san.stats?.coal === undefined && !('hacked' in (san.stats ?? {})));

  // 写入失败返回 false
  failWrite = true;
  check('写入失败返回 false', writeSave(data) === false);
  failWrite = false;
  clearSave();
  check('清档', readSave() === null);
}

// ---------- 汇总 ----------
console.log(`\n逻辑测试：${pass} 通过 / ${fail} 失败`);
if (fail > 0) throw new Error(`逻辑测试有 ${fail} 项失败`);
