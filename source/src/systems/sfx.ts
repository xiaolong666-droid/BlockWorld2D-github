/**
 * sfx.ts —— Web Audio 合成音效（零外部素材）
 * 8-bit 风格：方波/锯齿/噪声短音，带音量包络。
 * AudioContext 在首次用户交互时解锁。
 */

type SfxName =
  | 'dig' | 'break' | 'place' | 'jump' | 'hurt'
  | 'eat' | 'click' | 'collect' | 'craft' | 'death';

class SfxEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private activeVoices = 0;
  /** 同时发声上限，防止爆音 */
  private maxVoices = 8;
  muted = false;

  /** 首次用户交互时调用以解锁音频 */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.3;
      this.master.connect(this.ctx.destination);
    } catch {
      this.ctx = null;
    }
  }

  private canPlay(): boolean {
    return !this.muted && this.ctx !== null && this.activeVoices < this.maxVoices;
  }

  /** 创建声源前占用一个并发名额（按实际声源计数，超限丢弃） */
  private acquireVoice(): boolean {
    if (!this.canPlay()) return false;
    this.activeVoices++;
    return true;
  }

  private endVoice(): void {
    this.activeVoices = Math.max(0, this.activeVoices - 1);
  }

  /** 切换静音，返回切换后的静音状态 */
  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.3;
    return this.muted;
  }

  /** 单音调：freq → slideTo 滑音，duration 秒 */
  private tone(
    freq: number, duration: number,
    type: OscillatorType = 'square', vol = 0.5,
    slideTo?: number, delay = 0,
  ): void {
    if (!this.ctx || !this.master) return;
    if (!this.acquireVoice()) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + duration);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.connect(gain).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
    osc.onended = () => this.endVoice();
  }

  /** 噪声爆发：滤波频率 + 时长 */
  private noise(duration: number, filterFreq: number, vol = 0.4, delay = 0): void {
    if (!this.ctx || !this.master) return;
    if (!this.acquireVoice()) return;
    const t0 = this.ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * duration));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = filterFreq;
    filter.Q.value = 0.8;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t0);
    src.onended = () => this.endVoice();
  }

  /** 播放指定音效 */
  play(name: SfxName): void {
    if (!this.ctx || this.muted) return;
    switch (name) {
      case 'dig':      // 挖掘中：短噪声嗑
        this.noise(0.05, 900, 0.18);
        break;
      case 'break':    // 破坏：咔（噪声 + 下滑音）
        this.noise(0.09, 600, 0.35);
        this.tone(300, 0.08, 'square', 0.2, 120);
        break;
      case 'place':    // 放置：嗒
        this.tone(220, 0.05, 'square', 0.3, 180);
        this.noise(0.03, 1400, 0.15);
        break;
      case 'jump':     // 跳跃：噗（上滑）
        this.tone(150, 0.12, 'square', 0.22, 300);
        break;
      case 'hurt':     // 受伤：低音
        this.tone(140, 0.2, 'sawtooth', 0.4, 70);
        break;
      case 'eat':      // 进食：三声咀嚼
        this.noise(0.06, 500, 0.3, 0);
        this.noise(0.06, 420, 0.3, 0.12);
        this.noise(0.06, 460, 0.3, 0.24);
        break;
      case 'click':    // 按钮
        this.tone(880, 0.04, 'sine', 0.25, 660);
        break;
      case 'collect':  // 收集提示：上行双音
        this.tone(620, 0.06, 'sine', 0.2);
        this.tone(930, 0.07, 'sine', 0.2, undefined, 0.06);
        break;
      case 'craft':    // 合成完成
        this.tone(520, 0.06, 'square', 0.2);
        this.tone(700, 0.08, 'square', 0.2, undefined, 0.07);
        break;
      case 'death':    // 死亡：下行长音
        this.tone(300, 0.7, 'sawtooth', 0.35, 60);
        break;
    }
  }
}

/** 全局单例 */
export const sfx = new SfxEngine();
