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
    {phase === 'ash' && <AshParticles />}
  </div>;
}

export function AshParticles({ brand = false }: { brand?: boolean }) {
  return <span className={`chapter-dust ${brand ? 'brand-dust' : ''}`} aria-hidden="true">{Array.from({ length: brand ? 64 : 108 }, (_, i) => <i key={i} style={{ '--x': `${4 + (i * 37 % 92)}%`, '--delay': `${i % 13 * 90}ms`, '--drift': `${(i % 13 - 6) * (brand ? 26 : 48)}px`, '--rise': `${-80 - i % 11 * (brand ? 15 : 26)}px`, '--size': `${i % 3 + 1}px` } as CSSProperties} />)}</span>;
}
