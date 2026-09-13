import { describe, expect, it } from 'vitest';
import { evasiveOffset } from './choiceMotion';

describe('犹豫选项的可达性', () => {
  it('远离鼠标但始终限制在横向 36、纵向 16 像素内', () => {
    for (const [dx, dy] of [[100, 0], [-100, 0], [0, 40], [0, -40], [20, 20]]) {
      for (const value of [0, .5, .999999]) {
        const { x, y } = evasiveOffset(dx!, dy!, () => value);
        expect(Math.abs(x)).toBeLessThanOrEqual(36);
        expect(Math.abs(y)).toBeLessThanOrEqual(16);
        expect(x * dx! + y * dy!).toBeLessThan(0);
      }
    }
  });
});
