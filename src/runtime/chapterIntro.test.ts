import { afterEach, describe, expect, it, vi } from 'vitest';
import { scheduleChapterIntro } from './chapterIntro';

afterEach(() => vi.useRealTimers());
describe('章节标题和品牌共用的演出时钟', () => {
  it('标题在 3–6 秒灰化，品牌在 4.5–6.5 秒随后退场', () => {
    vi.useFakeTimers();
    const onPhase = vi.fn(), onBrand = vi.fn();
    scheduleChapterIntro(onPhase, onBrand);
    vi.advanceTimersByTime(2999); expect(onPhase).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1); expect(onPhase.mock.calls).toEqual([['ash']]);
    vi.advanceTimersByTime(1499); expect(onBrand).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1); expect(onBrand.mock.calls).toEqual([['ash']]);
    vi.advanceTimersByTime(1499); expect(onPhase).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1); expect(onPhase.mock.calls).toEqual([['ash'], ['hidden']]);
    expect(onBrand).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(499); expect(onBrand).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1); expect(onBrand.mock.calls).toEqual([['ash'], ['hidden']]);
  });
  it('换章取消旧时钟，不让前章提前隐藏新章标题', () => {
    vi.useFakeTimers();
    const oldChapter = vi.fn(), nextChapter = vi.fn(), oldBrand = vi.fn();
    const cancel = scheduleChapterIntro(oldChapter, oldBrand);
    vi.advanceTimersByTime(2000); cancel();
    scheduleChapterIntro(nextChapter);
    vi.advanceTimersByTime(1000); expect(oldChapter).not.toHaveBeenCalled(); expect(nextChapter).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2000); expect(nextChapter).toHaveBeenLastCalledWith('ash');
    vi.advanceTimersByTime(3500); expect(oldChapter).not.toHaveBeenCalled(); expect(oldBrand).not.toHaveBeenCalled(); expect(nextChapter).toHaveBeenLastCalledWith('hidden');
    expect(vi.getTimerCount()).toBe(0);
  });
});
