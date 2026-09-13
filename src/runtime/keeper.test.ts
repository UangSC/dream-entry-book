import { afterEach, describe, expect, it, vi } from 'vitest';
import { KEEPER_ACTIONS, KEEPER_QUOTES, randomKeeperDelay, randomZhihuQuote, startKeeperSchedule } from './keeper';

afterEach(() => vi.useRealTimers());
describe('梦斋角色的随机演出', () => {
  it('每次入首页首条知乎引导最晚 6 秒出现，关闭动画仍会说话，后续回归普通随机池', () => {
    vi.useFakeTimers();
    for (const value of [0, .5, .999999]) {
      const action = vi.fn(), quote = vi.fn();
      const stop = startKeeperSchedule({ action, quote, veil: vi.fn() }, { action: 0, quote: 0 }, () => value, { motion: false, intro: true });
      vi.advanceTimersByTime(6000);
      expect(quote).toHaveBeenCalledTimes(1);
      expect(KEEPER_QUOTES[quote.mock.calls[0]![0]]!.kind).toBe('zhihu');
      expect(action).not.toHaveBeenCalled();
      stop();
    }
    const quote = vi.fn();
    const stop = startKeeperSchedule({ action: vi.fn(), quote, veil: vi.fn() }, { action: 0, quote: randomZhihuQuote(() => 0) }, () => 0, { motion: false });
    vi.advanceTimersByTime(5000);
    expect(quote).toHaveBeenLastCalledWith(0);
    stop();
  });
  it('正常话语池里每条句子等概率，暂停会取消尚未送达的首页引导', () => {
    vi.useFakeTimers();
    const seen: number[] = [];
    for (let i = 0; i < KEEPER_QUOTES.length - 1; i++) {
      const stop = startKeeperSchedule({ action: vi.fn(), quote: index => seen.push(index), veil: vi.fn() }, { action: 0, quote: 0 }, () => (i + .5) / (KEEPER_QUOTES.length - 1), { motion: false });
      vi.advanceTimersByTime(randomKeeperDelay(() => (i + .5) / (KEEPER_QUOTES.length - 1))); stop();
    }
    expect(new Set(seen).size).toBe(KEEPER_QUOTES.length - 1);
    const quote = vi.fn();
    const stop = startKeeperSchedule({ action: vi.fn(), quote, veil: vi.fn() }, { action: 0, quote: 0 }, () => 0, { motion: false, intro: true });
    vi.advanceTimersByTime(2000); stop(); vi.advanceTimersByTime(10000);
    expect(quote).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
    const resume = startKeeperSchedule({ action: vi.fn(), quote, veil: vi.fn() }, { action: 0, quote: 0 }, () => 0, { motion: false, intro: true, introDelayMs: -1000 });
    vi.advanceTimersByTime(1);
    expect(KEEPER_QUOTES[quote.mock.calls[0]![0]]!.kind).toBe('zhihu');
    resume();
  });
  it('间隔限制在 5–30 秒，守梦短句不超过 20 字', () => {
    expect(randomKeeperDelay(() => 0)).toBe(5000);
    expect(randomKeeperDelay(() => .999999)).toBe(30000);
    for (const quote of KEEPER_QUOTES) {
      expect(Array.from(quote.text).length).toBeLessThanOrEqual(20);
    }
  });
  it('先由烟幕包裹，再更换动作；两条时钟不会紧接重复同一句或同一动作', () => {
    vi.useFakeTimers();
    const action = vi.fn(), quote = vi.fn(), veil = vi.fn();
    const stop = startKeeperSchedule({ action, quote, veil }, { action: 0, quote: 0 }, () => 0);
    vi.advanceTimersByTime(3200);
    expect(veil).toHaveBeenLastCalledWith(true);
    expect(action).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1800);
    expect(action).toHaveBeenLastCalledWith(1);
    expect(quote).toHaveBeenLastCalledWith(1);
    vi.advanceTimersByTime(1800);
    expect(veil).toHaveBeenLastCalledWith(false);
    vi.advanceTimersByTime(3200);
    expect(action.mock.calls.map(([index]) => index)).toEqual([1, 0]);
    expect(quote.mock.calls.map(([index]) => index)).toEqual([1, 0]);
    stop();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('关闭或离开时取消尚未完成的烟幕换图和台词任务', () => {
    vi.useFakeTimers();
    const action = vi.fn(), quote = vi.fn(), veil = vi.fn();
    const stop = startKeeperSchedule({ action, quote, veil }, { action: 0, quote: 0 }, () => 0);
    vi.advanceTimersByTime(3200);
    stop();
    vi.advanceTimersByTime(60000);
    expect(action).not.toHaveBeenCalled();
    expect(quote).not.toHaveBeenCalled();
    expect(veil).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('动作与话语使用各自的随机间隔', () => {
    vi.useFakeTimers();
    const action = vi.fn(), quote = vi.fn();
    const values = [0, .999999];
    const stop = startKeeperSchedule({ action, quote, veil: vi.fn() }, { action: KEEPER_ACTIONS.length - 1, quote: 3 }, () => values.shift() ?? .5);
    vi.advanceTimersByTime(5000);
    expect(action).toHaveBeenCalledTimes(1);
    expect(quote).not.toHaveBeenCalled();
    vi.advanceTimersByTime(24999);
    expect(quote).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(quote).toHaveBeenCalledTimes(1);
    expect(quote).not.toHaveBeenCalledWith(3);
    stop();
  });
});
