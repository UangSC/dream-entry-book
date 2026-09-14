// @vitest-environment jsdom
import { createElement } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { StoryText } from './StoryText';

afterEach(() => { cleanup(); vi.useRealTimers(); });
it('高潮渐显按常规的 80% 速度，字间隔与完成时间一致；仍允许立即显示', () => {
  vi.useFakeTimers();
  const complete = vi.fn();
  const beat = { id: 'climax', kind: 'narration' as const, speaker: 'narrator', text: '甲乙丙', anim: 'typewriter' as const, textSpeedScale: 0.8 };
  const props = { beat, speed: 40, motion: true, instant: false, onComplete: complete };
  const view = render(createElement(StoryText, props));
  const letters = view.container.querySelectorAll<HTMLElement>('.letter');
  expect(letters[1]!.style.getPropertyValue('--letter-delay')).toBe('50ms');
  expect(letters[2]!.style.getPropertyValue('--letter-delay')).toBe('100ms');
  act(() => vi.advanceTimersByTime(419)); expect(complete).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(1)); expect(complete).toHaveBeenCalledOnce();
  complete.mockClear();
  view.rerender(createElement(StoryText, { ...props, instant: true }));
  expect(complete).toHaveBeenCalledOnce(); expect(view.container.textContent).toBe('甲乙丙');
});
