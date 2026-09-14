import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioEngine } from './audio';

class FakeParam {
  value = 1;
  curves: { values: Float32Array; at: number; duration: number }[] = [];
  setValueAtTime(value: number) { this.value = value; }
  linearRampToValueAtTime(value: number) { this.value = value; }
  setTargetAtTime(value: number) { this.value = value; }
  setValueCurveAtTime(values: Float32Array, at: number, duration: number) { this.curves.push({ values, at, duration }); }
  cancelScheduledValues() {}
  cancelAndHoldAtTime() {}
}
class FakeGain { gain = new FakeParam(); connect() {} disconnect() {} }
class FakeSource {
  buffer: unknown;
  onended: (() => void) | null = null;
  startAt = 0; stoppedAt: number | null = null;
  connect() {} disconnect() {}
  start(at = 0) { this.startAt = at; }
  stop(at = 0) { this.stoppedAt = at; }
}
class FakeContext {
  static latest: FakeContext;
  currentTime = 0; state = 'running'; destination = {};
  sources: FakeSource[] = []; gains: FakeGain[] = [];
  constructor() { FakeContext.latest = this; }
  createGain() { const gain = new FakeGain(); this.gains.push(gain); return gain; }
  createBufferSource() { const source = new FakeSource(); this.sources.push(source); return source; }
  async decodeAudioData() { return { duration: 10 }; }
  async resume() { this.state = 'running'; }
  async suspend() { this.state = 'suspended'; }
  async close() { this.state = 'closed'; }
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('window', { AudioContext: FakeContext, setTimeout: globalThis.setTimeout });
  vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([1, 2, 3]))));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
async function engine() {
  const audio = new AudioEngine();
  await audio.loadManifest({ manifestVersion: 1, status: 'draft', assets: [{ id: 'BGM_TEST', kind: 'music', file: 'test.mp3', durationSeconds: 10, loop: { mode: 'fadeLoop', startSeconds: 0, endSeconds: 10, overlapMs: 2000 } }] });
  await audio.unlock(); await audio.preload(['BGM_TEST']); audio.playMusic('BGM_TEST');
  return audio;
}
describe('声音时间轴', () => {
  it('循环预排的未来声部不抢走正在播放的节拍位置', async () => {
    const audio = await engine(), ctx = FakeContext.latest;
    ctx.currentTime = 7.89; await vi.advanceTimersByTimeAsync(7890);
    expect(ctx.sources).toHaveLength(2); expect(ctx.sources[1]!.startAt).toBe(8);
    expect(audio.positionOf('BGM_TEST')).toBeCloseTo(7.89);
    ctx.currentTime = 8.1; expect(audio.positionOf('BGM_TEST')).toBeCloseTo(.1);
    await audio.dispose();
  });
  it('切到后台再返回会恢复循环排程', async () => {
    const audio = await engine(), ctx = FakeContext.latest;
    ctx.currentTime = 2; await vi.advanceTimersByTimeAsync(2000);
    await audio.pause(); expect(audio.positionOf('BGM_TEST')).toBeNull();
    await audio.resume(); ctx.currentTime = 7.9; await vi.advanceTimersByTimeAsync(5900);
    expect(ctx.sources).toHaveLength(2); await audio.dispose();
  });
  it('静默可恢复，重复播放不会另起同一首曲子', async () => {
    const audio = await engine(), ctx = FakeContext.latest;
    audio.playMusic('BGM_TEST'); expect(ctx.sources).toHaveLength(1);
    audio.silence(); expect(audio.positionOf('BGM_TEST')).toBeNull();
    audio.resumeMusic(); expect(ctx.sources).toHaveLength(2); await audio.dispose();
  });
  it('循环中点使用等功率淡化，而不是线性音量相加', async () => {
    const audio = await engine();
    const voiceGain = FakeContext.latest.gains[3]!;
    const incoming = voiceGain.gain.curves[0]!.values[32]!;
    const outgoing = voiceGain.gain.curves[1]!.values[32]!;
    expect(incoming ** 2 + outgoing ** 2).toBeCloseTo(1);
    await audio.dispose();
  });
});

async function vocalEngine(preload = true) {
  const durations: Record<string, number> = { 'seek.mp3': 199.273651, 'farewell.mp3': 143.2439, 'acid.mp3': 52.825397, 'care.mp3': 10 };
  vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(new Float64Array([durations[url.split('/').at(-1)!]!]).buffer)));
  const audio = new AudioEngine();
  await audio.loadManifest({ manifestVersion: 1, status: 'ready', assets: [
    ...[['BGM_SEEK', 'seek.mp3'], ['BGM_FAREWELL', 'farewell.mp3'], ['BGM_ACID', 'acid.mp3']].map(([id, file]) => ({
      id: id!, file: file!, kind: 'music' as const, durationSeconds: durations[file!]!,
      loop: { mode: 'once' as const, startSeconds: 0, endSeconds: durations[file!]!, overlapMs: 0 },
      vocal: { minPlaySeconds: 90, gapSeconds: 2, successor: 'BGM_CARE' },
    })),
    { id: 'BGM_CARE', file: 'care.mp3', kind: 'music', durationSeconds: 10, loop: { mode: 'fadeLoop', startSeconds: 0, endSeconds: 10, overlapMs: 500 } },
  ] });
  await audio.unlock();
  vi.spyOn(FakeContext.latest, 'decodeAudioData').mockImplementation(async (...args: unknown[]) => ({ duration: new Float64Array(args[0] as ArrayBuffer)[0]! }));
  if (preload) await audio.preload(['BGM_SEEK', 'BGM_FAREWELL', 'BGM_ACID', 'BGM_CARE']);
  return audio;
}
async function tick(seconds: number) {
  const ctx = FakeContext.latest;
  if (ctx.state === 'running') ctx.currentTime += seconds;
  await vi.advanceTimersByTimeAsync(seconds * 1000);
}
const playedDurations = () => FakeContext.latest.sources.map(source => (source.buffer as { duration: number }).duration);

describe('人声完整一遍保护', () => {
  it('异步解码乱序仍按原文 cue 起播，较快完成的下一首不能覆盖人声', async () => {
    const audio = await vocalEngine(false), fetchAsset = fetch;
    let release!: () => void;
    const waiting = new Promise<void>(resolve => { release = resolve; });
    vi.stubGlobal('fetch', vi.fn(async (url: string) => { if (url.endsWith('seek.mp3')) await waiting; return fetchAsset(url); }));
    const first = audio.requestMusic('BGM_SEEK'), next = audio.requestMusic('BGM_CARE');
    await next; expect(playedDurations()).toEqual([]);
    release(); await first; expect(playedDurations()).toEqual([199.273651]);
    await tick(201.274); expect(playedDurations()).toEqual([199.273651, 10]);
    await audio.dispose();
  });
  it('加载失败后可以重试，关闭后迟到的解码不会复活播放器', async () => {
    const audio = await vocalEngine(false), fetchAsset = fetch;
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })));
    expect(await audio.requestMusic('BGM_SEEK')).not.toHaveLength(0);
    vi.stubGlobal('fetch', fetchAsset);
    expect(await audio.requestMusic('BGM_SEEK')).toHaveLength(0);
    expect(playedDurations()).toEqual([199.273651]);
    await audio.dispose();
    const silent = await vocalEngine(false), original = fetch;
    let release!: () => void;
    const waiting = new Promise<void>(resolve => { release = resolve; });
    vi.stubGlobal('fetch', vi.fn(async (url: string) => { await waiting; return original(url); }));
    const pending = silent.requestMusic('BGM_SEEK'); await silent.dispose(); release(); await pending;
    expect(playedDurations()).toEqual([]);
  });
  it('超过 90 秒的长曲按实际长度播放，结束两秒后才执行挂起的切曲', async () => {
    const audio = await vocalEngine(); audio.playMusic('BGM_SEEK');
    const first = FakeContext.latest.sources[0]!;
    expect(first.stoppedAt).toBeCloseTo(199.273651 + .05);
    await tick(1); audio.playMusic('BGM_CARE');
    await tick(89); expect(playedDurations()).toEqual([199.273651]);
    await tick(109.274); expect(playedDurations()).toEqual([199.273651]);
    await tick(1.9); expect(playedDurations()).toEqual([199.273651]);
    await tick(.101); expect(playedDurations()).toEqual([199.273651, 10]);
    await audio.dispose();
  });
  it('短曲不循环补足时长，90 秒保护及留白期间不提前切歌', async () => {
    const audio = await vocalEngine(); audio.playMusic('BGM_ACID'); audio.playMusic('BGM_CARE');
    await tick(53); expect(playedDurations()).toEqual([52.825397]);
    expect(FakeContext.latest.sources[0]!.stoppedAt).toBeCloseTo(52.825397 + .05);
    await tick(38.9); expect(playedDurations()).toEqual([52.825397]);
    await tick(.1); expect(playedDurations()).toEqual([52.825397, 10]);
    await audio.dispose();
  });
  it('快进与结局页的后续请求保留每首人声，不用最后一个请求覆盖送别曲', async () => {
    const audio = await vocalEngine();
    audio.playMusic('BGM_SEEK'); audio.playMusic('BGM_FAREWELL'); audio.playMusic('BGM_ACID'); audio.playMusic('BGM_CARE');
    await tick(201.274); expect(playedDurations()).toEqual([199.273651, 143.2439]);
    await tick(145.244); expect(playedDurations()).toEqual([199.273651, 143.2439, 52.825397]);
    await tick(92); expect(playedDurations()).toEqual([199.273651, 143.2439, 52.825397, 10]);
    await audio.dispose();
  });
  it('同曲跨节点不重启，后台停留不计入保护时间，返回后沿原进度播放', async () => {
    const audio = await vocalEngine(); audio.playMusic('BGM_SEEK');
    await tick(20); audio.playMusic('BGM_SEEK'); audio.playMusic('BGM_CARE');
    await audio.pause(); await tick(300); expect(playedDurations()).toEqual([199.273651]);
    await audio.resume(); expect(audio.positionOf('BGM_SEEK')).toBeCloseTo(20);
    await tick(181.2); expect(playedDurations()).toEqual([199.273651]);
    await tick(.074); expect(playedDurations()).toEqual([199.273651, 10]);
    await audio.dispose();
  });
  it('没有新 cue 时自动转器乐，重复同名 cue 不重播已完成的人声', async () => {
    const audio = await vocalEngine(); audio.playMusic('BGM_ACID');
    await tick(92); expect(playedDurations()).toEqual([52.825397, 10]);
    audio.playMusic('BGM_ACID'); expect(playedDurations()).toEqual([52.825397, 10]);
    await audio.dispose();
  });
  it('静默指令等待保护；关闭播放器后定时器不能复活音乐', async () => {
    const audio = await vocalEngine(); audio.playMusic('BGM_ACID'); audio.silence();
    await tick(10); expect(audio.positionOf('BGM_ACID')).toBeCloseTo(10);
    await tick(82); expect(audio.positionOf('BGM_ACID')).toBeNull(); expect(playedDurations()).toEqual([52.825397]);
    await audio.dispose(); await tick(500); expect(playedDurations()).toEqual([52.825397]);
  });
});
