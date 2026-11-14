/**
 * inventoryUI.ts —— 背包/合成界面（总设定 1.8）
 * 9 快捷格 + 27 储物格 + 2×2 随身合成（背包模式）
 * 或 3×3 工作台合成（工作台模式，同一套代码）。
 * 点击拿起/放下移动物品，支持两格交换与堆叠合并。
 */

import Phaser from 'phaser';
import { Slot, Inventory } from '../systems/inventory';
import { matchRecipe, consumeGrid, MatchResult } from '../systems/crafting';
import { iconKey, itemName } from '../blocks';
import { MAX_STACK } from '../config';
import { makeText, makePanel } from './common';

const SLOT = 44;
const PITCH = 48;

interface SlotWidget {
  bg: Phaser.GameObjects.Image;
  icon: Phaser.GameObjects.Image;
  count: Phaser.GameObjects.Text;
  get: () => Slot | null;
  set: (s: Slot | null) => void;
}

export type PanelMode = 'inv' | 'craft';

export class InventoryUI {
  private scene: Phaser.Scene;
  private inventory: Inventory;
  private worldCam: Phaser.Cameras.Scene2D.Camera;
  private onDirty: () => void;
  private onClose: () => void;
  private onCrafted: (name: string) => void;
  /** 手持物品变化回调（拿起/放下时通知，用于显示物品名） */
  private onHeldChange: (name: string | null) => void;
  /** 消息提示（背包已满等） */
  private onNotify: (msg: string) => void;
  private lastHeldId = -1;
  /** 背包满时暂存的物品，下次打开面板自动归还（保证物品守恒） */
  private pendingReturn: Slot[] = [];

  /** 打开状态与模式 */
  isOpen = false;
  mode: PanelMode = 'inv';

  private objs: Phaser.GameObjects.GameObject[] = [];
  private invWidgets: SlotWidget[] = [];
  private craftWidgets: SlotWidget[] = [];
  private resultWidget: SlotWidget | null = null;
  private resultDim: Phaser.GameObjects.Rectangle | null = null;
  private craftGrid: (Slot | null)[] = [];
  private craftSize: 2 | 3 = 2;
  private cursorIcon: Phaser.GameObjects.Image | null = null;
  private cursorCount: Phaser.GameObjects.Text | null = null;
  private cursorSlot: Slot | null = null;
  /** 按住左键拖拽分发时，上一个分发到的格子（同一格不重复分发） */
  private lastDistWidget: SlotWidget | null = null;
  private lastClickTime = 0;
  private lastClickId = -1;

  constructor(
    scene: Phaser.Scene, inventory: Inventory, worldCam: Phaser.Cameras.Scene2D.Camera,
    onDirty: () => void, onClose: () => void, onCrafted?: (name: string) => void,
    onHeldChange?: (name: string | null) => void, onNotify?: (msg: string) => void,
  ) {
    this.scene = scene;
    this.inventory = inventory;
    this.worldCam = worldCam;
    this.onDirty = onDirty;
    this.onClose = onClose;
    this.onCrafted = onCrafted ?? (() => {});
    this.onHeldChange = onHeldChange ?? (() => {});
    this.onNotify = onNotify ?? (() => {});
    this.attachInput();
  }

  /** 创建的对象统一注册：让世界相机忽略 UI，并置于面板层 */
  private reg<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.objs.push(o);
    this.worldCam.ignore(o);
    (o as unknown as { setDepth?: (v: number) => void }).setDepth?.(300);
    return o;
  }

  open(mode: PanelMode): void {
    // 已打开时切换模式：先清理重建，避免格子重复
    if (this.isOpen) {
      if (this.mode === mode) return;
      this.close();
    }
    this.isOpen = true;
    this.mode = mode;
    this.craftSize = mode === 'craft' ? 3 : 2;
    this.craftGrid = new Array(this.craftSize * this.craftSize).fill(null);
    // 归还上一次背包满时暂存的物品
    this.flushPending();
    this.build();
    this.refresh();
  }

  private flushPending(): void {
    if (this.pendingReturn.length === 0) return;
    const rest: Slot[] = [];
    for (const s of this.pendingReturn) {
      const left = this.inventory.addItem(s.id, s.count);
      if (left > 0) rest.push({ id: s.id, count: left });
    }
    this.pendingReturn = rest;
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    // 合成格与手持物品退回背包；装不下的暂存，下次打开自动归还（不丢失）
    const items: Slot[] = [];
    for (const s of this.craftGrid) if (s) items.push(s);
    this.craftGrid = [];
    if (this.cursorSlot) {
      items.push(this.cursorSlot);
      this.cursorSlot = null;
      this.lastHeldId = -1;
    }
    let overflow = 0;
    for (const s of items) {
      const left = this.inventory.addItem(s.id, s.count);
      if (left > 0) {
        this.pendingReturn.push({ id: s.id, count: left });
        overflow += left;
      }
    }
    if (overflow > 0) this.onNotify('背包已满，物品已暂存');
    this.clearObjects();
    this.onDirty();
    this.onClose();
  }

  toggle(mode: PanelMode): void {
    if (this.isOpen && this.mode === mode) this.close();
    else if (!this.isOpen) this.open(mode);
  }

  private clearObjects(): void {
    for (const o of this.objs) o.destroy();
    this.objs = [];
    this.invWidgets = [];
    this.craftWidgets = [];
    this.resultWidget = null;
    this.resultDim = null;
    this.cursorIcon = null;
    this.cursorCount = null;
  }

  // ---------- 构建 ----------

  private build(): void {
    const cx = 480, cy = 270;
    const w = 472, h = 430;
    this.reg(makePanel(this.scene, cx, cy, w, h));

    const title = this.mode === 'craft' ? '工作台' : '背包';
    this.reg(makeText(this.scene, cx, 76, title, 20, '#ffd94a'));

    const left = cx - w / 2;
    // 合成区（3×3 上移，避免压住下方储物格）
    const gridW = this.craftSize * PITCH;
    const gx0 = left + 30;
    const gy0 = this.craftSize === 3 ? 96 : 132;

    for (let r = 0; r < this.craftSize; r++) {
      for (let c = 0; c < this.craftSize; c++) {
        const x = gx0 + c * PITCH + SLOT / 2;
        const y = gy0 + r * PITCH + SLOT / 2;
        const idx = r * this.craftSize + c;
        this.craftWidgets.push(this.makeSlot(x, y, {
          get: () => this.craftGrid[idx],
          set: (s) => { this.craftGrid[idx] = s; },
        }));
      }
    }

    // 箭头与结果格
    const arrowX = gx0 + gridW + 34;
    this.reg(makeText(this.scene, arrowX, gy0 + (this.craftSize * PITCH) / 2, '→', 26, '#cccccc'));
    const resX = arrowX + 44 + SLOT / 2;
    const resY = gy0 + (this.craftSize * PITCH) / 2;
    this.resultWidget = this.makeSlot(resX, resY, {
      get: () => this.matchedResult(),
      set: () => { /* 结果格只读 */ },
    });
    // 结果格：左键点击 = 领取合成产物（由手动命中检测路由）
    this.resultDim = this.reg(this.scene.add.rectangle(resX, resY, SLOT - 6, SLOT - 6, 0x000000, 0.45));

    // 储物格 27（9×3）
    const sy0 = 240;
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 9; c++) {
        const i = 9 + r * 9 + c;
        const x = left + 24 + c * PITCH + SLOT / 2;
        const y = sy0 + r * PITCH + SLOT / 2;
        this.invWidgets.push(this.makeSlot(x, y, {
          get: () => this.inventory.slots[i],
          set: (s) => { this.inventory.slots[i] = s; this.inventory.version++; },
        }));
      }
    }

    // 快捷格 9
    const hy = sy0 + 3 * PITCH + 12 + SLOT / 2;
    for (let c = 0; c < 9; c++) {
      const x = left + 24 + c * PITCH + SLOT / 2;
      this.invWidgets.push(this.makeSlot(x, hy, {
        get: () => this.inventory.slots[c],
        set: (s) => { this.inventory.slots[c] = s; this.inventory.version++; },
      }));
    }

    // 手持物品跟随光标（置于最顶层）
    this.cursorIcon = this.reg(this.scene.add.image(0, 0, 'block_1').setDisplaySize(36, 36).setVisible(false));
    this.cursorCount = this.reg(makeText(this.scene, 0, 0, '', 14, '#ffffff').setOrigin(1, 1));
    this.cursorIcon.setDepth(500);
    this.cursorCount.setDepth(501);
  }

  private makeSlot(x: number, y: number, acc: { get: () => Slot | null; set: (s: Slot | null) => void }): SlotWidget {
    // 说明：格子不再用 Phaser 内建交互（多相机场景下命中不稳定），
    // 统一由 attachInput 的手动命中检测处理点击/拖拽/分堆。
    const bg = this.reg(this.scene.add.image(x, y, 'slot_bg').setDepth(210));
    const icon = this.reg(this.scene.add.image(x, y, 'block_1').setDisplaySize(34, 34).setDepth(211).setVisible(false));
    const count = this.reg(makeText(this.scene, x + SLOT / 2 - 6, y + SLOT / 2 - 6, '', 14).setDepth(212).setOrigin(1, 1));
    return { bg, icon, count, get: acc.get, set: acc.set };
  }

  /** 手动命中检测：返回指针位置命中的格子（uiCam 空间 = 屏幕空间） */
  private hitTestUI(x: number, y: number): SlotWidget | null {
    const inBox = (w: SlotWidget) => Math.abs(x - w.bg.x) <= SLOT / 2 && Math.abs(y - w.bg.y) <= SLOT / 2;
    for (const w of this.craftWidgets) if (inBox(w)) return w;
    if (this.resultWidget && inBox(this.resultWidget)) return this.resultWidget;
    for (const w of this.invWidgets) if (inBox(w)) return w;
    return null;
  }

  /** 场景级输入：面板打开时接管点击/拖拽分发（位置来自 pointer，恒定可靠） */
  private onPanelPointerDown(p: Phaser.Input.Pointer): void {
    if (!this.isOpen) return;
    const w = this.hitTestUI(p.x, p.y);
    if (!w) return;
    if (p.rightButtonDown()) {
      // 结果格只读：右键直接忽略（否则可凭空拿到产物且不扣材料）
      if (w === this.resultWidget) return;
      this.rightClickSlot(w);
    } else if (w === this.resultWidget) {
      this.doCraft();
    } else {
      this.clickSlot(w);
      // 拾取/放置后，从当前格重新开始分发判定
      this.lastDistWidget = this.cursorSlot ? w : null;
    }
    this.notifyHeld();
    this.refresh();
    this.onDirty();
  }

  private onPanelPointerMove(p: Phaser.Input.Pointer): void {
    if (!this.isOpen || !this.cursorSlot) return;
    if (!p.leftButtonDown()) return; // 仅按住左键拖拽时分发
    const w = this.hitTestUI(p.x, p.y);
    if (!w || w === this.resultWidget) return;
    if (w === this.lastDistWidget) return; // 同一格不重复分发
    this.lastDistWidget = w;
    this.distributeOne(w);
    this.notifyHeld();
    this.refresh();
    this.onDirty();
  }

  private onPanelPointerUp(_p: Phaser.Input.Pointer): void {
    // 松开：手中剩余保留，可继续点击放置或再次拖拽分发
    this.lastDistWidget = null;
    this.notifyHeld();
  }

  /** 拖拽分发：向目标格移动 1 个物品（空格新建 / 同类未满并入） */
  private distributeOne(w: SlotWidget): void {
    const cur = this.cursorSlot;
    if (!cur) return;
    const s = w.get();
    if (!s) {
      w.set({ id: cur.id, count: 1 });
      cur.count -= 1;
    } else if (s.id === cur.id && s.count < 64) {
      s.count += 1;
      cur.count -= 1;
    } else {
      return; // 满堆或异类：跳过
    }
    if (cur.count <= 0) this.cursorSlot = null;
    this.inventory.version++;
  }

  /** 手持物品变化时通知（物品名显示用） */
  private notifyHeld(): void {
    const id = this.cursorSlot?.id ?? -1;
    if (id !== this.lastHeldId) {
      this.lastHeldId = id;
      this.onHeldChange(id >= 0 ? itemName(id) : null);
    }
  }

  /** 绑定场景级输入（构造时调用一次，随场景销毁自动清理） */
  private attachInput(): void {
    this.scene.input.on('pointerdown', this.onPanelPointerDown, this);
    this.scene.input.on('pointermove', this.onPanelPointerMove, this);
    this.scene.input.on('pointerup', this.onPanelPointerUp, this);
  }

  /**
   * 右键分堆交互：
   * - 手上为空：从格中拿起一半（向上取整；仅 1 个时整拿）
   * - 手上有物：向格中放下 1 个（空格或同类未满堆叠）
   */
  private rightClickSlot(w: SlotWidget): void {
    const cur = this.cursorSlot;
    const s = w.get();
    if (!cur) {
      if (!s) return;
      if (s.count > 1) {
        const take = Math.ceil(s.count / 2);
        s.count -= take;
        this.cursorSlot = { id: s.id, count: take };
      } else {
        this.cursorSlot = s;
        w.set(null);
      }
    } else {
      if (!s) {
        w.set({ id: cur.id, count: 1 });
        cur.count -= 1;
      } else if (s.id === cur.id && s.count < 64) {
        s.count += 1;
        cur.count -= 1;
      }
      if (cur.count <= 0) this.cursorSlot = null;
    }
    this.inventory.version++; // 通知 HUD/面板重绘
    this.refresh();
    this.onDirty();
  }

  // ---------- 交互 ----------

  private clickSlot(w: SlotWidget): void {
    const now = Date.now();
    const s = w.get();

    if (!this.cursorSlot) {
      // 拾取；若为快速重复点击同一格（双击）→ 拾取并收集背包所有同类
      if (s) {
        const isQuick = now - this.lastClickTime < 350 && this.lastClickId === s.id;
        this.cursorSlot = s;
        w.set(null);
        this.lastClickTime = now;
        this.lastClickId = s.id;
        if (isQuick) this.gatherAll(s.id);
      } else {
        this.lastClickTime = 0;
        this.lastClickId = -1;
      }
    } else {
      // 放置整堆（记录放置的物品 id，供"快速再点拿起并收集"判定）
      this.placeOnly(w);
      this.lastClickTime = now;
      this.lastClickId = w.get()?.id ?? -1;
    }
    this.refresh();
    this.onDirty();
  }

  /** 双击收集：把背包 36 格与合成格中所有同类物品合并到手持堆上（上限 64） */
  private gatherAll(id: number): void {
    const cur = this.cursorSlot;
    if (!cur || cur.id !== id) return;
    // 背包 36 格
    for (let i = 0; i < 36 && cur.count < 64; i++) {
      const s = this.inventory.slots[i];
      if (s && s.id === id) {
        const take = Math.min(64 - cur.count, s.count);
        cur.count += take;
        s.count -= take;
        if (s.count <= 0) this.inventory.slots[i] = null;
      }
    }
    // 合成格（2×2 / 3×3）也一并收集
    for (let i = 0; i < this.craftGrid.length && cur.count < 64; i++) {
      const s = this.craftGrid[i];
      if (s && s.id === id) {
        const take = Math.min(64 - cur.count, s.count);
        cur.count += take;
        s.count -= take;
        if (s.count <= 0) this.craftGrid[i] = null;
      }
    }
    this.inventory.version++;
  }

  /** 手上有物时的放置逻辑：空格整放 / 同类合并 / 异类交换 */
  private placeOnly(w: SlotWidget): void {
    const cur = this.cursorSlot;
    if (!cur) return;
    const s = w.get();
    if (!s) {
      w.set(cur);
      this.cursorSlot = null;
    } else if (s.id === cur.id) {
      const total = s.count + cur.count;
      const put = Math.min(64, total);
      const back = total - put;
      w.set({ id: s.id, count: put });
      this.cursorSlot = back > 0 ? { id: cur.id, count: back } : null;
    } else {
      w.set(cur);
      this.cursorSlot = s;
    }
    this.inventory.version++;
  }

  private matchedRecipe(): MatchResult | null {
    return matchRecipe(this.craftGrid, this.craftSize);
  }

  private matchedResult(): Slot | null {
    const m = this.matchedRecipe();
    return m ? { ...m.recipe.out } : null;
  }

  /** 背包对某物品的剩余容量（空格按整堆计） */
  private capacityFor(id: number): number {
    let cap = 0;
    for (const s of this.inventory.slots) {
      if (!s) cap += MAX_STACK;
      else if (s.id === id) cap += MAX_STACK - s.count;
    }
    return cap;
  }

  private doCraft(): void {
    const m = this.matchedRecipe();
    if (!m) return;
    // 背包放不下就不扣材料，避免产物丢失
    if (this.capacityFor(m.recipe.out.id) < m.recipe.out.count) {
      this.onNotify('背包已满');
      return;
    }
    consumeGrid(this.craftGrid, m.cells);
    const left = this.inventory.addItem(m.recipe.out.id, m.recipe.out.count);
    if (left > 0) {
      // 保险分支：容量已校验，正常不会走到这里
      if (!this.cursorSlot) this.cursorSlot = { id: m.recipe.out.id, count: left };
      else if (this.cursorSlot.id === m.recipe.out.id) this.cursorSlot.count += left;
      this.onNotify('背包已满，产物已放到手上');
    }
    this.onCrafted(itemName(m.recipe.out.id));
    this.refresh();
    this.onDirty();
  }

  /** 全量重绘（打开、点击、背包变化后调用） */
  refresh(): void {
    const draw = (w: SlotWidget) => {
      const s = w.get();
      if (s) {
        w.icon.setTexture(iconKey(s.id)).setVisible(true);
        w.count.setText(s.count > 1 ? String(s.count) : '');
      } else {
        w.icon.setVisible(false);
        w.count.setText('');
      }
    };
    for (const w of this.invWidgets) draw(w);
    for (const w of this.craftWidgets) draw(w);
    if (this.resultWidget) {
      draw(this.resultWidget);
      const has = this.matchedResult() !== null;
      this.resultDim?.setVisible(!has);
      this.resultWidget.icon.setAlpha(has ? 1 : 0.4);
    }
    // 手持
    if (this.cursorSlot && this.cursorIcon && this.cursorCount) {
      this.cursorIcon.setTexture(iconKey(this.cursorSlot.id)).setVisible(true);
      this.cursorCount.setText(this.cursorSlot.count > 1 ? String(this.cursorSlot.count) : '');
    } else if (this.cursorIcon && this.cursorCount) {
      this.cursorIcon.setVisible(false);
      this.cursorCount.setText('');
    }
  }

  /** 每帧：手持物品跟随光标 */
  update(): void {
    if (!this.isOpen) return;
    const p = this.scene.input.activePointer;
    this.cursorIcon?.setPosition(p.x + 14, p.y + 14);
    this.cursorCount?.setPosition(p.x + 44, p.y + 42);
    // 背包外部变化（如继续挖掘被禁用时不会发生）同步
    if (this.inventory.version !== this.lastInvVersion) {
      this.lastInvVersion = this.inventory.version;
      this.refresh();
    }
  }

  private lastInvVersion = -1;

  /** 手持物品名（状态栏提示用） */
  get heldName(): string | null {
    return this.cursorSlot ? itemName(this.cursorSlot.id) : null;
  }
}
