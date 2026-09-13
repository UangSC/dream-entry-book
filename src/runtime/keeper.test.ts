import { afterEach, describe, expect, it, vi } from 'vitest';
import { KEEPER_ACTIONS, KEEPER_QUOTES, randomKeeperDelay, startKeeperSchedule } from './keeper';

afterEach(() => vi.useRealTimers());
describe('梦斋角色的随机演出', () => {
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
