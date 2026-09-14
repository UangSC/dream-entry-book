import { describe, expect, it } from 'vitest';
import { dialoguePresentation, displayBeat } from './dialogue';
import type { GameData } from './library';
import type { Beat } from '../game/schema';

const data = { pkg: { characters: [{ id: 'little-demon', name: '小妖怪' }, { id: 'friend', name: '朋友' }, { id: 'stranger', name: '陌生人' }] },
  art: { hero: { id: 'hero', src: 'hero.webp' }, friend: { id: 'friend', src: 'friend.webp' } },
  presentation: { performances: { one: { portrait: 'hero', label: '小妖怪 · 出神' }, two: { portrait: 'friend', label: '朋友 · 平静' }, narration: { portrait: 'hero', label: '小妖怪 · 出神' } } },
} as unknown as GameData;
const narration: Beat = { id: 'narration', kind: 'narration', speaker: 'narrator', text: '天亮了。' };
const friend: Beat = { id: 'two', kind: 'dialogue', speaker: 'friend', text: '你好。' };
describe('旁白与心声展示', () => {
  it('文本旁白显示专用名称，不借用主角图', () => {
    expect(dialoguePresentation(data, narration, [], 'text')).toEqual({ name: '旁白', label: '旁白', portrait: undefined, softened: false });
  });
  it('渐变旁白保留刚才说话的角色并失焦，姓名不替换为旁白', () => {
    expect(dialoguePresentation(data, narration, [{ nodeId: 'room', beat: friend }], 'fade')).toMatchObject({ name: '朋友', softened: true, portrait: { id: 'friend' } });
  });
  it('没有角色图时显示该角色姓名，不借用他人立绘', () => {
    expect(dialoguePresentation(data, { ...friend, id: 'none', speaker: 'stranger' }, [], 'text')).toMatchObject({ name: '陌生人', portrait: undefined, softened: false });
  });
  it('主角心声之后的渐变旁白保留主角，不退回更早说话的人', () => {
    const thought: Beat = { id: 'one', kind: 'thought', speaker: 'narrator', text: '我的心声。' };
    expect(dialoguePresentation(data, narration, [{ nodeId: 'room', beat: friend }, { nodeId: 'room', beat: thought }], 'fade')).toMatchObject({ name: '小妖怪', softened: true, portrait: { id: 'hero' } });
  });
  it('心声即使标为 narrator 也用主人公立绘，括号不重复', () => {
    const thought: Beat = { ...narration, kind: 'thought' };
    for (const mode of ['fade', 'text'] as const) expect(dialoguePresentation(data, thought, [{ nodeId: 'room', beat: friend }], mode)).toMatchObject({ name: '小妖怪', portrait: { id: 'hero' }, softened: false });
    expect(displayBeat(thought).text).toBe('（天亮了。）');
    expect(displayBeat(displayBeat(thought)).text).toBe('（天亮了。）');
    expect(displayBeat(narration).text).toBe(narration.text);
  });
});
