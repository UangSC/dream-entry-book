import type { Presentation } from '../books/schema';
import type { KV } from '../game/storage';
export type StoryAside = NonNullable<Presentation['asides']>[string];
export type AsideBookmark = { key: string; phase: 'pending' | 'choosing' | 'reply' | 'done'; option?: string; index: number };
export const ASIDE_KEY = 'rumengshu:aside-bookmark';
export function readAside(kv: KV, key: string, aside?: StoryAside): AsideBookmark {
  const initial: AsideBookmark = { key, phase: 'pending', index: 0 };
  try {
    const saved = JSON.parse(kv.get(ASIDE_KEY) ?? 'null') as AsideBookmark | null;
    if (!aside || !saved || saved.key !== key || !['choosing', 'reply', 'done'].includes(saved.phase)) return initial;
    if (saved.phase === 'choosing') return { key, phase: 'choosing', index: 0 };
    const option = aside.options.find(option => option.id === saved.option);
    if (!option || !Number.isInteger(saved.index) || saved.index < 0 || saved.index >= option.replies.length) return initial;
    return saved;
  } catch { return initial; }
}
