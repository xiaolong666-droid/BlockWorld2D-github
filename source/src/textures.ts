/**
 * textures.ts —— 程序化像素纹理生成器（零外部素材）
 * 所有 16×16 贴图、UI 贴图、背景贴图均由 Canvas 代码绘制，
 * 启动时一次性注册为 Phaser 纹理。
 */

import { B, IT } from './blocks';

// ---------- 小工具 ----------

type RNG = () => number;
type RGB = [number, number, number];

/** 确定性伪随机数生成器（mulberry32） */
export function mulberry32(seed: number): RNG {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rgbStr(c: RGB): string {
  return `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
}

/** 颜色乘系数变暗/变亮 */
function shade(c: RGB, f: number): string {
  return rgbStr([Math.min(255, c[0] * f), Math.min(255, c[1] * f), Math.min(255, c[2] * f)]);
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  return [cv, ctx];
}

/** 火把光照用的径向渐变（白色 → 透明，供 RenderTexture.erase 抠洞） */
function makeLightCanvas(): HTMLCanvasElement {
  const size = 256;
  const [cv, ctx] = makeCanvas(size, size);
  ctx.imageSmoothingEnabled = true;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.82)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return cv;
}

function px(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, 1, 1);
}

/** 噪点填充：在区域内逐像素按随机亮度绘制底色 */
function noisyRect(
  ctx: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number,
  base: RGB, amp: number, rng: RNG,
): void {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const f = 1 - amp * rng();
      px(ctx, x, y, shade(base, f));
    }
  }
}

/** 散布斑点（矿石特征色等） */
function speckles(
  ctx: CanvasRenderingContext2D, rng: RNG, color: RGB, clusters: number,
  x0 = 0, y0 = 0, w = 16, h = 16,
): void {
  for (let i = 0; i < clusters; i++) {
    const cx = x0 + 1 + Math.floor(rng() * (w - 3));
    const cy = y0 + 1 + Math.floor(rng() * (h - 3));
    const size = 1 + Math.floor(rng() * 2);
    for (let dy = 0; dy <= size; dy++) {
      for (let dx = 0; dx <= size; dx++) {
        if (rng() < 0.25) continue;
        px(ctx, cx + dx, cy + dy, rng() < 0.3 ? shade(color, 0.7) : rgbStr(color));
      }
    }
  }
}

// ---------- 方块纹理绘制 ----------

const DIRT: RGB = [134, 96, 67];
const GRASS_C: RGB = [106, 170, 64];
const STONE: RGB = [125, 125, 125];
const WOOD_C: RGB = [156, 110, 64];
const WOOD_DARK: RGB = [110, 76, 44];
const LEAF: RGB = [64, 130, 42];
const PLANK: RGB = [172, 124, 74];

function drawGrass(ctx: CanvasRenderingContext2D, rng: RNG): void {
  noisyRect(ctx, 0, 0, 16, 16, DIRT, 0.18, rng);
  // 顶部 4 行绿色带
  noisyRect(ctx, 0, 0, 16, 4, GRASS_C, 0.2, rng);
  // 第 5 行锯齿过渡
  for (let x = 0; x < 16; x++) {
    if (rng() < 0.55) px(ctx, x, 4, shade(GRASS_C, 0.85 - rng() * 0.2));
  }
  // 泥土区散点
  speckles(ctx, rng, [100, 70, 48], 3);
}

function drawDirt(ctx: CanvasRenderingContext2D, rng: RNG): void {
  noisyRect(ctx, 0, 0, 16, 16, DIRT, 0.2, rng);
  speckles(ctx, rng, [100, 70, 48], 4);
  speckles(ctx, rng, [160, 120, 86], 2);
}

function drawSand(ctx: CanvasRenderingContext2D, rng: RNG): void {
  noisyRect(ctx, 0, 0, 16, 16, [218, 203, 150], 0.12, rng);
  speckles(ctx, rng, [196, 180, 126], 3);
}

function drawStone(ctx: CanvasRenderingContext2D, rng: RNG): void {
  noisyRect(ctx, 0, 0, 16, 16, STONE, 0.16, rng);
  speckles(ctx, rng, [95, 95, 95], 4);
}

function drawBedrock(ctx: CanvasRenderingContext2D, rng: RNG): void {
  const palette: RGB[] = [[40, 40, 40], [70, 70, 70], [24, 24, 24], [92, 92, 92]];
  for (let y = 0; y < 16; y += 2) {
    for (let x = 0; x < 16; x += 2) {
      const c = palette[Math.floor(rng() * palette.length)];
      ctx.fillStyle = rgbStr(c);
      ctx.fillRect(x, y, 2, 2);
    }
  }
}

function drawWood(ctx: CanvasRenderingContext2D, rng: RNG): void {
  // 两侧树皮深色竖条
  noisyRect(ctx, 0, 0, 2, 16, WOOD_DARK, 0.15, rng);
  noisyRect(ctx, 14, 0, 2, 16, WOOD_DARK, 0.15, rng);
  // 中间竖纹交替
  for (let x = 2; x < 14; x++) {
    const c: RGB = x % 4 < 2 ? WOOD_C : [140, 98, 56];
    for (let y = 0; y < 16; y++) {
      px(ctx, x, y, shade(c, 1 - rng() * 0.12));
    }
  }
  // 少量横向断纹
  for (let i = 0; i < 3; i++) {
    const y = Math.floor(rng() * 16);
    px(ctx, 3 + Math.floor(rng() * 10), y, shade(WOOD_DARK, 0.9));
  }
}

function drawLeaves(ctx: CanvasRenderingContext2D, rng: RNG): void {
  noisyRect(ctx, 0, 0, 16, 16, LEAF, 0.3, rng);
  // 深色孔洞与高光
  for (let i = 0; i < 8; i++) {
    px(ctx, Math.floor(rng() * 16), Math.floor(rng() * 16), shade(LEAF, 0.45));
  }
  for (let i = 0; i < 6; i++) {
    px(ctx, Math.floor(rng() * 16), Math.floor(rng() * 16), shade(LEAF, 1.3));
  }
}

function drawPlanks(ctx: CanvasRenderingContext2D, rng: RNG): void {
  for (let y = 0; y < 16; y++) {
    const isSeam = y % 4 === 3;
    for (let x = 0; x < 16; x++) {
      if (isSeam) { px(ctx, x, y, shade([110, 78, 44], 0.95 - rng() * 0.1)); continue; }
      px(ctx, x, y, shade(PLANK, 1 - rng() * 0.14));
    }
  }
  // 每块板错位竖缝
  px(ctx, 4, 0, shade([110, 78, 44], 0.9)); px(ctx, 4, 1, shade([110, 78, 44], 0.9)); px(ctx, 4, 2, shade([110, 78, 44], 0.9));
  px(ctx, 11, 4, shade([110, 78, 44], 0.9)); px(ctx, 11, 5, shade([110, 78, 44], 0.9)); px(ctx, 11, 6, shade([110, 78, 44], 0.9));
  px(ctx, 6, 8, shade([110, 78, 44], 0.9)); px(ctx, 6, 9, shade([110, 78, 44], 0.9)); px(ctx, 6, 10, shade([110, 78, 44], 0.9));
  px(ctx, 13, 12, shade([110, 78, 44], 0.9)); px(ctx, 13, 13, shade([110, 78, 44], 0.9)); px(ctx, 13, 14, shade([110, 78, 44], 0.9));
}

function drawCraft(ctx: CanvasRenderingContext2D, rng: RNG): void {
  ctx.clearRect(0, 0, 16, 16);
  // 顶面：浅色台面 + 合成网格图案（与木板明显区分）
  noisyRect(ctx, 0, 0, 16, 6, [206, 168, 112], 0.08, rng);
  // 台面深色描边
  for (let x = 0; x < 16; x++) { px(ctx, x, 0, 'rgb(60,40,20)'); px(ctx, x, 5, 'rgb(60,40,20)'); }
  for (let y = 0; y < 6; y++) { px(ctx, 0, y, 'rgb(60,40,20)'); px(ctx, 15, y, 'rgb(60,40,20)'); }
  // 台面网格线
  for (let y = 1; y < 5; y++) { px(ctx, 5, y, 'rgb(110,80,50)'); px(ctx, 10, y, 'rgb(110,80,50)'); }
  for (let x = 1; x < 15; x++) { px(ctx, x, 3, 'rgb(110,80,50)'); }
  // 格子中心凹点
  px(ctx, 3, 2, 'rgb(90,60,34)'); px(ctx, 8, 2, 'rgb(90,60,34)'); px(ctx, 12, 2, 'rgb(90,60,34)');
  px(ctx, 3, 4, 'rgb(90,60,34)'); px(ctx, 8, 4, 'rgb(90,60,34)'); px(ctx, 12, 4, 'rgb(90,60,34)');
  // 侧面：深色木板底
  noisyRect(ctx, 0, 6, 16, 10, [122, 86, 52], 0.12, rng);
  for (let x = 0; x < 16; x++) { px(ctx, x, 10, 'rgb(70,50,30)'); }
  // 左侧锯子
  for (let y = 7; y < 12; y++) { px(ctx, 3, y, 'rgb(190,190,200)'); }
  for (let y = 7; y < 12; y++) { if (y % 2 === 0) px(ctx, 4, y, 'rgb(150,150,160)'); }
  // 右侧锤子
  ctx.fillStyle = 'rgb(120,120,130)';
  ctx.fillRect(11, 7, 3, 3);
  px(ctx, 12, 10, 'rgb(146,104,58)');
  px(ctx, 12, 11, 'rgb(146,104,58)');
  // 中间装饰钉
  px(ctx, 7, 8, 'rgb(80,56,32)');
  px(ctx, 8, 13, 'rgb(80,56,32)');
}

function drawTorch(ctx: CanvasRenderingContext2D, rng: RNG): void {
  ctx.clearRect(0, 0, 16, 16);
  // 木柄
  for (let y = 6; y < 16; y++) {
    px(ctx, 7, y, shade([146, 104, 58], 1 - rng() * 0.15));
    px(ctx, 8, y, shade([126, 88, 48], 1 - rng() * 0.15));
  }
  // 火焰外层（橙）
  ctx.fillStyle = 'rgb(255,140,0)';
  ctx.fillRect(6, 2, 4, 4);
  // 火焰内层（黄）
  ctx.fillStyle = 'rgb(255,221,0)';
  ctx.fillRect(7, 3, 2, 2);
  // 火苗尖
  px(ctx, 7, 1, 'rgb(255,180,40)');
  px(ctx, 8, 1, 'rgb(255,180,40)');
}

function drawOre(ctx: CanvasRenderingContext2D, rng: RNG, color: RGB): void {
  drawStone(ctx, rng);
  speckles(ctx, rng, color, 5);
}

// ---------- 物品纹理绘制 ----------

function drawStick(ctx: CanvasRenderingContext2D, rng: RNG): void {
  ctx.clearRect(0, 0, 16, 16);
  for (let i = 0; i < 8; i++) {
    const x = 4 + i, y = 11 - i;
    px(ctx, x, y, shade(WOOD_C, 1 - rng() * 0.15));
    px(ctx, x + 1, y, shade(WOOD_DARK, 1 - rng() * 0.15));
  }
}

function drawApple(ctx: CanvasRenderingContext2D, _rng: RNG): void {
  ctx.clearRect(0, 0, 16, 16);
  const c = [8, 9];
  // 圆形果体
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const d = Math.hypot(x - c[0], y - c[1]);
      if (d <= 4.6) px(ctx, x, y, x > c[0] + 2 ? 'rgb(160,24,24)' : 'rgb(210,40,40)');
    }
  }
  // 高光
  px(ctx, 6, 7, 'rgb(255,150,150)');
  px(ctx, 7, 7, 'rgb(255,150,150)');
  // 果柄与叶
  px(ctx, 8, 3, 'rgb(110,76,44)'); px(ctx, 8, 4, 'rgb(110,76,44)');
  px(ctx, 10, 3, 'rgb(90,160,60)'); px(ctx, 11, 3, 'rgb(90,160,60)');
}

function drawCoal(ctx: CanvasRenderingContext2D, _rng: RNG): void {
  ctx.clearRect(0, 0, 16, 16);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const d = Math.hypot(x - 8, y - 8);
      if (d <= 4.4) px(ctx, x, y, x + y > 17 ? 'rgb(20,20,20)' : 'rgb(48,48,48)');
    }
  }
  px(ctx, 6, 6, 'rgb(90,90,90)'); px(ctx, 7, 6, 'rgb(90,90,90)');
}

/** 镐：柄为斜木棍，头部为弧形金属/材质条 */
function drawPick(ctx: CanvasRenderingContext2D, rng: RNG, headColor: RGB): void {
  ctx.clearRect(0, 0, 16, 16);
  // 木柄（右下→左上）
  for (let i = 0; i < 8; i++) {
    const x = 4 + i, y = 12 - i;
    px(ctx, x, y, shade(WOOD_C, 1 - rng() * 0.15));
  }
  // 镐头弧条
  for (let x = 2; x <= 13; x++) {
    const y = x <= 4 ? 3 + (4 - x) : x >= 11 ? 3 + (x - 11) : 3;
    px(ctx, x, y, rgbStr(headColor));
    px(ctx, x, y + 1, shade(headColor, 0.65));
  }
  // 镐头两端下垂尖
  px(ctx, 2, 6, shade(headColor, 0.9));
  px(ctx, 13, 6, shade(headColor, 0.9));
  // 与柄的固定点
  px(ctx, 7, 4, shade(headColor, 0.8));
  px(ctx, 8, 4, shade(headColor, 0.8));
}

// ---------- 像素图案绘制（心/饥饿） ----------

/** 按字符图案绘制像素图：X=主体色 o=暗色 .=透明 */
function drawPattern(
  ctx: CanvasRenderingContext2D, rows: string[],
  main: RGB, dark: RGB, offX: number, offY: number,
  halfSide: 'none' | 'left' | 'right' = 'none', emptyGray = false,
): void {
  const w = rows[0].length, h = rows.length;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = rows[y][x];
      if (ch === '.') continue;
      const isHalfOut =
        (halfSide === 'left' && x >= w / 2) ||
        (halfSide === 'right' && x < w / 2);
      let c: RGB = ch === 'o' ? dark : main;
      if (emptyGray || isHalfOut) c = [110, 110, 110];
      px(ctx, offX + x, offY + y, rgbStr(c));
    }
  }
}

const HEART_PATTERN = [
  '.XX.XX.',
  'XXXXXXX',
  'XXXXXXX',
  '.XXXXX.',
  '..XXX..',
  '...X...',
];

const HUNGER_PATTERN = [
  '..MMM..',
  '.MMMMMo',
  '.MMMMoo',
  '..MMoo.',
  '...Boo.',
  '....B..',
];

function makeIconCanvas(
  pattern: string[], main: RGB, dark: RGB,
  variant: 'full' | 'half' | 'empty',
): HTMLCanvasElement {
  const [cv, ctx] = makeCanvas(16, 16);
  const w = pattern[0].length;
  drawPattern(ctx, pattern, main, dark, (16 - w) >> 1, 5,
    variant === 'half' ? 'right' : 'none', variant === 'empty');
  return cv;
}

// ---------- 破坏裂纹 ----------

function makeCrackCanvas(stage: number): HTMLCanvasElement {
  const [cv, ctx] = makeCanvas(16, 16);
  const rng = mulberry32(1000 + stage * 77);
  const lines = 2 + stage * 2;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  for (let i = 0; i < lines; i++) {
    let x = 4 + Math.floor(rng() * 8);
    let y = 4 + Math.floor(rng() * 8);
    const len = 2 + stage;
    const dx = rng() < 0.5 ? 1 : -1;
    const dy = rng() < 0.5 ? 1 : -1;
    for (let j = 0; j < len; j++) {
      ctx.fillRect(x, y, 1, 1);
      if (rng() < 0.5) x += dx; else y += dy;
      x = Math.max(0, Math.min(15, x));
      y = Math.max(0, Math.min(15, y));
    }
  }
  return cv;
}

// ---------- 玩家贴图（16×32 画布，角色 12×28） ----------

function makePlayerCanvas(frame: 'idle' | 'walk1' | 'walk2'): HTMLCanvasElement {
  const [cv, ctx] = makeCanvas(16, 32);
  const ox = 2, oy = 2; // 角色 12×28 内嵌于 16×32
  // 头盔（黄）
  ctx.fillStyle = 'rgb(255,200,40)';
  ctx.fillRect(ox + 1, oy, 10, 4);
  ctx.fillStyle = 'rgb(220,170,20)';
  ctx.fillRect(ox + 1, oy + 4, 10, 1);
  // 脸（肤色）
  ctx.fillStyle = 'rgb(240,190,150)';
  ctx.fillRect(ox + 1, oy + 5, 10, 4);
  // 眼睛（朝右）
  ctx.fillStyle = 'rgb(40,40,60)';
  ctx.fillRect(ox + 6, oy + 6, 2, 2);
  ctx.fillRect(ox + 2, oy + 6, 1, 2);
  // 上衣（蓝）
  ctx.fillStyle = 'rgb(70,110,200)';
  ctx.fillRect(ox, oy + 9, 12, 8);
  ctx.fillStyle = 'rgb(50,85,160)';
  ctx.fillRect(ox, oy + 15, 12, 2);
  // 手臂
  ctx.fillStyle = 'rgb(240,190,150)';
  ctx.fillRect(ox - 1, oy + 10, 1, 5);
  ctx.fillRect(ox + 12, oy + 10, 1, 5);
  // 腿（深蓝灰）
  ctx.fillStyle = 'rgb(60,64,92)';
  if (frame === 'idle') {
    ctx.fillRect(ox + 2, oy + 17, 3, 11);
    ctx.fillRect(ox + 7, oy + 17, 3, 11);
  } else if (frame === 'walk1') {
    ctx.fillRect(ox + 1, oy + 17, 3, 10);
    ctx.fillRect(ox + 8, oy + 17, 3, 11);
  } else {
    ctx.fillRect(ox + 2, oy + 17, 3, 11);
    ctx.fillRect(ox + 7, oy + 17, 3, 10);
  }
  // 鞋
  ctx.fillStyle = 'rgb(40,40,50)';
  ctx.fillRect(ox + 1, oy + 26, 4, 2);
  ctx.fillRect(ox + 7, oy + 26, 4, 2);
  return cv;
}

// ---------- 背景（天空/远山/云/太阳） ----------

function makeSkyCanvas(): HTMLCanvasElement {
  const [cv, ctx] = makeCanvas(64, 512);
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, 'rgb(96,178,235)');
  g.addColorStop(1, 'rgb(198,232,250)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 512);
  return cv;
}

function makeMountainCanvas(color: RGB, ridgeBase: number, ridgeAmp: number, seed: number): HTMLCanvasElement {
  const [cv, ctx] = makeCanvas(512, 270);
  const rng = mulberry32(seed);
  // 用分段随机高度构成山脊线，并做邻值平滑
  const seg = 32;
  const hs: number[] = [];
  for (let i = 0; i <= seg; i++) hs.push(ridgeBase + (rng() - 0.5) * 2 * ridgeAmp);
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 1; i < seg; i++) hs[i] = (hs[i - 1] + hs[i] * 2 + hs[i + 1]) / 4;
  }
  ctx.fillStyle = rgbStr(color);
  for (let x = 0; x < 512; x++) {
    const t = (x / 512) * seg;
    const i = Math.floor(t);
    const f = t - i;
    const y = hs[i] * (1 - f) + hs[Math.min(seg, i + 1)] * f;
    ctx.fillRect(x, Math.round(y), 1, 270 - Math.round(y));
  }
  // 山体下部略微加深
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillRect(0, 190, 512, 80);
  return cv;
}

function makeCloudCanvas(): HTMLCanvasElement {
  const [cv, ctx] = makeCanvas(512, 270);
  const rng = mulberry32(777);
  for (let i = 0; i < 7; i++) {
    const cx = rng() * 512, cy = 20 + rng() * 100;
    const s = 0.7 + rng() * 0.8;
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    for (const [dx, dy, r] of [[0, 0, 16], [14, 4, 12], [-14, 5, 11], [4, -7, 11], [-6, -5, 10]] as const) {
      ctx.beginPath();
      ctx.ellipse(cx + dx * s, cy + dy * s, r * s, r * 0.62 * s, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return cv;
}

function makeSunCanvas(): HTMLCanvasElement {
  const [cv, ctx] = makeCanvas(64, 64);
  ctx.fillStyle = 'rgba(255,244,180,0.35)';
  ctx.beginPath(); ctx.arc(32, 32, 26, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,248,210,0.8)';
  ctx.beginPath(); ctx.arc(32, 32, 18, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgb(255,252,228)';
  ctx.beginPath(); ctx.arc(32, 32, 12, 0, Math.PI * 2); ctx.fill();
  return cv;
}

// ---------- UI 贴图 ----------

function makeSlotCanvas(selected: boolean): HTMLCanvasElement {
  const [cv, ctx] = makeCanvas(44, 44);
  ctx.fillStyle = 'rgb(58,58,66)';
  ctx.fillRect(0, 0, 44, 44);
  ctx.fillStyle = 'rgb(44,44,52)';
  ctx.fillRect(3, 3, 38, 38);
  ctx.fillStyle = selected ? 'rgb(255,214,64)' : 'rgb(120,120,132)';
  if (selected) {
    ctx.fillRect(0, 0, 44, 3); ctx.fillRect(0, 41, 44, 3);
    ctx.fillRect(0, 0, 3, 44); ctx.fillRect(41, 0, 3, 44);
  } else {
    ctx.fillRect(0, 0, 44, 2); ctx.fillRect(0, 42, 44, 2);
    ctx.fillRect(0, 0, 2, 44); ctx.fillRect(42, 0, 2, 44);
  }
  return cv;
}

function makeBtnCanvas(hover: boolean): HTMLCanvasElement {
  const [cv, ctx] = makeCanvas(200, 44);
  const base = hover ? [92, 122, 178] : [66, 88, 130];
  ctx.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`;
  ctx.fillRect(2, 2, 196, 40);
  // 顶部高光/底部阴影形成立体感
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(2, 2, 196, 4);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(2, 38, 196, 4);
  ctx.strokeStyle = 'rgb(24,32,48)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, 198, 42);
  return cv;
}

// ---------- 注册入口 ----------

/** 方块 id → 16×16 原始画布（供区块合成绘制） */
const blockCanvasMap = new Map<number, HTMLCanvasElement>();

export function getBlockCanvas(id: number): HTMLCanvasElement | undefined {
  return blockCanvasMap.get(id);
}

function addCanvasTex(scene: Phaser.Scene, key: string, cv: HTMLCanvasElement): void {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.addCanvas(key, cv);
  if (tex) tex.refresh();
}

/**
 * 生成并注册全部纹理（BootScene 启动时调用一次）
 */
export function ensureTextures(scene: Phaser.Scene): void {
  // ----- 方块 -----
  const reg = (id: number, draw: (ctx: CanvasRenderingContext2D, rng: RNG) => void, seed: number) => {
    const [cv, ctx] = makeCanvas(16, 16);
    draw(ctx, mulberry32(seed));
    blockCanvasMap.set(id, cv);
    addCanvasTex(scene, `block_${id}`, cv);
  };
  reg(B.GRASS, drawGrass, 11);
  reg(B.DIRT, drawDirt, 22);
  reg(B.SAND, drawSand, 33);
  reg(B.STONE, drawStone, 44);
  reg(B.WOOD, drawWood, 55);
  reg(B.LEAVES, drawLeaves, 66);
  reg(B.PLANKS, drawPlanks, 77);
  reg(B.CRAFT, drawCraft, 88);
  reg(B.TORCH, drawTorch, 99);
  reg(B.COAL_ORE, (c, r) => drawOre(c, r, [30, 30, 30]), 111);
  reg(B.IRON_ORE, (c, r) => drawOre(c, r, [216, 173, 140]), 222);
  reg(B.GOLD_ORE, (c, r) => drawOre(c, r, [252, 222, 112]), 333);
  reg(B.DIAMOND_ORE, (c, r) => drawOre(c, r, [92, 219, 213]), 444);
  reg(B.BEDROCK, drawBedrock, 555);

  // ----- 物品 -----
  const regItem = (id: number, draw: (ctx: CanvasRenderingContext2D, rng: RNG) => void, seed: number) => {
    const [cv, ctx] = makeCanvas(16, 16);
    draw(ctx, mulberry32(seed));
    addCanvasTex(scene, `item_${id}`, cv);
  };
  regItem(IT.STICK, drawStick, 666);
  regItem(IT.APPLE, drawApple, 667);
  regItem(IT.COAL, drawCoal, 668);
  regItem(IT.WOOD_PICK, (c, r) => drawPick(c, r, WOOD_C), 771);
  regItem(IT.STONE_PICK, (c, r) => drawPick(c, r, [135, 135, 135]), 772);
  regItem(IT.IRON_PICK, (c, r) => drawPick(c, r, [222, 222, 228]), 773);
  regItem(IT.DIAMOND_PICK, (c, r) => drawPick(c, r, [92, 219, 213]), 774);

  // ----- HUD 图标 -----
  addCanvasTex(scene, 'heart_full', makeIconCanvas(HEART_PATTERN, [235, 64, 64], [140, 20, 20], 'full'));
  addCanvasTex(scene, 'heart_half', makeIconCanvas(HEART_PATTERN, [235, 64, 64], [140, 20, 20], 'half'));
  addCanvasTex(scene, 'heart_empty', makeIconCanvas(HEART_PATTERN, [235, 64, 64], [140, 20, 20], 'empty'));
  addCanvasTex(scene, 'hunger_full', makeIconCanvas(HUNGER_PATTERN, [176, 106, 52], [120, 70, 34], 'full'));
  addCanvasTex(scene, 'hunger_half', makeIconCanvas(HUNGER_PATTERN, [176, 106, 52], [120, 70, 34], 'half'));
  addCanvasTex(scene, 'hunger_empty', makeIconCanvas(HUNGER_PATTERN, [176, 106, 52], [120, 70, 34], 'empty'));

  // ----- 裂纹 / 粒子 -----
  for (let s = 0; s < 5; s++) addCanvasTex(scene, `crack_${s}`, makeCrackCanvas(s));
  {
    const [cv, ctx] = makeCanvas(3, 3);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 3, 3);
    addCanvasTex(scene, 'particle', cv);
  }

  // ----- 玩家 -----
  addCanvasTex(scene, 'player_idle', makePlayerCanvas('idle'));
  addCanvasTex(scene, 'player_walk1', makePlayerCanvas('walk1'));
  addCanvasTex(scene, 'player_walk2', makePlayerCanvas('walk2'));

  // ----- UI -----
  addCanvasTex(scene, 'slot_bg', makeSlotCanvas(false));
  addCanvasTex(scene, 'slot_sel', makeSlotCanvas(true));
  addCanvasTex(scene, 'btn', makeBtnCanvas(false));
  addCanvasTex(scene, 'btn_hover', makeBtnCanvas(true));

  // ----- 背景 -----
  addCanvasTex(scene, 'bg_sky', makeSkyCanvas());
  addCanvasTex(scene, 'bg_sun', makeSunCanvas());
  addCanvasTex(scene, 'bg_clouds', makeCloudCanvas());
  addCanvasTex(scene, 'bg_mtn_far', makeMountainCanvas([150, 182, 208], 120, 55, 1234));
  addCanvasTex(scene, 'bg_mtn_near', makeMountainCanvas([108, 140, 168], 165, 62, 4321));

  // ----- 光照 -----
  addCanvasTex(scene, 'light_glow', makeLightCanvas());
}
