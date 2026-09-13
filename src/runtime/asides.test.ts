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
    expect(cues['line-002']!.portrait).toBe(cues['line-003']!.portrait);
    expect(cues['line-007']!.portrait).toBe(cues['line-008']!.portrait);
    expect(cues['line-007']!.portrait).not.toBe(cues['line-071']!.portrait);
    expect(cues['line-014']!.portrait).toBe(cues['line-015']!.portrait);
  });
});
