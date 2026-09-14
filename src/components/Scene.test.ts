// @vitest-environment jsdom
import { createElement } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Scene } from './Scene';

const day = { id: 'day', file: 'day.webp', src: '/day.webp', luminance: .8 };
const night = { id: 'night', file: 'night.webp', src: '/night.webp', luminance: .2 };
let frames: Map<number, FrameRequestCallback>, sequence: number, time: number;
beforeEach(() => {
  frames = new Map(); sequence = 0; time = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => time);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++sequence, callback); return sequence; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  HTMLImageElement.prototype.decode = async () => {};
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function frame(at: number) { act(() => { time = at; const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback(at)); }); }
it('场景切换在完整时长内保持锁定，普通重绘不会提前结束', () => {
  const onBusy = vi.fn();
  const page = render(createElement(Scene, { asset: day, motion: true, onBusy }));
  page.rerender(createElement(Scene, { asset: night, motion: true, onBusy }));
  expect(onBusy).toHaveBeenLastCalledWith(true);
  frame(300);
  const opacity = page.container.querySelectorAll('img')[1]!.style.opacity;
  page.rerender(createElement(Scene, { asset: night, motion: true, onBusy }));
  expect(page.container.querySelectorAll('img')[1]!.style.opacity).toBe(opacity);
  expect(page.container.querySelector('.scene')?.getAttribute('data-transitioning')).toBe('true');
  frame(1899); expect(onBusy).toHaveBeenLastCalledWith(true);
  frame(1900); expect(onBusy).toHaveBeenLastCalledWith(false);
  expect(page.container.querySelector('.scene')?.getAttribute('data-transitioning')).toBe('false');
});
it('入梦水幕期间已经完成的背景不因重新开启动效而再播一次', () => {
  const onBusy = vi.fn();
  const page = render(createElement(Scene, { asset: day, motion: true, onBusy }));
  page.rerender(createElement(Scene, { asset: night, motion: false, onBusy }));
  onBusy.mockClear();
  page.rerender(createElement(Scene, { asset: night, motion: true, onBusy }));
  expect(onBusy).not.toHaveBeenCalledWith(true);
  expect(page.container.querySelector('.scene')?.getAttribute('data-transitioning')).toBe('false');
});
