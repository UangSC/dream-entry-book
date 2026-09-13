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
