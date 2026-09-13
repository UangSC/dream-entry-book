import { describe, expect, it } from 'vitest';
import { memoryKV } from '../game/storage';
import { ASIDE_KEY, readAside } from './asides';
import { storyAsides } from '../../tools/story-asides';
import { createPerformances } from '../../tools/story-performances';
import { readFileSync } from 'node:fs';
import { dreamPackageSchema } from '../game/schema';

describe('日常闲话与持续的表情', () => {
  it('保存回复位置，仅在同一句同一次阅读恢复，坏书签不拦主线', () => {
    const kv = memoryKV(), aside = storyAsides['line-004'];
    const bookmark = { key: 'visit-one', phase: 'reply', option: 'cake-account', index: 1 };
    kv.set(ASIDE_KEY, JSON.stringify(bookmark));
    expect(readAside(kv, 'visit-one', aside)).toEqual(bookmark);
    expect(readAside(kv, 'visit-two', aside).phase).toBe('pending');
    kv.set(ASIDE_KEY, JSON.stringify({ ...bookmark, index: 20 }));
    expect(readAside(kv, 'visit-one', aside).phase).toBe('pending');
    kv.set(ASIDE_KEY, '{坏数据'); expect(readAside(kv, 'visit-one', aside).phase).toBe('pending');
  });
  it('只在两段日常对话后提供闲话，每个选项最多三句，正文和结局不变', () => {
    expect(Object.keys(storyAsides)).toEqual(['line-004', 'line-036']);
    for (const aside of Object.values(storyAsides)) {
      expect(aside.options).toHaveLength(2);
      expect(new Set(aside.options.map(option => option.replies[0]!.text)).size).toBe(2);
      for (const option of aside.options) expect(option.replies.length).toBeLessThanOrEqual(3);
    }
  });
  it('饥饿与慌张跨旁白持续，到明确的情绪转折才切换', () => {
    const pkg = dreamPackageSchema.parse(JSON.parse(readFileSync('public/dreams/little-demon.json', 'utf8')));
    const cues = createPerformances(pkg);
    const beats = pkg.nodes.find(node => node.id === 'ember')!.beats.filter(beat => beat.speaker === 'little-demon' || beat.speaker === 'narrator');
    expect(new Set(beats.map(beat => cues[beat.id]?.portrait)).size).toBe(1);
    for (const beat of pkg.nodes.flatMap(node => node.beats).filter(beat => beat.text.startsWith('师祖（'))) expect(cues[beat.id]?.portrait).toBeUndefined();
  });
});
