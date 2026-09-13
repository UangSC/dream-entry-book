/**
 * 心跳律动驱动。
 *
 * 开场那首 BGM 的鼓点要让整幅画面跟着呼吸，所以脉冲时刻取自
 * 离线测得的节拍图，而不是运行时做频谱分析——运行时分析既费电，
 * 又会因为解码延迟和缓冲抖动而漂移。
 *
 * 四条设计约束：
 * 1. 声音关着、被浏览器拒了、或干脆没解码成功时，画面照样要脉动。
 *    视觉不能依赖听觉：静音玩家看到的画面不该是死的。
 * 2. 对齐用 AudioContext 的时间轴，不用 performance.now——
 *    两者会缓慢相对漂移，几十秒后鼓点就和画面错开了。
 * 3. `prefers-reduced-motion` 与玩家的显式开关并行：
 *    系统信号和用户选择都能单独关掉脉动，互不覆盖。
 * 4. 掉帧时降档而不是硬撑：宁可脉动幅度小一点，也不要卡顿。
 */

export interface BeatMap {
  bpm: number;
  beats: readonly number[];
  downbeats: readonly number[];
  encoderDelaySeconds?: number;
  loop?: { startSeconds: number; endSeconds: number; overlapMs: number };
  verifiedByHuman?: boolean;
}

/** 幅度档位。用户要求"动态效果尽量明显些"，所以默认档比先前保守值高。 */
export type PulseTier = 'off' | 'subtle' | 'normal' | 'strong';

export const TIER_AMPLITUDE: Record<PulseTier, { scale: number; brightness: number }> = {
  off: { scale: 0, brightness: 0 },
  subtle: { scale: 0.004, brightness: 0.03 },
  normal: { scale: 0.012, brightness: 0.09 },
  strong: { scale: 0.022, brightness: 0.16 },
};

export interface PulseState {
  /** 0..1，一次心跳内的包络。用于驱动亮度与缩放。 */
  envelope: number;
  /** 本次脉冲是否为强拍。强拍可以让幅度更大一档。 */
  onDownbeat: boolean;
  /** 已经过的脉冲计数，便于做交替效果。 */
  count: number;
}

export interface PulseOptions {
  /** 玩家开关。关掉后 envelope 恒为 0。 */
  enabled?: boolean;
  tier?: PulseTier;
  /** 系统级减少动态效果。与 enabled 并行，任一为真即停。 */
  reducedMotion?: boolean;
  /** 心跳包络的衰减时长，秒。 */
  decaySeconds?: number;
  /** 双跳心跳：主脉冲后一小段再来一记弱的，像真实心音。 */
  doubleBeat?: boolean;
}

/**
 * 心跳包络：快速起、指数落，落到很低时截断。
 * 不用正弦，正弦看起来像脉动的灯而不是心跳。
 */
const envelopeAt = (sinceBeat: number, decay: number): number => {
  if (sinceBeat < 0) return 0;
  const attack = Math.min(0.045, decay * 0.25);
  if (sinceBeat < attack) return sinceBeat / attack;
  const t = (sinceBeat - attack) / Math.max(0.001, decay);
  const v = Math.exp(-3.2 * t);
  return v < 0.01 ? 0 : v;
};

export class PulseDriver {
  private map: BeatMap | null = null;
  private opts: Required<PulseOptions>;
  /** 自由运行时的起点，用于无音频时按 BPM 推算。 */
  private freeStart: number | null = null;
  private lastCount = 0;

  constructor(options: PulseOptions = {}) {
    this.opts = {
      enabled: options.enabled ?? true,
      tier: options.tier ?? 'normal',
      reducedMotion: options.reducedMotion ?? false,
      decaySeconds: options.decaySeconds ?? 0.42,
      doubleBeat: options.doubleBeat ?? true,
    };
  }

  setBeatMap(map: BeatMap | null): void {
    this.map = map;
    this.freeStart = null;
    this.lastCount = 0;
  }

  setOptions(patch: PulseOptions): void {
    this.opts = { ...this.opts, ...patch };
  }

  get active(): boolean {
    return this.opts.enabled && !this.opts.reducedMotion && this.opts.tier !== 'off';
  }

  get amplitude(): { scale: number; brightness: number } {
    if (!this.active) return TIER_AMPLITUDE.off;
    return TIER_AMPLITUDE[this.opts.tier];
  }

  /**
   * 取当前状态。
   *
   * @param audioPosition 曲子自身时间轴上的位置，秒。没有音频时传 null。
   * @param wallClock     秒。无音频时用它自由运行；有音频时仅用于双跳插值。
   */
  sample(audioPosition: number | null, wallClock: number): PulseState {
    if (!this.active) return { envelope: 0, onDownbeat: false, count: this.lastCount };

    const map = this.map;
    // 没有节拍图也要脉动：按 72 BPM 兜底，仍然比不动好
    const bpm = map?.bpm ?? 72;
    const period = 60 / Math.max(20, bpm);

    if (audioPosition === null || map === null) {
      // 自由运行：声音关着或没解码成功，画面照旧呼吸
      if (this.freeStart === null) this.freeStart = wallClock;
      const t = wallClock - this.freeStart;
      const idx = Math.floor(t / period);
      const since = t - idx * period;
      const onDown = idx % 4 === 0;
      this.lastCount = idx;
      return {
        envelope: this.combine(since, period, onDown),
        onDownbeat: onDown,
        count: idx,
      };
    }

    // 有节拍图：找最近一个已过去的拍
    const beats = map.beats.length > 0 ? map.beats : null;
    if (beats === null) {
      const idx = Math.floor(audioPosition / period);
      const since = audioPosition - idx * period;
      const onDown = idx % 4 === 0;
      this.lastCount = idx;
      return { envelope: this.combine(since, period, onDown), onDownbeat: onDown, count: idx };
    }

    let lo = 0;
    let hi = beats.length - 1;
    let found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const v = beats[mid] as number;
      if (v <= audioPosition) {
        found = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    if (found < 0) return { envelope: 0, onDownbeat: false, count: this.lastCount };

    const beatTime = beats[found] as number;
    const since = audioPosition - beatTime;
    const onDown = map.downbeats.includes(beatTime);
    this.lastCount = found;
    return { envelope: this.combine(since, period, onDown), onDownbeat: onDown, count: found };
  }

  /** 主脉冲 + 可选的第二记弱跳，合成"咚—哒"的心音感。 */
  private combine(since: number, period: number, onDown: boolean): number {
    const decay = this.opts.decaySeconds;
    const main = envelopeAt(since, decay);
    if (!this.opts.doubleBeat) return main;
    // 第二跳落在约 30% 周期处，幅度约四成
    const gap = period * 0.3;
    const second = envelopeAt(since - gap, decay * 0.6) * 0.4;
    const sum = Math.min(1, main + second);
    return onDown ? sum : sum * 0.72;
  }

  /** 给渲染层的现成数值：直接乘到 transform 与 filter 上。 */
  visual(state: PulseState): { scale: number; brightness: number } {
    const amp = this.amplitude;
    const boost = state.onDownbeat ? 1 : 0.7;
    return {
      scale: 1 + amp.scale * state.envelope * boost,
      brightness: 1 + amp.brightness * state.envelope * boost,
    };
  }
}

/** 读取系统的减少动态效果偏好。SSR 或不支持时返回 false。 */
export const prefersReducedMotion = (): boolean => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};
