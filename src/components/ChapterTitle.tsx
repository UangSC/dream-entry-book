import { useEffect, useState, type CSSProperties } from 'react';
import { scheduleChapterIntro, type ChapterPhase } from '../runtime/chapterIntro';

export function useChapterIntro(chapterKey: string | null, ready: boolean, firstChapter: boolean) {
  const [state, setState] = useState<{ key: string | null; phase: ChapterPhase; brand: ChapterPhase }>({ key: null, phase: 'visible', brand: 'visible' });
  useEffect(() => {
    setState({ key: chapterKey, phase: 'visible', brand: firstChapter ? 'visible' : 'hidden' });
    if (!chapterKey || !ready) return;
    return scheduleChapterIntro(phase => setState(current => ({ ...current, phase })), brand => setState(current => ({ ...current, brand })));
  }, [chapterKey, ready, firstChapter]);
  return { chapterPhase: state.key === chapterKey ? state.phase : 'visible' as ChapterPhase,
    brandPhase: !firstChapter ? 'hidden' : state.key === chapterKey ? state.brand : 'visible' };
}

export function ChapterTitle({ title, subtitle, phase }: { title: string; subtitle: string; phase: ChapterPhase }) {
  if (phase === 'hidden') return null;
  return <div className={`chapter-heading chapter-${phase}`} aria-hidden={phase === 'ash'}>
    <span className="eyebrow">{subtitle}</span>
    <h1 aria-label={title}>{[...title].map((letter, i) => <span aria-hidden="true" className="chapter-letter" key={i} style={{ '--delay': `${i % 10 * 65}ms`, '--drift': `${(i % 3 - 1) * 36}px`, '--rise': `${-35 - i % 4 * 12}px` } as CSSProperties}>{letter === ' ' ? '\u00a0' : letter}</span>)}</h1>
    <span className="chapter-decoration" aria-hidden="true">✧</span>
    {phase === 'ash' && <div className="chapter-dust" aria-hidden="true">{Array.from({ length: 42 }, (_, i) => <i key={i} style={{ '--x': `${8 + i * 2}%`, '--delay': `${i % 9 * 85}ms`, '--drift': `${(i % 7 - 3) * 24}px`, '--rise': `${-45 - i % 6 * 22}px`, '--size': `${i % 3 + 1}px` } as CSSProperties} />)}</div>}
  </div>;
}
