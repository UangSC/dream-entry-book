import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { resolveAmbience, resolveAtmosphere } from './atmosphere';
import { Atmosphere } from '../components/Atmosphere';
import type { Presentation } from '../books/schema';
import type { ReadingLine } from '../game/replay';

const presentation: Presentation = {
  cover: 'BG_RAIN', subtitle: '', description: '', tags: [], contentNote: '', chapters: {},
  scenes: {
    BG_RAIN: { label: '雨夜', time: 'night', particles: 'rain', ambience: 'BGM_RAIN_AMBIENCE' },
    BG_SUN: { label: '晴天', time: 'day', particles: 'leaves' },
  },
  atmosphereCues: { 'rain-stopped': 'none', 'rain-started': 'rain' },
};
const line = (id: string, nodeId = 'rain-night', sceneShift?: string): ReadingLine => ({ nodeId, beat: {
  id, kind: 'narration', speaker: 'narrator', text: id, ...(sceneShift ? { sceneShift } : {}),
} });

describe('全屏天气与阅读记录', () => {
  it('雨天默认下雨，雨停后保持停雨；回退到此前一拍会恢复雨', () => {
    const history = [line('rain-started'), line('walk'), line('rain-stopped'), line('sunrise')];
    expect(resolveAtmosphere(presentation, 'BG_RAIN', [])).toBe('rain');
    expect(resolveAtmosphere(presentation, 'BG_RAIN', history)).toBe('none');
    expect(resolveAtmosphere(presentation, 'BG_RAIN', history.slice(0, 2))).toBe('rain');
    expect(resolveAtmosphere(presentation, 'BG_RAIN', JSON.parse(JSON.stringify(history)))).toBe('none');
  });
  it('换景或进入新节点会恢复该场景的天气，不沿用上一场的停雨状态', () => {
    expect(resolveAtmosphere(presentation, 'BG_RAIN', [line('rain-stopped'), line('new-rain', 'next-night')])).toBe('rain');
    expect(resolveAtmosphere(presentation, 'BG_SUN', [line('rain-started'), line('clearing', 'rain-night', 'BG_SUN')])).toBe('leaves');
    expect(resolveAtmosphere(presentation, 'BG_RAIN', [line('rain-stopped', 'rain-night', 'BG_RAIN')])).toBe('none');
  });
  it('只停环境雨声，视觉开关不会改变雨天判断，其他环境声保留', () => {
    expect(resolveAmbience(presentation, 'BG_RAIN', 'none')).toBeUndefined();
    expect(resolveAmbience(presentation, 'BG_RAIN', 'rain')).toBe('BGM_RAIN_AMBIENCE');
    const fireplace = { ...presentation, scenes: { ...presentation.scenes, BG_RAIN: { ...presentation.scenes.BG_RAIN!, ambience: 'BGM_FIRE_AMBIENCE' } } };
    expect(resolveAmbience(fireplace, 'BG_RAIN', 'none')).toBe('BGM_FIRE_AMBIENCE');
  });
  it('雨滴是装饰层，关闭效果或进入无粒子场景后移除', () => {
    const enabled = renderToStaticMarkup(createElement(Atmosphere, { scene: 'BG_RAIN', kind: 'rain', enabled: true }));
    expect(enabled).toContain('data-atmosphere="rain"'); expect(enabled).toContain('aria-hidden="true"');
    expect(enabled).toContain('--length:');
    expect(renderToStaticMarkup(createElement(Atmosphere, { scene: 'BG_RAIN', kind: 'rain', enabled: false }))).toBe('');
    expect(renderToStaticMarkup(createElement(Atmosphere, { scene: 'BG_SUN', kind: 'none', enabled: true }))).toBe('');
  });
});
