import { afterEach, describe, expect, it, vi } from 'vitest';
import { autoReadDuration, scheduleAutoRead } from './autoReader';

afterEach(() => vi.useRealTimers());
describe('自动阅读的停顿与翻句', () => {
  it('语速和字数共同决定停留时间，极短和极长文本有边界', () => {
    const text = '山风吹过小土庙，神像笑着，你也偷偷笑了一下。';
    expect(autoReadDuration(text, 'slow')).toBeGreaterThan(autoReadDuration(text, 'normal'));
    expect(autoReadDuration(text, 'normal')).toBeGreaterThan(autoReadDuration(text, 'fast'));
    expect(autoReadDuration('嗯。', 'fast')).toBe(2400);
    expect(autoReadDuration('字'.repeat(1000), 'slow')).toBe(20000);
  });
  it('圆环走满才翻一句，暂停不会补翻，恢复接续剩余时间', () => {
    vi.useFakeTimers();
    const next = vi.fn(), progress = vi.fn();
    const stop = scheduleAutoRead(4000, 0, progress, next);
    vi.advanceTimersByTime(1600);
    expect(progress).toHaveBeenLastCalledWith(.4);
    const elapsed = stop();
    vi.advanceTimersByTime(15000); expect(next).not.toHaveBeenCalled();
    const resume = scheduleAutoRead(4000, elapsed, progress, next);
    vi.advanceTimersByTime(2360); expect(next).not.toHaveBeenCalled();
    vi.advanceTimersByTime(40); expect(next).toHaveBeenCalledTimes(1); expect(progress).toHaveBeenLastCalledWith(1);
    vi.advanceTimersByTime(10000); expect(next).toHaveBeenCalledTimes(1);
    resume(); expect(vi.getTimerCount()).toBe(0);
  });
  it('手动翻页取消旧时钟，新句获得完整停留时间', () => {
    vi.useFakeTimers(); const old = vi.fn(), next = vi.fn();
    const stop = scheduleAutoRead(2400, 0, vi.fn(), old);
    vi.advanceTimersByTime(2360); stop();
    const stopNext = scheduleAutoRead(4000, 0, vi.fn(), next);
    vi.advanceTimersByTime(2400); expect(old).not.toHaveBeenCalled(); expect(next).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1600); expect(next).toHaveBeenCalledTimes(1); stopNext();
  });
});
