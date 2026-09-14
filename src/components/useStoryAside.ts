import { useMemo, useState } from 'react';
import type { Beat } from '../game/schema';
import type { KV } from '../game/storage';
import { ASIDE_KEY, readAside, type AsideBookmark, type StoryAside } from '../runtime/asides';

export function useStoryAside(kv: KV, key: string, aside: StoryAside | undefined, onFailure: () => void, onChange?: (next: AsideBookmark) => void, seed?: Omit<AsideBookmark, 'key'>) {
  const restored = useMemo(() => readAside(seed ? { ...kv, get: () => JSON.stringify({ ...seed, key }) } : kv, key, aside), [kv, key, aside, seed]);
  const [state, setState] = useState(restored);
  const current = state.key === key ? state : restored;
  const option = aside?.options.find(option => option.id === current.option);
  const reply = current.phase === 'reply' ? option?.replies[current.index] : undefined;
  function commit(next: AsideBookmark) {
    setState(next);
    try { kv.set(ASIDE_KEY, JSON.stringify(next)); } catch { onFailure(); }
    onChange?.(next);
  }
  return {
    current,
    choosing: !!aside && current.phase === 'choosing',
    options: aside?.options ?? [],
    portrait: reply?.portrait,
    beat: reply ? { id: `aside-${current.option}-${current.index}`, kind: reply.speaker === 'narrator' ? 'narration' : 'dialogue', speaker: reply.speaker, text: reply.text, anim: 'fade' } as Beat : undefined,
    choose(id: string) {
      if (current.phase !== 'choosing' || !aside?.options.some(option => option.id === id)) return;
      commit({ key, phase: 'reply', option: id, index: 0 });
    },
    advance(): 'choice' | 'reply' | 'resume' {
      if (!aside || current.phase === 'done') return 'resume';
      if (current.phase === 'pending') { commit({ key, phase: 'choosing', index: 0 }); return 'choice'; }
      if (current.phase === 'choosing') return 'choice';
      if (option && current.index + 1 < option.replies.length) { commit({ ...current, index: current.index + 1 }); return 'reply'; }
      commit({ ...current, phase: 'done' });
      return 'resume';
    },
  };
}
