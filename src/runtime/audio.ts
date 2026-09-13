/**
 * 音频引擎。
 *
 * 五条来自契约的硬规则：
 * 1. 首次明确手势之后才出声；被浏览器拒绝就静音继续，并提供"开启声音"。
 * 2. 换曲用交叉淡入淡出，不硬切；800–1200ms。
 * 3. 循环渐进出：靠尾部与头部重叠淡接，不靠 MP3 的 loop 属性。
 * 4. 页面隐藏或弹层阻塞时暂停；回来时错过的短音效不补播。
 * 5. 加载失败如实报告，不静默假装在播。
 *
 * 为什么不用 <audio loop>：MP3 头部有编码器延迟（本项目实测 23.021ms），
 * loop 属性会把这段静音也一起循环，接头必然可听。所以解码成 AudioBuffer，
 * 按测得的循环区间自己排程。
 */

export interface LoopSpec {
  mode: 'fadeLoop' | 'seamless' | 'once';
  startSeconds: number;
  endSeconds: number;
  overlapMs: number;
  verified?: boolean;
}

export interface AudioAsset {
  id: string;
  kind: 'music' | 'sfx';
  file: string;
  durationSeconds: number;
  loop?: LoopSpec;
}

export interface AudioManifest {
  manifestVersion: number;
  status: 'draft' | 'ready';
  assetSetId?: string;
  assets: readonly (AudioAsset & Record<string, unknown>)[];
}

export interface Volumes {
  master: number;
  bgm: number;
  sfx: number;
}

/** 文档给的初始音量。 */
export const DEFAULT_VOLUMES: Volumes = { master: 0.5, bgm: 0.35, sfx: 0.45 };

const CROSSFADE_MS = 1000;
const MAX_SFX = 3;
/** 等功率交叉淡化，避免两个不同片段在接缝处明显塌下去。 */
const fadeCurve = (incoming: boolean, gain = 1): Float32Array => Float32Array.from({ length: 65 }, (_, i) => gain * (incoming ? Math.sin(i / 64 * Math.PI / 2) : Math.cos(i / 64 * Math.PI / 2)));

export type AudioStatus =
  | { state: 'idle' }
  | { state: 'ready' }
  /** 自动播放被拒：静音继续，界面提供"开启声音"。 */
  | { state: 'blocked' }
  | { state: 'unsupported'; reason: string };

export interface LoadFailure {
  id: string;
  message: string;
}

/**
 * 一路 BGM。两路轮换实现交叉淡接，
 * 循环也复用同一机制：尾巴还在淡出时头部已经淡入。
 */
interface MusicVoice {
  trackId: string;
  startAt: number;
  source: AudioBufferSourceNode;
  gain: GainNode;
  /** 该 voice 在 AudioContext 时间轴上对应曲子起点的时刻，用于律动对齐。 */
  originTime: number;
  stopAt: number;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private bgmGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;

  private buffers = new Map<string, AudioBuffer>();
  private loading = new Map<string, Promise<void>>();
  private assets = new Map<string, AudioAsset>();
  private baseUrl: string;

  private voices: MusicVoice[] = [];
  private activeSfx: AudioBufferSourceNode[] = [];

  private currentTrack: string | null = null;
  /** 暂停时记住的曲目，resume 时恢复。 */
  private suspendedTrack: string | null = null;
  private loopTimer: number | null = null;
  private pendingLoop: { trackId: string; buf: AudioBuffer; overlapSec: number; nextAt: number } | null = null;

  private volumes: Volumes = { ...DEFAULT_VOLUMES };
  private status: AudioStatus = { state: 'idle' };
  private failures: LoadFailure[] = [];
  private unlocked = false;

  /**
   * 解码后是否已剥掉编码器延迟。用解码时长与容器时长比对推断，
   * 而不是假设某个浏览器行为——律动对齐要用到这个偏移。
   */
  private decodeOffsetSeconds = 0;

  constructor(baseUrl = '/audio/', private resolveAsset?: (asset: AudioAsset) => string) {
    this.baseUrl = baseUrl;
  }

  getStatus(): AudioStatus {
    return this.status;
  }

  getFailures(): readonly LoadFailure[] {
    return this.failures;
  }

  getVolumes(): Volumes {
    return { ...this.volumes };
  }

  /** 当前曲目在自身时间轴上的播放位置，供律动系统对齐节拍。 */
  positionOf(trackId: string): number | null {
    if (this.ctx === null || this.ctx.state !== 'running' || this.currentTrack !== trackId) return null;
    const voice = [...this.voices].reverse().find(v => v.trackId === trackId && v.startAt <= this.ctx!.currentTime && v.stopAt > this.ctx!.currentTime);
    if (voice === undefined) return null;
    const asset = this.assets.get(trackId);
    const loop = asset?.loop;
    const elapsed = this.ctx.currentTime - voice.originTime;
    if (elapsed < 0) return null;
    if (loop === undefined || loop.mode === 'once') return elapsed;
    return Math.min(loop.endSeconds, elapsed);
  }

  /** AudioContext 的当前时间。律动系统据此换算，不用 performance.now。 */
  now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  get decodeOffset(): number {
    return this.decodeOffsetSeconds;
  }

  // ---------- 装载 ----------

  async loadManifest(manifest: AudioManifest): Promise<void> {
    for (const a of manifest.assets) {
      if (a.kind === 'music' || a.kind === 'sfx') {
        this.assets.set(a.id, {
          id: a.id,
          kind: a.kind,
          file: a.file,
          durationSeconds: a.durationSeconds,
          ...(a.loop !== undefined ? { loop: a.loop } : {}),
        });
      }
    }
  }

  /**
   * 必须由真实用户手势调用。AudioContext 在手势外创建会直接处于 suspended，
   * 之后即使 resume 也可能被拒。
   */
  async unlock(): Promise<AudioStatus> {
    if (this.unlocked && this.ctx?.state === 'running') return this.status;
    try {
      const Ctor: typeof AudioContext | undefined =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctor === undefined) {
        this.status = { state: 'unsupported', reason: '浏览器不支持 Web Audio' };
        return this.status;
      }
      if (this.ctx === null) {
        this.ctx = new Ctor();
        this.masterGain = this.ctx.createGain();
        this.bgmGain = this.ctx.createGain();
        this.sfxGain = this.ctx.createGain();
        this.bgmGain.connect(this.masterGain);
        this.sfxGain.connect(this.masterGain);
        this.masterGain.connect(this.ctx.destination);
        this.applyVolumes();
      }
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      this.unlocked = this.ctx.state === 'running';
      this.status = this.unlocked ? { state: 'ready' } : { state: 'blocked' };
      return this.status;
    } catch (e) {
      // 被拒不是错误路径的终点：静音继续，让玩家自己开
      this.status = { state: 'blocked' };
      void e;
      return this.status;
    }
  }

  /** 预取并解码。失败如实记录，不抛——缺一条音效不该拦住阅读。 */
  async preload(ids: readonly string[]): Promise<readonly LoadFailure[]> {
    const out: LoadFailure[] = [];
    await Promise.all(
      ids.map(async (id) => {
        if (this.buffers.has(id)) return;
        if (this.loading.has(id)) { await this.loading.get(id); if (!this.buffers.has(id)) out.push({ id, message: `${id} 加载失败` }); return; }
        const asset = this.assets.get(id);
        if (asset === undefined) {
          out.push({ id, message: `清单里没有音频资产 ${id}` });
          return;
        }
        const task = (async () => { try {
          const res = await fetch(this.resolveAsset?.(asset) ?? this.baseUrl + asset.file, { signal: AbortSignal.timeout(10000) });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const raw = await res.arrayBuffer();
          const ctx = this.ctx;
          if (ctx === null) throw new Error('AudioContext 尚未建立');
          const buf = await ctx.decodeAudioData(raw);
          this.buffers.set(id, buf);
          // 用首个音乐资产推断解码是否剥掉了编码器延迟
          if (asset.kind === 'music' && this.decodeOffsetSeconds === 0) {
            const diff = buf.duration - asset.durationSeconds;
            // 差值接近 0 说明延迟已被剥掉；接近正的编码器延迟说明保留了
            this.decodeOffsetSeconds = Math.abs(diff) < 0.005 ? 0 : Math.max(0, diff);
          }
        } catch (e) {
          out.push({ id, message: `${asset.file} 加载失败：${String(e)}` });
        } finally { this.loading.delete(id); } })();
        this.loading.set(id, task);
        await task;
      }),
    );
    this.failures = [...this.failures, ...out];
    return out;
  }

  // ---------- 音量 ----------

  setVolumes(v: Partial<Volumes>): void {
    for (const key of ['master', 'bgm', 'sfx'] as const) if (v[key] !== undefined && Number.isFinite(v[key])) this.volumes[key] = Math.max(0, Math.min(1, v[key]!));
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (this.ctx === null) return;
    const t = this.ctx.currentTime;
    // 用短斜坡而不是直接赋值，避免可听的咔声
    this.masterGain?.gain.setTargetAtTime(this.volumes.master, t, 0.01);
    this.bgmGain?.gain.setTargetAtTime(this.volumes.bgm, t, 0.01);
    this.sfxGain?.gain.setTargetAtTime(this.volumes.sfx, t, 0.01);
  }

  // ---------- BGM ----------

  /**
   * 换曲：旧曲淡出、新曲淡入，同时进行。
   * 已在播同一曲时什么都不做——重复 play 不该让曲子从头开始。
   */
  playMusic(trackId: string, fadeMs = CROSSFADE_MS): void {
    if (this.ctx === null || this.bgmGain === null) return;
    if (this.currentTrack === trackId && this.voices.length > 0) return;
    const buf = this.buffers.get(trackId);
    if (buf === undefined) {
      this.failures = [...this.failures, { id: trackId, message: `${trackId} 未解码，无法播放` }];
      return;
    }
    this.fadeOutAll(fadeMs);
    this.currentTrack = trackId;
    this.suspendedTrack = trackId;
    this.startVoice(trackId, buf, fadeMs);
  }

  /** 真正静默：淡出到无声并停下，不是把音量拧到 0 继续跑。 */
  silence(fadeMs = CROSSFADE_MS): void {
    this.suspendedTrack = this.currentTrack ?? this.suspendedTrack;
    this.fadeOutAll(fadeMs);
    this.currentTrack = null;
    this.clearLoopTimer();
  }

  resumeMusic(fadeMs = CROSSFADE_MS): void {
    const track = this.suspendedTrack ?? this.currentTrack;
    if (track !== null) this.playMusic(track, fadeMs);
  }

  private startVoice(trackId: string, buf: AudioBuffer, fadeMs: number, atTime?: number): void {
    const ctx = this.ctx;
    const bgm = this.bgmGain;
    if (ctx === null || bgm === null) return;
    const asset = this.assets.get(trackId);
    const loop = asset?.loop;
    const start = atTime ?? ctx.currentTime;

    const gain = ctx.createGain();
    gain.connect(bgm);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(gain);

    // 淡入
    const fade = Math.max(0.001, Math.min(fadeMs / 1000, ((loop?.endSeconds ?? buf.duration) - (loop?.startSeconds ?? 0)) / 2));
    gain.gain.setValueAtTime(0, start);
    gain.gain.setValueCurveAtTime(fadeCurve(true), start, fade);

    const offset = Math.max(0, Math.min(loop?.startSeconds ?? 0, buf.duration - 0.05));
    const playUntil = Math.min(loop?.endSeconds ?? buf.duration, buf.duration);
    const span = Math.max(0.05, playUntil - offset);
    src.start(start, offset);

    const voice: MusicVoice = {
      trackId, startAt: start,
      source: src,
      gain,
      originTime: start - offset,
      stopAt: start + span,
    };
    this.voices.push(voice);
    src.onended = () => { src.disconnect(); gain.disconnect(); this.voices = this.voices.filter(v => v !== voice); };

    if (loop !== undefined && loop.mode !== 'once') {
      // 循环渐进出：在尾部提前 overlap 排下一段，两段交叠淡接
      const overlap = Math.min(span * 0.5, Math.max(0.05, loop.overlapMs / 1000));
      const nextAt = start + span - overlap;
      // 当前段的尾巴淡出
      gain.gain.setValueAtTime(1, Math.max(start + fade, nextAt));
      gain.gain.setValueCurveAtTime(fadeCurve(false), nextAt, overlap);
      src.stop(nextAt + overlap + 0.05);
      this.scheduleLoop(trackId, buf, overlap, nextAt);
    } else {
      gain.gain.setValueAtTime(1, Math.max(start + fade, start + span - fade));
      gain.gain.setValueCurveAtTime(fadeCurve(false), start + span - fade, fade);
      src.stop(start + span + 0.05);
    }
  }

  /**
   * 用 setTimeout 排下一段而不是一次排完整条时间轴：
   * 换曲、暂停、静默都要能取消，排太远会漏掉取消。
   */
  private scheduleLoop(trackId: string, buf: AudioBuffer, overlapSec: number, nextAt: number): void {
    const ctx = this.ctx;
    if (ctx === null) return;
    this.clearLoopTimer();
    this.pendingLoop = { trackId, buf, overlapSec, nextAt };
    const waitMs = Math.max(0, (nextAt - ctx.currentTime) * 1000 - 120);
    this.loopTimer = window.setTimeout(() => {
      this.loopTimer = null;
      // 期间已换曲或静默：不再续接
      if (this.currentTrack !== trackId) return;
      this.pruneVoices();
      this.startVoice(trackId, buf, overlapSec * 1000, Math.max(nextAt, ctx.currentTime));
    }, waitMs);
  }

  private clearLoopTimer(): void {
    if (this.loopTimer !== null) {
      clearTimeout(this.loopTimer);
      this.loopTimer = null;
    }
  }

  private fadeOutAll(fadeMs: number): void {
    this.pendingLoop = null;
    const ctx = this.ctx;
    if (ctx === null) return;
    const t = ctx.currentTime;
    const fade = Math.max(0.001, fadeMs / 1000);
    for (const v of this.voices) {
      if (typeof v.gain.gain.cancelAndHoldAtTime === 'function') v.gain.gain.cancelAndHoldAtTime(t);
      else { const value = v.gain.gain.value; v.gain.gain.cancelScheduledValues(t); v.gain.gain.setValueAtTime(value, t); }
      v.gain.gain.setValueCurveAtTime(fadeCurve(false, v.gain.gain.value), t, fade);
      try {
        v.source.stop(t + fade + 0.05);
      } catch {
        // 已经停过的 source 再 stop 会抛，忽略
      }
    }
    this.voices = [];
    this.clearLoopTimer();
  }

  private pruneVoices(): void {
    const ctx = this.ctx;
    if (ctx === null) return;
    this.voices = this.voices.filter((v) => v.stopAt > ctx.currentTime - 0.5);
    // 最多两路：超出就掐掉最旧的
    while (this.voices.length > 2) {
      const old = this.voices.shift();
      try {
        old?.source.stop();
      } catch {
        /* 同上 */
      }
    }
  }

  // ---------- 音效 ----------

  playSfx(id: string): void {
    const ctx = this.ctx;
    const out = this.sfxGain;
    if (ctx === null || out === null) return;
    const buf = this.buffers.get(id);
    if (buf === undefined) return; // 缺音效不报错也不补播，静静跳过
    this.activeSfx = this.activeSfx.filter((s) => (s as unknown as { _done?: boolean })._done !== true);
    if (this.activeSfx.length >= MAX_SFX) return; // 同时最多 3 条
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(out);
    src.onended = () => {
      (src as unknown as { _done?: boolean })._done = true;
      src.disconnect();
    };
    src.start();
    this.activeSfx.push(src);
  }

  // ---------- 页面可见性 ----------

  /** 页面隐藏或弹层阻塞时暂停。错过的短音效不补播。 */
  async pause(): Promise<void> {
    if (this.ctx === null) return;
    this.suspendedTrack = this.currentTrack;
    this.clearLoopTimer();
    for (const sfx of this.activeSfx) try { sfx.stop(); } catch { /* 已结束 */ }
    this.activeSfx = [];
    try {
      await this.ctx.suspend();
    } catch {
      /* 某些浏览器在已 suspended 时抛，忽略 */
    }
  }

  async resume(): Promise<void> {
    if (this.ctx === null) return;
    try {
      await this.ctx.resume();
      this.status = this.ctx.state === 'running' ? { state: 'ready' } : { state: 'blocked' };
      const pending = this.pendingLoop;
      if (pending && pending.trackId === this.currentTrack) this.scheduleLoop(pending.trackId, pending.buf, pending.overlapSec, pending.nextAt);
      // suspend 期间排好的 loop timer 已被清掉，这里重新接上
      if (this.currentTrack !== null && this.voices.length === 0) {
        const track = this.currentTrack;
        this.currentTrack = null;
        this.playMusic(track, 400);
      }
    } catch {
      this.status = { state: 'blocked' };
    }
  }

  async dispose(): Promise<void> {
    this.fadeOutAll(0);
    this.clearLoopTimer();
    try {
      await this.ctx?.close();
    } catch {
      /* 关闭失败无从处理 */
    }
    this.ctx = null;
  }
}
