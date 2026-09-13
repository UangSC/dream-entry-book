import { describe, expect, it } from 'vitest';
import {
  LuminanceCache,
  planTransition,
  TransitionController,
  type TransitionPlan,
} from './transition';

/** 梦斋亮调与梦内夜景的实测代表值：粉白约 0.82，夜蓝约 0.22。 */
const BRIGHT = 0.82;
const DARK = 0.22;

describe('转场手法选择', () => {
  it('梦斋到夜景走涟漪，且是最缓一档', () => {
    const p = planTransition(BRIGHT, DARK);
    expect(p.mode).toBe('ripple');
    expect(p.durationMs).toBeGreaterThanOrEqual(1000);
    expect(p.outBlurPx).toBeGreaterThan(0);
    expect(p.inBlurPx).toBeGreaterThan(0);
  });

  it('夜景回梦斋也走涟漪，但比入梦快一档', () => {
    const into = planTransition(BRIGHT, DARK);
    const out = planTransition(DARK, BRIGHT);
    expect(out.mode).toBe('ripple');
    // 明转暗更慢：瞳孔适应暗处本来就慢
    expect(out.durationMs).toBeLessThan(into.durationMs);
  });

  it('亮度接近时只做普通淡入，不滥用涟漪', () => {
    const p = planTransition(0.5, 0.54);
    expect(p.mode).toBe('fade');
    expect(p.outBlurPx).toBe(0);
  });

  it('中等差异用模糊淡入', () => {
    const p = planTransition(0.5, 0.68);
    expect(p.mode).toBe('blurFade');
    expect(p.outBlurPx).toBeGreaterThan(0);
  });

  it('减少动态效果时直接切换，不留半透明中间态', () => {
    const p = planTransition(BRIGHT, DARK, { reducedMotion: true });
    expect(p.mode).toBe('cut');
    expect(p.durationMs).toBe(0);
  });

  it('玩家关掉动画时同样直接切换', () => {
    const p = planTransition(BRIGHT, DARK, { animationsOff: true });
    expect(p.mode).toBe('cut');
  });

  it('亮度未知时不猜方向，走默认淡入', () => {
    expect(planTransition(null, DARK).mode).toBe('fade');
    expect(planTransition(BRIGHT, null).mode).toBe('fade');
    expect(planTransition(null, null).reason).toContain('亮度未测');
  });
});

describe('转场推进', () => {
  const ripple: TransitionPlan = planTransition(BRIGHT, DARK);

  it('起点旧画面完全可见，终点新画面完全可见', () => {
    const c = new TransitionController();
    c.start(ripple, 1000);
    const first = c.frame(1000);
    expect(first.inOpacity).toBeLessThan(0.2);
    const last = c.frame(1000 + ripple.durationMs);
    expect(last.inOpacity).toBe(1);
    expect(last.outOpacity).toBe(0);
    expect(last.done).toBe(true);
  });

  it('涟漪半径单调扩大，末尾超过 1 以盖满四角', () => {
    const c = new TransitionController();
    c.start(ripple, 0);
    let prev = -1;
    for (let i = 0; i <= 10; i += 1) {
      const f = c.frame((ripple.durationMs * i) / 10);
      expect(f.rippleRadius).toBeGreaterThanOrEqual(prev);
      prev = f.rippleRadius;
    }
    expect(prev).toBeGreaterThan(1);
  });

  it('模糊在中途最重、两端归零，像失焦再对上焦', () => {
    const c = new TransitionController();
    c.start(ripple, 0);
    const mid = c.frame(ripple.durationMs * 0.5);
    const end = c.frame(ripple.durationMs);
    expect(mid.outBlurPx).toBeGreaterThan(1);
    expect(end.outBlurPx).toBe(0);
    expect(end.inBlurPx).toBe(0);
  });

  it('中途不露底色：两层不透明度之和始终不小于 1', () => {
    const c = new TransitionController();
    c.start(ripple, 0);
    for (let i = 0; i <= 20; i += 1) {
      const f = c.frame((ripple.durationMs * i) / 20);
      expect(f.outOpacity + f.inOpacity).toBeGreaterThanOrEqual(0.999);
    }
  });

  it('跳过后立刻落地', () => {
    const c = new TransitionController();
    c.start(ripple, 0);
    c.skip();
    const f = c.frame(10);
    expect(f.done).toBe(true);
    expect(f.inOpacity).toBe(1);
    expect(c.running).toBe(false);
  });

  it('cut 一帧就结束', () => {
    const c = new TransitionController();
    c.start(planTransition(BRIGHT, DARK, { reducedMotion: true }), 0);
    expect(c.frame(0).done).toBe(true);
  });

  it('超出时长后保持终态，不回绕', () => {
    const c = new TransitionController();
    c.start(ripple, 0);
    const f = c.frame(ripple.durationMs * 3);
    expect(f.done).toBe(true);
    expect(f.inOpacity).toBe(1);
  });
});

describe('亮度缓存', () => {
  it('同一 URL 只测一次', async () => {
    let calls = 0;
    const cache = new LuminanceCache(async (u) => {
      calls += 1;
      void u;
      return 0.7;
    });
    expect(await cache.get('a.webp')).toBeCloseTo(0.7);
    expect(await cache.get('a.webp')).toBeCloseTo(0.7);
    expect(calls).toBe(1);
  });

  it('测量失败记 null 并不再重试', async () => {
    let calls = 0;
    const cache = new LuminanceCache(async () => {
      calls += 1;
      throw new Error('decode failed');
    });
    expect(await cache.get('bad.webp')).toBeNull();
    expect(await cache.get('bad.webp')).toBeNull();
    expect(calls).toBe(1);
  });

  it('越界值被夹到 0..1', async () => {
    const cache = new LuminanceCache(async () => 1.8);
    expect(await cache.get('x')).toBe(1);
  });

  it('NaN 视为测不出', async () => {
    const cache = new LuminanceCache(async () => Number.NaN);
    expect(await cache.get('x')).toBeNull();
  });
});
