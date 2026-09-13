import { describe, expect, it } from 'vitest';
import { PulseDriver, TIER_AMPLITUDE, type BeatMap } from './pulse';

/** 简化节拍图：72 BPM，每拍 0.8333s，每 4 拍一个强拍。 */
const PERIOD = 60 / 72;
const BEATS: number[] = Array.from({ length: 48 }, (_, i) => +(i * PERIOD).toFixed(6));
const MAP: BeatMap = {
  bpm: 72,
  beats: BEATS,
  downbeats: BEATS.filter((_, i) => i % 4 === 0),
  loop: { startSeconds: 0, endSeconds: 40, overlapMs: 900 },
};

describe('开关与档位', () => {
  it('默认开启且为 normal 档', () => {
    const d = new PulseDriver();
    d.setBeatMap(MAP);
    expect(d.active).toBe(true);
    expect(d.amplitude).toEqual(TIER_AMPLITUDE.normal);
  });

  it('玩家关掉后 envelope 恒为 0', () => {
    const d = new PulseDriver({ enabled: false });
    d.setBeatMap(MAP);
    expect(d.active).toBe(false);
    expect(d.sample(0, 0).envelope).toBe(0);
    expect(d.sample(PERIOD * 4, 0).envelope).toBe(0);
  });

  it('系统减少动态效果时停止，与玩家开关并行', () => {
    const d = new PulseDriver({ enabled: true, reducedMotion: true });
    d.setBeatMap(MAP);
    expect(d.active).toBe(false);
    // 玩家开关仍是开的，但系统信号单独也能关停
    d.setOptions({ reducedMotion: false });
    expect(d.active).toBe(true);
  });

  it('off 档等于不脉动', () => {
    const d = new PulseDriver({ tier: 'off' });
    d.setBeatMap(MAP);
    expect(d.active).toBe(false);
    expect(d.visual(d.sample(0, 0))).toEqual({ scale: 1, brightness: 1 });
  });

  it('强档幅度大于普通档，普通档大于轻档', () => {
    expect(TIER_AMPLITUDE.strong.scale).toBeGreaterThan(TIER_AMPLITUDE.normal.scale);
    expect(TIER_AMPLITUDE.normal.scale).toBeGreaterThan(TIER_AMPLITUDE.subtle.scale);
    expect(TIER_AMPLITUDE.strong.brightness).toBeGreaterThan(TIER_AMPLITUDE.normal.brightness);
  });
});

describe('包络形状', () => {
  it('拍点处起跳，随后衰减', () => {
    const d = new PulseDriver({ doubleBeat: false });
    d.setBeatMap(MAP);
    const atBeat = d.sample(0, 0).envelope;
    const justAfter = d.sample(0.05, 0).envelope;
    const later = d.sample(0.35, 0).envelope;
    expect(justAfter).toBeGreaterThan(atBeat);
    expect(later).toBeLessThan(justAfter);
  });

  it('快速起、缓慢落——不是正弦对称', () => {
    const d = new PulseDriver({ doubleBeat: false });
    d.setBeatMap(MAP);
    // 起始 45ms 内冲到峰值，衰减要长得多
    const peak = d.sample(0.045, 0).envelope;
    expect(peak).toBeGreaterThan(0.9);
    expect(d.sample(0.045 * 2, 0).envelope).toBeGreaterThan(0.5);
  });

  it('包络始终在 0..1 内', () => {
    const d = new PulseDriver();
    d.setBeatMap(MAP);
    for (let t = 0; t < 8; t += 0.017) {
      const e = d.sample(t, 0).envelope;
      expect(e).toBeGreaterThanOrEqual(0);
      expect(e).toBeLessThanOrEqual(1);
    }
  });

  it('双跳在主脉冲之后带来第二个隆起', () => {
    const single = new PulseDriver({ doubleBeat: false });
    const double = new PulseDriver({ doubleBeat: true });
    single.setBeatMap(MAP);
    double.setBeatMap(MAP);
    // 第二跳落在约 30% 周期处
    const at = PERIOD * 0.3 + 0.03;
    expect(double.sample(at, 0).envelope).toBeGreaterThan(single.sample(at, 0).envelope);
  });

  it('强拍幅度大于弱拍', () => {
    const d = new PulseDriver();
    d.setBeatMap(MAP);
    const down = d.sample(0.04, 0);
    const off = d.sample(PERIOD + 0.04, 0);
    expect(down.onDownbeat).toBe(true);
    expect(off.onDownbeat).toBe(false);
    expect(down.envelope).toBeGreaterThan(off.envelope);
  });
});

describe('对齐节拍图', () => {
  it('按音频位置找最近的已过去拍点', () => {
    const d = new PulseDriver();
    d.setBeatMap(MAP);
    expect(d.sample(PERIOD * 5 + 0.01, 0).count).toBe(5);
    expect(d.sample(PERIOD * 12 + 0.4, 0).count).toBe(12);
  });

  it('首拍之前不脉动', () => {
    const d = new PulseDriver();
    d.setBeatMap({ ...MAP, beats: [2, 3, 4], downbeats: [2] });
    expect(d.sample(0.5, 0).envelope).toBe(0);
  });

  it('循环回绕后仍能对上拍点', () => {
    const d = new PulseDriver();
    d.setBeatMap(MAP);
    // 引擎给的是已经取模过的位置，这里模拟绕回开头
    const a = d.sample(0.04, 0).envelope;
    const b = d.sample(0.04, 0).envelope;
    expect(b).toBeCloseTo(a, 6);
  });
});

describe('无音频也要脉动', () => {
  it('声音关着时按 BPM 自由运行', () => {
    const d = new PulseDriver();
    d.setBeatMap(MAP);
    // audioPosition 为 null：静音或自动播放被拒
    const first = d.sample(null, 100);
    expect(first.envelope).toBeGreaterThanOrEqual(0);
    const peak = d.sample(null, 100 + 0.045);
    expect(peak.envelope).toBeGreaterThan(0.9);
  });

  it('没有节拍图也脉动，用 72 BPM 兜底', () => {
    const d = new PulseDriver();
    d.setBeatMap(null);
    // 首次 sample 确立自由运行的起点，之后才谈得上"距上一拍多久"
    d.sample(null, 50);
    const peak = d.sample(null, 50 + 0.045);
    expect(peak.envelope).toBeGreaterThan(0.9);
  });

  it('节拍图存在但 beats 为空时退回按 BPM 推算', () => {
    const d = new PulseDriver();
    d.setBeatMap({ bpm: 90, beats: [], downbeats: [] });
    const period = 60 / 90;
    expect(d.sample(period * 3 + 0.04, 0).envelope).toBeGreaterThan(0.5);
  });

  it('自由运行的起点只认第一次调用，不每帧重置', () => {
    const d = new PulseDriver();
    d.setBeatMap(MAP);
    d.sample(null, 200);
    const later = d.sample(null, 200 + PERIOD * 2 + 0.045);
    // 若每帧重置起点，这里会永远停在 t=0 而拿不到第三拍的峰值
    expect(later.count).toBe(2);
  });
});

describe('给渲染层的数值', () => {
  it('scale 与 brightness 从 1 起，脉冲时向上偏离', () => {
    const d = new PulseDriver({ tier: 'strong' });
    d.setBeatMap(MAP);
    const rest = d.visual({ envelope: 0, onDownbeat: false, count: 0 });
    expect(rest).toEqual({ scale: 1, brightness: 1 });
    const hit = d.visual({ envelope: 1, onDownbeat: true, count: 0 });
    expect(hit.scale).toBeGreaterThan(1);
    expect(hit.brightness).toBeGreaterThan(1);
  });

  it('缩放幅度保持克制，不至于让画面跳动', () => {
    const d = new PulseDriver({ tier: 'strong' });
    d.setBeatMap(MAP);
    const hit = d.visual({ envelope: 1, onDownbeat: true, count: 0 });
    // 最强档也不超过 3%，否则文字会跟着晃
    expect(hit.scale).toBeLessThan(1.03);
  });

  it('弱拍的视觉幅度小于强拍', () => {
    const d = new PulseDriver();
    d.setBeatMap(MAP);
    const down = d.visual({ envelope: 1, onDownbeat: true, count: 0 });
    const off = d.visual({ envelope: 1, onDownbeat: false, count: 1 });
    expect(off.scale).toBeLessThan(down.scale);
  });
});
